"""Consumer burden = sum over days of (actual price - no-war price) x litres consumed that day."""
import datetime as dt
from typing import Callable

from common import daterange


def burden(actual: dict, counterfactual: dict, volume: Callable[[dt.date], float],
           start: dt.date, end: dt.date) -> float:
    """Sum (actual_d - cf_d) * volume(d) for every day d in [start, end].

    `actual` and `counterfactual` map date -> price per unit; `volume` returns units consumed on a day.
    Days missing from either series are skipped (Brown does the same for gaps).
    """
    total = 0.0
    for d in daterange(start, end):
        a, c = actual.get(d), counterfactual.get(d)
        if a is None or c is None:
            continue
        total += (a - c) * volume(d)
    return total
