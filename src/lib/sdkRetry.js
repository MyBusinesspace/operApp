// Shared SDK read helpers: rate-limit retry with exponential backoff, serialised
// paginated reads with a small delay between pages, a session-scoped module-level
// cache so dropping 10 files does not re-read the same entities 10 times, and a
// retry-state broadcast so the UI can show "Waiting for the server rate limit".
import { base44 } from "@/api/base44Client";

// ── Rate-limit detection ──────────────────────────────────────────────────────
export const isRateLimitError = (err) => {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    err?.status === 429 ||
    err?.statusCode === 429 ||
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("too many requests") ||
    msg.includes("traffic volume") ||
    msg.includes("volume limit")
  );
};

export const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Retry-state broadcast ────────────────────────────────────────────────────
const retryListeners = new Set();
let retryDepth = 0;
let lastNotified = false;

export const subscribeRetryState = (cb) => {
  retryListeners.add(cb);
  // Immediately notify the new subscriber of the current state.
  try { cb(lastNotified); } catch {}
  return () => { retryListeners.delete(cb); };
};

const setRetrying = (entering) => {
  if (entering) retryDepth++;
  else retryDepth = Math.max(0, retryDepth - 1);
  const isRetrying = retryDepth > 0;
  if (isRetrying !== lastNotified) {
    lastNotified = isRetrying;
    for (const cb of retryListeners) { try { cb(isRetrying); } catch {} }
  }
};

// ── withRetry: exponential backoff on rate-limit errors (1s, 2s, 4s, 8s, …) ───
export async function withRetry(fn, { tries = 5, baseDelay = 1000, maxTotalWait = 30000, label = "SDK call" } = {}) {
  let lastErr;
  let totalWait = 0;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === tries - 1) break;
      if (!isRateLimitError(err)) break;
      const wait = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s, 8s
      if (totalWait + wait > maxTotalWait) break; // hard cap ~30s total
      totalWait += wait;
      setRetrying(true);
      try { await delay(wait); } finally { setRetrying(false); }
    }
  }
  throw lastErr;
}

// ── readAllPages: serialised cursor-paginated read with retry + inter-page delay ─
export async function readAllPages(entityName, query, { sort = "-created_date", limit = 1000, fields, pageDelay = 120 } = {}) {
  const items = [];
  let cursor = null;
  for (;;) {
    const opts = { sort, limit };
    if (cursor) opts.cursor = cursor;
    if (fields) opts.fields = fields;
    const page = await withRetry(() => base44.entities[entityName].filter(query, opts), { label: `${entityName}.filter` });
    const arr = page.items || (Array.isArray(page) ? page : []);
    if (!arr.length) break;
    items.push(...arr);
    cursor = page.next_cursor;
    if (!cursor || page.has_more === false) break;
    if (pageDelay) await delay(pageDelay);
  }
  return items;
}

// ── Session-scoped module-level cache ─────────────────────────────────────────
// Persists across component remounts and multiple file drops. Call
// invalidateSdkCache() after an actual import writes new records.
export const sdkCache = {
  bankAccounts: null,
  conversionDate: null,
  conversionDateLoaded: false,
  existingKeys: {},   // entityKey -> Set<dedupKey>
  existingDocs: {},   // entityKey -> { dedupKey -> record }
  docMaps: null,      // { billByNumber, invoiceByNumber, bills, invoices }
  bankTxDedup: {},    // bankAccountId -> Map<key, count>
  bankTxMap: {},      // bankAccountId -> Map<key, record[]>
};

export const invalidateSdkCache = () => {
  sdkCache.bankAccounts = null;
  sdkCache.conversionDate = null;
  sdkCache.conversionDateLoaded = false;
  sdkCache.existingKeys = {};
  sdkCache.existingDocs = {};
  sdkCache.docMaps = null;
  sdkCache.bankTxDedup = {};
  sdkCache.bankTxMap = {};
};