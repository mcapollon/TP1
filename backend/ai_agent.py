"""
ai_agent.py — Approche 2 : Utilisation d'Agent IA via OpenRouter.

Utilise un LLM pour analyser et interpréter les données boursières collectées.
L'agent peut répondre à des questions sur les données, fournir des analyses,
et suggérer des actions basées sur les tendances.
"""

import os
import json
from datetime import datetime

from openai import OpenAI
from dotenv import load_dotenv

from data_collector_api import get_stock_info_yfinance, get_historical_data_yfinance

load_dotenv()

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")

client = None
if OPENROUTER_API_KEY:
    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=OPENROUTER_API_KEY,
    )

SYSTEM_PROMPT = """Tu es un agent IA spécialisé dans l'analyse du marché boursier.
Tu as accès à des données en temps réel et historiques sur les actions.

Tes capacités :
1. Analyser les données d'une action (prix, volume, variation)
2. Identifier des tendances dans les données historiques
3. Fournir des résumés clairs et concis
4. Comparer des actions entre elles
5. Expliquer les métriques financières

Tu dois toujours :
- Être factuel et basé sur les données fournies
- Mentionner que ce n'est pas un conseil financier
- Donner des réponses structurées et faciles à comprendre
"""


def analyze_stock(symbol: str, question: str = None) -> dict:
    """
    Utilise l'agent IA pour analyser une action.
    Collecte les données puis les envoie au LLM pour analyse.
    """
    if not client:
        return {"error": "OpenRouter API key not configured"}

    # Collecte des données
    stock_info = get_stock_info_yfinance(symbol)
    historical = get_historical_data_yfinance(symbol, period="1mo", interval="1d")

    # Préparer le contexte pour l'agent
    context = f"""
Données actuelles pour {symbol}:
{json.dumps(stock_info, indent=2, default=str)}

Données historiques (dernier mois, {len(historical)} jours):
{json.dumps(historical[-10:], indent=2, default=str)}
(Affichage des 10 derniers jours)

Résumé des données historiques :
- Prix le plus haut : {max(d['high'] for d in historical) if historical else 'N/A'}
- Prix le plus bas : {min(d['low'] for d in historical) if historical else 'N/A'}
- Volume moyen : {sum(d['volume'] for d in historical) // len(historical) if historical else 'N/A'}
- Variation sur la période : {round(((historical[-1]['close'] - historical[0]['open']) / historical[0]['open']) * 100, 2) if historical else 'N/A'}%
"""

    user_message = question or f"Fais une analyse complète de l'action {symbol} basée sur ces données."

    try:
        response = client.chat.completions.create(
            model="google/gemini-2.0-flash-001",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": f"{context}\n\nQuestion: {user_message}"},
            ],
            max_tokens=1000,
            temperature=0.3,
        )

        analysis = response.choices[0].message.content

        return {
            "symbol": symbol,
            "question": user_message,
            "analysis": analysis,
            "data_summary": {
                "current_price": stock_info.get("current_price"),
                "change_percent": stock_info.get("change_percent"),
                "volume": stock_info.get("volume"),
                "market_cap": stock_info.get("market_cap"),
            },
            "timestamp": datetime.now().isoformat(),
            "model": "google/gemini-2.0-flash-001",
            "source": "openrouter_ai_agent",
        }

    except Exception as e:
        return {
            "symbol": symbol,
            "error": str(e),
            "timestamp": datetime.now().isoformat(),
        }


def compare_stocks(symbols: list[str]) -> dict:
    """Compare plusieurs actions en utilisant l'agent IA."""
    if not client:
        return {"error": "OpenRouter API key not configured"}

    all_data = {}
    for symbol in symbols:
        all_data[symbol] = get_stock_info_yfinance(symbol)

    context = "Données de comparaison :\n"
    for symbol, data in all_data.items():
        context += f"\n{symbol}:\n{json.dumps(data, indent=2, default=str)}\n"

    try:
        response = client.chat.completions.create(
            model="google/gemini-2.0-flash-001",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"{context}\n\nCompare ces actions et donne un résumé comparatif structuré.",
                },
            ],
            max_tokens=1500,
            temperature=0.3,
        )

        return {
            "symbols": symbols,
            "comparison": response.choices[0].message.content,
            "data": {s: {"price": d.get("current_price"), "change": d.get("change_percent")} for s, d in all_data.items()},
            "timestamp": datetime.now().isoformat(),
            "source": "openrouter_ai_agent",
        }

    except Exception as e:
        return {"symbols": symbols, "error": str(e)}


if __name__ == "__main__":
    if not OPENROUTER_API_KEY:
        print("⚠️  OpenRouter API key non configurée. Ajoutez-la dans .env")
        print("   OPENROUTER_API_KEY=your_key_here")
    else:
        print("Analyse de AAPL par l'agent IA...")
        result = analyze_stock("AAPL")
        print(json.dumps(result, indent=2, ensure_ascii=False))
