import React, { useState, useEffect, useMemo } from "react";
import BackButton from "@/components/reports/BackButton";
import { usePersistedState, useScrollRestore } from "@/lib/usePersistedState";
import { getBalancesSafe } from "@/lib/accountBalancesApi";
import { base44 } from "@/api/base44Client";
import { parseDateOnly } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { format, subMonths, endOfMonth } from "date-fns";
import DateRangeDropdown from "@/components/reports/DateRangeDropdown";
import CommonFormatsMenu, { asOfFormats } from "@/components/reports/CommonFormatsMenu";

const fmt = (n) =>
  n === 0 ? "—" :
  n < 0
    ? `(${Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Which account types are debit-normal
const DEBIT_NORMAL = new Set(["Assets", "Expenses"]);
// Credit-normal: Revenue, Liabilities, Equity

// Balance Sheet only uses these categories
const BS_TYPES = ["Assets", "Liabilities", "Equity"];

// Type ordering within each category
const ASSET_TYPE_ORDER = ["Bank", "Current Asset", "Fixed Asset", "Non-current Asset", "Prepayment", "Other"];
const LIABILITY_TYPE_ORDER = ["Current Liability", "Liability", "Non-current Liability", "Other"];

export default function BalanceSheet() {
  const navigate = useNavigate();
  const today = new Date();
  const [asOf, setAsOf] = usePersistedState("bs:asOf", format(today, "yyyy-MM-dd"));
  const [compareAsOf, setCompareAsOf] = usePersistedState("bs:compareAsOf", format(endOfMonth(subMonths(today, 12)), "yyyy-MM-dd"));
  const [showCompare, setShowCompare] = usePersistedState("bs:showCompare", true);
  const [compact, setCompact] = usePersistedState("bs:compact", false);
  const [periodBalances, setPeriodBalances] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [org, setOrg] = useState(null);
  const [loading, setLoading] = useState(true);
  useScrollRestore("bs", !loading);
  const [hasOpeningJournal, setHasOpeningJournal] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Two periods: [0] = compare (as of compareAsOf), [1] = main (as of asOf)
      // Only `to` date → cumulative balance from beginning of time up to that date
      const periods = [{ to: compareAsOf }, { to: asOf }];
      const [balRes, accsPage, orgs, openingCheck] = await Promise.all([
        getBalancesSafe({ periods }).catch(() => ({ data: { periodBalances: [] } })),
        base44.entities.ChartOfAccount.filter({ status: "Active" }, { limit: 5000 }).catch(() => ({ items: [] })),
        base44.entities.Organization.list("-created_date", 10).catch(() => []),
        base44.entities.JournalEntry.filter(
          { source_type: "OpeningBalance", status: "Posted" },
          { limit: 1, fields: ["id"] }
        ).catch(() => ({ items: [] })),
      ]);
      setPeriodBalances(balRes.data?.periodBalances || []);
      setAccounts(accsPage?.items || []);
      setOrg(orgs[0] || null);
      const openingItems = openingCheck.items || openingCheck;
      setHasOpeningJournal(openingItems.length > 0);
      setLoading(false);
    };
    load();
  }, [asOf, compareAsOf]);

  // Compute account balances as of a date (server-computed JE balances + opening balances)
  const computeBalances = (asOfDate, periodIdx) => {
    const toDate = parseDateOnly(asOfDate);
    toDate.setHours(23, 59, 59);
    const serverBal = periodBalances[periodIdx]?.balances || {};

    const balances = {};
    accounts.forEach(a => {
      const code = String(a.code || "").trim().toLowerCase();
      const balKey = code || a.id;
      const jeNet = balKey ? (serverBal[balKey]?.balance || 0) : 0;

      // Opening balance: once an OpeningBalance journal exists in the GL, the
      // opening is already in jeNet — do NOT add it again (double-count). Only
      // add the chart opening_balance when no opening journal exists yet.
      let openingAmt = 0;
      if (!hasOpeningJournal && a.opening_balance && a.opening_balance_date) {
        const obDate = parseDateOnly(a.opening_balance_date);
        if (obDate <= toDate) {
          openingAmt = DEBIT_NORMAL.has(a.category) ? (a.opening_balance || 0) : -(a.opening_balance || 0);
        }
      }
      const raw = openingAmt + jeNet;
      balances[a.id] = DEBIT_NORMAL.has(a.category) ? raw : -raw;
    });

    return balances;
  };

  // Retained Earnings = net of all P&L accounts up to asOf
  const computeRetainedEarnings = (balances) => {
    const plCats = new Set(["Revenue", "Expenses"]);
    let re = 0;
    accounts
      .filter(a => plCats.has(a.category))
      .forEach(a => {
        const isCredit = !DEBIT_NORMAL.has(a.category);
        const amt = balances[a.id] || 0;
        re += isCredit ? amt : -amt;
      });
    return re;
  };

  const report = useMemo(() => {
    const buildReport = (asOfDate, periodIdx) => {
      const balances = computeBalances(asOfDate, periodIdx);
      const retainedEarnings = computeRetainedEarnings(balances);

      const buildSection = (category) => {
        const accs = accounts.filter(a => a.category === category);
        const rows = accs
          .map(a => ({ ...a, amount: balances[a.id] || 0 }))
          .filter(r => r.amount !== 0)
          .sort((a, b) => (a.code || "").localeCompare(b.code || ""));

        // Group by type
        const types = {};
        rows.forEach(r => {
          const st = r.type || "Other";
          if (!types[st]) types[st] = [];
          types[st].push(r);
        });

        const total = rows.reduce((s, r) => s + r.amount, 0);
        return { rows, types, total };
      };

      const assets = buildSection("Assets");
      const liabilities = buildSection("Liabilities");
      const equity = buildSection("Equity");

      return { assets, liabilities, equity, retainedEarnings };
    };

    const main = buildReport(asOf, 1);
    const compare = showCompare ? buildReport(compareAsOf, 0) : null;
    return { main, compare };
  }, [periodBalances, accounts, asOf, compareAsOf, showCompare, hasOpeningJournal]);

  const mainRE = report.main.retainedEarnings;
  const compareRE = report.compare?.retainedEarnings;

  const mainTotalEquity = report.main.equity.total + mainRE;
  const mainTotalLE = report.main.liabilities.total + mainTotalEquity;
  const mainBalanced = Math.abs(report.main.assets.total - mainTotalLE) < 0.01;

  const compareTotalEquity = report.compare ? (report.compare.equity.total + (compareRE || 0)) : 0;
  const compareTotalLE = report.compare ? (report.compare.liabilities.total + compareTotalEquity) : 0;

  const rowPy = compact ? "py-1" : "py-2.5";
  const stHeaderPy = compact ? "py-1.5" : "py-2.5";

  // ── Subtype section renderer ─────────────────────────────────────────────────
  const SectionRows = ({ data, compareData, category, color }) => {
    const allSubtypes = [...new Set([
      ...Object.keys(data.types),
      ...(compareData ? Object.keys(compareData.types) : []),
    ])].sort((a, b) => {
      const order = category === "Assets" ? ASSET_TYPE_ORDER : LIABILITY_TYPE_ORDER;
      const ai = order.indexOf(a) === -1 ? 99 : order.indexOf(a);
      const bi = order.indexOf(b) === -1 ? 99 : order.indexOf(b);
      return ai - bi;
    });

    const multipleSubtypes = allSubtypes.length > 1;

    if (allSubtypes.length === 0) {
      return (
        <tr><td colSpan={showCompare ? 3 : 2} className="px-4 py-3 text-xs text-muted-foreground italic pl-8">No balances</td></tr>
      );
    }

    return allSubtypes.map(st => {
      const rows = data.types[st] || [];
      const compareRows = compareData?.types[st] || [];
      const allIds = [...new Set([...rows.map(r => r.id), ...compareRows.map(r => r.id)])];

      const allRowAccounts = allIds.map(id => {
        const main = rows.find(r => r.id === id);
        const comp = compareRows.find(r => r.id === id);
        return {
          id,
          code: main?.code || comp?.code,
          name: main?.name || comp?.name,
          mainAmt: main?.amount || 0,
          compareAmt: comp?.amount || 0,
        };
      }).filter(r => r.mainAmt !== 0 || r.compareAmt !== 0);

      const typeTotal = allRowAccounts.reduce((s, r) => s + r.mainAmt, 0);
      const compareSubtypeTotal = allRowAccounts.reduce((s, r) => s + r.compareAmt, 0);

      return (
        <React.Fragment key={st}>
          {/* Type header — bold label like Xero, only if multiple types */}
          {multipleSubtypes && (
            <tr className="border-t border-border/40">
              <td colSpan={showCompare ? 3 : 2} className={`px-4 ${stHeaderPy} text-xs font-bold text-foreground pl-6`}>
                {st}
              </td>
            </tr>
          )}
          {allRowAccounts.map(row => (
            <tr key={row.id}
              className="border-b border-border/30 hover:bg-muted/20 group">
              <td className={`px-4 ${rowPy} pl-10 sticky left-0 bg-card group-hover:bg-muted/20 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>
                <Link to={`/reports/account-transactions?accountId=${row.id}&from=1900-01-01&to=${asOf}`}
                  className="text-primary hover:underline underline-offset-2">
                  <span className="text-xs font-mono text-muted-foreground/60 mr-2">{row.code}</span>
                  <span className="text-xs">{row.name}</span>
                </Link>
              </td>
              {showCompare && (
                <td className={`px-4 ${rowPy} text-right text-xs font-mono tabular-nums w-36`}>
                  <Link to={`/reports/account-transactions?accountId=${row.id}&from=1900-01-01&to=${compareAsOf}`}
                    className={`${row.compareAmt < 0 ? "text-destructive" : row.compareAmt === 0 ? "text-muted-foreground/30" : color} hover:underline underline-offset-2`}>
                    {fmt(row.compareAmt)}
                  </Link>
                </td>
              )}
              <td className={`px-4 ${rowPy} text-right text-xs font-mono tabular-nums w-36`}>
                <Link to={`/reports/account-transactions?accountId=${row.id}&from=1900-01-01&to=${asOf}`}
                  className={`${row.mainAmt < 0 ? "text-destructive" : row.mainAmt === 0 ? "text-muted-foreground/30" : color} hover:underline underline-offset-2`}>
                  {fmt(row.mainAmt)}
                </Link>
              </td>
            </tr>
          ))}
          {/* Type subtotal only when multiple types */}
          {multipleSubtypes && (
            <tr className="border-b border-border bg-slate-100 dark:bg-slate-800">
               <td className={`px-4 ${stHeaderPy} pl-10 text-xs font-semibold text-muted-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>Total {st}</td>
              {showCompare && (
                <td className={`px-4 ${stHeaderPy} text-right text-xs font-semibold font-mono tabular-nums w-36 ${compareSubtypeTotal < 0 ? "text-destructive" : color}`}>
                  {fmt(compareSubtypeTotal)}
                </td>
              )}
              <td className={`px-4 ${stHeaderPy} text-right text-xs font-semibold font-mono tabular-nums w-36 ${typeTotal < 0 ? "text-destructive" : color}`}>
                {fmt(typeTotal)}
              </td>
            </tr>
          )}
        </React.Fragment>
      );
    });
  };

  // ── Equity rows (with Retained Earnings) ────────────────────────────────────
  const EquityRows = () => {
    const rows = report.main.equity.rows;
    const compareRows = report.compare?.equity.rows || [];
    const allIds = [...new Set([...rows.map(r => r.id), ...compareRows.map(r => r.id)])];
    const allRowAccounts = allIds.map(id => {
      const main = rows.find(r => r.id === id);
      const comp = compareRows.find(r => r.id === id);
      return {
        id,
        code: main?.code || comp?.code,
        name: main?.name || comp?.name,
        mainAmt: main?.amount || 0,
        compareAmt: comp?.amount || 0,
      };
    });

    return (
      <>
        {allRowAccounts.map(row => (
          <tr key={row.id}
            className="border-b border-border/30 hover:bg-muted/20 group">
            <td className={`px-4 ${rowPy} pl-10 sticky left-0 bg-card group-hover:bg-muted/20 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>
              <Link to={`/reports/account-transactions?accountId=${row.id}&from=1900-01-01&to=${asOf}`}
                className="text-primary hover:underline underline-offset-2">
                <span className="text-xs font-mono text-muted-foreground/60 mr-2">{row.code}</span>
                <span className="text-xs">{row.name}</span>
              </Link>
            </td>
            {showCompare && (
              <td className={`px-4 ${rowPy} text-right text-xs font-mono tabular-nums w-36`}>
                <Link to={`/reports/account-transactions?accountId=${row.id}&from=1900-01-01&to=${compareAsOf}`}
                  className={`${row.compareAmt < 0 ? "text-destructive" : "text-purple-600"} hover:underline underline-offset-2`}>
                  {fmt(row.compareAmt)}
                </Link>
              </td>
            )}
            <td className={`px-4 ${rowPy} text-right text-xs font-mono tabular-nums w-36`}>
              <Link to={`/reports/account-transactions?accountId=${row.id}&from=1900-01-01&to=${asOf}`}
                className={`${row.mainAmt < 0 ? "text-destructive" : "text-purple-600"} hover:underline underline-offset-2`}>
                {fmt(row.mainAmt)}
              </Link>
            </td>
          </tr>
        ))}
        {/* Retained Earnings row */}
        <tr className="border-b border-border/30 hover:bg-muted/20">
          <td className={`px-4 ${rowPy} pl-10 sticky left-0 bg-card group-hover:bg-muted/20 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>
            <span className="text-xs text-foreground">Retained Earnings (Current Period)</span>
          </td>
          {showCompare && (
            <td className={`px-4 ${rowPy} text-right text-xs font-mono tabular-nums w-36 ${(compareRE || 0) < 0 ? "text-destructive" : "text-purple-600"}`}>
              {fmt(compareRE || 0)}
            </td>
          )}
          <td className={`px-4 ${rowPy} text-right text-xs font-mono tabular-nums w-36 ${mainRE < 0 ? "text-destructive" : "text-purple-600"}`}>
            {fmt(mainRE)}
          </td>
        </tr>
      </>
    );
  };

  const SectionHeader = ({ label }) => (
    <tr className="bg-muted/40 border-b border-border">
      <td colSpan={showCompare ? 3 : 2} className={`px-4 ${compact ? "py-1" : "py-2"} ${compact ? "text-xs" : "text-xs"} font-bold text-foreground uppercase tracking-wide`}>
        {label}
      </td>
    </tr>
  );

  const TotalRow = ({ label, main, compare, bold = false }) => (
    <tr className={`border-b border-border bg-slate-100 dark:bg-slate-800`}>
      <td className={`px-4 ${compact ? "py-1.5" : "py-2.5"} ${bold ? "text-xs font-bold" : "text-xs font-semibold"} text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}>{label}</td>
      {showCompare && (
        <td className={`px-4 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono tabular-nums w-36 ${bold ? "text-xs font-bold" : "text-xs font-semibold"} ${(compare || 0) < 0 ? "text-destructive" : "text-foreground"}`}>
          {fmt(compare || 0)}
        </td>
      )}
      <td className={`px-4 ${compact ? "py-1.5" : "py-2.5"} text-right font-mono tabular-nums w-36 ${bold ? "text-xs font-bold" : "text-xs font-semibold"} ${main < 0 ? "text-destructive" : "text-foreground"}`}>
        {fmt(main)}
      </td>
    </tr>
  );

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <BackButton />
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Balance Sheet</h1>
          {org && <p className="text-xs text-muted-foreground">{org.name}</p>}
        </div>
        <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5">
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 flex-wrap bg-card border border-border rounded-xl px-4 py-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">As of</label>
          <DateRangeDropdown from={asOf} to={asOf} onChange={(_f, t) => setAsOf(t)} />
          <CommonFormatsMenu formats={asOfFormats()} onApply={(fm) => { setAsOf(fm.asOf); setCompareAsOf(fm.compareAsOf); setShowCompare(true); }} />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Compare with</label>
          <div className={showCompare ? "" : "pointer-events-none opacity-40"}>
            <DateRangeDropdown from={compareAsOf} to={compareAsOf} onChange={(_f, t) => setCompareAsOf(t)} />
          </div>
          <button onClick={() => setShowCompare(v => !v)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${showCompare ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"}`}>
            {showCompare ? "On" : "Off"}
          </button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Compact</span>
          <button onClick={() => setCompact(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${compact ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-slate-200 transition-transform ${compact ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </button>
        </div>
        {!loading && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${mainBalanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            {mainBalanced ? "✓ Balanced" : "⚠ Unbalanced"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-xs">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Report title block */}
          <div className="px-4 py-2 border-b border-border bg-background">
            <p className="text-xs font-bold text-foreground">Balance Sheet</p>
            {org && <p className="text-xs text-muted-foreground">{org.name}</p>}
            <p className="text-xs text-muted-foreground">As at {format(parseDateOnly(asOf), "d MMMM yyyy")}</p>
          </div>

          <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className={`px-4 ${compact ? "py-1" : "py-2.5"} text-left text-xs font-semibold text-muted-foreground sticky left-0 bg-card z-20 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]`}></th>
                {showCompare && (
                  <th className={`px-4 ${compact ? "py-1" : "py-2.5"} text-right text-xs font-semibold text-foreground w-36`}>
                    {format(parseDateOnly(compareAsOf), "d MMM yyyy")}
                  </th>
                )}
                <th className={`px-4 ${compact ? "py-1" : "py-2.5"} text-right text-xs font-semibold text-foreground w-36`}>
                  {format(parseDateOnly(asOf), "d MMM yyyy")}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* ASSETS */}
              <SectionHeader label="Assets" />
              <SectionRows
                data={report.main.assets}
                compareData={report.compare?.assets}
                category="Assets"
                color="text-blue-600"
              />
              <TotalRow label="Total Assets" main={report.main.assets.total} compare={report.compare?.assets.total} bold />

              {/* spacer */}
              <tr className={compact ? "h-1" : "h-3"}><td colSpan={showCompare ? 3 : 2} /></tr>

              {/* LIABILITIES */}
              <SectionHeader label="Liabilities" />
              <SectionRows
                data={report.main.liabilities}
                compareData={report.compare?.liabilities}
                category="Liabilities"
                color="text-orange-600"
              />
              <TotalRow label="Total Liabilities" main={report.main.liabilities.total} compare={report.compare?.liabilities.total} />

              {/* spacer */}
              <tr className={compact ? "h-1" : "h-3"}><td colSpan={showCompare ? 3 : 2} /></tr>

              {/* EQUITY */}
              <SectionHeader label="Equity" />
              <EquityRows />
              <TotalRow
                label="Total Equity"
                main={mainTotalEquity}
                compare={compareTotalEquity}
              />

              {/* spacer */}
              <tr className={compact ? "h-1" : "h-3"}><td colSpan={showCompare ? 3 : 2} /></tr>

              {/* TOTAL L + E */}
              <TotalRow
                label="Total Liabilities + Equity"
                main={mainTotalLE}
                compare={compareTotalLE}
                bold
              />
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}