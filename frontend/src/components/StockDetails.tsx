"use client";

import { StockInfo } from "@/lib/api";

interface StockDetailsProps {
  stock: StockInfo;
}

function formatNumber(n: number | undefined | null): string {
  if (n == null) return "N/A";
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  return `$${n.toLocaleString()}`;
}

export function StockDetails({ stock }: StockDetailsProps) {
  const rows = [
    { label: "Ouverture", value: stock.open != null ? `$${stock.open.toFixed(2)}` : "N/A" },
    {
      label: "Clôture précédente",
      value: stock.previous_close != null ? `$${stock.previous_close.toFixed(2)}` : "N/A",
    },
    {
      label: "Plus haut (jour)",
      value: stock.day_high != null ? `$${stock.day_high.toFixed(2)}` : "N/A",
    },
    {
      label: "Plus bas (jour)",
      value: stock.day_low != null ? `$${stock.day_low.toFixed(2)}` : "N/A",
    },
    {
      label: "52 sem. haut",
      value:
        stock.fifty_two_week_high != null
          ? `$${stock.fifty_two_week_high.toFixed(2)}`
          : "N/A",
    },
    {
      label: "52 sem. bas",
      value:
        stock.fifty_two_week_low != null
          ? `$${stock.fifty_two_week_low.toFixed(2)}`
          : "N/A",
    },
    { label: "Volume", value: stock.volume?.toLocaleString() || "N/A" },
    { label: "Cap. boursière", value: formatNumber(stock.market_cap) },
    {
      label: "P/E Ratio",
      value: stock.pe_ratio != null ? stock.pe_ratio.toFixed(2) : "N/A",
    },
    {
      label: "Rendement dividende",
      value:
        stock.dividend_yield != null
          ? `${(stock.dividend_yield * 100).toFixed(2)}%`
          : "N/A",
    },
    { label: "Secteur", value: stock.sector || "N/A" },
    { label: "Industrie", value: stock.industry || "N/A" },
  ];

  return (
    <div className="bg-[#1a1a2e] rounded-xl border border-[#2a2a3e] p-6">
      <h3 className="text-sm font-medium text-zinc-400 mb-4">
        Détails — {stock.symbol}
      </h3>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between items-center">
            <span className="text-sm text-zinc-500">{row.label}</span>
            <span className="text-sm font-medium text-white">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-[#2a2a3e]">
        <p className="text-xs text-zinc-600">
          Source: {stock.source} · {stock.timestamp ? new Date(stock.timestamp).toLocaleString("fr-FR") : ""}
        </p>
      </div>
    </div>
  );
}
