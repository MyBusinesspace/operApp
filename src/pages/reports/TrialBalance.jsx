import React, { useState, useEffect, useMemo } from "react";
import BackButton from "@/components/reports/BackButton";
import { usePersistedState, useScrollRestore } from "@/lib/usePersistedState";
import { getBalancesSafe } from "@/lib/accountBalancesApi";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { format, startOfYear, endOfMonth } from "date-fns";
import DateRangeDropdown from "@/components/reports/DateRangeDropdown";
import CompareWithDropdown from "@/components/reports/CompareWithDropdown";
import CommonFormatsMenu, { rangeFormats } from "@/components/reports/CommonFormatsMenu";
import { buildComparisonPeriods, periodToArgs } from "@/lib/comparisonPeriods";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function TrialBalance() {
  const today = new Date();
  const [from, setFrom] = usePersistedState("tb:from", format(startOfYear(today), "yyyy-MM-dd"));
  const [to, setTo] = usePersistedState("tb:to", format(today, "yyyy-MM-dd"));
  const [comparison, setComparison] = usePersistedState("tb:comparison", { type: "months", value: 4 });
  const [accounts, setAccounts] = useState([]);
  const [serverBalances, setServerBalances] = useState({});
  const [compBalances, setCompBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  useScrollRestore("tb", !loading);

  const periods = useMemo(() => buildComparisonPeriods(from, to, comparison), [from, to, comparison]);
  const showCompare = periods.length > 1;

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [accsPage, ...balPromises] = await Promise.all([
        base44.entities.ChartOfAccount.filter({ status: "Active" }, { limit: 5000 }).catch(() => ({ items: [] })),
        ...periods.map(p => getBalancesSafe(periodToArgs(p)).catch(() => ({ data: {} }))),
      ]);
      setAccounts(accsPage?.items || []);
      setServerBalances(balPromises[0]?.data?.balances || {});
      setCompBalances(balPromises.slice(1).map(r => r?.data?.balances || {}));
      setLoading(false);
    };
    load();
  }, [from, to, periods]);

  const rows = useMemo(() => {
    return accounts
      .map(a => {
        const code = String(a.code || "").trim().toLowerCase();
        const key = code || a.id;
        const t = key ? serverBalances[key] : null;
        const compData = compBalances.map(cb => {
          const ct = key ? cb[key] : null;
          return { debit: ct?.debit || 0, credit: ct?.credit || 0 };
        });
        return { ...a, debit: t?.debit || 0, credit: t?.credit || 0, compData };
      })
      .filter(r => r.debit !== 0 || r.credit !== 0 || r.compData.some(c => c.debit !== 0 || c.credit !== 0))
      .sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  }, [accounts, serverBalances, compBalances]);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  const compTotals = compBalances.map((_, i) => ({
    debit: rows.reduce((s, r) => s + (r.compData[i]?.debit || 0), 0),
    credit: rows.reduce((s, r) => s + (r.compData[i]?.credit || 0), 0),
  }));
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center gap-3">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Trial Balance</h1>
          <p className="text-xs text-muted-foreground">All account debits and credits for the period</p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <DateRangeDropdown from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <CompareWithDropdown comparison={comparison} onChange={setComparison} from={from} to={to} />
        <CommonFormatsMenu formats={rangeFormats()} onApply={(fm) => { setFrom(fm.from); setTo(fm.to); setComparison(fm.comparison); }} />
        {!loading && (
          <span className={`ml-auto text-xs font-medium px-2 py-1 rounded-full ${balanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            {balanced ? "✓ Balanced" : "⚠ Unbalanced"}
          </span>
        )}
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
                <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Debit</th>
                <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Credit</th>
                {showCompare && compBalances.map((_, i) => (
                  <React.Fragment key={i}>
                    <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32 border-l border-border">{periods[i + 1].label} Dr</th>
                    <th className="px-4 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">{periods[i + 1].label} Cr</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={5 + compBalances.length * 2} className="py-12 text-center text-muted-foreground text-xs">No posted entries in this period</td></tr>
              ) : rows.map(row => (
                <tr key={row.id} className="border-b border-border hover:bg-muted/20 group">
                  <td className="px-4 py-1 text-xs font-mono text-muted-foreground sticky left-0 bg-card group-hover:bg-muted/20 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">{row.code}</td>
                  <td className="px-4 py-1 text-xs">
                    <Link to={`/reports/account-transactions?accountId=${row.id}&from=${from}&to=${to}`} className="text-primary hover:underline">{row.name}</Link>
                  </td>
                  <td className="px-4 py-1 text-xs text-muted-foreground">{row.type}</td>
                  <td className="px-4 py-1 text-right text-xs font-mono tabular-nums">
                    {row.debit > 0
                      ? <Link to={`/reports/account-transactions?accountId=${row.id}&from=${from}&to=${to}`} className="text-blue-600 hover:underline">{num(row.debit)}</Link>
                      : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  <td className="px-4 py-1 text-right text-xs font-mono tabular-nums">
                    {row.credit > 0
                      ? <Link to={`/reports/account-transactions?accountId=${row.id}&from=${from}&to=${to}`} className="text-emerald-600 hover:underline">{num(row.credit)}</Link>
                      : <span className="text-muted-foreground/30">—</span>}
                  </td>
                  {showCompare && row.compData.map((c, i) => (
                    <React.Fragment key={i}>
                      <td className="px-4 py-1 text-right text-xs font-mono tabular-nums border-l border-border">
                        {c.debit > 0 ? <span className="text-blue-600">{num(c.debit)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="px-4 py-1 text-right text-xs font-mono tabular-nums">
                        {c.credit > 0 ? <span className="text-emerald-600">{num(c.credit)}</span> : <span className="text-muted-foreground/30">—</span>}
                      </td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-border">
                <td colSpan={3} className="px-4 py-2 text-xs font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">TOTALS</td>
                <td className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-blue-600">{num(totalDebit)}</td>
                <td className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-emerald-600">{num(totalCredit)}</td>
                {showCompare && compTotals.map((ct, i) => (
                  <React.Fragment key={i}>
                    <td className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-blue-600 border-l border-border">{num(ct.debit)}</td>
                    <td className="px-4 py-2 text-right text-xs font-bold font-mono tabular-nums text-emerald-600">{num(ct.credit)}</td>
                  </React.Fragment>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}