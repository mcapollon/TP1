const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `API error: ${res.status}`);
  }
  return res.json();
}

export interface StockInfo {
  symbol: string;
  name?: string;
  current_price?: number;
  previous_close?: number;
  open?: number;
  day_high?: number;
  day_low?: number;
  volume?: number;
  market_cap?: number;
  pe_ratio?: number;
  dividend_yield?: number;
  fifty_two_week_high?: number;
  fifty_two_week_low?: number;
  beta?: number;
  trailing_eps?: number;
  forward_pe?: number;
  price_to_book?: number;
  profit_margins?: number;
  return_on_equity?: number;
  revenue?: number;
  ebitda?: number;
  shares_outstanding?: number;
  avg_volume?: number;
  fifty_two_week_change?: number;
  book_value?: number;
  change_percent?: number;
  currency?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  timestamp?: string;
  source?: string;
  error?: string;
}

export interface HistoricalPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adj_close?: number | null;
  dividends?: number | null;
  stock_splits?: number | null;
  // Indicators — present only when fetched with indicators=true
  return?: number | null;
  log_return?: number | null;
  sma_20?: number | null;
  sma_50?: number | null;
  ema_12?: number | null;
  ema_26?: number | null;
  macd?: number | null;
  macd_signal?: number | null;
  macd_hist?: number | null;
  volatility_20?: number | null;
  rsi_14?: number | null;
  bb_upper?: number | null;
  bb_mid?: number | null;
  bb_lower?: number | null;
  atr_14?: number | null;
  obv?: number | null;
  stoch_k?: number | null;
  stoch_d?: number | null;
  volume_change?: number | null;
}

export interface HistoryResponse {
  symbol: string;
  period: string;
  interval: string;
  count: number;
  data: HistoricalPoint[];
}

export interface AIAnalysis {
  symbol: string;
  analysis?: string;
  question?: string;
  data_summary?: {
    current_price?: number;
    change_percent?: number;
    volume?: number;
    market_cap?: number;
  };
  error?: string;
  timestamp?: string;
  model?: string;
}

export const api = {
  search: (q: string) => apiFetch(`/api/search?q=${encodeURIComponent(q)}`),

  getStock: (symbol: string): Promise<StockInfo> =>
    apiFetch(`/api/stock/${encodeURIComponent(symbol)}`),

  getStockScraped: (symbol: string): Promise<StockInfo> =>
    apiFetch(`/api/stock/${encodeURIComponent(symbol)}/scraped`),

  getHistory: (
    symbol: string,
    period = "1mo",
    interval = "1d",
    indicators = false
  ): Promise<HistoryResponse> =>
    apiFetch(
      `/api/stock/${encodeURIComponent(symbol)}/history?period=${period}&interval=${interval}${
        indicators ? "&indicators=1" : ""
      }`
    ),

  aiAnalyze: (symbol: string, question?: string): Promise<AIAnalysis> =>
    question
      ? apiFetch(`/api/ai/analyze/${encodeURIComponent(symbol)}`, {
          method: "POST",
          body: JSON.stringify({ question }),
        })
      : apiFetch(`/api/ai/analyze/${encodeURIComponent(symbol)}`),

  aiCompare: (symbols: string[]) =>
    apiFetch("/api/ai/compare", {
      method: "POST",
      body: JSON.stringify({ symbols }),
    }),

  checkRobots: () => apiFetch("/api/robots"),

  health: () => apiFetch("/api/health"),
};
