import { useEffect, useRef, useState } from "react";
import { useModal } from "./useModal";
import { euro, euroShort, monthYear, pct } from "./format";

type Dim = "baseline" | "seasonality" | "volumes";
export interface Scenarios {
  default: Record<Dim, string>;
  labels: Record<Dim, Record<string, string>>;
  combos: ({ total: number; perHousehold: number; countries: Record<string, number> } & Record<Dim, string>)[];
  demandResponse: Record<string, { months: string[]; pctVsNormal: number }>;
}

let cache: Promise<Scenarios | null> | null = null;
export const loadScenarios = () =>
  (cache ??= fetch(`${import.meta.env.BASE_URL}data/scenarios.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));

export function useScenarios() {
  const [s, setS] = useState<Scenarios | null>(null);
  useEffect(() => { loadScenarios().then(setS); }, []);
  return s;
}

const EXPLAIN: Record<Dim, string> = {
  baseline: "Which pump price counts as \"before the war\": the last weekly bulletin before 28 February, or February's average.",
  seasonality: "The no-war path follows the normal seasonal price pattern. 2022 includes the jump after Russia invaded Ukraine, which inflates the \"normal\" spring rise. Leaving it out raises the estimate.",
  volumes: "Litres sold: the 2021–25 average for each month (as the US tracker), or Eurostat's actual 2026 deliveries for the months already published.",
};

/** One line under the headline: the range across all assumption combinations, opening the panel. */
export function RangeLine({ onOpen }: { onOpen: () => void }) {
  const s = useScenarios();
  if (!s) return null;
  const totals = s.combos.map((c) => c.total);
  return (
    <p className="range-line">
      Under other reasonable assumptions: <strong data-tabular>{euroShort(Math.min(...totals))}–{euroShort(Math.max(...totals))}</strong>{" "}
      <button className="link" onClick={onOpen}>See how →</button>
    </p>
  );
}

export function Assumptions({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const { close, onBackdrop } = useModal(ref, onClose);
  const s = useScenarios();
  const [pick, setPick] = useState<Record<Dim, string> | null>(null);
  const choice = pick ?? s?.default ?? null;

  const combo = s && choice ? s.combos.find((c) => (Object.keys(choice) as Dim[]).every((k) => c[k] === choice[k])) : null;
  const def = s ? s.combos.find((c) => (Object.keys(s.default) as Dim[]).every((k) => c[k] === s.default[k])) : null;
  const isDefault = Boolean(s && choice && (Object.keys(s.default) as Dim[]).every((k) => s.default[k] === choice[k]));

  return (
    <dialog ref={ref} className="panel" onClick={onBackdrop} aria-labelledby="a-title">
      <div className="panel-inner prose">
        <button className="close" onClick={close} aria-label="Close">✕</button>
        <p className="kicker">Assumptions</p>
        <h2 id="a-title">How much do the assumptions matter?</h2>
        <p>The headline uses the same choices as the US tracker, so the two can be compared. Change them here to see how the EU total moves. The rest of the page keeps the default.</p>

        {s && choice && (
          <>
            {(Object.keys(s.labels) as Dim[]).map((dim) => (
              <div key={dim} className="assume-row">
                <div className="toggle-row" role="radiogroup" aria-label={dim}>
                  {Object.entries(s.labels[dim]).map(([k, label]) => (
                    <button key={k} role="radio" aria-checked={choice[dim] === k} className={choice[dim] === k ? "is-active" : ""}
                      onClick={() => setPick({ ...choice, [dim]: k })}>
                      {label}{s.default[dim] === k && <small> · default</small>}
                    </button>
                  ))}
                </div>
                <p className="assume-explain">{EXPLAIN[dim]}</p>
              </div>
            ))}

            {combo && def && (
              <div className="assume-result">
                <span className="stat-label">EU extra cost of petrol and diesel</span>
                <span className="stat-value stat-value-xl" data-tabular>{euroShort(combo.total)}</span>
                <span className="stat-note" data-tabular>
                  {euro(combo.perHousehold)} per household ·{" "}
                  {isDefault ? "default (comparable with the US tracker)" : `${pct((combo.total / def.total - 1) * 100)} vs the default ${euroShort(def.total)}`}
                </span>
              </div>
            )}

            {s.demandResponse.petrol && (
              <p className="assume-explain">
                For reference, Eurostat's published 2026 deliveries since the war began
                ({monthYear(s.demandResponse.petrol.months[0] + "-01")} to {monthYear(s.demandResponse.petrol.months.slice(-1)[0] + "-01")}) compare with the 2021–25 average as follows:
                petrol {pct(s.demandResponse.petrol?.pctVsNormal ?? 0)}, diesel {pct(s.demandResponse.diesel?.pctVsNormal ?? 0)}. Longer-term
                trends drive much of this (2021 was a pandemic year, and car fleets are shifting from diesel to petrol), not only the war.
              </p>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
