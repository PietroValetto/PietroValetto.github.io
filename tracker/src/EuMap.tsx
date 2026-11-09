import { useEffect, useMemo, useState } from "react";
import { geoAzimuthalEqualArea, geoPath } from "d3-geo";
import { scaleLinear } from "d3-scale";
import { feature } from "topojson-client";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Topology } from "topojson-specification";

// Mainland-Europe frame: clips the French outermost regions and other far-flung territories.
const FRAME: Feature = {
  type: "Feature", properties: {},
  geometry: { type: "Polygon", coordinates: [[[-11, 34.5], [-11, 70.5], [33, 70.5], [33, 34.5], [-11, 34.5]]] },
};
const W = 640, H = 600;
const toWob = (id: string) => (id === "EL" ? "GR" : id);

type Geo = FeatureCollection<Geometry, { NUTS_ID: string; NAME_ENGL: string }>;
let geoCache: Promise<Geo> | null = null;
const loadGeo = () =>
  (geoCache ??= fetch(`${import.meta.env.BASE_URL}geo/nuts0.topo.json`)
    .then((r) => r.json())
    .then((topo: Topology) => feature(topo, topo.objects[Object.keys(topo.objects)[0]]) as unknown as Geo));

interface Props {
  values: Record<string, number | null>;   // null = no data (drawn as non-EU)
  label: string;
  fmt: (v: number) => string;
  short: (v: number) => string;
  name: (code: string) => string;
  hover: string | null;
  setHover: (code: string | null) => void;
  onSelect?: (code: string) => void;
  note?: (code: string) => string | null; // extra text in the hover readout
}

/** Choropleth of the EU27 with a hover readout and a colour scale, shared by the Fuel and Energy tabs. */
export function EuMap({ values, label, fmt, short, name, hover, setHover, onSelect, note }: Props) {
  const [geo, setGeo] = useState<Geo | null>(null);
  useEffect(() => { loadGeo().then(setGeo); }, []);

  const nums = Object.values(values).filter((v): v is number => v !== null);
  const [lo, hi] = [Math.min(...nums), Math.max(...nums)];
  const color = scaleLinear<string>().domain([lo, (lo + hi) / 2, hi]).range(["#F5EFE3", "#1F8A5B", "#12563A"]);
  const path = useMemo(() => {
    const proj = geoAzimuthalEqualArea().rotate([-10, -52]).fitExtent([[4, 4], [W - 4, H - 4]], FRAME).clipExtent([[0, 0], [W, H]]);
    return geoPath(proj);
  }, []);
  const hovered = hover && values[hover] !== undefined ? hover : null;

  return (
    <div className="map-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="map" role="group" aria-label={`Map of ${label} by EU country`}>
        {geo?.features.map((f) => {
          const code = toWob(f.properties.NUTS_ID);
          const v = values[code];
          const d = path(f) ?? "";
          if (v === undefined || v === null) return <path key={f.properties.NUTS_ID} d={d} className="map-other" />;
          return (
            <path key={code} d={d} fill={color(v)} className={`map-country ${hovered === code ? "is-hover" : ""}`}
              tabIndex={onSelect ? 0 : -1} role={onSelect ? "button" : undefined} aria-label={`${name(code)}: ${fmt(v)}`}
              onMouseEnter={() => setHover(code)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(code)} onBlur={() => setHover(null)}
              onClick={() => onSelect?.(code)}
              onKeyDown={(ev) => onSelect && (ev.key === "Enter" || ev.key === " ") && (ev.preventDefault(), onSelect(code))} />
          );
        })}
      </svg>
      <div className="map-readout" aria-live="polite">
        {hovered ? (
          <>
            <strong>{name(hovered)}</strong>{" "}
            <span data-tabular>{values[hovered] === null ? "no data" : fmt(values[hovered] as number)}</span>
            {note?.(hovered) && <span className="muted"> · {note(hovered)}</span>}
          </>
        ) : <span className="muted">Hover a country</span>}
      </div>
      <div className="scale">
        <span data-tabular>{short(lo)}</span>
        <span className="scale-bar" />
        <span data-tabular>{short(hi)}</span>
      </div>
    </div>
  );
}
