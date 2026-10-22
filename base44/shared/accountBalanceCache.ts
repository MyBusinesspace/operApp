// @ts-nocheck
/**
 * Account-balance cache — shared logic.
 *
 * Rebuilds the AccountMonthBalance table from all Posted JournalEntry lines,
 * grouped by account_key + journal-date month, and saves a freshness stamp
 * (latest journal id|updated_date + total posted journal count) so
 * getAccountBalances can serve month-aligned periods from stored rows.
 *
 * Shared by rebuildAccountBalances (manual, admin-only) and
 * refreshAccountBalancesIfStale (scheduled — rebuilds only when the stamp is stale).
 */

async function filterWithRetry(base44, entity, query, opts, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await base44.entities[entity].filter(query, opts);
    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.statusCode === 429 ||
        String(err?.message || '').includes('rate limit') ||
        String(err?.message || '').includes('volume limit');
      if (!isRateLimit || attempt === maxRetries) throw err;
      const wait = Math.min(2000 * Math.pow(2, attempt), 10000);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

/** Current fingerprint of the posted journals: total count + newest id|updated_date. */
export async function getPostedJournalFreshness(sr) {
  const journalCount = await sr.entities.JournalEntry.count({ status: 'Posted' });

  let latestJournal = null;
  try {
    const latestPage = await sr.entities.JournalEntry.filter(
      { status: 'Posted' },
      { sort: '-updated_date', limit: 1, fields: ['id', 'updated_date'] }
    );
    latestJournal = (latestPage.items || latestPage)[0] || null;
  } catch {}

  return {
    journalCount,
    latestJournalId: latestJournal?.id || '',
    latestJournalUpdated: String(latestJournal?.updated_date || ''),
  };
}

/** Newest AccountBalanceStamp row, or null when there is none. */
export async function getLatestStamp(sr) {
  try {
    const page = await sr.entities.AccountBalanceStamp.filter({}, { sort: '-created_date', limit: 1 });
    return (page.items || page)[0] || null;
  } catch {
    return null;
  }
}

/** Same freshness rule getAccountBalances applies before serving stored balances. */
export function isStampFresh(stamp, freshness) {
  if (!stamp) return false;
  if (freshness.journalCount !== stamp.journal_count) return false;
  if (freshness.journalCount > 0) {
    if (freshness.latestJournalId !== stamp.latest_journal_id) return false;
    if (freshness.latestJournalUpdated !== String(stamp.latest_journal_updated)) return false;
  }
  return true;
}

/**
 * Rebuilds AccountMonthBalance + AccountBalanceStamp from all Posted JournalEntry lines.
 * Writes only AccountMonthBalance and AccountBalanceStamp.
 */
export async function rebuildAccountBalanceCache(sr) {
  // 1. Load COA → idToCode map (same key logic as getAccountBalances)
  const idToCode = {};
  let coaCursor = undefined;
  let coaHasMore = true;
  while (coaHasMore) {
    const coaPage = await filterWithRetry(sr, "ChartOfAccount", {}, { limit: 5000, cursor: coaCursor });
    const coaItems = coaPage.items || coaPage;
    for (const a of coaItems) {
      if (a.id && a.code) idToCode[a.id] = String(a.code).trim().toLowerCase();
    }
    coaHasMore = coaPage.has_more === true;
    coaCursor = coaPage.next_cursor;
    if (coaCursor === undefined) coaHasMore = false;
  }

  // 2. Month partitions via aggregate dateBucket (same as getAccountBalances)
  let partitions = null;
  try {
    const dateBuckets = await sr.entities.JournalEntry.aggregate({
      query: { status: 'Posted' },
      dateBucket: { field: 'date', unit: 'month' },
      sort: 'date',
      limit: 1000,
    });
    partitions = (dateBuckets.rows || []).map(r => r.date);
  } catch {
    partitions = null;
  }

  // 3. Fetch all posted journals and group by account_key + month
  const monthBalances = {}; // "accountKey|YYYY-MM" → { debit, credit, entry_count }

  async function fetchMonth(month) {
    const [year, monthNum] = month.split('-');
    const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;
    const query = { status: 'Posted', date: { $gte: monthStart, $lte: monthEnd } };
    let cursor = undefined;
    let hasMore = true;
    while (hasMore) {
      const page = await filterWithRetry(sr, "JournalEntry", query, {
        sort: '-created_date', limit: 5000, cursor, fields: ['date', 'lines'],
      });
      const items = page.items || page;
      for (const entry of items) {
        const entryMonth = entry.date ? String(entry.date).slice(0, 7) : month;
        for (const line of (entry.lines || [])) {
          let code = String(line.account_code || '').trim().toLowerCase();
          if (!code && line.account_id) {
            code = idToCode[line.account_id] || line.account_id;
          }
          if (!code) continue;
          const key = `${code}|${entryMonth}`;
          if (!monthBalances[key]) monthBalances[key] = { debit: 0, credit: 0, entry_count: 0 };
          monthBalances[key].debit += line.debit || 0;
          monthBalances[key].credit += line.credit || 0;
          monthBalances[key].entry_count += 1;
        }
      }
      hasMore = page.has_more === true;
      cursor = page.next_cursor;
      if (cursor === undefined) hasMore = false;
    }
  }

  if (partitions && partitions.length > 0) {
    const CONCURRENCY = 12;
    for (let i = 0; i < partitions.length; i += CONCURRENCY) {
      const batch = partitions.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(m => fetchMonth(m)));
    }
  } else {
    // Fallback: sequential fetch
    let cursor = undefined;
    let hasMore = true;
    while (hasMore) {
      const page = await filterWithRetry(sr, "JournalEntry", { status: 'Posted' }, {
        sort: '-created_date', limit: 5000, cursor, fields: ['date', 'lines'],
      });
      const items = page.items || page;
      for (const entry of items) {
        const entryMonth = entry.date ? String(entry.date).slice(0, 7) : 'unknown';
        for (const line of (entry.lines || [])) {
          let code = String(line.account_code || '').trim().toLowerCase();
          if (!code && line.account_id) code = idToCode[line.account_id] || line.account_id;
          if (!code) continue;
          const key = `${code}|${entryMonth}`;
          if (!monthBalances[key]) monthBalances[key] = { debit: 0, credit: 0, entry_count: 0 };
          monthBalances[key].debit += line.debit || 0;
          monthBalances[key].credit += line.credit || 0;
          monthBalances[key].entry_count += 1;
        }
      }
      hasMore = page.has_more === true;
      cursor = page.next_cursor;
      if (cursor === undefined) hasMore = false;
    }
  }

  // 4. Build records
  const records = [];
  for (const [key, vals] of Object.entries(monthBalances)) {
    const idx = key.lastIndexOf('|');
    const accountKey = key.slice(0, idx);
    const month = key.slice(idx + 1);
    records.push({
      account_key: accountKey,
      month,
      debit: Math.round(vals.debit * 100) / 100,
      credit: Math.round(vals.credit * 100) / 100,
      entry_count: vals.entry_count,
    });
  }

  // 5. Delete all existing AccountMonthBalance rows, then bulk-create
  await sr.entities.AccountMonthBalance.deleteMany({});
  for (let i = 0; i < records.length; i += 500) {
    const batch = records.slice(i, i + 500);
    await sr.entities.AccountMonthBalance.bulkCreate(batch);
  }

  // 6. Stamp: latest posted journal id|updated_date + total posted count
  const freshness = await getPostedJournalFreshness(sr);
  await sr.entities.AccountBalanceStamp.deleteMany({});
  await sr.entities.AccountBalanceStamp.create({
    latest_journal_id: freshness.latestJournalId,
    latest_journal_updated: freshness.latestJournalUpdated,
    journal_count: freshness.journalCount,
    rebuilt_at: new Date().toISOString(),
  });

  return {
    records: records.length,
    journalCount: freshness.journalCount,
    latestJournalId: freshness.latestJournalId,
  };
}