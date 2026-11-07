"""Short-range price forecasts with an honest backtest.

Pure Python (no numpy), so it runs inside any collector job at no cost.

The design follows the naive-forecasting view of emptymalei/extrapolation-as-forecasts:
a forecast is only worth showing by how much it beats "no change" (the naive forecast),
measured on the series itself. Three candidates are scored on rolling origins:

    naive   y[n+h] = y[n]                        trusts nothing but the last level
    drift   y[n+h] = y[n] + h * mean(dy)          trusts the recent average trend
    ar      AR(p) on weekly changes, iterated     trusts short-term momentum

The candidate with the lowest mean absolute error over all horizons in the backtest is
published if it beats naive by at least MARGIN (otherwise naive is), and its own backtest errors at each horizon give the uncertainty band
(empirical quantiles, so no distribution is assumed). The skill against naive and the
band's coverage are published beside the forecast, so a reader can see when the
forecast is no better than "prices stay where they are".
"""

from __future__ import annotations

from datetime import date, timedelta

MODELS = ("naive", "drift", "ar")
MARGIN = 0.02  # a model must beat naive by 2 % mean absolute error to be published
LABELS = {
    "naive": "No change: the last price carried forward",
    "drift": "Recent trend: the last price plus the average weekly change of the past year",
    "ar": "Momentum: an autoregression on the weekly changes",
}


# ---------------------------------------------------------------- models

def _naive(y: list[float], h: int) -> list[float]:
    return [y[-1]] * h


def _drift(y: list[float], h: int, window: int = 52) -> list[float]:
    w = y[-(window + 1):]
    slope = (w[-1] - w[0]) / (len(w) - 1) if len(w) > 1 else 0.0
    return [y[-1] + slope * k for k in range(1, h + 1)]


def _solve(a: list[list[float]], b: list[float]) -> list[float] | None:
    """Gaussian elimination with partial pivoting; None if singular."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for c in range(n):
        p = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[p][c]) < 1e-12:
            return None
        m[c], m[p] = m[p], m[c]
        for r in range(c + 1, n):
            f = m[r][c] / m[c][c]
            for k in range(c, n + 1):
                m[r][k] -= f * m[c][k]
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        x[r] = (m[r][n] - sum(m[r][k] * x[k] for k in range(r + 1, n))) / m[r][r]
    return x


def fit_ar(d: list[float], p: int, ridge: float = 1e-6) -> list[float] | None:
    """OLS coefficients phi (with intercept last) for d[t] = sum phi_i d[t-i] + c."""
    if len(d) <= 3 * (p + 1):
        return None
    k = p + 1
    xtx = [[0.0] * k for _ in range(k)]
    xty = [0.0] * k
    for t in range(p, len(d)):
        x = [d[t - i] for i in range(1, p + 1)] + [1.0]
        for i in range(k):
            xty[i] += x[i] * d[t]
            for j in range(k):
                xtx[i][j] += x[i] * x[j]
    for i in range(k):
        xtx[i][i] += ridge
    return _solve(xtx, xty)


def _ar(y: list[float], h: int, p: int = 4, window: int = 260) -> list[float]:
    w = y[-(window + 1):]
    d = [b - a for a, b in zip(w, w[1:])]
    phi = fit_ar(d, p)
    if phi is None:
        return _naive(y, h)
    hist = d[-p:]
    level, out = y[-1], []
    for _ in range(h):
        step = sum(phi[i] * hist[-1 - i] for i in range(p)) + phi[p]
        hist.append(step)
        level += step
        out.append(level)
    return out


FORECASTERS = {"naive": _naive, "drift": _drift, "ar": _ar}


# ---------------------------------------------------------------- backtest

def _quantile(xs: list[float], q: float) -> float:
    s = sorted(xs)
    if not s:
        return 0.0
    pos = q * (len(s) - 1)
    lo = int(pos)
    hi = min(lo + 1, len(s) - 1)
    return s[lo] + (s[hi] - s[lo]) * (pos - lo)


def backtest(y: list[float], horizon: int, origins: int) -> dict[str, list[list[float]]]:
    """errors[model][h-1] = actual - forecast at every rolling origin with a known outcome."""
    errors = {m: [[] for _ in range(horizon)] for m in MODELS}
    n = len(y)
    first = max(60, n - origins - horizon)
    for t in range(first, n - 1):
        hist = y[: t + 1]
        ahead = min(horizon, n - 1 - t)
        for m, f in FORECASTERS.items():
            fc = f(hist, ahead)
            for k in range(ahead):
                errors[m][k].append(y[t + 1 + k] - fc[k])
    return errors


def _mae(e: list[float]) -> float | None:
    return sum(abs(v) for v in e) / len(e) if e else None


def forecast_series(dates: list[str], values: list[float], horizon: int = 8, origins: int = 104,
                    step_days: int = 7, decimals: int = 3) -> dict | None:
    """Forecast one regular series (oldest first). None if the history is too short."""
    if len(values) < 60 + horizon:
        return None
    errors = backtest(values, horizon, origins)
    mae = {m: [_mae(errors[m][k]) for k in range(horizon)] for m in MODELS}
    mean_mae = {m: sum(v for v in mae[m] if v is not None) / horizon for m in MODELS}
    best = min(MODELS, key=lambda m: (round(mean_mae[m], 9), MODELS.index(m)))
    if mean_mae[best] > (1 - MARGIN) * mean_mae["naive"]:
        best = "naive"  # a smaller gain is within backtest noise
    point = FORECASTERS[best](values, horizon)
    last = date.fromisoformat(dates[-1])
    path = []
    prev = {p: 0.0 for p in (0.025, 0.1, 0.9, 0.975)}
    for k in range(horizon):
        e = errors[best][k]
        # bands never narrow with the horizon (thin backtests can make raw quantiles wobble)
        q = {p: (min if p < 0.5 else max)(prev[p], _quantile(e, p)) for p in prev}
        prev = q
        r = lambda v: round(v, decimals)  # noqa: E731
        path.append({
            "date": (last + timedelta(days=step_days * (k + 1))).isoformat(),
            "horizon": k + 1,
            "price": r(point[k]),
            "lo80": r(point[k] + q[0.1]), "hi80": r(point[k] + q[0.9]),
            "lo95": r(point[k] + q[0.025]), "hi95": r(point[k] + q[0.975]),
        })
    skill = [None if not mae["naive"][k] else round(1 - mae[best][k] / mae["naive"][k], 3) for k in range(horizon)]
    return {
        "last": {"date": dates[-1], "price": values[-1]},
        "model": best,
        "model_label": LABELS[best],
        "forecast": path,
        "backtest": {
            "origins": len(errors["naive"][0]),
            "from": dates[max(0, len(dates) - 1 - len(errors["naive"][0]))],
            "mae": {m: [None if v is None else round(v, 4) for v in mae[m]] for m in MODELS},
            "skill_vs_naive": skill,
        },
    }


def regular(rows: list[dict], field: str, step_days: int = 7, max_gap_days: int = 28) -> tuple[list[str], list[float]]:
    """The newest run of values on a regular grid (rows oldest first, 'date' ISO).

    Short gaps (the Oil Bulletin skips holiday weeks) are filled by linear interpolation;
    a gap longer than max_gap_days, or an empty value, ends the run.
    """
    pts: list[tuple[date, float]] = []
    for r in reversed(rows):
        v = r.get(field)
        if v is None or v == "":
            if pts:
                break
            continue
        d = date.fromisoformat(r["date"])
        if pts and (pts[-1][0] - d).days > max_gap_days:
            break
        pts.append((d, float(v)))
    pts.reverse()
    dates, vals = [], []
    for (d0, v0), (d1, v1) in zip(pts, pts[1:]):
        n = max(1, round((d1 - d0).days / step_days))
        for k in range(n):
            dates.append((d0 + timedelta(days=step_days * k)).isoformat())
            vals.append(v0 + (v1 - v0) * k / n)
    if pts:
        dates.append(pts[-1][0].isoformat())
        vals.append(pts[-1][1])
    return dates, vals
