"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { BatchFormat, BatchParams } from "@/lib/batchExport";

// Periods meaningful for a historical export (omit intraday-only 1d/5d).
const PERIODS = ["1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"];

interface Props {
  onRun: (params: BatchParams) => void;
  running: boolean;
}

export function BatchExportForm({ onRun, running }: Props) {
  const [count, setCount] = useState(100);
  const [format, setFormat] = useState<BatchFormat>("csv");
  const [indicators, setIndicators] = useState(true);
  const [period, setPeriod] = useState("max");
  const [seed, setSeed] = useState("");

  const seedValid = seed.trim() === "" || /^-?\d+$/.test(seed.trim());
  const clampedCount = Math.max(1, Math.min(150, Number.isFinite(count) ? count : 1));

  function submit() {
    if (!seedValid || running) return;
    onRun({
      count: clampedCount,
      format,
      indicators,
      period,
      seed: seed.trim() === "" ? null : parseInt(seed.trim(), 10),
    });
  }

  return (
    <div className="rounded-xl bg-[#12121a] border border-[#2a2a3e] p-5 space-y-4">
      <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
        New batch export
      </h2>

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Count (1–150)
          <input
            type="number"
            min={1}
            max={150}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value || "1", 10))}
            className="px-3 py-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] text-zinc-100 text-sm"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Format
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as BatchFormat)}
            className="px-3 py-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] text-zinc-100 text-sm"
          >
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Period
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] text-zinc-100 text-sm"
          >
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-zinc-400">
          Seed (blank = random)
          <input
            type="text"
            value={seed}
            placeholder="e.g. 42"
            onChange={(e) => setSeed(e.target.value)}
            className={`px-3 py-2 rounded-lg bg-[#1a1a2e] border text-zinc-100 text-sm ${
              seedValid ? "border-[#2a2a3e]" : "border-red-500"
            }`}
          />
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-300">
        <input
          type="checkbox"
          checked={indicators}
          onChange={(e) => setIndicators(e.target.checked)}
          className="accent-emerald-600"
        />
        Include technical indicators
      </label>

      <button
        onClick={submit}
        disabled={running || !seedValid}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-40"
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        {running ? "Exporting…" : "Run & Download"}
      </button>

      <p className="text-[11px] text-zinc-500">
        Interval: daily (1d). Fetching up to 150 lifetime histories can take 1–2 min.
      </p>
    </div>
  );
}
