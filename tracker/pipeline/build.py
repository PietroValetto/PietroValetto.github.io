"""Build every JSON file the site reads (public/data/*.json).

    python pipeline/build.py            # downloads fresh Weekly Oil Bulletin + Eurostat data
    python pipeline/build.py --cached   # reuse pipeline/cache/wob_history.xlsx
"""
import datetime as dt
import sys

import fetch_eurostat
import fetch_wob
import household_energy
import margins
import us_comparison
from burden import burden
from common import EU27, FUELS, HEADLINE_FUELS, NAMES, SEASONAL_YEARS, WAR_START, daterange, interpolate_daily, write_json
from counterfactual import seasonal_weekly_change, weekly_path
from tax_split import implied_pretax_cf, split as tax_split

SERIES_START = dt.date(2026, 1, 5)
SCENARIOS = ("lastBulletin", "febAvg")
# T&E's email (16 Oct 2026) quoted ~€63.7bn with data to mid-October: the cross-check also stops here.
TE_COMPARISON_END = dt.date(2026, 10, 12)

# Per-person assumptions, from T&E's diesel briefing (23 Sep 2026) methodology.
CAR_KM_PER_YEAR = 10_000
CAR_L_PER_100KM = {"petrol": 7.08, "diesel": 6.91}
TRUCK_KM_PER_YEAR = 116_000          # German long-haul articulated truck (VECTO group 5-LH)
TRUCK_L_PER_100KM = 26.38
TANK_LITRES = 50


def people_figures(gap: dict, vat: dict, end: dt.date) -> dict:
    """What the EU-average price gap means for one tank, one car and one truck."""
    def since_war(fuel, litres_per_day, ex_vat=False):
        return sum((g / (1 + vat[fuel]) if ex_vat else g) * litres_per_day for g in gap[fuel].values())
    car = {f: since_war(f, CAR_KM_PER_YEAR / 365 * CAR_L_PER_100KM[f] / 100) for f in gap}
    truck_lpd = TRUCK_KM_PER_YEAR / 365 * TRUCK_L_PER_100KM / 100
    truck = since_war("diesel", truck_lpd, ex_vat=True)
    weeks = len(gap["diesel"]) / 7
    return {
        "asOf": end.isoformat(),
        "tank": {f: round(gap[f][end] * TANK_LITRES, 2) for f in gap},
        "carSinceWar": {f: round(v) for f, v in car.items()},
        "truckSinceWar": round(truck), "truckPerWeek": round(truck / weeks),
        "assumptions": {"carKmPerYear": CAR_KM_PER_YEAR, "carLPer100km": CAR_L_PER_100KM, "truckKmPerYear": TRUCK_KM_PER_YEAR,
                        "truckLPer100km": TRUCK_L_PER_100KM, "tankLitres": TANK_LITRES,
                        "source": "T&E, 'A continent squeezed' (23 Sep 2026), methodology; truck excludes VAT"},
    }


def r(x, n=4):
    return round(x, n)


def empty_entry(households: int) -> dict:
    """Placeholder for a country with no bulletin price for a product: zero cost, flagged."""
    zero = ("warStartPrice", "currentPrice", "priceIncrease", "pctChange", "noWarPriceToday", "litresPerDayThisMonth",
            "totalExtraCost", "perHouseholdCost", "dailyRate", "taxRelief", "vatWindfall", "stateCostFixedPrice",
            "totalShock", "reliefPerLitreNow")
    return {k: 0 for k in zero} | {"households": households, "administeredPrice": False, "administeredSince": None,
                                    "noPriceData": True}


def fill_volume_gaps(vols: dict, wob: dict) -> None:
    """Countries missing Eurostat monthly volumes: bulletin annual consumption x the EU's monthly shape."""
    year = max(wob["consumption"])
    for area in EU27:
        for fuel, (_, _, l_per_t) in FUELS.items():
            months = vols["litresPerDay"][area][fuel]
            eu = vols["litresPerDay"]["EU"][fuel]
            kt = wob["consumption"][year].get(area, {}).get(fuel)
            if len(months) == 12 or not kt or len(eu) < 12:
                continue
            mean = sum(eu.values()) / 12
            base = kt * 1000 * l_per_t / 365
            for m, v in eu.items():
                months.setdefault(m, base * v / mean)
            vols["gaps"].append(f"{area}/{fuel}: filled from Oil Bulletin annual consumption ({year})")


def scenario_grid(grid: dict, vols: dict, actual_vols: dict, hh: dict) -> dict:
    """Totals for every assumption combination, plus how far 2026 fuel demand moved from normal."""
    combos = []
    for (b, se, vo), countries in sorted(grid.items()):
        total = sum(countries.values())
        combos.append({"baseline": b, "seasonality": se, "volumes": vo, "total": round(total),
                       "perHousehold": round(total / hh["EU"]["households"], 2),
                       "countries": {c: round(v) for c, v in countries.items()}})
    # Demand response: actual vs normal deliveries over the war months Eurostat has published.
    demand = {}
    for fuel in HEADLINE_FUELS:
        act = actual_vols.get("EU", {}).get(fuel, {})
        months = sorted(m for m in act if m >= f"{WAR_START.year}-{WAR_START.month + 1:02d}")
        if months:
            normal = sum(vols["litresPerDay"]["EU"][fuel][m[5:]] for m in months)
            demand[fuel] = {"months": months, "pctVsNormal": round((sum(act[m] for m in months) / normal - 1) * 100, 2)}
    return {
        "default": {"baseline": "lastBulletin", "seasonality": "2021-25", "volumes": "normal"},
        "labels": {
            "baseline": {"lastBulletin": "Last pre-war bulletin", "febAvg": "February 2026 average"},
            "seasonality": {"2021-25": "Seasonal pattern 2021–25 (as US tracker)", "ex2022": "Seasonal pattern without 2022"},
            "volumes": {"normal": "Normal volumes (2021–25 average)", "actual": "Actual 2026 volumes where published"},
        },
        "combos": combos,
        "demandResponse": demand,
        "actualVolumesThrough": {a: max(v.get("petrol", {"-": 0})) for a, v in actual_vols.items() if v.get("petrol")},
    }


def main(cached: bool = False) -> None:
    wob = fetch_wob.load(force_download=not cached)
    vols = fetch_eurostat.monthly_litres()
    hh = fetch_eurostat.households()
    actual_vols = fetch_eurostat.monthly_actual()
    car_stock = fetch_eurostat.cars()
    now = dt.datetime.now(dt.timezone.utc)

    bulletin_dates = sorted(d for d in wob["with_tax"]["EU"]["petrol"] if d >= SERIES_START)
    end = bulletin_dates[-1]
    prewar = [d for d in bulletin_dates if d < WAR_START]
    last_prewar = prewar[-1]
    feb = [d for d in prewar if d.month == 2]
    weights_year = max(wob["consumption"])
    sensitivity = {}
    fill_volume_gaps(vols, wob)
    eu_final = {}
    # Assumption grid (Fuel tab range + Assumptions panel): baseline x seasonal window x volumes.
    grid: dict[tuple, dict[str, float]] = {}
    crude = margins.crude_per_litre(bulletin_dates, SERIES_START, end)
    janfeb = [d for d in prewar if d.month in (1, 2)]
    cross = {}          # T&E-style cross-check: flat Jan-Feb baseline, pre-tax prices
    flows = {}          # EU weekly per-litre split, for the chart
    eu_gap, eu_vat = {}, {}
    json_eu = {}

    for fuel in FUELS:
        season = seasonal_weekly_change(wob["wo_tax"]["EU"][fuel])
        season_ex22 = seasonal_weekly_change(wob["wo_tax"]["EU"][fuel], [y for y in SEASONAL_YEARS if y != 2022])

        ts_series, cf_series, current, deficit = {}, {}, [], {s: {"countries": {}} for s in SCENARIOS}
        totals = {s: 0.0 for s in SCENARIOS}
        total_ex22 = 0.0
        latest_rate = {s: 0.0 for s in SCENARIOS}
        split_tot = {s: {"upstreamCrude": 0, "downstreamMargin": 0, "taxNet": 0} for s in SCENARIOS}
        # Crude/margin split ("Where the money went") exists only for road fuels with a crude series.
        has_crude = fuel in crude["perLitre"]
        if has_crude:
            cr = crude["perLitre"][fuel]
            crude_ref = {"lastBulletin": cr[last_prewar], "febAvg": sum(cr[d] for d in feb) / len(feb)}
            crude_janfeb = sum(cr[d] for d in janfeb) / len(janfeb)
            cross[fuel] = {"pretaxPremium": 0.0, "upstream": 0.0, "pretaxPremiumToTE": 0.0, "upstreamToTE": 0.0}
        eu_weights = {c: wob["consumption"][weights_year].get(c, {}).get(fuel, 0.0) for c in EU27}
        wsum = sum(eu_weights.values())

        eu_pretax_shock = {}
        # The EU aggregate goes first: its pre-tax shock is needed to estimate fixed-price countries' state cost.
        no_price = []
        for area in ["EU"] + EU27:
            retail = {d: p for d, p in wob["with_tax"][area][fuel].items() if d >= SERIES_START}
            pretax = {d: p for d, p in wob["wo_tax"][area][fuel].items() if d >= SERIES_START}
            if last_prewar not in retail or last_prewar not in pretax:
                # No bulletin price for this product (e.g. heating oil in BG, NL, SK): not covered.
                no_price.append(area)
                for s in SCENARIOS:
                    deficit[s]["countries"][area] = empty_entry(hh[area]["households"])
                continue
            if area == "EU":
                vat0 = sum(fetch_wob.vat_at(wob["vat"], c, fuel, last_prewar) * w for c, w in eu_weights.items()) / wsum
            else:
                vat0 = fetch_wob.vat_at(wob["vat"], area, fuel, last_prewar)
            actual_daily = interpolate_daily(retail, SERIES_START, end)
            pretax_daily = interpolate_daily(pretax, SERIES_START, end)
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
                if area == "EU" and s == "lastBulletin":
                    eu_pretax_shock = {d: pretax_daily[d] - implied_pretax_cf(cf_daily[s][d], a_retail, a_pretax, vat0)
                                       for d in cf_daily[s]}
                split = tax_split(actual_daily, pretax_daily, cf_daily[s], a_retail, a_pretax, vat0,
                                  lambda d, a=area: (vat0 if a == "EU" else fetch_wob.vat_at(wob["vat"], a, fuel, d)),
                                  litres, WAR_START, end, administered, eu_pretax_shock)
                cf_pre = {d: a_pretax + (cf_daily[s][d] - a_retail) / (1 + vat0) for d in cf_daily[s]}
                flow = (margins.split(actual_daily, cf_daily[s], pretax_daily, cf_pre, cr, crude_ref[s], litres, WAR_START, end)
                        if has_crude else {})
                if not has_crude:
                    pass
                elif area != "EU":
                    for k in split_tot[s]:
                        split_tot[s][k] += flow[k]
                elif s == "lastBulletin":
                    eu_gap[fuel] = {d: actual_daily[d] - cf_daily[s][d] for d in cf_daily[s]}
                    eu_vat[fuel] = vat0
                    flows[fuel] = [{"date": d.isoformat(),
                                    "crude": r(cr[d] - crude_ref[s]),
                                    "margin": r((pretax_daily[d] - cf_pre[d]) - (cr[d] - crude_ref[s])),
                                    "taxes": r((actual_daily[d] - cf_daily[s][d]) - (pretax_daily[d] - cf_pre[d]))}
                                   for d in bulletin_dates if d >= WAR_START]
                entry = {
                    "warStartPrice": r(a_retail), "currentPrice": r(actual_daily[end]),
                    "priceIncrease": r(actual_daily[end] - a_retail), "pctChange": r((actual_daily[end] / a_retail - 1) * 100, 2),
                    "noWarPriceToday": r(cf_daily[s][end]),
                    "litresPerDayThisMonth": round(litres(end)),
                    "totalExtraCost": round(b), "perHouseholdCost": round(b / hh_n, 2),
                    "dailyRate": round((actual_daily[end] - cf_daily[s][end]) * litres(end)),
                    "households": hh_n, "administeredPrice": administered,
                    "administeredSince": fixed_since.isoformat() if fixed_since else None,
                    **split,
                    **flow,
                    "totalShock": round(b + split["taxRelief"] + split["stateCostFixedPrice"]),
                }
                if area != "EU":
                    entry["taxChanges"] = {
                        "vat": fetch_wob.tax_changes(wob["vat"], area, fuel, WAR_START - dt.timedelta(days=28)),
                        "excise": fetch_wob.tax_changes(wob["excise"], area, fuel, WAR_START - dt.timedelta(days=28)),
                        "exciseCurrency": fetch_wob.CURRENCY.get(area, "EUR"),
                    }
                if area == "EU":
                    deficit[s]["euDirect"] = entry
                else:
                    deficit[s]["countries"][area] = entry
            if area != "EU" and fuel in HEADLINE_FUELS:
                actual_m = actual_vols.get(area, {}).get(fuel, {})

                def litres_actual(d, m=month_lpd, a=actual_m):
                    return a.get(f"{d.year}-{d.month:02d}", m[f"{d.month:02d}"])

                for b_key, anchor in anchors.items():
                    for se_key, se in (("2021-25", season), ("ex2022", season_ex22)):
                        cf = interpolate_daily(weekly_path(last_prewar, *anchor, vat0, bulletin_dates, {} if administered else se),
                                               WAR_START, end)
                        for vo_key, vol in (("normal", litres), ("actual", litres_actual)):
                            cell = grid.setdefault((b_key, se_key, vo_key), {})
                            cell[area] = cell.get(area, 0.0) + burden(actual_daily, cf, vol, WAR_START, end)

            if area != "EU" and not administered and has_crude:
                base = sum(pretax[d] for d in janfeb) / len(janfeb)
                for d in daterange(WAR_START, end):
                    cross[fuel]["pretaxPremium"] += (pretax_daily[d] - base) * litres(d)
                    cross[fuel]["upstream"] += (cr[d] - crude_janfeb) * litres(d)
                    if d <= TE_COMPARISON_END:
                        cross[fuel]["pretaxPremiumToTE"] += (pretax_daily[d] - base) * litres(d)
                        cross[fuel]["upstreamToTE"] += (cr[d] - crude_janfeb) * litres(d)
            if area != "EU":
                ex = interpolate_daily(weekly_path(last_prewar, *anchors["lastBulletin"], vat0, bulletin_dates, {} if administered else season_ex22), WAR_START, end)
                total_ex22 += burden(actual_daily, ex, litres, WAR_START, end)

            cf_series[area] = [{"date": d.isoformat(), "price": r(cf_daily["lastBulletin"][d]),
                                "priceFebAvg": r(cf_daily["febAvg"][d])} for d in sorted(cf_daily["lastBulletin"])]
            if area != "EU":
                prev = bulletin_dates[-2]
                current.append({"code": area, "name": NAMES[area], "price": r(actual_daily[end]), "prevWeek": r(actual_daily[prev]),
                                "warStart": r(anchors["lastBulletin"][0]), "warStartFebAvg": r(anchors["febAvg"][0])})

        # EU totals = sum of the 27 member states (the EU's own consumption-weighted price is kept for the chart).
        eu_hh = hh["EU"]["households"]
        for s in SCENARIOS:
            direct = deficit[s]["euDirect"]
            sums = {k: sum(deficit[s]["countries"][c][k] for c in EU27)
                    for k in ("taxRelief", "vatWindfall", "stateCostFixedPrice", "totalShock")}
            deficit[s]["EU"] = direct | {"totalExtraCost": round(totals[s]), "perHouseholdCost": round(totals[s] / eu_hh, 2),
                                         "dailyRate": round(latest_rate[s])} | sums | (split_tot[s] if has_crude else {})
            for metric in ("totalExtraCost", "perHouseholdCost", "pctChange", "taxRelief"):
                ranked = sorted(EU27, key=lambda c: deficit[s]["countries"][c][metric], reverse=True)
                for i, c in enumerate(ranked, 1):
                    deficit[s]["countries"][c].setdefault("rank", {})[metric] = i
        for s in SCENARIOS:
            deficit[s]["EU"]["countriesWithoutPrices"] = no_price
        eu_final[fuel] = deficit["lastBulletin"]["EU"]
        sensitivity[fuel] = {"lastBulletin": round(totals["lastBulletin"]), "excluding2022Seasonality": round(total_ex22),
                             "euDirectFormula": deficit["lastBulletin"]["euDirect"]["totalExtraCost"]}

        if has_crude:
            cross[fuel] = {k: round(v) for k, v in cross[fuel].items()}
            cross[fuel]["downstream"] = cross[fuel]["pretaxPremium"] - cross[fuel]["upstream"]
            cross[fuel]["downstreamToTE"] = cross[fuel]["pretaxPremiumToTE"] - cross[fuel]["upstreamToTE"]
            cross[fuel]["comparisonEnd"] = TE_COMPARISON_END.isoformat()
        if has_crude:
            json_eu[fuel] = deficit["lastBulletin"]["EU"]
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
            "flowSeries": flows.get(fuel, []),
        })

    eu_lpd = {f: sum(vols["litresPerDay"]["EU"][f].values()) / 12 for f in HEADLINE_FUELS}
    us_comparison.build(end, eu_final, hh["EU"]["households"], eu_lpd)
    write_json("scenarios.json", scenario_grid(grid, vols, actual_vols, hh))
    try:
        write_json("household-energy.json", household_energy.build())
    except Exception as e:  # noqa: BLE001 - keep last week's file if Eurostat is unreachable
        print(f"household energy not refreshed ({e})")

    write_json("monthly-demand.json", {"source": "Eurostat nrg_cb_oilm, gross inland deliveries (GID_OBS): O4652 motor gasoline, "
                                                 "O46711 road diesel; 2021-2025 average litres/day by calendar month",
                                       "eurostatUpdated": vols["updated"], "gaps": vols["gaps"],
                                       "litresPerDay": vols["litresPerDay"]})
    write_json("households.json", {"source": "Eurostat lfst_hhnhtych (private households), demo_pjan (population)",
                                   "areas": {a: hh[a] | car_stock.get(a, {}) | {"name": NAMES[a]} for a in EU27 + ["EU"]}})
    write_json("people.json", people_figures(eu_gap, eu_vat, end))
    write_json("meta.json", {"builtAt": now.isoformat(), "latestBulletin": end.isoformat(),
                             "bulletinWeeks": len(bulletin_dates), "sensitivity": sensitivity,
                             "crossCheckFlatBaseline": cross, "latestBrentDay": crude["latestBrentDay"].isoformat(),
                             "brentWeeklyEUR": {d.isoformat(): r(v, 2) for d, v in crude["weeklyBrentEUR"].items()},
                             "litresPerTonne": {f: v[2] for f, v in FUELS.items()}})

    for fuel, s in sensitivity.items():
        if fuel not in HEADLINE_FUELS:
            print(f"{fuel} (not in headline): EU27 €{s['lastBulletin'] / 1e9:.2f}B")
            continue
        print(f"{fuel}: EU27 €{s['lastBulletin'] / 1e9:.2f}B  (EU-level formula €{s['euDirectFormula'] / 1e9:.2f}B, "
              f"seasonality ex-2022 €{s['excluding2022Seasonality'] / 1e9:.2f}B)")
    tot = sum(s["lastBulletin"] for f, s in sensitivity.items() if f in HEADLINE_FUELS)
    print(f"TOTAL €{tot / 1e9:.2f}B = €{tot / hh['EU']['households']:.0f} per household, through {end}")
    
    for name, k in (("crude (upstream)", "upstreamCrude"), ("margins (downstream)", "downstreamMargin"), ("taxes (net)", "taxNet")):
        print(f"  {name}: €{sum(json_eu[f][k] for f in json_eu) / 1e9:.2f}B")
    te = sum(c["pretaxPremiumToTE"] for c in cross.values())
    print(f"  T&E-style flat baseline to {TE_COMPARISON_END}: €{te / 1e9:.2f}B "
          f"(upstream €{sum(c['upstreamToTE'] for c in cross.values()) / 1e9:.2f}B, downstream €{sum(c['downstreamToTE'] for c in cross.values()) / 1e9:.2f}B)")


if __name__ == "__main__":
    main(cached="--cached" in sys.argv)
