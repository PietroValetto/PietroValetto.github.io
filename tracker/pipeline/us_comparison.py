"""US comparison: recompute Brown's US tracker figures from their public data with our burden() engine.

Brown University Climate Solutions Lab, Iran War Energy Cost Tracker: https://iranwarcost.watson.brown.edu/
"""
import datetime as dt
import json

from burden import burden
from common import EU27, OUT, WAR_START, http_get

BROWN_SITE = "https://iranwarcost.watson.brown.edu/"
BROWN_DATA = BROWN_SITE + "data/"
LITRES_PER_GALLON = 3.785411784
ECB_EURUSD = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?lastNObservations=1&format=jsondata"
PRODUCTS = {"gas": "petrol", "diesel": "diesel"}  # Brown product -> our fuel


def brown(name: str) -> dict:
    return json.loads(http_get(BROWN_DATA + name + ".json"))


def us_series(obj: dict) -> dict[dt.date, float]:
    return {dt.date.fromisoformat(x["date"]): x["price"] for x in obj["series"]["US"]}


def us_burden(product: str, demand: dict, end: dt.date | None = None) -> tuple[float, dict, dict, dt.date]:
    """Brown's consumer burden for one product, through `end` (default: Brown's latest date)."""
    actual = us_series(brown(f"{product}-time-series"))
    cf = us_series(brown(f"{product}-counterfactual"))
    gpd = demand[product]["gallonsPerDay"]
    last = max(cf)
    end = min(end or last, last)
    return burden(actual, cf, lambda d: gpd[f"{d.month:02d}"], WAR_START, end), actual, cf, last


def eur_per_usd() -> tuple[float, str]:
    d = json.loads(http_get(ECB_EURUSD))
    obs = list(d["dataSets"][0]["series"].values())[0]["observations"]
    usd_per_eur = list(obs.values())[0][0]
    day = d["structure"]["dimensions"]["observation"][0]["values"][-1]["id"]
    return 1.0 / usd_per_eur, day


def build(eu_end: dt.date, eu: dict, eu_households: int, eu_litres_per_day: dict[str, float]) -> None:
    """Write public/data/us-comparison.json. Keeps the previous file (flagged stale) if Brown or the ECB is unreachable."""
    path = OUT / "us-comparison.json"
    try:
        demand = brown("monthly-demand")
        deficit = brown("gas-deficit")
        households = deficit["totalExtraCost"] / deficit["perHouseholdCost"]  # Brown's own national household count
        fx, fx_date = eur_per_usd()
        us = {}
        latest_date = None
        for product, fuel in PRODUCTS.items():
            total, actual, cf, last = us_burden(product, demand)
            same_period, _, _, _ = us_burden(product, demand, eu_end)
            latest_date = last
            start, now = cf[min(cf)], actual[last]
            gallons_per_day = sum(demand[product]["gallonsPerDay"].values()) / 12
            us[fuel] = {
                "totalExtraCostUSD": round(total), "totalSamePeriodUSD": round(same_period),
                "warStartPriceUSDPerGallon": start, "currentPriceUSDPerGallon": now,
                "pctChange": round((now / start - 1) * 100, 2),
                "increaseEURPerLitre": round((now - start) / LITRES_PER_GALLON * fx, 4),
                "litresPerHouseholdPerYear": round(gallons_per_day * LITRES_PER_GALLON * 365 / households),
            }
        out = {
            "stale": False, "brownUrl": BROWN_SITE, "brownAsOf": latest_date.isoformat(), "euAsOf": eu_end.isoformat(),
            "eurPerUsd": round(fx, 5), "fxDate": fx_date, "fxSource": "ECB euro reference rate",
            "us": {
                "households": round(households), "fuels": us,
                "totalExtraCostUSD": sum(v["totalExtraCostUSD"] for v in us.values()),
                "totalSamePeriodUSD": sum(v["totalSamePeriodUSD"] for v in us.values()),
            },
            "eu": {
                "households": eu_households,
                "totalExtraCostEUR": sum(eu[f]["totalExtraCost"] for f in PRODUCTS.values()),
                "fuels": {f: {"pctChange": eu[f]["pctChange"], "increaseEURPerLitre": eu[f]["priceIncrease"],
                              "litresPerHouseholdPerYear": round(eu_litres_per_day[f] * 365 / eu_households)}
                          for f in PRODUCTS.values()},
            },
        }
        u = out["us"]
        u["perHouseholdUSD"] = round(u["totalExtraCostUSD"] / households, 2)
        u["perHouseholdSamePeriodUSD"] = round(u["totalSamePeriodUSD"] / households, 2)
        u["perHouseholdSamePeriodEUR"] = round(u["perHouseholdSamePeriodUSD"] * fx, 2)
        out["eu"]["perHouseholdEUR"] = round(out["eu"]["totalExtraCostEUR"] / eu_households, 2)
        path.write_text(json.dumps(out, indent=1))
    except Exception as e:  # noqa: BLE001 - a third-party site being down must not break our weekly build
        if path.exists():
            old = json.loads(path.read_text())
            old["stale"] = True
            path.write_text(json.dumps(old, indent=1))
        print(f"US comparison not refreshed ({e}); kept previous file" if path.exists() else f"US comparison skipped ({e})")
