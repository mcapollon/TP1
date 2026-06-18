# Batch Random Historical Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backend endpoint that samples N random symbols from a bundled broad US common-stock universe and returns their combined lifetime-daily history as a downloadable CSV/JSON, reproducible by seed.

**Architecture:** An offline builder script generates a filtered ticker universe file committed under `backend/assets/`. A `universe` module loads + seed-samples it. A `batch_export` module fetches each sampled symbol's history through a bounded thread pool that reuses the existing `get_historical_data_yfinance` (so the `curl_cffi` session, TTL cache, and 429 backoff all apply), then serializes the combined result. One new Flask route wires params → sample → fetch → file download, echoing the effective seed.

**Tech Stack:** Python 3 / Flask / yfinance / pandas / curl_cffi (backend only — no frontend in this iteration). No automated test framework exists — verification uses inline `python -c` snippets via the venv and the Flask test client.

---

## File Structure

- `backend/build_universe.py` — NEW. Dev tool (run manually). Downloads the NASDAQ Trader symbol directory, filters to broad US common stocks, writes the universe file. One responsibility: produce the file.
- `backend/assets/us_common_stocks.txt` — NEW (committed). The generated universe list. Under `assets/` because `backend/data/` is gitignored.
- `backend/universe.py` — NEW. `load_universe()` (cached read) + `sample_symbols(count, seed)` (isolated-RNG draw). One responsibility: the symbol universe + sampling.
- `backend/batch_export.py` — NEW. `run_batch_export(...)` (throttled pool fetch) + `to_csv(...)` / `to_json(...)` serializers. One responsibility: turn a symbol list into a serialized export.
- `backend/server.py` — MODIFY. Add the `GET /api/export/batch` route.

## Canonical record fields (single source of truth)

History records returned by `get_historical_data_yfinance` use these snake_case keys. The CSV/JSON serializers in Task 4 MUST use this exact order:

- Base (always): `date, open, high, low, close, adj_close, volume, dividends, stock_splits`
- Indicators (only when `indicators=True`), in `INDICATOR_PRECISION` order from [data_collector_api.py:31-37](../../../backend/data_collector_api.py#L31-L37): `return, log_return, volume_change, volatility_20, rsi_14, stoch_k, stoch_d, sma_20, sma_50, ema_12, ema_26, macd, macd_signal, macd_hist, bb_upper, bb_mid, bb_lower, atr_14, obv`

## Conventions

All commands run from `c:\Users\lmapollon\Projects\Others\TP1\backend`. Shell is **PowerShell** — chain with `;`, not `&&`. The venv python is `./venv/Scripts/python.exe`. Already on branch `feat/batch-random-historical-export`; do NOT create/switch branches.

---

### Task 1: Universe builder script

**Files:**
- Create: `backend/build_universe.py`
- Create (output, committed): `backend/assets/us_common_stocks.txt`

- [ ] **Step 1: Create `backend/build_universe.py`**

```python
"""
build_universe.py — Dev tool. Regenerates the broad US common-stock universe.

Run manually (NOT at request time):
    ./venv/Scripts/python.exe build_universe.py

Source: the public NASDAQ Trader symbol directory (pipe-delimited):
  - nasdaqlisted.txt : Symbol|Security Name|Market Category|Test Issue|
                       Financial Status|Round Lot Size|ETF|NextShares
  - otherlisted.txt  : ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|
                       Round Lot Size|Test Issue|NASDAQ Symbol

Filtering keeps broad US *common stock* and drops the noise that makes for bad
training data / failed history fetches:
  - Test Issue == 'Y'                      (test tickers)
  - ETF == 'Y'                             (funds)
  - non-common by name keyword             (warrant/unit/right/preferred/...)
  - symbols that aren't pure A-Z           (NYSE warrants/units/preferreds carry
                                            '.', '$', '+' suffixes; dropping them
                                            also keeps tickers 1:1 with yfinance)
The result is deduplicated, sorted, and written one symbol per line to
backend/assets/us_common_stocks.txt.
"""

import os
import re

from curl_cffi import requests as curl_requests

NASDAQ_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"
OTHER_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"

ASSETS_DIR = os.path.join(os.path.dirname(__file__), "assets")
OUT_PATH = os.path.join(ASSETS_DIR, "us_common_stocks.txt")

# Security-name keywords that mark a non-common-stock instrument.
NAME_BLOCKLIST = (
    "warrant", "unit", "right", "preferred", "depositary", "depository",
    "when issued", "when-issued", "convertible", "debenture", "notes due",
    "% note", "subordinated", " etn", "exchange-traded note",
)

PURE_TICKER = re.compile(r"^[A-Z]+$")


def _fetch(url: str) -> list[str]:
    """Download a pipe-delimited symbol file; return its data lines (no header/footer)."""
    session = curl_requests.Session(impersonate="chrome")
    resp = session.get(url, timeout=30)
    resp.raise_for_status()
    lines = resp.text.splitlines()
    # First line is the header; last line is "File Creation Time: ...".
    body = lines[1:]
    if body and body[-1].startswith("File Creation Time"):
        body = body[:-1]
    return body


def _is_common(symbol: str, name: str) -> bool:
    if not PURE_TICKER.match(symbol):
        return False
    lname = name.lower()
    return not any(bad in lname for bad in NAME_BLOCKLIST)


def build() -> list[str]:
    symbols: set[str] = set()

    # nasdaqlisted.txt — Symbol(0) Security Name(1) Test Issue(3) ETF(6)
    for line in _fetch(NASDAQ_URL):
        f = line.split("|")
        if len(f) < 7:
            continue
        symbol, name, test_issue, etf = f[0].strip(), f[1].strip(), f[3].strip(), f[6].strip()
        if test_issue == "Y" or etf == "Y":
            continue
        if _is_common(symbol, name):
            symbols.add(symbol)

    # otherlisted.txt — ACT Symbol(0) Security Name(1) ETF(4) Test Issue(6)
    for line in _fetch(OTHER_URL):
        f = line.split("|")
        if len(f) < 7:
            continue
        symbol, name, etf, test_issue = f[0].strip(), f[1].strip(), f[4].strip(), f[6].strip()
        if test_issue == "Y" or etf == "Y":
            continue
        if _is_common(symbol, name):
            symbols.add(symbol)

    return sorted(symbols)


def main() -> None:
    os.makedirs(ASSETS_DIR, exist_ok=True)
    symbols = build()
    if len(symbols) < 1000:
        raise SystemExit(f"Refusing to write: only {len(symbols)} symbols (source change?).")
    with open(OUT_PATH, "w", encoding="utf-8") as fh:
        fh.write("\n".join(symbols) + "\n")
    print(f"Wrote {len(symbols)} symbols to {OUT_PATH}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Generate the universe file**

Run from `backend`:
```bash
./venv/Scripts/python.exe build_universe.py
```
Expected: prints `Wrote N symbols to ...us_common_stocks.txt` with N in the thousands (roughly 4000–7000).

- [ ] **Step 3: Spot-check the output is clean**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "p='assets/us_common_stocks.txt'; lines=open(p).read().split(); import re; print('count', len(lines)); print('all pure alpha', all(re.match(r'^[A-Z]+$', s) for s in lines)); print('AAPL in', 'AAPL' in lines); print('MSFT in', 'MSFT' in lines)"
```
Expected: `count` in the thousands; `all pure alpha True`; both `AAPL in True` and `MSFT in True`.

- [ ] **Step 4: Force-add the committed file (assets/ is NOT gitignored, but confirm) and commit**

```bash
git add backend/build_universe.py backend/assets/us_common_stocks.txt
git status
git commit -m "feat: add US common-stock universe builder + generated list"
```
Expected: `git status` shows both files staged (the `.txt` is under `assets/`, not the ignored `data/`). If the `.txt` does not appear, it was ignored — re-add with `git add -f backend/assets/us_common_stocks.txt`.

---

### Task 2: Universe loader + sampler

**Files:**
- Create: `backend/universe.py`

- [ ] **Step 1: Create `backend/universe.py`**

```python
"""
universe.py — Loads the bundled symbol universe and draws reproducible samples.

The universe file is generated offline by build_universe.py and committed under
backend/assets/. Sampling uses an isolated random.Random(seed) so the draw is
fully determined by (seed, universe file) and unaffected by global RNG state or
concurrent requests.
"""

import os
import random

_UNIVERSE_PATH = os.path.join(os.path.dirname(__file__), "assets", "us_common_stocks.txt")
_universe: list[str] | None = None


def load_universe() -> list[str]:
    """Read and memoize the bundled ticker list. Raises if missing/empty."""
    global _universe
    if _universe is None:
        if not os.path.exists(_UNIVERSE_PATH):
            raise FileNotFoundError(
                f"Universe file missing: {_UNIVERSE_PATH}. Run build_universe.py."
            )
        with open(_UNIVERSE_PATH, encoding="utf-8") as fh:
            _universe = [s.strip() for s in fh if s.strip()]
        if not _universe:
            raise ValueError(f"Universe file is empty: {_UNIVERSE_PATH}.")
    return _universe


def sample_symbols(count: int, seed: int) -> list[str]:
    """Return `count` distinct symbols drawn deterministically from `seed`.

    `count` is clamped to the universe size. The draw is reproducible: the same
    (seed, universe file) always yields the same list.
    """
    universe = load_universe()
    n = max(0, min(count, len(universe)))
    rng = random.Random(seed)
    return rng.sample(universe, n)
```

- [ ] **Step 2: Verify load + reproducibility**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "from universe import load_universe, sample_symbols; print('universe', len(load_universe())); a=sample_symbols(5,42); b=sample_symbols(5,42); c=sample_symbols(5,43); print('a', a); print('reproducible', a==b); print('seed-varies', a!=c); print('len100', len(sample_symbols(100,1)))"
```
Expected: `universe` in the thousands; `reproducible True`; `seed-varies True`; `len100 100`.

- [ ] **Step 3: Commit**

```bash
git add backend/universe.py
git commit -m "feat: add seed-reproducible symbol universe sampler"
```

---

### Task 3: Batch fetch core

**Files:**
- Create: `backend/batch_export.py`

- [ ] **Step 1: Create `backend/batch_export.py` with the fetch core**

```python
"""
batch_export.py — Fetch many symbols' history concurrently and serialize them.

Reuses get_historical_data_yfinance for every symbol so the curl_cffi session,
TTL cache, and 429 backoff all apply. Concurrency is bounded (small pool) with
jitter to stay under Yahoo's burst threshold. Per-symbol failures are recorded
in `skipped` and never abort the batch.
"""

import io
import csv
import json
import time
import random
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

from data_collector_api import get_historical_data_yfinance, INDICATOR_PRECISION

MAX_WORKERS = 4

BASE_FIELDS = [
    "date", "open", "high", "low", "close",
    "adj_close", "volume", "dividends", "stock_splits",
]
INDICATOR_FIELDS = list(INDICATOR_PRECISION.keys())


def _fetch_one(symbol: str, period: str, interval: str, indicators: bool):
    """Fetch one symbol's history; return (symbol, records) or (symbol, None) on failure/empty."""
    # Jitter desynchronizes the pool's first wave of requests.
    time.sleep(random.uniform(0.0, 0.3))
    try:
        records = get_historical_data_yfinance(symbol, period, interval, indicators)
    except Exception as exc:  # noqa: BLE001 — one bad symbol must not kill the batch
        print(f"[batch] {symbol} failed: {exc}")
        return symbol, None
    if not records:
        return symbol, None
    return symbol, records


def run_batch_export(
    symbols: list[str],
    period: str = "max",
    interval: str = "1d",
    indicators: bool = True,
) -> tuple[list[dict], list[str]]:
    """Fetch all symbols through a bounded pool.

    Returns (stocks, skipped) where each stocks entry is
    {"symbol": SYM, "count": n, "data": [records...]} and skipped lists the
    symbols that errored or returned no rows.
    """
    stocks: list[dict] = []
    skipped: list[str] = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = [
            pool.submit(_fetch_one, s, period, interval, indicators) for s in symbols
        ]
        for fut in futures:
            symbol, records = fut.result()
            if records is None:
                skipped.append(symbol)
            else:
                stocks.append({"symbol": symbol, "count": len(records), "data": records})
    return stocks, skipped


def _fields(indicators: bool) -> list[str]:
    return BASE_FIELDS + (INDICATOR_FIELDS if indicators else [])


def to_csv(stocks: list[dict], indicators: bool = True) -> str:
    """Long-format CSV: header `symbol` + record fields, one row per (symbol, date)."""
    fields = _fields(indicators)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["symbol"] + fields)
    for entry in stocks:
        sym = entry["symbol"]
        for rec in entry["data"]:
            writer.writerow([sym] + [rec.get(f, "") for f in fields])
    return buf.getvalue()


def to_json(stocks: list[dict], skipped: list[str], meta: dict) -> str:
    """JSON document: meta + stocks[] + skipped[]."""
    doc = {
        "exported_at": datetime.now().isoformat(),
        **meta,
        "skipped": skipped,
        "stocks": stocks,
    }
    return json.dumps(doc, ensure_ascii=False, default=str)
```

- [ ] **Step 2: Verify the fetch core (real symbols + one bogus)**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "from batch_export import run_batch_export, to_csv, to_json; stocks, skipped = run_batch_export(['AAPL','MSFT','NODATA_XYZ'], '1mo', '1d', True); print('returned', [s['symbol'] for s in stocks]); print('skipped', skipped); print('has rsi', 'rsi_14' in stocks[0]['data'][-1]); csv=to_csv(stocks, True); print('csv header', csv.splitlines()[0][:40]); print('csv rows', len(csv.splitlines()))"
```
Expected: `returned` contains AAPL and MSFT; `skipped` is `['NODATA_XYZ']`; `has rsi True`; the CSV header starts with `symbol,date,open,high,low,...`; more than 2 CSV rows. Never raises.

- [ ] **Step 3: Verify base-columns CSV (indicators off) has no indicator header**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "from batch_export import run_batch_export, to_csv; stocks, _ = run_batch_export(['AAPL'], '5d', '1d', False); h=to_csv(stocks, False).splitlines()[0]; print('header', h); print('no rsi', 'rsi_14' not in h)"
```
Expected: header is `symbol,date,open,high,low,close,adj_close,volume,dividends,stock_splits`; `no rsi True`.

- [ ] **Step 4: Commit**

```bash
git add backend/batch_export.py
git commit -m "feat: add throttled batch fetch + CSV/JSON serializers"
```

---

### Task 4: Endpoint wiring

**Files:**
- Modify: `backend/server.py` (imports near lines 20-34; new route)

- [ ] **Step 1: Add imports**

In `backend/server.py`, after the existing import block (the `from robots_checker import ...` line, line 34), add:

```python
import random as _random
from flask import Response
from universe import sample_symbols, load_universe
from batch_export import run_batch_export, to_csv, to_json
```

(Note: `jsonify, request` are already imported from flask on line 16; only `Response` is new.)

- [ ] **Step 2: Add the batch export route**

Insert this route immediately after the `get_history` function (after line 111, before the `# ─── Routes: Agent IA` comment):

```python
# ─── Route: Export par lot (échantillon aléatoire) ──────────────────────────────

@app.route("/api/export/batch", methods=["GET"])
def export_batch():
    """
    Échantillonne `count` symboles aléatoires de l'univers et renvoie leur
    historique combiné (téléchargeable). Reproductible via `seed`.
    Query params: count(<=150), format(csv|json), indicators(0/1),
                  period, interval, seed(optionnel).
    """
    allowed_periods = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]
    allowed_intervals = ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]

    try:
        count = int(request.args.get("count", "100"))
    except ValueError:
        return jsonify({"error": "count must be an integer"}), 400
    count = max(1, min(count, 150))

    fmt = request.args.get("format", "csv").lower()
    if fmt not in ("csv", "json"):
        return jsonify({"error": "format must be csv or json"}), 400

    indicators = request.args.get("indicators", "1") in ("1", "true", "True")
    period = request.args.get("period", "max")
    interval = request.args.get("interval", "1d")
    if period not in allowed_periods:
        return jsonify({"error": f"Invalid period. Allowed: {allowed_periods}"}), 400
    if interval not in allowed_intervals:
        return jsonify({"error": f"Invalid interval. Allowed: {allowed_intervals}"}), 400

    seed_arg = request.args.get("seed")
    try:
        seed = int(seed_arg) if seed_arg is not None else _random.randint(0, 2_147_483_647)
    except ValueError:
        return jsonify({"error": "seed must be an integer"}), 400

    symbols = sample_symbols(count, seed)
    stocks, skipped = run_batch_export(symbols, period, interval, indicators)

    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    meta = {
        "seed": seed,
        "requested": len(symbols),
        "returned": len(stocks),
        "universe_size": len(load_universe()),
    }
    headers = {
        "X-Seed": str(seed),
        "X-Returned": str(len(stocks)),
        "X-Skipped": str(len(skipped)),
        "Content-Disposition": f"attachment; filename=batch_{count}_seed{seed}_{ts}.{fmt}",
    }

    if fmt == "json":
        body = to_json(stocks, skipped, meta)
        return Response(body, mimetype="application/json", headers=headers)
    body = to_csv(stocks, indicators)
    return Response(body, mimetype="text/csv", headers=headers)
```

- [ ] **Step 3: Verify the route via the Flask test client (small count, fast)**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "import server; c=server.app.test_client(); r=c.get('/api/export/batch?count=3&seed=7&format=csv&period=1mo'); print('status', r.status_code); print('x-seed', r.headers.get('X-Seed')); print('x-returned', r.headers.get('X-Returned')); print('disposition', r.headers.get('Content-Disposition')); print('header line', r.get_data(as_text=True).splitlines()[0][:40])"
```
Expected: status 200; `x-seed 7`; `x-returned` is a small number; `Content-Disposition` filename contains `seed7`; CSV header line starts with `symbol,date,open,...`.

- [ ] **Step 4: Verify JSON format + reproducibility (same seed → same symbol set)**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "import server, json; c=server.app.test_client(); g=lambda: json.loads(c.get('/api/export/batch?count=3&seed=7&format=json&period=5d').get_data(as_text=True)); a=g(); b=g(); print('seed', a['seed']); print('universe_size', a['universe_size']); print('syms', sorted(s['symbol'] for s in a['stocks'])); print('reproducible', [s['symbol'] for s in a['stocks']]==[s['symbol'] for s in b['stocks']]); print('has skipped key', 'skipped' in a)"
```
Expected: `seed 7`; `universe_size` in the thousands; a sorted symbol list; `reproducible True`; `has skipped key True`.

- [ ] **Step 5: Verify invalid params are rejected**

Run from `backend`:
```bash
./venv/Scripts/python.exe -c "import server; c=server.app.test_client(); print('bad format', c.get('/api/export/batch?format=xml').status_code); print('bad period', c.get('/api/export/batch?period=bogus').status_code); print('bad seed', c.get('/api/export/batch?seed=abc').status_code)"
```
Expected: `bad format 400`; `bad period 400`; `bad seed 400`.

- [ ] **Step 6: Commit**

```bash
git add backend/server.py
git commit -m "feat: add GET /api/export/batch random sampled history endpoint"
```

---

### Task 5: End-to-end verification against a running server

**Files:** none (verification only)

- [ ] **Step 1: Start the backend**

Run from `backend` (leave it running in its own terminal):
```bash
./venv/Scripts/python.exe server.py
```
Expected: the server banner prints and it listens on `http://localhost:5000`.

- [ ] **Step 2: Download a small CSV batch and inspect it**

From a second `backend` terminal:
```bash
./venv/Scripts/python.exe -c "from curl_cffi import requests as r; resp=r.get('http://localhost:5000/api/export/batch?count=5&seed=123&format=csv&period=1mo'); print('status', resp.status_code); print('seed header', resp.headers.get('X-Seed')); print('returned', resp.headers.get('X-Returned'), 'skipped', resp.headers.get('X-Skipped')); lines=resp.text.splitlines(); print('header', lines[0][:50]); print('rows', len(lines)); print('distinct symbols', len(set(l.split(',')[0] for l in lines[1:])))"
```
Expected: status 200; `seed header 123`; `returned` + `skipped` sum to ≤5; CSV header starts with `symbol,date,...`; multiple rows; distinct symbols equals `returned`.

- [ ] **Step 3: Confirm the larger default path works (timing sanity)**

```bash
./venv/Scripts/python.exe -c "import time; from curl_cffi import requests as r; t=time.time(); resp=r.get('http://localhost:5000/api/export/batch?count=20&seed=1&format=json&period=max', timeout=300); print('status', resp.status_code, 'elapsed_s', round(time.time()-t,1)); import json; d=json.loads(resp.text); print('returned', d['returned'], 'skipped', len(d['skipped']), 'universe', d['universe_size'])"
```
Expected: status 200 within a few minutes; `returned` + `skipped` == 20. (This confirms the bounded pool + backoff handle a realistic batch without a 429 failure.)

- [ ] **Step 4: Stop the server and confirm a clean tree**

Stop the server (Ctrl+C in its terminal), then run from `backend`:
```bash
git status
```
Expected: clean tree (all code already committed in Tasks 1-4; no stray files — downloaded responses above were piped to stdout, not written to disk).

---

## Notes

- **No `.info` calls anywhere in this path.** `run_batch_export` only calls `get_historical_data_yfinance`, which uses `ticker.history` (not `ticker.info`) — the deliberate 429-mitigation choice from the spec.
- **`assets/` vs `data/`.** The universe file lives in `backend/assets/` because `backend/data/` is gitignored; the committed file is the reproducibility anchor.
- **Cap at 150 + synchronous.** A larger batch would risk HTTP timeout / 429 pressure; async job mode is the documented next step if needed (out of scope).
- **No frontend.** This iteration is endpoint-only, per the spec. A future UI button can call `/api/export/batch` directly.
