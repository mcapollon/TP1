"use client";

import { StockInfo } from "@/lib/api";
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

interface StockHeaderProps {
  stock: StockInfo;
  onRefresh: () => void;
}

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "N/A";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toLocaleString();
}

export function StockHeader({ stock, onRefresh }: StockHeaderProps) {
  const isPositive = (stock.change_percent ?? 0) >= 0;
  const Arrow = isPositive ? ArrowUpRight : ArrowDownRight;
  const Trend = isPositive ? TrendingUp : TrendingDown;

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-[#2a2a3e] p-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-2xl font-bold text-white">{stock.symbol}</h2>
            <span className="text-sm px-2 py-0.5 rounded bg-[#2a2a3e] text-zinc-400">
              {stock.exchange}
            </span>
          </div>
          <p className="text-zinc-400">{stock.name}</p>
          {stock.sector && stock.sector !== "N/A" && (
            <p className="text-xs text-zinc-500 mt-1">
              {stock.sector} · {stock.industry}
            </p>
          )}
        </div>
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg hover:bg-[#2a2a3e] transition-colors"
          title="Rafraîchir"
        >
          <RefreshCw className="w-5 h-5 text-zinc-400" />
        </button>
      </div>

      <div className="flex items-end gap-4 mt-4">
        <span className="text-4xl font-bold text-white">
          ${stock.current_price?.toFixed(2) ?? "N/A"}
        </span>
        <div
          className={`flex items-center gap-1 text-lg font-semibold ${
            isPositive ? "text-green-500" : "text-red-500"
          }`}
        >
          <Arrow className="w-5 h-5" />
          <span>
            {stock.change_percent != null
              ? `${isPositive ? "+" : ""}${stock.change_percent.toFixed(2)}%`
              : "N/A"}
          </span>
        </div>
        <span className="text-zinc-500 text-sm mb-1">
          {stock.currency || "USD"}
        </span>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-4 border-t border-[#2a2a3e]">
        <QuickStat label="Volume" value={formatNumber(stock.volume)} />
        <QuickStat label="Cap. boursière" value={formatNumber(stock.market_cap)} />
        <QuickStat
          label="Ouverture"
          value={stock.open != null ? `$${stock.open.toFixed(2)}` : "N/A"}
        />
        <QuickStat
          label="Clôture préc."
          value={
            stock.previous_close != null
              ? `$${stock.previous_close.toFixed(2)}`
              : "N/A"
          }
        />
      </div>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="text-sm font-medium text-white">{value}</p>
    </div>
  );
}
