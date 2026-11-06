"""Build every JSON file the site reads (public/data/*.json).

    python pipeline/build.py            # downloads fresh Weekly Oil Bulletin + Eurostat data
    python pipeline/build.py --cached   # reuse pipeline/cache/wob_history.xlsx
"""
import datetime as dt
import sys

import fetch_eurostat
import fetch_wob
from burden import burden
from common import EU27, FUELS, NAMES, SEASONAL_YEARS, WAR_START, interpolate_daily, write_json
from counterfactual import seasonal_weekly_change, weekly_path

SERIES_START = dt.date(2026, 1, 5)
SCENARIOS = ("lastBulletin", "febAvg")


def r(x, n=4):
    return round(x, n)


def main(cached: bool = False) -> None:
    wob = fetch_wob.load(force_download=not cached)
    vols = fetch_eurostat.monthly_litres()
    hh = fetch_eurostat.households()
    now = dt.datetime.now(dt.timezone.utc)

    bulletin_dates = sorted(d for d in wob["with_tax"]["EU"]["petrol"] if d >= SERIES_START)
    end = bulletin_dates[-1]
    prewar = [d for d in bulletin_dates if d < WAR_START]
    last_prewar = prewar[-1]
    feb = [d for d in prewar if d.month == 2]
    weights_year = max(wob["consumption"])
    sensitivity = {}

    for fuel in FUELS:
        season = seasonal_weekly_change(wob["wo_tax"]["EU"][fuel])
        season_ex22 = seasonal_weekly_change(wob["wo_tax"]["EU"][fuel], [y for y in SEASONAL_YEARS if y != 2022])

        ts_series, cf_series, current, deficit = {}, {}, [], {s: {"countries": {}} for s in SCENARIOS}
        totals = {s: 0.0 for s in SCENARIOS}
        total_ex22 = 0.0
        latest_rate = {s: 0.0 for s in SCENARIOS}
        eu_weights = {c: wob["consumption"][weights_year].get(c, {}).get(fuel, 0.0) for c in EU27}
        wsum = sum(eu_weights.values())

        for area in EU27 + ["EU"]:
            retail = {d: p for d, p in wob["with_tax"][area][fuel].items() if d >= SERIES_START}
            pretax = {d: p for d, p in wob["wo_tax"][area][fuel].items() if d >= SERIES_START}
            if area == "EU":
                vat0 = sum(fetch_wob.vat_at(wob["vat"], c, fuel, last_prewar) * w for c, w in eu_weights.items()) / wsum
            else:
                vat0 = fetch_wob.vat_at(wob["vat"], area, fuel, last_prewar)
            actual_daily = interpolate_daily(retail, SERIES_START, end)
            ts_series[area] = [{"date": d.isoformat(), "price": r(p)} for d, p in actual_daily.items()]

            anchors = {
                "lastBulletin": (retail[last_prewar], pretax[last_prewar]),
                "febAvg": (sum(retail[d] for d in feb) / len(feb), sum(pretax[d] for d in feb) / len(feb)),
            }
            month_lpd = vols["litresPerDay"][area][fuel]
            # Administered prices (e.g. Malta's state-fixed pump prices): no seasonal movement in the no-war path.
            year_before = [p for d, p in wob["with_tax"][area][fuel].items() if last_prewar - dt.timedelta(days=364) <= d <= last_prewar]
            administered = area != "EU" and max(year_before) - min(year_before) < 0.005
            season_used = {} if administered else season
            fixed_since = None
            if administered:
                hist = sorted(wob["with_tax"][area][fuel].items())
                fixed_since = hist[-1][0]
                for d, p in reversed(hist):
                    if abs(p - hist[-1][1]) > 0.0005:
                        break
                    fixed_since = d

            def litres(d, m=month_lpd):
                return m[f"{d.month:02d}"]

            cf_daily = {}
            for s, (a_retail, a_pretax) in anchors.items():
                path = weekly_path(last_prewar, a_retail, a_pretax, vat0, bulletin_dates, season_used)
                cf_daily[s] = interpolate_daily(path, WAR_START, end)
                b = burden(actual_daily, cf_daily[s], litres, WAR_START, end)
                if area != "EU":
                    totals[s] += b
                    latest_rate[s] += (actual_daily[end] - cf_daily[s][end]) * litres(end)
                hh_n = hh[area]["households"]
                entry = {
                    "warStartPrice": r(a_retail), "currentPrice": r(retail[end]),
                    "priceIncrease": r(retail[end] - a_retail), "pctChange": r((retail[end] / a_retail - 1) * 100, 2),
                    "noWarPriceToday": r(cf_daily[s][end]),
                    "litresPerDayThisMonth": round(litres(end)),
                    "totalExtraCost": round(b), "perHouseholdCost": round(b / hh_n, 2),
                    "dailyRate": round((actual_daily[end] - cf_daily[s][end]) * litres(end)),
                    "households": hh_n, "administeredPrice": administered,
                    "administeredSince": fixed_since.isoformat() if fixed_since else None,
                }
                if area == "EU":
                    deficit[s]["euDirect"] = entry
                else:
                    deficit[s]["countries"][area] = entry
            if area != "EU":
                ex = interpolate_daily(weekly_path(last_prewar, *anchors["lastBulletin"], vat0, bulletin_dates, {} if administered else season_ex22), WAR_START, end)
                total_ex22 += burden(actual_daily, ex, litres, WAR_START, end)

            cf_series[area] = [{"date": d.isoformat(), "price": r(cf_daily["lastBulletin"][d]),
                                "priceFebAvg": r(cf_daily["febAvg"][d])} for d in sorted(cf_daily["lastBulletin"])]
            if area != "EU":
                prev = bulletin_dates[-2]
                current.append({"code": area, "name": NAMES[area], "price": r(retail[end]), "prevWeek": r(retail[prev]),
                                "warStart": r(anchors["lastBulletin"][0]), "warStartFebAvg": r(anchors["febAvg"][0])})

        # EU totals = sum of the 27 member states (the EU's own consumption-weighted price is kept for the chart).
        eu_hh = hh["EU"]["households"]
        for s in SCENARIOS:
            direct = deficit[s]["euDirect"]
            deficit[s]["EU"] = direct | {"totalExtraCost": round(totals[s]), "perHouseholdCost": round(totals[s] / eu_hh, 2),
                                         "dailyRate": round(latest_rate[s])}
            for metric in ("totalExtraCost", "perHouseholdCost", "pctChange"):
                ranked = sorted(EU27, key=lambda c: deficit[s]["countries"][c][metric], reverse=True)
                for i, c in enumerate(ranked, 1):
                    deficit[s]["countries"][c].setdefault("rank", {})[metric] = i
        sensitivity[fuel] = {"lastBulletin": round(totals["lastBulletin"]), "excluding2022Seasonality": round(total_ex22),
                             "euDirectFormula": deficit["lastBulletin"]["euDirect"]["totalExtraCost"]}

        eu_retail = wob["with_tax"]["EU"][fuel]
        write_json(f"{fuel}-time-series.json", {"lastUpdated": now.isoformat(), "bulletinDates": [d.isoformat() for d in bulletin_dates],
                                                "series": ts_series})
        write_json(f"{fuel}-counterfactual.json", {"endDate": end.isoformat(), "series": cf_series})
        write_json(f"{fuel}-current.json", {"bulletinDate": end.isoformat(), "euAvg": r(eu_retail[end]),
                                            "prevWeekAvg": r(eu_retail[bulletin_dates[-2]]), "countries": current})
        write_json(f"{fuel}-deficit.json", {
            "warStartDate": WAR_START.isoformat(), "lastPrewarBulletin": last_prewar.isoformat(),
            "febBulletins": [d.isoformat() for d in feb], "endDate": end.isoformat(),
            "measuredThrough": (end + dt.timedelta(days=1)).isoformat() + "T00:00:00+02:00",
            "daysSinceWar": (end - WAR_START).days + 1,
            "scenarios": {s: {"EU": deficit[s]["EU"], "countries": deficit[s]["countries"]} for s in SCENARIOS},
        })

    write_json("monthly-demand.json", {"source": "Eurostat nrg_cb_oilm, gross inland deliveries (GID_OBS): O4652 motor gasoline, "
                                                 "O46711 road diesel; 2021-2025 average litres/day by calendar month",
                                       "eurostatUpdated": vols["updated"], "gaps": vols["gaps"],
                                       "litresPerDay": vols["litresPerDay"]})
    write_json("households.json", {"source": "Eurostat lfst_hhnhtych (private households), demo_pjan (population)",
                                   "areas": {a: hh[a] | {"name": NAMES[a]} for a in EU27 + ["EU"]}})
    write_json("meta.json", {"builtAt": now.isoformat(), "latestBulletin": end.isoformat(),
                             "bulletinWeeks": len(bulletin_dates), "sensitivity": sensitivity,
                             "litresPerTonne": {f: v[2] for f, v in FUELS.items()}})

    for fuel, s in sensitivity.items():
        print(f"{fuel}: EU27 €{s['lastBulletin'] / 1e9:.2f}B  (EU-level formula €{s['euDirectFormula'] / 1e9:.2f}B, "
              f"seasonality ex-2022 €{s['excluding2022Seasonality'] / 1e9:.2f}B)")
    tot = sum(s["lastBulletin"] for s in sensitivity.values())
    print(f"TOTAL €{tot / 1e9:.2f}B = €{tot / hh['EU']['households']:.0f} per household, through {end}")


if __name__ == "__main__":
    main(cached="--cached" in sys.argv)
