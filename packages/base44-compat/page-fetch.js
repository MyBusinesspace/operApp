/**
 * Fetch large result sets from PostgREST in fixed-size pages.
 *
 * A single `limit=10000` can time out or hit gateway limits on Supabase; paging
 * internally keeps the Base44 SDK contract (one array) while staying under those
 * ceilings. Used by both the browser and server compat layers.
 */

export const PAGE_CHUNK = 1000;

/** Above this, list/filter switch to chunked reads. */
export const CHUNK_THRESHOLD = 1000;

/**
 * @param {(from: number, to: number) => Promise<any[]>} fetchRange
 *   Inclusive PostgREST range callback: from/to are 0-based indices.
 * @param {{ skip?: number, limit?: number, chunkSize?: number }} opts
 */
export async function fetchInChunks(fetchRange, opts = {}) {
  const skip = Math.max(0, Number(opts.skip) || 0);
  const limit = Math.max(0, Number(opts.limit) || 0);
  const chunkSize = Math.max(1, Number(opts.chunkSize) || PAGE_CHUNK);

  if (!limit) return [];

  const out = [];
  let offset = skip;
  const end = skip + limit;

  while (offset < end) {
    const to = Math.min(offset + chunkSize, end) - 1;
    const page = await fetchRange(offset, to);
    if (!page?.length) break;
    out.push(...page);
    if (page.length < to - offset + 1) break;
    offset += page.length;
  }

  return out;
}

export function shouldChunk(limit, skip = 0) {
  return (Number(limit) || 0) > CHUNK_THRESHOLD || (Number(skip) || 0) > 0 && (Number(limit) || 0) > CHUNK_THRESHOLD;
}
