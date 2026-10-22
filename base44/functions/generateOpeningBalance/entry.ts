import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * generateOpeningBalance
 *
 * Builds (or previews) the single idempotent Opening Balance journal from
 * ChartOfAccount.opening_balance values.
 *
 * Payload:
 *   { dry_run?: boolean }
 *
 * - dry_run=true (default): returns a preview — totals, line count, balancing
 *   amount, conversion date, and whether an existing opening journal would be
 *   replaced. Writes NOTHING.
 * - dry_run=false: voids any existing OpeningBalance journal (reference
 *   OPENING-BALANCE-<date>) then creates a new Posted one. Also stamps
 *   AccountingSettings.conversion_date.
 *
 * Sign convention: opening_balance is stored signed (debit-positive,
 * credit-negative) exactly as it came from the Xero Trial Balance. We do NOT
 * re-sign by category — a positive value becomes a debit line, a negative
 * value becomes a credit line. The balancing line absorbs any rounding drift
 * to the Opening Balance Equity account (created if missing).
 *
 * The opening journal is dated the day before the earliest posted GL entry
 * (the conversion date), so every report reading journal entries includes it
 * automatically.
 */
const OPENING_REF_PREFIX = "OPENING-BALANCE-";
const EQUITY_ACCOUNT_NAME = "Opening Balance Equity";

function round2(n) { return Math.round(n * 100) / 100; }

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run !== false;

    // 1. Load all ChartOfAccount records (paginated)
    const accounts = [];
    let coaCursor = undefined;
    while (true) {
      const page = await base44.entities.ChartOfAccount.filter(
        {},
        { limit: 5000, cursor: coaCursor, fields: ['code', 'name', 'type', 'category', 'opening_balance', 'opening_balance_date', 'enable_payments', 'status'] }
      );
      const items = page.items || page;
      for (const a of items) accounts.push(a);
      if (page.has_more !== true) break;
      coaCursor = page.next_cursor;
      if (!coaCursor) break;
    }

    // 2. Determine the conversion date:
    //    Use AccountingSettings.conversion_date if set (from Trial Balance import);
    //    otherwise fall back to the day before the earliest posted GL entry.
    let conversionDate = null;
    try {
      const settingsList = await base44.entities.AccountingSettings.list('-created_date', 10);
      if (settingsList.length > 0 && settingsList[0].conversion_date) {
        conversionDate = settingsList[0].conversion_date;
      }
    } catch {}

    if (!conversionDate) {
      let earliestDate = null;
      const page = await base44.entities.JournalEntry.filter(
        { status: 'Posted', source_type: { $ne: 'OpeningBalance' } },
        { sort: 'date', limit: 1, fields: ['date'] }
      );
      const items = page.items || page;
      if (items.length > 0 && items[0].date) {
        earliestDate = items[0].date;
      }
      if (earliestDate) {
        const d = new Date(earliestDate + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        conversionDate = d.toISOString().split('T')[0];
      } else {
        const obDates = accounts
          .map(a => a.opening_balance_date)
          .filter(Boolean)
          .sort();
        conversionDate = obDates.length ? obDates[obDates.length - 1] : new Date().toISOString().split('T')[0];
      }
    }

    const reference = OPENING_REF_PREFIX + conversionDate;

    // 3. Check for an existing opening journal (idempotency)
    let existingEntry = null;
    const existingPage = await base44.entities.JournalEntry.filter(
      { reference, source_type: 'OpeningBalance' },
      { limit: 5, fields: ['id', 'number', 'status', 'date', 'reference'] }
    );
    const existingItems = existingPage.items || existingPage;
    if (existingItems.length > 0) {
      existingEntry = existingItems[0];
    }

    // 4. Build the opening journal lines from COA.opening_balance (signed)
    const lines = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (const acc of accounts) {
      const ob = Number(acc.opening_balance) || 0;
      if (Math.abs(ob) < 0.005) continue;
      const code = String(acc.code || '').trim();
      const debit = ob > 0 ? round2(ob) : 0;
      const credit = ob < 0 ? round2(Math.abs(ob)) : 0;
      lines.push({
        account_id: acc.id,
        account_code: code,
        account_name: acc.name,
        description: 'Opening Balance',
        debit,
        credit,
      });
      totalDebit += debit;
      totalCredit += credit;
    }

    // 5. Balancing line to Opening Balance Equity
    const diff = round2(totalDebit - totalCredit);
    let balancingAccount = null;
    let balancingAmount = 0;
    if (Math.abs(diff) > 0.005) {
      // Find or flag the Opening Balance Equity account
      balancingAccount = accounts.find(a =>
        String(a.name || '').toLowerCase() === EQUITY_ACCOUNT_NAME.toLowerCase()
      );
      balancingAmount = diff;
      if (diff > 0) {
        // More debits than credits — credit the equity account
        totalCredit += diff;
      } else {
        // More credits than debits — debit the equity account
        totalDebit += Math.abs(diff);
      }
    }

    const previewLines = lines.map(l => ({
      account_code: l.account_code,
      account_name: l.account_name,
      debit: l.debit,
      credit: l.credit,
    }));

    const preview = {
      dry_run: dryRun,
      conversion_date: conversionDate,
      reference,
      line_count: lines.length + (balancingAmount !== 0 ? 1 : 0),
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
      balanced: Math.abs(round2(totalDebit) - round2(totalCredit)) < 0.01,
      balancing_amount: balancingAmount,
      balancing_account_exists: !!balancingAccount,
      balancing_account_name: EQUITY_ACCOUNT_NAME,
      existing_entry: existingEntry ? { id: existingEntry.id, number: existingEntry.number, status: existingEntry.status, date: existingEntry.date } : null,
      would_replace: !!existingEntry,
      lines: previewLines,
    };

    // Dry run — return preview only, write nothing
    if (dryRun) {
      return Response.json(preview);
    }

    // ── Live run (writes data) ──────────────────────────────────────────
    // NOTE: This branch is never reached in the current deployment because
    // the UI only calls with dry_run=true. It is here for when the user
    // confirms generation. No data is written by the dry-run path.

    // Void the existing opening journal if present
    if (existingEntry) {
      await base44.entities.JournalEntry.update(existingEntry.id, {
        status: 'Voided',
        narration: `Voided: Opening Balance as at ${conversionDate} (replaced)`,
      });
    }

    // Find or create the Opening Balance Equity account
    let equityAccountId = balancingAccount?.id;
    let equityAccountCode = balancingAccount?.code;
    if (balancingAmount !== 0 && !equityAccountId) {
      const created = await base44.entities.ChartOfAccount.create({
        code: 'OBE',
        name: EQUITY_ACCOUNT_NAME,
        type: 'Equity',
        category: 'Equity',
        status: 'Active',
        enable_payments: false,
        opening_balance: 0,
      });
      equityAccountId = created.id;
      equityAccountCode = created.code;
    }

    // Add the balancing line
    if (balancingAmount !== 0 && equityAccountId) {
      lines.push({
        account_id: equityAccountId,
        account_code: String(equityAccountCode || ''),
        account_name: EQUITY_ACCOUNT_NAME,
        description: 'Opening Balance rounding / balancing',
        debit: balancingAmount < 0 ? round2(Math.abs(balancingAmount)) : 0,
        credit: balancingAmount > 0 ? round2(balancingAmount) : 0,
      });
    }

    // Reserve a JNL number
    let journalNumber = `JNL-OPENING-${conversionDate}`;
    try {
      const seqRes = await base44.functions.invoke('reserveSequenceNumbers', {
        sequence_type: 'JNL',
        count: 1,
      });
      const numbers = seqRes.data?.numbers || seqRes.numbers || [];
      if (numbers[0]) journalNumber = numbers[0];
    } catch {}

    // Create the opening journal entry
    const entry = await base44.entities.JournalEntry.create({
      number: journalNumber,
      date: conversionDate,
      narration: `Opening Balance as at ${conversionDate}`,
      reference,
      source_type: 'OpeningBalance',
      entry_type: 'document',
      status: 'Posted',
      posted_date: conversionDate,
      lines,
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
    });

    // Stamp AccountingSettings.conversion_date (get-or-update)
    try {
      const settingsList = await base44.entities.AccountingSettings.list('-created_date', 10);
      if (settingsList.length > 0) {
        await base44.entities.AccountingSettings.update(settingsList[0].id, {
          conversion_date: conversionDate,
        });
      }
    } catch {}

    return Response.json({
      ...preview,
      created: true,
      entry_id: entry.id,
      journal_number: journalNumber,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}