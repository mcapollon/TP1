"""
data_collector_api.py — Approche 1 : Collecte de données via API (yfinance + Alpha Vantage).

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
import time
from datetime import datetime, timedelta

import yfinance as yf
import requests
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

ALPHA_VANTAGE_API_KEY = os.getenv("ALPHA_VANTAGE_API_KEY", "")
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)


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
        "timestamp": datetime.now().isoformat(),
        "source": "yfinance",
    }


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


# ─── Alpha Vantage ──────────────────────────────────────────────────────────────

def get_stock_info_alpha_vantage(symbol: str) -> dict:
    """Récupère les données d'une action via Alpha Vantage API."""
    if not ALPHA_VANTAGE_API_KEY:
        return {"error": "Alpha Vantage API key not configured"}

    url = "https://www.alphavantage.co/query"
    params = {
        "function": "GLOBAL_QUOTE",
        "symbol": symbol.upper(),
        "apikey": ALPHA_VANTAGE_API_KEY,
    }

    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()

    quote = data.get("Global Quote", {})
    if not quote:
        return {"error": f"No data found for {symbol}"}

    price = float(quote.get("05. price", 0))
    prev_close = float(quote.get("08. previous close", 0))

    return {
        "symbol": quote.get("01. symbol", symbol.upper()),
        "current_price": price,
        "open": float(quote.get("02. open", 0)),
        "day_high": float(quote.get("03. high", 0)),
        "day_low": float(quote.get("04. low", 0)),
        "volume": int(quote.get("06. volume", 0)),
        "previous_close": prev_close,
        "change_percent": _calc_change_percent(price, prev_close),
        "latest_trading_day": quote.get("07. latest trading day"),
        "timestamp": datetime.now().isoformat(),
        "source": "alpha_vantage",
    }


def get_historical_alpha_vantage(
    symbol: str, outputsize: str = "compact"
) -> list[dict]:
    """
    Récupère les données historiques via Alpha Vantage.
    outputsize: compact (100 derniers jours) ou full (20+ ans)
    """
    if not ALPHA_VANTAGE_API_KEY:
        return []

    url = "https://www.alphavantage.co/query"
    params = {
        "function": "TIME_SERIES_DAILY",
        "symbol": symbol.upper(),
        "outputsize": outputsize,
        "apikey": ALPHA_VANTAGE_API_KEY,
    }

    response = requests.get(url, params=params, timeout=15)
    response.raise_for_status()
    data = response.json()

    time_series = data.get("Time Series (Daily)", {})
    records = []
    for date_str, values in sorted(time_series.items()):
        records.append({
            "date": date_str,
            "open": float(values["1. open"]),
            "high": float(values["2. high"]),
            "low": float(values["3. low"]),
            "close": float(values["4. close"]),
            "volume": int(values["5. volume"]),
        })
    return records


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
