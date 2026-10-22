import moment from "moment";
import { base44 } from "@/api/base44Client";
import { withRetry, delay, readAllPages, sdkCache } from "@/lib/sdkRetry";

// Xero "Account Transactions" Source values → BankTransaction.source_type enum
export const XERO_SOURCE_TYPE_MAP = {
  "RECEIVABLE PAYMENT": "Invoice",
  "PAYABLE PAYMENT": "Bill",
  "SPEND MONEY": "Manual",
  "RECEIVE MONEY": "Manual",
  "TRANSFER": "Transfer",
  "EXPENSE CLAIM PAYMENT": "Bill",
};

export const mapSourceType = (raw) => {
  const key = String(raw || "").trim().toUpperCase();
  return XERO_SOURCE_TYPE_MAP[key] || "Manual";
};

// Day-first date normalization — avoids US-locale MM/DD bias.
export const normalizeDate = (val) => {
  if (!val) return undefined;
  if (val instanceof Date && !isNaN(val)) {
    return moment(val).format("YYYY-MM-DD");
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const m = moment(s, ["DD MMM YYYY", "D MMM YYYY", "DD-MMM-YYYY", "D-MMM-YYYY", "DD/MM/YYYY", "D/M/YYYY", "YYYY-MM-DD"], true);
  if (m.isValid()) return m.format("YYYY-MM-DD");
  // Excel serial date (days since 1899-12-30)
  const serial = Number(s);
  if (!isNaN(serial) && serial > 30000 && serial < 80000) {
    const d = moment("1899-12-30").add(serial, "days");
    if (d.isValid()) return d.format("YYYY-MM-DD");
  }
  return s;
};

const parseNum = (val) => {
  if (val === undefined || val === null || val === "") return 0;
  const s = String(val).trim();
  const isNeg = s.startsWith("(") && s.endsWith(")");
  const clean = s.replace(/[(),]/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : (isNeg ? -Math.abs(n) : n);
};

const parseCSVLine = (line) => {
  const result = []; let current = ""; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') { if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = false; }
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { result.push(current.trim()); current = ""; }
      else current += ch;
    }
  }
  result.push(current.trim());
  return result;
};

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const a1 = lines.length ? (parseCSVLine(lines[0])[0] || "").trim() : "";
  let headerIdx = 0;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    if ((parseCSVLine(lines[i])[0] || "").trim().toLowerCase() === "date") { headerIdx = i; break; }
  }
  const headers = parseCSVLine(lines[headerIdx]).map(h => h.replace(/^\*+/, "").trim());
  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.every(v => v === "")) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
    rows.push(obj);
  }
  return { headers, rows, a1 };
};

const parseXLSX = async (file) => {
  const XLSX = await import("xlsx");
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const jsonRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
  const a1 = jsonRows.length ? String(jsonRows[0]?.[0] || "").trim() : "";
  let headerIdx = 0;
  for (let i = 0; i < Math.min(jsonRows.length, 20); i++) {
    if (String(jsonRows[i]?.[0] || "").trim().toLowerCase() === "date") { headerIdx = i; break; }
  }
  const headerRow = jsonRows[headerIdx] || [];
  const headers = headerRow.map(h => String(h || "").trim());
  const rows = [];
  for (let i = headerIdx + 1; i < jsonRows.length; i++) {
    const row = jsonRows[i] || [];
    const obj = {};
    headers.forEach((h, idx) => { if (h) obj[h] = row[idx] !== undefined ? row[idx] : ""; });
    rows.push(obj);
  }
  return { headers, rows, a1 };
};

// Find a column by candidate names (exact first, then substring), case-insensitive
const findCol = (headers, names) => {
  for (const name of names) {
    const found = headers.find(h => h.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  for (const name of names) {
    const found = headers.find(h => h.toLowerCase().includes(name.toLowerCase()));
    if (found) return found;
  }
  return null;
};

// Build a normalized transaction row from a parsed CSV/XLSX row.
// Returns null for non-transaction rows; { isClosingBalance, closingBalance } for the closing row.
export const buildTxRow = (row, headers) => {
  const dateCol = findCol(headers, ["Date"]);
  const sourceCol = findCol(headers, ["Source"]);
  const descCol = findCol(headers, ["Description", "Narration"]);
  const refCol = findCol(headers, ["Reference", "Particulars"]);
  const debitAedCol = findCol(headers, ["Debit (AED)", "Debit(AED)", "Debit AED"]);
  const creditAedCol = findCol(headers, ["Credit (AED)", "Credit(AED)", "Credit AED"]);
  const runningCol = findCol(headers, ["Running Balance", "RunningBalance", "Running"]);

  const dateRaw = String(row[dateCol] || "").trim();
  const lower = dateRaw.toLowerCase();
  if (lower === "closing balance") {
    const debit = debitAedCol ? parseNum(row[debitAedCol]) : 0;
    const credit = creditAedCol ? parseNum(row[creditAedCol]) : 0;
    const dc = debit - credit;
    // Xero exports 0 in Running Balance for this report — use Debit-Credit, fall back to Running only if DC is 0
    const closingBalance = dc !== 0 ? dc : (runningCol ? parseNum(row[runningCol]) : dc);
    return { isClosingBalance: true, closingBalance };
  }
  if (lower === "opening balance") {
    const debit = debitAedCol ? parseNum(row[debitAedCol]) : 0;
    const credit = creditAedCol ? parseNum(row[creditAedCol]) : 0;
    const dc = debit - credit;
    const openingBalance = dc !== 0 ? dc : (runningCol ? parseNum(row[runningCol]) : dc);
    return { isOpeningBalance: true, openingBalance };
  }
  if (!dateRaw || lower === "total" || lower.includes("total")) return null;

  const date = normalizeDate(dateRaw);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const debitAed = debitAedCol ? parseNum(row[debitAedCol]) : 0;
  const creditAed = creditAedCol ? parseNum(row[creditAedCol]) : 0;
  const net = debitAed - creditAed; // positive = money in (debit for a bank account)
  const amount = Math.abs(net);
  if (amount === 0) return null;

  const source = sourceCol ? String(row[sourceCol] || "").trim() : "";
  return {
    date,
    source,
    sourceType: mapSourceType(source),
    type: net >= 0 ? "Receive Money" : "Spend Money",
    amount,
    reference: refCol ? String(row[refCol] || "").trim() : "",
    description: descCol ? String(row[descCol] || "").trim() : "",
    runningBalance: runningCol ? parseNum(row[runningCol]) : null,
  };
};

// Main parse entry: accepts File (CSV or XLSX), returns { txRows, closingBalance, headers }
export const parseXeroAccountTransactions = async (file) => {
  const lower = file.name.toLowerCase();
  let parsed;
  if (lower.endsWith(".csv")) parsed = parseCSV(await file.text());
  else if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) parsed = await parseXLSX(file);
  else throw new Error("Please upload a CSV (.csv) or Excel (.xlsx) file");

  const { headers, rows, a1 } = parsed;
  const txRows = [];
  let closingBalance = null;
  let openingBalance = null;
  for (const row of rows) {
    const built = buildTxRow(row, headers);
    if (!built) continue;
    if (built.isClosingBalance) { closingBalance = built.closingBalance; continue; }
    if (built.isOpeningBalance) { openingBalance = built.openingBalance; continue; }
    txRows.push(built);
  }
  return { txRows, closingBalance, openingBalance, headers, detectedAccountName: a1 || "" };
};

// Normalise an account name from a Xero title cell: trim, collapse spaces, lowercase,
// strip a trailing "transactions" suffix (e.g. "Main Petty cash  Transactions" -> "main petty cash").
export const normalizeAccountName = (raw) => {
  if (!raw) return "";
  let s = String(raw).trim().replace(/\s+/g, " ").toLowerCase();
  s = s.replace(/\s*transactions\s*$/i, "").trim();
  return s;
};

// Detect the matching BankAccount from a raw title-cell account name.
// Exact normalised match first, then startsWith, then contains — only when exactly
// one candidate matches. Returns { match: BankAccount|null, ambiguous: boolean }.
export const detectBankAccount = (rawName, bankAccounts) => {
  const norm = normalizeAccountName(rawName);
  if (!norm || !Array.isArray(bankAccounts) || !bankAccounts.length) return { match: null, ambiguous: false };
  const active = bankAccounts.filter(b => b.status !== "Archived" && b.status !== "Inactive");
  const normOf = (b) => normalizeAccountName(b.name);
  // 1. exact normalised match
  let exact = active.filter(b => normOf(b) === norm);
  if (exact.length === 1) return { match: exact[0], ambiguous: false };
  if (exact.length > 1) return { match: null, ambiguous: true };
  // 2. startsWith (either direction)
  let starts = active.filter(b => { const bn = normOf(b); return bn && (bn.startsWith(norm) || norm.startsWith(bn)); });
  if (starts.length === 1) return { match: starts[0], ambiguous: false };
  if (starts.length > 1) return { match: null, ambiguous: true };
  // 3. contains (either direction)
  let contains = active.filter(b => { const bn = normOf(b); return bn && (bn.includes(norm) || norm.includes(bn)); });
  if (contains.length === 1) return { match: contains[0], ambiguous: false };
  if (contains.length > 1) return { match: null, ambiguous: true };
  return { match: null, ambiguous: false };
};

// Dedup key: bank_account_id + date + description + reference + debit + credit.
// Debit/credit encode direction (equivalent to amount+type) so identical rows
// with the same direction share a key. Dedup is occurrence-aware (multiset):
// see loadExistingDedupCounts + the import loop in BankTransactionMigrationStep.
export const dedupKey = (tx) => {
  const amt = Number(tx.amount) || 0;
  const isReceive = (tx.type || "") === "Receive Money";
  const debit = isReceive ? amt : 0;
  const credit = isReceive ? 0 : amt;
  return `${tx.bank_account_id}|${tx.date}|${(tx.description || "").toLowerCase()}|${(tx.reference || "").toLowerCase()}|${debit}|${credit}`;
};

// Load existing dedup key counts for a bank account (paginated).
// Returns Map<key, count> — a multiset of existing transactions, so repeated
// legitimate rows in the file are matched occurrence-for-occurrence rather
// than collapsed by a Set.
export const loadExistingDedupCounts = async (bankAccountId) => {
  if (sdkCache.bankTxDedup[bankAccountId]) return sdkCache.bankTxDedup[bankAccountId];
  const counts = new Map();
  let cursor = null;
  for (;;) {
    const opts = { limit: 1000, fields: ["date", "amount", "type", "reference", "description"] };
    if (cursor) opts.cursor = cursor;
    const page = await withRetry(() => base44.entities.BankTransaction.filter(
      { bank_account_id: bankAccountId }, opts
    ), { label: "BankTransaction.filter" });
    const items = page.items || (Array.isArray(page) ? page : []);
    if (!items.length) break;
    for (const tx of items) {
      const key = dedupKey({ ...tx, bank_account_id: bankAccountId });
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    cursor = page.next_cursor;
    if (!cursor || page.has_more === false) break;
    await delay(120);
  }
  sdkCache.bankTxDedup[bankAccountId] = counts;
  return counts;
};

// Load existing BankTransactions as a Map<dedupKey, record[]> (paginated, multiset).
// Used to resolve already-imported duplicate rows so their payments can still be linked.
// Multiple records may share a key (legitimate repeats), so the value is an array.
export const loadExistingTxMap = async (bankAccountId) => {
  if (sdkCache.bankTxMap[bankAccountId]) return sdkCache.bankTxMap[bankAccountId];
  const map = new Map();
  let cursor = null;
  for (;;) {
    const opts = { limit: 1000, fields: ["date", "amount", "type", "reference", "description", "source_type"] };
    if (cursor) opts.cursor = cursor;
    const page = await withRetry(() => base44.entities.BankTransaction.filter(
      { bank_account_id: bankAccountId }, opts
    ), { label: "BankTransaction.filter" });
    const items = page.items || (Array.isArray(page) ? page : []);
    if (!items.length) break;
    for (const tx of items) {
      const record = { ...tx, bank_account_id: bankAccountId };
      const key = dedupKey(record);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(record);
    }
    cursor = page.next_cursor;
    if (!cursor || page.has_more === false) break;
    await delay(120);
  }
  sdkCache.bankTxMap[bankAccountId] = map;
  return map;
};

export const loadConversionDate = async () => {
  if (sdkCache.conversionDateLoaded) return sdkCache.conversionDate;
  const page = await withRetry(() => base44.entities.AccountingSettings.filter({}, { sort: "-created_date", limit: 10 }), { label: "AccountingSettings.filter" });
  const arr = page.items || (Array.isArray(page) ? page : []);
  const cd = arr[0]?.conversion_date || null;
  sdkCache.conversionDate = cd;
  sdkCache.conversionDateLoaded = true;
  return cd;
};

export const loadDocMaps = async () => {
  if (sdkCache.docMaps) return sdkCache.docMaps;
  // Read bills and invoices SEQUENTIALLY (not parallel) to avoid rate-limit bursts.
  const billArr = await readAllPages("Bill", {}, {
    limit: 1000,
    fields: ["number", "contact_id", "contact_name", "status", "amount_paid", "due_date", "payments", "reference", "notes"],
  });
  const invArr = await readAllPages("Invoice", {}, {
    limit: 1000,
    fields: ["number", "contact_id", "contact_name", "status", "amount_paid", "due_date", "payments", "reference", "notes"],
  });
  const billByNumber = {};
  for (const b of billArr) if (b.number) billByNumber[b.number.toUpperCase().trim()] = b;
  const invoiceByNumber = {};
  for (const i of invArr) if (i.number) invoiceByNumber[i.number.toUpperCase().trim()] = i;
  const docMaps = { billByNumber, invoiceByNumber, bills: billArr, invoices: invArr };
  sdkCache.docMaps = docMaps;
  return docMaps;
};

// Enrich a txRow with doc linkage fields (source_id, source_number, contact_id, contact_name)
export const enrichWithDoc = (tx, docMaps) => {
  if (!tx.reference) return tx;
  const refUpper = tx.reference.toUpperCase().trim();
  let doc = null;
  if (tx.sourceType === "Invoice") doc = docMaps.invoiceByNumber[refUpper];
  else if (tx.sourceType === "Bill") doc = docMaps.billByNumber[refUpper];
  else doc = docMaps.invoiceByNumber[refUpper] || docMaps.billByNumber[refUpper];
  if (!doc) return tx;
  return {
    ...tx,
    source_id: doc.id,
    source_number: doc.number || tx.reference,
    contact_id: doc.contact_id || null,
    contact_name: doc.contact_name || null,
  };
};

// Direction rule: Invoices may link only to Receive Money (credit/received side);
// Bills only to Spend Money (debit/spent side); Transfers never link to documents.
// Credit-note refunds are excluded (they are not invoices here).
const directionMatches = (docEntity, txType) => {
  if (!txType || txType === "Transfer") return false;
  if (docEntity === "Invoice") return txType === "Receive Money";
  if (docEntity === "Bill") return txType === "Spend Money" || txType === "Batch Payment";
  return false;
};

// Build a set of bank_transaction_ids already referenced by any invoice or bill payment.
// Used to prevent cross-linking: a bank tx already claimed by one document's payment
// must not be linked to another document.
const buildClaimedBtIdSet = (invoices, bills) => {
  const claimed = new Set();
  for (const inv of invoices || []) {
    for (const p of (Array.isArray(inv.payments) ? inv.payments : [])) {
      if (p.bank_transaction_id) claimed.add(p.bank_transaction_id);
    }
  }
  for (const b of bills || []) {
    for (const p of (Array.isArray(b.payments) ? b.payments : [])) {
      if (p.bank_transaction_id) claimed.add(p.bank_transaction_id);
    }
  }
  return claimed;
};

// Link BankTransactions to existing payments[] entries on their docs.
// Updates the payment entry in-place (sets bank_account_id, bank_account_name, bank_transaction_id).
// One-to-one: each payment entry used once. Never pushes a new payment, never creates BankTransactions or journals.
// Idempotent: skips payments already linked (bank_transaction_id set).
//
// Ordered matching rules (applied in order):
//   1. Direction — Invoices may link only to Receive Money bank txs; Bills only to
//      Spend Money (or Batch Payment); Transfers never link to any document.
//   2. Reference first — match the invoice/bill number found in the bank tx
//      Reference field against the document number.
//   3. Never reuse a claimed bank row — a bank tx already linked to any document's
//      payment (bank_transaction_id set anywhere) is off-limits.
//   4. Fallback by contact + amount + date — only among unclaimed candidates of
//      the correct direction; link only when exactly one candidate matches.
//   5. Anything still ambiguous goes to a review list — nothing is guessed.
//
// The amount+date fallback is strict: links only when exactly ONE candidate matches;
// multiple matches are counted as ambiguous and left unlinked.
// Returns { linked, unlinked, ambiguous }.
export const linkPaymentsToDocs = async (txs, docMaps, bankAccount) => {
  const { invoiceByNumber, billByNumber, bills, invoices } = docMaps;
  const usedByDoc = new Map(); // docId -> Set of payment indices used
  const docUpdates = new Map(); // docId -> { doc, docEntity, changes: Map<idx, txId> }
  // Cross-link guard: bank txs already referenced by any document's payment are off-limits.
  const claimedBtIds = buildClaimedBtIdSet(invoices, bills);
  let linked = 0;
  let unlinked = 0;
  let ambiguous = 0;

  // Flat index of all unlinked payments — used as fallback when reference number doesn't match
  const paymentIndex = [];
  for (const b of bills || []) {
    const ps = Array.isArray(b.payments) ? b.payments : [];
    for (let i = 0; i < ps.length; i++) if (!ps[i].bank_transaction_id) paymentIndex.push({ doc: b, docEntity: "Bill", idx: i, payment: ps[i] });
  }
  for (const inv of invoices || []) {
    const ps = Array.isArray(inv.payments) ? inv.payments : [];
    for (let i = 0; i < ps.length; i++) if (!ps[i].bank_transaction_id) paymentIndex.push({ doc: inv, docEntity: "Invoice", idx: i, payment: ps[i] });
  }

  const tryMatch = (doc, docEntity, tx) => {
    const used = usedByDoc.get(doc.id) || new Set();
    const payments = Array.isArray(doc.payments) ? doc.payments : [];
    for (let i = 0; i < payments.length; i++) {
      if (used.has(i)) continue;
      if (payments[i].bank_transaction_id) continue;
      if (Math.abs((payments[i].amount || 0) - tx.amount) > 0.01) continue;
      if (!payments[i].date) continue;
      // Imported payments carry the invoice date as a placeholder (Xero's invoice export has no payment date),
      // so the real date is the bank transaction date: skip the date check for them (reference + exact amount still required).
      const placeholder = payments[i].reference === "Imported from Xero" && payments[i].date === (doc.issue_date || "").slice(0, 10);
      if (!placeholder && Math.abs(moment(payments[i].date).diff(moment(tx.date), "days")) > 1) continue;
      return { doc, docEntity, idx: i };
    }
    return null;
  };

  for (const tx of txs) {
    // 1. Try to find the doc by reference number
    let match = null;
    let isAmbiguous = false;
    if (tx.reference) {
      const refUpper = tx.reference.toUpperCase().trim();
      let doc = null;
      let docEntity = null;
      if (tx.source_type === "Invoice") { doc = invoiceByNumber[refUpper]; docEntity = doc ? "Invoice" : null; }
      else if (tx.source_type === "Bill") { doc = billByNumber[refUpper]; docEntity = doc ? "Bill" : null; }
      else { doc = invoiceByNumber[refUpper] || billByNumber[refUpper]; docEntity = invoiceByNumber[refUpper] ? "Invoice" : (billByNumber[refUpper] ? "Bill" : null); }
      if (doc && docEntity) {
        // Direction rule: Invoices ↔ Receive Money, Bills ↔ Spend Money, Transfers never link
        if (!directionMatches(docEntity, tx.type)) {
          // Direction mismatch — skip
        }
        // Cross-link guard: don't link if the bank tx is already referenced by another document's payment
        else if (claimedBtIds.has(tx.id)) {
          // Bank tx already claimed by another document's payment — skip
        }
        // Cross-link guard: don't link if the bank tx source_id points to a DIFFERENT document
        else if (tx.source_id && tx.source_id !== doc.id) {
          // Bank tx belongs to a different doc — skip to avoid cross-link
        } else {
          match = tryMatch(doc, docEntity, tx);
        }
      }
    }

    // 2. Fallback: scan all docs' unlinked payments by amount ±0.01 and date ±1 day.
    //    Only among UNCLAIMED bank txs (no source_id/source_number already set).
    //    Strict: link only if exactly one candidate matches; multiple → ambiguous.
    if (!match) {
      const txAlreadyClaimed = !!(tx.source_id || tx.source_number) || claimedBtIds.has(tx.id);
      if (!txAlreadyClaimed) {
        const candidates = paymentIndex.filter(p => {
          // Direction rule: only match docs whose type is compatible with the tx direction
          if (!directionMatches(p.docEntity, tx.type)) return false;
          const used = usedByDoc.get(p.doc.id);
          if (used && used.has(p.idx)) return false;
          if (Math.abs((p.payment.amount || 0) - tx.amount) > 0.01) return false;
          if (!p.payment.date) return false;
          return Math.abs(moment(p.payment.date).diff(moment(tx.date), "days")) <= 1;
        });
        if (candidates.length === 1) match = candidates[0];
        else if (candidates.length > 1) isAmbiguous = true;
      }
    }

    if (match) {
      const used = usedByDoc.get(match.doc.id) || new Set();
      used.add(match.idx);
      usedByDoc.set(match.doc.id, used);
      if (!docUpdates.has(match.doc.id)) docUpdates.set(match.doc.id, { doc: match.doc, docEntity: match.docEntity, changes: new Map() });
      docUpdates.get(match.doc.id).changes.set(match.idx, { id: tx.id, date: tx.date });
      linked++;
    } else if (isAmbiguous) {
      ambiguous++;
    } else {
      unlinked++;
    }
  }

  for (const { doc, docEntity, changes } of docUpdates.values()) {
    const payments = (Array.isArray(doc.payments) ? doc.payments : []).map((p, i) => {
      const ch = changes.get(i);
      if (!ch) return p;
      // Real payment date = bank transaction date (replaces the placeholder invoice date)
      const realDate = ch.date ? String(ch.date).slice(0, 10) : p.date;
      return { ...p, date: realDate, bank_account_id: bankAccount.id, bank_account_name: bankAccount.name, bank_transaction_id: ch.id };
    });
    try { await base44.entities[docEntity].update(doc.id, { payments }); }
    catch { /* count as unlinked on failure */ }
  }
  return { linked, unlinked, ambiguous };
};