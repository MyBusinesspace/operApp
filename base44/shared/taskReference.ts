/**
 * Reserves the next Task reference from the SHARED numbering series used by
 * assignReferenceNumber — series "TASK-YYYY", format "T-YYYY-N", no zero padding,
 * no maximum.
 *
 * Called directly (no HTTP call) by generateRecurringTasks and apiPlanner.
 *
 * The series is seeded once from the highest "T-YYYY-N" already in use on Task, and
 * every claim goes through the atomic CAS in shared/sequence.ts, so concurrent
 * callers can never be handed the same number. A claimed number that a record
 * already carries (a leftover from the old max+1 generators) is skipped.
 */

import { getNextSequence } from './sequence.ts';

const FIELD = 'reference';
const SEQUENCE_PREFIX = 'TASK';
const REF_PREFIX = 'T';
const MAX_TRIES = 50;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** filter() returns an array without options, a { items } page with them. */
function toRows(res) {
  return Array.isArray(res) ? res : (res?.items || []);
}

/** Highest trailing integer already used for `prefix` (e.g. "T-2026-"). */
async function highestInUse(taskApi, prefix) {
  const pattern = `^${escapeRegex(prefix)}\\d+$`;
  let cursor = null;
  let max = 0;
  for (let page = 0; page < 20; page++) {
    const options = { sort: 'reference', limit: 1000, fields: [FIELD] };
    if (cursor) options.cursor = cursor;
    const res = await taskApi.filter({ [FIELD]: { $regex: pattern } }, options);
    for (const row of toRows(res)) {
      const n = parseInt(String(row[FIELD]).slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    if (Array.isArray(res) || !res?.has_more || !res?.next_cursor) break;
    cursor = res.next_cursor;
  }
  return max;
}

/** Seed the sequence the first time it is used, so numbering continues from what exists. */
async function seedSequence(base44, taskApi, sequenceType, prefix) {
  const ds = base44.asServiceRole.entities.DocumentSequence;
  let records = await ds.filter({ sequence_type: sequenceType });
  if (Array.isArray(records) && records.length > 0) return;

  const seedMax = await highestInUse(taskApi, prefix);
  try {
    await ds.create({ sequence_type: sequenceType, next_value: seedMax + 1, prefix, padding: 1 });
  } catch {
    /* concurrent create — reconciled below */
  }
  records = await ds.filter({ sequence_type: sequenceType });
  if (Array.isArray(records) && records.length > 1) {
    records.sort((a, b) => (a.next_value || 0) - (b.next_value || 0));
    for (let i = 1; i < records.length; i++) {
      await ds.delete(records[i].id).catch(() => {});
    }
  }
}

/** Claims the next free Task reference (e.g. "T-2026-475"). Throws when none can be claimed. */
export async function reserveTaskReference(base44) {
  const year = String(new Date().getFullYear());
  const sequenceType = `${SEQUENCE_PREFIX}-${year}`;
  const prefix = `${REF_PREFIX}-${year}-`;
  const taskApi = base44.asServiceRole.entities.Task;

  await seedSequence(base44, taskApi, sequenceType, prefix);

  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const candidate = await getNextSequence(base44, sequenceType, { prefix, padding: 1 });
    const clashes = toRows(await taskApi.filter({ [FIELD]: candidate }));
    if (clashes.length === 0) return candidate;
  }

  throw new Error(`Could not find a free task reference for ${year}`);
}