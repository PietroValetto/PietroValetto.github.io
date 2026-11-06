import { useEffect, useRef } from "react";
import { AllData, Scenario, entry } from "./data";
import { euroShort, longDate, perLitre } from "./format";

interface Props { data: AllData; scenario: Scenario; onScenario: (s: Scenario) => void; onClose: () => void }

export function Methodology({ data, scenario, onScenario, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const d = data.fuels.petrol.deficit;
  const start = (f: "petrol" | "diesel", s: Scenario) => perLitre(entry(data, f, s, "EU").warStartPrice);
  const sens = data.meta.sensitivity;
  const sum = (k: string) => sens.petrol[k] + sens.diesel[k];

  return (
    <dialog ref={ref} className="panel" onClose={onClose} onClick={(ev) => ev.target === ref.current && onClose()} aria-labelledby="m-title">
      <div className="panel-inner prose">
        <button className="close" onClick={onClose} aria-label="Close">✕</button>
        <p className="kicker">How this is calculated</p>
        <h2 id="m-title">Methodology</h2>

        <h3>Overview</h3>
        <p>This tracker estimates the extra money Europeans have spent on petrol and diesel because of higher pump prices since the Iran war began on 28 February 2026. It compares actual prices in each EU member state with a "no-war" estimate of what prices would have been without the conflict. The method follows Brown University Climate Solutions Lab's <a href="https://iranwarcost.watson.brown.edu/" target="_blank" rel="noreferrer">Iran War Energy Cost Tracker</a> for the United States, adapted to European data.</p>

        <h3>Consumer cost calculation</h3>
        <p className="formula">Cost = Σ<sub>days</sub> (Actual price − No-war price) × Litres consumed</p>
        <p>The sum runs over every day from the war's start to the latest data. It follows the actual shape of the price path, and it allows for the fact that prices would have moved anyway. The EU total is the sum of the 27 member-state totals.</p>

        <h3>Prices: EU Weekly Oil Bulletin</h3>
        <p>Retail prices come from the European Commission's <a href="https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en" target="_blank" rel="noreferrer">Weekly Oil Bulletin</a>. It reports average pump prices, including all taxes, for Euro-super 95 petrol and automotive diesel in every member state. Prices are as of each Monday and published later that week, in euros (non-euro countries are converted by the Commission). The EU average is the Commission's consumption-weighted figure. Between bulletins, prices are interpolated linearly to give a daily series, as Brown does for missing days. The latest bulletin is <strong>{longDate(d.endDate)}</strong>.</p>
        <p><strong>The live counter.</strong> Because the bulletin is weekly, the cost is measured up to the latest bulletin. After that, the counter is extrapolated on your device's clock at the latest weekly rate (about {euroShort(entry(data, "petrol", scenario, "EU").dailyRate + entry(data, "diesel", scenario, "EU").dailyRate)} a day). The estimate is replaced by measured data when the next bulletin is published.</p>

        <h3>Consumption: Eurostat</h3>
        <p>Daily consumption differs by country and by calendar month. For each country and month we take the 2021–2025 average of Eurostat's monthly oil statistics (<code>nrg_cb_oilm</code>, gross inland deliveries), using <em>motor gasoline</em> for petrol and <em>road diesel</em> for diesel. Tonnes are converted to litres at 1,342 L/t for petrol and 1,195 L/t for diesel. Unlike US state data, Eurostat publishes these figures monthly for each country, so the seasonal pattern comes straight from the data and no seasonal coefficient is needed. Diesel covers road fuel only. Off-road gas oil (farming, heating, marine) is a separate product in Europe, with different prices and taxes, so it is excluded.</p>

        <h3>War-start price</h3>
        <p>Two baselines are available. They change every figure on the page:</p>
        <div className="toggle-row" role="radiogroup" aria-label="War-start price">
          <button role="radio" aria-checked={scenario === "lastBulletin"} className={scenario === "lastBulletin" ? "is-active" : ""} onClick={() => onScenario("lastBulletin")}>Last pre-war bulletin ({longDate(d.lastPrewarBulletin)})</button>
          <button role="radio" aria-checked={scenario === "febAvg"} className={scenario === "febAvg" ? "is-active" : ""} onClick={() => onScenario("febAvg")}>February 2026 average</button>
        </div>
        <table className="mini">
          <thead><tr><th>Method</th><th className="num">Petrol</th><th className="num">Diesel</th></tr></thead>
          <tbody>
            <tr><td>Last pre-war bulletin</td><td className="num">{start("petrol", "lastBulletin")}/L</td><td className="num">{start("diesel", "lastBulletin")}/L</td></tr>
            <tr><td>February 2026 average</td><td className="num">{start("petrol", "febAvg")}/L</td><td className="num">{start("diesel", "febAvg")}/L</td></tr>
          </tbody>
        </table>

        <h3>No-war counterfactual</h3>
        <p>There is no perfect way to estimate what prices would have been, because oil prices are volatile. Our no-war path starts from the war-start price and moves it by the normal seasonal pattern, and nothing else. Brown uses daily US spot prices for this. Europe has no free daily spot series, so we use the Oil Bulletin's EU-average price <em>before taxes</em> for 2021–2025, the same years Brown uses, and take the average week-on-week change for each week of the year. That change is applied to each country's pre-tax price. Excise duty is a fixed amount per litre, so it does not move with the oil price. VAT is then added back at the pre-war rate. The no-war world therefore keeps pre-war tax rates. Tax cuts made in response to the war (such as Spain's temporary VAT cut on fuel) show up in actual prices and so reduce the measured cost.</p>
        <p><strong>Sensitivity.</strong> The 2021–2025 window includes 2022, when prices jumped after Russia invaded Ukraine. That year raises the "normal" spring increase. Leaving 2022 out of the seasonal pattern gives a total of {euroShort(sum("excluding2022Seasonality"))} instead of {euroShort(sum("lastBulletin"))}. We keep 2021–2025 so the result can be compared with the US tracker.</p>

        <h3>Countries with fixed pump prices (Malta)</h3>
        <p>Malta's government sets its pump prices. The Oil Bulletin has shown the same price every week since June 2020: €1.340 for petrol and €1.210 for diesel. Applying the usual seasonal no-war path to a frozen price would produce a negative cost, as if Maltese drivers had saved money from the war. So any country whose price did not move at all in the year before the war is treated as fixed by the state, and its no-war price is held flat too. Malta therefore shows €0. That is correct for what this tracker measures, the extra paid at the pump. The war's cost there is carried by the state, which covers the gap between the fixed price and the market price, and that public cost is not included.</p>

        <h3>Per-household cost</h3>
        <p>The household cost is a country's (or the EU's) total divided by its number of private households, from Eurostat <code>lfst_hhnhtych</code> ({data.households.areas.EU.householdsYear}). The EU has about {(data.households.areas.EU.households / 1e6).toFixed(0)} million households. This is an average across households, including those without a car. Part of the diesel cost reaches households indirectly, through the price of goods moved by road.</p>

        <h3>Country map and rankings</h3>
        <p>Each country is coloured by the chosen measure. <em>Price change</em> is the current price minus the war-start price. <em>Total consumer cost</em> and <em>household cost</em> use the method above.</p>

        <h3>Code and data</h3>
        <p>The data pipeline and the site are open source. Every number on this page can be rebuilt from public sources with one command. The data refreshes automatically each week after the Oil Bulletin is published.</p>
      </div>
    </dialog>
  );
}
