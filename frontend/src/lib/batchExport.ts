// API base — mirrors lib/api.ts.
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export type BatchFormat = "csv" | "json";

export interface BatchParams {
  count: number;
  format: BatchFormat;
  indicators: boolean;
  period: string;
  seed?: number | null;
}

export interface BatchRunResult {
  seed: number;
  count: number;
  format: BatchFormat;
  indicators: boolean;
  period: string;
  returned: number;
  skipped: number;
  warning: string | null;
  exported_at: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (disposition) {
    const m = disposition.match(/filename=([^;]+)/i);
    if (m) return m[1].trim().replace(/^"|"$/g, "");
  }
  return fallback;
}

/**
 * Run a batch export: fetch the file, read the metadata headers, trigger a
 * browser download, and return a record describing the run. The seed is read
 * from the X-Seed response header, so a blank-seed (server-random) run is still
 * reproducible afterwards.
 */
export async function runBatchExport(params: BatchParams): Promise<BatchRunResult> {
  const { count, format, indicators, period, seed } = params;
  const qs = new URLSearchParams({
    count: String(count),
    format,
    indicators: indicators ? "1" : "0",
    period,
    interval: "1d",
  });
  if (seed !== undefined && seed !== null) qs.set("seed", String(seed));

  const res = await fetch(`${API_BASE}/api/export/batch?${qs.toString()}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `Export failed: ${res.status}`);
  }

  const resolvedSeed = Number(res.headers.get("X-Seed"));
  const returned = Number(res.headers.get("X-Returned") ?? 0);
  const skipped = Number(res.headers.get("X-Skipped") ?? 0);
  const warning = res.headers.get("X-Warning");
  const ext = format === "json" ? "json" : "csv";
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = filenameFromDisposition(
    res.headers.get("Content-Disposition"),
    `batch_${count}_seed${resolvedSeed}_${ts}.${ext}`
  );

  const blob = await res.blob();
  triggerDownload(blob, filename);

  return {
    seed: resolvedSeed,
    count,
    format,
    indicators,
    period,
    returned,
    skipped,
    warning: warning || null,
    exported_at: new Date().toISOString(),
  };
}
