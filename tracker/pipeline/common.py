"""Shared constants and helpers for the EU fuel war-cost pipeline."""
import datetime as dt
import json
import pathlib
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / "pipeline" / "cache"
OUT = ROOT / "public" / "data"

WAR_START = dt.date(2026, 2, 28)
# Brown's counterfactual uses EIA spot history 2021-2025; we use the same years.
SEASONAL_YEARS = range(2021, 2026)

# Weekly Oil Bulletin country codes (Greece is GR here, EL at Eurostat).
EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU",
        "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]
TO_EUROSTAT = {c: ("EL" if c == "GR" else c) for c in EU27}

NAMES = {
    "AT": "Austria", "BE": "Belgium", "BG": "Bulgaria", "CY": "Cyprus", "CZ": "Czechia",
    "DE": "Germany", "DK": "Denmark", "EE": "Estonia", "ES": "Spain", "FI": "Finland",
    "FR": "France", "GR": "Greece", "HR": "Croatia", "HU": "Hungary", "IE": "Ireland",
    "IT": "Italy", "LT": "Lithuania", "LU": "Luxembourg", "LV": "Latvia", "MT": "Malta",
    "NL": "Netherlands", "PL": "Poland", "PT": "Portugal", "RO": "Romania", "SE": "Sweden",
    "SI": "Slovenia", "SK": "Slovakia", "EU": "European Union",
}

# Fuel keys: our name -> (Weekly Oil Bulletin column suffix, Eurostat SIEC code, litres per tonne)
FUELS = {
    "petrol": ("euro95", "O4652", 1342.0),   # Euro-super 95 / motor gasoline, ~0.745 kg/L
    "diesel": ("diesel", "O46711", 1195.0),  # automotive gas oil / road diesel, ~0.837 kg/L
}

WOB_URL = ("https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en"
           "?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx")
EUROSTAT_API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data"


def http_get(url: str, timeout: int = 120) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "eu-iran-war-fuel-cost/1.0 (+github)"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def daterange(start: dt.date, end: dt.date):
    d = start
    while d <= end:
        yield d
        d += dt.timedelta(days=1)


def interpolate_daily(points: dict[dt.date, float], start: dt.date, end: dt.date) -> dict[dt.date, float]:
    """Linear interpolation of sparse (weekly) points onto every day in [start, end].

    Days after the last point carry the last value forward; days before the first carry it back.
    """
    keys = sorted(points)
    out = {}
    j = 0
    for d in daterange(start, end):
        while j + 1 < len(keys) and keys[j + 1] <= d:
            j += 1
        if d <= keys[0]:
            out[d] = points[keys[0]]
        elif j + 1 >= len(keys):
            out[d] = points[keys[-1]]
        else:
            a, b = keys[j], keys[j + 1]
            w = (d - a).days / (b - a).days
            out[d] = points[a] + (points[b] - points[a]) * w
    return out


def write_json(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / name).write_text(json.dumps(obj, indent=1, ensure_ascii=False))
