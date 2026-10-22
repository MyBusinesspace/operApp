// assignDocumentNumber — assigns the next yearly document number to a single document.
//
// Format: PREFIX-YYYY-NNNN (e.g. INV-2026-0001, CN-2026-0001, Q-2026-0001, BILL-2026-0001).
// Idempotent: a document already carrying the yearly format is returned untouched.
// The counter is per year (sequence "PREFIX-YEAR"), so it restarts at 0001 each January;
// padding is a minimum width only, so numbering continues past 9999.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getNextSequence } from '../../shared/sequence.ts';

const DOC_TYPES = {
  Invoice: { entity: 'Invoice', prefix: 'INV' },
  CreditNote: { entity: 'CreditNote', prefix: 'CN' },
  Quote: { entity: 'Quote', prefix: 'Q' },
  Bill: { entity: 'Bill', prefix: 'BILL' },
};

const MAX_TRIES = 50;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const spec = DOC_TYPES[body?.doc_type];
    const docId = body?.doc_id;
    if (!spec) return Response.json({ error: 'doc_type must be Invoice, CreditNote, Quote or Bill' }, { status: 400 });
    if (!docId || typeof docId !== 'string') return Response.json({ error: 'doc_id is required' }, { status: 400 });

    const entity = base44.asServiceRole.entities[spec.entity];

    // 1. Load the document.
    let doc = null;
    try {
      const found = await entity.filter({ id: docId });
      doc = Array.isArray(found) ? found[0] : null;
    } catch {
      doc = null; // malformed id — treat as not found
    }
    if (!doc) return Response.json({ error: `${spec.entity} not found` }, { status: 404 });

    // 2. Idempotent: already in the yearly format — return it, consume nothing.
    const current = typeof doc.number === 'string' ? doc.number : '';
    if (new RegExp(`^${spec.prefix}-\\d{4}-\\d+$`).test(current)) {
      return Response.json({ number: current });
    }

    // 3. Year from the issue date exactly as written; current year when empty.
    const issueDate = typeof doc.issue_date === 'string' ? doc.issue_date : '';
    const yearMatch = issueDate.match(/^(\d{4})/);
    const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());

    // 4-5. Reserve the next value, skipping numbers already used by this entity.
    const sequenceType = `${spec.prefix}-${year}`;
    const prefix = `${spec.prefix}-${year}-`;
    let number = null;
    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      const candidate = await getNextSequence(base44, sequenceType, { prefix, padding: 4 });
      const clash = await entity.filter({ number: candidate });
      if (!Array.isArray(clash) || clash.length === 0) {
        number = candidate;
        break;
      }
    }
    if (!number) return Response.json({ error: 'Could not find a free document number' }, { status: 409 });

    // 6. Save only the number field.
    await entity.update(docId, { number });
    return Response.json({ number });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}