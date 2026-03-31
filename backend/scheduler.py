"""
scheduler.py — Planificateur pour le scraping à intervalle régulier.

Scraping aléatoire à l'intervalle minimum permis (par défaut 5 minutes).
Collecte des données fraîches à chaque exécution.
"""

import os
import json
from datetime import datetime

from apscheduler.schedulers.background import BackgroundScheduler
from dotenv import load_dotenv

from data_collector_api import get_stock_info_yfinance, save_to_json
from data_collector_scraper import scrape_yahoo_quote, save_scraped_data

load_dotenv()

INTERVAL_MINUTES = int(os.getenv("SCRAPING_INTERVAL_MINUTES", "5"))
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

# Actions à surveiller par défaut
DEFAULT_WATCHLIST = ["AAPL", "TSLA", "GOOGL", "MSFT", "AMZN"]

scheduler = BackgroundScheduler()
collected_data = []  # Stockage en mémoire des dernières données


def collect_job():
    """Job de collecte exécuté à chaque intervalle."""
    global collected_data
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Collecte planifiée en cours...")

    batch = []
    for symbol in DEFAULT_WATCHLIST:
        try:
            # Utilise l'API yfinance (plus fiable que le scraping)
            data = get_stock_info_yfinance(symbol)
            batch.append(data)
            print(f"  {symbol}: ${data.get('current_price', 'N/A')}")
        except Exception as e:
            print(f"  {symbol}: Erreur - {e}")
            batch.append({"symbol": symbol, "error": str(e), "timestamp": datetime.now().isoformat()})

    collected_data = batch

    # Sauvegarder le batch
    save_to_json(batch, f"scheduled_{timestamp}.json")
    print(f"  Collecte terminée - {len(batch)} actions")


def start_scheduler():
    """Démarre le planificateur de collecte."""
    if not scheduler.running:
        scheduler.add_job(
            collect_job,
            "interval",
            minutes=INTERVAL_MINUTES,
            id="stock_collector",
            replace_existing=True,
        )
        scheduler.start()
        print(f"Planificateur démarré - intervalle: {INTERVAL_MINUTES} minutes")
        # Exécuter immédiatement une première collecte
        collect_job()


def stop_scheduler():
    """Arrête le planificateur."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("Planificateur arrêté")


def get_latest_data() -> list[dict]:
    """Retourne les dernières données collectées."""
    return collected_data


def update_watchlist(symbols: list[str]):
    """Met à jour la watchlist."""
    global DEFAULT_WATCHLIST
    DEFAULT_WATCHLIST = [s.upper() for s in symbols]
    print(f"Watchlist mise à jour: {DEFAULT_WATCHLIST}")


if __name__ == "__main__":
    print(f"Démarrage du collecteur (intervalle: {INTERVAL_MINUTES} min)")
    start_scheduler()

    try:
        import time
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        stop_scheduler()
        print("Arrêt propre du collecteur.")
