/**
 * Atomic document-number sequence using a compare-and-swap (CAS) loop.
 *
 * Replaces the old "load 5000 records and compute max+1" pattern that collided
 * under concurrent access. Each call atomically claims a unique value via
 * `updateMany({id, next_value: claimed}, {$set: {next_value: claimed+1}})`,
 * which returns `{updated: 1}` only when the caller won the race.
 *
 * The sequence record is seeded once (from the current max) on first use;
 * afterwards every claim is an O(1) CAS — no full-table scan.
 */

async function ensureSequence(base44, sequenceType, prefix, padding) {
  const ds = base44.asServiceRole.entities.DocumentSequence;
  let records = await ds.filter({ sequence_type: sequenceType });
  let seq = Array.isArray(records) ? records[0] : null;

  if (!seq) {
    // One-time seed: scan the source entity for the current max number.
    let seedMax = 0;
    if (sequenceType === 'JNL') {
      const page = await base44.asServiceRole.entities.JournalEntry.list("-date", 5000);
      const arr = Array.isArray(page) ? page : (page?.items || []);
      const nums = arr.map((j) => j?.number).filter((n) => n && n.startsWith(prefix));
      seedMax = nums.length
        ? Math.max(...nums.map((n) => parseInt(String(n).replace(prefix, ""), 10) || 0))
        : 0;
    }
    try {
      await ds.create({
        sequence_type: sequenceType,
        next_value: seedMax + 1,
        prefix,
        padding,
      });
    } catch {
      /* concurrent create — handled below */
    }
    // Re-read; if a race created duplicates, keep the one with the lowest next_value.
    records = await ds.filter({ sequence_type: sequenceType });
    if (Array.isArray(records) && records.length > 1) {
      records.sort((a, b) => (a.next_value || 0) - (b.next_value || 0));
      for (let i = 1; i < records.length; i++) {
        await ds.delete(records[i].id).catch(() => {});
      }
    }
    seq = Array.isArray(records) ? records[0] : null;
  }

  return { ds, seq };
}

export async function getNextSequence(base44, sequenceType, opts = {}) {
  const prefix = opts.prefix || `${sequenceType}-`;
  const padding = opts.padding ?? 4;

  let { ds, seq } = await ensureSequence(base44, sequenceType, prefix, padding);
  if (!seq) throw new Error(`Sequence "${sequenceType}" could not be initialized`);

  // ── CAS loop: claim the next value atomically ──────────────────────────────
  for (let attempt = 0; attempt < 25; attempt++) {
    const claimed = seq.next_value;
    const result = await ds.updateMany(
      { id: seq.id, next_value: claimed },
      { $set: { next_value: claimed + 1 } }
    );
    if (result && result.updated === 1) {
      return `${prefix}${String(claimed).padStart(padding, "0")}`;
    }
    // Lost the race — re-read and retry with the latest value.
    const fresh = await ds.filter({ id: seq.id });
    seq = Array.isArray(fresh) ? fresh[0] : seq;
  }
  throw new Error(`Failed to acquire sequence "${sequenceType}" after 25 attempts`);
}

/**
 * Atomically reserves `count` sequence numbers in a single CAS.
 * Returns an array of formatted number strings (e.g. ["JNL-0001", "JNL-0002", ...]).
 * Far more efficient than calling getNextSequence N times for bulk imports.
 */
export async function getNextSequenceBatch(base44, sequenceType, count, opts = {}) {
  const prefix = opts.prefix || `${sequenceType}-`;
  const padding = opts.padding ?? 4;

  let { ds, seq } = await ensureSequence(base44, sequenceType, prefix, padding);
  if (!seq) throw new Error(`Sequence "${sequenceType}" could not be initialized`);

  // ── CAS loop: claim `count` values atomically ──────────────────────────────
  for (let attempt = 0; attempt < 25; attempt++) {
    const startVal = seq.next_value;
    const result = await ds.updateMany(
      { id: seq.id, next_value: startVal },
      { $set: { next_value: startVal + count } }
    );
    if (result && result.updated === 1) {
      const numbers = [];
      for (let i = 0; i < count; i++) {
        numbers.push(`${prefix}${String(startVal + i).padStart(padding, "0")}`);
      }
      return numbers;
    }
    // Lost the race — re-read and retry with the latest value.
    const fresh = await ds.filter({ id: seq.id });
    seq = Array.isArray(fresh) ? fresh[0] : seq;
  }
  throw new Error(`Failed to acquire sequence batch "${sequenceType}" after 25 attempts`);
}