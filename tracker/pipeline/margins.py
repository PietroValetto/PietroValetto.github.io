"""Where the extra money went: crude producers, refiners & distributors, and governments.

Following T&E's excess-profits method (Methodological Note, March 2026) and EnergyComment (Bukold), the
extra cost per litre is split into three parts that add up exactly to our consumer-cost gap:

    gap        = actual pump price − no-war pump price                      (our headline, per litre)
    taxes      = gap − pre-tax gap        (VAT on the higher price, minus fuel-tax cuts)
    crude      = crude cost per litre now − crude cost per litre before the war   (upstream)
    margin     = pre-tax gap − crude      (refining & distribution margin expansion; downstream)

Crude cost per litre of product = Brent (€/bbl) / 158.987 L × energy factor / 0.93 refinery yield.
Brent is the EIA Europe Brent Spot Price FOB (FRED DCOILBRENTEU); EUR/USD is the ECB reference rate.
Each bulletin date gets the average over its reporting week (Tuesday to Monday), like the Oil Bulletin.
"""
import csv
import datetime as dt
import io

from common import CACHE, daterange, http_get, interpolate_daily

BRENT_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DCOILBRENTEU&cosd={start}"
ECB_URL = "https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod={start}&format=csvdata"
LITRES_PER_BARREL = 158.987
REFINERY_YIELD = 0.93
# Litres of crude-oil energy per litre of product: crude ≈ 36.0 MJ/L (41.9 MJ/kg × 0.86 kg/L),
# diesel ≈ 36.1 MJ/L (43.1 × 0.837), petrol ≈ 32.2 MJ/L (43.2 × 0.745).
ENERGY_FACTOR = {"petrol": 1.00 * 32.2 / 36.0, "diesel": 36.1 / 36.0}


def _cached_get(url: str, name: str) -> str:
    """Download, falling back to the last cached copy if the source is unreachable."""
    path = CACHE / name
    try:
        text = http_get(url, timeout=90).decode()
        CACHE.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return text
    except Exception:
        if path.exists():
            return path.read_text()
        raise


def brent_eur_per_bbl(start: dt.date) -> dict[dt.date, float]:
    """Daily Brent in €/bbl (trading days only)."""
    brent, fx = {}, {}
    for row in csv.DictReader(io.StringIO(_cached_get(BRENT_URL.format(start=start), "brent.csv"))):
        v = row.get("DCOILBRENTEU", "")
        if v not in ("", "."):
            brent[dt.date.fromisoformat(row["observation_date"])] = float(v)
    for row in csv.DictReader(io.StringIO(_cached_get(ECB_URL.format(start=start), "eurusd.csv"))):
        if row.get("OBS_VALUE"):
            fx[dt.date.fromisoformat(row["TIME_PERIOD"])] = float(row["OBS_VALUE"])
    out, last_fx = {}, None
    for d in sorted(brent):
        last_fx = fx.get(d, last_fx)
        if last_fx:
            out[d] = brent[d] / last_fx
    return out


def crude_per_litre(bulletin_dates: list[dt.date], start: dt.date, end: dt.date) -> dict:
    """{fuel: {day: €/L of crude embedded in one litre of product}}, weekly averages interpolated daily.

    Also returns the weekly Brent €/bbl values used, for the methodology chart.
    """
    daily = brent_eur_per_bbl(start - dt.timedelta(days=14))
    weekly = {}
    for d in bulletin_dates:
        window = [daily[x] for x in daterange(d - dt.timedelta(days=6), d) if x in daily]
        if window:
            weekly[d] = sum(window) / len(window)
    out = {}
    for fuel, factor in ENERGY_FACTOR.items():
        per_l = {d: v / LITRES_PER_BARREL * factor / REFINERY_YIELD for d, v in weekly.items()}
        out[fuel] = interpolate_daily(per_l, start, end)
    return {"perLitre": out, "weeklyBrentEUR": weekly, "latestBrentDay": max(daily)}


def split(actual: dict, cf: dict, pretax: dict, cf_pretax: dict, crude: dict, crude_ref: float,
          litres, start: dt.date, end: dt.date) -> dict:
    """Totals (EUR) of the three parts of the consumer-cost gap, plus today's per-litre split."""
    tot = {"crude": 0.0, "margin": 0.0, "taxes": 0.0}
    for d in daterange(start, end):
        lt = litres(d)
        gap = actual[d] - cf[d]
        pre_gap = pretax[d] - cf_pretax[d]
        c = crude[d] - crude_ref
        tot["crude"] += c * lt
        tot["margin"] += (pre_gap - c) * lt
        tot["taxes"] += (gap - pre_gap) * lt
    d = end
    now = {"crude": crude[d] - crude_ref, "margin": (pretax[d] - cf_pretax[d]) - (crude[d] - crude_ref),
           "taxes": (actual[d] - cf[d]) - (pretax[d] - cf_pretax[d])}
    return {"upstreamCrude": round(tot["crude"]), "downstreamMargin": round(tot["margin"]), "taxNet": round(tot["taxes"]),
            "perLitreNow": {k: round(v, 4) for k, v in now.items()}}
