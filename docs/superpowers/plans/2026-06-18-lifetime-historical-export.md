# Lifetime Historical Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Price History and Full Report exports always pull full lifetime (`max`, daily) history for any stock symbol, independent of the chart's selected period.

**Architecture:** Frontend-only change. The export path becomes a fresh `getHistory(symbol, "max", "1d")` query at click time instead of reading the dashboard's displayed snapshot. A `Max` button is also added to the chart period selector. Backend already supports `period=max`; no backend change.

**Tech Stack:** Next.js 14, React 18, TypeScript, lucide-react. No automated test framework exists in the repo — verification is via `npm run build` (Next.js typecheck) and manual `npm run dev` observation.

---

## File Structure

- `frontend/src/components/StockDashboard.tsx` — add `Max` to the chart period selector array. Owns the dashboard view + period state.
- `frontend/src/components/ExportMenu.tsx` — owns the export UI/flow. Gains async lifetime fetch, loading state, and error display.
- `frontend/src/lib/api.ts` — unchanged; `getHistory(symbol, period, interval)` already supports the call.
- `frontend/src/lib/export.ts` — unchanged; formatter functions reused as-is.

All verification uses commands run from the `frontend/` directory.

---

### Task 1: Add "Max" button to chart period selector

**Files:**
- Modify: `frontend/src/components/StockDashboard.tsx:74-82`

- [ ] **Step 1: Add the Max period option**

In `frontend/src/components/StockDashboard.tsx`, find the `periods` array (currently ends at `5y`):

```tsx
  const periods = [
    { value: "1d", label: "1J" },
    { value: "5d", label: "5J" },
    { value: "1mo", label: "1M" },
    { value: "3mo", label: "3M" },
    { value: "6mo", label: "6M" },
    { value: "1y", label: "1A" },
    { value: "5y", label: "5A" },
  ];
```

Replace it with (add the `max` entry):

```tsx
  const periods = [
    { value: "1d", label: "1J" },
    { value: "5d", label: "5J" },
    { value: "1mo", label: "1M" },
    { value: "3mo", label: "3M" },
    { value: "6mo", label: "6M" },
    { value: "1y", label: "1A" },
    { value: "5y", label: "5A" },
    { value: "max", label: "Max" },
  ];
```

No other change needed: `setPeriod` already drives `api.getHistory(symbol, period)`, and the backend accepts `period="max"`.

- [ ] **Step 2: Typecheck**

Run (from `frontend/`): `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 3: Manual verify**

Run (from `frontend/`): `npm run dev`, open `http://localhost:3000`, search `AAPL`, click the new **Max** button.
Expected: chart re-renders showing price history spanning from the 1980s to today.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/StockDashboard.tsx
git commit -m "feat: add Max period button to stock chart"
```

---

### Task 2: ExportMenu — imports and new state

**Files:**
- Modify: `frontend/src/components/ExportMenu.tsx:3-10` (imports)
- Modify: `frontend/src/components/ExportMenu.tsx:20-25` (state declarations)

- [ ] **Step 1: Add `api` and `Loader2` imports**

At the top of `frontend/src/components/ExportMenu.tsx`, the current imports are:

```tsx
import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileText, FileSpreadsheet, FileJson, ArrowLeft } from "lucide-react";
import {
  ExportFormat,
  StockDataBundle,
  exportSingle,
  exportMulti,
} from "@/lib/export";
```

Replace with (adds `Loader2` icon and the `api` client):

```tsx
import { useState, useRef, useEffect } from "react";
import { Download, ChevronDown, FileText, FileSpreadsheet, FileJson, ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import {
  ExportFormat,
  StockDataBundle,
  exportSingle,
  exportMulti,
} from "@/lib/export";
```

- [ ] **Step 2: Add `exporting` and `exportError` state**

Find the state block (currently):

```tsx
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("scope");
  const [multi, setMulti] = useState(false);
  const [dataType, setDataType] = useState<DataType>("details");
  const menuRef = useRef<HTMLDivElement>(null);
```

Replace with:

```tsx
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("scope");
  const [multi, setMulti] = useState(false);
  const [dataType, setDataType] = useState<DataType>("details");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
```

- [ ] **Step 3: Clear new state in `reset()`**

Find:

```tsx
  function reset() {
    setStep("scope");
    setMulti(false);
    setDataType("details");
  }
```

Replace with:

```tsx
  function reset() {
    setStep("scope");
    setMulti(false);
    setDataType("details");
    setExporting(false);
    setExportError(null);
  }
```

- [ ] **Step 4: Typecheck**

Run (from `frontend/`): `npm run build`
Expected: build succeeds (the new `Loader2`/`api`/state are unused so far — Next.js build still passes; ESLint unused-var is a warning, not a build error).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ExportMenu.tsx
git commit -m "chore: add api import and export state to ExportMenu"
```

---

### Task 3: ExportMenu — async lifetime fetch in handleExport

**Files:**
- Modify: `frontend/src/components/ExportMenu.tsx:65-72` (`handleExport`)

- [ ] **Step 1: Replace `handleExport` with the async lifetime version**

The current function is:

```tsx
  function handleExport(format: ExportFormat) {
    if (multi && allBundles.length > 0) {
      exportMulti(format, allBundles, dataType);
    } else if (currentBundle) {
      exportSingle(format, currentBundle.stock, currentBundle.history, dataType);
    }
    setOpen(false);
  }
```

Replace it entirely with:

```tsx
  async function handleExport(format: ExportFormat) {
    setExportError(null);

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
    setExporting(true);
    try {
      if (multi && allBundles.length > 0) {
        const results = await Promise.allSettled(
          allBundles.map((b) => api.getHistory(b.stock.symbol, "max", "1d"))
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
          setExportError("No lifetime data could be fetched for any symbol.");
          return;
        }
        exportMulti(format, fresh, dataType);
        if (skipped.length) {
          setExportError(`Exported. Skipped (no data): ${skipped.join(", ")}`);
        } else {
          setOpen(false);
        }
      } else if (currentBundle) {
        const res = await api.getHistory(currentBundle.stock.symbol, "max", "1d");
        if (!res.data.length) {
          setExportError(`No historical data available for ${currentBundle.stock.symbol}.`);
          return;
        }
        exportSingle(format, currentBundle.stock, res.data, dataType);
        setOpen(false);
      }
    } catch (e: any) {
      setExportError(e.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }
```

Notes for the implementer:
- `api.getHistory(symbol, period, interval)` returns a `HistoryResponse` whose `.data` is `HistoricalPoint[]` — exactly the shape `exportSingle`/`exportMulti` expect for the `history` field.
- `Promise.allSettled` is used (not `Promise.all`) so one throttled/invalid symbol does not abort the whole multi-stock export.
- On partial multi failure the menu stays open to show which symbols were skipped; on full success it closes.

- [ ] **Step 2: Typecheck**

Run (from `frontend/`): `npm run build`
Expected: build succeeds, no TypeScript errors. (`exporting`/`exportError` are now read by logic but not yet by the UI — Task 4 wires the UI.)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ExportMenu.tsx
git commit -m "feat: fetch lifetime (max) history at export time"
```

---

### Task 4: ExportMenu — loading state and error display in the format step

**Files:**
- Modify: `frontend/src/components/ExportMenu.tsx` (format-step block, currently lines ~154-182)

- [ ] **Step 1: Add disabled/spinner to format buttons and an error row**

Find the format step block:

```tsx
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
```

Replace it entirely with:

```tsx
          {/* ── Step 3: Choose format ── */}
          {step === "format" && (
            <div>
              <button
                onClick={() => setStep("data")}
                disabled={exporting}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#12121a] text-xs text-zinc-400 hover:text-zinc-200 transition-colors w-full disabled:opacity-50"
              >
                <ArrowLeft className="w-3 h-3" />
                <span className="font-semibold uppercase tracking-wider">Choose format</span>
                <span className="ml-auto text-emerald-500 normal-case font-normal">{dataLabel}</span>
              </button>

              {dataType !== "details" && (
                <div className="px-4 py-2 bg-[#12121a] text-[11px] text-zinc-500 border-b border-[#2a2a3e]">
                  Exports full lifetime history (daily).
                </div>
              )}

              {([
                { format: "csv" as ExportFormat, label: "CSV", desc: "Spreadsheet-compatible", Icon: FileText },
                { format: "json" as ExportFormat, label: "JSON", desc: "Structured data format", Icon: FileJson },
                { format: "xls" as ExportFormat, label: "Excel (XLS)", desc: "Microsoft Excel file", Icon: FileSpreadsheet },
              ]).map((opt) => (
                <button
                  key={opt.format}
                  onClick={() => handleExport(opt.format)}
                  disabled={exporting}
                  className="w-full flex items-center gap-3 text-left px-4 py-3 text-sm text-zinc-200 hover:bg-[#2a2a3e] transition-colors border-b border-[#2a2a3e] last:border-0 disabled:opacity-50 disabled:hover:bg-transparent"
                >
                  {exporting ? (
                    <Loader2 className="w-5 h-5 text-emerald-500 shrink-0 animate-spin" />
                  ) : (
                    <opt.Icon className="w-5 h-5 text-emerald-500 shrink-0" />
                  )}
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-zinc-500">
                      {exporting ? "Fetching lifetime data…" : opt.desc}
                    </div>
                  </div>
                </button>
              ))}

              {exportError && (
                <div className="px-4 py-3 text-xs text-red-400 bg-red-500/10 border-t border-red-500/30">
                  {exportError}
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 2: Typecheck**

Run (from `frontend/`): `npm run build`
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 3: Lint**

Run (from `frontend/`): `npm run lint`
Expected: no errors (warnings acceptable).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/ExportMenu.tsx
git commit -m "feat: show loading and error state during lifetime export"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only)

No automated test harness exists, so this task confirms behavior by running the app. Backend must be running (`cd backend && python server.py`) and frontend (`cd frontend && npm run dev`).

- [ ] **Step 1: Single-stock lifetime CSV**

Search `AAPL` → **Export** → `AAPL` → **Price History** → **CSV**.
Expected: brief spinner, then a `AAPL_history_*.csv` downloads. Open it: rows span from the 1980s to today at daily cadence (far more than the ~22 rows of a `1mo` window).

- [ ] **Step 2: Old ticker, no truncation**

Search `IBM` → **Export** → **Price History** → **CSV**.
Expected: file contains ~16k daily rows going back to the 1960s; no truncation.

- [ ] **Step 3: Full Report contains lifetime history**

`AAPL` → **Export** → **Full Report** → **JSON**.
Expected: JSON has `stock_details` (current metrics) and `historical_data.data` with lifetime daily rows; `historical_data.count` matches the array length.

- [ ] **Step 4: Multi-stock export**

Add `AAPL` and `TSLA` (two tabs) → **Export** → **All 2 stocks** → **Price History** → **CSV**.
Expected: single `history_AAPL_TSLA_*.csv` with a `symbol` column and full lifetime rows for both.

- [ ] **Step 5: Partial-failure tolerance**

Add a valid symbol and (via direct search) a delisted/invalid one if reproducible; export **All** → **Price History**.
Expected: the valid symbol still exports; the menu shows `Skipped (no data): <symbol>`. (If an invalid symbol cannot be added to a tab, note that and skip this step.)

- [ ] **Step 6: Details export still instant**

`AAPL` → **Export** → **Stock Details** → **CSV**.
Expected: downloads immediately with no spinner (no `max` fetch performed).

- [ ] **Step 7: Final commit (if any verification fixups were needed)**

If steps 1-6 required code fixes, commit them. Otherwise nothing to commit.

```bash
git status   # confirm clean working tree
```

---

## Notes

- If lifetime daily data ever needs caching to avoid re-fetching on repeated exports, that is explicitly out of scope (see spec). Each export is a fresh query.
- The `Max` chart button (Task 1) is a convenience; export correctness does not depend on it being clicked.
