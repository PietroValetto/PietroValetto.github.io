# EU Iran War Fuel Cost Tracker

How much extra Europeans have paid for petrol and diesel since the Iran war began on 28 February 2026, for the EU and each of the 27 member states.

A [Popular Economics](https://populareconomics.substack.com/) project. The method is adapted from Brown University Climate Solutions Lab's US [Iran War Energy Cost Tracker](https://iranwarcost.watson.brown.edu/).

## Method in one line

`Cost = Σ_days (actual pump price − no-war price) × litres consumed`, summed for each country and then added up for the EU.

| Input | Source |
|---|---|
| Pump prices, taxes included, weekly, per country | European Commission [Weekly Oil Bulletin](https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en) (price history xlsx), interpolated to daily |
| No-war price | War-start price moved by the average 2021–2025 week-of-year change in the Bulletin's EU pre-tax price. VAT is added back at the pre-war rate and excise is held fixed. |
| Litres consumed | Eurostat `nrg_cb_oilm`, gross inland deliveries of motor gasoline (O4652) and road diesel (O46711), 2021–2025 average by country and calendar month |
| Households | Eurostat `lfst_hhnhtych` (latest year) |

**Differences from the US tracker:**
- Prices are weekly rather than daily. The headline counter extrapolates at the latest weekly rate, using the visitor's clock.
- Diesel covers road diesel only.
- Seasonality comes from pre-tax retail prices rather than spot prices.
- Administered-price countries such as Malta get a flat no-war path, because their pump prices don't move.

## Run it

```bash
python3 -m venv .venv && .venv/bin/pip install -r pipeline/requirements.txt
.venv/bin/python pipeline/build.py        # writes public/data/*.json
.venv/bin/python pipeline/test_us_parity.py 73.77 60.06   # our engine on Brown's US data, must match their headline within 1%
npm install && npm run dev
```

`.github/workflows/update.yml` rebuilds the data on Monday, Thursday and Friday mornings, commits it and deploys to GitHub Pages.

## Data files (`public/data/`)

These follow the layout of the US tracker. Each `series` is keyed `EU`, `AT` … `SK`.

- `{petrol,diesel}-time-series.json`: daily actual price (€/L)
- `{petrol,diesel}-counterfactual.json`: daily no-war price for both war-start baselines
- `{petrol,diesel}-current.json`: latest bulletin price, previous week and war-start price for each country
- `{petrol,diesel}-deficit.json`: total and per-household cost, daily rate and ranks for the EU and each country, for both baselines
- `monthly-demand.json`, `households.json`, `meta.json` (sources, gaps, sensitivity checks)

Map boundaries: © EuroGeographics for the administrative boundaries (Eurostat GISCO NUTS 2021).
