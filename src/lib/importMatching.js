import * as config from "@/lib/importCenterConfig";
import { base44 } from "@/api/base44Client";
import { normalizeImportHeader } from "@/lib/importCsv";

const maps = {
  Contact: config.XERO_CONTACT_FIELD_MAP, ChartOfAccount: config.XERO_COA_FIELD_MAP,
  Invoice: config.XERO_INVOICE_FIELD_MAP, Bill: config.XERO_INVOICE_FIELD_MAP,
  Project: config.COMMON_PROJECT_FIELD_MAP, WorkOrder: config.COMMON_WORKORDER_FIELD_MAP,
  Task: config.COMMON_TASK_FIELD_MAP, TimeEntry: config.COMMON_TIMEENTRY_FIELD_MAP,
  Employee: config.COMMON_EMPLOYEE_FIELD_MAP, Asset: config.COMMON_ASSET_FIELD_MAP,
  BankAccount: config.XERO_BANK_ACCOUNT_FIELD_MAP, BankTransaction: config.XERO_BANK_TRANSACTION_FIELD_MAP,
  Product: config.XERO_PRODUCT_FIELD_MAP, TaxRate: config.XERO_TAXRATE_FIELD_MAP,
  CreditNote: config.XERO_CREDITNOTE_FIELD_MAP,
};
export function resolveImportField(entityKey, header, overrides = {}, knownFields = []) {
  if (overrides[header] === "__skip__") return null;
  if (overrides[header]) return overrides[header];
  const normalized = normalizeImportHeader(header);
  if (entityKey === "BankAccount" && /^OpeningBalance_\d{4}-\d{2}-\d{2}$/i.test(normalized)) return "opening_balance";
  if (entityKey === "Asset" && /^ClosingValue_/i.test(normalized)) return "net_book_value";
  if (entityKey === "Asset" && /^OpeningValue_/i.test(normalized)) return null;
  const map = maps[entityKey] || {};
  const key = Object.keys(map).find(k => k.toLowerCase() === normalized.toLowerCase());
  if (key !== undefined) return map[key];
  return knownFields.includes(normalized) ? normalized : null;
}

export const DEDUPE_KEYS = {
  ChartOfAccount: ["code"], Contact: ["full_name"], Product: ["code"],
  Invoice: ["number", "contact_name", "issue_date", "total"],
  Bill: ["number", "contact_name", "issue_date", "total"],
  CreditNote: ["number", "contact_name", "issue_date", "total"],
  Quote: ["number"], PurchaseOrder: ["number"], BankAccount: ["name"],
  Project: ["name"], WorkOrder: ["title"], Task: ["reference"], Employee: ["email"], Asset: ["name"], TaxRate: ["name"],
};
function lineItemsHash(lineItems) {
  if (!Array.isArray(lineItems) || lineItems.length === 0) return "";
  const sig = lineItems.map(l => [
    String(l.description || "").trim().toLowerCase(),
    Number(l.quantity || 0).toFixed(2),
    Number(l.unit_price || 0).toFixed(2),
    Number(l.total || 0).toFixed(2),
  ].join("|")).join(";;");
  let h = 0;
  for (let i = 0; i < sig.length; i++) { h = ((h << 5) - h) + sig.charCodeAt(i); h |= 0; }
  return "lh" + Math.abs(h).toString(36);
}

export function getDedupeKey(record, entityKey) {
  // If the record carries a Xero unique ID (InvoiceID, ContactID, etc.), use it as the primary key
  if (record.external_id) return `ext:${String(record.external_id).trim().toLowerCase()}`;
  if (entityKey === "ChartOfAccount") return String(record.code || record.name || "").replace(/\s+/g, " ").trim().toLowerCase();
  const parts = (DEDUPE_KEYS[entityKey] || []).map(k => String(record[k] ?? "").replace(/\s+/g, " ").trim().toLowerCase()).filter(Boolean);
  // For Invoice/Bill/CreditNote with empty number, append a line-items hash so documents with
  // same contact + date + total but different line items are not merged or duplicated on reimport.
  if (["Invoice", "Bill", "CreditNote"].includes(entityKey) && !String(record.number || "").trim()) {
    const lh = lineItemsHash(record.line_items);
    if (lh) parts.push(lh);
  }
  return parts.join("||");
}

export const exactImportText = (value) => ({ $regex: `^${String(value).replace(/\s+/g, " ").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}$`, $options: "i" });
export const collapseSpaces = (v) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);
export async function saveMappedImportRecord(entityKey, record, key, append = true) {
  const client = base44.entities[entityKey];
  for (const f of ["name", "full_name", "contact_name", "title"]) if (typeof record[f] === "string") record[f] = collapseSpaces(record[f]);
  if (!String(record[key] ?? "").trim()) throw new Error(`Missing ${key}: cannot prevent duplicate ${entityKey} records.`);
  if (append) {
    const { items } = await client.filter({ [key]: exactImportText(record[key]) }, { limit: 2 });
    if (items.length > 1) throw new Error(`Multiple ${entityKey} records match ${record[key]}. Resolve the duplicates before importing.`);
    if (items.length) return { record: await client.update(items[0].id, record), updated: true };
  }
  return { record: await client.create(record), updated: false };
}
