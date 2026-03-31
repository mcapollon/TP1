"use client";

import { useState, useEffect } from "react";
import { api, StockInfo, HistoryResponse } from "@/lib/api";
import { StockDataBundle } from "@/lib/export";
import { StockHeader } from "./StockHeader";
import { PriceChart } from "./PriceChart";
import { VolumeChart } from "./VolumeChart";
import { StockDetails } from "./StockDetails";
import { AIAnalysisPanel } from "./AIAnalysisPanel";
import { RefreshCw } from "lucide-react";

interface StockDashboardProps {
  symbol: string;
  onDataLoaded?: (symbol: string, bundle: StockDataBundle) => void;
}

export function StockDashboard({ symbol, onDataLoaded }: StockDashboardProps) {
  const [stock, setStock] = useState<StockInfo | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [period, setPeriod] = useState("1mo");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stockData, histData] = await Promise.all([
        api.getStock(symbol),
        api.getHistory(symbol, period),
      ]);
      setStock(stockData);
      setHistory(histData);
      if (onDataLoaded) {
        onDataLoaded(symbol, { stock: stockData, history: histData.data });
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [symbol, period]);

  if (loading && !stock) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-3 text-zinc-400">
          Chargement des données pour {symbol}...
        </span>
      </div>
    );
  }

  if (error && !stock) {
    return (
      <div className="text-center py-24">
        <p className="text-red-400 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const periods = [
    { value: "1d", label: "1J" },
    { value: "5d", label: "5J" },
    { value: "1mo", label: "1M" },
    { value: "3mo", label: "3M" },
    { value: "6mo", label: "6M" },
    { value: "1y", label: "1A" },
    { value: "5y", label: "5A" },
  ];

  return (
    <div className="space-y-6">
      {/* Stock Header */}
      {stock && <StockHeader stock={stock} onRefresh={fetchData} />}

      {/* Period Selector */}
      <div className="flex gap-2">
        {periods.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === p.value
                ? "bg-blue-600 text-white"
                : "bg-[#1a1a2e] text-zinc-400 hover:text-white border border-[#2a2a3e]"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {history && <PriceChart data={history.data} symbol={symbol} />}
          {history && <VolumeChart data={history.data} symbol={symbol} />}
        </div>
        <div>{stock && <StockDetails stock={stock} />}</div>
      </div>

      {/* AI Analysis */}
      <AIAnalysisPanel symbol={symbol} />
    </div>
  );
}
