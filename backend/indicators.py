"""
indicators.py — Technical indicator computation.

Takes a yfinance history DataFrame fetched with auto_adjust=False (columns
Open, High, Low, Close, 'Adj Close', Volume, Dividends, Stock Splits) and
appends indicator columns.

All indicators are computed on the ADJUSTED series so that stock splits and
dividends do not create artificial jumps in returns/volatility/etc. yfinance
only adjusts Close, so adjusted Open/High/Low are derived from the adjustment
factor (Adj Close / Close).
"""

import numpy as np
import pandas as pd


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    """Return a copy of df with technical-indicator columns appended.

    Warm-up rows (insufficient history for a window) contain NaN; callers are
    responsible for serializing NaN as null.
    """
    out = df.copy()

    close = out["Close"]
    adj_close = out["Adj Close"]
    factor = (adj_close / close).replace([np.inf, -np.inf], np.nan).fillna(1.0)
    adj_open = out["Open"] * factor
    adj_high = out["High"] * factor
    adj_low = out["Low"] * factor
    volume = out["Volume"]

    # Returns
    out["return"] = adj_close.pct_change()
    out["log_return"] = np.log(adj_close / adj_close.shift(1))

    # Moving averages
    out["sma_20"] = adj_close.rolling(window=20).mean()
    out["sma_50"] = adj_close.rolling(window=50).mean()
    out["ema_12"] = adj_close.ewm(span=12, adjust=False).mean()
    out["ema_26"] = adj_close.ewm(span=26, adjust=False).mean()

    # MACD
    macd = out["ema_12"] - out["ema_26"]
    macd_signal = macd.ewm(span=9, adjust=False).mean()
    out["macd"] = macd
    out["macd_signal"] = macd_signal
    out["macd_hist"] = macd - macd_signal

    # Volatility: rolling std of daily returns
    out["volatility_20"] = out["return"].rolling(window=20).std()

    # RSI (Wilder, 14)
    delta = adj_close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / 14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / 14, adjust=False).mean()
    rs = avg_gain / avg_loss
    out["rsi_14"] = 100 - (100 / (1 + rs))

    # Bollinger Bands (20, 2 std) — reuse the already-computed SMA(20) as the mid band
    bb_mid = out["sma_20"]
    bb_std = adj_close.rolling(window=20).std()
    out["bb_mid"] = bb_mid
    out["bb_upper"] = bb_mid + 2 * bb_std
    out["bb_lower"] = bb_mid - 2 * bb_std

    # ATR (14) on adjusted high/low/close
    prev_close = adj_close.shift(1)
    true_range = pd.concat(
        [
            adj_high - adj_low,
            (adj_high - prev_close).abs(),
            (adj_low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    out["atr_14"] = true_range.ewm(alpha=1 / 14, adjust=False).mean()

    # On-balance volume
    direction = np.sign(adj_close.diff()).fillna(0)
    out["obv"] = (direction * volume).cumsum()

    # Stochastic oscillator (14)
    low_14 = adj_low.rolling(window=14).min()
    high_14 = adj_high.rolling(window=14).max()
    stoch_k = 100 * (adj_close - low_14) / (high_14 - low_14)
    out["stoch_k"] = stoch_k
    out["stoch_d"] = stoch_k.rolling(window=3).mean()

    # Volume change
    out["volume_change"] = volume.pct_change()

    return out
