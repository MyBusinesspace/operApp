// Classifies companies as Customer / Provider / Both from how they are used in documents.
// Invoices -> Customer, Bills -> Provider, both -> Both.
// Generic for any customer: never overrides a type that was already defined (Customer/Provider/Both);
// only companies with the generic type ("Contact") or no type are changed.
// Returns the full before/after list so the change can be reviewed and reversed.
import { base44 } from "@/api/base44Client";
import { withRetry, readAllPages, delay } from "@/lib/sdkRetry";

// Technical / system contacts (payroll bridges, grouped placeholders) never get a customer/supplier type.
export const isTechnicalContact = (name) => /\(grouped\)\s*$/i.test(String(name || "")) || /^\s*payroll\b/i.test(String(name || ""));
const GENERIC = (t) => !t || t === "Contact";
const norm = (v) => String(v || "").replace(/\s+/g, " ").trim().toLowerCase();

export async function classifyContactTypes({ apply = false, onProgress } = {}) {
  const contacts = await readAllPages("Contact", {}, { limit: 1000, fields: ["id", "full_name", "type"] });
  const docs = async (name) => readAllPages(name, {}, { limit: 1000, fields: ["id", "contact_id", "contact_name"] });
  const [invoices, bills] = [await docs("Invoice"), await docs("Bill")];
  const byName = new Map();
  for (const c of contacts) if (norm(c.full_name)) byName.set(norm(c.full_name), c.id);
  const idsOf = (list) => {
    const s = new Set();
    for (const d of list) {
      if (d.contact_id) s.add(d.contact_id);
      else if (norm(d.contact_name) && byName.has(norm(d.contact_name))) s.add(byName.get(norm(d.contact_name)));
    }
    return s;
  };
  const cust = idsOf(invoices), sup = idsOf(bills);
  const changes = [];
  for (const c of contacts) {
    if (!GENERIC(c.type)) continue; // never override a defined type
    if (isTechnicalContact(c.full_name)) continue;
    const a = cust.has(c.id), b = sup.has(c.id);
    const next = a && b ? "Both" : a ? "Customer" : b ? "Provider" : null;
    if (next) changes.push({ id: c.id, name: c.full_name, old_type: c.type || "", new_type: next });
  }
  if (apply) {
    // Gentle on the API (rate limit): small sequential batches; safe to re-run (only generic types change).
    for (let i = 0; i < changes.length; i += 3) {
      await Promise.all(changes.slice(i, i + 3).map((ch) => withRetry(() => base44.entities.Contact.update(ch.id, { type: ch.new_type }), { label: "Contact.type" })));
      await delay(350);
      if (onProgress) onProgress(Math.round(((i + 3) / changes.length) * 100));
    }
  }
  const summary = { customers: changes.filter((c) => c.new_type === "Customer").length, providers: changes.filter((c) => c.new_type === "Provider").length, both: changes.filter((c) => c.new_type === "Both").length };
  return { changes, summary, applied: apply };
}

// Reverse a previous run using its before/after list.
export async function revertContactTypes(changes) {
  for (let i = 0; i < changes.length; i += 10) {
    await Promise.all(changes.slice(i, i + 10).map((ch) => withRetry(() => base44.entities.Contact.update(ch.id, { type: ch.old_type || "Contact" }), { label: "Contact.typeRevert" })));
  }
}
