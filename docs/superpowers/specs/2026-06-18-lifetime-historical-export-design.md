# Lifetime Historical Data Export — Design

**Date:** 2026-06-18
**Status:** Approved (design)

## Problem

Users need to export the full lifetime historical price data for any stock symbol.

The export feature already exists ([ExportMenu.tsx](../../../frontend/src/components/ExportMenu.tsx), [export.ts](../../../frontend/src/lib/export.ts)) and supports Stock Details / Price History / Full Report in CSV / JSON / XLS for single and multiple stocks. But "Price History" exports only the history snapshot currently loaded in the dashboard, which is bound to the chart's selected period (default `1mo`, max button `5y`). It is therefore never guaranteed to be lifetime data.

The backend already supports lifetime data: `get_historical_data_yfinance(symbol, period="max", interval="1d")` ([data_collector_api.py:70](../../../backend/data_collector_api.py#L70)) and the `/api/stock/<symbol>/history?period=max&interval=1d` endpoint. The missing piece is a frontend path that requests `max` independently of the chart.

## Approach

**Decouple export from the chart snapshot.** When the user exports Price History or Full Report, fetch `period=max, interval=1d` fresh at export time per symbol, rather than reusing the displayed window. Also add a `Max` button to the chart period selector so the dashboard can show lifetime too.

Rejected alternatives:
- **Chart snapshot only** (add Max button, export keeps reusing the loaded snapshot): fragile — multi-stock symbols hold different last-loaded periods, and the user can forget to click Max, silently producing non-lifetime exports. Fails the "any symbol" guarantee.
- **Backend export endpoint** (server streams the file via pandas): duplicates the existing frontend formatters and adds infra; overkill for current scope.

## Scope of "lifetime"

- Lifetime = yfinance `period="max"` at `interval="1d"` (full daily history since IPO). Intraday intervals cannot return lifetime — yfinance caps them to recent days server-side — so daily granularity is implied.
- Applies to **Price History** and **Full Report** exports only. **Stock Details** is not a time series; it is exported as-is with no fetch.

## Components

### 1. `frontend/src/lib/api.ts`
No change. `getHistory(symbol, period, interval)` already accepts the arguments needed; it will be called with `("max", "1d")`.

### 2. `frontend/src/components/StockDashboard.tsx`
Add `{ value: "max", label: "Max" }` to the `periods` array (line ~74-82). Cosmetic — lets the chart render lifetime. Independent of the export path.

### 3. `frontend/src/components/ExportMenu.tsx`
Core change:
- `handleExport` becomes `async`.
- New state: `exporting: boolean`, `exportError: string | null`.
- For `dataType === "history" | "full"`:
  - Single scope: `await api.getHistory(currentBundle.stock.symbol, "max", "1d")`, build `{ stock: currentBundle.stock, history: res.data }`, pass to `exportSingle`.
  - Multi scope: `Promise.allSettled(allBundles.map(b => api.getHistory(b.stock.symbol, "max", "1d")))`, rebuild each bundle's `history` from the fresh result while keeping its existing `stock` details; pass surviving bundles to `exportMulti`.
- For `dataType === "details"`: no fetch; call `exportSingle`/`exportMulti` directly as today.
- While fetching: set `exporting = true`, show a spinner on the format button and disable it.
- The existing `export.ts` formatter functions are unchanged.

## Data flow

```
User: Export -> scope -> (Price History | Full Report) -> format
  -> ExportMenu.handleExport(format)        [async]
     -> if details: exportSingle/exportMulti(...)   (no fetch)
     -> else:
        single: res = await getHistory(sym, "max", "1d")
                exportSingle(format, stock, res.data, dataType)
        multi:  results = await Promise.allSettled(getHistory(sym_i, "max", "1d"))
                bundles' = surviving bundles with fresh history
                exportMulti(format, bundles', dataType)
     -> file downloads
```

## Error handling

- **Fetch failure** (invalid symbol, Yahoo throttling): caught in `handleExport`; set `exportError`, show inline red message in the menu, no download. Reuses the red-text styling already present in the codebase.
- **Empty `max` result** (delisted / no data): the existing formatters already early-return on `!data.length`. Surface a "no data" message rather than a silent no-op.
- **Partial multi-stock failure:** use `Promise.allSettled` so one bad ticker does not abort the whole export. Export the symbols that succeeded; report which were skipped.

## Testing

No automated test harness exists in the repo; verification is manual via the running frontend.

- AAPL -> export Price History CSV -> rows span from the 1980s to today, daily cadence.
- IBM (old ticker) -> ~16k daily rows, no truncation.
- Multi (AAPL + TSLA) -> single CSV, both full histories present.
- Bad symbol mid-multi -> other symbols still export; skipped one reported.
- Stock Details export -> still instant, no fetch performed.
- Full Report (JSON) -> contains lifetime `historical_data` and current `stock_details`.

## Out of scope

- Caching exported data.
- Configurable interval for lifetime export (fixed at `1d`).
- Changing chart rendering performance for large datasets (lifetime is primarily an export concern; the Max chart button is a convenience).
