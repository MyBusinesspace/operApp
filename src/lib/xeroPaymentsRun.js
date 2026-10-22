// Applies lib/xeroPaymentsImport.js to the documents in the app (Quick Import "Payments report" step).
// planFromParsed() only reads. applyPaymentsReport() writes payments[], amount_paid and status of existing
// Invoice/Bill documents (also those whose payments were linked to the bank: the Xero report is the source of truth for
// which document each payment settles, and the bank link is rebuilt afterwards by account/date/amount/contact).
// It never creates documents and never posts journals. Payment lines that settle documents issued BEFORE the migration
// cut-off (documents that are not imported) are stored as read-only PriorPeriodSettlement records, so they stay visible,
// labelled, and out of reconciliation. Documents in a locked period are skipped.
import { withRetry, delay, readAllPages } from "@/lib/sdkRetry";
import { base44 } from "@/api/base44Client";
import { checkPeriodLock } from "@/lib/periodLock";
import { parseXeroPaymentLines, planPayments, rowsFromTable, exceptionsToCsv } from "@/lib/xeroPaymentsImport";

const FIELDS = ["number", "reference", "contact_name", "issue_date", "total", "currency", "status", "amount_paid", "payments"];
const PRIOR_NOTE = "Belongs to a document issued before the migration cut-off";

async function loadDocs(entity) {
  const all = await readAllPages(entity, {}, { limit: 1000, fields: FIELDS });
  return all.filter((d) => (d.status === "Paid" || d.status === "Awaiting Payment") && d.issue_date);
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nc = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 5);
const key2 = (date, amount) => `${String(date || "").slice(0, 10)}|${Math.abs(Number(amount) || 0).toFixed(2)}`;

export async function planFromParsed(parsed) {
  const lines = parseXeroPaymentLines(rowsFromTable(parsed.headers, parsed.rows));
  const out = { lines: lines.length, updates: [], exceptions: [], priorPeriod: [], stats: {} };
  for (const [kind, entity] of [["bill", "Bill"], ["invoice", "Invoice"]]) {
    if (!lines.some((l) => l.kind === kind)) continue;
    const docs = await loadDocs(entity);
    const plan = planPayments({ docs, lines, kind });
    for (const u of plan.updates) {
      const cur = docs.find((d) => d.id === u.id);
      const same = cur && Math.abs((cur.amount_paid || 0) - u.amount_paid) < 0.005 && cur.status === u.status
        && sameJson((cur.payments || []).map((p) => [p.date, p.amount]), u.payments.map((p) => [p.date, p.amount]));
      if (!same) out.updates.push({ ...u, entity, kind, issue_date: cur?.issue_date, contact_name: cur?.contact_name, before: cur?.payments || [] });
    }
    out.exceptions.push(...plan.exceptions.map((e) => ({ kind, ...e })));
    out.priorPeriod.push(...(plan.priorPeriod || []).map((l) => ({ kind, ...l })));
    out.stats[kind] = { ...plan.stats };
  }
  return out;
}

// Keeps the bank link of a payment whose date and amount did not change, and rebuilds it for the others from the
// BankTransactions (same type, date, amount and contact, not already linked). Never guesses between two candidates.
function relinkPayments(doc, newPayments, btIndex, linked) {
  const want = doc.kind === "bill" ? "Spend" : "Receive";
  const old = [...(doc.before || [])];
  const ba = old.find((p) => p.bank_account_id) || {};
  return newPayments.map((p) => {
    const i = old.findIndex((q) => q.date === p.date && Math.abs((q.amount || 0) - p.amount) < 0.005);
    if (i >= 0) { const q = old.splice(i, 1)[0]; return { ...p, bank_account_id: q.bank_account_id, bank_account_name: q.bank_account_name, bank_transaction_id: q.bank_transaction_id }; }
    const m = (btIndex.get(key2(p.date, p.amount)) || []).filter((b) => (b.type || "").includes(want) && nc(b.contact_name) === nc(doc.contact_name) && !linked.has(b.id));
    if (m.length === 1) { linked.add(m[0].id); return { ...p, bank_account_id: m[0].bank_account_id, bank_account_name: m[0].bank_account_name, bank_transaction_id: m[0].id }; }
    return { ...p, bank_account_id: ba.bank_account_id, bank_account_name: ba.bank_account_name, bank_transaction_id: null };
  });
}

async function storePriorPeriod(lines, btIndex, linked) {
  const existing = new Set((await readAllPages("PriorPeriodSettlement", {}, { limit: 1000, fields: ["import_key"] })).map((r) => r.import_key));
  let created = 0;
  for (const l of lines) {
    const amount = Number(l.aed_amount) || 0;
    const import_key = [l.kind, l.date, String(l.contact || "").toLowerCase(), String(l.reference || "").toLowerCase(), amount.toFixed(2)].join("|");
    if (existing.has(import_key)) continue;
    existing.add(import_key);
    const want = l.kind === "bill" ? "Spend" : "Receive";
    const m = (btIndex.get(key2(l.date, amount)) || []).filter((b) => (b.type || "").includes(want) && nc(b.contact_name) === nc(l.contact) && !linked.has(b.id));
    const bt = m.length === 1 ? m[0] : null;
    if (bt) linked.add(bt.id);
    await withRetry(() => base44.entities.PriorPeriodSettlement.create({
      kind: l.kind, contact_name: l.contact, reference: l.reference, payment_date: l.date, amount, currency: l.currency || "AED",
      fx_amount: Number(l.fx_amount) || amount, bank_account_id: bt?.bank_account_id, bank_account_name: bt?.bank_account_name,
      bank_transaction_id: bt?.id, note: PRIOR_NOTE, import_key,
    }), { label: "PriorPeriodSettlement.create" });
    if (bt) {
      const notes = [bt.notes, `Settles a document issued before the migration cut-off (${l.reference || "no reference"})`].filter(Boolean).join(" | ");
      await withRetry(() => base44.entities.BankTransaction.update(bt.id, { notes }), { label: "BankTransaction.update note" });
    }
    created++;
    await delay(120);
  }
  return created;
}

export async function applyPaymentsReport(parsed, { onProgress } = {}) {
  const plan = await planFromParsed(parsed);
  const bts = await readAllPages("BankTransaction", {}, { limit: 1000, fields: ["date", "amount", "type", "contact_name", "bank_account_id", "bank_account_name", "notes"] });
  const btIndex = new Map();
  for (const b of bts) { const k = key2(b.date, b.amount); if (!btIndex.has(k)) btIndex.set(k, []); btIndex.get(k).push(b); }
  const linked = new Set();
  for (const entity of ["Bill", "Invoice"]) for (const d of await loadDocs(entity)) for (const p of d.payments || []) if (p.bank_transaction_id) linked.add(p.bank_transaction_id);
  const lockCache = new Map();
  let updated = 0, skippedLocked = 0;
  for (let i = 0; i < plan.updates.length; i++) {
    const u = plan.updates[i];
    if (!lockCache.has(u.issue_date)) lockCache.set(u.issue_date, (await checkPeriodLock(u.issue_date, {})).locked);
    if (lockCache.get(u.issue_date)) { skippedLocked++; continue; }
    const payments = relinkPayments(u, u.payments, btIndex, linked);
    await withRetry(() => base44.entities[u.entity].update(u.id, { payments, amount_paid: u.amount_paid, status: u.status }), { label: `${u.entity}.update payments` });
    updated++;
    if (onProgress && i % 20 === 0) onProgress(Math.round((i / plan.updates.length) * 100));
    await delay(150);
  }
  const prior = await storePriorPeriod(plan.priorPeriod, btIndex, linked);
  return { new: prior, updated, unchanged: 0, errors: 0, skippedLocked, exceptions: plan.exceptions.length, exceptionsCsv: exceptionsToCsv(plan.exceptions), priorPeriodSettlements: prior, stats: plan.stats };
}
