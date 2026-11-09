import { useEffect, useState } from "react";
import { AllData, FUELS, FUEL_LABEL, FUEL_SUB, Fuel, Scenario, entry } from "./data";
import { euro, euroShort, longDate, pct, perLitre } from "./format";
import { RangeLine } from "./Assumptions";

/**
 * The Oil Bulletin is weekly, so the burden is measured up to the latest bulletin and then
 * extrapolated on the visitor's clock at that week's daily rate (euros per second).
 */
export function useLive(measured: number, dailyRate: number, measuredThrough: string): number {
  const since = new Date(measuredThrough).getTime();
  const calc = () => measured + Math.max(0, (Date.now() - since) / 86_400_000) * dailyRate;
  const [v, setV] = useState(calc);
  useEffect(() => {
    const id = window.setInterval(() => setV(calc()), 100);
    return () => window.clearInterval(id);
  }, [measured, dailyRate, measuredThrough]); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

interface Props {
  data: AllData;
  scenario: Scenario;
  fuel: Fuel;
  onFuel: (f: Fuel) => void;
  onAssumptions?: () => void;
}

export function Headline({ data, scenario, fuel, onFuel, onAssumptions }: Props) {
  const d = data.fuels.petrol.deficit;
  const eu = (f: Fuel) => entry(data, f, scenario, "EU");
  const live = {
    petrol: useLive(eu("petrol").totalExtraCost, eu("petrol").dailyRate, d.measuredThrough),
    diesel: useLive(eu("diesel").totalExtraCost, eu("diesel").dailyRate, d.measuredThrough),
  };
  const total = live.petrol + live.diesel;
  const measured = eu("petrol").totalExtraCost + eu("diesel").totalExtraCost;
  const households = data.households.areas.EU.households;
  const share = (f: Fuel) => Math.max(0.04, live[f] / total);

  return (
    <section className="headline">
      <div className="tank" aria-hidden="true">
        {FUELS.map((f) => (
          <button key={f} className={`tank-seg tank-${f}`} style={{ flexGrow: share(f) }} onClick={() => onFuel(f)} tabIndex={-1}>
            <span className="tank-label">{FUEL_LABEL[f]}</span>
            <span className="tank-value">{euroShort(live[f])}</span>
          </button>
        ))}
      </div>
      <div className="headline-body">
        <p className="kicker">Total extra cost to EU consumers since the war began</p>
        <p className="big-number" data-tabular aria-live="off">{euro(total)}</p>
        <p className="big-sub">
          That's {euroShort(total)}. Measured to the {longDate(d.endDate)} Oil Bulletin ({euroShort(measured)}), then
          estimated in real time at the latest weekly rate.
        </p>
        {onAssumptions && <RangeLine onOpen={onAssumptions} />}
        <div className="fuel-tiles">
          {FUELS.map((f) => {
            const e = eu(f);
            return (
              <button key={f} className={`fuel-tile ${fuel === f ? "is-active" : ""}`} onClick={() => onFuel(f)} aria-pressed={fuel === f}>
                <span className="fuel-tile-name">{FUEL_LABEL[f]} <small>{FUEL_SUB[f]}</small></span>
                <span className="fuel-tile-prices" data-tabular>
                  {perLitre(e.warStartPrice)} → {perLitre(e.currentPrice)} <b className="up">▲ {pct(e.pctChange)}</b>
                </span>
                <span className="fuel-tile-value" data-tabular>{euroShort(live[f])}</span>
              </button>
            );
          })}
        </div>
        <p className="per-hh" data-tabular>
          <strong>{euro(total / households)}</strong> per EU household
        </p>
        <p className="per-hh-sub">across petrol and diesel · {(households / 1e6).toFixed(0)}M households</p>
        <p className="hint">Click petrol or diesel to explore that fuel.</p>
      </div>
    </section>
  );
}
