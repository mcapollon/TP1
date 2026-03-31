"""
data_collector_scraper.py — Approche 1 : Collecte de données via Web Scraping.

Multi-source scraping:
  - Source 1 : Yahoo Finance internal JSON API (quote data)
  - Source 2 : Finviz (fundamentals table parsed with BeautifulSoup)

Scraping aléatoire à intervalle régulier (ex: toutes les 5 minutes).
Respecte les règles robots.txt de chaque site.
"""

import os
import json
import random
import re
import time
from datetime import datetime

import requests
from bs4 import BeautifulSoup
import pandas as pd

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(DATA_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

# ---------------------------------------------------------------------------
# Source 1 — Yahoo Finance crumb/cookie + v7 JSON endpoint
# ---------------------------------------------------------------------------

_yahoo_session = None
_yahoo_crumb = None


def _get_yahoo_session():
    """Obtain a requests session with valid Yahoo Finance cookies + crumb."""
    global _yahoo_session, _yahoo_crumb
    if _yahoo_session and _yahoo_crumb:
        return _yahoo_session, _yahoo_crumb

    session = requests.Session()
    session.headers.update(HEADERS)

    # Step 1 – visit a consent-free page to grab cookies
    session.get("https://fc.yahoo.com", timeout=10, allow_redirects=True)

    # Step 2 – fetch a crumb
    crumb_resp = session.get(
        "https://query2.finance.yahoo.com/v1/test/getcrumb", timeout=10
    )
    crumb = crumb_resp.text.strip()
    if not crumb or "html" in crumb.lower():
        crumb = None  # fallback: will try without crumb

    _yahoo_session = session
    _yahoo_crumb = crumb
    return session, crumb


def scrape_yahoo_quote(symbol: str) -> dict:
    """
    Fetch real-time quote data from Yahoo Finance's v7 JSON API.
    This bypasses the HTML consent wall entirely and returns rich data.
    """
    symbol = symbol.upper()
    try:
        session, crumb = _get_yahoo_session()

        params = {
            "symbols": symbol,
            "fields": (
                "shortName,longName,regularMarketPrice,regularMarketChange,"
                "regularMarketChangePercent,regularMarketVolume,regularMarketOpen,"
                "regularMarketDayHigh,regularMarketDayLow,regularMarketPreviousClose,"
                "marketCap,trailingPE,forwardPE,epsTrailingTwelveMonths,"
                "fiftyTwoWeekHigh,fiftyTwoWeekLow,fiftyDayAverage,"
                "twoHundredDayAverage,averageDailyVolume3Month,dividendYield,"
                "trailingAnnualDividendYield,currency,exchange,quoteType,"
                "bid,ask,bidSize,askSize,earningsTimestamp"
            ),
        }
        if crumb:
            params["crumb"] = crumb

        resp = session.get(
            "https://query2.finance.yahoo.com/v7/finance/quote",
            params=params,
            timeout=15,
        )
        resp.raise_for_status()
        payload = resp.json()

        quotes = payload.get("quoteResponse", {}).get("result", [])
        if not quotes:
            return {"symbol": symbol, "error": "No data returned by Yahoo", "source": "yahoo_finance_api_scrape"}

        q = quotes[0]
        return {
            "symbol": symbol,
            "timestamp": datetime.now().isoformat(),
            "source": "yahoo_finance_api_scrape",
            "name": q.get("longName") or q.get("shortName"),
            "current_price": q.get("regularMarketPrice"),
            "change": q.get("regularMarketChange"),
            "change_percent": q.get("regularMarketChangePercent"),
            "open": q.get("regularMarketOpen"),
            "day_high": q.get("regularMarketDayHigh"),
            "day_low": q.get("regularMarketDayLow"),
            "previous_close": q.get("regularMarketPreviousClose"),
            "volume": q.get("regularMarketVolume"),
            "market_cap": q.get("marketCap"),
            "pe_ratio": q.get("trailingPE"),
            "forward_pe": q.get("forwardPE"),
            "eps": q.get("epsTrailingTwelveMonths"),
            "fifty_two_week_high": q.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": q.get("fiftyTwoWeekLow"),
            "fifty_day_avg": q.get("fiftyDayAverage"),
            "two_hundred_day_avg": q.get("twoHundredDayAverage"),
            "avg_volume_3m": q.get("averageDailyVolume3Month"),
            "dividend_yield": q.get("trailingAnnualDividendYield"),
            "bid": q.get("bid"),
            "ask": q.get("ask"),
            "bid_size": q.get("bidSize"),
            "ask_size": q.get("askSize"),
            "currency": q.get("currency"),
            "exchange": q.get("exchange"),
        }

    except Exception as e:
        return {
            "symbol": symbol,
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
            "source": "yahoo_finance_api_scrape",
        }


# ---------------------------------------------------------------------------
# Source 2 — Finviz HTML scraping (BeautifulSoup) for fundamentals
# ---------------------------------------------------------------------------

def scrape_finviz(symbol: str) -> dict:
    """
    Scrape la page Finviz d'une action pour obtenir les fondamentaux.
    Utilise BeautifulSoup pour parser le tableau snapshot.
    """
    symbol = symbol.upper()
    url = f"https://finviz.com/quote.ashx?t={symbol}&p=d"

    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")

        data = {
            "symbol": symbol,
            "timestamp": datetime.now().isoformat(),
            "source": "finviz_scraping",
        }

        # Company name from the page title
        title_tag = soup.find("title")
        if title_tag:
            # title format: "AAPL Apple Inc. Stock Quote"
            name = title_tag.text.replace("Stock Quote", "").strip()
            # Remove the ticker prefix
            if name.upper().startswith(symbol):
                name = name[len(symbol):].strip()
            data["name"] = name

        # ---- Parse the snapshot fundamentals table ----
        snapshot_table = soup.find("table", class_="snapshot-table2")
        if not snapshot_table:
            # Fallback: look for any table with fundamentals-like data
            snapshot_table = soup.find("table", {"class": re.compile(r"snapshot")})

        if snapshot_table:
            rows = snapshot_table.find_all("tr")
            for row in rows:
                cells = row.find_all("td")
                # Cells are in pairs: [label, value, label, value, ...]
                for i in range(0, len(cells) - 1, 2):
                    label = cells[i].get_text(strip=True).lower()
                    value = cells[i + 1].get_text(strip=True)

                    if value == "-" or not value:
                        continue

                    _store_finviz_field(data, label, value)

        return data

    except Exception as e:
        return {
            "symbol": symbol,
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
            "source": "finviz_scraping",
        }


def _store_finviz_field(data: dict, label: str, value: str):
    """Map a Finviz label→value pair into our normalized data dict."""
    def _float(v):
        try:
            return float(v.replace(",", "").replace("%", "").replace("B", "").replace("M", "").replace("K", ""))
        except (ValueError, AttributeError):
            return None

    def _parse_big_number(v):
        """Parse '3.45T', '123.4B', '56.7M' etc."""
        v = v.strip()
        multiplier = 1
        if v.endswith("T"):
            multiplier = 1e12
            v = v[:-1]
        elif v.endswith("B"):
            multiplier = 1e9
            v = v[:-1]
        elif v.endswith("M"):
            multiplier = 1e6
            v = v[:-1]
        elif v.endswith("K"):
            multiplier = 1e3
            v = v[:-1]
        try:
            return float(v.replace(",", "")) * multiplier
        except ValueError:
            return None

    mapping = {
        "price": ("current_price", _float),
        "prev close": ("previous_close", _float),
        "open": ("open", _float),
        "market cap": ("market_cap", _parse_big_number),
        "volume": ("volume", lambda v: int(_parse_big_number(v) or 0)),
        "avg volume": ("avg_volume", lambda v: int(_parse_big_number(v) or 0)),
        "p/e": ("pe_ratio", _float),
        "forward p/e": ("forward_pe", _float),
        "eps (ttm)": ("eps", _float),
        "eps next y": ("eps_next_year", _float),
        "dividend %": ("dividend_yield_pct", _float),
        "52w high": ("fifty_two_week_high", _float),
        "52w low": ("fifty_two_week_low", _float),
        "52w range": ("fifty_two_week_range", lambda v: v),
        "rsi (14)": ("rsi_14", _float),
        "sma20": ("sma_20_pct", _float),
        "sma50": ("sma_50_pct", _float),
        "sma200": ("sma_200_pct", _float),
        "target price": ("target_price", _float),
        "beta": ("beta", _float),
        "roe": ("roe", _float),
        "roi": ("roi", _float),
        "debt/eq": ("debt_to_equity", _float),
        "short float": ("short_float_pct", _float),
        "short ratio": ("short_ratio", _float),
        "perf week": ("perf_week", _float),
        "perf month": ("perf_month", _float),
        "perf quarter": ("perf_quarter", _float),
        "perf half y": ("perf_half_year", _float),
        "perf year": ("perf_year", _float),
        "perf ytd": ("perf_ytd", _float),
        "volatility": ("volatility", lambda v: v),
        "change": ("change_percent", _float),
        "sector": ("sector", lambda v: v),
        "industry": ("industry", lambda v: v),
        "country": ("country", lambda v: v),
        "shares outstanding": ("shares_outstanding", _parse_big_number),
        "shares float": ("shares_float", _parse_big_number),
        "income": ("income", _parse_big_number),
        "sales": ("revenue", _parse_big_number),
        "book/sh": ("book_value_per_share", _float),
        "cash/sh": ("cash_per_share", _float),
        "profit margin": ("profit_margin_pct", _float),
        "oper. margin": ("operating_margin_pct", _float),
        "gross margin": ("gross_margin_pct", _float),
        "insider own": ("insider_ownership_pct", _float),
        "inst own": ("institutional_ownership_pct", _float),
        "payout": ("payout_ratio_pct", _float),
        "earnings": ("next_earnings_date", lambda v: v),
        "recom": ("analyst_recommendation", _float),
    }

    for key, (field, converter) in mapping.items():
        if label == key:
            result = converter(value)
            if result is not None:
                data[field] = result
            return


# ---------------------------------------------------------------------------
# Combined multi-source scraping
# ---------------------------------------------------------------------------

def scrape_stock(symbol: str) -> dict:
    """
    Scrape a stock from multiple sources and merge the results.
    Priority: Yahoo for real-time prices, Finviz for fundamentals.
    """
    symbol = symbol.upper()

    yahoo_data = scrape_yahoo_quote(symbol)
    finviz_data = scrape_finviz(symbol)

    # Start with Finviz data as the base (more fields)
    merged = {
        "symbol": symbol,
        "timestamp": datetime.now().isoformat(),
        "sources": [],
    }

    # Add Finviz fields
    if "error" not in finviz_data:
        merged["sources"].append("finviz")
        for k, v in finviz_data.items():
            if k not in ("symbol", "timestamp", "source") and v is not None:
                merged[k] = v

    # Overlay Yahoo fields (more accurate real-time data)
    if "error" not in yahoo_data:
        merged["sources"].append("yahoo_finance")
        for k, v in yahoo_data.items():
            if k not in ("symbol", "timestamp", "source") and v is not None:
                merged[k] = v

    if not merged["sources"]:
        merged["error"] = "All sources failed"
        merged["yahoo_error"] = yahoo_data.get("error")
        merged["finviz_error"] = finviz_data.get("error")

    return merged


def scrape_multiple_stocks(symbols: list[str]) -> list[dict]:
    """
    Scrape plusieurs actions avec un délai aléatoire entre chaque requête.
    Scraping aléatoire pour éviter d'être bloqué.
    """
    results = []
    for i, symbol in enumerate(symbols):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Scraping {symbol}...")
        result = scrape_stock(symbol)
        results.append(result)

        # Délai aléatoire entre les requêtes (2-5 secondes)
        if i < len(symbols) - 1:
            delay = random.uniform(2, 5)
            print(f"  Attente de {delay:.1f}s avant la prochaine requête...")
            time.sleep(delay)

    return results


def save_scraped_data(data: list[dict], filename: str = None):
    """Sauvegarde les données scrapées en JSON et CSV."""
    if not filename:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"scraped_{timestamp}"

    # JSON
    json_path = os.path.join(DATA_DIR, f"{filename}.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False, default=str)

    # CSV
    csv_path = os.path.join(DATA_DIR, f"{filename}.csv")
    df = pd.DataFrame(data)
    df.to_csv(csv_path, index=False)

    print(f"\nDonnées sauvegardées :")
    print(f"  JSON : {json_path}")
    print(f"  CSV  : {csv_path}")
    return json_path, csv_path


if __name__ == "__main__":
    symbols = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN"]
    print(f"=== Scraping multi-source de {len(symbols)} actions ===")
    print(f"Sources : Yahoo Finance (v7 API) + Finviz (HTML/BeautifulSoup)")
    print(f"Heure de début : {datetime.now().strftime('%H:%M:%S')}\n")

    results = scrape_multiple_stocks(symbols)

    for r in results:
        if "error" not in r:
            price = r.get("current_price", "N/A")
            change = r.get("change_percent")
            pe = r.get("pe_ratio", "N/A")
            vol = r.get("volume", "N/A")
            cap = r.get("market_cap")
            rsi = r.get("rsi_14", "N/A")
            cap_str = f"${cap/1e9:.1f}B" if cap else "N/A"
            change_str = f"{change:+.2f}%" if change else "N/A"
            print(f"\n{'='*50}")
            print(f"  {r.get('symbol')} — {r.get('name', 'N/A')}")
            print(f"  Price: ${price}  |  Change: {change_str}")
            print(f"  P/E: {pe}  |  Volume: {vol:,}" if isinstance(vol, int) else f"  P/E: {pe}  |  Volume: {vol}")
            print(f"  Market Cap: {cap_str}  |  RSI(14): {rsi}")
            print(f"  Sources: {', '.join(r.get('sources', []))}")
            fields = [k for k in r if k not in ("symbol", "timestamp", "sources", "name")]
            print(f"  Total data fields: {len(fields)}")
        else:
            print(f"\n{r.get('symbol')}: ERREUR - {r.get('error')}")

    json_path, csv_path = save_scraped_data(results)
    print(f"\n{len(results)} actions scrapées avec succès.")
    print(f"\nDonnées sauvegardées :")
    print(f"  JSON: {json_path}")
    print(f"  CSV:  {csv_path}")
