# Rich, Selectable Export Columns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the stock export with raw OHLC + adjusted close + corporate actions + a comprehensive set of computed technical indicators, and let the user choose which time-series columns to export.

**Architecture:** Backend fetches with `auto_adjust=False` and (on request) appends indicator columns computed on the adjusted series in a dedicated `indicators.py` module. The `/history` endpoint gains an `indicators=1` query param (export uses it; the chart does not). The frontend extends its types, plots the adjusted close, adds a column-picker step to the export menu, and filters columns at file-write time.

**Tech Stack:** Python 3 / Flask / yfinance / pandas / numpy (backend); Next.js 14 / React 18 / TypeScript / recharts (frontend). No automated test framework exists — backend verification uses inline `python -c` snippets via the venv; frontend uses `npm run build`.

---

## Canonical column keys (single source of truth)

These snake_case keys MUST match exactly between backend records (Tasks 1-2) and frontend types/picker (Tasks 5, 7, 8):

- Always present: `date`
- Prices: `open, high, low, close, adj_close, volume`
- Corporate actions: `dividends, stock_splits`
- Indicators: `return, log_return, sma_20, sma_50, ema_12, ema_26, macd, macd_signal, macd_hist, volatility_20, rsi_14, bb_upper, bb_mid, bb_lower, atr_14, obv, stoch_k, stoch_d, volume_change`

## File Structure

- `backend/indicators.py` — NEW. `add_indicators(df)`: pure DataFrame → DataFrame indicator math. One responsibility.
- `backend/data_collector_api.py` — MODIFY. History enrichment (raw OHLC + adj_close + corporate actions + optional indicators); richer fundamentals.
- `backend/server.py` — MODIFY. `/history` reads `indicators` query param.
- `frontend/src/lib/api.ts` — MODIFY. Extend `HistoricalPoint` + `StockInfo`; `getHistory` gains `indicators` arg.
- `frontend/src/components/PriceChart.tsx` — MODIFY. Plot `adj_close ?? close`.
- `frontend/src/lib/export.ts` — MODIFY. History exports filter by selected columns; export `HISTORY_COLUMNS`.
- `frontend/src/components/ExportMenu.tsx` — MODIFY. New "columns" step; request indicators; pass selected columns.

All backend commands run from `c:\Users\lmapollon\Projects\Others\TP1\backend`; frontend commands from `c:\Users\lmapollon\Projects\Others\TP1\frontend`. Shell is PowerShell — chain with `;`, not `&&`. Already on branch `feat/rich-selectable-export`; do NOT create/switch branches.

---

### Task 1: Backend indicators module

**Files:**
- Create: `backend/indicators.py`

- [ ] **Step 1: Create `backend/indicators.py`**

```python
"""
indicators.py — Technical indicator computation.

Takes a yfinance history DataFrame fetched with auto_adjust=False (columns
Open, High, Low, Close, 'Adj Close', Volume, Dividends, Stock Splits) and
appends indicator columns.

All indicators are computed on the ADJUSTED series so that stock splits and
dividends do not create artificial jumps in returns/volatility/etc. yfinance
only adjusts Close, so adjusted Open/High/Low are derived from the adjustment
factor (Adj Close / Close).
"""

import numpy as np
import pandas as pd


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with technical-indicator columns appended.

    Warm-up rows (insufficient history for a window) contain NaN; callers are
    responsible for serializing NaN as null.
    """
    out = df.copy()

    close = out["Close"]
    adj_close = out["Adj Close"]
    factor = (adj_close / close).replace([np.inf, -np.inf], np.nan).fillna(1.0)
    adj_open = out["Open"] * factor
    adj_high = out["High"] * factor
    adj_low = out["Low"] * factor
    volume = out["Volume"]

    # Returns
    out["return"] = adj_close.pct_change()
    out["log_return"] = np.log(adj_close / adj_close.shift(1))

    # Moving averages
    out["sma_20"] = adj_close.rolling(window=20).mean()
    out["sma_50"] = adj_close.rolling(window=50).mean()
    out["ema_12"] = adj_close.ewm(span=12, adjust=False).mean()
    out["ema_26"] = adj_close.ewm(span=26, adjust=False).mean()

    # MACD
    macd = out["ema_12"] - out["ema_26"]
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    out["macd"] = macd
    out["macd_signal"] = macd_signal
    out["macd_hist"] = macd - macd_signal

    # Volatility: rolling std of daily returns
    out["volatility_20"] = out["return"].rolling(window=20).std()

    # RSI (Wilder, 14)
    delta = adj_close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / 14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / 14, adjust=False).mean()
    rs = avg_gain / avg_loss
    out["rsi_14"] = 100 - (100 / (1 + rs))

    # Bollinger Bands (20, 2 std)
    bb_mid = adj_close.rolling(window=20).mean()
    bb_std = adj_close.rolling(window=20).std()
    out["bb_mid"] = bb_mid
    out["bb_upper"] = bb_mid + 2 * bb_std
    out["bb_lower"] = bb_mid - 2 * bb_std

    # ATR (14) on adjusted high/low/close
    prev_close = adj_close.shift(1)
    true_range = pd.concat(
        [
            adj_high - adj_low,
            (adj_high - prev_close).abs(),
            (adj_low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    out["atr_14"] = true_range.ewm(alpha=1 / 14, adjust=False).mean()

    # On-balance volume
    direction = np.sign(adj_close.diff()).fillna(0)
    out["obv"] = (direction * volume).cumsum()

    # Stochastic oscillator (14)
    low_14 = adj_low.rolling(window=14).min()
    high_14 = adj_high.rolling(window=14).max()
    stoch_k = 100 * (adj_close - low_14) / (high_14 - low_14)
    out["stoch_k"] = stoch_k
    out["stoch_d"] = stoch_k.rolling(window=3).mean()

    # Volume change
    out["volume_change"] = volume.pct_change()

    return out
```

- [ ] **Step 2: Verify it computes and is split-safe**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "import yfinance as yf; from indicators import add_indicators; h=yf.Ticker('AAPL').history(period='max', interval='1d', auto_adjust=False); h=add_indicators(h); print('cols', [c for c in h.columns if c in ('return','rsi_14','macd','atr_14','obv','stoch_k')]); r=h.loc['2020-08-31','return']; print('split-day return', round(float(r),4)); print('rsi sample', round(float(h['rsi_14'].dropna().iloc[-1]),2))"
```
Expected: the indicator columns are listed; the 2020-08-31 (AAPL 4-for-1 split) `return` is a small magnitude (roughly -0.01 to +0.05), **not** ≈ -0.75; RSI sample is a number between 0 and 100.

- [ ] **Step 3: Commit**

```bash
git add backend/indicators.py
git commit -m "feat: add technical indicators module (adjusted-series)"
```

---

### Task 2: Backend history enrichment + indicators param

**Files:**
- Modify: `backend/data_collector_api.py` (imports; `get_historical_data_yfinance`)

- [ ] **Step 1: Add imports and helpers near the top of `data_collector_api.py`**

The file currently imports (lines 14-22): `os, json, time, datetime/timedelta, yfinance as yf, requests, pandas as pd, dotenv`. Add `import math` to the stdlib imports, and add `from indicators import add_indicators` after the third-party imports. Then add these module-level helpers right after `os.makedirs(DATA_DIR, exist_ok=True)` (line 27):

```python
# Per-indicator rounding precision (column name -> decimal places).
INDICATOR_PRECISION = {
    "return": 6, "log_return": 6, "volume_change": 6, "volatility_20": 6,
    "rsi_14": 2, "stoch_k": 2, "stoch_d": 2,
    "sma_20": 2, "sma_50": 2, "ema_12": 2, "ema_26": 2,
    "macd": 4, "macd_signal": 4, "macd_hist": 4,
    "bb_upper": 2, "bb_mid": 2, "bb_lower": 2, "atr_14": 4, "obv": 0,
}


def _clean(value, digits=2):
    """Round a numeric value, converting None/NaN/inf to None for JSON."""
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    return round(f, digits)
```

- [ ] **Step 2: Replace `get_historical_data_yfinance`**

The current function (lines 70-91) is:

```python
def get_historical_data_yfinance(
    symbol: str, period: str = "1mo", interval: str = "1d"
) -> list[dict]:
    """
    Récupère les données historiques.
    period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    interval: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
    """
    ticker = yf.Ticker(symbol)
    hist = ticker.history(period=period, interval=interval)

    records = []
    for date, row in hist.iterrows():
        records.append({
            "date": date.isoformat(),
            "open": round(row["Open"], 2),
            "high": round(row["High"], 2),
            "low": round(row["Low"], 2),
            "close": round(row["Close"], 2),
            "volume": int(row["Volume"]),
        })
    return records
```

Replace it entirely with:

```python
def get_historical_data_yfinance(
    symbol: str, period: str = "1mo", interval: str = "1d", indicators: bool = False
) -> list[dict]:
    """
    Récupère les données historiques (prix bruts + clôture ajustée + actions
    sur titres). Si indicators=True, ajoute les indicateurs techniques.

    period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
    interval: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
    """
    ticker = yf.Ticker(symbol)
    # auto_adjust=False -> raw OHLC + a separate 'Adj Close' column, plus
    # 'Dividends' and 'Stock Splits'.
    hist = ticker.history(period=period, interval=interval, auto_adjust=False)

    if indicators and not hist.empty:
        try:
            hist = add_indicators(hist)
        except Exception as exc:  # degrade gracefully — export base columns
            print(f"[indicators] computation failed for {symbol}: {exc}")
            indicators = False

    records = []
    for date, row in hist.iterrows():
        volume = row["Volume"]
        record = {
            "date": date.isoformat(),
            "open": _clean(row["Open"]),
            "high": _clean(row["High"]),
            "low": _clean(row["Low"]),
            "close": _clean(row["Close"]),
            "adj_close": _clean(row["Adj Close"]),
            "volume": int(volume) if pd.notna(volume) else None,
            "dividends": _clean(row.get("Dividends", 0.0), 4),
            "stock_splits": _clean(row.get("Stock Splits", 0.0), 4),
        }
        if indicators:
            for col, digits in INDICATOR_PRECISION.items():
                record[col] = _clean(row.get(col), digits)
        records.append(record)
    return records
```

- [ ] **Step 3: Verify enriched output**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "from data_collector_api import get_historical_data_yfinance as g; r=g('AAPL','1mo','1d',indicators=True); print('keys', sorted(r[-1].keys())); print('has adj_close', 'adj_close' in r[-1]); print('rsi last', r[-1]['rsi_14']); base=g('AAPL','1mo','1d'); print('base has indicators?', 'rsi_14' in base[-1])"
```
Expected: keys include `adj_close, dividends, stock_splits` and the indicator columns; `base has indicators? False` (default call stays lean).

- [ ] **Step 4: Commit**

```bash
git add backend/data_collector_api.py
git commit -m "feat: export raw OHLC, adj close, corporate actions, optional indicators"
```

---

### Task 3: Backend richer fundamentals

**Files:**
- Modify: `backend/data_collector_api.py` (`get_stock_info_yfinance` return dict, lines 43-67)

- [ ] **Step 1: Add fields to the returned dict**

In `get_stock_info_yfinance`, the returned dict currently ends with (lines 61-67):

```python
        "currency": info.get("currency", "USD"),
        "exchange": info.get("exchange", "N/A"),
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "timestamp": datetime.now().isoformat(),
        "source": "yfinance",
    }
```

Replace that closing block with (insert the new fundamentals before `timestamp`):

```python
        "currency": info.get("currency", "USD"),
        "exchange": info.get("exchange", "N/A"),
        "sector": info.get("sector", "N/A"),
        "industry": info.get("industry", "N/A"),
        "beta": info.get("beta"),
        "trailing_eps": info.get("trailingEps"),
        "forward_pe": info.get("forwardPE"),
        "price_to_book": info.get("priceToBook"),
        "profit_margins": info.get("profitMargins"),
        "return_on_equity": info.get("returnOnEquity"),
        "revenue": info.get("totalRevenue"),
        "ebitda": info.get("ebitda"),
        "shares_outstanding": info.get("sharesOutstanding"),
        "avg_volume": info.get("averageVolume"),
        "fifty_two_week_change": info.get("52WeekChange") or info.get("fiftyTwoWeekChange"),
        "book_value": info.get("bookValue"),
        "timestamp": datetime.now().isoformat(),
        "source": "yfinance",
    }
```

- [ ] **Step 2: Verify**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "from data_collector_api import get_stock_info_yfinance as f; d=f('AAPL'); print('beta', d.get('beta')); print('eps', d.get('trailing_eps')); print('shares', d.get('shares_outstanding'))"
```
Expected: numeric values printed (or `None` for any field Yahoo omits — that is acceptable).

- [ ] **Step 3: Commit**

```bash
git add backend/data_collector_api.py
git commit -m "feat: expand fundamentals fields in stock info"
```

---

### Task 4: Backend `/history` indicators param

**Files:**
- Modify: `backend/server.py` (`get_history`, lines 83-110)

- [ ] **Step 1: Read and pass the `indicators` query param**

In `get_history`, after the line `interval = request.args.get("interval", "1d")` (line 90), add:

```python
    indicators = request.args.get("indicators") in ("1", "true", "True")
```

Then change the data call (line 101) from:

```python
        data = get_historical_data_yfinance(symbol, period=period, interval=interval)
```
to:
```python
        data = get_historical_data_yfinance(symbol, period=period, interval=interval, indicators=indicators)
```

- [ ] **Step 2: Verify the route wiring (no server needed)**

Run from `backend` (uses Flask's test client, so no running server required):
```bash
./venv/Scripts/python.exe -c "import server; c=server.app.test_client(); r=c.get('/api/stock/AAPL/history?period=5d&interval=1d&indicators=1'); j=r.get_json(); print('status', r.status_code); print('row keys', sorted(j['data'][-1].keys())[:6]); print('has rsi', 'rsi_14' in j['data'][-1])"
```
Expected: status 200; `has rsi True`.

- [ ] **Step 3: Commit**

```bash
git add backend/server.py
git commit -m "feat: accept indicators query param on history endpoint"
```

---

### Task 5: Frontend types + getHistory arg

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Extend `HistoricalPoint`**

Replace the current `HistoricalPoint` interface (lines 42-49):

```ts
export interface HistoricalPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

with:

```ts
export interface HistoricalPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adj_close?: number | null;
  dividends?: number | null;
  stock_splits?: number | null;
  // Indicators — present only when fetched with indicators=true
  return?: number | null;
  log_return?: number | null;
  sma_20?: number | null;
  sma_50?: number | null;
  ema_12?: number | null;
  ema_26?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_hist?: number | null;
  volatility_20?: number | null;
  rsi_14?: number | null;
  bb_upper?: number | null;
  bb_mid?: number | null;
  bb_lower?: number | null;
  atr_14?: number | null;
  obv?: number | null;
  stoch_k?: number | null;
  stoch_d?: number | null;
  volume_change?: number | null;
}
```

- [ ] **Step 2: Extend `StockInfo`**

In the `StockInfo` interface, add these fields immediately before `change_percent?: number;` (line 32):

```ts
  beta?: number;
  trailing_eps?: number;
  forward_pe?: number;
  price_to_book?: number;
  profit_margins?: number;
  return_on_equity?: number;
  revenue?: number;
  ebitda?: number;
  shares_outstanding?: number;
  avg_volume?: number;
  fifty_two_week_change?: number;
  book_value?: number;
```

- [ ] **Step 3: Add `indicators` arg to `getHistory`**

Replace the current `getHistory` (lines 83-90):

```ts
  getHistory: (
    symbol: string,
    period = "1mo",
    interval = "1d"
  ): Promise<HistoryResponse> =>
    apiFetch(
      `/api/stock/${encodeURIComponent(symbol)}/history?period=${period}&interval=${interval}`
    ),
```

with:

```ts
  getHistory: (
    symbol: string,
    period = "1mo",
    interval = "1d",
    indicators = false
  ): Promise<HistoryResponse> =>
    apiFetch(
      `/api/stock/${encodeURIComponent(symbol)}/history?period=${period}&interval=${interval}${
        indicators ? "&indicators=1" : ""
      }`
    ),
```

- [ ] **Step 4: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds (these are additive type changes; existing callers still compile).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: extend HistoricalPoint/StockInfo types and getHistory indicators arg"
```

---

### Task 6: Chart plots adjusted close

**Files:**
- Modify: `frontend/src/components/PriceChart.tsx`

- [ ] **Step 1: Use `adj_close ?? close` for the plotted series**

Replace the block computing `firstClose`/`lastClose`/`chartData` (lines 28-39):

```tsx
  const firstClose = data[0]?.close ?? 0;
  const lastClose = data[data.length - 1]?.close ?? 0;
  const isPositive = lastClose >= firstClose;
  const color = isPositive ? "#22c55e" : "#ef4444";

  const chartData = data.map((d) => ({
    ...d,
    date: new Date(d.date).toLocaleDateString("fr-FR", {
      month: "short",
      day: "numeric",
    }),
  }));
```

with:

```tsx
  const firstClose = data[0]?.adj_close ?? data[0]?.close ?? 0;
  const lastClose =
    data[data.length - 1]?.adj_close ?? data[data.length - 1]?.close ?? 0;
  const isPositive = lastClose >= firstClose;
  const color = isPositive ? "#22c55e" : "#ef4444";

  const chartData = data.map((d) => ({
    ...d,
    price: d.adj_close ?? d.close,
    date: new Date(d.date).toLocaleDateString("fr-FR", {
      month: "short",
      day: "numeric",
    }),
  }));
```

- [ ] **Step 2: Point the Area at the new `price` key**

Replace the `<Area ... dataKey="close" ... />` element (lines 75-81):

```tsx
          <Area
            type="monotone"
            dataKey="close"
            stroke={color}
            strokeWidth={2}
            fill="url(#priceGradient)"
          />
```

with:

```tsx
          <Area
            type="monotone"
            dataKey="price"
            stroke={color}
            strokeWidth={2}
            fill="url(#priceGradient)"
          />
```

- [ ] **Step 3: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/PriceChart.tsx
git commit -m "feat: plot adjusted close so price line is split-smooth"
```

---

### Task 7: Export column filtering

**Files:**
- Modify: `frontend/src/lib/export.ts`

- [ ] **Step 1: Add the canonical column list at the top of `export.ts`**

After the existing `import` line and the `ExportFormat` type (after line 3), add:

```ts
// Canonical history column order. `date` is always included.
export const HISTORY_COLUMNS: string[] = [
  "date",
  "open",
  "high",
  "low",
  "close",
  "adj_close",
  "volume",
  "dividends",
  "stock_splits",
  "return",
  "log_return",
  "sma_20",
  "sma_50",
  "ema_12",
  "ema_26",
  "macd",
  "macd_signal",
  "macd_hist",
  "volatility_20",
  "rsi_14",
  "bb_upper",
  "bb_mid",
  "bb_lower",
  "atr_14",
  "obv",
  "stoch_k",
  "stoch_d",
  "volume_change",
];

function pickColumns(selected?: string[]): string[] {
  // Default to all known columns; always keep `date` first.
  const cols = selected && selected.length ? selected : HISTORY_COLUMNS;
  const withDate = cols.includes("date") ? cols : ["date", ...cols];
  return withDate;
}
```

- [ ] **Step 2: Make the single-stock history exporters column-aware**

Replace `exportHistoryCSV`, `exportHistoryJSON`, and `exportHistoryXLS` (lines 43-65 and 81-89) with:

```ts
export function exportHistoryCSV(
  data: HistoricalPoint[],
  symbol: string,
  columns?: string[]
) {
  if (!data.length) return;
  const cols = pickColumns(columns);
  const rows = data.map((d) =>
    cols.map((c) => escapeCSV((d as any)[c])).join(",")
  );
  const csv = [cols.join(","), ...rows].join("\n");
  downloadFile(csv, `${symbol}_history_${timestamp()}.csv`, "text/csv");
}

export function exportHistoryJSON(
  data: HistoricalPoint[],
  symbol: string,
  columns?: string[]
) {
  const cols = pickColumns(columns);
  const filtered = data.map((d) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c) => (obj[c] = (d as any)[c]));
    return obj;
  });
  const json = JSON.stringify(
    { symbol, exported_at: new Date().toISOString(), count: filtered.length, columns: cols, data: filtered },
    null,
    2
  );
  downloadFile(json, `${symbol}_history_${timestamp()}.json`, "application/json");
}

export function exportHistoryXLS(
  data: HistoricalPoint[],
  symbol: string,
  columns?: string[]
) {
  if (!data.length) return;
  const cols = pickColumns(columns);
  const rows = data.map((d) => cols.map((c) => (d as any)[c] ?? "").join("\t"));
  const tsv = [cols.join("\t"), ...rows].join("\n");
  downloadFile(tsv, `${symbol}_history_${timestamp()}.xls`, "application/vnd.ms-excel");
}
```

- [ ] **Step 3: Make the multi-stock history exporters column-aware**

Replace `exportMultiHistoryCSV` (lines 116-130) and `exportMultiHistoryXLS` (lines 160-174) with:

```ts
export function exportMultiHistoryCSV(bundles: StockDataBundle[], columns?: string[]) {
  if (!bundles.length) return;
  const cols = pickColumns(columns);
  const headers = ["symbol", ...cols];
  const rows: string[] = [];
  bundles.forEach((b) =>
    b.history.forEach((d) =>
      rows.push([escapeCSV(b.stock.symbol), ...cols.map((c) => escapeCSV((d as any)[c]))].join(","))
    )
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const symbols = bundles.map((b) => b.stock.symbol).join("_");
  downloadFile(csv, `history_${symbols}_${timestamp()}.csv`, "text/csv");
}

export function exportMultiHistoryXLS(bundles: StockDataBundle[], columns?: string[]) {
  if (!bundles.length) return;
  const cols = pickColumns(columns);
  const headers = ["Symbol", ...cols];
  const rows: string[] = [];
  bundles.forEach((b) =>
    b.history.forEach((d) =>
      rows.push([b.stock.symbol, ...cols.map((c) => (d as any)[c] ?? "")].join("\t"))
    )
  );
  const tsv = [headers.join("\t"), ...rows].join("\n");
  const symbols = bundles.map((b) => b.stock.symbol).join("_");
  downloadFile(tsv, `history_${symbols}_${timestamp()}.xls`, "application/vnd.ms-excel");
}
```

- [ ] **Step 4: Thread `columns` through `exportSingle` and `exportMulti`**

Replace `exportSingle` (lines 178-203) with:

```ts
export function exportSingle(
  format: ExportFormat,
  stock: StockInfo,
  history: HistoricalPoint[],
  type: "details" | "history" | "full" = "full",
  columns?: string[]
) {
  if (type === "details") {
    if (format === "csv") exportStockCSV(stock);
    else if (format === "json") exportStockJSON(stock);
    else exportStockXLS(stock);
  } else if (type === "history") {
    if (format === "csv") exportHistoryCSV(history, stock.symbol, columns);
    else if (format === "json") exportHistoryJSON(history, stock.symbol, columns);
    else exportHistoryXLS(history, stock.symbol, columns);
  } else {
    if (format === "csv") {
      exportStockCSV(stock);
      exportHistoryCSV(history, stock.symbol, columns);
    } else if (format === "json") {
      exportFullJSON(stock, history, columns);
    } else {
      exportStockXLS(stock);
      exportHistoryXLS(history, stock.symbol, columns);
    }
  }
}
```

Replace `exportMulti` (lines 207-231) with:

```ts
export function exportMulti(
  format: ExportFormat,
  bundles: StockDataBundle[],
  type: "details" | "history" | "full" = "full",
  columns?: string[]
) {
  if (type === "details") {
    if (format === "csv") exportMultiStockCSV(bundles);
    else if (format === "json") exportMultiStockJSON(bundles);
    else exportMultiStockXLS(bundles);
  } else if (type === "history") {
    if (format === "csv") exportMultiHistoryCSV(bundles, columns);
    else if (format === "json") exportMultiStockJSON(bundles);
    else exportMultiHistoryXLS(bundles, columns);
  } else {
    if (format === "csv") {
      exportMultiStockCSV(bundles);
      exportMultiHistoryCSV(bundles, columns);
    } else if (format === "json") {
      exportMultiStockJSON(bundles);
    } else {
      exportMultiStockXLS(bundles);
      exportMultiHistoryXLS(bundles, columns);
    }
  }
}
```

- [ ] **Step 5: Update `exportFullJSON` to accept columns**

Replace `exportFullJSON` (lines 67-79) with:

```ts
export function exportFullJSON(
  stock: StockInfo,
  history: HistoricalPoint[],
  columns?: string[]
) {
  const cols = pickColumns(columns);
  const filteredHistory = history.map((d) => {
    const obj: Record<string, unknown> = {};
    cols.forEach((c) => (obj[c] = (d as any)[c]));
    return obj;
  });
  const report = {
    exported_at: new Date().toISOString(),
    stock_details: stock,
    historical_data: { count: filteredHistory.length, columns: cols, data: filteredHistory },
  };
  const json = JSON.stringify(report, null, 2);
  downloadFile(
    json,
    `${stock.symbol}_full_report_${timestamp()}.json`,
    "application/json"
  );
}
```

- [ ] **Step 6: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds. (`exportMultiStockJSON` is intentionally left exporting full history for the JSON multi case, matching pre-existing behavior; column filtering for multi-JSON is out of scope.)

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/export.ts
git commit -m "feat: filter export columns by selection"
```

---

### Task 8: Column picker step in ExportMenu

**Files:**
- Modify: `frontend/src/components/ExportMenu.tsx`

- [ ] **Step 1: Import column constant and define groups + state**

At the top, change the export import to include `HISTORY_COLUMNS`:

```tsx
import {
  ExportFormat,
  StockDataBundle,
  HISTORY_COLUMNS,
  exportSingle,
  exportMulti,
} from "@/lib/export";
```

Change the `Step` type (currently `type Step = "scope" | "data" | "format";`) to:

```tsx
type Step = "scope" | "data" | "columns" | "format";
```

Add column-group metadata just below the `type Step` line:

```tsx
const COLUMN_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Prices", keys: ["open", "high", "low", "close", "adj_close", "volume"] },
  { label: "Corporate actions", keys: ["dividends", "stock_splits"] },
  {
    label: "Indicators",
    keys: [
      "return", "log_return", "sma_20", "sma_50", "ema_12", "ema_26",
      "macd", "macd_signal", "macd_hist", "volatility_20", "rsi_14",
      "bb_upper", "bb_mid", "bb_lower", "atr_14", "obv", "stoch_k",
      "stoch_d", "volume_change",
    ],
  },
];
// All selectable column keys (everything except the always-included `date`).
const SELECTABLE_COLUMNS = HISTORY_COLUMNS.filter((c) => c !== "date");
```

Add selection state alongside the existing state declarations (after the `notice` state line):

```tsx
  const [selectedCols, setSelectedCols] = useState<Set<string>>(
    () => new Set(SELECTABLE_COLUMNS)
  );
```

- [ ] **Step 2: Reset selection in `reset()`**

In `reset()`, add as the last line inside the function:

```tsx
    setSelectedCols(new Set(SELECTABLE_COLUMNS));
```

- [ ] **Step 3: Route the data step to the columns step for history/full**

In the data-step buttons, the handler is currently `onClick={() => { setDataType(opt.value); setStep("format"); }}`. Replace that handler with one that branches:

```tsx
                  onClick={() => {
                    setDataType(opt.value);
                    setStep(opt.value === "details" ? "format" : "columns");
                  }}
```

- [ ] **Step 4: Add column toggle helpers and the final column list**

Add these just above the `return (` of the component (next to `dataLabel`):

```tsx
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
```

- [ ] **Step 5: Fetch indicators and pass selected columns into the export calls**

In `handleExport`, the history/full path fetches lifetime data and then exports. Two changes:

**(a)** The two `api.getHistory(...)` calls currently pass `(symbol, "max", "1d")`. Add `true` (the `indicators` arg) so the enriched indicator columns are actually fetched:

```tsx
          api.getHistory(b.stock.symbol, "max", "1d", true)
```
(inside the multi `allBundles.map(...)`) and
```tsx
        const res = await api.getHistory(currentBundle.stock.symbol, "max", "1d", true);
```
(the single-stock call).

**(b)** Add `orderedColumns` as the last argument to each export call:

```tsx
        exportMulti(format, fresh, dataType, orderedColumns);
```
and
```tsx
        exportSingle(format, currentBundle.stock, res.data, dataType, orderedColumns);
```

(The `details` early-return path stays unchanged — no indicators fetch, no columns passed.)

- [ ] **Step 6: Render the columns step**

Immediately after the closing `)}` of the `{step === "data" && ( ... )}` block and before `{step === "format" && (`, insert:

```tsx
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
```

- [ ] **Step 7: Add a Back-to-columns affordance in the format step**

In the format step's back button, it currently navigates `onClick={() => setStep("data")}`. For history/full the previous step is now "columns". Replace that handler with:

```tsx
                onClick={() => setStep(dataType === "details" ? "data" : "columns")}
```

- [ ] **Step 8: Typecheck**

Run from `frontend`: `npm run build`
Expected: build succeeds.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/ExportMenu.tsx
git commit -m "feat: add column picker step to export menu"
```

---

### Task 9: End-to-end manual verification

**Files:** none (verification only)

Requires all three servers running: `cd backend; ./venv/Scripts/python.exe server.py`, `cd frontend; npx convex dev`, `cd frontend; npm run dev`.

- [ ] **Step 1: Enriched single export**

AAPL → Export → Price History → (columns step shows Prices/Corporate actions/Indicators, all checked) → Continue → CSV.
Expected: spinner, then CSV with header row containing `date, open, high, low, close, adj_close, volume, dividends, stock_splits` and the indicator columns; rows span 1980→today.

- [ ] **Step 2: Column subset**

AAPL → Export → Price History → Select none → check only `close`, `adj_close`, `rsi_14`, `macd` → Continue → CSV.
Expected: CSV header is exactly `date,close,adj_close,rsi_14,macd`.

- [ ] **Step 3: Zero columns guard**

In the columns step, Select none → leave nothing checked.
Expected: the Continue button is disabled and reads "Select at least one column".

- [ ] **Step 4: Chart smoothness**

AAPL → set chart to Max.
Expected: the price line has no vertical cliff at 2020-08-31 (the 4-for-1 split) — confirming it plots adjusted close.

- [ ] **Step 5: Full report + details**

AAPL → Export → Full Report → keep all columns → JSON.
Expected: JSON has `stock_details` including the new fundamentals (`beta`, `trailing_eps`, etc.) and `historical_data.data` with the selected columns. Then: AAPL → Export → Stock Details → CSV downloads immediately (no columns step, no spinner).

- [ ] **Step 6: Multi-stock subset**

Add AAPL + TSLA → Export → All → Price History → choose a subset → CSV.
Expected: one CSV with a `symbol` column plus the chosen columns, full lifetime rows for both.

- [ ] **Step 7: Confirm clean tree**

```bash
git status
```
If steps 1-6 required fixups, commit them; otherwise the tree is clean.

---

## Notes

- The chart fetch path intentionally omits `indicators` so it never pays for computing 19 features on 11k rows just to draw a line; only the export path requests them.
- Multi-stock JSON export keeps emitting the full per-stock structure (pre-existing behavior); column filtering applies to CSV/XLS multi and all single-stock formats. This is a deliberate scope boundary, not an omission.
