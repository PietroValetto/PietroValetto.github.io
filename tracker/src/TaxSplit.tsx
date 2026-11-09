import { AllData, Entry, FUELS, FUEL_LABEL, Fuel, Scenario, TaxChange, entry } from "./data";
import { euroShort, shortDate } from "./format";

const sumFuels = (data: AllData, s: Scenario, area: string, k: keyof Entry) =>
  FUELS.reduce((t, f) => t + (entry(data, f, s, area)[k] as number), 0);

/** Plain-language list of tax measures for one country, merging petrol/diesel changes made on the same day. */
export function taxMeasures(data: AllData, s: Scenario, code: string): string[] {
  const byKey = new Map<string, { date: string; text: string; fuels: Fuel[] }>();
  for (const f of FUELS) {
    const tc = entry(data, f, s, code).taxChanges;
    if (!tc) continue;
    const add = (kind: "VAT" | "Duty", c: TaxChange, text: string) => {
      const key = `${c.date}|${kind}|${text}`;
      const cur = byKey.get(key);
      if (cur) cur.fuels.push(f);
      else byKey.set(key, { date: c.date, text, fuels: [f] });
    };
    // Describe each change against the pre-war rate (the first change's starting point), so a partial
    // reversal of a cut reads as "partly restored", not as a tax rise.
    const describe = (changes: TaxChange[], fmt: (v: number) => string, label: string, kind: "VAT" | "Duty") => {
      const prewar = changes[0]?.from;
      changes.forEach((c) => {
        const verb = c.to < c.from
          ? "cut"
          : Math.abs(c.to - prewar) < 1e-9 ? "restored" : c.to < prewar ? "partly restored" : "raised";
        add(kind, c, `${label} ${verb}, ${fmt(c.from)} → ${fmt(c.to)}`);
      });
    };
    describe(tc.vat, (v) => `${v}%`, "VAT", "VAT");
    const cur = tc.exciseCurrency === "EUR" ? "€" : `${tc.exciseCurrency} `;
    describe(tc.excise, (v) => `${cur}${(v / 1000).toFixed(3)}/L`, "fuel duty", "Duty");
  }
  return [...byKey.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => `${shortDate(m.date)}: ${m.text}${m.fuels.length === 1 ? ` (${FUEL_LABEL[m.fuels[0]].toLowerCase()})` : ""}`);
}

interface Props { data: AllData; scenario: Scenario; onSelect: (code: string) => void }

export function TaxSplit({ data, scenario, onSelect }: Props) {
  const consumers = sumFuels(data, scenario, "EU", "totalExtraCost");
  const relief = sumFuels(data, scenario, "EU", "taxRelief") + sumFuels(data, scenario, "EU", "stateCostFixedPrice");
  const windfall = sumFuels(data, scenario, "EU", "vatWindfall");
  const total = consumers + relief;
  const net = relief - windfall;

  const countries = Object.keys(data.fuels.petrol.deficit.scenarios[scenario].countries);
  const top = countries
    .map((c) => ({ c, relief: sumFuels(data, scenario, c, "taxRelief") + sumFuels(data, scenario, c, "stateCostFixedPrice") }))
    .filter((x) => x.relief > 1e6)
    .sort((a, b) => b.relief - a.relief)
    .slice(0, 6);
  const name = (c: string) => data.households.areas[c]?.name ?? c;

  const verdict = Math.abs(net) < 0.15 * windfall
    ? "so overall the tax cuts roughly handed that windfall back"
    : net > 0
      ? `so governments gave back ${euroShort(net)} more than the price rise added to their VAT take`
      : `so governments kept ${euroShort(-net)} more than they gave back`;

  return (
    <section className="section" id="who-pays">
      <p className="kicker">Who carries the shock</p>
      <h2>Governments absorbed {euroShort(relief)} through tax cuts</h2>
      <p className="lede">
        Without the fuel-tax cuts many countries made after the war began, Europeans would have paid {euroShort(total)} at the pump, not {euroShort(consumers)}.
      </p>

      <div className="split-bar" role="img" aria-label={`Consumers ${euroShort(consumers)}, governments ${euroShort(relief)}`}>
        <span className="split-seg split-consumers" style={{ flexGrow: consumers }}>
          <b>{euroShort(consumers)}</b> paid by consumers
        </span>
        <span className="split-seg split-gov" style={{ flexGrow: relief }}>
          <b>{euroShort(relief)}</b> tax cuts
        </span>
      </div>
      <p className="split-note">
        Governments also collected <strong>{euroShort(windfall)}</strong> of extra VAT on the higher pre-tax prices, {verdict}.
      </p>

      <h3 className="chart-title">Largest tax cuts</h3>
      <table className="relief-table">
        <tbody>
          {top.map(({ c, relief: r }) => {
            const measures = taxMeasures(data, scenario, c);
            return (
              <tr key={c}>
                <th scope="row"><button className="link" onClick={() => onSelect(c)}>{name(c)}</button></th>
                <td className="num" data-tabular>{euroShort(r)}</td>
                <td className="measures">{measures.length ? measures.slice(0, 3).join(" · ") + (measures.length > 3 ? ` · +${measures.length - 3} more` : "") : "Fixed pump prices (state absorbs the gap)"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="chart-sub">
        Tax cuts = what consumers would have paid had excise duty and VAT stayed at pre-war levels, minus what they actually paid.
        Measures from the Oil Bulletin's tax tables. Duty rates are per litre in national currency.
      </p>
    </section>
  );
}
