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
  taxRelief: number;
  vatWindfall: number;
  stateCostFixedPrice: number;
  totalShock: number;
  reliefPerLitreNow: number;
  countriesWithoutPrices?: string[];
  noPriceData?: boolean;
  taxChanges?: { vat: TaxChange[]; excise: TaxChange[]; exciseCurrency: string };
  rank?: Record<string, number>;
}

export interface TaxChange { date: string; from: number; to: number }

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
  areas: Record<string, { households: number; population: number; householdsYear: number; name: string; cars?: number; carsYear?: number }>;
}
export interface Meta { builtAt: string; latestBulletin: string; sensitivity: Record<Fuel, Record<string, number>> }
export interface Demand { eurostatUpdated: string; gaps: string[] }

export interface UsFuel {
  totalExtraCostUSD: number;
  totalSamePeriodUSD: number;
  warStartPriceUSDPerGallon: number;
  currentPriceUSDPerGallon: number;
  pctChange: number;
  increaseEURPerLitre: number;
  litresPerHouseholdPerYear: number;
}
export interface UsComparison {
  stale: boolean;
  brownUrl: string;
  brownAsOf: string;
  euAsOf: string;
  eurPerUsd: number;
  fxDate: string;
  us: {
    households: number;
    fuels: Record<Fuel, UsFuel>;
    totalExtraCostUSD: number;
    totalSamePeriodUSD: number;
    perHouseholdUSD: number;
    perHouseholdSamePeriodUSD: number;
    perHouseholdSamePeriodEUR: number;
  };
  eu: {
    households: number;
    totalExtraCostEUR: number;
    perHouseholdEUR: number;
    fuels: Record<Fuel, { pctChange: number; increaseEURPerLitre: number; litresPerHouseholdPerYear: number }>;
  };
}

export type EnergyItem = "electricity" | "gas" | "solid" | "heat";
export interface HouseholdItem {
  total: number;
  pctChange?: number;
  weightPerMille?: number;
  monthlySpend?: number;
  monthly?: { month: string; index: number; extra: number }[];
}
export interface HouseholdArea { items: Partial<Record<EnergyItem, HouseholdItem>>; total: number; dailyRate: number; lastMonth: string | null }
export interface HouseholdEnergy {
  baseMonth: string;
  measuredThrough: string;
  itemLabels: Record<EnergyItem, string>;
  EU: HouseholdArea & { laggingCountries: string[] };
  countries: Record<string, HouseholdArea>;
}

export interface FuelData { ts: TimeSeries; cf: Counterfactual; current: Current; deficit: Deficit }
export interface AllData {
  fuels: Record<Fuel, FuelData>;
  households: Households;
  meta: Meta;
  demand: Demand;
  us: UsComparison | null;
  heating: FuelData | null;            // heating & off-road gas oil: Energy tab only, not in the fuel headline
  household: HouseholdEnergy | null;   // household electricity, gas, solid fuels, district heat
}

const get = <T,>(name: string): Promise<T> =>
  fetch(`${import.meta.env.BASE_URL}data/${name}.json`).then((r) => {
    if (!r.ok) throw new Error(`${name}: ${r.status}`);
    return r.json() as Promise<T>;
  });

export async function loadAll(): Promise<AllData> {
  const fuel = async (f: Fuel | "heating"): Promise<FuelData> => {
    const [ts, cf, current, deficit] = await Promise.all([
      get<TimeSeries>(`${f}-time-series`),
      get<Counterfactual>(`${f}-counterfactual`),
      get<Current>(`${f}-current`),
      get<Deficit>(`${f}-deficit`),
    ]);
    return { ts, cf, current, deficit };
  };
  const [petrol, diesel, households, meta, demand, us, heating, household] = await Promise.all([
    fuel("petrol"), fuel("diesel"), get<Households>("households"), get<Meta>("meta"), get<Demand>("monthly-demand"),
    // Optional extras: their tabs hide if a file is missing.
    get<UsComparison>("us-comparison").catch(() => null),
    fuel("heating").catch(() => null),
    get<HouseholdEnergy>("household-energy").catch(() => null),
  ]);
  return { fuels: { petrol, diesel }, households, meta, demand, us, heating, household };
}

export const entry = (d: AllData, f: Fuel, s: Scenario, area: string): Entry =>
  area === "EU" ? d.fuels[f].deficit.scenarios[s].EU : d.fuels[f].deficit.scenarios[s].countries[area];

export const areaName = (d: AllData, area: string) => d.households.areas[area]?.name ?? area;
