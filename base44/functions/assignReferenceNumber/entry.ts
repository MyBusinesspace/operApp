// assignReferenceNumber — assigns the next reference to one Project, WorkOrder, Task,
// Asset, Contact or Employee.
//
// Project / WorkOrder / Task / Asset / Contact use the entity's own `reference` field, in
// the existing yearly format P-YYYY-N, WO-YYYY-N, T-YYYY-N, A-YYYY-N, C-YYYY-N — no zero
// padding, and N is unbounded (padding is a minimum width only). Their counter is per
// entity + per year of the record's created_date (sequence types PROJECT-YYYY /
// WORKORDER-YYYY / TASK-YYYY / ASSET-YYYY / CONTACT-YYYY), seeded once from the highest
// reference already in use for that entity and year.
//
// Employee uses its own `employee_no` field with the EMP- prefix, no year and a single
// series (sequence type EMPLOYEE, padding 3). It is seeded once from the highest
// employee_no already matching ^EMP-\d+$ + 1, so EMP-001, EMP-002, ... EMP-1000 are all
// fine (padding is a minimum width only, no maximum).
//
// Idempotent: a record that already carries its number is untouched.
//
// Two modes:
//   { entity, id }             — assign to that record (loads and saves it).
//   { entity, reserve: true }  — claim the next number without loading or saving any
//                                record; returns { number }.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { getNextSequence } from '../../shared/sequence.ts';

const TYPES = {
  Project: { entity: 'Project', field: 'reference', sequenceType: 'PROJECT', prefix: 'P', perYear: true, padding: 1 },
  WorkOrder: { entity: 'WorkOrder', field: 'reference', sequenceType: 'WORKORDER', prefix: 'WO', perYear: true, padding: 1 },
  Task: { entity: 'Task', field: 'reference', sequenceType: 'TASK', prefix: 'T', perYear: true, padding: 1 },
  Asset: { entity: 'Asset', field: 'reference', sequenceType: 'ASSET', prefix: 'A', perYear: true, padding: 1 },
  Contact: { entity: 'Contact', field: 'reference', sequenceType: 'CONTACT', prefix: 'C', perYear: true, padding: 1 },
  Employee: { entity: 'Employee', field: 'employee_no', sequenceType: 'EMPLOYEE', prefix: 'EMP', perYear: false, padding: 3 },
};

const MAX_TRIES = 50;

/** Sequence type for a spec: "PROJECT-2026" for yearly entities, plain "EMPLOYEE" otherwise. */
function sequenceTypeFor(spec, year) {
  return spec.perYear ? `${spec.sequenceType}-${year}` : spec.sequenceType;
}

/** Reference prefix for a spec: "P-2026-" for yearly entities, "EMP-" otherwise. */
function prefixFor(spec, year) {
  return spec.perYear ? `${spec.prefix}-${year}-` : `${spec.prefix}-`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Highest trailing integer already used by this entity for `prefix` (e.g. "P-2026-", "EMP-"). */
async function highestInUse(entityApi, field, prefix) {
  const pattern = `^${escapeRegex(prefix)}\\d+$`;
  let cursor = null;
  let max = 0;
  for (let page = 0; page < 20; page++) {
    const options = { sort: field, limit: 1000, fields: [field] };
    if (cursor) options.cursor = cursor;
    const res = await entityApi.filter({ [field]: { $regex: pattern } }, options);
    const items = Array.isArray(res) ? res : (res?.items || []);
    for (const row of items) {
      const n = parseInt(String(row[field]).slice(prefix.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    if (Array.isArray(res) || !res?.has_more || !res?.next_cursor) break;
    cursor = res.next_cursor;
  }
  return max;
}

/** Seed the sequence the first time it is used, so numbering continues from what exists. */
async function seedSequence(base44, entityApi, spec, sequenceType, prefix) {
  const ds = base44.asServiceRole.entities.DocumentSequence;
  let records = await ds.filter({ sequence_type: sequenceType });
  if (Array.isArray(records) && records.length > 0) return;

  const seedMax = await highestInUse(entityApi, spec.field, prefix);
  try {
    await ds.create({ sequence_type: sequenceType, next_value: seedMax + 1, prefix, padding: spec.padding });
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

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const spec = TYPES[body?.entity];
    const recordId = body?.id;
    if (!spec) return Response.json({ error: 'entity must be Project, WorkOrder, Task, Asset, Contact or Employee' }, { status: 400 });

    const entityApi = base44.asServiceRole.entities[spec.entity];

    // Reserve mode: {entity, reserve: true} with no id. Claims the next number — no record
    // is loaded or saved, and the number is left unassigned.
    if (body?.reserve === true) {
      const year = String(new Date().getFullYear());
      const sequenceType = sequenceTypeFor(spec, year);
      const prefix = prefixFor(spec, year);

      await seedSequence(base44, entityApi, spec, sequenceType, prefix);

      let reserved = null;
      for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        const candidate = await getNextSequence(base44, sequenceType, { prefix, padding: spec.padding });
        const clashes = await entityApi.filter({ [spec.field]: candidate });
        const taken = Array.isArray(clashes) && clashes.length > 0;
        if (!taken) {
          reserved = candidate;
          break;
        }
      }
      if (!reserved) return Response.json({ error: 'Could not find a free reference number' }, { status: 409 });

      return Response.json({ number: reserved });
    }

    if (!recordId || typeof recordId !== 'string') return Response.json({ error: 'id is required' }, { status: 400 });

    // 1. Load the record (a malformed id is treated as not found).
    let record = null;
    try {
      const found = await entityApi.filter({ id: recordId });
      record = Array.isArray(found) ? found[0] : null;
    } catch {
      record = null;
    }
    if (!record) return Response.json({ error: `${spec.entity} not found` }, { status: 404 });

    // 2. Already numbered — return it unchanged, consuming nothing.
    const current = typeof record[spec.field] === 'string' ? record[spec.field].trim() : '';
    if (current) return Response.json({ number: current });

    // 3. Year of the record's created_date, as written (yearly entities only).
    const created = typeof record.created_date === 'string' ? record.created_date : '';
    const yearMatch = created.match(/^(\d{4})/);
    const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

    const sequenceType = sequenceTypeFor(spec, year);
    const prefix = prefixFor(spec, year);

    // 4. Seed from existing numbering the first time this sequence is used.
    await seedSequence(base44, entityApi, spec, sequenceType, prefix);

    // 5. Reserve the next value, skipping numbers this entity already uses.
    let number = null;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const candidate = await getNextSequence(base44, sequenceType, { prefix, padding: spec.padding });
      const clashes = await entityApi.filter({ [spec.field]: candidate });
      const taken = Array.isArray(clashes) && clashes.some((row) => row.id !== recordId);
      if (!taken) {
        number = candidate;
        break;
      }
    }
    if (!number) return Response.json({ error: 'Could not find a free reference number' }, { status: 409 });

    // 6. Save only the numbering field.
    await entityApi.update(recordId, { [spec.field]: number });
    return Response.json({ number });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}