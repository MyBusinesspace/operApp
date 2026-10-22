import moment from "moment";
import { toBaseAmount } from "@/lib/currency";
import { NUMERIC_FIELDS } from "@/lib/importCenterConfig";
import { normalizeAccountType } from "@/lib/accountTypes";
import { getXeroCreditReason, normalizeImportHeader, parseImportNumber } from "@/lib/importCsv";

const DATE_FIELDS = ["issue_date", "due_date", "start_date", "end_date", "scheduled_date", "delivery_date", "planning_date", "hire_date", "purchase_date", "opening_balance_date", "date", "expiry_date", "clock_in_time", "clock_out_time"];
const DOC_STATUS = { DRAFT: "Draft", AUTHORISED: "Awaiting Payment", SUBMITTED: "Awaiting Approval", PAID: "Paid", VOIDED: "Cancelled", DELETED: "Cancelled" };
export function normalizeImportDate(value) {
  const text = String(value ?? "").trim();
  if (!text) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = moment(text, ["DD MMM YYYY", "D MMM YYYY", "DD MMMM YYYY", "D MMMM YYYY", "DD/MM/YYYY", "D/M/YYYY", "MM/DD/YYYY", "M/D/YYYY", "DD-MM-YYYY", "YYYY-MM-DD", "DD.MM.YYYY"], true);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  // Manual DD/MM/YYYY parser (accepts / - . separators, day first) — avoids
  // new Date() US-locale MM/DD bias and toISOString() UTC timezone day shift.
  const m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return text;
}

// Today's date as YYYY-MM-DD using local date parts (no toISOString UTC shift).
const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function buildImportRecord(row, { entityKey, headers, effectiveField }) {
  const record = {};
  headers.forEach(header => {
    const field = effectiveField(header), value = row[header];
    if (!field || value === undefined || String(value).trim() === "") return;
    if (["ChartOfAccount", "BankAccount"].includes(entityKey) && ["show_on_dashboard", "enable_payments"].includes(field)) {
      record[field] = ["yes", "true", "1"].includes(String(value).toLowerCase()); return;
    }
    if (entityKey === "Product" && ["is_sold", "is_purchased", "track_inventory"].includes(field)) {
      record[field] = ["yes", "true", "1"].includes(String(value).toLowerCase()); return;
    }
    if (entityKey === "Product" && ["purchase_tax_rate", "sale_tax_rate"].includes(field)) {
      const text = String(value).trim();
      record[field === "sale_tax_rate" ? "sale_tax_name" : "purchase_tax_name"] = text;
      const percent = text.match(/(-?\d+(?:\.\d+)?)\s*%/);
      if (percent) record[field] = Number(percent[1]);
      else if (/^-?[\d,.\s]+$/.test(text)) record[field] = parseImportNumber(text);
      return;
    }
    record[field] = NUMERIC_FIELDS.includes(field) ? parseImportNumber(value) : String(value);
  });

  if (entityKey === "Product") {
    if (record.status) record.status = /^(archived|inactive|deleted)$/i.test(record.status) ? "Archived" : /^active$/i.test(record.status) ? "Active" : record.status;
    if (record.inventory_type) {
      const inventory = record.inventory_type.toLowerCase().replace(/[\s_-]/g, "");
      record.track_inventory = ["tracked", "trackedinventory", "inventory"].includes(inventory);
      if (record.track_inventory) record.type = "Product";
      else if (inventory === "service") record.type = "Service";
    }
  }
  if (entityKey === "Contact") {
    // Xero AccountNumber is free text typed by users: it never becomes the app's Reference.
    // It is kept in source_account_number (informational). A tax-number-like value (13-16 digits) is also copied to tax_id when tax_id is empty.
    const srcAcc = String(record.source_account_number || "").trim();
    if (srcAcc && !record.tax_id && /^\d{13,16}$/.test(srcAcc.replace(/[\s-]/g, ""))) record.tax_id = srcAcc.replace(/[\s-]/g, "");
    const name = [record._cp_first_name, record._cp_last_name].filter(Boolean).join(" ");
    if (name) record.contact_persons = [{ name, role: record._cp_role || "", email: record._cp_email || "", phone: record._cp_phone || "" }];
    ["_cp_first_name", "_cp_last_name", "_cp_email", "_cp_phone", "_cp_role"].forEach(key => delete record[key]);
  }
  if (["Invoice", "Bill"].includes(entityKey)) {
    const typeColumn = headers.find(header => normalizeImportHeader(header).toLowerCase() === "type");
    const reason = getXeroCreditReason(row[typeColumn]);
    if (reason) { record._is_credit_note = true; record._cn_reason = reason; }
    const grouped = row._grouped_lines;
    if (grouped?.length) {
      record.line_items = grouped.map(line => ({
        account_code: line.account_code ? String(line.account_code) : undefined,
        description: line.description ? String(line.description) : undefined,
        quantity: line.quantity === undefined ? 1 : parseImportNumber(line.quantity),
        unit_price: line.unit_price === undefined ? 0 : parseImportNumber(line.unit_price),
        discount: line.discount !== undefined ? String(line.discount) : undefined,
        tax_rate: line.tax_amount === undefined ? 0 : parseImportNumber(line.tax_amount),
        total: line.total === undefined ? undefined : parseImportNumber(line.total),
      }));
    } else if (record._li_description || record._li_account_code) {
      record.line_items = [{
        description: record._li_description, account_code: record._li_account_code,
        quantity: record._li_quantity ?? 1, unit_price: record._li_unit_price ?? 0,
        discount: record._li_discount, tax_rate: record._li_tax_amount ?? 0, total: record._li_total,
      }];
    }
    ["_li_description", "_li_account_code", "_li_quantity", "_li_unit_price", "_li_discount", "_li_tax_rate", "_li_tax_amount", "_li_total"].forEach(key => delete record[key]);
    delete record.email_address;
    const status = String(record.status || "").trim().toUpperCase();
    if (["VOIDED", "DELETED"].includes(status)) record._skip = true;
    else record.status = DOC_STATUS[status] || record.status || "Awaiting Payment";
    if (!record.number && record.reference) record.number = record.reference;
    // Compute per-line totals: only fill in missing fields, never overwrite explicit values (including 0)
    for (const line of record.line_items || []) {
      const qty = isNaN(Number(line.quantity)) ? 1 : Number(line.quantity);
      if (line.total === undefined && Number(line.unit_price) > 0) line.total = line.unit_price * qty;
      else if (line.unit_price === undefined && Number(line.total) > 0) line.unit_price = line.total / qty;
    }
    // Compute document totals from lines only when Total is not provided in the CSV (respect 0)
    if (record.total === undefined && record.line_items?.length) {
      record.subtotal = record.line_items.reduce((s, l) => s + (Number(l.total) || 0), 0);
      record.tax_amount = record.line_items.reduce((s, l) => s + (Number(l.tax_rate) || 0), 0);
      record.total = record.subtotal + record.tax_amount;
    }
    if (record.subtotal === undefined && record.total !== undefined) record.subtotal = record.total - (record.tax_amount || 0);
    // Effective amount_paid = max(InvoiceAmountPaid, Total - InvoiceAmountDue)
    // Xero credit-note/overpayment allocations reduce Amount Due without filling Amount Paid.
    if (record._amount_due !== undefined && record.total !== undefined) {
      const computedPaid = Number(record.total) - Number(record._amount_due);
      if (isFinite(computedPaid) && computedPaid > (Number(record.amount_paid) || 0)) {
        record.amount_paid = Math.round(computedPaid * 100) / 100;
      }
    }
    delete record._amount_due;
    // Create payment for Paid status or when amount_paid is present
    if (!record._skip && !record._is_credit_note) {
      if (record.status === "Paid" && !record.amount_paid && record.total > 0) {
        record.amount_paid = record.total;
      }
      if (record.amount_paid > 0) {
        record.payments = [{ id: `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: normalizeImportDate(record.issue_date) || todayLocalISO(), amount: record.amount_paid, reference: "Imported from Xero", provisional: true }];
      }
    }
  }
  if (entityKey === "ChartOfAccount") {
    record.code = String(record.code || ""); record.name = String(record.name || "");
    if (record.type) Object.assign(record, normalizeAccountType(record.type));
  }
  if (entityKey === "BankAccount") {
    const types = { bank: "Current", current: "Current", creditcard: "Credit Card", "credit card": "Credit Card", paypal: "Current", savings: "Savings", loan: "Loan", "petty cash": "Petty Cash" };
    record.account_type = types[String(record.account_type || "").trim().toLowerCase()] || record.account_type || "Current";
    if (!record.currency) record.currency = /USD/i.test(record.name || "") ? "USD" : "AED";
    if (record.status) record.status = /^(archived|inactive|closed)$/i.test(record.status) ? "Archived" : /^active$/i.test(record.status) ? "Active" : record.status;
    const openingHeader = headers.find(header => effectiveField(header) === "opening_balance" && /^OpeningBalance_\d{4}-\d{2}-\d{2}$/i.test(normalizeImportHeader(header)));
    if (openingHeader) record.opening_balance_date = normalizeImportHeader(openingHeader).slice("OpeningBalance_".length);
    if (record.show_on_dashboard === undefined) record.show_on_dashboard = true;
  }
  if (entityKey === "BankTransaction") {
    const types = { SPEND: "Spend Money", "SPEND MONEY": "Spend Money", RECEIVE: "Receive Money", "RECEIVE MONEY": "Receive Money", TRANSFER: "Transfer", "TRANSFER MONEY": "Transfer" };
    if (record.type) record.type = types[String(record.type).trim().toUpperCase()] || record.type;
    if (record._debit !== undefined || record._credit !== undefined) {
      const net = (Number(record._debit) || 0) - (Number(record._credit) || 0);
      if (!record.type) record.type = net >= 0 ? "Receive Money" : "Spend Money";
      if (record.amount === undefined) record.amount = Math.abs(net);
    }
    delete record._debit; delete record._credit;
    if (record.amount !== undefined) {
      if (!record.type) record.type = record.amount < 0 ? "Spend Money" : "Receive Money";
      record.amount = Math.abs(Number(record.amount)) || 0;
    }
    if (record.status) record.status = ["yes", "true", "reconciled"].includes(record.status.toLowerCase()) ? "Reconciled" : "Unreconciled";
  }
  // Always keep base_total in sync (same convention as the forms: toBaseAmount(total, rate); AED docs use rate 1)
  if (["Invoice", "Bill", "CreditNote", "Quote", "PurchaseOrder"].includes(entityKey) && record.total !== undefined && !record._skip) {
    const foreign = record.currency && String(record.currency).toUpperCase() !== "AED";
    const fx = foreign ? Number(record.exchange_rate) : 1;
    if (fx > 0) { record.exchange_rate = fx; record.base_total = foreign ? toBaseAmount(Number(record.total), fx) : Number(record.total); }
  }
  DATE_FIELDS.forEach(field => { if (record[field] !== undefined) record[field] = normalizeImportDate(record[field]); });
  return record;
}

