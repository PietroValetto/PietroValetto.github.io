import { AllData, FUEL_LABEL, FUEL_SUB, Fuel, Scenario, entry } from "./data";
import { useLive } from "./Headline";
import { ChartLegend, PriceChart } from "./PriceChart";
import { euro, euro2, longDate, pct, perLitre, signed } from "./format";

interface Props { data: AllData; fuel: Fuel; scenario: Scenario }

export function FuelBreakdown({ data, fuel, scenario }: Props) {
  const d = data.fuels[fuel].deficit;
  const e = entry(data, fuel, scenario, "EU");
  const live = useLive(e.totalExtraCost, e.dailyRate, d.measuredThrough);
  const hh = data.households.areas.EU.households;
  const startLabel = scenario === "febAvg" ? "February 2026 average" : `Bulletin of ${longDate(d.lastPrewarBulletin)}`;

  return (
    <section className="section" id="breakdown">
      <p className="kicker">{FUEL_LABEL[fuel]} breakdown</p>
      <h2>Consumer cost since the war began</h2>
      <p className="lede">Extra spending by Europeans on {fuel} ({FUEL_SUB[fuel].toLowerCase()}) compared with a no-war price path.</p>

      <div className="stat-grid">
        <div className="stat stat-wide">
          <span className="stat-label">Total extra {fuel} cost paid by EU consumers</span>
          <span className="stat-value stat-value-xl" data-tabular>{euro(live)}</span>
          <span className="stat-note">~{(e.litresPerDayThisMonth / 1e6).toFixed(0)}M litres/day across the EU this month</span>
        </div>
        <div className="stat">
          <span className="stat-label">Per EU household</span>
          <span className="stat-value" data-tabular>{euro2(live / hh)}</span>
          <span className="stat-note">across ~{(hh / 1e6).toFixed(0)}M households</span>
        </div>
        <div className="stat">
          <span className="stat-label">Price at war start</span>
          <span className="stat-value" data-tabular>{perLitre(e.warStartPrice)}</span>
          <span className="stat-note">{startLabel}</span>
        </div>
        <div className="stat">
          <span className="stat-label">EU average now</span>
          <span className="stat-value" data-tabular>{perLitre(e.currentPrice)}</span>
          <span className="stat-note">per litre · bulletin of {longDate(d.endDate)}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Change since war start</span>
          <span className="stat-value up" data-tabular>{signed(e.priceIncrease)} /L</span>
          <span className="stat-note">{pct(e.pctChange)} over {d.daysSinceWar} days</span>
        </div>
      </div>

      <h3 className="chart-title">EU average price history</h3>
      <p className="chart-sub">Weekly Oil Bulletin, consumption-weighted EU average (€/litre, taxes included), interpolated daily · shaded area = extra cost vs. no-war estimate</p>
      <PriceChart data={data} fuel={fuel} scenario={scenario} area="EU" />
      <ChartLegend />
    </section>
  );
}
