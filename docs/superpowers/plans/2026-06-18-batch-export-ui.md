# Batch Export UI (/batch) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/batch` page where the user configures and runs batch exports, downloads the file, and keeps a persisted history of past runs (each with its seed) for reproducible re-download.

**Architecture:** One small backend change exposes the batch endpoint's custom headers to cross-origin JS. The frontend adds a `/batch` route composed of two libraries (`runBatchExport` does fetch→read headers→blob download→return a metadata record; `batchHistory` persists records in localStorage) and two presentational components (form, history table), glued by a thin page that owns state. A header link on the dashboard navigates to `/batch`.

**Tech Stack:** Python 3 / Flask / flask-cors (backend); Next.js 14 App Router / React 18 / TypeScript / Tailwind / lucide-react (frontend). No automated test framework exists — backend verification uses the Flask test client via the venv; frontend verification uses `npm run build` (typecheck) + manual checks.

---

## Type contract (single source of truth)

These types are defined in Task 2 (`lib/batchExport.ts`) and consumed by Tasks 3-6. Names MUST match exactly:

- `BatchFormat = "csv" | "json"`
- `BatchParams = { count: number; format: BatchFormat; indicators: boolean; period: string; seed?: number | null }`
- `BatchRunResult = { seed: number; count: number; format: BatchFormat; indicators: boolean; period: string; returned: number; skipped: number; warning: string | null; exported_at: string }`
- `BatchRecord = BatchRunResult & { id: string }` (defined in Task 3, `lib/batchHistory.ts`)

## File Structure

- `backend/server.py` — MODIFY. `CORS(app)` → expose the batch custom headers.
- `frontend/src/lib/batchExport.ts` — NEW. `runBatchExport(params)`: the download + metadata record. No React/storage.
- `frontend/src/lib/batchHistory.ts` — NEW. localStorage CRUD for run records.
- `frontend/src/components/BatchExportForm.tsx` — NEW. Controlled config form.
- `frontend/src/components/BatchHistoryTable.tsx` — NEW. Saved-runs table.
- `frontend/src/app/batch/page.tsx` — NEW. Route + state glue.
- `frontend/src/app/page.tsx` — MODIFY. Header `<Link href="/batch">`.

## Conventions

- Backend commands run from `c:\Users\lmapollon\Projects\Others\TP1\backend`; frontend commands from `c:\Users\lmapollon\Projects\Others\TP1\frontend`.
- Shell is **PowerShell** — chain with `;`, not `&&`. Backend venv python: `./venv/Scripts/python.exe`.
- Already on branch `feat/batch-export-ui`; do NOT create/switch branches. Do NOT touch main.
- The `@/` import alias maps to `frontend/src/`.

---

### Task 1: Backend — expose batch headers via CORS

**Files:**
- Modify: `backend/server.py` (the `CORS(app)` call)

- [ ] **Step 1: Expose the custom headers**

In `backend/server.py`, find this line (around line 39):

```python
CORS(app)
```

Replace it with:

```python
CORS(app, expose_headers=["X-Seed", "X-Returned", "X-Skipped", "X-Warning", "Content-Disposition"])
```

- [ ] **Step 2: Verify the header is exposed on a real batch response**

Run from `backend` (hits the network for 1 symbol; ~1-3s; 429 backoff lines are OK):

```bash
./venv/Scripts/python.exe -c "import server; c=server.app.test_client(); r=c.get('/api/export/batch?count=1&seed=1&period=5d', headers={'Origin':'http://localhost:3000'}); print('status', r.status_code); print('expose', r.headers.get('Access-Control-Expose-Headers')); print('x-seed', r.headers.get('X-Seed'))"
```

Expected: status 200; the `expose` line contains `X-Seed`, `X-Returned`, `X-Skipped`, `X-Warning`, `Content-Disposition`; `x-seed 1`.

- [ ] **Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat: expose batch export headers to cross-origin JS"
```

---

### Task 2: Frontend — `runBatchExport` library

**Files:**
- Create: `frontend/src/lib/batchExport.ts`

- [ ] **Step 1: Create `frontend/src/lib/batchExport.ts`**

```ts
// API base — mirrors lib/api.ts.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export type BatchFormat = "csv" | "json";

export interface BatchParams {
  count: number;
  format: BatchFormat;
  indicators: boolean;
  period: string;
  seed?: number | null;
}

export interface BatchRunResult {
  seed: number;
  count: number;
  format: BatchFormat;
  indicators: boolean;
  period: string;
  returned: number;
  skipped: number;
  warning: string | null;
  exported_at: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (disposition) {
    const m = disposition.match(/filename=([^;]+)/i);
    if (m) return m[1].trim().replace(/^"|"$/g, "");
  }
  return fallback;
}

/**
 * Run a batch export: fetch the file, read the metadata headers, trigger a
 * browser download, and return a record describing the run. The seed is read
 * from the X-Seed response header, so a blank-seed (server-random) run is still
 * reproducible afterwards.
 */
export async function runBatchExport(params: BatchParams): Promise<BatchRunResult> {
  const { count, format, indicators, period, seed } = params;
  const qs = new URLSearchParams({
    count: String(count),
    format,
    indicators: indicators ? "1" : "0",
    period,
    interval: "1d",
  });
  if (seed !== undefined && seed !== null) qs.set("seed", String(seed));

  const res = await fetch(`${API_BASE}/api/export/batch?${qs.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Export failed: ${res.status}`);
  }

  const resolvedSeed = Number(res.headers.get("X-Seed"));
  const returned = Number(res.headers.get("X-Returned") ?? 0);
  const skipped = Number(res.headers.get("X-Skipped") ?? 0);
  const warning = res.headers.get("X-Warning");
  const ext = format === "json" ? "json" : "csv";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = filenameFromDisposition(
    res.headers.get("Content-Disposition"),
    `batch_${count}_seed${resolvedSeed}_${ts}.${ext}`
  );

  const blob = await res.blob();
  triggerDownload(blob, filename);

  return {
    seed: resolvedSeed,
    count,
    format,
    indicators,
    period,
    returned,
    skipped,
    warning: warning || null,
    exported_at: new Date().toISOString(),
  };
}
```

- [ ] **Step 2: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds (the new module compiles; it is not yet imported anywhere, which is fine).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/batchExport.ts
git commit -m "feat: add runBatchExport (fetch headers + blob download)"
```

---

### Task 3: Frontend — `batchHistory` localStorage store

**Files:**
- Create: `frontend/src/lib/batchHistory.ts`

- [ ] **Step 1: Create `frontend/src/lib/batchHistory.ts`**

```ts
import { BatchRunResult } from "./batchExport";

const STORAGE_KEY = "batch_export_history";
const MAX_RECORDS = 50;

export interface BatchRecord extends BatchRunResult {
  id: string;
}

/** Read the saved run records. Returns [] on missing/corrupt storage; never throws. */
export function loadHistory(): BatchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BatchRecord[]) : [];
  } catch {
    return [];
  }
}

function persist(records: BatchRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Quota or serialization failure: keep the in-memory list for this session.
  }
}

/** Prepend a new record (most-recent first), cap at MAX_RECORDS, persist. */
export function addRecord(result: BatchRunResult): BatchRecord[] {
  const record: BatchRecord = { ...result, id: `${result.exported_at}_${result.seed}` };
  const next = [record, ...loadHistory()].slice(0, MAX_RECORDS);
  persist(next);
  return next;
}

export function removeRecord(id: string): BatchRecord[] {
  const next = loadHistory().filter((r) => r.id !== id);
  persist(next);
  return next;
}

export function clearHistory(): BatchRecord[] {
  persist([]);
  return [];
}
```

- [ ] **Step 2: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/batchHistory.ts
git commit -m "feat: add localStorage-backed batch export history store"
```

---

### Task 4: Frontend — `BatchExportForm` component

**Files:**
- Create: `frontend/src/components/BatchExportForm.tsx`

- [ ] **Step 1: Create `frontend/src/components/BatchExportForm.tsx`**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BatchExportForm.tsx
git commit -m "feat: add BatchExportForm component"
```

---

### Task 5: Frontend — `BatchHistoryTable` component

**Files:**
- Create: `frontend/src/components/BatchHistoryTable.tsx`

- [ ] **Step 1: Create `frontend/src/components/BatchHistoryTable.tsx`**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/BatchHistoryTable.tsx
git commit -m "feat: add BatchHistoryTable component"
```

---

### Task 6: Frontend — `/batch` page

**Files:**
- Create: `frontend/src/app/batch/page.tsx`

- [ ] **Step 1: Create `frontend/src/app/batch/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds; the build output lists a `/batch` route.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/batch/page.tsx
git commit -m "feat: add /batch page (form + history glue)"
```

---

### Task 7: Frontend — dashboard header link

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Add the imports**

In `frontend/src/app/page.tsx`, the lucide import is currently (line 8):

```tsx
import { TrendingUp, X, AlertTriangle } from "lucide-react";
```

Replace it with (add `Layers`) and add the `next/link` import right after it:

```tsx
import { TrendingUp, X, AlertTriangle, Layers } from "lucide-react";
import Link from "next/link";
```

- [ ] **Step 2: Add the Batch Export link to the header**

In the header, the right-hand side is currently just the export menu (line 62):

```tsx
          <ExportMenu currentBundle={currentBundle} allBundles={allBundles} />
```

Replace that single line with a flex group containing the link and the menu:

```tsx
          <div className="flex items-center gap-3">
            <Link
              href="/batch"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#1a1a2e] border border-[#2a2a3e] text-zinc-200 hover:border-blue-500 hover:text-white text-sm font-medium transition-colors"
            >
              <Layers className="w-4 h-4" />
              Batch Export
            </Link>
            <ExportMenu currentBundle={currentBundle} allBundles={allBundles} />
          </div>
```

- [ ] **Step 3: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: link to /batch from the dashboard header"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only)

Requires the backend and frontend running:
- Backend from `backend`: `./venv/Scripts/python.exe -c "import server; server.app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)"`
- Frontend from `frontend`: `npm run dev` (and `npx convex dev` if the dashboard root needs it; the `/batch` page itself does not use Convex).

- [ ] **Step 1: Navigation**

Open the dashboard (`http://localhost:3000`). The header shows a **Batch Export** button next to Export. Click it.
Expected: routes to `/batch`; the page shows the "New batch export" form and an empty history ("No exports yet…").

- [ ] **Step 2: Run a small export**

On `/batch`, set Count = 5, Seed = 123, Format = CSV, Period = max, indicators checked. Click **Run & Download**.
Expected: the button shows "Exporting…", the blue elapsed banner counts up; within a minute a file `batch_5_seed123_*.csv` downloads; a history row appears with Seed `123`, Count `5`, Ret/Skip like `5/0`, and a timestamp.

- [ ] **Step 3: Persistence across reload**

Reload `/batch` (F5).
Expected: the history row is still present (loaded from localStorage).

- [ ] **Step 4: Re-download (same seed)**

Click the download icon on the history row.
Expected: the same `batch_5_seed123_*.csv` downloads again; the row spinner shows briefly; **no duplicate row** is added.

- [ ] **Step 5: Blank-seed run proves header exposure**

Run again with Seed left blank, Count = 3.
Expected: the file downloads and the new history row shows a concrete (non-zero) numeric seed — proving `X-Seed` is readable cross-origin (the CORS fix). If the seed shows as `0`, the CORS expose-headers change (Task 1) is not in effect.

- [ ] **Step 6: Error path**

Stop the backend, then click Run again.
Expected: a red error notice appears (no crash). Restart the backend afterward.

- [ ] **Step 7: Remove / Clear**

Remove one row (trash icon), then Clear all.
Expected: rows disappear; after reload the history stays empty (persisted).

- [ ] **Step 8: Confirm clean tree**

```bash
git status
```
If steps required fixups, commit them; otherwise the tree is clean.

---

## Notes

- The `/batch` page reads `X-Seed`/`X-Returned`/`X-Skipped`/`X-Warning` from the response; these are only visible to cross-origin JS because of the Task 1 CORS change. If a blank-seed run records seed `0`, Task 1 was not applied.
- History stores metadata only (no file blobs), so localStorage stays small; the list is capped at the most recent 50 runs.
- Re-download replays the stored seed, which reproduces the same symbol set (per the batch endpoint's reproducibility contract); the underlying Yahoo data may have extended since the original run.
- `interval` is fixed to `1d` in the UI by design; intraday is out of scope.
