import { base44 } from "@/api/base44Client";

/**
 * Retries an async function on rate-limit (429) errors with exponential backoff.
 * Usage: const result = await withRetry(() => base44.entities.Task.list());
 */
export async function withRetry(fn, { retries = 3, baseDelay = 1000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = (err?.message || "").toLowerCase();
      const isRateLimit = msg.includes("rate limit") || err?.status === 429 || err?.code === 429;
      if (!isRateLimit || attempt === retries) throw err;
      const wait = baseDelay * Math.pow(2, attempt); // 1s, 2s, 4s
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/**
 * Loads ALL records from an entity by paginating through list() calls
 * using cursor-based pagination (stable and recommended by the SDK).
 * Use for pages that need client-side search/sort across the full dataset
 * (the default list() cap would otherwise hide older records).
 */
export async function listAll(entityClient, sort = "-created_date", pageSize = 1000) {
  let all = [];
  let cursor = null;
  while (true) {
    const page = cursor
      ? await entityClient.list({ sort, limit: pageSize, cursor })
      : await entityClient.list({ sort, limit: pageSize });
    const items = page.items || page;
    if (!items || items.length === 0) break;
    all = all.concat(items);
    cursor = page.next_cursor ?? null;
    if (!cursor || (page.has_more === false)) break;
  }
  return all;
}

/**
 * Runs an array of promise-returning functions in small batches
 * to avoid triggering rate limits with too many parallel calls.
 */
export async function batchedAll(fns, batchSize = 2, batchDelay = 0) {
  const results = [];
  for (let i = 0; i < fns.length; i += batchSize) {
    if (i > 0 && batchDelay > 0) await new Promise(r => setTimeout(r, batchDelay));
    const batch = fns.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn => fn().catch(() => [])));
    results.push(...batchResults);
  }
  return results;
}

/**
 * Simple in-memory cache with TTL (milliseconds).
 * Prevents the same data from being refetched repeatedly within the TTL window.
 */
const _cache = new Map();

export async function withCache(key, ttlMs, fn) {
  const cached = _cache.get(key);
  if (cached && Date.now() - cached.time < ttlMs) {
    return cached.data;
  }
  const data = await fn();
  _cache.set(key, { data, time: Date.now() });
  return data;
}

/**
 * Debounce — delays calling fn until `delay`ms have passed since the last call.
 * Useful for coalescing rapid real-time subscription events into a single refetch.
 */
export function debounce(fn, delay = 1500) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/**
 * Wrapped entity helpers that combine retry + batching + caching.
 * Each call is retried on rate-limit errors with exponential backoff.
 * Set cacheKey + cacheTtl to enable short-lived caching.
 */