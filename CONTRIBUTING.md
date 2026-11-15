# Contributing

Thanks for your interest. Issues and pull requests are welcome.

## Before you start

For anything larger than a small fix, open an issue first so we can agree on the approach.

## Development

car-mcp (Python, needs [uv](https://docs.astral.sh/uv/)):

```bash
uv venv && uv pip install -e . pytest
.venv/bin/pytest
```

Data pipelines (Python 3.12, standard-library `unittest`), for example:

```bash
pip install -r pipelines/fuel_prices/requirements.txt
python -m unittest discover -s pipelines/fuel_prices/tests -t . -v
```

`.github/workflows/test-pipelines.yml` lists every pipeline's test command.

Most collectors can write to a local folder instead of R2, for example
`python -m pipelines.fuel_prices.collect --local ./out`. Each pipeline's README has the details.

Website (`site/`, Node 22): `node --test site/tests/calc.test.js`, and so on for each file in `site/tests`
(`.github/workflows/test-site.yml` lists them). Pages are in English, German and Simplified Chinese; `site/I18N.md` explains how to add or change text.

## Pull requests

- Keep each pull request to one change, and add or update tests for it.
- CI must pass. Pull requests from forks run the tests but not the deploy or collector jobs, since those need secrets.
- Don't commit collected data, credentials or `.env` files. Data goes to R2, credentials to GitHub Actions secrets.

By contributing you agree that your contribution is licensed under the [MIT License](LICENSE).
