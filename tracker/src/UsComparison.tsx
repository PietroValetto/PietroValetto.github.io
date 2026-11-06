import { UsComparison as Us } from "./data";
import { euro, euroShort, longDate, pct } from "./format";

const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdShort = (v: number) => `$${(v / 1e9).toFixed(1)}B`;
const eurL = (v: number) => `+€${v.toFixed(2)}`;
const litres = (v: number) => `${new Intl.NumberFormat("en-IE").format(v)} L`;

export function UsComparison({ us }: { us: Us }) {
  const { eu } = us;
  const ratio = us.us.perHouseholdSamePeriodEUR / eu.perHouseholdEUR;
  const volRatio = us.us.fuels.petrol.litresPerHouseholdPerYear / eu.fuels.petrol.litresPerHouseholdPerYear;

  const rows: { label: string; eu: string; us: string; note?: string }[] = [
    { label: "Extra cost per household", eu: euro(eu.perHouseholdEUR), us: `${usd0.format(us.us.perHouseholdSamePeriodUSD)} (≈ ${euro(us.us.perHouseholdSamePeriodEUR)})`, note: `same period, to ${longDate(us.euAsOf)}` },
    { label: "Total extra cost", eu: euroShort(eu.totalExtraCostEUR), us: `${usdShort(us.us.totalSamePeriodUSD)} (≈ ${euroShort(us.us.totalSamePeriodUSD * us.eurPerUsd)})`, note: "petrol/gasoline + diesel" },
    { label: "Petrol pump price rise", eu: pct(eu.fuels.petrol.pctChange), us: pct(us.us.fuels.petrol.pctChange) },
    { label: "Diesel pump price rise", eu: pct(eu.fuels.diesel.pctChange), us: pct(us.us.fuels.diesel.pctChange) },
    { label: "Petrol rise per litre", eu: eurL(eu.fuels.petrol.increaseEURPerLitre), us: eurL(us.us.fuels.petrol.increaseEURPerLitre), note: "in euros" },
    { label: "Diesel rise per litre", eu: eurL(eu.fuels.diesel.increaseEURPerLitre), us: eurL(us.us.fuels.diesel.increaseEURPerLitre), note: "in euros" },
    { label: "Petrol used per household", eu: litres(eu.fuels.petrol.litresPerHouseholdPerYear), us: litres(us.us.fuels.petrol.litresPerHouseholdPerYear), note: "per year" },
    { label: "Diesel used per household", eu: litres(eu.fuels.diesel.litresPerHouseholdPerYear), us: litres(us.us.fuels.diesel.litresPerHouseholdPerYear), note: "per year, all uses" },
  ];

  return (
    <section className="section section-first" id="us">
      <p className="kicker">EU vs US</p>
      <h2>Same shock, very different bill</h2>
      <p className="lede">
        How Europe compares with the United States, using the US figures from Brown University's{" "}
        <a href={us.brownUrl} target="_blank" rel="noreferrer">Iran War Energy Cost Tracker</a>, recomputed with the same method over the same period.
      </p>

      <div className="vs">
        <div className="vs-side">
          <span className="stat-label">European Union</span>
          <span className="stat-value stat-value-xl" data-tabular>{euro(eu.perHouseholdEUR)}</span>
          <span className="stat-note">extra fuel cost per household</span>
        </div>
        <div className="vs-mid" aria-hidden="true">vs</div>
        <div className="vs-side">
          <span className="stat-label">United States</span>
          <span className="stat-value stat-value-xl" data-tabular>{euro(us.us.perHouseholdSamePeriodEUR)}</span>
          <span className="stat-note">{usd0.format(us.us.perHouseholdSamePeriodUSD)} per household</span>
        </div>
      </div>
      <p className="vs-takeaway">
        US households have paid <strong>{ratio.toFixed(1)}×</strong> as much. At the pump, the oil shock added about as much per litre on both sides of the Atlantic. The difference is how much fuel each household burns.
      </p>

      <table className="vs-table">
        <thead>
          <tr><th></th><th className="num">EU</th><th className="num">US</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <th scope="row">{r.label}{r.note && <small>{r.note}</small>}</th>
              <td className="num" data-tabular>{r.eu}</td>
              <td className="num" data-tabular>{r.us}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="chart-title">Why the gap</h3>
      <ol className="why">
        <li><strong>Americans burn far more petrol.</strong> A US household gets through about {volRatio.toFixed(0)}× as much petrol a year as a European one. Cars are bigger, distances are longer and public transport is thinner.</li>
        <li><strong>Europe's fuel taxes cushion the percentage, not the euros.</strong> Excise is a fixed amount per litre, so the same oil shock is a smaller share of a European pump price. VAT is a percentage, though, so it grows the rise in euros per litre.</li>
        <li><strong>Diesel is Europe's main exposure.</strong> Diesel is about 80% of the EU's extra cost, against under half in the US. That is because Europe's trucks, vans and many of its cars run on diesel.</li>
      </ol>

      <p className="cta">
        <a href={us.brownUrl} target="_blank" rel="noreferrer">See the US tracker by Brown University's Climate Solutions Lab →</a>
      </p>
      <p className="chart-sub">
        EU figures to the Oil Bulletin of {longDate(us.euAsOf)}. US figures recomputed from Brown's public data over the same period. Brown's own headline runs to {longDate(us.brownAsOf)}: {usdShort(us.us.totalExtraCostUSD)}, or {usd0.format(us.us.perHouseholdUSD)} per household.
        Converted at the ECB reference rate of {longDate(us.fxDate)} (€1 = ${(1 / us.eurPerUsd).toFixed(4)}). US households: {(us.us.households / 1e6).toFixed(0)}M (Brown); EU: {(eu.households / 1e6).toFixed(0)}M (Eurostat).
        {us.stale && " US data could not be refreshed this week; showing the last available figures."}
      </p>
    </section>
  );
}
