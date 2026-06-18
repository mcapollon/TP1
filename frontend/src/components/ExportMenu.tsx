"use client";

import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileText, FileSpreadsheet, FileJson, ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  ExportFormat,
  StockDataBundle,
  HISTORY_COLUMNS,
  exportSingle,
  exportMulti,
} from "@/lib/export";

interface ExportMenuProps {
  currentBundle?: StockDataBundle | null;
  allBundles?: StockDataBundle[];
}

type DataType = "details" | "history" | "full";
type Step = "scope" | "data" | "columns" | "format";

// All selectable column keys (everything except the always-included `date`).
const SELECTABLE_COLUMNS = HISTORY_COLUMNS.filter((c) => c !== "date");

// Group membership for the picker. Anything not mapped here is an indicator.
const GROUP_OF: Record<string, string> = {
  open: "Prices", high: "Prices", low: "Prices", close: "Prices",
  adj_close: "Prices", volume: "Prices",
  dividends: "Corporate actions", stock_splits: "Corporate actions",
};
const GROUP_ORDER = ["Prices", "Corporate actions", "Indicators"];

// Derived from HISTORY_COLUMNS so the picker can never silently drift from the
// canonical column list; keys keep their canonical order within each group.
const COLUMN_GROUPS: { label: string; keys: string[] }[] = GROUP_ORDER.map(
  (label) => ({
    label,
    keys: SELECTABLE_COLUMNS.filter((c) => (GROUP_OF[c] ?? "Indicators") === label),
  })
).filter((g) => g.keys.length > 0);

export function ExportMenu({ currentBundle, allBundles = [] }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("scope");
  const [multi, setMulti] = useState(false);
  const [dataType, setDataType] = useState<DataType>("details");
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [notice, setNotice] = useState<{ type: "error" | "warning"; text: string } | null>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(
    () => new Set(SELECTABLE_COLUMNS)
  );
  const menuRef = useRef<HTMLDivElement>(null);
  const exporting = exportingFormat !== null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasMultiple = allBundles.length > 1;
  const hasCurrent = !!currentBundle?.stock;

  if (!hasCurrent && !hasMultiple) return null;

  function reset() {
    setStep("scope");
    setMulti(false);
    setDataType("details");
    setExportingFormat(null);
    setNotice(null);
    setSelectedCols(new Set(SELECTABLE_COLUMNS));
  }

  function toggleMenu() {
    if (open) {
      setOpen(false);
    } else {
      reset();
      // If only one scope possible, skip scope step
      if (hasCurrent && !hasMultiple) {
        setMulti(false);
        setStep("data");
      } else if (!hasCurrent && hasMultiple) {
        setMulti(true);
        setStep("data");
      }
      setOpen(true);
    }
  }

  async function handleExport(format: ExportFormat) {
    setNotice(null);

    // "details" is not a time series — export the loaded snapshot, no fetch.
    if (dataType === "details") {
      if (multi && allBundles.length > 0) {
        exportMulti(format, allBundles, dataType);
      } else if (currentBundle) {
        exportSingle(format, currentBundle.stock, currentBundle.history, dataType);
      }
      setOpen(false);
      return;
    }

    // "history" / "full" — fetch full lifetime (max, daily) fresh per symbol.
    setExportingFormat(format);
    try {
      if (multi && allBundles.length > 0) {
        const results = await Promise.allSettled(
          allBundles.map((b) => api.getHistory(b.stock.symbol, "max", "1d", true))
        );
        const fresh: StockDataBundle[] = [];
        const skipped: string[] = [];
        results.forEach((r, i) => {
          if (r.status === "fulfilled" && r.value.data.length) {
            fresh.push({ stock: allBundles[i].stock, history: r.value.data });
          } else {
            skipped.push(allBundles[i].stock.symbol);
          }
        });
        if (!fresh.length) {
          setNotice({ type: "error", text: "No lifetime data could be fetched for any symbol." });
          return;
        }
        exportMulti(format, fresh, dataType, orderedColumns);
        if (skipped.length) {
          setNotice({ type: "warning", text: `Exported. Skipped (no data): ${skipped.join(", ")}` });
        } else {
          setOpen(false);
        }
      } else if (currentBundle) {
        const res = await api.getHistory(currentBundle.stock.symbol, "max", "1d", true);
        if (!res.data.length) {
          setNotice({ type: "error", text: `No historical data available for ${currentBundle.stock.symbol}.` });
          return;
        }
        exportSingle(format, currentBundle.stock, res.data, dataType, orderedColumns);
        setOpen(false);
      }
    } catch (e: unknown) {
      setNotice({ type: "error", text: e instanceof Error ? e.message : "Export failed." });
    } finally {
      setExportingFormat(null);
    }
  }

  const scopeLabel = multi
    ? `All (${allBundles.length}): ${allBundles.map((b) => b.stock.symbol).join(", ")}`
    : currentBundle?.stock.symbol ?? "";

  const dataLabel =
    dataType === "details" ? "Stock Details" :
    dataType === "history" ? "Price History" : "Full Report";

  function toggleCol(key: string) {
    setSelectedCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setAllCols(on: boolean) {
    setSelectedCols(on ? new Set(SELECTABLE_COLUMNS) : new Set());
  }

  // Selected columns in canonical order, always led by `date`.
  const orderedColumns = HISTORY_COLUMNS.filter(
    (c) => c === "date" || selectedCols.has(c)
  );

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={toggleMenu}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
      >
        <Download className="w-4 h-4" />
        Export
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl bg-[#1a1a2e] border border-[#2a2a3e] shadow-2xl z-50 overflow-hidden">

          {/* ── Step 1: Choose scope ── */}
          {step === "scope" && (
            <div>
              <div className="px-4 py-2.5 bg-[#12121a] text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Export which stocks?
              </div>
              {hasCurrent && (
                <button
                  onClick={() => { setMulti(false); setStep("data"); }}
                  className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-[#2a2a3e] transition-colors border-b border-[#2a2a3e]"
                >
                  <div className="font-medium">{currentBundle!.stock.symbol}</div>
                  <div className="text-xs text-zinc-500">Current stock only</div>
                </button>
              )}
              {hasMultiple && (
                <button
                  onClick={() => { setMulti(true); setStep("data"); }}
                  className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-[#2a2a3e] transition-colors"
                >
                  <div className="font-medium">All {allBundles.length} stocks</div>
                  <div className="text-xs text-zinc-500">
                    {allBundles.map((b) => b.stock.symbol).join(", ")}
                  </div>
                </button>
              )}
            </div>
          )}

          {/* ── Step 2: Choose data type ── */}
          {step === "data" && (
            <div>
              <button
                onClick={() => setStep("scope")}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#12121a] text-xs text-zinc-400 hover:text-zinc-200 transition-colors w-full"
              >
                <ArrowLeft className="w-3 h-3" />
                <span className="font-semibold uppercase tracking-wider">What to export?</span>
                <span className="ml-auto text-emerald-500 normal-case font-normal">{scopeLabel}</span>
              </button>
              {([
                { value: "details" as DataType, label: "Stock Details", desc: "Current price, metrics, fundamentals" },
                { value: "history" as DataType, label: "Price History", desc: "Historical OHLCV data" },
                { value: "full" as DataType, label: "Full Report", desc: "Details + history combined" },
              ]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => {
                    setDataType(opt.value);
                    setStep(opt.value === "details" ? "format" : "columns");
                  }}
                  className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-[#2a2a3e] transition-colors border-b border-[#2a2a3e] last:border-0"
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-zinc-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2.5: Choose columns (history/full only) ── */}
          {step === "columns" && (
            <div>
              <button
                onClick={() => setStep("data")}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#12121a] text-xs text-zinc-400 hover:text-zinc-200 transition-colors w-full"
              >
                <ArrowLeft className="w-3 h-3" />
                <span className="font-semibold uppercase tracking-wider">Choose columns</span>
                <span className="ml-auto text-emerald-500 normal-case font-normal">{dataLabel}</span>
              </button>

              <div className="flex gap-3 px-4 py-2 bg-[#12121a] text-[11px] border-b border-[#2a2a3e]">
                <button onClick={() => setAllCols(true)} className="text-emerald-500 hover:underline">
                  Select all
                </button>
                <button onClick={() => setAllCols(false)} className="text-zinc-500 hover:underline">
                  Select none
                </button>
                <span className="ml-auto text-zinc-500">{selectedCols.size} selected</span>
              </div>

              <div className="max-h-64 overflow-y-auto">
                {COLUMN_GROUPS.map((group) => (
                  <div key={group.label}>
                    <div className="px-4 py-1.5 bg-[#15151f] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      {group.label}
                    </div>
                    {group.keys.map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-2 px-4 py-1.5 text-sm text-zinc-300 hover:bg-[#2a2a3e] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCols.has(key)}
                          onChange={() => toggleCol(key)}
                          className="accent-emerald-600"
                        />
                        <span>{key}</span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep("format")}
                disabled={selectedCols.size === 0}
                className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:hover:bg-emerald-600"
              >
                {selectedCols.size === 0 ? "Select at least one column" : "Continue"}
              </button>
            </div>
          )}

          {/* ── Step 3: Choose format ── */}
          {step === "format" && (
            <div>
              <button
                onClick={() => setStep(dataType === "details" ? "data" : "columns")}
                disabled={exporting}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#12121a] text-xs text-zinc-400 hover:text-zinc-200 transition-colors w-full disabled:opacity-50"
              >
                <ArrowLeft className="w-3 h-3" />
                <span className="font-semibold uppercase tracking-wider">Choose format</span>
                <span className="ml-auto text-emerald-500 normal-case font-normal">{dataLabel}</span>
              </button>

              {dataType === "history" && (
                <div className="px-4 py-2 bg-[#12121a] text-[11px] text-zinc-500 border-b border-[#2a2a3e]">
                  Exports full lifetime history (daily).
                </div>
              )}
              {dataType === "full" && (
                <div className="px-4 py-2 bg-[#12121a] text-[11px] text-zinc-500 border-b border-[#2a2a3e]">
                  Exports details snapshot + full lifetime history (daily).
                </div>
              )}

              {([
                { format: "csv" as ExportFormat, label: "CSV", desc: "Spreadsheet-compatible", Icon: FileText },
                { format: "json" as ExportFormat, label: "JSON", desc: "Structured data format", Icon: FileJson },
                { format: "xls" as ExportFormat, label: "Excel (XLS)", desc: "Microsoft Excel file", Icon: FileSpreadsheet },
              ]).map((opt) => {
                const isActive = exportingFormat === opt.format;
                return (
                  <button
                    key={opt.format}
                    onClick={() => handleExport(opt.format)}
                    disabled={exporting}
                    className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm text-zinc-200 hover:bg-[#2a2a3e] transition-colors border-b border-[#2a2a3e] last:border-0 disabled:opacity-50 disabled:hover:bg-transparent"
                  >
                    {isActive ? (
                      <Loader2 className="w-5 h-5 text-emerald-500 shrink-0 animate-spin" />
                    ) : (
                      <opt.Icon className="w-5 h-5 text-emerald-500 shrink-0" />
                    )}
                    <div>
                      <div className="font-medium">{opt.label}</div>
                      <div className="text-xs text-zinc-500">
                        {isActive ? "Fetching lifetime data…" : opt.desc}
                      </div>
                    </div>
                  </button>
                );
              })}

              {notice && (
                <div
                  className={`px-4 py-3 text-xs border-t ${
                    notice.type === "error"
                      ? "text-red-400 bg-red-500/10 border-red-500/30"
                      : "text-amber-400 bg-amber-500/10 border-amber-500/30"
                  }`}
                >
                  {notice.text}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
