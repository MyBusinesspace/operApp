/**
 * Fetch an entire entity collection in small batches via skip/limit,
 * instead of one large request. This:
 *   - avoids the single-request cap (fetch beyond 500, up to maxItems),
 *   - requests data in smaller, more responsive chunks,
 *   - keeps all existing client-side filter/search logic unchanged
 *     (the full set is still assembled before filtering).
 *
 * @param {Function} fetchFn  Entity list function: (sort, limit, skip) => Promise<Array>
 * @param {string}   sort      Sort spec passed to every batch (must be stable across batches).
 * @param {Object}   opts      { batchSize=100, maxItems=5000 }
 * @returns {Promise<Array>}  All matching records concatenated.
 */
export async function fetchAllBatched(fetchFn, sort, { batchSize = 100, maxItems = 5000 } = {}) {
  const all = [];
  let skip = 0;
  while (skip < maxItems) {
    const batch = await fetchFn(sort, batchSize, skip);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < batchSize) break; // last page reached
    skip += batchSize;
  }
  return all;
}