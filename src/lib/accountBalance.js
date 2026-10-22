import { startOfYear } from "date-fns";

/**
 * Normal balance side per account category.
 * Debit-normal: Assets, Expenses.
 * Credit-normal: Liabilities, Equity, Revenue.
 */
const DEBIT_NORMAL = new Set(["Assets", "Expenses"]);

/**
 * Compute the YTD balance for each account from posted journal entries.
 *
 * Opening balances are posted to the GL as a single OpeningBalance journal
 * (source_type "OpeningBalance", dated the conversion date). When that journal
 * exists, it is included in `entries` and the balance is movement-only — we do
 * NOT add opening_balance again (that would double-count).
 *
 * When no OpeningBalance journal exists yet (pre-generation state), we fall
 * back to adding the COA opening_balance manually so balances are still
 * correct during the transition.
 *
 * @param {Array} accounts  - ChartOfAccount records (with id, code, category, opening_balance)
 * @param {Array} entries   - Posted JournalEntry records (with lines[].account_id/account_code/debit/credit)
 * @param {Object} opts     - { fromDate, toDate, hasOpeningJournal } optional date window + opening-journal flag
 * @returns {Object} map of account_id -> { balance, debit, credit }
 */
import { parseDateOnly } from "@/lib/dateOnly";

export function computeAccountBalances(accounts, entries, opts = {}) {
  const today = new Date();
  const fromDate = opts.fromDate ? parseDateOnly(opts.fromDate) : startOfYear(today);
  const toDate = opts.toDate ? parseDateOnly(opts.toDate) : today;
  toDate.setHours(23, 59, 59, 999);

  // Detect whether the entries include an OpeningBalance journal.
  // If the caller already passed hasOpeningJournal, trust it; otherwise scan.
  const hasOpeningJournal = opts.hasOpeningJournal !== undefined
    ? opts.hasOpeningJournal
    : entries.some(e => e.source_type === "OpeningBalance");

  // Build lookups: by id and by code (for stale account_id fallback)
  const accountById = {};
  const accountByCode = {};
  accounts.forEach((a) => {
    accountById[a.id] = a;
    if (a.code) accountByCode[String(a.code).trim().toLowerCase()] = a;
  });

  const inRange = entries.filter((e) => {
    if (!e.date) return false;
    const d = parseDateOnly(e.date);
    return d >= fromDate && d <= toDate;
  });

  const totals = {};
  inRange.forEach((entry) => {
    (entry.lines || []).forEach((line) => {
      // Resolve the account: try account_id first, then fall back to account_code
      let acc = line.account_id ? accountById[line.account_id] : null;
      if (!acc && line.account_code) {
        acc = accountByCode[String(line.account_code).trim().toLowerCase()];
      }
      if (!acc) return; // skip lines that can't be matched to any account
      if (!totals[acc.id]) totals[acc.id] = { debit: 0, credit: 0 };
      totals[acc.id].debit += line.debit || 0;
      totals[acc.id].credit += line.credit || 0;
    });
  });

  const result = {};
  accounts.forEach((a) => {
    const t = totals[a.id] || { debit: 0, credit: 0 };
    const isDebitNormal = DEBIT_NORMAL.has(a.category);
    const movement = isDebitNormal ? t.debit - t.credit : t.credit - t.debit;
    // Only add the chart opening_balance when no OpeningBalance journal exists
    // in the GL — once it exists, the opening is already in `movement`.
    const opening = hasOpeningJournal ? 0 : (a.opening_balance || 0);
    result[a.id] = {
      debit: t.debit,
      credit: t.credit,
      balance: opening + movement,
    };
  });
  return result;
}

/**
 * Format a balance for display, Xero-style:
 *  - negatives in parentheses: (37,624.00)
 *  - zero as "0.00"
 */
export function formatBalance(amount) {
  const n = amount || 0;
  const abs = Math.abs(n).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${abs})` : abs;
}