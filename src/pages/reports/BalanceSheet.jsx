import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Printer } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { format, subMonths, endOfMonth, startOfYear, endOfYear, subYears } from "date-fns";

const fmt = (n) =>
  n === 0 ? "—" :
  n < 0
    ? `(${Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
    : n.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Which account types are debit-normal
const DEBIT_NORMAL = new Set(["Asset", "Expense", "Cost of Sales", "Other Expense"]);
// Credit-normal: Revenue, Other Income, Liability, Equity

// Balance Sheet only uses these types
const BS_TYPES = ["Asset", "Liability", "Equity"];

// Subtype ordering for assets
const ASSET_SUBTYPE_ORDER = ["Current Asset", "Fixed Asset", "Non-current Asset", "Other"];
const LIABILITY_SUBTYPE_ORDER = ["Current Liability", "Non-current Liability", "Other"];

export default function BalanceSheet() {
  const navigate = useNavigate();
  const today = new Date();
  const [asOf, setAsOf] = useState(format(today, "yyyy-MM-dd"));
  const [compareAsOf, setCompareAsOf] = useState(format(endOfMonth(subMonths(today, 12)), "yyyy-MM-dd"));
  const [showCompare, setShowCompare] = useState(true);
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

  // Compute account balances as of a date (journal entries + opening balances)
  const computeBalances = (asOfDate) => {
    const toDate = new Date(asOfDate);
    toDate.setHours(23, 59, 59);

    // Sum journal lines up to date
    const jeTotals = {};
    entries
      .filter(e => new Date(e.date) <= toDate)
      .forEach(entry => {
        (entry.lines || []).forEach(line => {
          if (!line.account_id) return;
          if (!jeTotals[line.account_id]) jeTotals[line.account_id] = 0;
          jeTotals[line.account_id] += (line.debit || 0) - (line.credit || 0);
        });
      });

    // Build per-account balance (debit-credit net, sign-corrected)
    const balances = {};
    accounts.forEach(a => {
      // Opening balance: add if opening_balance_date <= asOf
      let openingAmt = 0;
      if (a.opening_balance && a.opening_balance_date) {
        const obDate = new Date(a.opening_balance_date);
        if (obDate <= toDate) {
          // Opening balance stored as a positive number in the "normal" direction
          openingAmt = DEBIT_NORMAL.has(a.type) ? (a.opening_balance || 0) : -(a.opening_balance || 0);
        }
      }
      const jeNet = jeTotals[a.id] || 0;
      const raw = openingAmt + jeNet;
      // Sign-correct: debit-normal → raw is positive when it has a debit balance
      balances[a.id] = DEBIT_NORMAL.has(a.type) ? raw : -raw;
    });

    return balances;
  };

  // Retained Earnings = net of all P&L accounts up to asOf
  const computeRetainedEarnings = (asOfDate) => {
    const toDate = new Date(asOfDate);
    toDate.setHours(23, 59, 59);
    const plTypes = new Set(["Revenue", "Other Income", "Cost of Sales", "Expense", "Other Expense"]);
    const jeTotals = {};
    entries
      .filter(e => new Date(e.date) <= toDate)
      .forEach(entry => {
        (entry.lines || []).forEach(line => {
          if (!line.account_id) return;
          if (!jeTotals[line.account_id]) jeTotals[line.account_id] = 0;
          jeTotals[line.account_id] += (line.debit || 0) - (line.credit || 0);
        });
      });

    let re = 0;
    accounts
      .filter(a => plTypes.has(a.type))
      .forEach(a => {
        const raw = jeTotals[a.id] || 0;
        // Revenue/Other Income: credit-normal → profit = -raw
        // Expense/COS/Other Expense: debit-normal → loss = +raw
        const isCredit = !DEBIT_NORMAL.has(a.type);
        re += isCredit ? -raw : -raw; // Net profit contribution = income - expenses
      });
    return re;
  };

  const report = useMemo(() => {
    const buildReport = (asOfDate) => {
      const balances = computeBalances(asOfDate);
      const retainedEarnings = computeRetainedEarnings(asOfDate);

      const buildSection = (type) => {
        const accs = accounts.filter(a => a.type === type);
        const rows = accs
          .map(a => ({ ...a, amount: balances[a.id] || 0 }))
          .filter(r => r.amount !== 0)
          .sort((a, b) => (a.code || "").localeCompare(b.code || ""));

        // Group by subtype
        const subtypes = {};
        rows.forEach(r => {
          const st = r.subtype || "Other";
          if (!subtypes[st]) subtypes[st] = [];
          subtypes[st].push(r);
        });

        const total = rows.reduce((s, r) => s + r.amount, 0);
        return { rows, subtypes, total };
      };

      const assets = buildSection("Asset");
      const liabilities = buildSection("Liability");
      const equity = buildSection("Equity");

      return { assets, liabilities, equity, retainedEarnings };
    };

    const main = buildReport(asOf);
    const compare = showCompare ? buildReport(compareAsOf) : null;
    return { main, compare };
  }, [entries, accounts, asOf, compareAsOf, showCompare]);

  const mainRE = report.main.retainedEarnings;
  const compareRE = report.compare?.retainedEarnings;

  const mainTotalEquity = report.main.equity.total + mainRE;
  const mainTotalLE = report.main.liabilities.total + mainTotalEquity;
  const mainBalanced = Math.abs(report.main.assets.total - mainTotalLE) < 0.01;

  const compareTotalEquity = report.compare ? (report.compare.equity.total + (compareRE || 0)) : 0;
  const compareTotalLE = report.compare ? (report.compare.liabilities.total + compareTotalEquity) : 0;

  const rowPy = compact ? "py-1" : "py-2";
  const stHeaderPy = compact ? "py-1" : "py-1.5";

  // ── Subtype section renderer ─────────────────────────────────────────────────
  const SectionRows = ({ data, compareData, type, color }) => {
    const allSubtypes = [...new Set([
      ...Object.keys(data.subtypes),
      ...(compareData ? Object.keys(compareData.subtypes) : []),
    ])].sort((a, b) => {
      const order = type === "Asset" ? ASSET_SUBTYPE_ORDER : LIABILITY_SUBTYPE_ORDER;
      const ai = order.indexOf(a) === -1 ? 99 : order.indexOf(a);
      const bi = order.indexOf(b) === -1 ? 99 : order.indexOf(b);
      return ai - bi;
    });

    const multipleSubtypes = allSubtypes.length > 1;

    if (allSubtypes.length === 0) {
      return (
        <tr><td colSpan={showCompare ? 3 : 2} className="px-4 py-3 text-sm text-muted-foreground italic pl-8">No balances</td></tr>
      );
    }

    return allSubtypes.map(st => {
      const rows = data.subtypes[st] || [];
      const compareRows = compareData?.subtypes[st] || [];
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

      const subtypeTotal = allRowAccounts.reduce((s, r) => s + r.mainAmt, 0);
      const compareSubtypeTotal = allRowAccounts.reduce((s, r) => s + r.compareAmt, 0);

      return (
        <React.Fragment key={st}>
          {/* Subtype header — bold label like Xero, only if multiple subtypes */}
          {multipleSubtypes && (
            <tr className="border-t border-border/40">
              <td colSpan={showCompare ? 3 : 2} className={`px-4 ${stHeaderPy} text-xs font-bold text-foreground pl-6`}>
                {st}
              </td>
            </tr>
          )}
          {allRowAccounts.map(row => (
            <tr key={row.id}
              className="border-b border-border/30 hover:bg-muted/20 cursor-pointer group"
              onClick={() => navigate(`/reports/account-transactions?accountId=${row.id}&from=1900-01-01&to=${asOf}`)}>
              <td className={`px-4 ${rowPy} pl-10`}>
                <span className="text-xs font-mono text-muted-foreground/60 mr-2">{row.code}</span>
                <span className="text-sm text-primary group-hover:underline underline-offset-2">{row.name}</span>
              </td>
              {showCompare && (
                <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums w-36 ${row.compareAmt < 0 ? "text-destructive" : row.compareAmt === 0 ? "text-muted-foreground/30" : color}`}>
                  {fmt(row.compareAmt)}
                </td>
              )}
              <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums w-36 ${row.mainAmt < 0 ? "text-destructive" : row.mainAmt === 0 ? "text-muted-foreground/30" : color}`}>
                {fmt(row.mainAmt)}
              </td>
            </tr>
          ))}
          {/* Subtype subtotal only when multiple subtypes */}
          {multipleSubtypes && (
            <tr className="border-b border-border">
              <td className={`px-4 ${stHeaderPy} pl-10 text-xs font-semibold text-muted-foreground`}>Total {st}</td>
              {showCompare && (
                <td className={`px-4 ${stHeaderPy} text-right text-xs font-semibold font-mono tabular-nums w-36 ${compareSubtypeTotal < 0 ? "text-destructive" : color}`}>
                  {fmt(compareSubtypeTotal)}
                </td>
              )}
              <td className={`px-4 ${stHeaderPy} text-right text-xs font-semibold font-mono tabular-nums w-36 ${subtypeTotal < 0 ? "text-destructive" : color}`}>
                {fmt(subtypeTotal)}
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
            className="border-b border-border/30 hover:bg-muted/20 cursor-pointer group"
            onClick={() => navigate(`/reports/account-transactions?accountId=${row.id}&from=1900-01-01&to=${asOf}`)}>
            <td className={`px-4 ${rowPy} pl-10`}>
              <span className="text-xs font-mono text-muted-foreground/60 mr-2">{row.code}</span>
              <span className="text-sm text-primary group-hover:underline underline-offset-2">{row.name}</span>
            </td>
            {showCompare && (
              <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums w-36 ${row.compareAmt < 0 ? "text-destructive" : "text-purple-600"}`}>
                {fmt(row.compareAmt)}
              </td>
            )}
            <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums w-36 ${row.mainAmt < 0 ? "text-destructive" : "text-purple-600"}`}>
              {fmt(row.mainAmt)}
            </td>
          </tr>
        ))}
        {/* Retained Earnings row */}
        <tr className="border-b border-border/30 hover:bg-muted/20">
          <td className={`px-4 ${rowPy} pl-10`}>
            <span className="text-sm text-foreground">Retained Earnings (Current Period)</span>
          </td>
          {showCompare && (
            <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums w-36 ${(compareRE || 0) < 0 ? "text-destructive" : "text-purple-600"}`}>
              {fmt(compareRE || 0)}
            </td>
          )}
          <td className={`px-4 ${rowPy} text-right text-sm font-mono tabular-nums w-36 ${mainRE < 0 ? "text-destructive" : "text-purple-600"}`}>
            {fmt(mainRE)}
          </td>
        </tr>
      </>
    );
  };

  const SectionHeader = ({ label }) => (
    <tr className="bg-muted/40 border-b border-border">
      <td colSpan={showCompare ? 3 : 2} className="px-4 py-2 text-sm font-bold text-foreground uppercase tracking-wide">
        {label}
      </td>
    </tr>
  );

  const TotalRow = ({ label, main, compare, bold = false }) => (
    <tr className={`border-b border-border ${bold ? "bg-muted/30" : "bg-muted/10"}`}>
      <td className={`px-4 py-2.5 ${bold ? "text-sm font-bold" : "text-sm font-semibold"} text-foreground`}>{label}</td>
      {showCompare && (
        <td className={`px-4 py-2.5 text-right font-mono tabular-nums w-36 ${bold ? "text-base font-bold" : "text-sm font-semibold"} ${(compare || 0) < 0 ? "text-destructive" : "text-foreground"}`}>
          {fmt(compare || 0)}
        </td>
      )}
      <td className={`px-4 py-2.5 text-right font-mono tabular-nums w-36 ${bold ? "text-base font-bold" : "text-sm font-semibold"} ${main < 0 ? "text-destructive" : "text-foreground"}`}>
        {fmt(main)}
      </td>
    </tr>
  );

  return (
    <div className="p-6 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link to="/reports">
          <Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Reports</Button>
        </Link>
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
          <input type="date" value={asOf} onChange={e => setAsOf(e.target.value)}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background" />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Compare with</label>
          <input type="date" value={compareAsOf} onChange={e => setCompareAsOf(e.target.value)}
            disabled={!showCompare}
            className="h-8 text-sm border border-input rounded-md px-2 bg-background disabled:opacity-40" />
          <button onClick={() => setShowCompare(v => !v)}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${showCompare ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"}`}>
            {showCompare ? "On" : "Off"}
          </button>
        </div>
        <div className="flex gap-1 ml-auto">
          {[
            { label: "Today", v: format(today, "yyyy-MM-dd") },
            { label: "End of Last Month", v: format(endOfMonth(subMonths(today, 1)), "yyyy-MM-dd") },
            { label: "End of Last Year", v: format(endOfYear(subYears(today, 1)), "yyyy-MM-dd") },
          ].map(p => (
            <button key={p.label} onClick={() => setAsOf(p.v)}
              className="px-3 py-1 text-xs rounded-full border border-border text-muted-foreground hover:bg-accent transition-colors whitespace-nowrap">
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 ml-2">
          <span className="text-xs text-muted-foreground">Compact</span>
          <button onClick={() => setCompact(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${compact ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${compact ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </button>
        </div>
        {!loading && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${mainBalanced ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            {mainBalanced ? "✓ Balanced" : "⚠ Unbalanced"}
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden overflow-x-auto">
          {/* Report title block */}
          <div className="px-4 py-4 border-b border-border bg-background">
            <p className="text-lg font-bold text-foreground">Balance Sheet</p>
            {org && <p className="text-sm text-muted-foreground">{org.name}</p>}
            <p className="text-sm text-muted-foreground">As at {format(new Date(asOf), "dd MMMM yyyy")}</p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground"></th>
                {showCompare && (
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-foreground w-36">
                    {format(new Date(compareAsOf), "dd MMM yyyy")}
                  </th>
                )}
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-foreground w-36">
                  {format(new Date(asOf), "dd MMM yyyy")}
                </th>
              </tr>
            </thead>
            <tbody>
              {/* ASSETS */}
              <SectionHeader label="Assets" />
              <SectionRows
                data={report.main.assets}
                compareData={report.compare?.assets}
                type="Asset"
                color="text-blue-600"
              />
              <TotalRow label="Total Assets" main={report.main.assets.total} compare={report.compare?.assets.total} bold />

              {/* spacer */}
              <tr className="h-3 bg-background"><td colSpan={showCompare ? 3 : 2} /></tr>

              {/* LIABILITIES */}
              <SectionHeader label="Liabilities" />
              <SectionRows
                data={report.main.liabilities}
                compareData={report.compare?.liabilities}
                type="Liability"
                color="text-orange-600"
              />
              <TotalRow label="Total Liabilities" main={report.main.liabilities.total} compare={report.compare?.liabilities.total} />

              {/* spacer */}
              <tr className="h-3 bg-background"><td colSpan={showCompare ? 3 : 2} /></tr>

              {/* EQUITY */}
              <SectionHeader label="Equity" />
              <EquityRows />
              <TotalRow
                label="Total Equity"
                main={mainTotalEquity}
                compare={compareTotalEquity}
              />

              {/* spacer */}
              <tr className="h-3 bg-background"><td colSpan={showCompare ? 3 : 2} /></tr>

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
      )}
    </div>
  );
}