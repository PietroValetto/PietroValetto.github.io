import { useEffect, useState } from "react";
import { AllData, FUELS, Scenario, entry } from "./data";
import { useLive } from "./Headline";
import { euroShort } from "./format";

interface Item {
  id: string; unitCost: number; unit: string; detail: string; range: string; source: string; url: string | null;
  yield?: { perUnitMWhPerYear: number; assumption: string };
}
interface Scale { id: string; label: string; perYear: number; detail: string; source: string; url: string }
interface WhatIfData { asOf: string; items: Item[]; forScale: Scale[] }

type Base = "pump" | "shock" | "energy";

// 4.4 million / 730,000 / 8,214
const count = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)} million` : (v >= 1e4 ? Math.round(v / 1e3) * 1e3 : Math.round(v)).toLocaleString("en-IE");
const gw = (mw: number) => (mw >= 1000 ? `${(mw / 1000).toFixed(0)} GW` : `${Math.round(mw)} MW`);
const twh = (mwh: number) => `${(mwh / 1e6).toFixed(mwh >= 1e7 ? 0 : 1)} TWh`;

export function WhatIf({ data, scenario }: { data: AllData; scenario: Scenario }) {
  const [w, setW] = useState<WhatIfData | null>(null);
  const [base, setBase] = useState<Base>("pump");
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/whatif.json`).then((r) => r.json()).then(setW).catch(() => setW(null));
  }, []);

  const d = data.fuels.petrol.deficit;
  const eu = (f: "petrol" | "diesel") => entry(data, f, scenario, "EU");
  const pump = useLive(eu("petrol").totalExtraCost + eu("diesel").totalExtraCost, eu("petrol").dailyRate + eu("diesel").dailyRate, d.measuredThrough);
  const heatEU = data.heating?.deficit.scenarios[scenario].EU;
  const heating = useLive(heatEU?.totalExtraCost ?? 0, heatEU?.dailyRate ?? 0, d.measuredThrough);
  const household = useLive(data.household?.EU.total ?? 0, data.household?.EU.dailyRate ?? 0, data.household?.measuredThrough ?? d.measuredThrough);
  const relief = FUELS.reduce((t, f) => t + eu(f).taxRelief + eu(f).stateCostFixedPrice, 0);

  const amounts: Record<Base, { value: number; label: string; note: string }> = {
    pump: { value: pump, label: "Paid at the pump", note: "extra petrol and diesel spending by Europeans" },
    shock: { value: pump + relief, label: "Including tax cuts", note: "pump spending plus what governments gave up in fuel-tax cuts" },
    energy: { value: pump + heating + household, label: "Whole energy bill", note: "fuels, heating oil and household gas and electricity" },
  };
  const bases: Base[] = data.household || data.heating ? ["pump", "shock", "energy"] : ["pump", "shock"];
  const amount = amounts[base].value;
  const days = Math.max(1, (Date.now() - new Date(d.warStartDate + "T00:00:00Z").getTime()) / 86_400_000);
  const perYear = (amount / days) * 365;

  if (!w) return null;
  const maxScale = Math.max(perYear, ...w.forScale.map((s) => s.perYear));

  return (
    <section className="section section-first" id="whatif">
      <p className="kicker">What if…?</p>
      <h2>What {euroShort(amount)} could have built instead</h2>
      <p className="lede">
        The war's energy bill is money that leaves Europe for oil and gas producers and buys nothing lasting.
        Here is what the same sum would pay for in the energy transition, which cuts exposure to the next shock.
      </p>

      <div className="metric-tabs" role="tablist" aria-label="Amount to compare">
        {bases.map((b) => (
          <button key={b} role="tab" aria-selected={base === b} className={base === b ? "is-active" : ""} onClick={() => setBase(b)}>
            {amounts[b].label}
          </button>
        ))}
      </div>
      <p className="hint">{euroShort(amount)}: {amounts[base].note}, since 28 February 2026.</p>

      <div className="whatif-grid">
        {w.items.map((it) => {
          const n = amount / it.unitCost;
          const big = it.id === "wind" ? gw(n) : count(n);
          return (
            <div key={it.id} className="whatif-tile">
              <span className="whatif-num" data-tabular>{big}</span>
              <span className="whatif-unit">{it.id === "wind" ? "of onshore wind" : it.unit}</span>
              <span className="stat-note">{it.detail}</span>
              {it.yield && (
                <span className="whatif-yield">
                  → about {twh(n * it.yield.perUnitMWhPerYear)} of clean electricity every year ({it.yield.assumption})
                </span>
              )}
              <span className="whatif-src">
                {it.range}. {it.url ? <a href={it.url} target="_blank" rel="noreferrer">{it.source}</a> : it.source}
              </span>
            </div>
          );
        })}
      </div>

      <h3 className="chart-title">For scale, per year</h3>
      <p className="chart-sub">The war's cost so far, scaled to a full year, next to what the EU spends and needs to spend on climate each year.</p>
      <div className="scale-bars">
        <div className="scale-row is-story">
          <span className="scale-label">This war, annualised <small>{amounts[base].label.toLowerCase()}</small></span>
          <span className="scale-track"><span className="scale-fill" style={{ width: `${(perYear / maxScale) * 100}%` }} /></span>
          <span className="scale-val" data-tabular>{euroShort(perYear)}</span>
        </div>
        {w.forScale.map((s) => (
          <div key={s.id} className="scale-row">
            <span className="scale-label">{s.label} <small><a href={s.url} target="_blank" rel="noreferrer">{s.source}</a></small></span>
            <span className="scale-track"><span className="scale-fill" style={{ width: `${(s.perYear / maxScale) * 100}%` }} /></span>
            <span className="scale-val" data-tabular>{euroShort(s.perYear)}</span>
          </div>
        ))}
      </div>
      <p className="chart-sub">
        These are different kinds of money. The war's cost is spending lost to higher prices. The others are investment and budget
        figures, shown for scale only. {w.forScale.map((s) => s.detail).join(". ")}. Unit costs are rounded mid-points of published ranges, as of {w.asOf}.
      </p>
    </section>
  );
}
