"use client";

import { Download, Trash2, Loader2 } from "lucide-react";
import { BatchRecord } from "@/lib/batchHistory";

interface Props {
  records: BatchRecord[];
  onReDownload: (r: BatchRecord) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  busyId: string | null;
}

export function BatchHistoryTable({ records, onReDownload, onRemove, onClear, busyId }: Props) {
  if (!records.length) {
    return (
      <div className="rounded-xl bg-[#12121a] border border-[#2a2a3e] p-8 text-center text-sm text-zinc-500">
        No exports yet. Run one above — it will be saved here for re-download.
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[#12121a] border border-[#2a2a3e] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#2a2a3e]">
        <h2 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
          History ({records.length})
        </h2>
        <button onClick={onClear} className="text-xs text-zinc-500 hover:text-red-400">
          Clear all
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] text-zinc-500 uppercase tracking-wider">
              <th className="text-left px-4 py-2 font-medium">Seed</th>
              <th className="text-left px-4 py-2 font-medium">Count</th>
              <th className="text-left px-4 py-2 font-medium">Format</th>
              <th className="text-left px-4 py-2 font-medium">Ind</th>
              <th className="text-left px-4 py-2 font-medium">Period</th>
              <th className="text-left px-4 py-2 font-medium">Ret/Skip</th>
              <th className="text-left px-4 py-2 font-medium">When</th>
              <th className="text-right px-4 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.id} className="border-t border-[#1f1f2e] text-zinc-300">
                <td className="px-4 py-2 font-mono text-xs">{r.seed}</td>
                <td className="px-4 py-2">{r.count}</td>
                <td className="px-4 py-2 uppercase">{r.format}</td>
                <td className="px-4 py-2">{r.indicators ? "✓" : "—"}</td>
                <td className="px-4 py-2">{r.period}</td>
                <td className="px-4 py-2">
                  {r.returned}/{r.skipped}
                </td>
                <td className="px-4 py-2 text-xs text-zinc-500">
                  {new Date(r.exported_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onReDownload(r)}
                      disabled={busyId !== null}
                      title="Re-download (same seed)"
                      className="p-1.5 rounded hover:bg-[#2a2a3e] text-emerald-500 disabled:opacity-40"
                    >
                      {busyId === r.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Download className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      onClick={() => onRemove(r.id)}
                      title="Remove"
                      className="p-1.5 rounded hover:bg-[#2a2a3e] text-zinc-500 hover:text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
