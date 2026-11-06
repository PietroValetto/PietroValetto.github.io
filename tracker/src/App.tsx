import { useEffect, useState } from "react";
import { CountryMap } from "./CountryMap";
import { CountryPanel } from "./CountryPanel";
import { AllData, Fuel, Scenario, loadAll } from "./data";
import { FuelBreakdown } from "./FuelBreakdown";
import { Headline } from "./Headline";
import { Methodology } from "./Methodology";
import { longDate } from "./format";

const REPO_URL = "https://github.com/PietroValetto/eu-iran-war-fuel-cost";

const readHash = () => window.location.hash.replace("#", "").toUpperCase();

export default function App() {
  const [data, setData] = useState<AllData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fuel, setFuel] = useState<Fuel>("petrol");
  const [scenario, setScenario] = useState<Scenario>("lastBulletin");
  const [country, setCountry] = useState<string | null>(null);
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    loadAll().then(setData).catch((e) => setError(String(e)));
  }, []);

  // Country pages are shareable: /#IT opens Italy's breakdown.
  useEffect(() => {
    if (!data) return;
    const sync = () => {
      const c = readHash();
      setCountry(data.fuels.petrol.deficit.scenarios.lastBulletin.countries[c] ? c : null);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [data]);

  const openCountry = (c: string) => { window.location.hash = c; };
  const closeCountry = () => { history.replaceState(null, "", window.location.pathname + window.location.search); setCountry(null); };

  if (error) return <main className="page"><p className="lede">Could not load data: {error}</p></main>;
  if (!data) return <main className="page"><p className="lede">Loading Weekly Oil Bulletin data…</p></main>;

  const d = data.fuels.petrol.deficit;

  return (
    <main className="page">
      <header className="masthead">
        <a className="brand" href="https://populareconomics.substack.com/" target="_blank" rel="noreferrer">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={28} height={28} />
          <span>Popular Economics</span>
        </a>
      </header>

      <div className="title-row">
        <h1>EU Iran War Fuel Cost Tracker</h1>
        <button className="chip" onClick={() => setShowMethod(true)} aria-label="Open methodology explanation">Methodology</button>
      </div>
      <span className="amber-rule" aria-hidden="true" />
      <p className="intro">
        How much is the Iran war costing European drivers and businesses? We track the extra money spent on petrol and diesel
        in all 27 EU countries since the conflict began on <strong>28 February 2026</strong>. We use official weekly pump prices from the
        European Commission and compare them with what prices would normally have done. Fuel is only part of the war's cost, but
        it comes straight out of Europeans' pockets every day. For details, see the methodology.
      </p>

      <Headline data={data} scenario={scenario} fuel={fuel} onFuel={(f) => { setFuel(f); document.getElementById("breakdown")?.scrollIntoView({ behavior: "smooth" }); }} />
      <FuelBreakdown data={data} fuel={fuel} scenario={scenario} />
      <CountryMap data={data} fuel={fuel} scenario={scenario} onSelect={openCountry} />

      <footer className="status">
        <p>✓ EU Weekly Oil Bulletin: prices as of {longDate(d.endDate)} · {data.fuels.petrol.ts.bulletinDates.length} weekly bulletins since {longDate(data.fuels.petrol.ts.bulletinDates[0])}</p>
        <p>✓ Eurostat monthly oil deliveries (nrg_cb_oilm): updated {data.demand.eurostatUpdated?.slice(0, 10)} · 27 countries</p>
        <p>✓ Eurostat households: {data.households.areas.EU.householdsYear} · 27 countries</p>
        <p>Data rebuilt {new Date(data.meta.builtAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
        <p className="credit">
          A <a href="https://populareconomics.substack.com/" target="_blank" rel="noreferrer">Popular Economics</a> project. Method adapted from
          Brown University Climate Solutions Lab's <a href="https://iranwarcost.watson.brown.edu/" target="_blank" rel="noreferrer">Iran War Energy Cost Tracker</a>.
          Code and data on <a href={REPO_URL} target="_blank" rel="noreferrer">GitHub</a>.
        </p>
      </footer>

      {country && <CountryPanel data={data} code={country} fuel={fuel} scenario={scenario} onFuel={setFuel} onClose={closeCountry} />}
      {showMethod && <Methodology data={data} scenario={scenario} onScenario={setScenario} onClose={() => setShowMethod(false)} />}
    </main>
  );
}
