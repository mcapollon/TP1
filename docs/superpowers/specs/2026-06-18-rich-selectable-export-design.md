# Rich, Selectable Export Columns — Design

**Date:** 2026-06-18
**Status:** Approved (design)
**Builds on:** [2026-06-18-lifetime-historical-export-design.md](2026-06-18-lifetime-historical-export-design.md)

## Problem

The Price History export contains only `date, open, high, low, close, volume`. yfinance returns more data that the backend currently discards, and the user wants the richest possible export for training a model — plus the ability to choose which columns to include.

Specifically:
1. yfinance returns `Dividends` and `Stock Splits` on every history call; these are dropped in [data_collector_api.py:83-90](../../../backend/data_collector_api.py#L83-L90).
2. The current `Close` is silently auto-adjusted (yfinance default `auto_adjust=True`), so the export today is adjusted, not raw — the opposite of what a user expecting "raw accuracy" assumes.
3. No computed/derived features (returns, moving averages, RSI, etc.) — the user must build all of them downstream.
4. No way to pick which columns land in the file.
5. The fundamentals snapshot exposes ~18 of yfinance's `.info` fields.

## Decisions (from brainstorming)

- **Prices:** export **raw OHLC + Adj Close** (`auto_adjust=False`), plus `Dividends` and `Stock Splits`. Raw for accuracy/reference; adjusted so return-based features aren't corrupted by split/dividend jumps.
- **Indicators:** **comprehensive** set, computed server-side on the **adjusted** series.
- **Column picker:** client-side selection over the **time-series** columns. Fundamentals are exported in full but are **not** individually pickable (avoids a ~30-item checkbox wall).
- **Architecture (A1):** backend always returns the full enriched dataset (indicators behind a query param); the frontend filters columns at file-write time. Rejected: backend `columns=` param (couples backend to UI, forces refetch); JS-side indicator math (duplicates pandas, error-prone).

## Why adjusted for indicators

A stock split (e.g. AAPL 4-for-1 on 2020-08-31, raw ~$500 → ~$125) or an ex-dividend date creates an artificial negative return in a **raw** price series. Returns, volatility, RSI, etc. computed on raw prices spike falsely on those dates. Computing them on the adjusted series removes the artifact. Raw prices remain available as their own columns for reference.

## Architecture

Backend enriches history rows and the fundamentals snapshot; indicator math is isolated in a dedicated module. The frontend gains a column-picker step in the export menu and plots the adjusted close so the chart stays smooth across splits. Indicators are computed only when requested (export path), keeping the chart's fetch lean.

## Components

### Backend

**1. `backend/indicators.py` (new) — `add_indicators(df) -> df`**
Single responsibility: take a yfinance history DataFrame (with `auto_adjust=False` columns) and return it with indicator columns appended. Computes on the **adjusted** OHLC, derived from the adjustment factor `f = Adj Close / Close` applied to `Open/High/Low` (yfinance only adjusts Close):

- `return` — adjusted close pct change
- `log_return` — ln(adj_close / adj_close.shift(1))
- `sma_20`, `sma_50` — rolling mean of adj_close
- `ema_12`, `ema_26` — exponential moving averages of adj_close
- `macd` = ema_12 − ema_26; `macd_signal` = ema(macd, 9); `macd_hist` = macd − macd_signal
- `volatility_20` — rolling std (20) of `return`
- `rsi_14` — Wilder RSI on adj_close
- `bb_mid` = sma_20; `bb_upper`/`bb_lower` = bb_mid ± 2 × rolling std(20) of adj_close
- `atr_14` — average true range on adjusted high/low/close
- `obv` — on-balance volume (adj_close direction × volume)
- `stoch_k`, `stoch_d` — stochastic oscillator (14) on adjusted high/low/close
- `volume_change` — volume pct change

Warm-up rows (insufficient history) yield `NaN`, serialized as `null`. Values rounded to a sensible precision (prices 2 dp, ratios 4–6 dp).

**2. `backend/data_collector_api.py` — `get_historical_data_yfinance(symbol, period, interval, indicators=False)`**
- Fetch with `auto_adjust=False`.
- Each record: `date, open, high, low, close` (raw), `adj_close, volume, dividends, stock_splits`.
- If `indicators=True`: run `add_indicators` and include the indicator fields in each record.

**3. `backend/data_collector_api.py` — `get_stock_info_yfinance`**
Add fields from `.info`: `beta, trailing_eps, forward_pe, price_to_book, profit_margins, return_on_equity, revenue, ebitda, shares_outstanding, avg_volume, fifty_two_week_change, book_value`. Missing values → `None` (existing pattern).

**4. `backend/server.py` — `/api/stock/<symbol>/history`**
Read `?indicators=1` (truthy) and pass to the collector. Default off.

### Frontend

**5. `frontend/src/lib/api.ts`**
- Extend `HistoricalPoint` with optional `adj_close, dividends, stock_splits` and all indicator fields (all optional numbers/nullable).
- Extend `StockInfo` with the new fundamentals fields (all optional).
- `getHistory(symbol, period="1mo", interval="1d", indicators=false)` — append `&indicators=1` when true.

**6. `frontend/src/components/PriceChart.tsx`**
Plot `adj_close ?? close` so the price line is split-smooth. (Volume chart unchanged.) The dashboard's chart fetch leaves `indicators` off.

**7. `frontend/src/lib/export.ts`**
History export functions (`exportHistoryCSV/JSON/XLS`, and the multi variants) accept an ordered `columns: string[]` and emit only those columns (dynamic headers built from the selection). When no `columns` provided, default to the full set (backward compatible). Details exports unchanged (full fundamentals).

**8. `frontend/src/components/ExportMenu.tsx`**
- New **"columns"** step between *data* and *format*, shown only for `history` and `full` data types.
- Checklist grouped: **Prices** (open, high, low, close, adj_close, volume), **Corporate actions** (dividends, stock_splits), **Indicators** (the computed set). `date` always included (not a toggle). All checked by default; select-all / select-none controls.
- On export of history/full: `await getHistory(symbol, "max", "1d", true)`, then pass the selected `columns` to the export functions.
- `details` data type: skips the columns step (exports full fundamentals as today).

## Data flow

```
Export -> scope -> (Price History | Full Report) -> columns step -> format
  -> handleExport(format)
     -> getHistory(sym, "max", "1d", indicators=true)   [per symbol]
     -> exportSingle/exportMulti(format, stock, history, dataType, selectedColumns)
     -> file written with only selected columns
Chart path (unchanged): getHistory(sym, period)  [indicators omitted] -> plot adj_close ?? close
```

## Error handling

- Indicator computation throws → backend logs, returns base columns without indicators (export still succeeds); frontend shows the warning notice if indicator columns were requested but absent.
- Zero columns selected → format buttons disabled with "Select at least one column."
- Reuse the existing amber-warning / red-error notice component from the lifetime-export work.
- Multi-stock partial failure handling (Promise.allSettled, skipped-symbol reporting) carries over unchanged.

## Testing

No automated test harness; verification is manual + a backend data check via the venv.

- **Backend (venv python):** call `get_historical_data_yfinance("AAPL","max","1d",indicators=True)`:
  - new columns present (`adj_close, dividends, stock_splits` and the indicator set);
  - indicator NaN appears only in warm-up rows;
  - the `return` value on 2020-08-31 (AAPL split) is a normal small magnitude, not ≈ −0.75 (proves adjusted-series computation).
- **Frontend:** `npm run build` (typecheck). Manual: select a subset of columns → export CSV → file contains exactly those columns (plus `date`); deselect all → format disabled; chart line smooth across a known split.

## Out of scope

- Per-field picker for fundamentals (exported in full).
- Configurable indicator parameters / windows (fixed defaults).
- Historical (time-series) fundamentals — not available from this source.
- Caching enriched data between exports.
