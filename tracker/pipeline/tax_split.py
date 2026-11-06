"""Who carries the price shock: consumers at the pump, or governments through tax cuts.

For each day we compare the actual pump price with the price consumers would have paid had taxes
stayed at their pre-war level ("no relief"):

    T0           = pre-war non-VAT taxes per litre, implied as retail0 / (1 + VAT0) - pretax0
    P_norelief_d = (pretax_d + T0) x (1 + VAT0)
    relief_d     = P_norelief_d - P_actual_d        (> 0 when excise or VAT was cut)

Summed over litres, relief is what governments gave up to soften the shock. The extra VAT collected
on the higher pre-tax price is the government's windfall from the same shock. For administered-price
countries (Malta) pump prices do not move, so the state absorbs the whole shock; we estimate it from
the EU-average pre-tax increase.
"""
import datetime as dt
from typing import Callable

from common import daterange


def implied_pretax_cf(cf_retail: float, anchor_retail: float, anchor_pretax: float, vat0: float) -> float:
    """Invert the counterfactual retail path back to its pre-tax component (see counterfactual.weekly_path)."""
    return anchor_pretax + (cf_retail - anchor_retail) / (1.0 + vat0)


def split(retail: dict, pretax: dict, cf_retail: dict, anchor_retail: float, anchor_pretax: float, vat0: float,
          vat_on: Callable[[dt.date], float], litres: Callable[[dt.date], float], start: dt.date, end: dt.date,
          administered: bool = False, eu_pretax_shock: dict | None = None) -> dict:
    """Return relief, VAT windfall and (for administered prices) the state's estimated cost, in EUR."""
    t0 = anchor_retail / (1.0 + vat0) - anchor_pretax
    relief = windfall = state = 0.0
    relief_rate = 0.0
    for d in daterange(start, end):
        lt = litres(d)
        if administered:
            state += (eu_pretax_shock or {}).get(d, 0.0) * (1.0 + vat0) * lt
            continue
        norelief = (pretax[d] + t0) * (1.0 + vat0)
        r = norelief - retail[d]
        relief += r * lt
        relief_rate = r
        shock = pretax[d] - implied_pretax_cf(cf_retail[d], anchor_retail, anchor_pretax, vat0)
        windfall += shock * vat_on(d) * lt
    return {"taxRelief": round(relief), "vatWindfall": round(windfall), "stateCostFixedPrice": round(state),
            "reliefPerLitreNow": round(relief_rate, 4)}
