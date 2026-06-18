"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { HistoricalPoint } from "@/lib/api";

interface PriceChartProps {
  data: HistoricalPoint[];
  symbol: string;
}

export function PriceChart({ data, symbol }: PriceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-[#1a1a2e] rounded-xl border border-[#2a2a3e] p-6">
        <p className="text-zinc-400 text-center">Aucune donnée historique</p>
      </div>
    );
  }

  const firstClose = data[0]?.adj_close ?? data[0]?.close ?? 0;
  const lastClose =
    data[data.length - 1]?.adj_close ?? data[data.length - 1]?.close ?? 0;
  const isPositive = lastClose >= firstClose;
  const color = isPositive ? "#22c55e" : "#ef4444";

  const chartData = data.map((d) => ({
    ...d,
    price: d.adj_close ?? d.close,
    date: new Date(d.date).toLocaleDateString("fr-FR", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-[#2a2a3e] p-6">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">
        Prix historique — {symbol}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#71717a", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a3e" }}
          />
          <YAxis
            tick={{ fill: "#71717a", fontSize: 12 }}
            axisLine={{ stroke: "#2a2a3e" }}
            domain={["auto", "auto"]}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1a1a2e",
              border: "1px solid #2a2a3e",
              borderRadius: "8px",
              color: "#e4e4e7",
            }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Prix"]}
          />
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill="url(#priceGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
