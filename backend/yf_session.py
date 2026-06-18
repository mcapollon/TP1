"""
yf_session.py — Session partagée + cache + backoff pour les appels Yahoo Finance.

Yahoo renvoie « Too Many Requests » (HTTP 429) quand :
  - trop d'appels arrivent dans une courte fenêtre, ou
  - l'empreinte TLS de python-requests est détectée et bloquée.

Stratégie (du plus au moins impactant) :
  1. curl_cffi impersonate="chrome" -> contourne le filtrage par empreinte TLS.
  2. Cache TTL maison                -> évite de réinterroger .info / .history identiques.
  3. requests_cache                  -> met en cache les appels HTTP directs (recherche).
  4. retry + backoff exponentiel     -> absorbe les 429 transitoires.
"""

import os
import time
import functools

import yfinance as yf
from curl_cffi import requests as curl_requests
import requests_cache

# Fenêtre de fraîcheur des cotations, en secondes.
# Volontairement courte : le scheduler veut des données fraîches à chaque cycle,
# mais ce cache déduplique le cas fréquent où l'API Flask redemande un symbole
# que le scheduler vient de récupérer.
QUOTE_TTL = int(os.getenv("YF_CACHE_TTL_SECONDS", "90"))

_DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
os.makedirs(_DATA_DIR, exist_ok=True)

# ─── Session impersonée (contourne le blocage par empreinte TLS) ─────────────────
_yf_session = curl_requests.Session(impersonate="chrome")


def make_ticker(symbol: str) -> "yf.Ticker":
    """Crée un yf.Ticker avec la session impersonée.

    Défensif vis-à-vis des versions de yfinance : certaines releases acceptent
    le paramètre `session`, d'autres non. On retombe sur l'appel nu si besoin.
    """
    try:
        return yf.Ticker(symbol, session=_yf_session)
    except TypeError:
        return yf.Ticker(symbol)


# ─── Session HTTP mise en cache (appels directs : API de recherche Yahoo) ────────
search_session = requests_cache.CachedSession(
    cache_name=os.path.join(_DATA_DIR, ".http_cache"),
    backend="sqlite",
    expire_after=QUOTE_TTL,
)


# ─── Cache TTL maison : clé -> (timestamp, valeur) ───────────────────────────────
_cache: dict = {}


def ttl_cache(ttl: int = QUOTE_TTL):
    """Mémoïse le retour d'une fonction pendant `ttl` secondes (clé = args/kwargs)."""
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            key = (fn.__name__, args, tuple(sorted(kwargs.items())))
            now = time.monotonic()
            hit = _cache.get(key)
            if hit and now - hit[0] < ttl:
                return hit[1]
            value = fn(*args, **kwargs)
            _cache[key] = (now, value)
            return value
        return wrapper
    return deco


# ─── Retry + backoff exponentiel sur 429 ─────────────────────────────────────────
def with_backoff(retries: int = 4, base: float = 2.0):
    """Réessaie sur « Too Many Requests » avec un délai 2s, 4s, 8s, ..."""
    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            last_exc = None
            for attempt in range(retries):
                try:
                    return fn(*args, **kwargs)
                except Exception as exc:  # noqa: BLE001 — on relance si non-429
                    msg = str(exc).lower()
                    is_429 = (
                        "too many requests" in msg
                        or "429" in msg
                        or "rate limit" in msg
                    )
                    last_exc = exc
                    if not is_429 or attempt == retries - 1:
                        raise
                    delay = base * (2 ** attempt)
                    print(
                        f"[backoff] 429 sur {fn.__name__}, "
                        f"nouvel essai dans {delay:.0f}s "
                        f"(tentative {attempt + 1}/{retries})..."
                    )
                    time.sleep(delay)
            raise last_exc  # pragma: no cover
        return wrapper
    return deco
