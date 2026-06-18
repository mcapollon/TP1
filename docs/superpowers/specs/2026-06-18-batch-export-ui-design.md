# Batch Export UI (/batch) — Design

**Date:** 2026-06-18
**Status:** Approved (design)
**Builds on:** [2026-06-18-batch-random-historical-export-design.md](2026-06-18-batch-random-historical-export-design.md)

## Problem

The `GET /api/export/batch` endpoint exists, but there is no way to reach it from the app — the user has to hand-craft a URL. They want a `/batch` page to configure and run batch exports, download the file, and **manage** past exports (keep a record of each run with its seed so it can be reproduced / re-downloaded).

## Decisions (from brainstorming)

- **Scope:** a configuration **form** plus a **saved history** of past runs. History is persisted in the browser (`localStorage`) so it survives reload; each row can be **re-downloaded** (replays the same seed) or removed. This is what "manage properly" means — the seed record is the reproducibility anchor.
- **Access:** a **header link** on the main dashboard (`app/page.tsx`) navigates to `/batch`.
- **Transport (A1):** the page does a `fetch` and reads the response **headers** (`X-Seed`, `X-Returned`, `X-Skipped`, `X-Warning`) to build the history record, then downloads the response **blob**. Rejected: direct `<a>`/navigation download (JS can't read headers → can't capture a server-generated seed → reproducibility breaks); a separate JSON metadata call (redundant — the headers already carry it).
- **Interval fixed to `1d`:** the form exposes `count, format, indicators, period, seed`. `interval` is hardcoded to `1d` (daily) to keep the form simple and avoid invalid period/interval combinations. Intraday is out of scope.

## Critical integration constraint: CORS header exposure

The frontend (`localhost:3000`) and backend (`localhost:5000`) are **different origins**. `CORS(app)` already allows the cross-origin request, but browsers withhold *custom* response headers from JavaScript unless the server sets `Access-Control-Expose-Headers`. Without this, `response.headers.get("X-Seed")` returns `null` in the browser — and `X-Seed` is the **only** way to learn the seed when the user leaves the seed field blank (server-generated). Therefore the backend must explicitly expose the batch endpoint's custom headers. This is a required, deliberate part of this feature, not an afterthought.

## Architecture

One small backend change (expose headers) plus a new self-contained frontend route. The route is decomposed into two pure-ish libraries (one that performs the download + returns a metadata record, one that persists records) and two presentational components (the form, the history table), glued by a thin page component that owns state. Each unit has a single responsibility and a clear interface, so they can be reasoned about and changed independently.

## Components

### Backend

**1. `backend/server.py` — expose custom headers via CORS**
Change `CORS(app)` to:
```python
CORS(app, expose_headers=["X-Seed", "X-Returned", "X-Skipped", "X-Warning", "Content-Disposition"])
```
No new endpoint; the batch route is unchanged. This is the only backend change.

### Frontend

**2. `frontend/src/lib/batchExport.ts` (new) — perform the export + return a record**
- `BatchParams` type: `{ count: number; format: "csv" | "json"; indicators: boolean; period: string; seed?: number | null }`.
- `BatchRunResult` type: `{ seed: number; count: number; format: "csv" | "json"; indicators: boolean; period: string; returned: number; skipped: number; warning: string | null; exported_at: string }`.
- `runBatchExport(params: BatchParams): Promise<BatchRunResult>`:
  - Builds the query string against `API_BASE` (`process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"`): `count, format, indicators (1/0), period, interval=1d`, and `seed` only when provided.
  - `fetch` the URL. If `!res.ok`, read the JSON `{error}` body and `throw new Error(error)`.
  - Read headers: `X-Seed` (→ number), `X-Returned`, `X-Skipped` (→ numbers), `X-Warning` (string | null).
  - `await res.blob()`, then trigger a download via an object URL (`<a download>` pattern, mirroring `downloadFile` in `lib/export.ts`). Filename: parse `Content-Disposition` `filename=...`; fall back to `batch_${count}_seed${seed}_${clientTimestamp}.${ext}`.
  - Return the `BatchRunResult` (seed echoed from the header, so a blank-seed run is still reproducible).
- Single responsibility: turn params into a downloaded file + a metadata record. No React, no storage.

**3. `frontend/src/lib/batchHistory.ts` (new) — persist run records**
- `BatchRecord = BatchRunResult & { id: string }`.
- `loadHistory(): BatchRecord[]` — read + JSON-parse the `localStorage` key `batch_export_history`; return `[]` on missing/parse-error (never throw).
- `addRecord(result: BatchRunResult): BatchRecord[]` — prepend a new record (id = `exported_at` + seed, or a counter), cap the list at the **most recent 50**, persist, return the new list.
- `removeRecord(id: string): BatchRecord[]` and `clearHistory(): BatchRecord[]`.
- Guards against SSR (`typeof window === "undefined"` → return `[]`/no-op) since Next.js may evaluate modules server-side.
- Single responsibility: localStorage CRUD for run metadata.

**4. `frontend/src/components/BatchExportForm.tsx` (new) — the configuration form**
- Props: `{ onRun: (params: BatchParams) => void; running: boolean }`.
- Controlled inputs: `count` (number, min 1, max 150, default 100), `format` (select csv/json, default csv), `indicators` (checkbox, default true), `period` (select over the allowed periods, default `max`), `seed` (text/number, blank allowed).
- Client-side guardrails mirroring the server: clamp `count` to `[1,150]`; `seed` must be empty or an integer (else the field shows invalid and Run is disabled).
- "Run & Download" button calls `onRun(params)`; disabled while `running`.
- Presentational — owns only its input state; delegates the run to the parent.

**5. `frontend/src/components/BatchHistoryTable.tsx` (new) — the saved-runs table**
- Props: `{ records: BatchRecord[]; onReDownload: (r: BatchRecord) => void; onRemove: (id: string) => void; onClear: () => void; busyId: string | null }`.
- Columns: seed, count, format, indicators, period, returned/skipped, exported_at. Per-row **Re-download** (disabled when `busyId` is set) and **Remove**; a **Clear all** control. Empty state when no records.
- Presentational — no storage or fetch; calls the prop callbacks.

**6. `frontend/src/app/batch/page.tsx` (new) — the route + state glue**
- `"use client"`. Owns: `history` (init from `loadHistory()` in a mount effect to avoid SSR mismatch), `running` boolean, `busyId` (for re-downloads), `elapsed` seconds timer, `notice` (`{type: "error" | "warning"; text}`).
- `handleRun(params)`: set running + start the elapsed timer; `await runBatchExport(params)`; on success `setHistory(addRecord(result))` and, if `result.warning`, show an amber notice; on throw show a red notice; finally clear running/timer.
- `handleReDownload(record)`: set `busyId`; `await runBatchExport({count, format, indicators, period, seed: record.seed})`; re-download does **not** add a new row (avoids duplicates); surface warning/error the same way; clear `busyId`.
- `handleRemove(id)` / `handleClear()`: update via the store helpers.
- Renders a simple page header (title; the app logo/title links home), `BatchExportForm`, the spinner/elapsed note while `running`, the `notice`, then `BatchHistoryTable`. Matches the dark Tailwind theme used across the app.

**7. `frontend/src/app/page.tsx` (modify) — dashboard access**
Add a Next `<Link href="/batch">` styled as a button ("Batch Export") in the header, next to `<ExportMenu>`.

## Data flow

```
/batch (client):
  BatchExportForm → onRun(params) → page.handleRun
    → runBatchExport(params)                    [lib/batchExport.ts]
       GET {API_BASE}/api/export/batch?count&format&indicators&period&seed  (interval=1d)
       !ok → parse {error} → throw              | ok → read X-Seed/X-Returned/X-Skipped/X-Warning
       blob() → download (Content-Disposition filename, else rebuilt)
       return BatchRunResult (seed from header)
    → addRecord(result)                         [lib/batchHistory.ts → localStorage, cap 50]
    → setHistory(...) → BatchHistoryTable re-renders

  Re-download(row) → runBatchExport({...row params, seed: row.seed})  (same seed → same symbols)

Dashboard header → <Link href="/batch"> → navigates to the page
```

## Error handling

- **Non-2xx** (`400` bad params, `500` missing universe): `runBatchExport` parses the JSON `{error}` and throws; the page shows a red notice with that message.
- **Network failure / backend down:** `fetch` rejects; the page shows a red notice.
- **All symbols skipped** (`200`, `returned 0`): the body is a header-only CSV / empty-`stocks` JSON; `X-Warning` is set. The page shows an amber notice and still records the run (so the seed is kept).
- **Client validation:** `count` clamped to `[1,150]`; non-integer `seed` blocks Run with an inline invalid state — fail fast before the request.
- **localStorage unavailable / corrupt:** `loadHistory` returns `[]` rather than throwing; writes are wrapped so a quota/serialization error degrades to an in-memory list for the session (no crash).

## Testing

No automated test harness; verification is `npm run build` (typecheck) plus manual checks. The backend already has live verification from the prior feature.

- **Backend CORS:** with the server running, confirm the batch response carries `Access-Control-Expose-Headers` including `X-Seed` (e.g. inline test client: `server.app.test_client().get("/api/export/batch?count=1&seed=1&period=5d").headers.get("Access-Control-Expose-Headers")` contains `X-Seed`).
- **Frontend typecheck:** `npm run build` succeeds.
- **Manual (servers running):**
  - Dashboard header shows "Batch Export"; clicking it routes to `/batch`.
  - Run with `count=5, seed=123, format=csv` → a CSV file downloads; a history row appears with seed `123`, returned/skipped, time.
  - Reload `/batch` → the row is still there (localStorage persistence).
  - Re-download that row → the same file downloads again; no duplicate row added.
  - Leave seed blank → run → the recorded row shows the concrete server-generated seed (proves header exposure works).
  - Error path: set backend off (or `count` beyond range server-side) → red notice; an all-skipped scenario → amber notice.
  - Remove a row / Clear all → history updates and persists.

## Out of scope

- Async/progress-streamed exports (the endpoint is synchronous; the UI shows an elapsed timer + expectation note instead).
- Server-side persistence of exports or storing file blobs in the browser.
- Intraday intervals (UI fixes `interval=1d`).
- Auth / multi-user history.
