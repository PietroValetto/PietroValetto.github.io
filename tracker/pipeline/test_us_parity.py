"""Parity check: our burden() on Brown's own published US data must reproduce their headline figures.

    python pipeline/test_us_parity.py
"""
import datetime as dt
import json
import sys

from burden import burden
from common import WAR_START, http_get

BROWN = "https://iranwarcost.watson.brown.edu/data/"


def load(name):
    return json.loads(http_get(BROWN + name + ".json"))


def series(obj, key="US"):
    return {dt.date.fromisoformat(x["date"]): x["price"] for x in obj["series"][key]}


def main() -> int:
    demand = load("monthly-demand")
    ok = True
    for ours, theirs in (("gas", "gas"), ("diesel", "diesel")):
        actual = series(load(f"{theirs}-time-series"))
        cf = series(load(f"{theirs}-counterfactual"))
        gpd = demand[ours]["gallonsPerDay"]
        end = max(cf)
        total = burden(actual, cf, lambda d: gpd[f"{d.month:02d}"], WAR_START, end)
        # Brown's page computes the same sum through "today"; recompute their sum excluding today too
        prev = burden(actual, cf, lambda d: gpd[f"{d.month:02d}"], WAR_START, end - dt.timedelta(days=1))
        print(f"{ours}: our burden on Brown data through {end} = ${total / 1e9:.2f}B (through day before: ${prev / 1e9:.2f}B)")
        if len(sys.argv) > 2:
            target = float(sys.argv[1 if ours == "gas" else 2])
            dev = abs(total / 1e9 - target) / target
            print(f"   vs Brown headline ${target:.2f}B -> {dev * 100:.2f}% deviation")
            ok &= dev < 0.01
    return 0 if ok else 1


if __name__ == "__main__":
    # Usage: test_us_parity.py [brown_gas_billions brown_diesel_billions]  (read off the live site)
    sys.exit(main())
