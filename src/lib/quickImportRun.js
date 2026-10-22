// Quick Import Phase B — runs all importers in dependency order.
// Mode: always "Add to existing" (never Replace all).
// Never creates journals from bank transactions.
// Respects the lock date (OpeningBalance exempt).
// Stops on the first error with a clear message.
// Uses sdkRetry withRetry and small batches.
// Ends with a reconciliation summary (reuses step 11 checks).

import { base44 } from "@/api/base44Client";
import { addDaysISO, todayLocalISO } from "@/lib/dateOnly";
import { withRetry, delay, readAllPages, invalidateSdkCache } from "@/lib/sdkRetry";
import { parseImportCsv, normalizeImportHeader, getXeroCreditReason } from "@/lib/importCsv";
import buildImportRecord from "@/lib/buildImportRecord";
import { resolveImportField, getDedupeKey } from "@/lib/importMatching";
import { loadExistingDocs, upsertDoc } from "@/lib/docReimportUpdate";
import { isRejection } from "@/lib/lineItemValidation";
import {
  parseXeroAccountTransactions, loadExistingDedupCounts, loadDocMaps,
  enrichWithDoc, dedupKey, linkPaymentsToDocs, detectBankAccount,
} from "@/lib/bankTransactionImport";
import { linkJournalsToDocs } from "@/lib/journalDocLinker";
import { checkPeriodLock } from "@/lib/periodLock";
import { saveXeroCreditNote, resolveXeroContact } from "@/lib/xeroCreditImport";
import { readFile, groupDocRows, buildDocRecord, TYPE_ORDER, TYPE_LABELS, buildContext } from "@/lib/quickImport";
import { applyPaymentsReport } from "@/lib/xeroPaymentsRun";
import moment from "moment";

const round2 = (n) => Math.round(n * 100) / 100;
const lc = (s) => String(s || "").trim().toLowerCase();

// ── Helpers ──────────────────────────────────────────────────────────────────

async function isDateLocked(date, sourceType) {
  if (!date) return false;
  const { locked } = await checkPeriodLock(date, { sourceType });
  return locked;
}

async function loadExistingKeys(entityKey) {
  const items = await readAllPages(entityKey, {}, { limit: 1000, fields: ["id", "number", "code", "full_name", "name"] });
  const set = new Set();
  for (const r of items) {
    const key = getDedupeKey(r, entityKey);
    if (key) set.add(key);
  }
  return set;
}

async function loadCOAMap() {
  const items = await readAllPages("ChartOfAccount", {}, { limit: 1000, fields: ["id", "code", "name", "type", "opening_balance"] });
  const byCode = {};
  const byName = {};
  for (const a of items) {
    const code = String(a.code || "").trim().toLowerCase();
    if (code) byCode[code] = a;
    const name = String(a.name || "").trim().toLowerCase();
    if (name) byName[name] = a;
  }
  return { byCode, byName, list: items };
}

// ── Simple entity import (ChartOfAccount, Contact, Product, TaxRate, BankAccount) ──


// Chart-of-accounts type guard: the file's type is the truth (exact Xero names only).
// Existing accounts whose type/category differ are corrected; anything that is not an
// exact/alias match (blank, partial, unknown) is reported, never silently guessed.
async function syncCoaTypes(rows, headers, eff) {
  const { classifyAccountType, getCategoryForType } = await import("@/lib/accountTypes");
  const all = await base44.entities.ChartOfAccount.list("code", 2000);
  const byCode = {};
  for (const a of all) if (a.code) byCode[String(a.code).trim().toLowerCase()] = a;
  let fixed = 0;
  const warnings = [];
  for (const row of rows) {
    const rec = buildImportRecord(row, { entityKey: "ChartOfAccount", headers, effectiveField: eff });
    if (rec._skip || !rec.code) continue;
    const raw = headers.find((h) => String(h).trim().toLowerCase() === "type");
    const rawType = raw ? row[raw] : rec.type;
    const c = classifyAccountType(rawType);
    const cur = byCode[String(rec.code).trim().toLowerCase()];
    if (c.confidence !== "exact" && c.confidence !== "alias") {
      warnings.push(`${rec.code} ${rec.name || ""}: type "${rawType || ""}" not recognised (${c.confidence})`);
      continue;
    }
    if (cur && (cur.type !== c.type || cur.category !== getCategoryForType(c.type))) {
      await withRetry(() => base44.entities.ChartOfAccount.update(cur.id, { type: c.type, category: getCategoryForType(c.type) }), { label: "ChartOfAccount.typeFix" });
      fixed++;
    }
  }
  return { fixed, warnings };
}

// ── Contact import: multi-key matching (ContactID > tax number > normalized name) ──
const normName = (v) => String(v || "").toLowerCase().replace(/\s+/g, " ").trim();
const looseName = (v) => String(v || "").toLowerCase()
  .replace(/[.,'"()&\-\/]/g, " ")
  .replace(/\b(l\s?l\s?c|fze|fzc|fzco|ltd|limited|co|company|est|establishment|inc|trading|tr|the|and)\b/g, " ")
  .replace(/\s+/g, "").trim();
const normTax = (v) => String(v || "").replace(/[\s-]/g, "").toLowerCase();
const FILL_FIELDS = ["company", "email", "phone", "address", "city", "country", "website", "tax_id", "fiscal_legal_name", "fiscal_address", "fiscal_bank_name", "fiscal_iban", "type", "source_account_number"];

export async function importContacts(entityKey, parsed, { onProgress, decisions = {}, dryRun = false } = {}) {
  const { headers, rows } = parsed;
  const eff = (h) => resolveImportField("Contact", h, {}, []);
  const items = await readAllPages("Contact", {}, { limit: 1000, fields: ["id", "external_id", "full_name", "tax_id", "reference", "notes", ...FILL_FIELDS] });
  const byExt = new Map(), byTax = new Map(), byName = new Map(), byLoose = new Map();
  let maxSerial = 0, serialPrefix = "C";
  for (const c of items) {
    if (c.external_id) byExt.set(String(c.external_id).trim().toLowerCase(), c);
    if (normTax(c.tax_id)) byTax.set(normTax(c.tax_id), c);
    if (normName(c.full_name)) byName.set(normName(c.full_name), c);
    if (looseName(c.full_name)) byLoose.set(looseName(c.full_name), c);
    const m = String(c.reference || "").match(/^([A-Za-z]+)-\d{4}-(\d+)$/);
    if (m) { maxSerial = Math.max(maxSerial, Number(m[2])); serialPrefix = m[1]; }
  }
  const year = new Date().getFullYear();
  const toCreate = [], updates = [], warnings = [], doubtful = [], cases = [], seenCases = new Set();
  let unchangedCount = 0;
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const rec = buildImportRecord(rows[i], { entityKey: "Contact", headers, effectiveField: eff });
    if (rec._skip || !rec.full_name) continue;
    ["_skip", "_is_credit_note", "_cn_reason"].forEach(k => delete rec[k]);
    delete rec.reference; // Reference is always the app serial, never a source value
    const ext = rec.external_id ? String(rec.external_id).trim().toLowerCase() : "";
    let match = (ext && byExt.get(ext)) || (normTax(rec.tax_id) && byTax.get(normTax(rec.tax_id))) || byName.get(normName(rec.full_name));
    // Near-identical name (not an exact match): the user decides per case in the import review screen.
    let nearKey = null;
    if (!match) {
      const lk = looseName(rec.full_name);
      const near = lk && byLoose.get(lk);
      if (near) {
        nearKey = normName(rec.full_name);
        if (decisions[nearKey] === "merge") match = near;
        else if (decisions[nearKey] !== "separate") {
          if (!seenCases.has(nearKey)) { seenCases.add(nearKey); cases.push({ key: nearKey, name: rec.full_name, existing: near.full_name, existingId: near.id }); }
          continue; // undecided: neither merged nor created
        }
      }
    }
    if (match) {
      const patch = {};
      const diffs = [];
      if (rec.external_id && !match.external_id) patch.external_id = rec.external_id;
      for (const f of FILL_FIELDS) {
        if (rec[f] && !match[f]) patch[f] = rec[f];
        else if (rec[f] && match[f] && ["email", "phone", "address", "tax_id", "city", "country", "website"].includes(f)
          && String(rec[f]).trim().toLowerCase() !== String(match[f]).trim().toLowerCase()) {
          diffs.push(`${f}: ${String(rec[f]).trim()}`); // existing stays primary; the other value is logged in notes
        }
      }
      // Merge rule: existing value stays primary; a different source value is appended once to notes (nothing is lost).
      const curNotes = String(match.notes || "");
      const newDiffs = diffs.filter(d => !curNotes.includes(d));
      if (newDiffs.length) {
        const stamp = todayLocalISO();
        patch.notes = (curNotes ? curNotes + "\n" : "") + `[Import ${stamp}] Alternate value in source - ${newDiffs.join("; ")}`;
        warnings.push(`${match.full_name}: merged, alternate kept in notes (${newDiffs.join("; ")})`);
      }
      if (Object.keys(patch).length) { Object.assign(match, patch); const u = updates.find(x => x.id === match.id); if (u) Object.assign(u.patch, patch); else updates.push({ id: match.id, patch }); } else unchangedCount++;
      continue;
    }
    const k = ext || normName(rec.full_name);
    if (seen.has(k)) { unchangedCount++; continue; }
    seen.add(k);
    maxSerial++;
    rec.reference = `${serialPrefix}-${year}-${maxSerial}`;
    toCreate.push(rec);
    if (onProgress && i % 50 === 0) onProgress(Math.round((i / rows.length) * 100));
  }
  if (dryRun) return { cases, counts: { new: toCreate.length, updated: updates.length, unchanged: unchangedCount } };
  for (let i = 0; i < toCreate.length; i += 50) {
    await withRetry(() => base44.entities.Contact.bulkCreate(toCreate.slice(i, i + 50)), { label: "Contact.bulkCreate" });
    await delay(200);
  }
  for (const u of updates) {
    await withRetry(() => base44.entities.Contact.update(u.id, u.patch), { label: "Contact.update" });
  }
  if (cases.length) warnings.unshift(`${cases.length} near-identical name(s) left undecided (neither merged nor created): ${cases.slice(0, 30).map(c => `${c.name} ~ ${c.existing}`).join("; ")}`);
  return { new: toCreate.length, updated: updates.length, unchanged: unchangedCount, errors: 0, warnings };
}

async function importSimpleEntity(entityKey, parsed, { onProgress }) {
  const { headers, rows } = parsed;
  const knownFields = [];
  const eff = (h) => resolveImportField(entityKey, h, {}, knownFields);
  const existing = await loadExistingKeys(entityKey);

  let newCount = 0, unchangedCount = 0;
  const toCreate = [];

  for (let i = 0; i < rows.length; i++) {
    const record = buildImportRecord(rows[i], { entityKey, headers, effectiveField: eff });
    if (record._skip) continue;

    // Check lock date for dated records
    const date = record.date || record.issue_date || record.opening_balance_date;
    if (date && await isDateLocked(date, record.source_type)) {
      unchangedCount++;
      continue;
    }

    const key = getDedupeKey(record, entityKey);
    if (key && existing.has(key)) {
      unchangedCount++; // Add to existing mode: skip existing
      continue;
    }

    // Clean up internal fields
    delete record._skip;
    delete record._is_credit_note;
    delete record._cn_reason;

    toCreate.push(record);
    newCount++;

    if (onProgress && i % 50 === 0) onProgress(Math.round((i / rows.length) * 100));
  }

  // Bulk create in small batches
  for (let i = 0; i < toCreate.length; i += 50) {
    const batch = toCreate.slice(i, i + 50);
    await withRetry(() => base44.entities[entityKey].bulkCreate(batch), { label: `${entityKey}.bulkCreate` });
    await delay(200);
  }

  if (entityKey === "ChartOfAccount") {
    const t = await syncCoaTypes(rows, headers, eff);
    return { new: newCount, updated: t.fixed, unchanged: unchangedCount, errors: 0, warnings: t.warnings };
  }
  return { new: newCount, updated: 0, unchanged: unchangedCount, errors: 0 };
}

// ── Invoice/Bill import (using upsertDoc for surgical updates) ────────────────

// Build Xero-style line_items for one invoice/bill group (one CSV row per line).
// Each line carries its account (id/code/name) resolved from the chart of accounts.
// tax_rate holds the line tax AMOUNT (same convention as existing documents).
const numOf = (v) => {
  const n = Number(String(v ?? "").replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
function buildLineItems(group, headers, coa) {
  const H = (name) => headers.find((h) => lc(h) === name);
  const hDesc = H("description"), hQty = H("quantity"), hUnit = H("unitamount");
  const hDisc = H("discount"), hAmt = H("lineamount"), hCode = H("accountcode");
  const hTax = H("taxamount"), hItem = H("inventoryitemcode");
  const items = [];
  let subtotal = 0, tax = 0, missingAccount = 0;
  for (const row of group.lines) {
    const rawCode = hCode ? String(row[hCode] ?? "").trim() : "";
    let acc = null;
    if (rawCode) {
      const k = rawCode.toLowerCase();
      acc = coa.byCode[k] || coa.byCode[k.padStart(4, "0")] || coa.byCode[k.replace(/^0+/, "")] || null;
    }
    const qty = hQty ? numOf(row[hQty]) : 0;
    const unit = hUnit ? numOf(row[hUnit]) : 0;
    const total = hAmt && String(row[hAmt] ?? "").trim() !== "" ? numOf(row[hAmt]) : Math.round(qty * unit * 100) / 100;
    const lineTax = hTax ? numOf(row[hTax]) : 0;
    const disc = hDisc && String(row[hDisc] ?? "").trim() !== "" ? numOf(row[hDisc]) : null;
    const desc = hDesc ? String(row[hDesc] ?? "").trim() : "";
    if (!desc && !qty && !total && !rawCode) continue;
    if (!acc && (qty || total)) missingAccount++;
    items.push({
      item_code: hItem && String(row[hItem] ?? "").trim() ? String(row[hItem]).trim() : null,
      description: desc,
      account_id: acc ? acc.id : null,
      account_code: acc ? acc.code : (rawCode || null),
      account_name: acc ? acc.name : null,
      quantity: qty,
      unit_price: unit,
      discount: disc,
      tax_rate: lineTax,
      total,
    });
    subtotal += total;
    tax += lineTax;
  }
  const round = (n) => Math.round(n * 100) / 100;
  return { items, subtotal: round(subtotal), tax: round(tax), missingAccount };
}

async function importDocs(entityKey, parsed, { onProgress }) {
  const { headers, rows } = parsed;
  const typeHeader = headers.find((h) => lc(h) === "type");
  let typeFilter = null;
  if (entityKey === "Invoice") typeFilter = (v) => v.includes("sales invoice") || (v.includes("accrec") && !v.includes("credit"));
  else if (entityKey === "Bill") typeFilter = (v) => v.includes("bill") && !v.includes("credit");

  const groups = groupDocRows(rows, headers, typeFilter);
  const existingMap = await loadExistingDocs(entityKey);
  const coa = await loadCOAMap();
  let linesNoAccount = 0;

  let newCount = 0, updatedCount = 0, unchangedCount = 0;
  const rejected = []; // empty active documents refused before creation (with the reason)

  for (let i = 0; i < groups.length; i++) {
    const rec = buildDocRecord(groups[i], entityKey, headers);
    // ISO dates (the lock check and reports need YYYY-MM-DD, not DD/MM/YYYY)
    if (rec.issue_date) rec.issue_date = normalizeGLDate(rec.issue_date);
    if (rec.due_date) rec.due_date = normalizeGLDate(rec.due_date);
    if (rec.payments) rec.payments = rec.payments.map((p) => ({ ...p, date: rec.issue_date || p.date }));
    const built = buildLineItems(groups[i], headers, coa);
    linesNoAccount += built.missingAccount;
    if (built.items.length) {
      rec.line_items = built.items;
      rec.subtotal = built.subtotal;
      rec.tax_amount = built.tax;
    }
    if (!rec.contact_name && !rec.contact_id) {
      throw new Error(`${entityKey} ${rec.number || i + 1}: missing contact`);
    }

    // Resolve contact_id from ContactName (find-or-create, same rule as credit notes)
    if (rec.contact_name && !rec.contact_id) {
      const contact = await resolveXeroContact(rec.contact_name);
      rec.contact_id = contact.id;
      rec.contact_name = contact.full_name;
    }

    // Check lock date
    if (rec.issue_date && await isDateLocked(rec.issue_date)) {
      unchangedCount++;
      continue;
    }

    let result;
    try {
      result = await upsertDoc(entityKey, rec, existingMap);
    } catch (e) {
      // Empty active document refused by the shared import rule — report it and keep going.
      if (!isRejection(e)) throw e;
      rejected.push(e.message);
      continue;
    }
    // Backfill lines on an existing document that has none (earlier imports left them empty)
    if (result.action !== "created" && built.items.length && result.id && !((result.record?.line_items || []).length)) {
      await withRetry(() => base44.entities[entityKey].update(result.id, { line_items: built.items, subtotal: built.subtotal, tax_amount: built.tax }), { label: `${entityKey}.update lines` });
      if (result.action === "unchanged") result.action = "updated";
    }
    if (result.action === "created") newCount++;
    else if (result.action === "updated") updatedCount++;
    else unchangedCount++;

    if (onProgress && i % 20 === 0) onProgress(Math.round((i / groups.length) * 100));
    await delay(150);
  }

  return { new: newCount, updated: updatedCount, unchanged: unchangedCount, errors: 0, linesNoAccount, rejected };
}

// ── Credit Note import (using saveXeroCreditNote) ────────────────────────────

async function importCreditNotes(parsed, { onProgress }) {
  const { headers, rows } = parsed;
  const typeFilter = (v) => getXeroCreditReason(v) || v.includes("credit note") || v.includes("overpayment") || v.includes("prepayment");
  const groups = groupDocRows(rows, headers, typeFilter);

  let newCount = 0, updatedCount = 0, unchangedCount = 0;
  const rejected = []; // empty active credit notes refused before creation (with the reason)

  for (let i = 0; i < groups.length; i++) {
    const rec = buildDocRecord(groups[i], "CreditNote", headers);
    if (!rec.contact_name) {
      throw new Error(`Credit Note ${rec.number || i + 1}: missing contact`);
    }

    // Check lock date
    if (rec.issue_date && await isDateLocked(rec.issue_date)) {
      unchangedCount++;
      continue;
    }

    let result;
    try {
      result = await saveXeroCreditNote(rec);
    } catch (e) {
      if (!isRejection(e)) throw e;
      rejected.push(e.message);
      continue;
    }
    if (result.action === "created") newCount++;
    else if (result.action === "updated") updatedCount++;
    else unchangedCount++;

    if (onProgress && i % 20 === 0) onProgress(Math.round((i / groups.length) * 100));
    await delay(150);
  }

  return { new: newCount, updated: updatedCount, unchanged: unchangedCount, errors: 0, rejected };
}

// ── Bank Transaction import (with 5 ordered linking rules) ──────────────────

async function importBankTransactions(file, ctx, { onProgress }) {
  const parsed = await parseXeroAccountTransactions(file);
  const { txRows, detectedAccountName } = parsed;
  if (!txRows.length) throw new Error("No valid bank transactions found.");

  // Detect bank account
  const det = detectBankAccount(detectedAccountName, ctx.bankAccounts);
  const bank = det.match;
  if (!bank) {
    throw new Error(det.ambiguous
      ? `Bank account "${detectedAccountName}" matches multiple accounts — use the wizard to select manually.`
      : `Bank account "${detectedAccountName}" not found — use the wizard to select manually.`);
  }

  // Filter pre-conversion rows
  const convBoundary = ctx.conversionDate ? (() => {
    return addDaysISO(ctx.conversionDate, 1);
  })() : null;

  let eligible = txRows;
  let skippedPre = 0;
  if (convBoundary) {
    eligible = txRows.filter((t) => t.date >= convBoundary);
    skippedPre = txRows.length - eligible.length;
  }

  // Filter locked rows
  const lockEligible = [];
  let skippedLocked = 0;
  for (const tx of eligible) {
    if (await isDateLocked(tx.date)) {
      skippedLocked++;
      continue;
    }
    lockEligible.push(tx);
  }

  // Enrich with doc linkage (source_id, contact_id)
  const docMaps = await loadDocMaps();
  const enriched = lockEligible.map((tx) => enrichWithDoc(tx, docMaps));

  // Deduplicate (multiset dedup)
  const existingCounts = await loadExistingDedupCounts(bank.id);
  const fileCounts = new Map();
  for (const tx of enriched) {
    const key = dedupKey({ ...tx, bank_account_id: bank.id });
    fileCounts.set(key, (fileCounts.get(key) || 0) + 1);
  }
  const importCounts = new Map();
  for (const [key, fc] of fileCounts) {
    const ec = existingCounts.get(key) || 0;
    importCounts.set(key, Math.max(0, fc - ec));
  }

  const toCreate = [];
  let duplicates = 0;
  const seenInFile = new Map();
  for (const tx of enriched) {
    const key = dedupKey({ ...tx, bank_account_id: bank.id });
    const imported = seenInFile.get(key) || 0;
    const allowed = importCounts.get(key) || 0;
    if (imported < allowed) {
      seenInFile.set(key, imported + 1);
      toCreate.push({
        bank_account_id: bank.id,
        bank_account_name: bank.name,
        date: tx.date,
        description: tx.description,
        reference: tx.reference,
        type: tx.type,
        amount: tx.amount,
        currency: bank.currency || "AED",
        status: "Reconciled",
        source_type: tx.sourceType,
        source_id: tx.source_id || null,
        source_number: tx.source_number || null,
        contact_id: tx.contact_id || null,
        contact_name: tx.contact_name || null,
        notes: tx.source ? `Xero source: ${tx.source}` : "",
      });
    } else {
      duplicates++;
    }
  }

  // Create in batches — never create journals from bank transactions
  let created = [];
  for (let i = 0; i < toCreate.length; i += 500) {
    const batch = toCreate.slice(i, i + 500);
    const res = await withRetry(() => base44.entities.BankTransaction.bulkCreate(batch), { label: "BankTransaction.bulkCreate" });
    created = created.concat(res.items || (Array.isArray(res) ? res : []));
    if (onProgress) onProgress(Math.round((Math.min(i + 500, toCreate.length) / Math.max(toCreate.length, 1)) * 80));
    await delay(200);
  }

  // Link payments (with 5 ordered rules — direction, reference, no-claim, fallback, review)
  let linked = 0, unlinked = 0, ambiguous = 0;
  if (created.length > 0) {
    const linkRes = await linkPaymentsToDocs(created, docMaps, bank);
    linked = linkRes.linked;
    unlinked = linkRes.unlinked;
    ambiguous = linkRes.ambiguous;
  }

  if (onProgress) onProgress(100);

  return {
    new: created.length,
    updated: 0,
    unchanged: duplicates + skippedPre + skippedLocked,
    errors: 0,
    linked,
    unlinked,
    ambiguous,
    bankName: bank.name,
  };
}

// ── Trial Balance import (update COA opening_balance + generate opening journal) ──

const BS_TYPES = new Set(["Bank", "Current Asset", "Fixed Asset", "Non-current Asset", "Current Liability", "Liability", "Non-current Liability", "Equity"]);
const PL_TYPES = new Set(["Revenue", "Other Income", "Direct Costs", "Expense"]);
const TYPE_MAP = {
  "bank": "Bank", "current asset": "Current Asset", "fixed asset": "Fixed Asset",
  "non-current asset": "Non-current Asset", "noncurrent asset": "Non-current Asset",
  "current liability": "Current Liability", "liability": "Liability",
  "non-current liability": "Non-current Liability", "noncurrent liability": "Non-current Liability",
  "equity": "Equity", "revenue": "Revenue", "sales": "Revenue",
  "other income": "Other Income", "other revenue": "Other Income",
  "direct costs": "Direct Costs", "direct cost": "Direct Costs", "cost of sales": "Direct Costs",
  "expense": "Expense", "expenses": "Expense", "overhead": "Expense", "depreciation": "Expense",
  "prepayment": "Current Asset", "inventory": "Current Asset",
};

function normalizeType(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (TYPE_MAP[t]) return TYPE_MAP[t];
  for (const [k, v] of Object.entries(TYPE_MAP)) {
    if (t.includes(k)) return v;
  }
  return "";
}

const normCode = (s) => {
  const c = String(s || "").trim().toLowerCase();
  return c.replace(/^0+/, "") || "0";
};

async function importTrialBalance(parsed, { onProgress }) {
  let { headers, rows, rawText } = parsed;

  // For CSV/TXT files with title rows, find the actual header line
  const hasCodeHeader = headers.some((h) => {
    const l = lc(h);
    return l === "account code" || l === "accountcode" || l === "code" || l === "account";
  });
  if (!hasCodeHeader && rawText) {
    const lines = rawText.split(/\r?\n/);
    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 15); i++) {
      if (lines[i].toLowerCase().includes("account code")) { headerIdx = i; break; }
    }
    if (headerIdx >= 0) {
      const delim = (lines[0] || "").includes("\t") ? "\t" : ",";
      const reParsed = parseImportCsv(lines.slice(headerIdx).join("\n"), delim);
      headers = reParsed.headers;
      rows = reParsed.rows;
    }
  }

  const codeCol = headers.find((h) => { const l = lc(h); return l === "account code" || l === "accountcode" || l === "code" || l === "account"; });
  const nameCol = headers.find((h) => lc(h) === "account name" || lc(h) === "account" || lc(h) === "name");
  const typeCol = headers.find((h) => lc(h) === "account type" || lc(h) === "type");
  const debitCol = headers.find((h) => lc(h).includes("debit"));
  const creditCol = headers.find((h) => lc(h).includes("credit"));

  if (!codeCol) throw new Error("Trial Balance: missing Account Code column.");

  // Load COA
  const coaItems = await readAllPages("ChartOfAccount", {}, { limit: 1000, fields: ["id", "code", "name", "type", "opening_balance"] });
  const coaByCode = {};
  const coaByName = {};
  for (const a of coaItems) {
    const code = normCode(a.code);
    if (code) coaByCode[code] = a;
    const name = String(a.name || "").trim().toLowerCase().replace(/\s+/g, " ");
    if (name) coaByName[name] = a;
  }

  // Find Retained Earnings account
  const reAccount = coaItems.find((a) => normCode(a.code) === "960") ||
    coaItems.find((a) => normalizeType(a.type) === "Equity" && String(a.name || "").trim().toLowerCase() === "retained earnings") ||
    null;

  // Parse TB rows
  const parseNum = (val) => {
    if (!val && val !== 0) return 0;
    const s = String(val).trim();
    if (!s) return 0;
    const isNeg = s.startsWith("(") && s.endsWith(")");
    const clean = s.replace(/[(),]/g, "");
    const n = parseFloat(clean);
    return isNaN(n) ? 0 : (isNeg ? -Math.abs(n) : n);
  };

  const tbRows = [];
  for (const row of rows) {
    const code = String(row[codeCol] || "").trim();
    const name = String(row[nameCol] || "").trim();
    if (!code || lc(code) === "total" || lc(code).startsWith("grand total")) continue;
    if (lc(name) === "total" || lc(name) === "totales" || lc(name).startsWith("grand total")) continue;

    const debit = debitCol ? parseNum(row[debitCol]) : 0;
    const credit = creditCol ? parseNum(row[creditCol]) : 0;
    const net = round2(debit - credit);
    const typeRaw = typeCol ? String(row[typeCol] || "").trim() : "";
    const typeNorm = normalizeType(typeRaw);
    const isBs = BS_TYPES.has(typeNorm);
    const isPl = PL_TYPES.has(typeNorm);

    // Match by code first, then by name
    const matched = (code && coaByCode[normCode(code)]) || (name && coaByName[name.trim().toLowerCase().replace(/\s+/g, " ")]) || null;

    tbRows.push({ code, name, typeRaw, typeNorm, isBs, isPl, debit, credit, net, matchedId: matched?.id });
  }

  // Compute Retained Earnings opening
  const plNet = round2(tbRows.filter((r) => r.isPl).reduce((s, r) => s + r.net, 0));
  const reInTb = tbRows.find((r) => r.matchedId && r.matchedId === reAccount?.id);
  const reTbBalance = reInTb ? reInTb.net : 0;
  const reOpening = round2(reTbBalance + plNet);

  // Build update list: BS accounts with opening_balance = net; RE overridden with reOpening
  const updateList = [];
  for (const r of tbRows.filter((r) => r.isBs && r.matchedId)) {
    const opening = r.matchedId === reAccount?.id ? reOpening : r.net;
    updateList.push({ id: r.matchedId, opening_balance: opening });
  }
  // If RE exists in COA but not in TB, add it with plNet
  if (reAccount && !updateList.find((u) => u.id === reAccount.id)) {
    updateList.push({ id: reAccount.id, opening_balance: reOpening });
  }

  // Reset all COA accounts not in the update list to opening_balance = 0
  const updateIds = new Set(updateList.map((u) => u.id));
  const resetList = coaItems.filter((a) => !updateIds.has(a.id) && a.opening_balance !== 0).map((a) => ({ id: a.id }));

  let updated = 0;
  const allUpdates = [
    ...updateList.map((u) => u),
    ...resetList.map((r) => ({ id: r.id, opening_balance: 0 })),
  ];

  for (let i = 0; i < allUpdates.length; i += 50) {
    const batch = allUpdates.slice(i, i + 50);
    await withRetry(() => base44.entities.ChartOfAccount.bulkUpdate(batch), { label: "ChartOfAccount.bulkUpdate" });
    updated += batch.length;
    if (onProgress) onProgress(Math.round((Math.min(i + 50, allUpdates.length) / allUpdates.length) * 80));
    await delay(200);
  }

  // Generate opening balance journal (posted ONCE, OpeningBalance exempt from lock date)
  let journalGenerated = false;
  try {
    const res = await base44.functions.invoke("generateOpeningBalance", { dry_run: false });
    if (res?.data?.created || res?.created) journalGenerated = true;
  } catch (e) {
    // Non-fatal — the opening journal can be generated later from the wizard
  }

  if (onProgress) onProgress(100);

  return {
    new: tbRows.filter((r) => r.matchedId).length,
    updated,
    unchanged: tbRows.filter((r) => !r.matchedId).length,
    errors: 0,
    journalGenerated,
  };
}

// ── GL import (create JournalEntry records) ──────────────────────────────────

const normalizeGLDate = (val) => {
  if (!val) return undefined;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = moment(s, ["DD-MMM-YYYY", "D-MMM-YYYY", "DD/MM/YYYY", "D/M/YYYY", "YYYY-MM-DD"], true);
  if (m.isValid()) return m.format("YYYY-MM-DD");
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return s;
};

const parseGLNum = (val) => {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
};

async function importGL(parsed, { onProgress }) {
  const { headers, rows } = parsed;

  // Load COA for account mapping
  const { byCode, byName } = await loadCOAMap();

  // Load existing journal references for dedup
  const existingRefs = new Set();
  const existingJournals = await readAllPages("JournalEntry", { reference: { $regex: "^XERO-" } }, { limit: 1000, fields: ["reference"] });
  for (const je of existingJournals) {
    if (je.reference) existingRefs.add(je.reference);
  }

  // Group rows into journals
  const journalMap = new Map();
  const journalOrder = [];
  for (const row of rows) {
    let key = row.JournalID || row.journalid || row.JournalNumber || row.journalnumber || "";
    if (!key) {
      const date = normalizeGLDate(row.Date || row.JournalDate || row.date || "");
      const narration = String(row.Narration || row.Description || row.Reference || "").trim();
      key = date && narration ? `${date}||${narration}` : "";
    }
    if (!key) continue;
    if (!journalMap.has(key)) {
      journalMap.set(key, []);
      journalOrder.push(key);
    }
    journalMap.get(key).push(row);
  }

  // Build journal entries
  const toCreate = [];
  let skippedLocked = 0, skippedDup = 0, unmatchedAccounts = 0;

  for (const key of journalOrder) {
    const lines = journalMap.get(key);
    const first = lines[0];

    const date = normalizeGLDate(first.Date || first.JournalDate || first.date || "");

    // Check lock date
    if (date && await isDateLocked(date)) {
      skippedLocked++;
      continue;
    }

    // Check duplicate
    const reference = `XERO-${key}`;
    if (existingRefs.has(reference)) {
      skippedDup++;
      continue;
    }

    // Build lines
    const jeLines = [];
    let totalDebit = 0, totalCredit = 0;
    for (const line of lines) {
      const accountCode = String(line.AccountCode || line.accountcode || "").trim();
      const accountName = String(line.AccountName || line.Account || line.accountname || line.account || "").trim();
      const netAmount = parseGLNum(line.NetAmount || line.netamount);
      const debitAmount = parseGLNum(line.Debit || line.debit);
      const creditAmount = parseGLNum(line.Credit || line.credit);

      // Map account
      const account = byCode[accountCode.toLowerCase()] || (accountName ? byName[accountName.toLowerCase()] : null);
      if (!account && accountCode) unmatchedAccounts++;

      // Use Debit/Credit columns if present (Journal Report CSV), else derive from NetAmount (GL .txt)
      const debit = debitAmount > 0 ? round2(debitAmount) : (netAmount > 0 ? round2(netAmount) : 0);
      const credit = creditAmount > 0 ? round2(creditAmount) : (netAmount < 0 ? round2(Math.abs(netAmount)) : 0);

      jeLines.push({
        account_id: account?.id || null,
        account_code: accountCode,
        account_name: accountName || account?.name,
        description: String(line.Description || line.Narration || "").trim() || undefined,
        debit,
        credit,
      });
      totalDebit += debit;
      totalCredit += credit;
    }

    // Skip unbalanced journals
    if (Math.abs(totalDebit - totalCredit) > 0.01) continue;

    const narration = String(
      lines.find((r) => String(r.Narration || r.narration || "").trim())?.Narration ||
      lines.find((r) => String(r.Description || "").trim())?.Description ||
      lines.find((r) => String(r.Reference || "").trim())?.Reference ||
      `Xero Journal ${key}`
    ).trim();

    toCreate.push({
      number: `XERO-${key}`,
      date,
      narration: narration || `Xero GL import ${key}`,
      reference,
      source_type: "Manual",
      entry_type: "document",
      status: "Posted",
      posted_date: date,
      lines: jeLines,
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
    });

    existingRefs.add(reference); // prevent duplicates within the same file
  }

  // Create in small batches
  let created = 0;
  for (let i = 0; i < toCreate.length; i += 50) {
    const batch = toCreate.slice(i, i + 50);
    await withRetry(() => base44.entities.JournalEntry.bulkCreate(batch), { label: "JournalEntry.bulkCreate" });
    created += batch.length;
    if (onProgress) onProgress(Math.round((Math.min(i + 50, toCreate.length) / Math.max(toCreate.length, 1)) * 100));
    await delay(200);
  }

  return {
    new: created,
    updated: 0,
    unchanged: skippedDup + skippedLocked,
    errors: 0,
    unmatchedAccounts,
  };
}

// ── Reconciliation (reuse step 11 checks) ────────────────────────────────────

export async function runReconciliation() {
  // 1. Load all JournalEntry lines and compute balance per account
  const jeByCode = {};
  let cursor = null;
  for (;;) {
    const opts = { sort: "-created_date", limit: 500, fields: ["lines", "number"] };
    if (cursor) opts.cursor = cursor;
    const page = await withRetry(() => base44.entities.JournalEntry.filter({ status: "Posted" }, opts), { label: "JournalEntry.filter" });
    const items = page.items || [];
    for (const je of items) {
      if (!Array.isArray(je.lines)) continue;
      for (const line of je.lines) {
        const code = String(line.account_code || "").trim();
        if (!code) continue;
        const debit = Number(line.debit) || 0;
        const credit = Number(line.credit) || 0;
        if (!jeByCode[code]) jeByCode[code] = { name: line.account_name || "", balance: 0 };
        jeByCode[code].balance += debit - credit;
        if (line.account_name && !jeByCode[code].name) jeByCode[code].name = line.account_name;
      }
    }
    cursor = page.next_cursor;
    if (!cursor || page.has_more === false) break;
    await delay(120);
  }

  // 2. Load COA
  const coaResp = await withRetry(() => base44.entities.ChartOfAccount.list("-code", 10000), { label: "ChartOfAccount.list" });
  const coaArr = coaResp.items || coaResp || [];

  // 3. Load invoices and bills
  const invResp = await withRetry(() => base44.entities.Invoice.filter(
    { status: { $in: ["Awaiting Payment", "Paid"] } },
    { limit: 10000, fields: ["number", "total", "amount_paid", "status", "contact_name"] }
  ), { label: "Invoice.filter" });
  const invoices = invResp.items || invResp || [];

  const billResp = await withRetry(() => base44.entities.Bill.filter(
    { status: { $in: ["Awaiting Payment", "Paid"] } },
    { limit: 10000, fields: ["number", "total", "amount_paid", "status", "contact_name"] }
  ), { label: "Bill.filter" });
  const bills = billResp.items || billResp || [];

  // 4. Compute comparisons
  const tbDiffs = [];
  for (const acc of coaArr) {
    const code = String(acc.code || "").trim();
    if (!code) continue;
    const glMovement = jeByCode[code]?.balance || 0;
    const tbBalance = Number(acc.opening_balance) || 0;
    if (Math.abs(glMovement) > 0.01) {
      tbDiffs.push({ code, name: acc.name, type: acc.type, glBalance: glMovement, tbBalance, diff: glMovement });
    }
  }
  for (const [code, info] of Object.entries(jeByCode)) {
    if (!coaArr.find((a) => String(a.code || "").trim() === code)) {
      tbDiffs.push({ code, name: info.name, type: "—", glBalance: info.balance, tbBalance: 0, diff: info.balance });
    }
  }

  const arOutstanding = invoices
    .filter((i) => i.status === "Awaiting Payment")
    .reduce((s, i) => s + (Number(i.total) || 0) - (Number(i.amount_paid) || 0), 0);
  const apOutstanding = bills
    .filter((b) => b.status === "Awaiting Payment")
    .reduce((s, b) => s + (Number(b.total) || 0) - (Number(b.amount_paid) || 0), 0);

  const arAccounts = Object.entries(jeByCode).filter(([_, info]) => {
    const name = String(info.name || "").toLowerCase();
    return name.includes("receivable") || name.includes("deudor");
  });
  const glArBalance = arAccounts.reduce((s, [_, info]) => s + info.balance, 0);

  const apAccounts = Object.entries(jeByCode).filter(([_, info]) => {
    const name = String(info.name || "").toLowerCase();
    return name.includes("payable") || name.includes("acreedor");
  });
  const glApBalance = apAccounts.reduce((s, [_, info]) => s + info.balance, 0);

  return {
    tbDiffs: tbDiffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)),
    arOutstanding, glArBalance, arDiff: arOutstanding - glArBalance,
    apOutstanding, glApBalance, apDiff: apOutstanding - glApBalance,
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

// Dry run: near-identical contact names that need a per-case decision (merge or keep separate).
export async function findContactReviewCases(file) {
  const parsed = await readFile(file);
  const r = await importContacts("Contact", parsed, { dryRun: true });
  return r.cases || [];
}

export async function runQuickImport(planRows, fileMap, { onProgress, onFileResult, contactDecisions = {} } = {}) {
  const results = [];

  // Build context (bank accounts, conversion date)
  let ctx;
  try {
    ctx = await buildContext();
  } catch (e) {
    throw new Error(`Failed to preload context: ${e.message}`);
  }

  // Group plan rows by type; skip fully unchanged files
  const byType = {};
  for (const row of planRows) {
    if (!row.type || row.hint?.startsWith("Error:")) continue;
    const c = row.counts || {};
    if ((c.new || 0) === 0 && (c.updated || 0) === 0 && (c.unchanged || 0) > 0) continue;
    if (!byType[row.type]) byType[row.type] = [];
    byType[row.type].push(row);
  }

  // Dependency order
  const importOrder = [
    { type: "ChartOfAccount", fn: importSimpleEntity },
    { type: "Contact", fn: importContacts },
    { type: "Product", fn: importSimpleEntity },
    { type: "TaxRate", fn: importSimpleEntity },
    { type: "BankAccount", fn: importSimpleEntity },
    { type: "TrialBalance", fn: importTrialBalance },
    { type: "GeneralLedger", fn: importGL },
    { type: "Invoice", fn: importDocs },
    { type: "Bill", fn: importDocs },
    { type: "CreditNote", fn: importCreditNotes },
    { type: "PaymentsReport", fn: null }, // real payments from the AP/AR payments report, before bank linking
    { type: "BankTransaction", fn: null }, // special handling
  ];

  const parsedCache = new Map(); // fileName → parsed
  const totalSteps = importOrder.length + 2; // +2 for journal linker and reconciliation
  let currentStep = 0;

  for (const { type, fn } of importOrder) {
    currentStep++;
    if (!byType[type]) continue;

    const typeLabel = TYPE_LABELS[type] || type;
    if (onProgress) onProgress({ step: currentStep, total: totalSteps, label: typeLabel, percent: 0 });

    for (const row of byType[type]) {
      const file = fileMap.get(row.file);
      if (!file) {
        const errResult = { file: row.file, type, error: "File not found — it may have been removed." };
        results.push(errResult);
        if (onFileResult) onFileResult(errResult);
        throw new Error(`File not found: ${row.file}`);
      }

      try {
        let result;

        if (type === "BankTransaction") {
          result = await importBankTransactions(file, ctx, {
            onProgress: (p) => onProgress?.({ step: currentStep, total: totalSteps, label: typeLabel, percent: p }),
          });
        } else {
          // Parse the file (cache per file name)
          let parsed = parsedCache.get(row.file);
          if (!parsed) {
            parsed = await readFile(file);
            parsedCache.set(row.file, parsed);
          }

          if (type === "PaymentsReport") {
            result = await applyPaymentsReport(parsed, {
              onProgress: (p) => onProgress?.({ step: currentStep, total: totalSteps, label: typeLabel, percent: p }),
            });
          } else if (type === "CreditNote") {
            result = await importCreditNotes(parsed, {
              onProgress: (p) => onProgress?.({ step: currentStep, total: totalSteps, label: typeLabel, percent: p }),
            });
          } else if (fn) {
            result = await fn(type, parsed, {
              decisions: contactDecisions,
              onProgress: (p) => onProgress?.({ step: currentStep, total: totalSteps, label: typeLabel, percent: p }),
            });
          }
        }

        const fileResult = { file: row.file, type, ...result };
        results.push(fileResult);
        if (onFileResult) onFileResult(fileResult);
      } catch (e) {
        const errorResult = { file: row.file, type, error: e.message };
        results.push(errorResult);
        if (onFileResult) onFileResult(errorResult);
        throw e; // stop on first error
      }
    }
  }

  // Company types from document usage (invoice = Customer, bill = Provider, both = Both; never overrides defined types)
  try {
    const { classifyContactTypes } = await import("@/lib/contactTypeClassifier");
    const t = await classifyContactTypes({ apply: true });
    results.push({ file: "(company types)", type: "ContactType", new: 0, updated: t.changes.length, unchanged: 0, errors: 0, warnings: [`Company types set from usage: ${t.summary.customers} customers, ${t.summary.providers} providers, ${t.summary.both} both`] });
  } catch (e) { console.error("Company type classification failed", e); }

  // Journal linker
  currentStep++;
  if (onProgress) onProgress({ step: currentStep, total: totalSteps, label: "Journal Linker", percent: 0 });
  try {
    const linkResult = await linkJournalsToDocs({
      onProgress: (p) => onProgress?.({ step: currentStep, total: totalSteps, label: "Journal Linker", percent: p }),
    });
    results.push({ file: "—", type: "JournalLinker", ...linkResult });
  } catch (e) {
    // Non-fatal — journal linking can be re-run
    results.push({ file: "—", type: "JournalLinker", error: e.message });
  }

  // Reconciliation
  currentStep++;
  if (onProgress) onProgress({ step: currentStep, total: totalSteps, label: "Reconciliation", percent: 0 });
  let reconciliation = null;
  try {
    reconciliation = await runReconciliation();
  } catch (e) {
    reconciliation = { error: e.message };
  }
  if (onProgress) onProgress({ step: currentStep, total: totalSteps, label: "Reconciliation", percent: 100 });

  // Invalidate cache after import
  invalidateSdkCache();

  // Rebuild stored account balances (non-fatal)
  try { await base44.functions.invoke("rebuildAccountBalances", {}); } catch {}

  return { results, reconciliation };
}