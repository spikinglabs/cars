# Car recalls

Daily job (`.github/workflows/collect-recalls.yml`) that collects:

- **EU Safety Gate**, category *Motor vehicles*: every car, motorcycle, van, truck and e-scooter recall that
  European market surveillance authorities report, including all recalls from Germany's KBA. Weekly XML reports,
  read once each; history back to 2019. Licence: reuse with attribution (Commission Decision 2011/833/EU).
- **US NHTSA** campaigns for the followed models that are also sold in the US (public domain, no key).

Followed models are in `models.py`: the cars in the charging cost tool plus the fuel cars it compares with.
Files are served at `https://cars.allo.land/data/recalls/eu/...` and `/data/recalls/us/...`; the layout is in
the docstring of `collect.py`.

    python -m pipelines.recalls.collect --local ./out --since 2026 --budget 60
    python -m unittest discover -s pipelines/recalls/tests -t .

Germany's KBA recall database itself has no open download and refuses automated requests, which is fine:
the KBA reports each German vehicle recall to Safety Gate.
