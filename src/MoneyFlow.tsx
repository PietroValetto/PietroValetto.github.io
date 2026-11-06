import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AllData, FUELS, FUEL_LABEL, Fuel, Scenario, entry } from "./data";
import { euro, euroShort, longDate, shortDate } from "./format";

const PARTS = [
  { key: "upstreamCrude", flow: "crude", label: "Crude oil producers", sub: "upstream, mostly outside the EU", cls: "flow-crude", color: "var(--pe-amber)" },
  { key: "downstreamMargin", flow: "margin", label: "Refiners and distributors", sub: "downstream margins, partly inside the EU", cls: "flow-margin", color: "var(--pe-green)" },
] as const;

const cents = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1)}¢`;

/** Who received the extra money Europeans paid at the pump. */
export function MoneyFlow({ data, fuel, scenario }: { data: AllData; fuel: Fuel; scenario: Scenario }) {
  const sum = (k: "upstreamCrude" | "downstreamMargin" | "taxNet" | "totalExtraCost") =>
    FUELS.reduce((t, f) => t + entry(data, f, scenario, "EU")[k], 0);
  const total = sum("totalExtraCost");
  const taxes = sum("taxNet");
  const pretaxRise = sum("upstreamCrude") + sum("downstreamMargin");
  const series = data.fuels[fuel].deficit.flowSeries;
  const now = entry(data, fuel, scenario, "EU").perLitreNow;
  const cc = data.meta.crossCheckFlatBaseline;
  const te = FUELS.reduce((t, f) => t + cc[f].pretaxPremiumToTE, 0);
  const teDown = FUELS.reduce((t, f) => t + cc[f].downstreamToTE, 0);

  return (
    <section className="section" id="money">
      <p className="kicker">Where the money went</p>
      <h2>{euroShort(sum("downstreamMargin"))} went to refiners and fuel distributors</h2>
      <p className="lede">
        Every extra euro paid at the pump went somewhere. Part paid for dearer crude oil, part widened refining and distribution
        margins, and the rest changed the tax take. Margins are the share an EU windfall tax could reach.
      </p>

      <div className="flow-bar" role="img" aria-label="Split of the extra cost">
        {PARTS.map((p) => {
          const v = sum(p.key);
          return (
            <span key={p.key} className={`flow-seg ${p.cls}`} style={{ flexGrow: Math.max(v, 0) }}>
              <b data-tabular>{euroShort(v)}</b>{p.label}
            </span>
          );
        })}
      </div>
      <div className="stat-grid flow-grid">
        {PARTS.map((p) => {
          const v = sum(p.key);
          return (
            <div key={p.key} className="stat">
              <span className="stat-label"><i className={`dot ${p.cls}`} />{p.label}</span>
              <span className="stat-value" data-tabular>{euroShort(v)}</span>
              <span className="stat-note">{p.sub} · {Math.round((v / pretaxRise) * 100)}% of the rise before taxes</span>
            </div>
          );
        })}
        <div className="stat">
          <span className="stat-label"><i className="dot flow-tax" />Governments, net</span>
          <span className="stat-value" data-tabular>{euroShort(taxes)}</span>
          <span className="stat-note">extra VAT on higher prices, minus fuel-tax cuts</span>
        </div>
      </div>

      <h3 className="chart-title">{FUEL_LABEL[fuel]}: what each extra litre paid for</h3>
      <p className="chart-sub">
        Extra cost per litre versus the no-war price, EU average, each weekly Oil Bulletin. Today: crude {cents(now.crude)},
        margins {cents(now.margin)}, taxes {cents(now.taxes)}.
      </p>
      <div className="chart" style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} stackOffset="sign" barCategoryGap="12%">
            <CartesianGrid vertical={false} stroke="var(--grid-line)" />
            <XAxis dataKey="date" tickFormatter={(d) => shortDate(d)} minTickGap={40} tickLine={false}
              axisLine={{ stroke: "var(--axis-line)" }} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
            <YAxis tickFormatter={(v) => `${Math.round(v * 100)}¢`} width={44} tickLine={false} axisLine={false}
              tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
            <ReferenceLine y={0} stroke="var(--axis-line)" />
            <Bar dataKey="crude" stackId="a" fill="var(--pe-amber)" isAnimationActive={false} />
            <Bar dataKey="margin" stackId="a" fill="var(--pe-green)" isAnimationActive={false} />
            <Bar dataKey="taxes" stackId="a" fill="var(--pe-ink-soft)" fillOpacity={0.55} isAnimationActive={false} />
            <Tooltip content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as { crude: number; margin: number; taxes: number };
              return (
                <div className="tip">
                  <div className="tip-date">{shortDate(String(label))}</div>
                  <div><i className="sw flow-crude" /> Crude {cents(r.crude)}/L</div>
                  <div><i className="sw flow-margin" /> Margins {cents(r.margin)}/L</div>
                  <div><i className="sw flow-tax" /> Taxes {cents(r.taxes)}/L</div>
                </div>
              );
            }} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="legend">
        <span><i className="sw flow-crude" /> Crude oil</span>
        <span><i className="sw flow-margin" /> Refining and distribution margins</span>
        <span><i className="sw flow-tax" /> Taxes (VAT minus tax cuts)</span>
      </p>
      <p className="chart-sub">
        Crude: Brent spot price (EIA) in euros, converted to the crude content of a litre of fuel. Method follows{" "}
        <a href="https://www.transportenvironment.org/" target="_blank" rel="noreferrer">Transport &amp; Environment</a>'s excess-profits
        tracker. Cross-check: on T&amp;E's own approach (flat January–February baseline), our data give {euroShort(te)} to{" "}
        {longDate(cc.diesel.comparisonEnd)}, of which {euroShort(teDown)} in margins. T&amp;E report about €63.7 billion. Part of the gap
        is volumes (they use 2025 sales excluding biofuels, worth about €6 billion here); the rest is their later start date and
        more conservative weekly interpolation. Figures to {longDate(data.fuels.petrol.deficit.endDate)}; total extra cost {euro(total)}.
      </p>
    </section>
  );
}

/** What the extra cost means for one tank, one car and one truck. */
export function PeopleRow({ data }: { data: AllData }) {
  const p = data.people;
  if (!p) return null;
  const a = p.assumptions;
  const tiles = [
    { v: euro(p.tank.diesel), label: "Extra per 50-litre diesel tank", note: `petrol: ${euro(p.tank.petrol)} · prices of ${longDate(p.asOf)}` },
    { v: euro(p.carSinceWar.diesel), label: "Extra per diesel car since the war began", note: `petrol car: ${euro(p.carSinceWar.petrol)} · ${a.carKmPerYear.toLocaleString("en-IE")} km a year` },
    { v: euro(p.truckSinceWar), label: "Extra per long-haul truck", note: `about ${euro(p.truckPerWeek)} a week · ${a.truckKmPerYear.toLocaleString("en-IE")} km a year, excluding VAT` },
  ];
  return (
    <div className="stat-grid people-grid">
      {tiles.map((t) => (
        <div key={t.label} className="stat">
          <span className="stat-label">{t.label}</span>
          <span className="stat-value" data-tabular>{t.v}</span>
          <span className="stat-note">{t.note}</span>
        </div>
      ))}
    </div>
  );
}
