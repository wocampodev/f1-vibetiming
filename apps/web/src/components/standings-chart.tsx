"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface StandingsChartProps {
  data: Array<{
    name: string;
    points: number;
  }>;
}

export function StandingsChart({ data }: StandingsChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-[var(--muted)]">No chart data yet.</p>;
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 12,
            right: 8,
            left: 0,
            bottom: 36,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(17, 19, 24, 0.12)" />
          <XAxis
            dataKey="name"
            angle={-35}
            textAnchor="end"
            interval={0}
            tick={{ fontSize: 12 }}
          />
          <YAxis tick={{ fontSize: 12 }} width={36} />
          <Tooltip
            contentStyle={{
              borderRadius: "0.75rem",
              borderColor: "rgba(17, 19, 24, 0.15)",
            }}
          />
          <Bar dataKey="points" fill="#c8161d" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
