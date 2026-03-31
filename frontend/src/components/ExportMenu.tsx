"use client";

import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileText, FileSpreadsheet, FileJson, ArrowLeft } from "lucide-react";
import {
  ExportFormat,
  StockDataBundle,
  exportSingle,
  exportMulti,
} from "@/lib/export";

interface ExportMenuProps {
  currentBundle?: StockDataBundle | null;
  allBundles?: StockDataBundle[];
}

type DataType = "details" | "history" | "full";
type Step = "scope" | "data" | "format";

export function ExportMenu({ currentBundle, allBundles = [] }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("scope");
  const [multi, setMulti] = useState(false);
  const [dataType, setDataType] = useState<DataType>("details");
  const menuRef = useRef<HTMLDivElement>(null);

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

  function handleExport(format: ExportFormat) {
    if (multi && allBundles.length > 0) {
      exportMulti(format, allBundles, dataType);
    } else if (currentBundle) {
      exportSingle(format, currentBundle.stock, currentBundle.history, dataType);
    }
    setOpen(false);
  }

  const scopeLabel = multi
    ? `All (${allBundles.length}): ${allBundles.map((b) => b.stock.symbol).join(", ")}`
    : currentBundle?.stock.symbol ?? "";

  const dataLabel =
    dataType === "details" ? "Stock Details" :
    dataType === "history" ? "Price History" : "Full Report";

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
                  onClick={() => { setDataType(opt.value); setStep("format"); }}
                  className="w-full text-left px-4 py-3 text-sm text-zinc-200 hover:bg-[#2a2a3e] transition-colors border-b border-[#2a2a3e] last:border-0"
                >
                  <div className="font-medium">{opt.label}</div>
                  <div className="text-xs text-zinc-500">{opt.desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 3: Choose format ── */}
          {step === "format" && (
            <div>
              <button
                onClick={() => setStep("data")}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#12121a] text-xs text-zinc-400 hover:text-zinc-200 transition-colors w-full"
              >
                <ArrowLeft className="w-3 h-3" />
                <span className="font-semibold uppercase tracking-wider">Choose format</span>
                <span className="ml-auto text-emerald-500 normal-case font-normal">{dataLabel}</span>
              </button>
              {([
                { format: "csv" as ExportFormat, label: "CSV", desc: "Spreadsheet-compatible", Icon: FileText },
                { format: "json" as ExportFormat, label: "JSON", desc: "Structured data format", Icon: FileJson },
                { format: "xls" as ExportFormat, label: "Excel (XLS)", desc: "Microsoft Excel file", Icon: FileSpreadsheet },
              ]).map((opt) => (
                <button
                  key={opt.format}
                  onClick={() => handleExport(opt.format)}
                  className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm text-zinc-200 hover:bg-[#2a2a3e] transition-colors border-b border-[#2a2a3e] last:border-0"
                >
                  <opt.Icon className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-zinc-500">{opt.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
