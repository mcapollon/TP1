"""
universe.py — Loads the bundled symbol universe and draws reproducible samples.

The universe file is generated offline by build_universe.py and committed under
backend/assets/. Sampling uses an isolated random.Random(seed) so the draw is
fully determined by (seed, universe file) and unaffected by global RNG state or
concurrent requests.
"""

import os
import random

_UNIVERSE_PATH = os.path.join(os.path.dirname(__file__), "assets", "us_common_stocks.txt")
_universe: list[str] | None = None


def load_universe() -> list[str]:
    """Read and memoize the bundled ticker list. Raises if missing/empty."""
    global _universe
    if _universe is None:
        if not os.path.exists(_UNIVERSE_PATH):
            raise FileNotFoundError(
                f"Universe file missing: {_UNIVERSE_PATH}. Run build_universe.py."
            )
        with open(_UNIVERSE_PATH, encoding="utf-8") as fh:
            _universe = [s.strip() for s in fh if s.strip()]
        if not _universe:
            raise ValueError(f"Universe file is empty: {_UNIVERSE_PATH}.")
    return _universe


def sample_symbols(count: int, seed: int) -> list[str]:
    """Return `count` distinct symbols drawn deterministically from `seed`.

    `count` is clamped to the universe size. The draw is reproducible: the same
    (seed, universe file) always yields the same list.
    """
    universe = load_universe()
    n = max(0, min(count, len(universe)))
    rng = random.Random(seed)
    return rng.sample(universe, n)
