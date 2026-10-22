// assignContactCode — assigns the company numbering code to a NEW contact.
//
//   { contact_id } → { code }
//
// Codes are PREFIX-000001 (6 digits), one independent counter per prefix:
//   Customer → CUS, Provider (supplier) → SUP, Both (partner) → PAR, anything else → CON
//
// Counters live in ContactCounter (prefix, last_number) and are claimed with a
// compare-and-swap, so concurrent calls can never hand out the same number.
//
// Never changes an existing code and never touches existing contacts: the contact
// passed in is only updated when it has no code yet, and nothing is ever backfilled.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const PREFIX_BY_TYPE = { Customer: 'CUS', Provider: 'SUP', Both: 'PAR' };
const FALLBACK_PREFIX = 'CON';
const MAX_TRIES = 25;

function prefixFor(contact) {
  const type = typeof contact?.type === 'string' ? contact.type.trim() : '';
  return PREFIX_BY_TYPE[type] || FALLBACK_PREFIX;
}

/** Claims the next number for a prefix (creating its counter on first use). */
async function claimNextNumber(sr, prefix) {
  const counters = sr.entities.ContactCounter;

  let records = await counters.filter({ prefix });
  let counter = Array.isArray(records) ? records[0] : null;

  if (!counter) {
    try {
      await counters.create({ prefix, last_number: 0 });
    } catch {
      /* concurrent create — reconciled below */
    }
    records = await counters.filter({ prefix });
    if (Array.isArray(records) && records.length > 1) {
      records.sort((a, b) => (a.last_number || 0) - (b.last_number || 0));
      for (let i = 1; i < records.length; i++) await counters.delete(records[i].id).catch(() => {});
    }
    counter = Array.isArray(records) ? records[0] : null;
  }
  if (!counter) throw new Error(`Contact counter "${prefix}" could not be initialized`);

  if (counter.last_number == null) {
    await counters.update(counter.id, { last_number: 0 });
    counter.last_number = 0;
  }

  // Compare-and-swap: only the caller that saw the same last_number wins the value.
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    const claimed = counter.last_number + 1;
    const result = await counters.updateMany(
      { id: counter.id, last_number: counter.last_number },
      { $set: { last_number: claimed } }
    );
    if (result && result.updated === 1) {
      return `${prefix}-${String(claimed).padStart(6, '0')}`;
    }
    // Lost the race — re-read and retry with the latest value.
    const fresh = await counters.filter({ id: counter.id });
    counter = Array.isArray(fresh) ? fresh[0] : counter;
  }
  throw new Error(`Failed to acquire a contact code for "${prefix}" after ${MAX_TRIES} attempts`);
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const contactId = body?.contact_id;
    if (!contactId || typeof contactId !== 'string') {
      return Response.json({ error: 'contact_id is required' }, { status: 400 });
    }

    const sr = base44.asServiceRole;
    const contacts = sr.entities.Contact;

    // 1. Load the contact (a malformed id is treated as not found).
    let contact = null;
    try {
      const found = await contacts.filter({ id: contactId });
      contact = Array.isArray(found) ? found[0] : null;
    } catch {
      contact = null;
    }
    if (!contact) return Response.json({ error: 'Contact not found' }, { status: 404 });

    // 2. Already numbered — keep it, consume nothing.
    const current = typeof contact.code === 'string' ? contact.code.trim() : '';
    if (current) return Response.json({ code: current });

    // 3. Claim the next number for the contact's type and save only the code field.
    const code = await claimNextNumber(sr, prefixFor(contact));
    await contacts.update(contactId, { code });

    return Response.json({ code });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}