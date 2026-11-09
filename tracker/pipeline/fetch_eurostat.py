"""Eurostat: monthly fuel deliveries by country (nrg_cb_oilm), households (lfst_hhnhtych), population (demo_pjan)."""
import calendar
import itertools
import json

from common import EU27, EUROSTAT_API, FUELS, SEASONAL_YEARS, TO_EUROSTAT, http_get


def _jsonstat(dataset: str, params: list[tuple[str, str]]) -> tuple[list[dict], dict]:
    """Fetch a Eurostat JSON-stat dataset and flatten it into [{dim: code, ..., 'value': v}]."""
    qs = "&".join(f"{k}={v}" for k, v in params)
    d = json.loads(http_get(f"{EUROSTAT_API}/{dataset}?{qs}"))
    ids, sizes = d["id"], d["size"]
    cats = [sorted(d["dimension"][i]["category"]["index"].items(), key=lambda kv: kv[1]) for i in ids]
    rows = []
    for flat, combo in enumerate(itertools.product(*cats)):
        v = d["value"].get(str(flat))
        if v is not None:
            rows.append({ids[n]: combo[n][0] for n in range(len(ids))} | {"value": v})
    return rows, d


def monthly_litres() -> dict:
    """Average litres/day by calendar month over 2021-2025, per country and fuel.

    Returns {area: {fuel: {"01": litres_per_day, ...}}} and coverage notes for gaps.
    """
    geos = [TO_EUROSTAT[c] for c in EU27] + ["EU27_2020"]
    back = {v: k for k, v in TO_EUROSTAT.items()} | {"EU27_2020": "EU"}
    params = [("nrg_bal", "GID_OBS"), ("unit", "THS_T"),
              ("sinceTimePeriod", f"{SEASONAL_YEARS[0]}-01"), ("untilTimePeriod", f"{SEASONAL_YEARS[-1]}-12")]
    params += [("siec", s) for _, s, _ in FUELS.values()] + [("geo", g) for g in geos]
    rows, meta = _jsonstat("nrg_cb_oilm", params)

    acc = {}  # (area, fuel, month) -> list of litres/day observations
    siec_to_fuel = {s: f for f, (_, s, _) in FUELS.items()}
    for r in rows:
        fuel = siec_to_fuel[r["siec"]]
        area = back[r["geo"]]
        y, m = int(r["time"][:4]), int(r["time"][5:7])
        kt = float(r["value"])
        if kt <= 0:
            continue
        lpd = kt * 1000.0 * FUELS[fuel][2] / calendar.monthrange(y, m)[1]
        acc.setdefault((area, fuel, f"{m:02d}"), []).append(lpd)

    out, gaps = {}, []
    for area in EU27 + ["EU"]:
        out[area] = {}
        for fuel in FUELS:
            months = {}
            for m in range(1, 13):
                obs = acc.get((area, fuel, f"{m:02d}"), [])
                if obs:
                    months[f"{m:02d}"] = sum(obs) / len(obs)
            if len(months) < 12:
                gaps.append(f"{area}/{fuel}: {12 - len(months)} months missing")
            out[area][fuel] = months
    return {"litresPerDay": out, "gaps": gaps, "updated": meta.get("updated")}


def monthly_actual(since: str = "2026-01") -> dict:
    """Actual litres/day for each month published since `since`: {area: {fuel: {"YYYY-MM": litres_per_day}}}."""
    geos = [TO_EUROSTAT[c] for c in EU27] + ["EU27_2020"]
    back = {v: k for k, v in TO_EUROSTAT.items()} | {"EU27_2020": "EU"}
    params = [("nrg_bal", "GID_OBS"), ("unit", "THS_T"), ("sinceTimePeriod", since)]
    params += [("siec", s) for _, s, _ in FUELS.values()] + [("geo", g) for g in geos]
    rows, _ = _jsonstat("nrg_cb_oilm", params)
    siec_to_fuel = {s: f for f, (_, s, _) in FUELS.items()}
    out = {}
    for r in rows:
        fuel, area = siec_to_fuel[r["siec"]], back[r["geo"]]
        y, m = int(r["time"][:4]), int(r["time"][5:7])
        if float(r["value"]) <= 0:
            continue
        lpd = float(r["value"]) * 1000.0 * FUELS[fuel][2] / calendar.monthrange(y, m)[1]
        out.setdefault(area, {}).setdefault(fuel, {})[r["time"]] = lpd
    return out


def cars() -> dict:
    """Passenger cars in use (road_eqs_carpda, all fuels), latest year per country."""
    geos = [TO_EUROSTAT[c] for c in EU27] + ["EU27_2020"]
    back = {v: k for k, v in TO_EUROSTAT.items()} | {"EU27_2020": "EU"}
    rows, _ = _jsonstat("road_eqs_carpda", [("unit", "NR"), ("mot_nrg", "TOTAL"), ("sinceTimePeriod", "2021")]
                        + [("geo", g) for g in geos])
    latest = {}
    for r in rows:
        a = back[r["geo"]]
        if a not in latest or r["time"] > latest[a][0]:
            latest[a] = (r["time"], round(r["value"]))
    return {a: {"cars": v, "carsYear": int(t)} for a, (t, v) in latest.items()}


def households() -> dict:
    geos = [TO_EUROSTAT[c] for c in EU27] + ["EU27_2020"]
    back = {v: k for k, v in TO_EUROSTAT.items()} | {"EU27_2020": "EU"}
    hh_rows, _ = _jsonstat("lfst_hhnhtych", [("agechild", "TOTAL"), ("n_child", "TOTAL"), ("phhcomp", "TOTAL"),
                                             ("unit", "THS_HH"), ("sinceTimePeriod", "2022")] + [("geo", g) for g in geos])
    pop_rows, _ = _jsonstat("demo_pjan", [("age", "TOTAL"), ("sex", "T"), ("unit", "NR"),
                                          ("sinceTimePeriod", "2022")] + [("geo", g) for g in geos])
    out = {}
    for rows, key, scale in ((hh_rows, "households", 1000), (pop_rows, "population", 1)):
        latest = {}
        for r in rows:
            a = back[r["geo"]]
            if a not in latest or r["time"] > latest[a][0]:
                latest[a] = (r["time"], r["value"])
        for a, (year, v) in latest.items():
            out.setdefault(a, {})[key] = round(v * scale)
            out[a][f"{key}Year"] = int(year)
    return out


if __name__ == "__main__":
    ml = monthly_litres()
    print("gaps:", ml["gaps"])
    for a in ("EU", "IT", "DE"):
        for f in FUELS:
            v = ml["litresPerDay"][a][f]
            print(a, f, f"{sum(v.values()) / max(len(v), 1) / 1e6:.1f}M L/day avg")
    hh = households()
    print("EU", hh["EU"], "IT", hh["IT"], "missing:", [c for c in EU27 if "households" not in hh.get(c, {})])
