// Xero payments -> document payments[] (importer module, pure functions, no data access).
//
// WHY: the Xero invoice/bill CSV has no payments, only totals. The old importer created ONE payment for the
// full total dated on the document date. The Xero "Account Transactions" report of the Accounts Payable /
// Accounts Receivable account has one line per payment applied to each document (date, amount in document
// currency and in AED, and the document reference), so payments are rebuilt from those lines.
//
// Usage: planPayments({ docs, lines, kind }) -> { updates, exceptions, stats }
//   docs  : [{ id, number, reference, contact_name, issue_date, total, currency, status, amount_paid }]
//   lines : output of parseXeroPaymentLines(rows)
//   kind  : "bill" (match on contact + number) | "invoice" (match on contact + reference, then number)
// Nothing is written here. The caller applies `updates` (after a dry run) and shows `exceptions`.

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
// Contacts get renamed in Xero over the years ("Bldg. Equip Tr" / "BLDG EquipTR"), so contact comparison ignores spaces too.
const normContact = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "");

const toNum = (s) => {
  if (typeof s === "number") return s;
  const t = String(s ?? "").replace(/,/g, "").trim();
  if (t === "" || t === "-") return 0;
  const n = parseFloat(t);
  return isFinite(n) ? n : 0;
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
export function parseXeroDate(s) {
  const t = String(s || "").trim();
  let m = t.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (m) return `${m[3]}-${String(MONTHS[m[2].toLowerCase()]).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // dd/mm/yyyy
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

// rows: array of arrays [date, source, description, reference, currency, fxDebit, fxCredit, debit, credit, ...]
// as exported by Xero Account Transactions. Only payment lines are kept.
export function parseXeroPaymentLines(rows) {
  const out = [];
  for (const r of rows) {
    const source = String(r[1] || "");
    const rcv = /receivable/i.test(source);
    const isAlloc = /(prepayment|overpayment)\s+allocation|credit note allocation/i.test(source);
    if (!/payment/i.test(source) && !isAlloc) continue; // Payment lines + prepayment/overpayment/credit note allocations
    if (/overpayment$|overpayment refund|prepayment$/i.test(source.trim())) continue;
    const date = parseXeroDate(r[0]);
    if (!date) continue;
    const currency = String(r[4] || "AED").trim() || "AED";
    const fx = isAlloc ? (rcv ? toNum(r[6]) : toNum(r[5])) : (toNum(r[5]) || toNum(r[6]));
    // allocations post a pair of lines; only the side that reduces the document balance counts (AP: debit, AR: credit)
    const aed = isAlloc ? (rcv ? toNum(r[8]) : toNum(r[7])) : (toNum(r[7]) || toNum(r[8]));
    if (isAlloc && !aed) continue;
    out.push({
      date,
      contact: String(r[2] || "").replace(/^Payment:\s*/i, "").trim(),
      reference: String(r[3] || "").trim(),
      currency,
      fx_amount: round2(Math.abs(fx)),
      aed_amount: round2(Math.abs(aed)),
      kind: /receivable/i.test(source) ? "invoice" : "bill",
    });
  }
  return out;
}

const amountOf0 = (l, d) => ((d ? d.currency : l.currency) && (d ? d.currency : l.currency) !== 'AED' ? l.fx_amount : l.aed_amount);
export function planPayments({ docs: allDocs, lines: allLines, kind = "bill" }) {
  // Documents with a zero total need no payment. Payroll bills (grouped by month) are paid from the Wages Payable account:
  // Xero shows those payments as "Wage Payable Invoice", so they are pooled and allocated in date order.
  const isPayrollDoc = (d) => kind === "bill" && /wages?\s*payable/i.test(d.contact_name || "");
  const isWageLine = (l) => normContact(l.contact) === "wagepayableinvoice";
  const docs = allDocs.filter((d) => Math.abs(Number(d.total) || 0) > 0.005 && !isPayrollDoc(d));
  const payrollDocs = allDocs.filter((d) => Math.abs(Number(d.total) || 0) > 0.005 && isPayrollDoc(d));
  const wageLines = allLines.filter((l) => (!l.kind || l.kind === kind) && isWageLine(l));
  const lines = allLines.filter((l) => !isWageLine(l));
  // Edit-distance tolerance: Xero payment lines often carry a misspelled contact ("Myriad Fasion" vs "Myriad Fashion").
  const lev = (a, b) => {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 3) return 99;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  };
  const looseContact = (a, b) => {
    if (!a || !b) return false;
    if (a === b) return true;
    const sh = a.length <= b.length ? a : b, lo = a.length <= b.length ? b : a;
    if (sh.length >= 6 && lo.startsWith(sh)) return true;
    return sh.length >= 10 && lev(a, b) <= Math.max(1, Math.floor(sh.length * 0.08));
  };
  // Canonical contact: every payment-line contact is mapped to the document contact it loosely equals (so renamed or misspelled
  // spellings of one contact fall in the same group).
  const docContacts = [...new Set(allDocs.map((d) => normContact(d.contact_name)))];
  const canonCache = new Map();
  const canon = (c) => {
    const n = normContact(c);
    if (canonCache.has(n)) return canonCache.get(n);
    let r = n;
    if (!docContacts.includes(n)) { const hit = docContacts.find((dc) => looseContact(n, dc)); if (hit) r = hit; }
    canonCache.set(n, r);
    return r;
  };
  const lineKey = (c, r) => `${canon(c)}|${normName(r)}`;
  const byKey = new Map();
  for (const l of lines) {
    if (l.kind && l.kind !== kind) continue;
    const k = lineKey(l.contact, l.reference);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(l);
  }
  const byRef = new Map();
  for (const k of byKey.keys()) { const r = k.split("|")[1]; if (!byRef.has(r)) byRef.set(r, []); byRef.get(r).push(k); }

  const claimed = new Set();
  const groups = new Map(); // key -> { docs, lines }
  const noLines = [];
  for (const d of docs) {
    const refs = kind === "invoice" ? [d.reference, d.number] : [d.number, d.reference];
    // Xero's payment description truncates / renames the contact ("Toppower General Trading" vs "... LLC"), so the contact is compared loosely
    const key = refs.map((r) => lineKey(d.contact_name, r)).find((k) => byKey.has(k) && !k.endsWith("|"))
      || refs.map((r) => (byRef.get(normName(r)) || []).find((k) => looseContact(k.split("|")[0], normContact(d.contact_name)))).find((k) => k && !k.endsWith("|"))
      // contact renamed or misspelled in Xero: accept the same reference when the payment lines add up to exactly what this document says was paid
      || refs.map((r) => (byRef.get(normName(r)) || []).find((k) => {
        if (k.endsWith("|") || claimed.has(k)) return false;
        const sum = round2(byKey.get(k).reduce((a, l) => a + amountOf0(l, d), 0));
        const tgt = round2(d.status === "Paid" ? d.total : Number(d.amount_paid) || 0);
        return tgt > 0 && Math.abs(sum - tgt) < 0.011;
      })).find((k) => k);
    if (key && !byKey.has(key)) continue;
    if (!key) { noLines.push(d); continue; }
    if (!groups.has(key)) groups.set(key, { docs: [], lines: byKey.get(key) });
    if (normContact(d.contact_name) !== key.split('|')[0] && !looseContact(key.split('|')[0], normContact(d.contact_name))) claimed.add(key);
    groups.get(key).docs.push(d);
  }
  const updates = [];
  const exceptions = [];
  const leftover = [];
  const usedKeys = new Set(groups.keys());
  for (const [k, ls0] of byKey) if (!usedKeys.has(k)) for (const l of ls0) leftover.push({ ...l, left: amountOf0(l), why: 'refnomatch' });
  const stats = { docs: docs.length, resolved: 0, partial: 0, group_shared: 0, no_lines: 0, over_allocated: 0, provisional: 0 };

  for (const g of groups.values()) {
    const ds = [...g.docs].sort((a, b) => (a.issue_date || "").localeCompare(b.issue_date || "") || String(a.number).localeCompare(String(b.number)));
    const ls = [...g.lines].sort((a, b) => a.date.localeCompare(b.date));
    // Target = what the source file says was paid (Xero InvoiceAmountPaid). Lines give the dates.
    const targetOf = (d) => round2(d.status === "Paid" ? d.total : Number(d.amount_paid) || 0);
    const remaining = new Map(ds.map((d) => [d.id, Math.min(targetOf(d), round2(d.total))]));
    const pays = new Map(ds.map((d) => [d.id, []]));
    let unallocated = 0;
    const amountOf = (l, d) => (d.currency && d.currency !== "AED" ? l.fx_amount : l.aed_amount);
    for (const l of ls) {
      let left = amountOf(l, ds[0]);
      for (const d of ds) {
        if (left <= 0.005) break;
        const room = remaining.get(d.id);
        if (room <= 0.005) continue;
        const take = round2(Math.min(room, left));
        pays.get(d.id).push({ id: `xero-${l.date}-${pays.get(d.id).length + 1}`, date: l.date, amount: take, reference: "Xero payment" });
        remaining.set(d.id, round2(room - take));
        left = round2(left - take);
      }
      unallocated = round2(unallocated + left);
      if (left > 0.005) leftover.push({ ...l, left, why: 'excess' });
    }
    if (ds.length > 1) stats.group_shared += ds.length;
    for (const d of ds) {
      const payments = pays.get(d.id);
      const target = Math.min(targetOf(d), round2(d.total));
      let paid = round2(payments.reduce((s, p) => s + p.amount, 0));
      const short = round2(target - paid);
      if (short > 0.005) {
        // Xero says more was paid than the payment lines of this reference explain (credit note, prepayment,
        // overpayment, payment recorded under another reference). Keep the amount, flag it, never invent silently.
        const last = payments.length ? payments[payments.length - 1].date : d.issue_date;
        payments.push({ id: `prov-${d.id}`, date: last, amount: short, reference: "Provisional (no matching Xero payment line)", provisional: true });
        paid = round2(paid + short);
        exceptions.push({ id: d.id, number: d.number, contact: d.contact_name, reason: "payment_lines_short_provisional", total: d.total, explained: round2(paid - short), provisional: short });
        stats.provisional += 1;
      } else stats.resolved += 1;
      const open = round2(d.total - paid);
      if (open > 0.005) stats.partial += 1;
      updates.push({ id: d.id, payments, amount_paid: paid, status: open > 0.005 ? "Awaiting Payment" : "Paid" });
    }
    if (unallocated > 0.005) {
      stats.over_allocated += 1;
      exceptions.push({ id: ds[0].id, number: ds[0].number, contact: ds[0].contact_name, reason: "payment_lines_exceed_amount_paid_in_file", unallocated });
    }
  }
  for (const d of noLines) {
    stats.no_lines += 1;
    const paidInFile = d.status === "Paid" || Number(d.amount_paid) > 0;
    if (paidInFile) {
      stats.provisional += 1;
      exceptions.push({ id: d.id, number: d.number, contact: d.contact_name, reason: "paid_in_file_but_no_payment_lines", total: d.total, amount_paid: d.amount_paid });
    }
    // no update: the document keeps the single provisional payment from the file, listed here for review
  }
  // ── Payroll: FIFO of the Wages Payable payments over the monthly payroll bills ──
  if (payrollDocs.length) {
    const ds = [...payrollDocs].sort((a, b) => (a.issue_date || "").localeCompare(b.issue_date || ""));
    const ls = [...wageLines].sort((a, b) => a.date.localeCompare(b.date));
    const room = new Map(ds.map((d) => [d.id, round2(d.total)]));
    const pays = new Map(ds.map((d) => [d.id, []]));
    for (const l of ls) {
      let left = l.aed_amount;
      for (const d of ds) {
        if (left <= 0.005) break;
        const r = room.get(d.id);
        if (r <= 0.005) continue;
        const take = round2(Math.min(r, left));
        pays.get(d.id).push({ id: `xero-${l.date}-${pays.get(d.id).length + 1}`, date: l.date, amount: take, reference: "Xero payment (Wages Payable)" });
        room.set(d.id, round2(r - take));
        left = round2(left - take);
      }
    }
    for (const d of ds) {
      const payments = pays.get(d.id);
      const paid = round2(payments.reduce((a, p) => a + p.amount, 0));
      const short = round2(d.total - paid);
      const wasPaid = d.status === "Paid" || Number(d.amount_paid) > 0;
      if (short > 0.005 && wasPaid) {
        payments.push({ id: `prov-${d.id}`, date: payments.length ? payments[payments.length - 1].date : d.issue_date, amount: short, reference: "Provisional (no matching Xero payment line)", provisional: true });
        exceptions.push({ id: d.id, number: d.number, contact: d.contact_name, reason: "payroll_rounding_provisional", total: d.total, explained: paid, provisional: short, category: "review" });
        stats.provisional += 1;
      } else stats.resolved += 1;
      const open = round2(d.total - round2(payments.reduce((a, p) => a + p.amount, 0)));
      updates.push({ id: d.id, payments, amount_paid: round2(d.total - Math.max(open, 0)), status: open > 0.005 ? "Awaiting Payment" : "Paid" });
    }
  }

  // ── Second pass on what is still unexplained ──
  const lastLine = [...lines, ...wageLines].reduce((m, l) => (l.date > m ? l.date : m), "");
  const left0 = leftover.filter((l) => l.left > 0.005);
  const nameOk = (a, b) => looseContact(normContact(a), normContact(b));
  const cur = new Map(updates.map((u) => [u.id, u]));
  const docById = new Map(docs.map((d) => [d.id, d]));
  const gone = new Set();
  for (const e of exceptions) {
    if (e.reason === "payment_lines_exceed_amount_paid_in_file" || e.category === "review" && e.reason === "payroll_rounding_provisional") continue;
    const d = docById.get(e.id);
    if (!d) continue;
    const isShort = e.reason === "payment_lines_short_provisional";
    const need = isShort ? round2(e.provisional) : round2(d.status === "Paid" ? d.total : Number(d.amount_paid) || 0);
    if (need <= 0.005) continue;
    // a) one leftover payment line with exactly the missing amount, same contact, closest date (any reference)
    const cands = left0.filter((l) => l.left > 0.005 && nameOk(l.contact, d.contact_name) && Math.abs(amountOf0(l, d) - need) < 0.011 && Math.abs(l.left - need) < 0.011);
    let how = "";
    let pay = null;
    if (cands.length) {
      const t = Date.parse(d.issue_date);
      const l = cands.sort((a, b) => Math.abs(Date.parse(a.date) - t) - Math.abs(Date.parse(b.date) - t))[0];
      l.left = 0;
      pay = { id: `xero-${l.date}-x`, date: l.date, amount: need, reference: "Xero payment (matched by amount)" };
      how = "amount";
    } else if (d.status === "Paid" && d.issue_date > lastLine) {
      // b) Xero applied a prepayment dated after the last line of the report
      pay = { id: `xero-future-${d.id}`, date: d.issue_date, amount: need, reference: "Prepayment applied (future dated)" };
      how = "future";
    }
    if (!pay) { e.category = "review"; continue; }
    gone.add(e.id);
    let u = cur.get(e.id);
    if (!u) { u = { id: d.id, payments: [], amount_paid: 0, status: d.status }; updates.push(u); cur.set(d.id, u); }
    u.payments = u.payments.filter((p) => !p.provisional);
    u.payments.push(pay);
    u.amount_paid = round2(u.payments.reduce((a, p) => a + p.amount, 0));
    u.status = round2(d.total - u.amount_paid) > 0.005 ? "Awaiting Payment" : "Paid";
    stats.provisional = Math.max(0, stats.provisional - 1);
    stats.resolved += 1;
    stats["by_" + how] = (stats["by_" + how] || 0) + 1;
  }
  const keep = exceptions.filter((e) => !gone.has(e.id));
  exceptions.length = 0;
  exceptions.push(...keep);
  // Payment lines no document explains and that belong to no group of this run: settlements of documents issued before the
  // migration cut-off (the documents are not imported). They are reported as "prior_period" so the caller can store them as
  // opening-balance settlements instead of leaving them as unexplained.
  const priorPeriod = leftover.filter((l) => l.left > 0.005 && l.why === 'refnomatch' && !wageLines.includes(l)).map((l) => ({ ...l, category: 'prior_period' }));
  stats.prior_period = priorPeriod.length;
  return { updates, exceptions, stats, leftover, priorPeriod };
}

// ── Table adapters (Quick Import reads files into { headers, rows: [{header: value}] }) ──
const lcs = (s) => String(s || "").trim().toLowerCase();

export function isPaymentsReport(parsed) {
  const headers = parsed?.headers || [];
  const src = headers.find((h) => lcs(h) === "source");
  if (!src) return false;
  let n = 0;
  for (const r of (parsed.rows || []).slice(0, 600)) {
    if (/(payable|receivable)\s+payment/i.test(String(r[src] || ""))) n++;
  }
  return n > 0;
}

export function rowsFromTable(headers, rows) {
  const find = (fn) => headers.find((h) => fn(lcs(h)));
  const cDate = find((h) => h === "date");
  const cSrc = find((h) => h === "source");
  const cDesc = find((h) => h === "description" || h === "narration");
  const cRef = find((h) => h === "reference" || h === "particulars");
  const cCur = find((h) => h === "currency");
  const debits = headers.filter((h) => lcs(h).startsWith("debit"));
  const credits = headers.filter((h) => lcs(h).startsWith("credit"));
  const isFx = (h) => /foreign|fx/.test(lcs(h));
  const fxD = debits.find(isFx), fxC = credits.find(isFx);
  const aedD = debits.find((h) => !isFx(h)), aedC = credits.find((h) => !isFx(h));
  return rows.map((r) => [r[cDate], r[cSrc], r[cDesc], r[cRef], r[cCur], fxD ? r[fxD] : "", fxC ? r[fxC] : "", aedD ? r[aedD] : "", aedC ? r[aedC] : ""]);
}

export function exceptionsToCsv(exceptions) {
  const cols = ["kind", "reason", "number", "contact", "total", "paid", "explained", "provisional", "unallocated", "id"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...exceptions.map((e) => cols.map((c) => esc(e[c])).join(","))].join("\n");
}
