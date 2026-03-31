"""
robots_checker.py — Vérifie la politique robots.txt des sites ciblés.
Respecte les règles de scraping définies par chaque site.
"""

import urllib.robotparser
from urllib.parse import urlparse


SITES_TO_CHECK = [
    "https://finance.yahoo.com",
    "https://www.google.com/finance",
]


def check_robots_txt(url: str, user_agent: str = "*") -> dict:
    """
    Vérifie le fichier robots.txt d'un site et retourne les permissions.
    """
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"

    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(robots_url)

    try:
        rp.read()
        can_fetch = rp.can_fetch(user_agent, url)
        crawl_delay = rp.crawl_delay(user_agent)
        request_rate = rp.request_rate(user_agent)

        return {
            "url": url,
            "robots_url": robots_url,
            "can_fetch": can_fetch,
            "crawl_delay": crawl_delay,
            "request_rate": str(request_rate) if request_rate else None,
        }
    except Exception as e:
        return {
            "url": url,
            "robots_url": robots_url,
            "error": str(e),
            "can_fetch": False,
        }


def check_all_sites():
    """Vérifie robots.txt pour tous les sites ciblés."""
    results = []
    for site in SITES_TO_CHECK:
        result = check_robots_txt(site)
        results.append(result)
        print(f"\n{'='*60}")
        print(f"Site: {result['url']}")
        print(f"Robots.txt: {result['robots_url']}")
        if "error" in result:
            print(f"Erreur: {result['error']}")
        else:
            print(f"Scraping autorisé: {'Oui' if result['can_fetch'] else 'Non'}")
            print(f"Délai de crawl: {result['crawl_delay'] or 'Non spécifié'}")
            print(f"Taux de requêtes: {result['request_rate'] or 'Non spécifié'}")
    return results


if __name__ == "__main__":
    check_all_sites()
