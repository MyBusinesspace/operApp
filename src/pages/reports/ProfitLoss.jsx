import { useState, useEffect, useMemo } from "react";
import BackButton from "@/components/reports/BackButton";
import { usePersistedState, useScrollRestore } from "@/lib/usePersistedState";
import { getBalancesSafe } from "@/lib/accountBalancesApi";
import { base44 } from "@/api/base44Client";
import { parseDateOnly } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import React from "react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import DateRangeDropdown from "@/components/reports/DateRangeDropdown";
import CompareWithDropdown from "@/components/reports/CompareWithDropdown";
import CommonFormatsMenu, { rangeFormats } from "@/components/reports/CommonFormatsMenu";
import { buildComparisonPeriods } from "@/lib/comparisonPeriods";

const fmt = (n) =>
  n === 0 ? "—" :
  n < 0
    ? `(${Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Account type groupings (by category + type)
const isTradingIncome = (a) => a.category === "Revenue" && ["Revenue", "Sales"].includes(a.type);
const isCOGS = (a) => a.category === "Expenses" && a.type === "Direct Costs";
const isOtherIncome = (a) => a.category === "Revenue" && a.type === "Other Income";
const isOpex = (a) => a.category === "Expenses" && ["Expense", "Overhead", "Depreciation"].includes(a.type);

export default function ProfitLoss() {
  const navigate = useNavigate();
  const today = new Date();
  const [from, setFrom] = usePersistedState("pl:from", format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = usePersistedState("pl:to", format(endOfMonth(today), "yyyy-MM-dd"));
  const [comparison, setComparison] = usePersistedState("pl:comparison", { type: "months", value: 4 });
  const [compact, setCompact] = usePersistedState("pl:compact", true);
  const [periodBalances, setPeriodBalances] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  useScrollRestore("pl", !loading);

  // Build column periods: main period + comparison columns
  const periods = useMemo(() => buildComparisonPeriods(from, to, comparison), [from, to, comparison]);

  // Overall date range covering all period columns (main + comparisons)
  const overallRange = useMemo(() => {
    if (periods.length === 0) return null;
    const minFrom = periods.reduce((min, p) => p.from < min ? p.from : min, periods[0].from);
    const maxTo = periods.reduce((max, p) => p.to > max ? p.to : max, periods[0].to);
    return { from: minFrom, to: maxTo };
  }, [periods]);

  useEffect(() => {
    if (!overallRange) return;
    const load = async () => {
      setLoading(true);
      const periodsPayload = periods.map(p => ({
        from: format(p.from, "yyyy-MM-dd"),
        to: format(p.to, "yyyy-MM-dd"),
      }));
      const [balRes, accsPage, orgs] = await Promise.all([
        getBalancesSafe({ periods: periodsPayload }).catch(() => ({ data: { periodBalances: [] } })),
        base44.entities.ChartOfAccount.filter({ status: "Active" }, { limit: 5000 }).catch(() => ({ items: [] })),
        base44.entities.Organization.list("-created_date", 10).catch(() => []),
      ]);
      setPeriodBalances(balRes.data?.periodBalances || []);
      setAccounts(accsPage?.items || []);
      setOrg(orgs[0] || null);
      setLoading(false);
    };
    load();
  }, [overallRange]);

  // For each period, get account totals from server-computed balances (keyed by code)
  const periodTotals = useMemo(() => {
    return periodBalances.map(pb => {
      const totals = {};
      for (const [code, t] of Object.entries(pb.balances || {})) {
        totals[code] = (t.debit || 0) - (t.credit || 0);
      }
      return totals;
    });
  }, [periodBalances]);

  // Get amount for an account in a period (sign-corrected)
  const getAmount = (accountCode, accountId, accountCategory, periodIdx) => {
    const code = String(accountCode || "").trim().toLowerCase();
    const key = code || accountId;
    const raw = key ? (periodTotals[periodIdx]?.[key] || 0) : 0;
    // Credit-normal accounts: Revenue, Liabilities, Equity → negate debit-credit
    const creditNormal = ["Revenue", "Liabilities", "Equity"].includes(accountCategory);
    return creditNormal ? -raw : raw;
  };

  // Build a section: returns { rows: [{account, amounts[]}], totals[] }
  const buildSection = (filterFn) => {
    const accs = accounts
      .filter(filterFn)
      .sort((a, b) => ((a.type === "Depreciation") - (b.type === "Depreciation")) || (a.name || "").localeCompare(b.name || ""));

    const rows = accs.map(acc => {
      const amounts = periods.map((_, i) => getAmount(acc.code, acc.id, acc.category, i));
      return { acc, amounts };
    }).filter(r => r.amounts.some(a => a !== 0));

    const totals = periods.map((_, i) => rows.reduce((s, r) => s + r.amounts[i], 0));
    return { rows, totals };
  };

  const report = useMemo(() => {
    const tradingIncome = buildSection(isTradingIncome);
    const cogs = buildSection(isCOGS);
    const grossProfit = periods.map((_, i) => tradingIncome.totals[i] - cogs.totals[i]);
    const otherIncome = buildSection(isOtherIncome);
    const opex = buildSection(isOpex);
    const netProfit = periods.map((_, i) => grossProfit[i] + otherIncome.totals[i] - opex.totals[i]);
    return { tradingIncome, cogs, grossProfit, otherIncome, opex, netProfit };
  }, [periodTotals, accounts, periods]);

  const numCols = periods.length;
  const colWidth = numCols > 3 ? "w-28" : "w-32";
  const rowPy = compact ? "py-1" : "py-2";
  const rowText = compact ? "text-xs" : "text-sm";

  // ── Row components ──────────────────────────────────────────────────────────

  const SectionHeader = ({ label }) => (
    <tr>
      <td colSpan={numCols + 1} className={`px-4 ${compact ? "py-1.5" : "py-2.5"} ${rowText} font-bold text-foreground border-b border-border`}>
        {label}
      </td>
    </tr>
  );

  const AccountRow = ({ name, amounts, accId }) => (
    <tr className="border-b border-border hover:bg-muted/20 group">
      <td className={`px-4 ${rowPy} pl-6 ${rowText} sticky left-0 bg-card group-hover:bg-muted/20 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>
        <Link to={`/reports/account-transactions?accountId=${accId}&from=${from}&to=${to}`}
          className="text-primary underline-offset-2 hover:underline">{name}</Link>
      </td>
      {amounts.map((a, i) => {
        const p = periods[i];
        const pFrom = format(p.from, "yyyy-MM-dd");
        const pTo = format(p.to, "yyyy-MM-dd");
        return (
          <td key={i} className={`px-2 ${rowPy} text-right ${rowText} font-mono tabular-nums ${colWidth}`}>
            {a === 0
              ? <span className="text-muted-foreground/40">{fmt(a)}</span>
              : <Link to={`/reports/account-transactions?accountId=${accId}&from=${pFrom}&to=${pTo}`}
                  className={`${a < 0 ? "text-destructive" : "text-foreground"} hover:underline underline-offset-2`}>
                  {fmt(a)}
                </Link>}
          </td>
        );
      })}
    </tr>
  );

  const totalPy = compact ? "py-1.5" : "py-2.5";
  const totalText = compact ? "text-xs" : "text-sm";
  const TotalRow = ({ label, amounts, variant = "subtotal" }) => {
    const styles = {
      subtotal: "font-semibold",
      gross: "font-bold border-t-2 border-border",
      net: "font-bold text-xs",
    };
    return (
      <tr className={`border-b border-border bg-slate-100 dark:bg-slate-800 ${styles[variant]}`}>
        <td className={`px-4 ${totalPy} text-foreground ${styles[variant]} ${totalText} sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>{label}</td>
        {amounts.map((a, i) => {
          const isNeg = a < 0;
          const colorClass = variant === "net"
            ? (a >= 0 ? "text-success" : "text-destructive")
            : (isNeg ? "text-destructive" : "text-foreground");
          return (
            <td key={i} className={`px-3 ${totalPy} text-right font-mono tabular-nums ${colWidth} ${colorClass} ${styles[variant]} ${totalText}`}>
              {fmt(a)}
            </td>
          );
        })}
      </tr>
    );
  };

  const EmptyRow = ({ label }) => (
    <tr className="border-b border-border">
      <td className={`px-4 ${rowPy} pl-6 ${rowText} text-muted-foreground italic sticky left-0 bg-card z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>{label}</td>
      {periods.map((_, i) => <td key={i} className={`px-3 ${rowPy} text-right text-muted-foreground/30 ${rowText} ${colWidth}`}>—</td>)}
    </tr>
  );

  const SpacerRow = () => <tr className={compact ? "h-1.5" : "h-3"}><td colSpan={numCols + 1} /></tr>;

  return (
    <div className="p-4 space-y-3 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-lg font-bold text-foreground">Profit and Loss</h1>
          {org && <p className="text-xs text-muted-foreground">{org.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Compact</span>
          <button onClick={() => setCompact(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${compact ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-slate-200 transition-transform ${compact ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap bg-card border border-border rounded-xl px-3 py-2">
        <DateRangeDropdown from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} />
        <CompareWithDropdown comparison={comparison} onChange={setComparison} from={from} to={to} />
        <CommonFormatsMenu formats={rangeFormats()} onApply={(fm) => { setFrom(fm.from); setTo(fm.to); setComparison(fm.comparison); }} />
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-xs">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Report title block */}
          <div className="px-4 py-3 border-b border-border bg-background">
            <p className="text-lg font-bold text-foreground">Profit and Loss</p>
            {org && <p className="text-xs text-foreground">{org.name}</p>}
            <p className="text-xs text-muted-foreground">
              For the period ended {format(parseDateOnly(to), "d MMMM yyyy")}
            </p>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full">
            {/* Column headers */}
            <thead>
              <tr className="border-b border-border">
                <th className={`px-4 ${compact ? "py-1.5" : "py-2.5"} text-left text-xs font-semibold text-muted-foreground sticky left-0 bg-card z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}></th>
                {periods.map((p, i) => (
                  <th key={i} className={`px-2 ${compact ? "py-1.5" : "py-2.5"} text-right text-xs font-semibold text-muted-foreground ${colWidth}`}>
                    {p.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* ── TRADING INCOME ── */}
              <SectionHeader label="Trading Income" />
              {report.tradingIncome.rows.length === 0
                ? <EmptyRow label="No trading income entries" />
                : report.tradingIncome.rows.map(r => <AccountRow key={r.acc.id} accId={r.acc.id} name={r.acc.name} amounts={r.amounts} />)}
              <TotalRow label="Total Trading Income" amounts={report.tradingIncome.totals} variant="subtotal" />

              <SpacerRow />

              {/* ── COST OF SALES ── */}
              <SectionHeader label="Cost of Sales" />
              {report.cogs.rows.length === 0
                ? <EmptyRow label="No cost of sales entries" />
                : report.cogs.rows.map(r => <AccountRow key={r.acc.id} accId={r.acc.id} name={r.acc.name} amounts={r.amounts} />)}
              <TotalRow label="Total Cost of Sales" amounts={report.cogs.totals} variant="subtotal" />

              {/* ── GROSS PROFIT ── */}
              <TotalRow label="Gross Profit" amounts={report.grossProfit} variant="gross" />

              <SpacerRow />

              {/* ── OTHER INCOME ── */}
              {(report.otherIncome.rows.length > 0 || report.otherIncome.totals.some(t => t !== 0)) && (
                <>
                  <SectionHeader label="Other Income" />
                  {report.otherIncome.rows.length === 0
                    ? <EmptyRow label="No other income entries" />
                    : report.otherIncome.rows.map(r => <AccountRow key={r.acc.id} accId={r.acc.id} name={r.acc.name} amounts={r.amounts} />)}
                  <TotalRow label="Total Other Income" amounts={report.otherIncome.totals} variant="subtotal" />
                  <SpacerRow />
                </>
              )}

              {/* ── OPERATING EXPENSES ── */}
              <SectionHeader label="Operating Expenses" />
              {report.opex.rows.length === 0
                ? <EmptyRow label="No operating expense entries" />
                : report.opex.rows.map(r => <AccountRow key={r.acc.id} accId={r.acc.id} name={r.acc.name} amounts={r.amounts} />)}
              <TotalRow label="Total Operating Expenses" amounts={report.opex.totals} variant="subtotal" />

              <SpacerRow />

              {/* ── NET PROFIT ── */}
              <TotalRow
                label={report.netProfit[0] >= 0 ? "Net Profit" : "Net Loss"}
                amounts={report.netProfit}
                variant="net"
              />
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}