const eur0 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num0 = new Intl.NumberFormat("en-IE", { maximumFractionDigits: 0 });

export const euro = (v: number) => eur0.format(v);
export const euro2 = (v: number) => eur2.format(v);
export const perLitre = (v: number) => `€${v.toFixed(3)}`;
export const count = (v: number) => num0.format(v);

/** €65.6B / €812M / €4,210 */
export function euroShort(v: number): string {
  const a = Math.abs(v), sign = v < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}€${(a / 1e9).toFixed(a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `${sign}€${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1)}M`;
  return eur0.format(v);
}

export const signed = (v: number, digits = 3) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}`;
export const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}%`;

export function longDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}
export function monthYear(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}
export function shortDate(iso: string): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}
