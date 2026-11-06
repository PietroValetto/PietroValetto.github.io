"""No-war counterfactual: pre-war price carried forward by the average seasonal price move.

Brown's US tracker applies the average 2021-2025 daily change in NY Harbor spot prices for each
calendar date. Europe has no free daily product spot series, so we use the Weekly Oil Bulletin's
EU-average price *net of taxes* for 2021-2025: the average % change for each ISO week. The change
is applied to the pre-tax price only (excise is a fixed amount per litre), then VAT is added back
at the pre-war rate. Taxes are therefore held at their pre-war level in the no-war world.
"""
import datetime as dt

from common import SEASONAL_YEARS


def _week(d: dt.date) -> int:
    return min(d.isocalendar()[1], 52)


def seasonal_weekly_change(eu_pretax: dict[dt.date, float], years=SEASONAL_YEARS) -> dict[int, float]:
    """Average week-on-week % change of the EU pre-tax price, by ISO week, across `years`."""
    dates = sorted(eu_pretax)
    acc = {}
    for prev, cur in zip(dates, dates[1:]):
        if cur.year in years and (cur - prev).days == 7:
            acc.setdefault(_week(cur), []).append(eu_pretax[cur] / eu_pretax[prev] - 1.0)
    return {w: sum(v) / len(v) for w, v in acc.items()}


def weekly_path(anchor_date: dt.date, anchor_retail: float, anchor_pretax: float, vat: float,
                bulletin_dates: list[dt.date], season: dict[int, float]) -> dict[dt.date, float]:
    """Counterfactual retail price at the anchor date and every later bulletin date."""
    path = {anchor_date: anchor_retail}
    pretax = anchor_pretax
    for d in sorted(x for x in bulletin_dates if x > anchor_date):
        pretax *= 1.0 + season.get(_week(d), 0.0)
        path[d] = anchor_retail + (pretax - anchor_pretax) * (1.0 + vat)
    return path
