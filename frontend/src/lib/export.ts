import { StockInfo, HistoricalPoint } from "./api";

export type ExportFormat = "csv" | "json" | "xls";

export interface StockDataBundle {
  stock: StockInfo;
  history: HistoricalPoint[];
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

function escapeCSV(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

// ── Single Stock Exports ────────────────────────────────────

export function exportStockCSV(stock: StockInfo) {
  const headers = Object.keys(stock);
  const values = headers.map((k) => escapeCSV((stock as any)[k]));
  const csv = [headers.join(","), values.join(",")].join("\n");
  downloadFile(csv, `${stock.symbol}_details_${timestamp()}.csv`, "text/csv");
}

export function exportHistoryCSV(data: HistoricalPoint[], symbol: string) {
  if (!data.length) return;
  const headers = ["date", "open", "high", "low", "close", "volume"];
  const rows = data.map((d) =>
    [d.date, d.open, d.high, d.low, d.close, d.volume].join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  downloadFile(csv, `${symbol}_history_${timestamp()}.csv`, "text/csv");
}

export function exportStockJSON(stock: StockInfo) {
  const json = JSON.stringify(stock, null, 2);
  downloadFile(json, `${stock.symbol}_details_${timestamp()}.json`, "application/json");
}

export function exportHistoryJSON(data: HistoricalPoint[], symbol: string) {
  const json = JSON.stringify(
    { symbol, exported_at: new Date().toISOString(), count: data.length, data },
    null,
    2
  );
  downloadFile(json, `${symbol}_history_${timestamp()}.json`, "application/json");
}

export function exportFullJSON(stock: StockInfo, history: HistoricalPoint[]) {
  const report = {
    exported_at: new Date().toISOString(),
    stock_details: stock,
    historical_data: { count: history.length, data: history },
  };
  const json = JSON.stringify(report, null, 2);
  downloadFile(
    json,
    `${stock.symbol}_full_report_${timestamp()}.json`,
    "application/json"
  );
}

export function exportHistoryXLS(data: HistoricalPoint[], symbol: string) {
  if (!data.length) return;
  const headers = ["Date", "Open", "High", "Low", "Close", "Volume"];
  const rows = data.map((d) =>
    [d.date, d.open, d.high, d.low, d.close, d.volume].join("\t")
  );
  const tsv = [headers.join("\t"), ...rows].join("\n");
  downloadFile(tsv, `${symbol}_history_${timestamp()}.xls`, "application/vnd.ms-excel");
}

export function exportStockXLS(stock: StockInfo) {
  const entries = Object.entries(stock).filter(([, v]) => v != null);
  const headers = ["Field", "Value"];
  const rows = entries.map(([k, v]) => `${k}\t${v}`);
  const tsv = [headers.join("\t"), ...rows].join("\n");
  downloadFile(tsv, `${stock.symbol}_details_${timestamp()}.xls`, "application/vnd.ms-excel");
}

// ── Multi-Stock Exports ─────────────────────────────────────

export function exportMultiStockCSV(bundles: StockDataBundle[]) {
  if (!bundles.length) return;
  // Build a union of all keys across all stocks
  const allKeys = new Set<string>();
  bundles.forEach((b) => Object.keys(b.stock).forEach((k) => allKeys.add(k)));
  const headers = Array.from(allKeys);

  const rows = bundles.map((b) =>
    headers.map((k) => escapeCSV((b.stock as any)[k])).join(",")
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const symbols = bundles.map((b) => b.stock.symbol).join("_");
  downloadFile(csv, `stocks_${symbols}_${timestamp()}.csv`, "text/csv");
}

export function exportMultiHistoryCSV(bundles: StockDataBundle[]) {
  if (!bundles.length) return;
  const headers = ["symbol", "date", "open", "high", "low", "close", "volume"];
  const rows: string[] = [];
  bundles.forEach((b) =>
    b.history.forEach((d) =>
      rows.push(
        [b.stock.symbol, d.date, d.open, d.high, d.low, d.close, d.volume].join(",")
      )
    )
  );
  const csv = [headers.join(","), ...rows].join("\n");
  const symbols = bundles.map((b) => b.stock.symbol).join("_");
  downloadFile(csv, `history_${symbols}_${timestamp()}.csv`, "text/csv");
}

export function exportMultiStockJSON(bundles: StockDataBundle[]) {
  const report = {
    exported_at: new Date().toISOString(),
    stock_count: bundles.length,
    stocks: bundles.map((b) => ({
      details: b.stock,
      historical_data: { count: b.history.length, data: b.history },
    })),
  };
  const json = JSON.stringify(report, null, 2);
  const symbols = bundles.map((b) => b.stock.symbol).join("_");
  downloadFile(json, `stocks_${symbols}_${timestamp()}.json`, "application/json");
}

export function exportMultiStockXLS(bundles: StockDataBundle[]) {
  if (!bundles.length) return;
  const allKeys = new Set<string>();
  bundles.forEach((b) => Object.keys(b.stock).forEach((k) => allKeys.add(k)));
  const headers = Array.from(allKeys);

  const rows = bundles.map((b) =>
    headers.map((k) => (b.stock as any)[k] ?? "").join("\t")
  );
  const tsv = [headers.join("\t"), ...rows].join("\n");
  const symbols = bundles.map((b) => b.stock.symbol).join("_");
  downloadFile(tsv, `stocks_${symbols}_${timestamp()}.xls`, "application/vnd.ms-excel");
}

export function exportMultiHistoryXLS(bundles: StockDataBundle[]) {
  if (!bundles.length) return;
  const headers = ["Symbol", "Date", "Open", "High", "Low", "Close", "Volume"];
  const rows: string[] = [];
  bundles.forEach((b) =>
    b.history.forEach((d) =>
      rows.push(
        [b.stock.symbol, d.date, d.open, d.high, d.low, d.close, d.volume].join("\t")
      )
    )
  );
  const tsv = [headers.join("\t"), ...rows].join("\n");
  const symbols = bundles.map((b) => b.stock.symbol).join("_");
  downloadFile(tsv, `history_${symbols}_${timestamp()}.xls`, "application/vnd.ms-excel");
}

// ── Convenience: Export single stock in any format ───────────

export function exportSingle(
  format: ExportFormat,
  stock: StockInfo,
  history: HistoricalPoint[],
  type: "details" | "history" | "full" = "full"
) {
  if (type === "details") {
    if (format === "csv") exportStockCSV(stock);
    else if (format === "json") exportStockJSON(stock);
    else exportStockXLS(stock);
  } else if (type === "history") {
    if (format === "csv") exportHistoryCSV(history, stock.symbol);
    else if (format === "json") exportHistoryJSON(history, stock.symbol);
    else exportHistoryXLS(history, stock.symbol);
  } else {
    if (format === "csv") {
      exportStockCSV(stock);
      exportHistoryCSV(history, stock.symbol);
    } else if (format === "json") {
      exportFullJSON(stock, history);
    } else {
      exportStockXLS(stock);
      exportHistoryXLS(history, stock.symbol);
    }
  }
}

// ── Convenience: Export multiple stocks in any format ────────

export function exportMulti(
  format: ExportFormat,
  bundles: StockDataBundle[],
  type: "details" | "history" | "full" = "full"
) {
  if (type === "details") {
    if (format === "csv") exportMultiStockCSV(bundles);
    else if (format === "json") exportMultiStockJSON(bundles);
    else exportMultiStockXLS(bundles);
  } else if (type === "history") {
    if (format === "csv") exportMultiHistoryCSV(bundles);
    else if (format === "json") exportMultiStockJSON(bundles);
    else exportMultiHistoryXLS(bundles);
  } else {
    if (format === "csv") {
      exportMultiStockCSV(bundles);
      exportMultiHistoryCSV(bundles);
    } else if (format === "json") {
      exportMultiStockJSON(bundles);
    } else {
      exportMultiStockXLS(bundles);
      exportMultiHistoryXLS(bundles);
    }
  }
}
