import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { AllData, Fuel, Scenario } from "./data";
import { perLitre, shortDate } from "./format";

interface Props { data: AllData; fuel: Fuel; scenario: Scenario; area: string; height?: number }

interface Row { date: string; actual: number; noWar?: number; gap?: [number, number] }

export function PriceChart({ data, fuel, scenario, area, height = 320 }: Props) {
  const rows = useMemo<Row[]>(() => {
    const cf = new Map(data.fuels[fuel].cf.series[area].map((p) => [p.date, scenario === "febAvg" ? p.priceFebAvg : p.price]));
    return data.fuels[fuel].ts.series[area].map((p) => {
      const n = cf.get(p.date);
      return n === undefined ? { date: p.date, actual: p.price } : { date: p.date, actual: p.price, noWar: n, gap: [n, p.price] };
    });
  }, [data, fuel, scenario, area]);

  const ticks = rows.filter((r) => r.date.endsWith("-01")).map((r) => r.date);
  const war = data.fuels[fuel].deficit.warStartDate;

  return (
    <div className="chart" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid-line)" />
          <XAxis dataKey="date" ticks={ticks} tickFormatter={(d) => shortDate(d).split(" ")[1]} tickLine={false}
            axisLine={{ stroke: "var(--axis-line)" }} tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
          <YAxis domain={["auto", "auto"]} tickFormatter={(v) => `€${v.toFixed(2)}`} width={52} tickLine={false} axisLine={false}
            tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
          <ReferenceLine x={war} stroke="var(--pe-rule-strong)" strokeDasharray="3 3"
            label={{ value: "War begins", position: "insideTopLeft", fill: "var(--text-secondary)", fontSize: 11 }} />
          <Area dataKey="gap" stroke="none" fill="var(--pe-amber-tint)" fillOpacity={1} isAnimationActive={false} activeDot={false} />
          <Line dataKey="noWar" stroke="var(--series-base)" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          <Line dataKey="actual" stroke="var(--series-story)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as Row;
              return (
                <div className="tip">
                  <div className="tip-date">{shortDate(String(label))}</div>
                  <div><i className="sw sw-story" /> Actual {perLitre(r.actual)}</div>
                  {r.noWar !== undefined && <div><i className="sw sw-base" /> No-war {perLitre(r.noWar)}</div>}
                  {r.noWar !== undefined && <div className="tip-gap">Gap {perLitre(r.actual - r.noWar)}/L</div>}
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChartLegend() {
  return (
    <p className="legend">
      <span><i className="sw sw-story" /> Actual pump price</span>
      <span><i className="sw sw-base sw-dash" /> No-war estimate</span>
      <span><i className="sw sw-gap" /> Extra cost per litre</span>
    </p>
  );
}
