"""
server.py — Serveur Flask API pour le frontend React.

Expose les endpoints pour :
- Recherche d'actions
- Données en temps réel
- Données historiques
- Analyse IA
- Données scrapées
- Contrôle du planificateur
"""

import os
from datetime import datetime

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv

from data_collector_api import (
    get_stock_info_yfinance,
    get_historical_data_yfinance,
    get_stock_info_alpha_vantage,
    search_stocks_yfinance,
)
from data_collector_scraper import scrape_stock
from ai_agent import analyze_stock, compare_stocks
from scheduler import (
    start_scheduler,
    stop_scheduler,
    get_latest_data,
    update_watchlist,
    collect_job,
)
from robots_checker import check_robots_txt, SITES_TO_CHECK

load_dotenv()

app = Flask(__name__)
CORS(app)

FLASK_PORT = int(os.getenv("FLASK_PORT", "5000"))


# ─── Routes: Recherche ──────────────────────────────────────────────────────────

@app.route("/api/search", methods=["GET"])
def search():
    """Recherche d'actions par nom ou symbole."""
    query = request.args.get("q", "").strip()
    if not query:
        return jsonify({"error": "Query parameter 'q' is required"}), 400

    results = search_stocks_yfinance(query)
    return jsonify({"query": query, "results": results})


# ─── Routes: Données en temps réel ──────────────────────────────────────────────

@app.route("/api/stock/<symbol>", methods=["GET"])
def get_stock(symbol: str):
    """Récupère les données actuelles d'une action (via API yfinance)."""
    source = request.args.get("source", "yfinance")

    try:
        if source == "alpha_vantage":
            data = get_stock_info_alpha_vantage(symbol)
        else:
            data = get_stock_info_yfinance(symbol)
        return jsonify(data)
    except ValueError as e:
        return jsonify({"error": str(e), "symbol": symbol}), 404
    except Exception as e:
        return jsonify({"error": str(e), "symbol": symbol}), 500


@app.route("/api/stock/<symbol>/scraped", methods=["GET"])
def get_stock_scraped(symbol: str):
    """Récupère les données d'une action par web scraping."""
    try:
        data = scrape_stock(symbol)
        return jsonify(data)
    except Exception as e:
        return jsonify({"error": str(e), "symbol": symbol}), 500


# ─── Routes: Données historiques ─────────────────────────────────────────────────

@app.route("/api/stock/<symbol>/history", methods=["GET"])
def get_history(symbol: str):
    """
    Récupère les données historiques.
    Query params: period (1d,5d,1mo,3mo,6mo,1y,5y), interval (1m,5m,1h,1d)
    """
    period = request.args.get("period", "1mo")
    interval = request.args.get("interval", "1d")

    allowed_periods = ["1d", "5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "ytd", "max"]
    allowed_intervals = ["1m", "2m", "5m", "15m", "30m", "60m", "90m", "1h", "1d", "5d", "1wk", "1mo", "3mo"]

    if period not in allowed_periods:
        return jsonify({"error": f"Invalid period. Allowed: {allowed_periods}"}), 400
    if interval not in allowed_intervals:
        return jsonify({"error": f"Invalid interval. Allowed: {allowed_intervals}"}), 400

    try:
        data = get_historical_data_yfinance(symbol, period=period, interval=interval)
        return jsonify({
            "symbol": symbol.upper(),
            "period": period,
            "interval": interval,
            "count": len(data),
            "data": data,
        })
    except Exception as e:
        return jsonify({"error": str(e), "symbol": symbol}), 500


# ─── Routes: Agent IA (Approche 2) ──────────────────────────────────────────────

@app.route("/api/ai/analyze/<symbol>", methods=["GET", "POST"])
def ai_analyze(symbol: str):
    """Analyse d'une action par l'agent IA."""
    question = None
    if request.method == "POST":
        body = request.get_json(silent=True) or {}
        question = body.get("question")
    else:
        question = request.args.get("question")

    try:
        result = analyze_stock(symbol, question)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e), "symbol": symbol}), 500


@app.route("/api/ai/compare", methods=["POST"])
def ai_compare():
    """Compare plusieurs actions via l'agent IA."""
    body = request.get_json(silent=True) or {}
    symbols = body.get("symbols", [])

    if not symbols or len(symbols) < 2:
        return jsonify({"error": "At least 2 symbols required"}), 400
    if len(symbols) > 5:
        return jsonify({"error": "Maximum 5 symbols allowed"}), 400

    try:
        result = compare_stocks(symbols)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ─── Routes: Planificateur ───────────────────────────────────────────────────────

@app.route("/api/scheduler/start", methods=["POST"])
def scheduler_start():
    """Démarre la collecte planifiée."""
    start_scheduler()
    return jsonify({"status": "started", "message": "Scheduler started"})


@app.route("/api/scheduler/stop", methods=["POST"])
def scheduler_stop():
    """Arrête la collecte planifiée."""
    stop_scheduler()
    return jsonify({"status": "stopped", "message": "Scheduler stopped"})


@app.route("/api/scheduler/collect", methods=["POST"])
def scheduler_collect_now():
    """Force une collecte immédiate."""
    collect_job()
    data = get_latest_data()
    return jsonify({"status": "collected", "count": len(data), "data": data})


@app.route("/api/scheduler/latest", methods=["GET"])
def scheduler_latest():
    """Récupère les dernières données collectées par le planificateur."""
    data = get_latest_data()
    return jsonify({"count": len(data), "data": data})


@app.route("/api/scheduler/watchlist", methods=["POST"])
def scheduler_watchlist():
    """Met à jour la watchlist du planificateur."""
    body = request.get_json(silent=True) or {}
    symbols = body.get("symbols", [])
    if not symbols:
        return jsonify({"error": "symbols array required"}), 400

    update_watchlist(symbols)
    return jsonify({"status": "updated", "watchlist": symbols})


# ─── Routes: Robots.txt ─────────────────────────────────────────────────────────

@app.route("/api/robots", methods=["GET"])
def robots_check():
    """Vérifie les politiques robots.txt des sites utilisés."""
    results = []
    for site in SITES_TO_CHECK:
        results.append(check_robots_txt(site))
    return jsonify({"sites": results})


# ─── Route: Santé ────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0",
    })


if __name__ == "__main__":
    print(f"\n{'='*60}")
    print(f"  Serveur Flask démarré sur http://localhost:{FLASK_PORT}")
    print(f"  Endpoints disponibles :")
    print(f"    GET  /api/health")
    print(f"    GET  /api/search?q=AAPL")
    print(f"    GET  /api/stock/AAPL")
    print(f"    GET  /api/stock/AAPL/history?period=1mo&interval=1d")
    print(f"    GET  /api/stock/AAPL/scraped")
    print(f"    GET  /api/ai/analyze/AAPL")
    print(f"    POST /api/ai/compare")
    print(f"    POST /api/scheduler/start")
    print(f"    GET  /api/scheduler/latest")
    print(f"    GET  /api/robots")
    print(f"{'='*60}\n")

    app.run(host="0.0.0.0", port=FLASK_PORT, debug=True)
