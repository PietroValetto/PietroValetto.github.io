import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Reads the tracker's committed data at build time (site/ is the cwd during `astro build`).
const DATA = resolve(process.cwd(), "../tracker/public/data");
const read = (f: string) => JSON.parse(readFileSync(resolve(DATA, f), "utf8"));

export interface TrackerSnapshot {
  measured: number;      // € measured to the latest Oil Bulletin, petrol + diesel
  dailyRate: number;     // € per day at the latest weekly rate, petrol + diesel
  measuredThrough: string; // ISO timestamp the measured figure runs to
  bulletinDate: string;  // date of the latest Oil Bulletin
  households: number;    // EU households
}

/** Same inputs as useLive() in tracker/src/Headline.tsx (lastBulletin scenario, EU aggregate). */
export function trackerSnapshot(): TrackerSnapshot {
  const fuels = ["petrol", "diesel"].map((f) => read(`${f}-deficit.json`));
  const eu = fuels.map((d) => d.scenarios.lastBulletin.EU);
  return {
    measured: eu.reduce((s, e) => s + e.totalExtraCost, 0),
    dailyRate: eu.reduce((s, e) => s + e.dailyRate, 0),
    measuredThrough: fuels[0].measuredThrough,
    bulletinDate: fuels[0].endDate,
    households: read("households.json").areas.EU.households,
  };
}
