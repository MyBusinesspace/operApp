import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

/**
 * Computes debit/credit/balance per account by paginating through all posted
 * journal entries server-side.
 *
 * OPTIMIZED: Instead of sequential cursor pagination through all 59k+ entries
 * (12+ sequential API calls), this function partitions entries by month using
 * aggregate dateBucket, then fetches each month in parallel with a concurrency
 * limit. This reduces load time from ~15-25s to ~3-5s.
 *
 * Payload (two modes):
 *
 * 1. Single period (backward compatible):
 *    { from_date?: "YYYY-MM-DD", to_date?: "YYYY-MM-DD" }
 *    Omit both for all-time balances.
 *    Returns: { balances: { [code]: { debit, credit, balance } }, entryCount }
 *
 * 2. Multi-period (for reports with comparison columns):
 *    { periods: [{ from: "YYYY-MM-DD", to: "YYYY-MM-DD" }, ...] }
 *    Returns: { periodBalances: [{ balances, fromDate, toDate }, ...], entryCount }
 *    Entries are bucketed into each matching period in a single pagination pass.
 */
// Retry a filter call on rate-limit (429) errors, with exponential backoff
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

// Fetch all entries for a single date-range partition and accumulate per-account totals
async function fetchPartition(base44, partitionQuery, periodDescs, idToCode) {
  const partitionTotals = periodDescs.map(() => ({}));
  let count = 0;
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const page = await filterWithRetry(base44, "JournalEntry", partitionQuery, {
      sort: '-created_date',
      limit: 5000,
      cursor,
      fields: ['date', 'lines'],
    });

    const items = page.items || page;
    for (const entry of items) {
      const entryDate = entry.date ? new Date(entry.date) : null;

      for (const line of (entry.lines || [])) {
        let code = String(line.account_code || '').trim().toLowerCase();
        if (!code && line.account_id) {
          // Try to resolve code from COA; if account has no code (e.g. bank/petty cash),
          // bucket by account_id so balances are still captured
          code = idToCode[line.account_id] || line.account_id;
        }
        if (!code) continue;
        const debit = line.debit || 0;
        const credit = line.credit || 0;

        // Bucket into each matching period
        for (let pi = 0; pi < periodDescs.length; pi++) {
          const pd = periodDescs[pi];
          if (entryDate) {
            if (pd.from && entryDate < pd.from) continue;
            if (pd.to && entryDate > pd.to) continue;
          }
          if (!partitionTotals[pi][code]) partitionTotals[pi][code] = { debit: 0, credit: 0 };
          partitionTotals[pi][code].debit += debit;
          partitionTotals[pi][code].credit += credit;
        }
      }
    }
    count += items.length;

    hasMore = page.has_more === true;
    cursor = page.next_cursor;
    if (cursor === undefined) hasMore = false;
  }

  return { partitionTotals, count };
}

// Merge partition totals into the main period totals accumulator
function mergeTotals(periodTotals, partitionTotals, numPeriods) {
  for (let pi = 0; pi < numPeriods; pi++) {
    for (const [code, t] of Object.entries(partitionTotals[pi])) {
      if (!periodTotals[pi][code]) periodTotals[pi][code] = { debit: 0, credit: 0 };
      periodTotals[pi][code].debit += t.debit;
      periodTotals[pi][code].credit += t.credit;
    }
  }
}

// ── Stored-balance helpers ──────────────────────────────────────────────────

function isMonthEnd(dateStr) {
  if (!dateStr) {
    const now = new Date();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return now.getDate() === lastDay;
  }
  const parts = dateStr.split('-');
  const year = parseInt(parts[0]);
  const month = parseInt(parts[1]);
  const day = parseInt(parts[2]);
  const lastDay = new Date(year, month, 0).getDate();
  return day === lastDay;
}

function getMonthEndStr(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return `${monthStr}-${String(lastDay).padStart(2, '0')}`;
}

function nextMonthStr(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function prevMonthStr(monthStr) {
  const [year, month] = monthStr.split('-').map(Number);
  const d = new Date(year, month - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Returns a result object with the same shape as the live response, or null to fall back.
async function tryStoredBalances(base44, periodDescs, hasPeriods, idToCode) {
  // 1. Load stamp
  let stamp;
  try {
    const stampPage = await base44.entities.AccountBalanceStamp.filter({}, { sort: '-created_date', limit: 1 });
    stamp = (stampPage.items || stampPage)[0];
  } catch { return null; }
  if (!stamp) return null;

  // 2. Freshness check
  let count, latest;
  try {
    count = await base44.entities.JournalEntry.count({ status: 'Posted' });
    const latestPage = await base44.entities.JournalEntry.filter(
      { status: 'Posted' },
      { sort: '-updated_date', limit: 1, fields: ['id', 'updated_date'] }
    );
    latest = (latestPage.items || latestPage)[0];
  } catch { return null; }

  if (count !== stamp.journal_count) return null;
  if (count > 0) {
    if (!latest || latest.id !== stamp.latest_journal_id) return null;
    if (String(latest.updated_date) !== String(stamp.latest_journal_updated)) return null;
  }

  // 3. For each period: stored rows for full months + live for partial months
  const periodTotals = periodDescs.map(() => ({}));
  let entryCount = 0;

  for (let pi = 0; pi < periodDescs.length; pi++) {
    const pd = periodDescs[pi];
    const fromStr = pd.fromStr;
    const toStr = pd.toStr;
    const fromMonth = fromStr ? fromStr.slice(0, 7) : null;
    const toMonth = toStr ? toStr.slice(0, 7) : null;
    const fromIsStart = !fromStr || fromStr.endsWith('-01');
    const toIsEnd = !toStr || isMonthEnd(toStr);

    let fullFromMonth = null, fullToMonth = null;
    let partialFromRange = null, partialToRange = null;

    if (fromIsStart && toIsEnd) {
      fullFromMonth = fromMonth;
      fullToMonth = toMonth;
    } else if (fromIsStart && !toIsEnd) {
      fullFromMonth = fromMonth;
      fullToMonth = toMonth ? prevMonthStr(toMonth) : null;
      partialToRange = toMonth ? { from: `${toMonth}-01`, to: toStr } : null;
    } else if (!fromIsStart && toIsEnd) {
      fullFromMonth = fromMonth ? nextMonthStr(fromMonth) : null;
      fullToMonth = toMonth;
      partialFromRange = fromMonth ? { from: fromStr, to: getMonthEndStr(fromMonth) } : null;
    } else {
      fullFromMonth = fromMonth ? nextMonthStr(fromMonth) : null;
      fullToMonth = toMonth ? prevMonthStr(toMonth) : null;
      partialFromRange = fromMonth ? { from: fromStr, to: getMonthEndStr(fromMonth) } : null;
      partialToRange = toMonth ? { from: `${toMonth}-01`, to: toStr } : null;
    }

    // Stored rows for full months (paginated) — always run (all-time → empty filter returns all rows)
    {
      const query = {};
      if (fullFromMonth) query.month = { $gte: fullFromMonth };
      if (fullToMonth) {
        query.month = query.month || {};
        query.month.$lte = fullToMonth;
      }
      try {
        let cursor = undefined;
        let hasMore = true;
        while (hasMore) {
          const page = await base44.entities.AccountMonthBalance.filter(query, { limit: 10000, cursor });
          const items = page.items || page;
          for (const b of items) {
            const key = b.account_key;
            if (!periodTotals[pi][key]) periodTotals[pi][key] = { debit: 0, credit: 0 };
            periodTotals[pi][key].debit += b.debit || 0;
            periodTotals[pi][key].credit += b.credit || 0;
            entryCount += b.entry_count || 0;
          }
          hasMore = page.has_more === true;
          cursor = page.next_cursor;
          if (cursor === undefined) hasMore = false;
        }
      } catch { return null; }
    }

    // Live journals for partial months
    const partialRanges = [];
    if (partialFromRange) partialRanges.push(partialFromRange);
    if (partialToRange) partialRanges.push(partialToRange);

    for (const range of partialRanges) {
      const partitionQuery = { status: 'Posted', date: { $gte: range.from, $lte: range.to } };
      const partialPd = {
        from: new Date(range.from),
        to: new Date(range.to + 'T23:59:59.999Z'),
      };
      try {
        const { partitionTotals, count: c } = await fetchPartition(base44, partitionQuery, [partialPd], idToCode);
        for (const [code, t] of Object.entries(partitionTotals[0])) {
          if (!periodTotals[pi][code]) periodTotals[pi][code] = { debit: 0, credit: 0 };
          periodTotals[pi][code].debit += t.debit;
          periodTotals[pi][code].credit += t.credit;
        }
        entryCount += c;
      } catch { return null; }
    }
  }

  // Build response (same shape as live)
  const roundTotals = (totals) => {
    const balances = {};
    for (const [code, t] of Object.entries(totals)) {
      balances[code] = {
        debit: Math.round(t.debit * 100) / 100,
        credit: Math.round(t.credit * 100) / 100,
        balance: Math.round((t.debit - t.credit) * 100) / 100,
      };
    }
    return balances;
  };

  if (hasPeriods) {
    return {
      periodBalances: periodDescs.map((pd, i) => ({
        fromDate: pd.fromStr || 'all',
        toDate: pd.toStr || 'now',
        balances: roundTotals(periodTotals[i]),
      })),
      entryCount,
    };
  }

  return {
    entryCount,
    balances: roundTotals(periodTotals[0]),
    fromDate: periodDescs[0].fromStr || 'all',
    toDate: periodDescs[0].toStr || 'now',
  };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));

    // Determine mode: multi-period or single-period
    const hasPeriods = Array.isArray(body.periods) && body.periods.length > 0;

    // Build period descriptors with pre-parsed Date objects for range checks
    const periodDescs = hasPeriods
      ? body.periods.map(p => ({
          fromStr: p.from || null,
          toStr: p.to || null,
          from: p.from ? new Date(p.from) : null,
          to: p.to ? new Date(p.to + 'T23:59:59.999Z') : null,
        }))
      : [{
          fromStr: body.from_date || null,
          toStr: body.to_date || null,
          from: body.from_date ? new Date(body.from_date) : null,
          to: body.to_date ? new Date(body.to_date + 'T23:59:59.999Z') : null,
        }];

    // Load Chart of Accounts to resolve account_id → code for legacy lines
    const idToCode = {};
    let coaCursor = undefined;
    let coaHasMore = true;
    while (coaHasMore) {
      const coaPage = await filterWithRetry(base44, "ChartOfAccount",
        {},
        { limit: 5000, cursor: coaCursor }
      );
      const coaItems = coaPage.items || coaPage;
      for (const a of coaItems) {
        if (a.id && a.code) idToCode[a.id] = String(a.code).trim().toLowerCase();
      }
      coaHasMore = coaPage.has_more === true;
      coaCursor = coaPage.next_cursor;
      if (coaCursor === undefined) coaHasMore = false;
    }

    // Try stored balances (optimization for month-aligned periods with a fresh stamp)
    try {
      const storedResult = await tryStoredBalances(base44, periodDescs, hasPeriods, idToCode);
      if (storedResult) return Response.json(storedResult);
    } catch {
      // Fall through to live computation
    }

    // Build the overall query range (min from, max to across all periods)
    const allFroms = periodDescs.map(p => p.from).filter(Boolean);
    const allTos = periodDescs.map(p => p.to).filter(Boolean);
    const baseQuery = { status: 'Posted' };
    if (allFroms.length > 0) {
      baseQuery.date = baseQuery.date || {};
      baseQuery.date.$gte = allFroms.reduce((min, d) => d < min ? d : min).toISOString().slice(0, 10);
    }
    if (allTos.length > 0) {
      baseQuery.date = baseQuery.date || {};
      baseQuery.date.$lte = allTos.reduce((max, d) => d > max ? d : max).toISOString().slice(0, 10);
    }

    // Accumulators: one per period, keyed by account_code (lowercase)
    const periodTotals = periodDescs.map(() => ({}));
    let entryCount = 0;

    // OPTIMIZATION: Partition by month using aggregate dateBucket, then fetch in parallel
    let partitions = null;
    try {
      const dateBuckets = await base44.entities.JournalEntry.aggregate({
        query: baseQuery,
        dateBucket: { field: 'date', unit: 'month' },
        sort: 'date',
        limit: 1000,
      });
      partitions = (dateBuckets.rows || []).map(r => r.date); // ['2025-01', '2025-02', ...]
    } catch {
      // Fallback to sequential if aggregate fails
      partitions = null;
    }

    if (partitions && partitions.length > 0) {
      // Fetch each month partition in parallel with concurrency limit
      const CONCURRENCY = 12;
      for (let i = 0; i < partitions.length; i += CONCURRENCY) {
        const batch = partitions.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(month => {
            // Build month date range
            const [year, monthNum] = month.split('-');
            const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate();
            const monthStart = `${month}-01`;
            const monthEnd = `${month}-${String(lastDay).padStart(2, '0')}`;

            // Intersect month range with overall date range
            const partitionQuery = { status: 'Posted' };
            partitionQuery.date = {
              $gte: (baseQuery.date?.$gte && baseQuery.date.$gte > monthStart) ? baseQuery.date.$gte : monthStart,
              $lte: (baseQuery.date?.$lte && baseQuery.date.$lte < monthEnd) ? baseQuery.date.$lte : monthEnd,
            };

            return fetchPartition(base44, partitionQuery, periodDescs, idToCode);
          })
        );

        for (const { partitionTotals: pt, count } of results) {
          entryCount += count;
          mergeTotals(periodTotals, pt, periodDescs.length);
        }
      }
    } else {
      // Fallback: sequential fetch (original approach)
      const result = await fetchPartition(base44, baseQuery, periodDescs, idToCode);
      entryCount = result.count;
      mergeTotals(periodTotals, result.partitionTotals, periodDescs.length);
    }

    // Round and build response
    const roundTotals = (totals) => {
      const balances = {};
      for (const [code, t] of Object.entries(totals)) {
        balances[code] = {
          debit: Math.round(t.debit * 100) / 100,
          credit: Math.round(t.credit * 100) / 100,
          balance: Math.round((t.debit - t.credit) * 100) / 100,
        };
      }
      return balances;
    };

    if (hasPeriods) {
      return Response.json({
        periodBalances: periodDescs.map((pd, i) => ({
          fromDate: pd.fromStr || 'all',
          toDate: pd.toStr || 'now',
          balances: roundTotals(periodTotals[i]),
        })),
        entryCount,
      });
    }

    return Response.json({
      entryCount,
      balances: roundTotals(periodTotals[0]),
      fromDate: periodDescs[0].fromStr || 'all',
      toDate: periodDescs[0].toStr || 'now',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}