import { base44 } from "@/api/base44Client";
import { addDaysISO } from "@/lib/dateOnly";

// Workaround for getAccountBalances: its server-side date filter drops journals dated exactly on the
// first day of the earliest period (plain date compared against a full timestamp). We prepend a
// throw-away one-day period dated the day before the earliest start, so the bound is earlier than
// any real period, and then discard that extra result.
function dayBefore(s) {
  return addDaysISO(s, -1);
}

async function getBalancesUncached(args = {}) {
  if (Array.isArray(args.periods) && args.periods.length > 0) {
    const froms = args.periods.map(p => p.from).filter(Boolean).sort();
    if (froms.length === 0) return base44.functions.invoke("getAccountBalances", args);
    const d = dayBefore(froms[0]);
    const res = await base44.functions.invoke("getAccountBalances", { ...args, periods: [{ from: d, to: d }, ...args.periods] });
    const data = res?.data || {};
    return { ...res, data: { ...data, periodBalances: (data.periodBalances || []).slice(1) } };
  }
  if (args.from_date) {
    const d = dayBefore(args.from_date);
    const res = await base44.functions.invoke("getAccountBalances", { periods: [{ from: d, to: d }, { from: args.from_date, to: args.to_date || undefined }] });
    const data = res?.data || {};
    const pb = (data.periodBalances || [])[1] || { balances: {} };
    return { ...res, data: { entryCount: data.entryCount, balances: pb.balances, fromDate: args.from_date, toDate: args.to_date || "now" } };
  }
  return base44.functions.invoke("getAccountBalances", args);
}

// ── Result cache ─────────────────────────────────────────────────────────────
// The balances function reads every journal in range on the server (about 12 s for a
// cumulative balance on 85,000 journals). Results are reused for the same request as long
// as no journal has been created or changed (checked with one cheap query).
const memCache = new Map();
const CACHE_PREFIX = "opr:bal:";

async function journalVersion() {
  try {
    const r = await base44.entities.JournalEntry.list("-updated_date", 1);
    const j = (r?.items || r || [])[0];
    return j ? `${j.id}|${j.updated_date}` : "empty";
  } catch { return null; }
}

export async function getBalancesSafe(args = {}) {
  const ver = await journalVersion();
  if (!ver) return getBalancesUncached(args);
  const key = CACHE_PREFIX + JSON.stringify(args);
  const hit = memCache.get(key) || (() => {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; }
  })();
  if (hit && hit.ver === ver) return { data: hit.data };
  const res = await getBalancesUncached(args);
  if (res?.data) {
    const entry = { ver, data: res.data };
    memCache.set(key, entry);
    try { sessionStorage.setItem(key, JSON.stringify(entry)); } catch { /* storage full: memory cache only */ }
  }
  return res;
}