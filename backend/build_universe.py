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

# Word-boundary patterns for blocklist terms that are also common English words
# inside legitimate company names ("unit" in "United", "right" in "Bright").
# `s?` so plurals ("Units", "Rights", "Warrants") are still caught.
NAME_BLOCKLIST_WORDS = (
    re.compile(r"\bwarrants?\b"),
    re.compile(r"\bunits?\b"),
    re.compile(r"\brights?\b"),
    re.compile(r"\bpreferred\b"),
    re.compile(r"\bdepositary\b"),
    re.compile(r"\bdepository\b"),
)
# Unambiguous substrings — these don't occur mid-word in normal company names.
NAME_BLOCKLIST_SUBSTR = (
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
    if any(p.search(lname) for p in NAME_BLOCKLIST_WORDS):
        return False
    return not any(bad in lname for bad in NAME_BLOCKLIST_SUBSTR)


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
