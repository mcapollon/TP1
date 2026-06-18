"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TrendingUp, AlertTriangle, X } from "lucide-react";
import { runBatchExport, BatchParams } from "@/lib/batchExport";
import {
  loadHistory,
  addRecord,
  removeRecord,
  clearHistory,
  BatchRecord,
} from "@/lib/batchHistory";
import { BatchExportForm } from "@/components/BatchExportForm";
import { BatchHistoryTable } from "@/components/BatchHistoryTable";

export default function BatchPage() {
  const [history, setHistory] = useState<BatchRecord[]>([]);
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState<{ type: "error" | "warning"; text: string } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load persisted history after mount (avoids SSR/client markup mismatch).
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  function stopTimer() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }
  // Clean up the timer if the page unmounts mid-run.
  useEffect(() => () => stopTimer(), []);

  async function handleRun(params: BatchParams) {
    setNotice(null);
    setRunning(true);
    setElapsed(0);
    stopTimer(); // defensive: never stack intervals if a prior run's timer lingers
    timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    try {
      const result = await runBatchExport(params);
      setHistory(addRecord(result));
      if (result.warning) setNotice({ type: "warning", text: result.warning });
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Export failed." });
    } finally {
      setRunning(false);
      stopTimer();
    }
  }

  async function handleReDownload(r: BatchRecord) {
    setNotice(null);
    setBusyId(r.id);
    try {
      const result = await runBatchExport({
        count: r.count,
        format: r.format,
        indicators: r.indicators,
        period: r.period,
        seed: r.seed,
      });
      if (result.warning) setNotice({ type: "warning", text: result.warning });
    } catch (e) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Re-download failed." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#0a0a0f]">
      <header className="border-b border-[#2a2a3e] bg-[#12121a]">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Link href="/" className="flex items-center gap-3 group w-fit">
            <TrendingUp className="w-8 h-8 text-blue-500" />
            <div>
              <h1 className="text-xl font-bold text-white">Batch Export</h1>
              <p className="text-sm text-zinc-400 group-hover:text-zinc-300">
                Configure, run, and re-download batch exports
              </p>
            </div>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <BatchExportForm onRun={handleRun} running={running} />

        {running && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm">
            Exporting… {elapsed}s elapsed. Large batches can take 1–2 min — keep this tab open.
          </div>
        )}

        {notice && (
          <div
            className={`flex items-center gap-3 p-4 rounded-xl border text-sm ${
              notice.type === "error"
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-amber-500/10 border-amber-500/30 text-amber-400"
            }`}
          >
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            <span>{notice.text}</span>
            <button onClick={() => setNotice(null)} className="ml-auto p-1 rounded hover:bg-white/10">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <BatchHistoryTable
          records={history}
          onReDownload={handleReDownload}
          onRemove={(id) => setHistory(removeRecord(id))}
          onClear={() => setHistory(clearHistory())}
          busyId={busyId}
        />
      </div>
    </main>
  );
}
