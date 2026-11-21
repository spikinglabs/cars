# Dataset metadata for DataHerb

One `dataherb.json`-style file (DataHerb dataset spec v2) per open dataset that the
`pipelines/` publish under https://cars.allo.land/data/. A DataHerb catalog lists each with an
entry such as:

```yaml
id: eu-fuel-prices
repo: spikinglabs/cars
metadata_path: datasets/eu-fuel-prices.json
```

The files describe the published CSVs (columns, licence, attribution); the data itself is not
in this repository. The ratings (Euro NCAP, Green NCAP, ADAC) have no open licence and are not
listed. Licences and credits are also on https://cars.allo.land/open-data/.
