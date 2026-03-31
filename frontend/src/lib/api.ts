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
    interval = "1d"
  ): Promise<HistoryResponse> =>
    apiFetch(
      `/api/stock/${encodeURIComponent(symbol)}/history?period=${period}&interval=${interval}`
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
