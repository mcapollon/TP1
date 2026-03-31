"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { HistoricalPoint } from "@/lib/api";

interface VolumeChartProps {
  data: HistoricalPoint[];
  symbol: string;
}

export function VolumeChart({ data, symbol }: VolumeChartProps) {
  if (!data || data.length === 0) return null;

  const chartData = data.map((d, i) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString("fr-FR", {
      month: "short",
      day: "numeric",
    }),
    color: i > 0 && d.close >= data[i - 1].close ? "#22c55e" : "#ef4444",
  }));

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-[#2a2a3e] p-6">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">
        Volume d'échange — {symbol}
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#71717a", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a3e" }}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a3e" }}
            tickFormatter={(v) =>
              v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${(v / 1e3).toFixed(0)}K`
            }
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a2e",
              border: "1px solid #2a2a3e",
              borderRadius: "8px",
              color: "#e4e4e7",
            }}
            formatter={(value: number) => [value.toLocaleString(), "Volume"]}
          />
          <Bar dataKey="volume" fill="#3b82f6" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
