// Quick Import (Phase A) — detect Xero file type from headers/title, parse with the
// EXISTING parsers, and compute a read-only plan (new/updated/unchanged) using the
// same dedup/update primitives as the wizard. No data is written.
import moment from "moment";
import { addDaysISO } from "@/lib/dateOnly";
import { parseImportCsv, getXeroCreditReason, normalizeImportHeader } from "@/lib/importCsv";
import {
  parseXeroAccountTransactions, detectBankAccount, normalizeAccountName,
  loadExistingDedupCounts, loadConversionDate, dedupKey,
} from "@/lib/bankTransactionImport";
import buildImportRecord from "@/lib/buildImportRecord";
import { resolveImportField, getDedupeKey } from "@/lib/importMatching";
import { loadExistingDocs, computeDocUpdate } from "@/lib/docReimportUpdate";
import { readAllPages, sdkCache } from "@/lib/sdkRetry";
import { isPaymentsReport } from "@/lib/xeroPaymentsImport";
import { planFromParsed } from "@/lib/xeroPaymentsRun";

// Dependency order for the plan table
export const TYPE_ORDER = [
  "ChartOfAccount", "Contact", "Product", "TaxRate", "BankAccount",
  "BankTransaction", "GeneralLedger", "Invoice", "Bill", "CreditNote", "PaymentsReport",
  "FixedAsset", "TrialBalance",
];
export const TYPE_LABELS = {
  ChartOfAccount: "Chart of Accounts",
  Contact: "Contacts",
  Product: "Items",
  TaxRate: "Tax Rates",
  BankAccount: "Bank Summary",
  BankTransaction: "Bank Account Transactions",
  GeneralLedger: "Journals / GL",
  Invoice: "Invoices",
  Bill: "Bills",
  CreditNote: "Credit Notes",
  PaymentsReport: "Payments report (AP/AR)",
  FixedAsset: "Fixed Assets",
  TrialBalance: "Trial Balance",
};

const lc = (s) => String(s || "").trim().toLowerCase();
const has = (H, names) => names.some((n) => H.includes(lc(n)));
const hasIncl = (H, names) => names.some((n) => H.some((h) => h.includes(lc(n))));

// ── File reading (CSV/TXT/XLSX) ──────────────────────────────────────────────
export async function readFile(file) {
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = await file.text();
    const delim = (text.split(/\r?\n/)[0] || "").includes("\t") ? "\t" : ",";
    const parsed = parseImportCsv(text, delim);
    const firstLine = text.split(/\r?\n/)[0] || "";
    const a1 = firstLine.split(delim)[0].replace(/^"|"$/g, "").trim();
    return { headers: parsed.headers, rows: parsed.rows, a1, rawText: text };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    const a1 = jsonRows.length ? String(jsonRows[0]?.[0] || "").trim() : "";
    const known = ["date", "code", "account code", "contactname", "name", "itemcode", "journalid", "journalnumber", "account", "assetgroup(costaccount)", "assetgroup"];
    let headerIdx = 0;
    for (let i = 0; i < Math.min(jsonRows.length, 20); i++) {
      const cells = (jsonRows[i] || []).map((c) => lc(String(c || "")));
      if (cells.some((c) => known.includes(c))) { headerIdx = i; break; }
    }
    const headerRow = jsonRows[headerIdx] || [];
    const headers = headerRow.map((h) => String(h || "").trim());
    const rows = [];
    for (let i = headerIdx + 1; i < jsonRows.length; i++) {
      const row = jsonRows[i] || [];
      if (row.every((c) => c === "" || c === undefined || c === null)) continue;
      const obj = {};
      headers.forEach((h, idx) => { if (h) obj[h] = row[idx] !== undefined ? row[idx] : ""; });
      rows.push(obj);
    }
    return { headers, rows, a1, rawText: null };
  }
  throw new Error("Unsupported file type (use CSV or XLSX)");
}

// ── Type detection from headers/title (no filename dependence) ───────────────
function detectTypes(parsed) {
  const { headers, rows, a1, rawText } = parsed;
  const H = headers.map(lc);
  // 1. Bank Account Transactions — A1 ends with "Transactions"
  // Account Transactions of Accounts Payable / Receivable (payment lines per document) are NOT bank transactions
  if (isPaymentsReport(parsed)) return ["PaymentsReport"];
  if (a1 && /transactions\s*$/i.test(a1.trim())) return ["BankTransaction"];
  // 2. Trial Balance — title contains "trial balance"
  const titleBlob = [a1, ...(rawText ? rawText.split(/\r?\n/).slice(0, 12) : [])].join("\n").toLowerCase();
  if (titleBlob.includes("trial balance")) return ["TrialBalance"];
  // 3. General Ledger / Journal Report
  if ((hasIncl(H, ["journalid"]) || hasIncl(H, ["journalnumber"])) && (hasIncl(H, ["netamount"]) || (has(H, ["debit"]) && has(H, ["credit"])))) return ["GeneralLedger"];
  // 4. Fixed Assets / Depreciation Schedule
  if (hasIncl(H, ["depreciation"]) && headers.some((h) => /^closingvalue_/i.test(normalizeImportHeader(h))) && (has(H, ["name", "assetname", "asset"]))) return ["FixedAsset"];
  // 5. Bank Summary — BankAccountType + OpeningBalance_YYYY-MM-DD
  if (hasIncl(H, ["bankaccounttype"]) && headers.some((h) => /^openingbalance_\d{4}-\d{2}-\d{2}$/i.test(normalizeImportHeader(h)))) return ["BankAccount"];
  // 6. Chart of Accounts — Code + Name + Type + (Tax Code or Enable Payments)
  if (has(H, ["code"]) && has(H, ["name"]) && has(H, ["type"]) && (has(H, ["tax code"]) || has(H, ["enable payments"]))) return ["ChartOfAccount"];
  // 7. Items — ItemCode or (ItemName + purchase/sales columns)
  if (has(H, ["itemcode"]) || (has(H, ["itemname"]) && has(H, ["purchasesdescription", "salesprice", "issold", "istrackedasinventory"]))) return ["Product"];
  // 8. Tax Rates — Tax Rate + Name, no Code
  if ((hasIncl(H, ["tax rate"]) || has(H, ["taxrate"]) || has(H, ["accountsusingthisrate"])) && has(H, ["name"]) && !has(H, ["code"]) && !has(H, ["invoicenumber"])) return ["TaxRate"];
  // 9. Invoices / Bills / Credit Notes — line-by-line doc export with a Type column
  if (has(H, ["invoicenumber"]) && has(H, ["invoicedate"]) && has(H, ["quantity", "unitamount", "lineamount"]) && has(H, ["type"])) {
    const typeHeader = headers[headers.findIndex((h) => lc(h) === "type")];
    const found = new Set();
    for (const row of rows) {
      const v = lc(row[typeHeader] || "");
      if (v.includes("credit note") || v.includes("overpayment") || v.includes("prepayment") || v.includes("accrec-credit") || v.includes("accpay-credit")) found.add("CreditNote");
      else if (v.includes("bill")) found.add("Bill");
      else if (v.includes("sales invoice") || v.includes("accrec")) found.add("Invoice");
    }
    if (found.size === 0) return ["Invoice"];
    return [...found];
  }
  // 10. Contacts — ContactName + (EmailAddress or FirstName or address lines). Checked AFTER doc exports: Xero invoice/bill exports also carry ContactName + address columns.
  if (has(H, ["contactname"]) && (has(H, ["emailaddress", "firstname", "postaladdressline1", "poaddressline1"]))) return ["Contact"];
  return [];
}

// ── Existing-key loaders (cached on ctx) ─────────────────────────────────────
async function getExistingKeys(entityKey) {
  if (sdkCache.existingKeys[entityKey]) return sdkCache.existingKeys[entityKey];
  const items = await readAllPages(entityKey, {}, { limit: 1000 });
  const set = new Set();
  for (const r of items) { const k = getDedupeKey(r, entityKey); if (k) set.add(k); }
  sdkCache.existingKeys[entityKey] = set;
  return set;
}
async function getExistingDocs(entityKey) {
  if (sdkCache.existingDocs[entityKey]) return sdkCache.existingDocs[entityKey];
  const map = await loadExistingDocs(entityKey);
  sdkCache.existingDocs[entityKey] = map;
  return map;
}

// ── Invoice/Bill row grouping (replicates StepPreview grouping, read-only) ────
export function groupDocRows(rows, headers, typeFilter) {
  // Use raw header matching against known Xero doc headers (no column overrides in quick import)
  const numberHeader = headers.find((h) => lc(h) === "invoicenumber");
  const contactHeader = headers.find((h) => lc(h) === "contactname");
  const dateHeader = headers.find((h) => lc(h) === "invoicedate" || lc(h) === "date");
  const totalHeader = headers.find((h) => lc(h) === "total");
  const typeHeader = headers.find((h) => lc(h) === "type");
  const filtered = typeFilter ? rows.filter((r) => typeFilter(lc(r[typeHeader] || ""))) : rows;
  const groups = new Map();
  const ordered = [];
  for (const row of filtered) {
    const num = numberHeader ? String(row[numberHeader] || "").trim() : "";
    const key = num
      ? [num.toLowerCase(), lc(row[contactHeader] || ""), lc(row[dateHeader] || ""), String(row[totalHeader] || "").trim()].join("||")
      : [lc(row[contactHeader] || ""), lc(row[dateHeader] || ""), String(row[totalHeader] || "").trim()].join("||");
    if (!groups.has(key)) { groups.set(key, []); ordered.push(key); }
    groups.get(key).push(row);
  }
  return ordered.map((key) => {
    const groupRows = groups.get(key);
    return { key, lines: groupRows };
  });
}

// Normalise Xero dates (DD/MM/YYYY, D-MMM-YYYY...) to ISO so lock-date checks, dedup keys and reports agree.
const toIsoDate = (val) => {
  const s = String(val || "").trim();
  if (!s) return s;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = moment(s, ["DD-MMM-YYYY", "D-MMM-YYYY", "DD/MM/YYYY", "D/M/YYYY", "YYYY-MM-DD"], true);
  return m.isValid() ? m.format("YYYY-MM-DD") : s;
};

export function buildDocRecord(group, entityKey, headers) {
  const first = group.lines[0];
  const record = {};
  // Map known Xero doc headers → fields (subset sufficient for dedup + computeDocUpdate)
  const map = {
    InvoiceNumber: "number", CreditNoteNumber: "number", Reference: "reference",
    ContactName: "contact_name", InvoiceDate: "issue_date", Date: "issue_date",
    DueDate: "due_date", Total: "total", Currency: "currency", Status: "status",
    Notes: "notes", InvoiceAmountPaid: "amount_paid", Pagado: "amount_paid",
  };
  headers.forEach((h) => {
    const f = map[h] || map[normalizeImportHeader(h)];
    if (!f) return;
    const val = first[h];
    if (val === undefined || String(val).trim() === "") return;
    if (["total", "amount_paid"].includes(f)) record[f] = Number(String(val).replace(/[,%]/g, "")) || 0;
    else if (f === "issue_date" || f === "due_date") record[f] = toIsoDate(val);
    else record[f] = String(val);
  });
  // status normalisation
  const stMap = { DRAFT: "Draft", AUTHORISED: "Awaiting Payment", SUBMITTED: "Awaiting Approval", PAID: "Paid", VOIDED: "Cancelled", DELETED: "Cancelled" };
  if (record.status) record.status = stMap[String(record.status).trim().toUpperCase()] || record.status;
  if (record.status === "Paid" && !record.amount_paid && record.total > 0) record.amount_paid = record.total;
  if (record.amount_paid > 0 && entityKey !== "CreditNote") {
    record.payments = [{ id: "imp", date: record.issue_date || "", amount: record.amount_paid, reference: "Imported from Xero", provisional: true }];
  }
  return record;
}

// ── Per-type analysis ───────────────────────────────────────────────────────
async function analyzeType(type, parsed, file, ctx) {
  const fileName = file.name;
  const base = { file: fileName, type, conversionDate: null };
  try {
    if (type === "PaymentsReport") {
      const plan = await planFromParsed(parsed);
      const exc = plan.exceptions.length;
      return { ...base, rows: plan.lines, target: "Invoice / Bill payments", counts: { new: 0, updated: plan.updates.length, unchanged: 0 },
        hint: `Rebuilds real payment dates from the payment lines (dry run: ${plan.updates.length} documents already in the app would change, ${exc} exceptions). Applied after Invoices and Bills are imported; exceptions are downloadable after the import.` };
    }
    if (type === "BankTransaction") return await analyzeBankTx(file, ctx, base);
    if (type === "TrialBalance") return await analyzeTrialBalance(parsed, ctx, base);
    if (type === "GeneralLedger") return await analyzeGL(parsed, ctx, base);
    if (type === "FixedAsset") return await analyzeFixedAsset(parsed, ctx, base);
    if (type === "BankAccount") return await analyzeSimple("BankAccount", parsed, ctx, base);
    if (type === "ChartOfAccount") return await analyzeSimple("ChartOfAccount", parsed, ctx, base);
    if (type === "Contact") {
      const { importContacts } = await import("@/lib/quickImportRun");
      const r = await importContacts("Contact", parsed, { dryRun: true });
      return { ...base, rows: parsed.rows.length, target: TYPE_LABELS.Contact, counts: r.counts, hint: r.cases.length ? `${r.cases.length} near-identical name(s) need a decision` : base.hint };
    }
    if (type === "Product") return await analyzeSimple("Product", parsed, ctx, base);
    if (type === "TaxRate") return await analyzeSimple("TaxRate", parsed, ctx, base);
    if (type === "Invoice" || type === "Bill" || type === "CreditNote") return await analyzeDoc(type, parsed, ctx, base);
  } catch (e) {
    return { ...base, rows: 0, target: "", counts: {}, hint: `Error: ${e.message || "File analysis failed"}` };
  }
  return { ...base, rows: 0, target: "", counts: {}, hint: "not analysed" };
}

// Simple entities: new / existing (by dedup key)
async function analyzeSimple(entityKey, parsed, ctx, base) {
  const { headers, rows } = parsed;
  const knownFields = []; // resolveImportField handles known Xero headers via maps
  const eff = (h) => resolveImportField(entityKey, h, {}, knownFields);
  const existing = await getExistingKeys(entityKey);
  let newCount = 0, existingCount = 0;
  for (const row of rows) {
    const rec = buildImportRecord(row, { entityKey, headers, effectiveField: eff });
    if (rec._skip) continue;
    const key = getDedupeKey(rec, entityKey);
    if (!key) { newCount++; continue; }
    if (existing.has(key)) existingCount++; else newCount++;
  }
  return { ...base, rows: rows.length, target: TYPE_LABELS[entityKey], counts: { new: newCount, updated: existingCount, unchanged: 0 } };
}

// Invoice / Bill / Credit Note: new / updated / unchanged (computeDocUpdate)
async function analyzeDoc(entityKey, parsed, ctx, base) {
  const { headers, rows } = parsed;
  const typeHeader = headers.find((h) => lc(h) === "type");
  let typeFilter = null;
  if (entityKey === "Invoice") typeFilter = (v) => v.includes("sales invoice") || (v.includes("accrec") && !v.includes("credit"));
  else if (entityKey === "Bill") typeFilter = (v) => v.includes("bill") && !v.includes("credit");
  else if (entityKey === "CreditNote") typeFilter = (v) => getXeroCreditReason(v) || v.includes("credit note") || v.includes("overpayment") || v.includes("prepayment");
  const groups = groupDocRows(rows, headers, typeFilter);
  const existing = await getExistingDocs(entityKey);
  let newCount = 0, updatedCount = 0, unchangedCount = 0;
  for (const g of groups) {
    const rec = buildDocRecord(g, entityKey, headers);
    const key = getDedupeKey(rec, entityKey);
    const ex = key ? existing[key] : null;
    if (!ex) { newCount++; continue; }
    const { action } = await computeDocUpdate(ex, rec, entityKey);
    if (action === "updated") updatedCount++;
    else unchangedCount++;
  }
  return { ...base, rows: groups.length, target: TYPE_LABELS[entityKey], counts: { new: newCount, updated: updatedCount, unchanged: unchangedCount } };
}

// Bank Account Transactions: detect bank, multiset dedup, pre-conversion skip
async function analyzeBankTx(file, ctx, base) {
  const preloadError = Object.values(ctx.preloadErrors || {}).join("; ");
  if (preloadError) throw new Error(preloadError);
  const parsed = await parseXeroAccountTransactions(file);
  const { txRows, detectedAccountName } = parsed;
  if (!txRows.length) throw new Error("No valid bank transactions found. Check the Date and Debit (AED)/Credit (AED) columns.");
  const det = detectBankAccount(detectedAccountName, ctx.bankAccounts);
  const bank = det.match;
  const convBoundary = ctx.conversionDate ? addDaysISO(ctx.conversionDate, 1) : null;
  let eligible = txRows;
  let preConv = 0;
  if (convBoundary) {
    eligible = txRows.filter((t) => t.date >= convBoundary);
    preConv = txRows.length - eligible.length;
  }
  let newCount = 0, dupCount = 0;
  if (bank) {
    const existingCounts = await loadExistingDedupCounts(bank.id);
    const fileCounts = new Map();
    for (const tx of eligible) {
      const key = dedupKey({ ...tx, bank_account_id: bank.id });
      fileCounts.set(key, (fileCounts.get(key) || 0) + 1);
    }
    for (const [key, fc] of fileCounts) {
      const ec = existingCounts.get(key) || 0;
      const toImport = Math.max(0, fc - ec);
      newCount += toImport;
      dupCount += fc - toImport;
    }
  } else {
    newCount = eligible.length;
  }
  return {
    ...base,
    rows: txRows.length,
    target: bank ? bank.name : (det.ambiguous ? "multiple matches — select manually" : "no match — select manually"),
    counts: { new: newCount, updated: 0, unchanged: dupCount, preConversion: preConv },
    hint: det.ambiguous ? "Several bank accounts match — select manually in the wizard step." : (!bank ? "No bank account matched — select manually in the wizard step." : undefined),
  };
}

// General Ledger: group into journals, count
async function analyzeGL(parsed, ctx, base) {
  const { headers, rows } = parsed;
  const map = new Map();
  const order = [];
  for (const row of rows) {
    let key = row.JournalID || row.journalid || row.JournalNumber || row.journalnumber || "";
    if (!key) {
      const date = row.Date || row.JournalDate || row.date || "";
      const narration = String(row.Narration || row.Description || row.Reference || "").trim();
      key = date && narration ? `${date}||${narration}` : "";
    }
    if (!key) continue;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key).push(row);
  }
  return { ...base, rows: order.length, target: "JournalEntry", counts: { new: order.length, updated: 0, unchanged: 0 } };
}

// Fixed Assets: new / updated by name(+cost)
async function analyzeFixedAsset(parsed, ctx, base) {
  const { headers, rows } = parsed;
  const nameCol = headers.find((h) => { const l = lc(h); return l === "name" || l === "assetname" || l === "asset"; });
  const costCol = headers.find((h) => lc(h) === "cost");
  const existing = await getExistingKeys("Asset");
  let newCount = 0, existingCount = 0;
  const seen = new Set();
  for (const row of rows) {
    const name = String(row[nameCol] || "").trim();
    if (!name || name.toLowerCase().includes("total")) continue;
    const cost = Number(String(row[costCol] || "").replace(/[,%]/g, "")) || 0;
    const key = cost > 0 ? `${name.toLowerCase()}||${cost}` : name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (existing.has(key)) existingCount++; else newCount++;
  }
  return { ...base, rows: seen.size, target: "Asset", counts: { new: newCount, updated: existingCount, unchanged: 0 } };
}

// Trial Balance: account rows + matched + conversion date
async function analyzeTrialBalance(parsed, ctx, base) {
  const { headers, rows, rawText } = parsed;
  // conversion date from title
  let conversionDate = null;
  const blob = rawText ? rawText.split(/\r?\n/).slice(0, 12) : [];
  for (const line of blob) {
    const m = line.match(/as\s*at\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
    if (m) {
      const d = new Date(`${m[1]} ${m[2]} ${m[3]}`);
      if (!isNaN(d)) conversionDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  }
  const codeCol = headers.find((h) => lc(h).includes("account code") || lc(h) === "accountcode" || lc(h) === "code" || lc(h) === "account");
  let count = 0;
  for (const row of rows) {
    const c = String(row[codeCol] || "").trim();
    if (!c || lc(c) === "total" || lc(c).startsWith("grand total")) continue;
    count++;
  }
  return { ...base, rows: count, target: "verification", counts: { new: count, updated: 0, unchanged: 0 }, conversionDate };
}

// ── Main entry: analyze one file → array of plan rows ───────────────────────
export async function analyzeFile(file, ctx) {
  try {
    const parsed = await readFile(file);
    const types = detectTypes(parsed);
    if (!types.length) return [{ file: file.name, type: null, rows: parsed.rows.length, target: "", counts: {}, hint: "Not recognised — check that headers match a Xero export" }];
    const out = [];
    for (const t of types) out.push(await analyzeType(t, parsed, file, ctx));
    return out;
  } catch (e) {
    return [{ file: file.name, type: null, rows: 0, target: "", counts: {}, hint: `Error: ${e.message || "File analysis failed"}` }];
  }
}

// Build the ctx (shared cache) — bank accounts + conversion date loaded up front.
// Reads go through readAllPages (serialised, retried, inter-page delay) and are
// cached at module level (sdkCache) so re-dropping files does not re-read.
export async function buildContext() {
  const preloadErrors = {};
  let bankAccounts = sdkCache.bankAccounts;
  if (!bankAccounts) {
    try {
      const items = await readAllPages("BankAccount", {}, { limit: 500 });
      bankAccounts = items.filter((b) => b.status !== "Archived" && b.status !== "Inactive");
      sdkCache.bankAccounts = bankAccounts;
    } catch (e) {
      bankAccounts = [];
      preloadErrors.bankAccounts = e.message || "Could not load bank accounts";
    }
  }
  let conversionDate = null;
  try { conversionDate = await loadConversionDate(); }
  catch (e) { preloadErrors.conversionDate = e.message || "Could not load conversion date"; }
  return { bankAccounts, conversionDate, preloadErrors };
}