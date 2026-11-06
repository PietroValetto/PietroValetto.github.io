import { useRef } from "react";
import { useModal } from "./useModal";
import { taxMeasures } from "./TaxSplit";
import { energyByCountry } from "./EnergyBill";
import { AllData, FUELS, FUEL_LABEL, FUEL_SUB, Fuel, Scenario, entry } from "./data";
import { useLive } from "./Headline";
import { ChartLegend, PriceChart } from "./PriceChart";
import { euro, euro2, euroShort, longDate, monthYear, pct, perLitre, signed } from "./format";

interface Props {
  data: AllData;
  code: string;
  fuel: Fuel;
  scenario: Scenario;
  onFuel: (f: Fuel) => void;
  onClose: () => void;
}

export function CountryPanel({ data, code, fuel, scenario, onFuel, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const d = data.fuels.petrol.deficit;
  const area = data.households.areas[code];
  const e = (f: Fuel) => entry(data, f, scenario, code);
  const lp = useLive(e("petrol").totalExtraCost, e("petrol").dailyRate, d.measuredThrough);
  const ld = useLive(e("diesel").totalExtraCost, e("diesel").dailyRate, d.measuredThrough);
  const live: Record<Fuel, number> = { petrol: lp, diesel: ld };
  const total = lp + ld;

  const { close, onBackdrop } = useModal(ref, onClose);

  return (
    <dialog ref={ref} className="panel" onClick={onBackdrop} aria-labelledby="panel-title">
      <div className="panel-inner">
        <button className="close" onClick={close} aria-label="Close">✕</button>
        <p className="kicker">Country breakdown</p>
        <h2 id="panel-title">{area.name}</h2>

        <div className="panel-total">
          <span className="stat-label">Total extra fuel cost since the war began</span>
          <span className="stat-value stat-value-xl" data-tabular>{euro(total)}</span>
          <span className="stat-note" data-tabular>
            <strong>{euro2(total / area.households)}</strong> per household · {(area.households / 1e6).toFixed(1)}M households ({area.householdsYear})
          </span>
        </div>

        {e("petrol").administeredPrice && (
          <p className="takeaway">
            <strong>Why {euro(0)}?</strong> {area.name}'s pump prices are set by the state. Petrol has been {perLitre(e("petrol").currentPrice)} and
            diesel {perLitre(e("diesel").currentPrice)} a litre in every EU Oil Bulletin since {monthYear(e("petrol").administeredSince ?? d.endDate)}, including
            the 2022 energy crisis and this war. Drivers pay nothing extra at the pump. The war's cost hasn't disappeared, though: it falls
            on the state, which covers the gap between the fixed price and the market price. This tracker measures only what consumers
            pay at the pump, so that public cost isn't counted here.
          </p>
        )}

        <div className="fuel-tiles">
          {FUELS.map((f) => {
            const x = e(f);
            return (
              <button key={f} className={`fuel-tile ${fuel === f ? "is-active" : ""}`} onClick={() => onFuel(f)} aria-pressed={fuel === f}>
                <span className="fuel-tile-name">{FUEL_LABEL[f]} <small>{FUEL_SUB[f]}</small></span>
                <span className="fuel-tile-prices" data-tabular>
                  {perLitre(x.warStartPrice)} → {perLitre(x.currentPrice)} <b className="up">▲ {pct(x.pctChange)}</b>
                </span>
                <span className="fuel-tile-value" data-tabular>{euroShort(live[f])}</span>
              </button>
            );
          })}
        </div>

        <div className="stat-grid stat-grid-tight">
          <div className="stat">
            <span className="stat-label">{FUEL_LABEL[fuel]} now</span>
            <span className="stat-value" data-tabular>{perLitre(e(fuel).currentPrice)}</span>
            <span className="stat-note">bulletin of {longDate(d.endDate)}</span>
          </div>
          <div className="stat">
            <span className="stat-label">No-war estimate</span>
            <span className="stat-value" data-tabular>{perLitre(e(fuel).noWarPriceToday)}</span>
            <span className="stat-note">gap {signed(e(fuel).currentPrice - e(fuel).noWarPriceToday)} /L</span>
          </div>
          <div className="stat">
            <span className="stat-label">{FUEL_LABEL[fuel]} per household</span>
            <span className="stat-value" data-tabular>{euro2(live[fuel] / area.households)}</span>
            <span className="stat-note">rank {e(fuel).rank?.perHouseholdCost} of 27</span>
          </div>
          <div className="stat">
            <span className="stat-label">Consumption</span>
            <span className="stat-value" data-tabular>{(e(fuel).litresPerDayThisMonth / 1e6).toFixed(1)}M</span>
            <span className="stat-note">litres/day this month</span>
          </div>
        </div>

        {(data.household || data.heating) && (() => {
          const en = energyByCountry(data, scenario)[code];
          return (
            <p className="stat-note panel-energy" data-tabular>
              Including heating oil ({euroShort(en.parts.heating)}) and household gas and electricity ({euroShort(en.parts.household)}),
              the war has added <strong>{euroShort(en.total)}</strong> to energy costs here, or <strong>{euro(en.total / area.households)}</strong> per household.
            </p>
          );
        })()}

        {(() => {
          const relief = FUELS.reduce((t, f) => t + e(f).taxRelief + e(f).stateCostFixedPrice, 0);
          const windfall = FUELS.reduce((t, f) => t + e(f).vatWindfall, 0);
          const measures = taxMeasures(data, scenario, code);
          return (
            <div className="panel-tax">
              <h3 className="chart-title">Tax measures</h3>
              <p className="stat-note" data-tabular>
                {relief > 1e5
                  ? <>Tax cuts absorbed <strong>{euroShort(relief)}</strong> of the shock{e("petrol").administeredPrice ? " (estimated cost of keeping prices fixed)" : ""}. </>
                  : <>No fuel-tax cuts since the war began. </>}
                {windfall > 1e5 && <>The government collected about <strong>{euroShort(windfall)}</strong> in extra VAT on higher prices.</>}
              </p>
              {measures.length > 0 && <ul className="measures-list">{measures.map((m) => <li key={m}>{m}</li>)}</ul>}
            </div>
          );
        })()}

        <h3 className="chart-title">{FUEL_LABEL[fuel]} price history · {area.name}</h3>
        <PriceChart data={data} fuel={fuel} scenario={scenario} area={code} height={260} />
        <ChartLegend />
      </div>
    </dialog>
  );
}
