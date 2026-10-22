import { base44 } from "@/api/base44Client";
import { getDedupeKey } from "@/lib/importMatching";
import { readAllPages, sdkCache } from "@/lib/sdkRetry";
import { assertImportItems } from "@/lib/lineItemValidation";

// Cursor-paginated read of every existing doc for an entity via filter({}, {sort, limit, cursor}).
// Returns a plain object { dedupKey -> record } (first occurrence wins) so callers can use
// bracket access consistently with the rest of the import code.
export async function loadExistingDocs(entityKey, { sort = "-created_date", limit = 1000 } = {}) {
  if (sdkCache.existingDocs[entityKey]) return sdkCache.existingDocs[entityKey];
  const items = await readAllPages(entityKey, {}, { sort, limit });
  const map = {};
  for (const r of items) {
    const key = getDedupeKey(r, entityKey);
    if (key && !map[key]) map[key] = r;
  }
  sdkCache.existingDocs[entityKey] = map;
  return map;
}

const round2 = (n) => Math.round(n * 100) / 100;
const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Reconcile existing payments[] to match the incoming amount_paid from the file.
// Rule:
//   - sum = sum of existing payments[].amount
//   - If sum > incoming: reduce by removing or lowering unlinked payments
//     (no bank_account_id/bank_transaction_id), newest first, until sum = incoming.
//     Bank-linked payments are never touched. If still above, record a conflict.
//   - If sum < incoming: add one payment of the difference dated docDate with
//     reference 'Xero balance sync' and no bank link.
//   - If sum = incoming: no change (idempotent).
// Returns { payments, changed, conflict }.
export function syncPayments(existingPayments, incomingAmountPaid, docDate, crossLinkIds) {
  const xLinks = crossLinkIds instanceof Set ? crossLinkIds : new Set();
  const payments = (Array.isArray(existingPayments) ? existingPayments : []).map((p) => ({ ...p }));
  const incoming = round2(Number(incomingAmountPaid) || 0);
  const sum = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));

  if (Math.abs(sum - incoming) < 0.01) {
    return { payments, changed: false, conflict: null };
  }

  if (sum > incoming) {
    const reduceBy = round2(sum - incoming);
    // Removable payment indices: unlinked OR cross-linked (bank tx names a different doc).
    // Legitimate bank-linked payments (belong to this doc) are never removed.
    // Newest first (by date descending).
    const removable = payments
      .map((p, i) => ({
        i,
        date: p.date || "",
        linked: !!(p.bank_account_id || p.bank_transaction_id),
        crossLink: p.bank_transaction_id && xLinks.has(p.bank_transaction_id),
      }))
      .filter((x) => !x.linked || x.crossLink)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    let remaining = reduceBy;
    for (const { i } of removable) {
      if (remaining <= 0.01) break;
      const pAmt = round2(Number(payments[i].amount) || 0);
      if (pAmt <= remaining + 0.01) {
        remaining = round2(remaining - pAmt);
        payments[i] = null;
      } else {
        payments[i] = { ...payments[i], amount: round2(pAmt - remaining) };
        remaining = 0;
      }
    }
    const filtered = payments.filter((p) => p !== null);
    let conflict = null;
    if (remaining > 0.01) {
      conflict = {
        type: "payment_conflict",
        remaining: round2(remaining),
        message: `${round2(remaining)} could not be removed from bank-linked payments`,
      };
    }
    return { payments: filtered, changed: true, conflict };
  }

  // sum < incoming: add one payment for the difference
  const diff = round2(incoming - sum);
  return {
    payments: [
      ...payments,
      {
        id: `sync-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        date: docDate,
        amount: diff,
        reference: "Xero balance sync",
      },
    ],
    changed: true,
    conflict: null,
  };
}

const numEq = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) < 0.01;

// Compare an incoming doc against an existing one and build a MINIMAL update payload of only
// the fields that changed. Never touches number, contact, date, total, line items, ids or
// created data. For Invoice/Bill the comparable fields are: status, amount_paid, payments,
// due_date, reference, notes. For CreditNote (no amount_paid/payments/due_date in its schema)
// only status, reference, notes apply.
//
// Status transitions are handled naturally: buildImportRecord sets amount_paid = total for Paid
// docs, so updating amount_paid alongside status yields "Paid -> amount_paid = total" and
// "open -> amount_paid from file" without special cases.
// Returns { action: "updated" | "unchanged", changes, changeList }.
export async function computeDocUpdate(existing, incoming, entityKey) {
  const isCN = entityKey === "CreditNote";
  const changes = {};
  const changeList = [];
  const addChange = (field, label, from, to) => {
    changes[field] = to;
    changeList.push({ field, label, from, to });
  };

  if (!isCN) {
    // Reconcile payments[] to match incoming amount_paid (the Xero source of truth).
    const incomingAmountPaid = round2(Number(incoming.amount_paid) || 0);
    const existingAmountPaid = round2(Number(existing.amount_paid) || 0);
    const existingSum = round2(
      (Array.isArray(existing.payments) ? existing.payments : []).reduce((s, p) => s + (Number(p.amount) || 0), 0)
    );
    const docTotal = round2(Number(existing.total) || Number(incoming.total) || 0);
    const docDate = existing.issue_date || incoming.issue_date || todayLocalISO();
    const docNumber = String(existing.number || incoming.number || "").toUpperCase().trim();

    // Cross-link detection: check each bank-linked payment's bank_transaction_id.
    // If the referenced bank tx's reference/source_number names a DIFFERENT document,
    // it's a cross-link — the payment can be removed by syncPayments.
    const crossLinkIds = new Set();
    const btIds = (Array.isArray(existing.payments) ? existing.payments : [])
      .filter((p) => p.bank_transaction_id)
      .map((p) => p.bank_transaction_id);
    if (btIds.length && docNumber) {
      for (const btId of btIds) {
        try {
          const res = await base44.entities.BankTransaction.filter(
            { id: btId },
            { limit: 1, fields: ["reference", "source_number"] }
          );
          const bt = (res.items || [])[0];
          if (bt) {
            const btRef = String(bt.reference || bt.source_number || "").toUpperCase().trim();
            if (btRef && btRef !== docNumber) crossLinkIds.add(btId);
          }
        } catch (e) { /* ignore lookup errors — treat as non-cross-link */ }
      }
    }

    const sync = syncPayments(existing.payments, incomingAmountPaid, docDate, crossLinkIds);
    const newSum = round2(sync.payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));

    // amount_paid — always set to incoming
    if (!numEq(incomingAmountPaid, existingAmountPaid)) {
      addChange("amount_paid", "amount_paid", existingAmountPaid, incomingAmountPaid);
    }

    // payments — include if the sync changed anything, OR if payments[] sum != target
    // amount_paid (belt-and-suspenders: syncPayments already reconciles, but this
    // guarantees detection even when amount_paid and status are unchanged).
    const paymentsMismatch = Math.abs(existingSum - incomingAmountPaid) > 0.01;
    if (sync.changed || paymentsMismatch) {
      changes.payments = sync.payments;
      changeList.push({ field: "payments", label: "payments", from: existingSum, to: newSum });
    }

    // conflict — bank-linked payments prevented full reconciliation
    if (sync.conflict) {
      changeList.push({ field: "payments", label: "conflict", from: null, to: sync.conflict.message });
    }

    // status — derive from amount_due (Paid when fully paid, otherwise incoming status)
    const amountDue = round2(docTotal - incomingAmountPaid);
    const incomingStatus = incoming.status || existing.status || "Awaiting Payment";
    const derivedStatus =
      amountDue <= 0.01 && incomingStatus !== "Draft" && incomingStatus !== "Cancelled"
        ? "Paid"
        : incomingStatus;
    if (String(derivedStatus) !== String(existing.status || "")) {
      addChange("status", "status", existing.status, derivedStatus);
    }

    // due_date (only when the file carries a value)
    if (incoming.due_date && String(incoming.due_date) !== String(existing.due_date || "")) {
      addChange("due_date", "due_date", existing.due_date, incoming.due_date);
    }
  } else {
    // CreditNote: status only (no payments / amount_paid in schema)
    if (incoming.status && String(incoming.status) !== String(existing.status || "")) {
      addChange("status", "status", existing.status, incoming.status);
    }
  }

  // reference (only when the file carries a non-empty value)
  const incRef = incoming.reference !== undefined ? String(incoming.reference ?? "") : "";
  if (incRef !== "" && incRef !== String(existing.reference ?? "")) {
    addChange("reference", "reference", existing.reference, incoming.reference);
  }
  // notes (only when the file carries a non-empty value)
  const incNotes = incoming.notes !== undefined ? String(incoming.notes ?? "") : "";
  if (incNotes !== "" && incNotes !== String(existing.notes ?? "")) {
    addChange("notes", "notes", existing.notes, incoming.notes);
  }

  if (changeList.length === 0) return { action: "unchanged", changes: {}, changeList: [] };
  return { action: "updated", changes, changeList };
}

// Upsert a doc: create if new, surgical-update only changed fields if existing, unchanged if
// identical. `existingMap` is a plain object { dedupKey -> record } (mutated in place so the
// next row sees freshly created/updated records). Returns
// { action: "created" | "updated" | "unchanged", id, record, changeList }.
export async function upsertDoc(entityKey, incoming, existingMap) {
  const client = base44.entities[entityKey];
  const dedupeKey = getDedupeKey(incoming, entityKey);
  const existing = dedupeKey ? existingMap[dedupeKey] : null;
  if (!existing) {
    // Import rule: an empty ACTIVE document is refused before creation (cancelled /
    // voided imports stay allowed empty). Existing records are never touched.
    assertImportItems(incoming, entityKey);
    const created = await client.create(incoming);
    if (dedupeKey && created) existingMap[dedupeKey] = created;
    return { action: "created", id: created?.id, record: created, changeList: [] };
  }
  const { action, changes, changeList } = await computeDocUpdate(existing, incoming, entityKey);
  if (action === "unchanged") return { action: "unchanged", id: existing.id, record: existing, changeList: [] };
  const updated = await client.update(existing.id, changes);
  existingMap[dedupeKey] = { ...existing, ...changes, id: existing.id };
  return { action: "updated", id: existing.id, record: updated, changeList };
}