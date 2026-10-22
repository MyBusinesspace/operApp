import { base44 } from "@/api/base44Client";
import { toBaseAmount } from "@/lib/currency";
import { exactImportText } from "@/lib/importMatching";
import { computeDocUpdate } from "@/lib/docReimportUpdate";
import { assertImportItems } from "@/lib/lineItemValidation";

export async function resolveXeroContact(name) {
  if (!String(name || "").trim()) throw new Error("Missing ContactName for credit note.");
  const { items } = await base44.entities.Contact.filter({ full_name: exactImportText(name) }, { limit: 2 });
  if (items.length > 1) throw new Error(`Multiple contacts match "${name}".`);
  return items[0] || await base44.entities.Contact.create({ full_name: String(name).trim() });
}

function creditBaseFields(total, source) {
  const foreign = source.currency && String(source.currency).toUpperCase() !== "AED";
  const fx = foreign ? Number(source.exchange_rate) : 1;
  if (!(fx > 0)) return {};
  return { exchange_rate: fx, base_total: foreign ? toBaseAmount(total, fx) : total };
}

export async function saveXeroCreditNote(source, resolveContact = resolveXeroContact) {
  const contact = await resolveContact(source.contact_name);
  if (!contact?.id) throw new Error(`Contact "${source.contact_name || ""}" could not be resolved or created.`);
  const statuses = { "Awaiting Payment": "Awaiting Application", Paid: "Applied", AUTHORISED: "Awaiting Application", PAID: "Applied", SUBMITTED: "Awaiting Approval", DRAFT: "Draft" };
  // Compute totals from line items when Total/TaxTotal not provided in CSV
  let subtotal = Math.abs(Number(source.subtotal) || 0);
  let taxAmount = Math.abs(Number(source.tax_amount) || 0);
  let total = Math.abs(Number(source.total) || 0);
  if (!total && (source.line_items || []).length) {
    subtotal = source.line_items.reduce((s, l) => s + Math.abs(Number(l.total) || 0), 0);
    taxAmount = source.line_items.reduce((s, l) => s + Math.abs(Number(l.tax_rate) || 0), 0);
    total = subtotal + taxAmount;
  }
  if (!subtotal && total) subtotal = total - taxAmount;
  const record = {
    number: source.number, reference: source.reference || "",
    contact_id: contact.id, contact_name: contact.full_name,
    issue_date: source.issue_date, currency: source.currency || "AED",
    subtotal, tax_amount: taxAmount, total,
    ...creditBaseFields(total, source),
    status: statuses[source.status] || source.status || "Draft",
    reason: source._cn_reason || source.reason || "Credit note imported from Xero",
    notes: source.notes,
    line_items: (source.line_items || []).map(line => ({ ...line,
      quantity: Math.abs(Number(line.quantity) || 1), unit_price: Math.abs(Number(line.unit_price) || 0),
      total: Math.abs(Number(line.total) || 0),
    })),
  };
  // Match existing credit note by number + contact + date + total (same as grouping key).
  // If no exact match on all four fields, create a new document — never overwrite one with a different date.
  const matchQuery = {
    number: exactImportText(record.number),
    contact_id: contact.id,
    issue_date: record.issue_date,
  };
  if (record.total !== undefined && record.total !== null) matchQuery.total = record.total;
  const { items } = await base44.entities.CreditNote.filter(matchQuery, { limit: 2 });
  if (items.length > 1) throw new Error(`Multiple credit notes match ${record.number} for ${contact.full_name} on ${record.issue_date}. Resolve the duplicates before importing.`);
  if (items.length) {
    // Surgical update: only changed fields, never number/contact/date/total/line items.
    const existing = items[0];
    const { action, changes, changeList } = await computeDocUpdate(existing, record, "CreditNote");
    if (action === "unchanged") return { record: existing, action: "unchanged", changeList: [] };
    return { record: await base44.entities.CreditNote.update(existing.id, changes), action: "updated", changeList };
  }
  // Import rule: an empty ACTIVE credit note is refused before creation — a cancelled /
  // voided import may stay empty. Existing credit notes are never modified here.
  assertImportItems(record, "Credit note");
  return { record: await base44.entities.CreditNote.create(record), action: "created", changeList: [] };
}