import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import React from "react";
import {
  format, startOfYear, endOfMonth, subMonths, startOfMonth, endOfYear
} from "date-fns";

const fmt = (n) =>
  n === 0 ? "—" :
  n < 0
    ? `(${Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtBold = (n) =>
  n === 0 ? "—" :
  n < 0
    ? `(${Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Account type groupings
const TRADING_INCOME_TYPES = ["Revenue"];
const COGS_TYPES = ["Cost of Sales"];
const OTHER_INCOME_TYPES = ["Other Income"];
const OPEX_TYPES = ["Expense", "Other Expense"];

const COMPARE_OPTIONS = [
  { label: "No comparison", months: 0 },
  { label: "1 previous month", months: 1 },
  { label: "2 previous months", months: 2 },
  { label: "3 previous months", months: 3 },
  { label: "4 previous months", months: 4 },
  { label: "5 previous months", months: 5 },
];

export default function ProfitLoss() {
  const navigate = useNavigate();
  const today = new Date();
  const [from, setFrom] = useState(format(startOfMonth(today), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(today), "yyyy-MM-dd"));
  const [compareMonths, setCompareMonths] = useState(4);
  const [compact, setCompact] = useState(false);
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [je, accs, orgs] = await Promise.all([
        base44.entities.JournalEntry.filter({ status: "Posted" }),
        base44.entities.ChartOfAccount.filter({ status: "Active" }),
        base44.entities.Organization.list("-created_date", 10).catch(() => []),
      ]);
      setEntries(je);
      setAccounts(accs);
      setOrg(orgs[0] || null);
      setLoading(false);
    };
    load();
  }, []);

  // Build column periods: main period + comparison months
  const periods = useMemo(() => {
    const cols = [];
    const mainFrom = new Date(from);
    const mainTo = new Date(to);
    mainTo.setHours(23, 59, 59);
    cols.push({ from: mainFrom, to: mainTo, label: format(mainTo, "MMM yyyy") });
    for (let i = 1; i <= compareMonths; i++) {
      const f = startOfMonth(subMonths(mainFrom, i));
      const t = endOfMonth(subMonths(mainFrom, i));
      t.setHours(23, 59, 59);
      cols.push({ from: f, to: t, label: format(t, "MMM yyyy") });
    }
    return cols;
  }, [from, to, compareMonths]);

  // For each period, compute account totals from journal lines
  const periodTotals = useMemo(() => {
    return periods.map(period => {
      const inRange = entries.filter(e => {
        const d = new Date(e.date);
        return d >= period.from && d <= period.to;
      });
      const totals = {};
      inRange.forEach(entry => {
        (entry.lines || []).forEach(line => {
          if (!line.account_id) return;
          if (!totals[line.account_id]) totals[line.account_id] = 0;
          totals[line.account_id] += (line.debit || 0) - (line.credit || 0);
        });
      });
      return totals;
    });
  }, [entries, periods]);

  // Get amount for an account in a period (sign-corrected)
  const getAmount = (accountId, accountType, periodIdx) => {
    const raw = periodTotals[periodIdx]?.[accountId] || 0;
    // Credit-normal accounts: Revenue, Other Income, Liability, Equity → negate debit-credit
    const creditNormal = ["Revenue", "Other Income", "Liability", "Equity"].includes(accountType);
    return creditNormal ? -raw : raw;
  };

  // Build a section: returns { rows: [{account, amounts[]}], totals[] }
  const buildSection = (types) => {
    const accs = accounts
      .filter(a => types.includes(a.type))
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

    const rows = accs.map(acc => {
      const amounts = periods.map((_, i) => getAmount(acc.id, acc.type, i));
      return { acc, amounts };
    }).filter(r => r.amounts.some(a => a !== 0));

    const totals = periods.map((_, i) => rows.reduce((s, r) => s + r.amounts[i], 0));
    return { rows, totals };
  };

  const report = useMemo(() => {
    const tradingIncome = buildSection(TRADING_INCOME_TYPES);
    const cogs = buildSection(COGS_TYPES);
    const grossProfit = periods.map((_, i) => tradingIncome.totals[i] - cogs.totals[i]);
    const otherIncome = buildSection(OTHER_INCOME_TYPES);
    const opex = buildSection(OPEX_TYPES);
    const netProfit = periods.map((_, i) => grossProfit[i] + otherIncome.totals[i] - opex.totals[i]);
    return { tradingIncome, cogs, grossProfit, otherIncome, opex, netProfit };
  }, [periodTotals, accounts, periods]);

  const numCols = periods.length;
  const colWidth = numCols > 3 ? "w-24" : "w-32";
  const rowPy = compact ? "py-1" : "py-2";

  // ── Row components ──────────────────────────────────────────────────────────

  const SectionHeader = ({ label }) => (
    <tr className="bg-muted/40">
      <td colSpan={numCols + 1} className="px-4 py-2 text-sm font-bold text-foreground border-b border-border">
        {label}
      </td>
    </tr>
  );

  const AccountRow = ({ name, amounts, accId }) => (
    <tr className="border-b border-border/40 hover:bg-muted/20 group cursor-pointer"
      onClick={() => navigate(`/reports/account-transactions?accountId=${accId}&from=${from}&to=${to}`)}>
      <td className={`px-4 ${rowPy} pl-8 text-sm text-primary underline-offset-2 hover:underline`}>{name}</td>
      {amounts.map((a, i) => (
        <td key={i} className={`px-3 ${rowPy} text-right text-sm font-mono tabular-nums ${colWidth} ${a < 0 ? "text-destructive" : a === 0 ? "text-muted-foreground/40" : "text-primary"}`}>
          {fmt(a)}
        </td>
      ))}
    </tr>
  );

  const totalPy = compact ? "py-1.5" : "py-2.5";
  const TotalRow = ({ label, amounts, variant = "subtotal" }) => {
    const styles = {
      subtotal: "bg-muted/20 font-semibold text-sm",
      gross: "bg-muted/30 font-bold text-sm border-t-2 border-border",
      net: "font-bold text-base",
    };
    return (
      <tr className={`border-b border-border ${styles[variant]}`}>
        <td className={`px-4 ${totalPy} text-foreground ${styles[variant]}`}>{label}</td>
        {amounts.map((a, i) => {
          const isNeg = a < 0;
          const colorClass = variant === "net"
            ? (a >= 0 ? "text-success" : "text-destructive")
            : (isNeg ? "text-destructive" : "text-foreground");
          return (
            <td key={i} className={`px-3 ${totalPy} text-right font-mono tabular-nums ${colWidth} ${colorClass} ${styles[variant]}`}>
              {fmtBold(a)}
            </td>
          );
        })}
      </tr>
    );
  };

  const EmptyRow = ({ label }) => (
    <tr className="border-b border-border">
      <td className="px-4 py-2 pl-8 text-sm text-muted-foreground italic">{label}</td>
      {periods.map((_, i) => <td key={i} className={`px-3 py-2 text-right text-muted-foreground/30 text-sm ${colWidth}`}>—</td>)}
    </tr>
  );

  const SpacerRow = () => <tr className="h-2 bg-background"><td colSpan={numCols + 1} /></tr>;

  return (
    <div className="p-6 space-y-4 max-w-full">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/reports">
          <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Reports</Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Profit and Loss</h1>
          {org && <p className="text-xs text-muted-foreground">{org.name}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Compact</span>
          <button onClick={() => setCompact(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${compact ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${compact ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </button>
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Date range</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background" />
          <span className="text-muted-foreground text-xs">→</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Compare with</label>
          <select value={compareMonths} onChange={e => setCompareMonths(Number(e.target.value))}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background">
            {COMPARE_OPTIONS.map(o => <option key={o.months} value={o.months}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex gap-1 ml-auto">
          {[
            { label: "This Month", f: format(startOfMonth(today), "yyyy-MM-dd"), t: format(endOfMonth(today), "yyyy-MM-dd") },
            { label: "Last Month", f: format(startOfMonth(subMonths(today, 1)), "yyyy-MM-dd"), t: format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd") },
            { label: "YTD", f: format(startOfYear(today), "yyyy-MM-dd"), t: format(today, "yyyy-MM-dd") },
            { label: "Last Year", f: format(startOfYear(subMonths(today, 12)), "yyyy-MM-dd"), t: format(endOfYear(subMonths(today, 12)), "yyyy-MM-dd") },
          ].map(p => (
            <button key={p.label} onClick={() => { setFrom(p.f); setTo(p.t); }}
              className="px-3 py-1 text-xs rounded-full border border-border text-muted-foreground hover:bg-accent transition-colors whitespace-nowrap">
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          {/* Report title block */}
          <div className="px-4 py-4 border-b border-border bg-background">
            <p className="text-lg font-bold text-foreground">Profit and Loss</p>
            {org && <p className="text-sm text-muted-foreground">{org.name}</p>}
            <p className="text-sm text-muted-foreground">
              For the period ended {format(new Date(to), "dd MMMM yyyy")}
            </p>
          </div>

          <table className="w-full text-sm">
            {/* Column headers */}
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground"></th>
                {periods.map((p, i) => (
                  <th key={i} className={`px-3 py-2.5 text-right text-xs font-semibold text-foreground ${colWidth}`}>
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
      )}
    </div>
  );
}