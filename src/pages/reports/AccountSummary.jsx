import React, { useState, useEffect, useMemo } from "react";
import BackButton from "@/components/reports/BackButton";
import { usePersistedState, useScrollRestore } from "@/lib/usePersistedState";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { format, startOfYear } from "date-fns";
import DateRangeDropdown from "@/components/reports/DateRangeDropdown";
import CompareWithDropdown from "@/components/reports/CompareWithDropdown";
import { buildComparisonPeriods } from "@/lib/comparisonPeriods";
import { getBalancesSafe } from "@/lib/accountBalancesApi";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Page through every journal in range (the old single call silently stopped at 5,000).
async function fetchAllJournals(query) {
  const items = [];
  let skip = 0;
  for (;;) {
    const pg = await base44.entities.JournalEntry.filter(query, "number", 500, skip);
    const its = pg?.items || (Array.isArray(pg) ? pg : []);
    items.push(...its);
    if (its.length < 500) break;
    skip += its.length;
  }
  return { items };
}

export default function AccountSummary() {
  const today = new Date();
  const [from, setFrom] = usePersistedState("as:from", format(startOfYear(today), "yyyy-MM-dd"));
  const [to, setTo] = usePersistedState("as:to", format(today, "yyyy-MM-dd"));
  const [comparison, setComparison] = usePersistedState("as:comparison", { type: "months", value: 4 });
  const [entries, setEntries] = useState([]);
  const [compEntries, setCompEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  useScrollRestore("as", !loading);

  const periods = useMemo(() => buildComparisonPeriods(from, to, comparison), [from, to, comparison]);
  const showCompare = periods.length > 1;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [accsPage, res] = await Promise.all([
        base44.entities.ChartOfAccount.filter({ status: "Active" }, { limit: 5000 }).catch(() => ({ items: [] })),
        getBalancesSafe({ periods: [
          { from, to },
          ...periods.slice(1).map(p => ({ from: format(p.from, "yyyy-MM-dd"), to: format(p.to, "yyyy-MM-dd") })),
        ] }).catch(() => null),
      ]);
      const pbs = res?.data?.periodBalances || [];
      setEntries(pbs[0]?.balances || {});
      setCompEntries(pbs.slice(1).map(p => p?.balances || {}));
      setAccounts(accsPage?.items || []);
      setLoading(false);
    };
    load();
  }, [from, to, periods]);

  // Server-side balances (keyed by account code, or by id when the account has no code).
  const accountsById = useMemo(() => Object.fromEntries(accounts.map(a => [a.id, a])), [accounts]);
  const computeTotals = (bal) => {
    const totals = {};
    accounts.forEach(a => {
      const b = bal[a.code] || bal[a.id];
      if (b) totals[a.id] = { debit: b.debit || 0, credit: b.credit || 0, txCount: null };
    });
    return totals;
  };

  const mainTotals = useMemo(() => computeTotals(entries), [entries, accounts]);
  const compTotalsArr = useMemo(() => compEntries.map(ce => computeTotals(ce)), [compEntries, accounts]);

  const rows = useMemo(() => {
    return accounts
      .map(a => {
        const t = mainTotals[a.id] || { debit: 0, credit: 0, txCount: 0 };
        const net = t.debit - t.credit;
        const compData = compTotalsArr.map(ct => {
          const c = ct[a.id] || { debit: 0, credit: 0 };
          return { debit: c.debit, credit: c.credit, net: c.debit - c.credit };
        });
        return { ...a, debit: t.debit, credit: t.credit, net, txCount: t.txCount, compData };
      })
      .filter(r => r.debit !== 0 || r.credit !== 0 || r.compData.some(c => c.debit !== 0 || c.credit !== 0))
      .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  }, [accounts, mainTotals, compTotalsArr]);

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Account Summary</h1>
          <p className="text-xs text-muted-foreground">Movements per chart of account for the period</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeDropdown from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <CompareWithDropdown comparison={comparison} onChange={setComparison} from={from} to={to} />
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-xs">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="px-4 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24 sticky left-0 bg-card z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">Code</th>
                <th className="px-4 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account Name</th>
                <th className="px-4 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Type</th>
                <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Entries</th>
                <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Debit</th>
                <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Credit</th>
                <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Net</th>
                {showCompare && compTotalsArr.map((_, i) => (
                  <React.Fragment key={i}>
                    <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 border-l border-border">{periods[i + 1].label} Dr</th>
                    <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">{periods[i + 1].label} Cr</th>
                    <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">{periods[i + 1].label} Net</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={7 + compTotalsArr.length * 3} className="py-12 text-center text-muted-foreground text-xs">No posted entries in this period</td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="border-b border-border hover:bg-muted/20 group">
                  <td className="px-4 py-1 text-xs font-mono text-muted-foreground sticky left-0 bg-card group-hover:bg-muted/20 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">{row.code}</td>
                  <td className="px-4 py-1 text-xs">
                    <Link to={`/reports/account-transactions?accountId=${row.id}&from=${from}&to=${to}`} className="text-primary hover:underline">{row.name}</Link>
                  </td>
                  <td className="px-4 py-1 text-xs text-muted-foreground">{row.type}</td>
                  <td className="px-4 py-1 text-right text-xs text-muted-foreground">{row.txCount ?? "—"}</td>
                  <td className="px-4 py-1 text-right text-xs font-mono tabular-nums">
                    <Link to={`/reports/account-transactions?accountId=${row.id}&from=${from}&to=${to}`} className="text-blue-600 hover:underline">{num(row.debit)}</Link>
                  </td>
                  <td className="px-4 py-1 text-right text-xs font-mono tabular-nums">
                    <Link to={`/reports/account-transactions?accountId=${row.id}&from=${from}&to=${to}`} className="text-emerald-600 hover:underline">{num(row.credit)}</Link>
                  </td>
                  <td className="px-4 py-1 text-right text-xs font-bold font-mono tabular-nums">
                    <Link to={`/reports/account-transactions?accountId=${row.id}&from=${from}&to=${to}`} className={`${row.net >= 0 ? "text-foreground" : "text-destructive"} hover:underline`}>
                      {row.net < 0 ? `(${num(Math.abs(row.net))})` : num(row.net)}
                    </Link>
                  </td>
                  {showCompare && row.compData.map((c, i) => (
                    <React.Fragment key={i}>
                      <td className="px-4 py-1 text-right text-xs font-mono tabular-nums border-l border-border">
                        {c.debit > 0 ? <span className="text-blue-600">{num(c.debit)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-1 text-right text-xs font-mono tabular-nums">
                        {c.credit > 0 ? <span className="text-emerald-600">{num(c.credit)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-1 text-right text-xs font-bold font-mono tabular-nums">
                        <span className={c.net >= 0 ? "text-foreground" : "text-destructive"}>
                          {c.net < 0 ? `(${num(Math.abs(c.net))})` : num(c.net)}
                        </span>
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}