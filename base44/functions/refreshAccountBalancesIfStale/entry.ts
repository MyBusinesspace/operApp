// refreshAccountBalancesIfStale — scheduled cache refresh for stored account balances.
//
// Compares the current posted-journal fingerprint (total Posted JournalEntry count +
// newest posted journal id|updated_date) with the AccountBalanceStamp, using the same
// freshness rule getAccountBalances applies before serving stored balances. Only when
// they differ does it rebuild AccountMonthBalance + AccountBalanceStamp (the same work
// as rebuildAccountBalances). When they match it does nothing.
//
// Writes only AccountMonthBalance and AccountBalanceStamp.
// Admin-only: it is called by the schedule and its URL is public.
// @ts-nocheck

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  getPostedJournalFreshness,
  getLatestStamp,
  isStampFresh,
  rebuildAccountBalanceCache,
} from '../../shared/accountBalanceCache.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const sr = base44.asServiceRole;

    const freshness = await getPostedJournalFreshness(sr);
    const stamp = await getLatestStamp(sr);

    if (isStampFresh(stamp, freshness)) {
      return Response.json({
        refreshed: false,
        reason: 'cache is current',
        journal_count: freshness.journalCount,
        latest_journal_id: freshness.latestJournalId,
      });
    }

    const result = await rebuildAccountBalanceCache(sr);

    return Response.json({
      refreshed: true,
      records: result.records,
      journal_count: result.journalCount,
      latest_journal_id: result.latestJournalId,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}