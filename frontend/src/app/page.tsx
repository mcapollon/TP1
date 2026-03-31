"use client";

import { useState, useCallback } from "react";
import { SearchBar } from "@/components/SearchBar";
import { StockDashboard } from "@/components/StockDashboard";
import { ExportMenu } from "@/components/ExportMenu";
import { StockDataBundle } from "@/lib/export";
import { TrendingUp, X, AlertTriangle } from "lucide-react";

export default function Home() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [activeSymbol, setActiveSymbol] = useState<string | null>(null);
  const [bundles, setBundles] = useState<Record<string, StockDataBundle>>({});
  const [searchError, setSearchError] = useState<string | null>(null);

  const addSymbol = (symbol: string) => {
    setSearchError(null);
    if (!symbols.includes(symbol)) {
      setSymbols((prev) => [...prev, symbol]);
    }
    setActiveSymbol(symbol);
  };

  const removeSymbol = (symbol: string) => {
    setSymbols((prev) => prev.filter((s) => s !== symbol));
    setBundles((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    if (activeSymbol === symbol) {
      setActiveSymbol(symbols.filter((s) => s !== symbol)[0] ?? null);
    }
  };

  const handleDataLoaded = useCallback(
    (symbol: string, bundle: StockDataBundle) => {
      setBundles((prev) => ({ ...prev, [symbol]: bundle }));
    },
    []
  );

  const allBundles = Object.values(bundles);
  const currentBundle = activeSymbol ? bundles[activeSymbol] ?? null : null;

  return (
    <main className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <header className="border-b border-[#2a2a3e] bg-[#12121a]">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-xl font-bold text-white">
                Stock Market Dashboard
              </h1>
              <p className="text-sm text-zinc-400">
                TP1 — Collecte et visualisation de données boursières
              </p>
            </div>
          </div>
          <ExportMenu currentBundle={currentBundle} allBundles={allBundles} />
        </div>
      </header>

      {/* Search */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <SearchBar onSelect={addSymbol} onError={(msg) => setSearchError(msg)} />

        {searchError && (
          <div className="mt-4 max-w-2xl mx-auto flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">{searchError}</span>
            <button
              onClick={() => setSearchError(null)}
              className="ml-auto p-1 rounded hover:bg-red-500/20"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Stock Tabs */}
      {symbols.length > 0 && (
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-2 flex-wrap mb-4">
            {symbols.map((s) => (
              <div
                key={s}
                className={`flex items-center gap-1 pl-3 pr-1 py-1.5 rounded-lg text-sm font-medium cursor-pointer transition-colors ${
                  s === activeSymbol
                    ? "bg-blue-600 text-white"
                    : "bg-[#1a1a2e] text-zinc-400 hover:text-white border border-[#2a2a3e]"
                }`}
              >
                <span onClick={() => setActiveSymbol(s)}>{s}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSymbol(s);
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-white/20 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dashboard */}
      <div className="max-w-7xl mx-auto px-4 pb-12">
        {activeSymbol ? (
          <StockDashboard
            key={activeSymbol}
            symbol={activeSymbol}
            onDataLoaded={handleDataLoaded}
          />
        ) : (
          <div className="text-center py-24">
            <TrendingUp className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
            <h2 className="text-xl text-zinc-400 mb-2">
              Recherchez une action pour commencer
            </h2>
            <p className="text-zinc-600 max-w-md mx-auto">
              Entrez le nom d'une entreprise ou son symbole boursier (ex: AAPL,
              TSLA, MSFT) pour visualiser ses données en temps réel.
            </p>
            <div className="flex gap-2 justify-center mt-6">
              {["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN"].map((s) => (
                <button
                  key={s}
                  onClick={() => addSymbol(s)}
                  className="px-4 py-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] text-zinc-300 hover:border-blue-500 hover:text-white transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
