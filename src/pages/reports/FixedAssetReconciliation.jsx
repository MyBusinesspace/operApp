import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, TrendingDown } from "lucide-react";

function fmtCurrency(v) {
  if (v === null || v === undefined || v === 0) return "—";
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}

function fmtNum(v) {
  if (!v && v !== 0) return "—";
  const formatted = new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v));
  return v < 0 ? `(${formatted})` : formatted;
}

// Financial year: Jan 1 of current year to Dec 31 of current year
function getDefaultDates() {
  const now = new Date();
  const year = now.getFullYear();
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

export default function FixedAssetReconciliation() {
  const defaults = getDefaultDates();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [pendingFrom, setPendingFrom] = useState(defaults.from);
  const [pendingTo, setPendingTo] = useState(defaults.to);

  const [assets, setAssets] = useState([]);
  const [groups, setGroups] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [coaAccounts, setCoaAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [assetList, groupList, journalList, coaList] = await Promise.all([
        base44.entities.Asset.filter({ accounting_status: "registered" }),
        base44.entities.AssetGroup.list("name", 200),
        base44.entities.JournalEntry.filter({ status: "Posted" }),
        base44.entities.ChartOfAccount.filter({ status: "Active" }),
      ]);
      setAssets(assetList || []);
      setGroups(groupList || []);
      setJournalEntries(journalList || []);
      setCoaAccounts(coaList || []);
    } catch (err) {
      console.error("Failed to load reconciliation data:", err);
      setError(err?.message || "Failed to load data");
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpdate = () => {
    setFrom(pendingFrom);
    setTo(pendingTo);
  };

  // Build reconciliation data per asset group
  const reconciliationData = useMemo(() => {
    if (!assets.length && !groups.length) return [];

    // Group assets by group_id
    const assetsByGroup = {};
    assets.forEach(a => {
      const key = a.group_id || "__ungrouped__";
      if (!assetsByGroup[key]) assetsByGroup[key] = [];
      assetsByGroup[key].push(a);
    });

    // For each group, compute:
    // Opening = values as of `from` date (purchase_date <= from)
    // Closing = values as of `to` date (all registered assets)
    // Balance Sheet values come from COA journal entries
    // Asset Register values come from asset records directly

    const result = [];

    const allGroupKeys = new Set([
      ...Object.keys(assetsByGroup),
      ...groups.map(g => g.id),
    ]);

    allGroupKeys.forEach(groupKey => {
      const group = groups.find(g => g.id === groupKey);
      if (!group && groupKey === "__ungrouped__") return; // skip ungrouped if no assets
      if (!group) return;

      const groupAssets = assetsByGroup[groupKey] || [];
      if (!groupAssets.length) return;

      // Asset Register figures
      // Opening: assets purchased on or before `from` date
      const openingAssets = groupAssets.filter(a => !a.purchase_date || a.purchase_date <= from);
      const closingAssets = groupAssets; // all registered assets in this group

      const arOpenCost = openingAssets.reduce((s, a) => s + (a.purchase_price || 0), 0);
      const arClosingCost = closingAssets.reduce((s, a) => s + (a.purchase_price || 0), 0);

      // For accumulated depreciation at opening: estimate based on depreciation that happened before `from`
      // We use accumulated_depreciation and last_depreciation_date to estimate
      // Simple approach: opening accum = current accumulated minus depreciation posted after `from`
      const deprJournalsAfterFrom = journalEntries.filter(j =>
        j.date > from && j.date <= to && j.narration?.toLowerCase().includes("depreciation")
      );

      // Map journal amounts per asset (by matching narration)
      const deprAfterFrom = {}; // asset name -> amount
      deprJournalsAfterFrom.forEach(j => {
        const match = j.narration?.match(/^Depreciation — (.+?) — /);
        if (match) {
          const name = match[1];
          deprAfterFrom[name] = (deprAfterFrom[name] || 0) + (j.total_debit || 0);
        }
      });

      const arOpenAccumDepr = openingAssets.reduce((s, a) => {
        const currentAccum = a.accumulated_depreciation || 0;
        const postedAfterFrom = deprAfterFrom[a.name] || 0;
        return s + Math.max(0, currentAccum - postedAfterFrom);
      }, 0);

      const arClosingAccumDepr = closingAssets.reduce((s, a) => s + (a.accumulated_depreciation || 0), 0);

      const arOpenBookValue = arOpenCost - arOpenAccumDepr;
      const arClosingBookValue = arClosingCost - arClosingAccumDepr;

      // Balance Sheet figures: from COA journal entries
      // Use asset_account_id and accumulated_account_id from the group
      const assetAccountId = group.asset_account_id;
      const accumAccountId = group.accumulated_account_id;

      let bsOpenCost = 0;
      let bsOpenAccumDepr = 0;
      let bsClosingCost = 0;
      let bsClosingAccumDepr = 0;

      if (assetAccountId) {
        // All journal lines for asset account up to `from` (opening) and up to `to` (closing)
        journalEntries.forEach(j => {
          if (!j.lines || !j.date) return;
          j.lines.forEach(line => {
            if (line.account_id !== assetAccountId) return;
            const net = (line.debit || 0) - (line.credit || 0);
            if (j.date <= from) bsOpenCost += net;
            if (j.date <= to) bsClosingCost += net;
          });
        });
      }

      if (accumAccountId) {
        journalEntries.forEach(j => {
          if (!j.lines || !j.date) return;
          j.lines.forEach(line => {
            if (line.account_id !== accumAccountId) return;
            const net = (line.credit || 0) - (line.debit || 0);
            if (j.date <= from) bsOpenAccumDepr += net;
            if (j.date <= to) bsClosingAccumDepr += net;
          });
        });
      }

      // If no journal entries mapped (common when using asset register as source of truth),
      // fall back to asset register values for Balance Sheet as well (shows zero difference)
      // Only show BS rows if there are COA accounts configured
      const hasCOA = !!(assetAccountId || accumAccountId);

      result.push({
        groupId: groupKey,
        groupName: group.name,
        costAccountName: coaAccounts.find(a => a.id === assetAccountId)?.name || group.asset_account_name || "—",
        hasCOA,
        bs: {
          openCost: bsOpenCost,
          openAccumDepr: bsOpenAccumDepr,
          openBookValue: bsOpenCost - bsOpenAccumDepr,
          closingCost: bsClosingCost,
          closingAccumDepr: bsClosingAccumDepr,
          closingBookValue: bsClosingCost - bsClosingAccumDepr,
        },
        ar: {
          openCost: arOpenCost,
          openAccumDepr: arOpenAccumDepr,
          openBookValue: arOpenBookValue,
          closingCost: arClosingCost,
          closingAccumDepr: arClosingAccumDepr,
          closingBookValue: arClosingBookValue,
        },
      });
    });

    return result;
  }, [assets, groups, journalEntries, coaAccounts, from, to]);

  // Totals for difference row
  const totals = useMemo(() => {
    return reconciliationData.reduce((acc, g) => {
      const diff = {
        openCost: g.ar.openCost - g.bs.openCost,
        openAccumDepr: g.ar.openAccumDepr - g.bs.openAccumDepr,
        openBookValue: g.ar.openBookValue - g.bs.openBookValue,
        closingCost: g.ar.closingCost - g.bs.closingCost,
        closingAccumDepr: g.ar.closingAccumDepr - g.bs.closingAccumDepr,
        closingBookValue: g.ar.closingBookValue - g.bs.closingBookValue,
      };
      return {
        openCost: acc.openCost + diff.openCost,
        openAccumDepr: acc.openAccumDepr + diff.openAccumDepr,
        openBookValue: acc.openBookValue + diff.openBookValue,
        closingCost: acc.closingCost + diff.closingCost,
        closingAccumDepr: acc.closingAccumDepr + diff.closingAccumDepr,
        closingBookValue: acc.closingBookValue + diff.closingBookValue,
      };
    }, { openCost: 0, openAccumDepr: 0, openBookValue: 0, closingCost: 0, closingAccumDepr: 0, closingBookValue: 0 });
  }, [reconciliationData]);

  const fromLabel = new Date(from).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const toLabel = new Date(to).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">
      {/* Breadcrumb */}
      <div>
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Reports
        </Link>
        <h1 className="text-xl font-bold text-foreground mt-1">Fixed Asset Reconciliation</h1>
      </div>

      {/* Filters */}
      <div className="flex items-end gap-4 flex-wrap p-4 rounded-xl border border-border bg-card">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date range — From</label>
          <input
            type="date" value={pendingFrom}
            onChange={e => setPendingFrom(e.target.value)}
            className="h-9 px-3 text-sm rounded-md border border-input bg-transparent focus:outline-none focus:ring-1 focus:ring-ring w-40"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <input
            type="date" value={pendingTo}
            onChange={e => setPendingTo(e.target.value)}
            className="h-9 px-3 text-sm rounded-md border border-input bg-transparent focus:outline-none focus:ring-1 focus:ring-ring w-40"
          />
        </div>
        <Button size="sm" onClick={handleUpdate} className="h-9">Update</Button>
        <div className="ml-auto">
          <Button size="sm" variant="outline" className="gap-1.5 h-9" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> Print
          </Button>
        </div>
      </div>

      {/* Report */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Report header */}
        <div className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-5 h-5 text-violet-600" />
            <h2 className="text-lg font-bold text-foreground">Fixed Asset Reconciliation</h2>
          </div>
          <p className="text-sm text-muted-foreground">For the period {fromLabel} to {toLabel}</p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : error ? (
          <div className="py-16 text-center">
            <TrendingDown className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Failed to load reconciliation data.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{error}</p>
            <Button size="sm" variant="outline" className="mt-3" onClick={load}>Retry</Button>
          </div>
        ) : reconciliationData.length === 0 ? (
          <div className="py-16 text-center">
            <TrendingDown className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No registered assets found.</p>
            <Link to="/accounting/fixed-assets" className="text-xs text-primary hover:underline mt-1 inline-block">Go to Fixed Assets →</Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide w-32">Source</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Cost Account</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Opening Cost</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Opening Accum Dep</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Opening Book Value</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Closing Cost</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Closing Accum Dep</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs text-muted-foreground uppercase tracking-wide">Closing Book Value</th>
                </tr>
              </thead>
              <tbody>
                {reconciliationData.map(group => {
                  const diff = {
                    openCost: group.ar.openCost - group.bs.openCost,
                    openAccumDepr: group.ar.openAccumDepr - group.bs.openAccumDepr,
                    openBookValue: group.ar.openBookValue - group.bs.openBookValue,
                    closingCost: group.ar.closingCost - group.bs.closingCost,
                    closingAccumDepr: group.ar.closingAccumDepr - group.bs.closingAccumDepr,
                    closingBookValue: group.ar.closingBookValue - group.bs.closingBookValue,
                  };
                  const hasDiff = Object.values(diff).some(v => Math.abs(v) > 0.01);

                  return (
                    <React.Fragment key={group.groupId}>
                      {/* Group header */}
                      <tr className="bg-muted/40 border-t border-border">
                        <td colSpan={8} className="px-4 py-2.5 font-bold text-sm text-foreground">
                          {group.groupName}
                        </td>
                      </tr>

                      {/* Balance Sheet row */}
                      <tr className="border-b border-border/40 hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-muted-foreground text-xs pl-6">Balance Sheet</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{group.costAccountName}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{fmtNum(group.bs.openCost)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{fmtNum(group.bs.openAccumDepr)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{fmtNum(group.bs.openBookValue)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-primary">{fmtNum(group.bs.closingCost)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-primary">{fmtNum(group.bs.closingAccumDepr)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-primary">{fmtNum(group.bs.closingBookValue)}</td>
                      </tr>

                      {/* Asset Register row */}
                      <tr className="border-b border-border/40 hover:bg-muted/20">
                        <td className="px-4 py-2.5 text-muted-foreground text-xs pl-6">Asset Register</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{group.costAccountName}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{fmtNum(group.ar.openCost)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{fmtNum(group.ar.openAccumDepr)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-muted-foreground">{fmtNum(group.ar.openBookValue)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-primary">{fmtNum(group.ar.closingCost)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-primary">{fmtNum(group.ar.closingAccumDepr)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-primary">{fmtNum(group.ar.closingBookValue)}</td>
                      </tr>

                      {/* Difference row */}
                      <tr className={`border-b border-border hover:bg-muted/20 ${hasDiff ? "bg-amber-50/50" : ""}`}>
                        <td className="px-4 py-2 pl-6 font-semibold text-xs text-foreground">Difference</td>
                        <td className="px-4 py-2" />
                        <td className={`px-4 py-2 text-right font-mono text-xs font-semibold ${Math.abs(diff.openCost) > 0.01 ? "text-amber-700" : "text-muted-foreground"}`}>{fmtNum(diff.openCost)}</td>
                        <td className={`px-4 py-2 text-right font-mono text-xs font-semibold ${Math.abs(diff.openAccumDepr) > 0.01 ? "text-amber-700" : "text-muted-foreground"}`}>{fmtNum(diff.openAccumDepr)}</td>
                        <td className={`px-4 py-2 text-right font-mono text-xs font-semibold ${Math.abs(diff.openBookValue) > 0.01 ? "text-amber-700" : "text-muted-foreground"}`}>{fmtNum(diff.openBookValue)}</td>
                        <td className={`px-4 py-2 text-right font-mono text-xs font-semibold ${Math.abs(diff.closingCost) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(diff.closingCost)}</td>
                        <td className={`px-4 py-2 text-right font-mono text-xs font-semibold ${Math.abs(diff.closingAccumDepr) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(diff.closingAccumDepr)}</td>
                        <td className={`px-4 py-2 text-right font-mono text-xs font-semibold ${Math.abs(diff.closingBookValue) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(diff.closingBookValue)}</td>
                      </tr>
                    </React.Fragment>
                  );
                })}

                {/* Total Difference row */}
                <tr className="border-t-2 border-border bg-muted/40">
                  <td className="px-4 py-3 font-bold text-sm text-foreground" colSpan={2}>Total Difference</td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${Math.abs(totals.openCost) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(totals.openCost)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${Math.abs(totals.openAccumDepr) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(totals.openAccumDepr)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${Math.abs(totals.openBookValue) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(totals.openBookValue)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${Math.abs(totals.closingCost) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(totals.closingCost)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${Math.abs(totals.closingAccumDepr) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(totals.closingAccumDepr)}</td>
                  <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${Math.abs(totals.closingBookValue) > 0.01 ? "text-amber-700" : "text-foreground"}`}>{fmtNum(totals.closingBookValue)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}