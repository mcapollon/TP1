import { BatchRunResult } from "./batchExport";

const STORAGE_KEY = "batch_export_history";
const MAX_RECORDS = 50;

export interface BatchRecord extends BatchRunResult {
  id: string;
}

/** Read the saved run records. Returns [] on missing/corrupt storage; never throws. */
export function loadHistory(): BatchRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BatchRecord[]) : [];
  } catch {
    return [];
  }
}

function persist(records: BatchRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  } catch {
    // Quota or serialization failure: keep the in-memory list for this session.
  }
}

/** Prepend a new record (most-recent first), cap at MAX_RECORDS, persist. */
export function addRecord(result: BatchRunResult): BatchRecord[] {
  const record: BatchRecord = { ...result, id: `${result.exported_at}_${result.seed}` };
  const next = [record, ...loadHistory()].slice(0, MAX_RECORDS);
  persist(next);
  return next;
}

export function removeRecord(id: string): BatchRecord[] {
  const next = loadHistory().filter((r) => r.id !== id);
  persist(next);
  return next;
}

export function clearHistory(): BatchRecord[] {
  persist([]);
  return [];
}
