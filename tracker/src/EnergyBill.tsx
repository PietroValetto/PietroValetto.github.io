import { useState } from "react";
import { AllData, EnergyItem, FUELS, Scenario, entry } from "./data";
import { EuMap } from "./EuMap";
import { useLive } from "./Headline";
import { euro, euroShort, longDate, monthYear, pct } from "./format";

interface Part {
  key: string;
  label: string;
  covers: string;
  total: number;
  rate: number;
  since: string;            // measured-through timestamp for the live counter
  change: string;           // price change since the war started
  dataTo: string;
  cls: string;              // bar colour class
}

/** Per-country total extra energy cost (road fuels + heating oil + household utilities). */
export function energyByCountry(data: AllData, s: Scenario) {
  const out: Record<string, { total: number; parts: Record<string, number> }> = {};
  for (const c of Object.keys(data.fuels.petrol.deficit.scenarios[s].countries)) {
    const parts: Record<string, number> = {
      road: FUELS.reduce((t, f) => t + entry(data, f, s, c).totalExtraCost, 0),
      heating: data.heating?.deficit.scenarios[s].countries[c]?.totalExtraCost ?? 0,
      household: data.household?.countries[c]?.total ?? 0,
    };
    out[c] = { total: parts.road + parts.heating + parts.household, parts };
  }
  return out;
}

interface Props { data: AllData; scenario: Scenario; onSelect: (code: string) => void }

export function EnergyBill({ data, scenario, onSelect }: Props) {
  const [metric, setMetric] = useState<"total" | "perHousehold">("perHousehold");
  const [hover, setHover] = useState<string | null>(null);
  const fuelDef = data.fuels.petrol.deficit;
  const hh = data.household;
  const heat = data.heating?.deficit.scenarios[scenario].EU;
  const lastMonth = hh?.EU.lastMonth ?? "";

  const parts: Part[] = [
    {
      key: "road", label: "Petrol and diesel", covers: "all road users", cls: "seg-road",
      total: FUELS.reduce((t, f) => t + entry(data, f, scenario, "EU").totalExtraCost, 0),
      rate: FUELS.reduce((t, f) => t + entry(data, f, scenario, "EU").dailyRate, 0),
      since: fuelDef.measuredThrough,
      change: `${pct(entry(data, "petrol", scenario, "EU").pctChange)} / ${pct(entry(data, "diesel", scenario, "EU").pctChange)}`,
      dataTo: longDate(fuelDef.endDate),
    },
  ];
  if (heat) parts.push({
    key: "heating", label: "Heating oil and off-road gas oil", covers: "homes, farms, construction", cls: "seg-heating",
    total: heat.totalExtraCost, rate: heat.dailyRate, since: fuelDef.measuredThrough, change: pct(heat.pctChange),
    dataTo: longDate(fuelDef.endDate),
  });
  const itemCls: Record<EnergyItem, string> = { gas: "seg-gas", electricity: "seg-elec", solid: "seg-other", heat: "seg-other" };
  if (hh) (["gas", "electricity", "solid", "heat"] as EnergyItem[]).forEach((k) => {
    const it = hh.EU.items[k];
    if (!it) return;
    const rate = Object.values(hh.countries).reduce((t, c) => {
      const m = c.items[k]?.monthly;
      const last = m?.[m.length - 1];
      if (!last) return t;
      const [y, mo] = last.month.split("-").map(Number);
      return t + last.extra / new Date(y, mo, 0).getDate();
    }, 0);
    parts.push({
      key: k, label: `Household ${hh.itemLabels[k].toLowerCase()}`, covers: "households only", cls: itemCls[k],
      total: it.total, rate, since: hh.measuredThrough, change: it.pctChange !== undefined ? pct(it.pctChange) : "–",
      dataTo: monthYear(lastMonth + "-01"),
    });
  });

  // One live counter per part, each extrapolated from its own data date on the visitor's clock.
  const live = parts.map((p) => useLive(p.total, p.rate, p.since)); // eslint-disable-line react-hooks/rules-of-hooks
  const total = live.reduce((a, b) => a + b, 0);
  const households = data.households.areas.EU.households;
  const positive = parts.map((p, i) => ({ ...p, live: live[i] })).filter((p) => p.live > 0);
  const elec = parts.find((p) => p.key === "electricity");

  const byCountry = energyByCountry(data, scenario);
  const name = (c: string) => data.households.areas[c]?.name ?? c;
  const value = (c: string) => (metric === "total" ? byCountry[c].total : byCountry[c].total / data.households.areas[c].households);
  const fmt = metric === "total" ? euroShort : euro;
  const ranked = Object.keys(byCountry).sort((a, b) => value(b) - value(a));

  return (
    <section className="section section-first" id="energy">
      <p className="kicker">Total extra energy cost since the war began</p>
      <p className="big-number" data-tabular>{euro(total)}</p>
      <p className="big-sub">
        Fuels at the pump, heating oil and household gas and electricity bills across the EU. That's{" "}
        <strong>{euro(total / households)}</strong> per household. Estimated in real time from each source's latest data.
      </p>

      <div className="energy-bar" role="img" aria-label="Extra energy cost by type">
        {positive.map((p) => (
          <span key={p.key} className={`energy-seg ${p.cls}`} style={{ flexGrow: p.live }} title={`${p.label}: ${euroShort(p.live)}`}>
            {p.live / total > 0.08 && <><b>{euroShort(p.live)}</b>{p.label}</>}
          </span>
        ))}
      </div>

      <table className="vs-table energy-table">
        <thead>
          <tr><th>Energy</th><th className="num">Extra cost</th><th className="num">Price change</th><th className="num hide-sm">Data to</th></tr>
        </thead>
        <tbody>
          {parts.map((p, i) => (
            <tr key={p.key}>
              <th scope="row"><i className={`dot ${p.cls}`} />{p.label}<small>{p.covers}</small></th>
              <td className="num" data-tabular>{euroShort(live[i])}</td>
              <td className="num" data-tabular>{p.change}</td>
              <td className="num hide-sm">{p.dataTo}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {hh && (
        <p className="split-note">
          <strong>Household bills have barely moved yet.</strong> Pump prices react within days, but most homes buy gas and
          electricity on regulated tariffs or fixed-price contracts that reprice months later. EU household gas prices are
          up {pct(hh.EU.items.gas?.pctChange ?? 0)} since February
          {elec && elec.total < 0 ? <>, and electricity has cost households slightly <em>less</em> so far ({euroShort(elec.total)}), mainly because prices fell in Germany and Spain</> : null}.
          The bigger bills are likely still to come when contracts renew.
        </p>
      )}

      <h3 className="chart-title">By country</h3>
      <div className="metric-tabs" role="tablist" aria-label="Energy map metric">
        <button role="tab" aria-selected={metric === "perHousehold"} className={metric === "perHousehold" ? "is-active" : ""} onClick={() => setMetric("perHousehold")}>Per household</button>
        <button role="tab" aria-selected={metric === "total"} className={metric === "total" ? "is-active" : ""} onClick={() => setMetric("total")}>Total</button>
      </div>
      <div className="map-layout">
        <EuMap values={Object.fromEntries(Object.keys(byCountry).map((c) => [c, value(c)]))} label="extra energy cost"
          fmt={fmt} short={fmt} name={name} hover={hover} setHover={setHover} onSelect={onSelect} />
        <div className="rank">
          <table>
            <thead><tr><th>#</th><th>Country</th><th className="num">{metric === "total" ? "Total" : "Per household"}</th></tr></thead>
            <tbody>
              {ranked.map((c, i) => (
                <tr key={c} className={hover === c ? "is-hover" : ""} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)}>
                  <td className="muted" data-tabular>{i + 1}</td>
                  <td><button className="link" onClick={() => onSelect(c)}>{name(c)}</button></td>
                  <td className="num" data-tabular>{fmt(value(c))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.heating && (
            <p className="table-note">
              No heating-oil prices in the Oil Bulletin for {data.heating.deficit.scenarios[scenario].EU.countriesWithoutPrices?.map(name).join(", ")}, so their heating oil isn't counted.
            </p>
          )}
        </div>
      </div>
      <p className="chart-sub">
        Fuels and heating oil: EU Weekly Oil Bulletin with Eurostat volumes, same method as the Fuel tab. Household energy: Eurostat consumer
        price indices (HICP) for each item against February 2026 prices, applied to household spending on that item.
        See the methodology.
      </p>
    </section>
  );
}
