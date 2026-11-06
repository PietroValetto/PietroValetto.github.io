import { useEffect, useMemo, useState } from "react";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";
import { AllData, FUEL_LABEL, Fuel, Scenario } from "./data";
import { euro, euro2, euroShort, monthYear, perLitre, signed } from "./format";

export type Metric = "currentPrice" | "priceIncrease" | "totalExtraCost" | "perHouseholdCost";
const METRICS: { key: Metric; label: string; fmt: (v: number) => string; short: (v: number) => string }[] = [
  { key: "currentPrice", label: "Current price", fmt: perLitre, short: perLitre },
  { key: "priceIncrease", label: "Price change", fmt: (v) => `${signed(v)} /L`, short: (v) => signed(v, 2) },
  { key: "totalExtraCost", label: "Total consumer cost", fmt: euro, short: euroShort },
  { key: "perHouseholdCost", label: "Household cost", fmt: euro2, short: (v) => euro(v) },
];

// Mainland-Europe frame: clips the French outermost regions and other far-flung territories.
const FRAME: Feature = {
  type: "Feature", properties: {},
  geometry: { type: "Polygon", coordinates: [[[-11, 34.5], [-11, 70.5], [33, 70.5], [33, 34.5], [-11, 34.5]]] },
};
const W = 640, H = 600;

type Props = { data: AllData; fuel: Fuel; scenario: Scenario; onSelect: (code: string) => void };

const toWob = (id: string) => (id === "EL" ? "GR" : id);

export function CountryMap({ data, fuel, scenario, onSelect }: Props) {
  const [geo, setGeo] = useState<FeatureCollection<Geometry, { NUTS_ID: string; NAME_ENGL: string }> | null>(null);
  const [metric, setMetric] = useState<Metric>("totalExtraCost");
  const [hover, setHover] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}geo/nuts0.topo.json`)
      .then((r) => r.json())
      .then((topo: Topology) => {
        const key = Object.keys(topo.objects)[0];
        setGeo(feature(topo, topo.objects[key]) as unknown as FeatureCollection<Geometry, { NUTS_ID: string; NAME_ENGL: string }>);
      });
  }, []);

  const countries = data.fuels[fuel].deficit.scenarios[scenario].countries;
  const m = METRICS.find((x) => x.key === metric)!;
  const values = Object.values(countries).map((e) => e[metric]);
  const [lo, hi] = [Math.min(...values), Math.max(...values)];
  const color = scaleLinear<string>().domain([lo, (lo + hi) / 2, hi]).range(["#F5EFE3", "#1F8A5B", "#12563A"]);

  const path = useMemo(() => {
    const proj = geoAzimuthalEqualArea().rotate([-10, -52]).fitExtent([[4, 4], [W - 4, H - 4]], FRAME).clipExtent([[0, 0], [W, H]]);
    return geoPath(proj);
  }, []);

  const ranked = Object.entries(countries).sort((a, b) => (sortDesc ? b[1][metric] - a[1][metric] : a[1][metric] - b[1][metric]));
  const hovered = hover && countries[hover] ? hover : null;
  const name = (c: string) => data.households.areas[c]?.name ?? c;
  const euAvg = data.fuels[fuel].current.euAvg;
  const fixed = Object.entries(countries).filter(([, e]) => e.administeredPrice);

  return (
    <section className="section" id="countries">
      <p className="kicker">By country</p>
      <h2>Current {FUEL_LABEL[fuel].toLowerCase()} statistics by country</h2>
      <p className="lede">{FUEL_LABEL[fuel]}, EU average today: {perLitre(euAvg)}/litre</p>

      <div className="metric-tabs" role="tablist" aria-label="Map metric">
        {METRICS.map((x) => (
          <button key={x.key} role="tab" aria-selected={metric === x.key} className={metric === x.key ? "is-active" : ""} onClick={() => setMetric(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
      <p className="hint">Click a country, or press Enter on one, for a detailed breakdown.</p>

      <div className="map-layout">
        <div className="map-wrap">
          <svg viewBox={`0 0 ${W} ${H}`} className="map" role="group" aria-label={`Map of ${m.label} by EU country`}>
            {geo?.features.map((f) => {
              const code = toWob(f.properties.NUTS_ID);
              const e = countries[code];
              const d = path(f) ?? "";
              if (!e) return <path key={f.properties.NUTS_ID} d={d} className="map-other" />;
              return (
                <path key={code} d={d} fill={color(e[metric])} className={`map-country ${hovered === code ? "is-hover" : ""}`}
                  tabIndex={0} role="button" aria-label={`${name(code)}: ${m.fmt(e[metric])}`}
                  onMouseEnter={() => setHover(code)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(code)} onBlur={() => setHover(null)}
                  onClick={() => onSelect(code)} onKeyDown={(ev) => (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onSelect(code))} />
              );
            })}
          </svg>
          <div className="map-readout" aria-live="polite">
            {hovered ? (<><strong>{name(hovered)}</strong> <span data-tabular>{m.fmt(countries[hovered][metric])}</span>
              {countries[hovered].administeredPrice && <span className="muted"> · fixed price</span>}</>) : <span className="muted">Hover a country</span>}
          </div>
          <div className="scale">
            <span data-tabular>{m.short(lo)}</span>
            <span className="scale-bar" />
            <span data-tabular>{m.short(hi)}</span>
          </div>
        </div>

        <div className="rank">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Country</th>
                <th className="num">
                  <button className="sort" onClick={() => setSortDesc(!sortDesc)} aria-label={`Sort by ${m.label}`}>
                    {m.label} {sortDesc ? "↓" : "↑"}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(([c, e], i) => (
                <tr key={c} className={hovered === c ? "is-hover" : ""} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
                  <td className="muted" data-tabular>{i + 1}</td>
                  <td>
                    <button className="link" onClick={() => onSelect(c)}>{name(c)}</button>
                    {e.administeredPrice && <sup className="fn" aria-label="fixed price, see note">*</sup>}
                  </td>
                  <td className="num" data-tabular>{m.fmt(e[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {fixed.length > 0 && (
            <p className="table-note">
              <sup className="fn">*</sup> {fixed.map(([c]) => name(c)).join(", ")}: pump prices are fixed by the state (unchanged
              since {monthYear(fixed[0][1].administeredSince ?? "2020-06-15")}), so consumers pay nothing extra. The war's cost falls
              on public finances instead, and isn't counted in this tracker.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
