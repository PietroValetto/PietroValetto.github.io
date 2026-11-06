"""Household electricity, gas and other heating energy: extra cost since the war began.

Method (monthly, per country):
    monthly spend_i   = HICP item weight_i (per mille, prc_hicp_iw) x household final consumption (nama_10_gdp
                        P31_S14, latest year) / 12
    extra cost_i,m    = spend_i x (index_i,m / index_i,Feb2026 - 1)          (prc_hicp_minr, ECOICOP v2)

The no-war counterfactual is a flat price at the February 2026 level. Historical seasonality is not
usable here (2021-2023 were the European energy crisis) and regulated retail tariffs show little of it.
Liquid fuels (CP0453) are left out because heating oil is already counted from the Oil Bulletin.
"""
import calendar
import datetime as dt

from common import EU27, TO_EUROSTAT
from fetch_eurostat import _jsonstat

ITEMS = {"electricity": "CP0451", "gas": "CP0452", "solid": "CP0454", "heat": "CP0455"}
ITEM_LABEL = {"electricity": "Electricity", "gas": "Gas", "solid": "Wood, coal and other solid fuels",
              "heat": "District heating"}
BASE_MONTH = "2026-02"


def _geo_params():
    return [("geo", TO_EUROSTAT[c]) for c in EU27] + [("geo", "EU27_2020")]


def build() -> dict:
    back = {v: k for k, v in TO_EUROSTAT.items()} | {"EU27_2020": "EU"}
    codes = [("coicop18", c) for c in ITEMS.values()]

    idx_rows, _ = _jsonstat("prc_hicp_minr", [("unit", "I25"), ("sinceTimePeriod", BASE_MONTH)] + codes + _geo_params())
    w_rows, _ = _jsonstat("prc_hicp_iw", [("lastTimePeriod", "1")] + codes + _geo_params())
    c_rows, _ = _jsonstat("nama_10_gdp", [("na_item", "P31_S14"), ("unit", "CP_MEUR"), ("sinceTimePeriod", "2023")]
                          + _geo_params())

    item_of = {v: k for k, v in ITEMS.items()}
    index, weight, consumption = {}, {}, {}
    for r in idx_rows:
        index.setdefault((back[r["geo"]], item_of[r["coicop18"]]), {})[r["time"]] = float(r["value"])
    for r in w_rows:
        weight[(back[r["geo"]], item_of[r["coicop18"]])] = float(r["value"])
    for r in c_rows:
        a = back[r["geo"]]
        if a not in consumption or r["time"] > consumption[a][0]:
            consumption[a] = (r["time"], float(r["value"]) * 1e6)

    def area_result(area: str) -> dict:
        out = {"items": {}, "total": 0.0, "lastMonth": None, "dailyRate": 0.0}
        if area not in consumption:
            return out
        for item in ITEMS:
            series = index.get((area, item), {})
            w = weight.get((area, item), 0.0)
            if BASE_MONTH not in series or w <= 0:
                continue
            spend = w / 1000.0 * consumption[area][1] / 12
            months = sorted(m for m in series if m > BASE_MONTH)
            monthly = [{"month": m, "index": round(series[m] / series[BASE_MONTH] * 100, 2),
                        "extra": round(spend * (series[m] / series[BASE_MONTH] - 1))} for m in months]
            total = sum(x["extra"] for x in monthly)
            last = months[-1] if months else None
            rate = 0.0
            if last:
                y, mo = int(last[:4]), int(last[5:])
                rate = monthly[-1]["extra"] / calendar.monthrange(y, mo)[1]
            out["items"][item] = {"weightPerMille": w, "monthlySpend": round(spend), "total": round(total),
                                  "pctChange": round((series[last] / series[BASE_MONTH] - 1) * 100, 2) if last else 0,
                                  "monthly": monthly}
            out["total"] += total
            out["dailyRate"] += rate
            out["lastMonth"] = max(filter(None, [out["lastMonth"], last])) if last else out["lastMonth"]
        out["total"] = round(out["total"])
        out["dailyRate"] = round(out["dailyRate"])
        out["consumptionYear"] = int(consumption[area][0])
        return out

    countries = {c: area_result(c) for c in EU27}
    eu = {"items": {}, "total": sum(v["total"] for v in countries.values()),
          "dailyRate": sum(v["dailyRate"] for v in countries.values())}
    for item in ITEMS:
        eu["items"][item] = {"total": sum(v["items"].get(item, {}).get("total", 0) for v in countries.values())}
        eu_series = index.get(("EU", item), {})
        if BASE_MONTH in eu_series:
            last = max(eu_series)
            eu["items"][item]["pctChange"] = round((eu_series[last] / eu_series[BASE_MONTH] - 1) * 100, 2)
            eu["items"][item]["indexMonthly"] = [{"month": m, "index": round(eu_series[m] / eu_series[BASE_MONTH] * 100, 2)}
                                                 for m in sorted(eu_series) if m >= BASE_MONTH]
    last_months = [v["lastMonth"] for v in countries.values() if v["lastMonth"]]
    eu["lastMonth"] = max(last_months) if last_months else None
    eu["laggingCountries"] = sorted(c for c, v in countries.items() if v["lastMonth"] and v["lastMonth"] < eu["lastMonth"])
    y, mo = map(int, eu["lastMonth"].split("-"))
    measured_through = dt.date(y, mo, calendar.monthrange(y, mo)[1]) + dt.timedelta(days=1)
    return {
        "source": "Eurostat HICP ECOICOP v2 (prc_hicp_minr, prc_hicp_iw), household final consumption (nama_10_gdp P31_S14)",
        "baseMonth": BASE_MONTH, "itemLabels": ITEM_LABEL,
        "measuredThrough": measured_through.isoformat() + "T00:00:00+02:00",
        "EU": eu, "countries": countries,
    }


if __name__ == "__main__":
    r = build()
    eu = r["EU"]
    print("EU total", round(eu["total"] / 1e9, 2), "B through", eu["lastMonth"], "lagging", eu["laggingCountries"])
    for k, v in eu["items"].items():
        print(" ", k, round(v["total"] / 1e9, 2), "B", v.get("pctChange"), "% (EU index)")
    for c in ("IT", "DE", "ES", "FR"):
        print(c, round(r["countries"][c]["total"] / 1e9, 2), {k: (round(v["total"] / 1e9, 2), v["pctChange"]) for k, v in r["countries"][c]["items"].items()})
