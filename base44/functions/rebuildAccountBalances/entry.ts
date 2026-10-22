import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { rebuildAccountBalanceCache } from '../../shared/accountBalanceCache.ts';

/**
 * Rebuilds the AccountMonthBalance table from all Posted JournalEntry lines,
 * grouped by account_key + journal-date month. Also saves a freshness stamp
 * (latest journal id|updated_date + total posted journal count) so
 * getAccountBalances can serve month-aligned periods from stored rows.
 *
 * Admin-only. Uses service-role for bulk delete/create.
 * The rebuild itself lives in shared/accountBalanceCache.ts (also used by the
 * scheduled refreshAccountBalancesIfStale).
 */
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const result = await rebuildAccountBalanceCache(base44.asServiceRole);

    return Response.json({
      success: true,
      records: result.records,
      journal_count: result.journalCount,
      latest_journal_id: result.latestJournalId,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}