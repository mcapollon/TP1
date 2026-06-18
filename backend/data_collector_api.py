"""
data_collector_api.py — Approche 1 : Collecte de données via API (yfinance).

Données collectées :
- Nom de l'action (symbole)
- Prix actuel
- Prix historique
- Volume d'échange
- Variation (%)
- Capitalisation boursière
- Date / temps
"""

import os
import json
import math
import time
from datetime import datetime, timedelta

import yfinance as yf
import requests
import pandas as pd
from dotenv import load_dotenv
from indicators import add_indicators

load_dotenv()

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

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
    return int(round(f)) if digits == 0 else round(f, digits)


# ─── yfinance ───────────────────────────────────────────────────────────────────

def get_stock_info_yfinance(symbol: str) -> dict:
    """Récupère les informations complètes d'une action via yfinance."""
    ticker = yf.Ticker(symbol)
    info = ticker.info

    # Validate that this is a real stock
    price = info.get("currentPrice") or info.get("regularMarketPrice")
    name = info.get("longName") or info.get("shortName")
    if not price and not name:
        raise ValueError(f"Aucune action trouvée pour le symbole « {symbol.upper()} ». Vérifiez le symbole et réessayez.")

    return {
        "symbol": symbol.upper(),
        "name": info.get("longName") or info.get("shortName", "N/A"),
        "current_price": info.get("currentPrice") or info.get("regularMarketPrice"),
        "previous_close": info.get("previousClose"),
        "open": info.get("open") or info.get("regularMarketOpen"),
        "day_high": info.get("dayHigh") or info.get("regularMarketDayHigh"),
        "day_low": info.get("dayLow") or info.get("regularMarketDayLow"),
        "volume": info.get("volume") or info.get("regularMarketVolume"),
        "market_cap": info.get("marketCap"),
        "pe_ratio": info.get("trailingPE"),
        "dividend_yield": info.get("dividendYield"),
        "fifty_two_week_high": info.get("fiftyTwoWeekHigh"),
        "fifty_two_week_low": info.get("fiftyTwoWeekLow"),
        "change_percent": _calc_change_percent(
            info.get("currentPrice") or info.get("regularMarketPrice"),
            info.get("previousClose"),
        ),
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
            "volume": int(volume) if pd.notna(volume) and not math.isinf(volume) else None,
            "dividends": _clean(row.get("Dividends", 0.0), 4),
            "stock_splits": _clean(row.get("Stock Splits", 0.0), 4),
        }
        if indicators:
            for col, digits in INDICATOR_PRECISION.items():
                record[col] = _clean(row.get(col), digits)
        records.append(record)
    return records


def search_stocks_yfinance(query: str) -> list[dict]:
    """Recherche d'actions par nom ou symbole via yfinance + Yahoo Finance search API."""
    results = []

    # 1) Try Yahoo Finance search API (supports company names)
    try:
        url = "https://query2.finance.yahoo.com/v1/finance/search"
        params = {
            "q": query,
            "quotesCount": 8,
            "newsCount": 0,
            "listsCount": 0,
            "enableFuzzyQuery": True,
            "quotesQueryId": "tss_match_phrase_query",
        }
        headers = {"User-Agent": "Mozilla/5.0"}
        resp = requests.get(url, params=params, headers=headers, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            for q in data.get("quotes", []):
                qtype = q.get("quoteType", "")
                if qtype in ("EQUITY", "ETF", "MUTUALFUND", "INDEX"):
                    results.append({
                        "symbol": q.get("symbol", ""),
                        "name": q.get("longname") or q.get("shortname", "N/A"),
                        "exchange": q.get("exchange", "N/A"),
                        "type": qtype,
                    })
    except Exception:
        pass

    # 2) If no results from search API, try direct ticker lookup as fallback
    if not results:
        try:
            ticker = yf.Ticker(query.upper())
            info = ticker.info
            price = info.get("currentPrice") or info.get("regularMarketPrice")
            if price is not None:
                results.append({
                    "symbol": info.get("symbol", query.upper()),
                    "name": info.get("longName") or info.get("shortName", query.upper()),
                    "exchange": info.get("exchange", "N/A"),
                    "type": info.get("quoteType", "N/A"),
                })
        except Exception:
            pass

    return results


# ─── Utilitaires ────────────────────────────────────────────────────────────────

def _calc_change_percent(current, previous):
    if current and previous and previous != 0:
        return round(((current - previous) / previous) * 100, 2)
    return None


def save_to_json(data: dict | list, filename: str):
    """Sauvegarde les données en JSON."""
    filepath = os.path.join(DATA_DIR, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)
    return filepath


def save_to_csv(records: list[dict], filename: str):
    """Sauvegarde les données en CSV."""
    filepath = os.path.join(DATA_DIR, filename)
    df = pd.DataFrame(records)
    df.to_csv(filepath, index=False)
    return filepath


if __name__ == "__main__":
    # Test rapide
    symbol = "AAPL"
    print(f"\n{'='*60}")
    print(f"Collecte de données pour {symbol} via yfinance...")
    info = get_stock_info_yfinance(symbol)
    print(json.dumps(info, indent=2))

    print(f"\nDonnées historiques (1 mois)...")
    hist = get_historical_data_yfinance(symbol, period="1mo")
    print(f"{len(hist)} enregistrements récupérés")

    save_to_json(info, f"{symbol}_info.json")
    save_to_csv(hist, f"{symbol}_history.csv")
    print(f"\nDonnées sauvegardées dans {DATA_DIR}")
