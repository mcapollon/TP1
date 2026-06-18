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
