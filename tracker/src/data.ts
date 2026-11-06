export type Fuel = "petrol" | "diesel";
export type Scenario = "lastBulletin" | "febAvg";
export const FUELS: Fuel[] = ["petrol", "diesel"];
export const FUEL_LABEL: Record<Fuel, string> = { petrol: "Petrol", diesel: "Diesel" };
export const FUEL_SUB: Record<Fuel, string> = { petrol: "Euro-super 95", diesel: "Road diesel" };

export interface Entry {
  warStartPrice: number;
  currentPrice: number;
  priceIncrease: number;
  pctChange: number;
  noWarPriceToday: number;
  litresPerDayThisMonth: number;
  totalExtraCost: number;
  perHouseholdCost: number;
  dailyRate: number;
  households: number;
  administeredPrice?: boolean;
  administeredSince?: string | null;
  rank?: Record<string, number>;
}

export interface Deficit {
  warStartDate: string;
  lastPrewarBulletin: string;
  febBulletins: string[];
  endDate: string;
  measuredThrough: string;
  daysSinceWar: number;
  scenarios: Record<Scenario, { EU: Entry; countries: Record<string, Entry> }>;
}

export interface Point { date: string; price: number }
export interface CfPoint extends Point { priceFebAvg: number }
export interface TimeSeries { lastUpdated: string; bulletinDates: string[]; series: Record<string, Point[]> }
export interface Counterfactual { endDate: string; series: Record<string, CfPoint[]> }
export interface Current {
  bulletinDate: string;
  euAvg: number;
  prevWeekAvg: number;
  countries: { code: string; name: string; price: number; prevWeek: number; warStart: number; warStartFebAvg: number }[];
}
export interface Households {
  source: string;
  areas: Record<string, { households: number; population: number; householdsYear: number; name: string }>;
}
export interface Meta { builtAt: string; latestBulletin: string; sensitivity: Record<Fuel, Record<string, number>> }
export interface Demand { eurostatUpdated: string; gaps: string[] }

export interface FuelData { ts: TimeSeries; cf: Counterfactual; current: Current; deficit: Deficit }
export interface AllData { fuels: Record<Fuel, FuelData>; households: Households; meta: Meta; demand: Demand }

const get = <T,>(name: string): Promise<T> =>
  fetch(`${import.meta.env.BASE_URL}data/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return r.json() as Promise<T>;
  });

export async function loadAll(): Promise<AllData> {
  const fuel = async (f: Fuel): Promise<FuelData> => {
    const [ts, cf, current, deficit] = await Promise.all([
      get<TimeSeries>(`${f}-time-series`),
      get<Counterfactual>(`${f}-counterfactual`),
      get<Current>(`${f}-current`),
      get<Deficit>(`${f}-deficit`),
    ]);
    return { ts, cf, current, deficit };
  };
  const [petrol, diesel, households, meta, demand] = await Promise.all([
    fuel("petrol"), fuel("diesel"), get<Households>("households"), get<Meta>("meta"), get<Demand>("monthly-demand"),
  ]);
  return { fuels: { petrol, diesel }, households, meta, demand };
}

export const entry = (d: AllData, f: Fuel, s: Scenario, area: string): Entry =>
  area === "EU" ? d.fuels[f].deficit.scenarios[s].EU : d.fuels[f].deficit.scenarios[s].countries[area];

export const areaName = (d: AllData, area: string) => d.households.areas[area]?.name ?? area;
