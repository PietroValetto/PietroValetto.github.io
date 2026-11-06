"""Parity check: our burden() on Brown's own published US data must reproduce their headline figures.

    python pipeline/test_us_parity.py [brown_gas_billions brown_diesel_billions]   (read off the live site)
"""
import datetime as dt
import sys

from common import WAR_START
from burden import burden
from us_comparison import brown, us_burden


def main() -> int:
    demand = brown("monthly-demand")
    ok = True
    for i, product in enumerate(("gas", "diesel")):
        total, actual, cf, end = us_burden(product, demand)
        gpd = demand[product]["gallonsPerDay"]
        prev = burden(actual, cf, lambda d: gpd[f"{d.month:02d}"], WAR_START, end - dt.timedelta(days=1))
        print(f"{product}: our burden on Brown data through {end} = ${total / 1e9:.2f}B (through day before: ${prev / 1e9:.2f}B)")
        if len(sys.argv) > 2:
            target = float(sys.argv[1 + i])
            dev = abs(total / 1e9 - target) / target
            print(f"   vs Brown headline ${target:.2f}B -> {dev * 100:.2f}% deviation")
            ok &= dev < 0.01
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
