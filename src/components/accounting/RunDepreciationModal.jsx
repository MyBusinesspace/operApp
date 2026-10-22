import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingDown, AlertTriangle, Check, Lock } from "lucide-react";
import { toast } from "sonner";
import { getSingleton } from "@/lib/singletonSettings";
import {
  calcDepreciation,
  resolveDepreciationAccounts,
  depRunReference,
  assetTag,
} from "@/lib/assetDepreciation";
import { formatDateOnly } from "@/lib/dateOnly";

function fmtCurrency(v) {
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
}
function fmtDate(d) {
  if (!d) return "—";
  return formatDateOnly(d);
}
function monthLabel(toDate) {
  return formatDateOnly(toDate, "monthYear");
}

const METHOD_LABEL = {
  straight_line: "Straight line",
  diminishing_value: "Diminishing",
  full_at_purchase: "Full at purchase",
  none: "No depreciation",
};

export default function RunDepreciationModal({ open, assets, onClose, onComplete }) {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const defaultTo = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;

  const [toDate, setToDate] = useState(defaultTo);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [posting, setPosting] = useState(false);
  const [result, setResult] = useState(null);
  const [coaById, setCoaById] = useState({});
  const [coaByCode, setCoaByCode] = useState({});
  const [groupsById, setGroupsById] = useState({});
  const [lockDate, setLockDate] = useState(null);
  const [lockError, setLockError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      // Chart of accounts: a failed read leaves the maps empty (unchanged
      // behaviour — the preview flags assets whose accounts cannot resolve).
      try {
        const coaPage = await base44.entities.ChartOfAccount.filter({ status: "Active" }, { limit: 5000 });
        const coaList = coaPage.items || coaPage || [];
        const byId = {}, byCode = {};
        coaList.forEach((a) => {
          byId[a.id] = a;
          if (a.code) byCode[String(a.code).toLowerCase()] = a;
        });
        if (!mounted) return;
        setCoaById(byId);
        setCoaByCode(byCode);
      } catch (e) {
        console.error("Could not load the chart of accounts for depreciation:", e);
      }
      // Asset types (AssetGroup) supply the default accounts for their assets.
      try {
        const typeList = await base44.entities.AssetGroup.list("name", 200);
        if (!mounted) return;
        const map = {};
        (typeList || []).forEach((g) => { map[g.id] = g; });
        setGroupsById(map);
      } catch (e) {
        console.error("Could not load asset types for depreciation:", e);
      }
      // Lock date: a failed read is never treated as "no lock" — the period
      // stays locked until the settings read succeeds.
      try {
        const settingsRec = await getSingleton(base44.entities.AccountingSettings, "AccountingSettings");
        if (!mounted) return;
        setLockDate(settingsRec?.lock_date || null);
        setLockError(false);
      } catch (e) {
        console.error("Could not read the accounting lock date:", e);
        if (!mounted) return;
        setLockError(true);
        toast.error("Could not load the accounting lock date — the period is treated as locked until settings load.");
      }
    })();
    return () => { mounted = false; };
  }, [open]);

  // Reset state when reopened
  useEffect(() => {
    if (open) {
      setToDate(defaultTo);
      setPreview(null);
      setResult(null);
    }
  }, [open]);

  const lockedByPeriod = lockError || (lockDate && toDate <= lockDate);

  // ── Build preview ──────────────────────────────────────────────────────────
  const handlePreview = async () => {
    setLoading(true);
    setPreview(null);
    try {
      // Find existing depreciation journals for this period (anti-duplicate guard)
      const depRef = depRunReference(toDate);
      let depJournals = [];
      try {
        const page = await base44.entities.JournalEntry.filter(
          { reference: depRef, status: "Posted" },
          { limit: 200 }
        );
        depJournals = page.items || page || [];
      } catch {}

      const registered = (assets || []).filter((a) => a.accounting_status === "registered");

      const rows = registered.map((asset) => {
        const calc = calcDepreciation(asset, toDate);
        const { expense, accumulated, usedFallback, warned, source: accountSource } =
          resolveDepreciationAccounts(asset, coaById, coaByCode, groupsById);

        // Anti-duplicate: check existing journals for this asset + period
        let dupReason = null;
        if (!calc.blocked) {
          const tag = assetTag(asset.id);
          for (const j of depJournals) {
            if ((j.lines || []).some((l) => (l.description || "").includes(tag))) {
              dupReason = `Already posted in ${j.number || "a prior run"}`;
              break;
            }
          }
        }

        const xeroNBV = asset.xero_net_book_value ?? asset.net_book_value ?? 0;

        return {
          asset,
          days: calc.days,
          amount: calc.amount,
          newAccumulated: calc.newAccumulated,
          newBookValue: calc.newBookValue,
          xeroNBV,
          difference: calc.newBookValue - xeroNBV,
          method: asset.depreciation_method || "straight_line",
          startDate: calc.startDate,
          lastDepreciationDate: asset.last_depreciation_date,
          expenseAccount: expense,
          accumulatedAccount: accumulated,
          usedFallback,
          warned,
          accountSource,
          blocked: calc.blocked || !!dupReason,
          blockReason: dupReason || calc.reason,
        };
      });

      setPreview(rows);
    } catch (e) {
      toast.error(e.message || "Could not build preview");
    }
    setLoading(false);
  };

  const eligibleRows = useMemo(
    () => (preview || []).filter((r) => !r.blocked && r.amount > 0 && r.expenseAccount && r.accumulatedAccount),
    [preview]
  );
  const blockedRows = useMemo(
    () => (preview || []).filter((r) => r.blocked),
    [preview]
  );
  const noAccountRows = useMemo(
    () => (preview || []).filter((r) => !r.blocked && r.amount > 0 && (!r.expenseAccount || !r.accumulatedAccount)),
    [preview]
  );
  const totalAmount = eligibleRows.reduce((s, r) => s + r.amount, 0);

  // ── Post depreciation ───────────────────────────────────────────────────────
  const handlePost = async () => {
    if (eligibleRows.length === 0) return;
    if (lockedByPeriod) {
      toast.error(lockError
        ? "Cannot post: the accounting lock date could not be loaded, so the period is treated as locked."
        : `Cannot post: ${toDate} is on or before the lock date (${lockDate})`);
      return;
    }

    setPosting(true);
    try {
      // Reserve JNL number
      const seqRes = await base44.functions.invoke("reserveSequenceNumbers", {
        sequence_type: "JNL",
        count: 1,
      });
      const jnlNumber = seqRes.data?.numbers?.[0] || seqRes.numbers?.[0];

      const label = monthLabel(toDate);
      const ref = depRunReference(toDate);

      // Build journal lines — one debit + one credit per asset
      const lines = [];
      for (const row of eligibleRows) {
        const prevDep = `${row.asset.last_depreciation_date || "-"}|${Number(row.asset.period_depreciation) || 0}`;
        const desc = `Depreciation — ${row.asset.name} — ${label} [${assetTag(row.asset.id)}][PREV:${prevDep}]`;
        lines.push({
          account_id: row.expenseAccount.id,
          account_code: row.expenseAccount.code,
          account_name: row.expenseAccount.name,
          description: desc,
          debit: Math.round(row.amount * 100) / 100,
          credit: 0,
        });
        lines.push({
          account_id: row.accumulatedAccount.id,
          account_code: row.accumulatedAccount.code,
          account_name: row.accumulatedAccount.name,
          description: desc,
          debit: 0,
          credit: Math.round(row.amount * 100) / 100,
        });
      }

      const totalRounded = Math.round(totalAmount * 100) / 100;

      // Create one journal entry for the whole run
      await base44.entities.JournalEntry.create({
        number: jnlNumber,
        date: toDate,
        narration: `Depreciation run — ${label}`,
        reference: ref,
        source_type: "Manual",
        entry_type: "document",
        status: "Posted",
        posted_date: toDate,
        total_debit: totalRounded,
        total_credit: totalRounded,
        lines,
      });

      // Update each asset
      for (const row of eligibleRows) {
        await base44.entities.Asset.update(row.asset.id, {
          accumulated_depreciation: Math.round(row.newAccumulated * 100) / 100,
          net_book_value: Math.round(row.newBookValue * 100) / 100,
          period_depreciation: Math.round(row.amount * 100) / 100,
          last_depreciation_date: toDate,
        });
      }

      setResult({ jnlNumber, totalAmount: totalRounded, assetCount: eligibleRows.length });
      toast.success(`Depreciation posted — ${jnlNumber} · ${eligibleRows.length} asset(s) · ${fmtCurrency(totalRounded)}`);
    } catch (e) {
      toast.error(e.message || "Failed to post depreciation");
    }
    setPosting(false);
  };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <div className="text-center py-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-lg font-bold text-foreground">Depreciation Posted</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Journal <span className="font-mono font-semibold text-foreground">{result.jnlNumber}</span> created for {monthLabel(toDate)}.
            </p>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-xl font-bold font-mono text-foreground">{result.assetCount}</p>
                <p className="text-xs text-muted-foreground">Assets depreciated</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/40 border border-border">
                <p className="text-xl font-bold font-mono text-foreground">{fmtCurrency(result.totalAmount)}</p>
                <p className="text-xs text-muted-foreground">Total depreciation</p>
              </div>
            </div>
            <div className="flex gap-2 justify-center mt-6">
              <Button variant="outline" onClick={() => { onClose(); onComplete(); }}>Done</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-violet-600" />
            Run Depreciation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Date selector */}
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Depreciate to (month end)</Label>
                <Input type="date" value={toDate} onChange={(e) => { setToDate(e.target.value); setPreview(null); }}
                  className="h-9 w-48" />
              </div>
              <Button size="sm" onClick={handlePreview} disabled={loading || !toDate}
                className="h-9 gap-1.5">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />}
                {loading ? "Calculating…" : "Preview"}
              </Button>
              <p className="text-xs text-muted-foreground pb-2">
                Each asset depreciates from the day after its last depreciation date up to this date.
              </p>
            </div>
          </div>

          {/* Lock date warning */}
          {lockError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <Lock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>Lock date unavailable.</strong> The accounting settings could not be loaded, so the period is treated as locked. Posting is disabled until the settings load.
              </span>
            </div>
          )}
          {!lockError && lockedByPeriod && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              <Lock className="w-4 h-4 mt-0.5 shrink-0" />
              <span>
                <strong>Locked period.</strong> The accounting lock date is {lockDate}. Posting on or before that date is not allowed.
                {toDate <= lockDate && ` The chosen date (${toDate}) is on or before the lock date.`}
              </span>
            </div>
          )}

          {/* Preview table */}
          {preview && (
            <>
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <p className="text-2xl font-bold text-emerald-600 tabular-nums">{eligibleRows.length}</p>
                  <p className="text-xs text-muted-foreground">Eligible</p>
                </div>
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <p className="text-2xl font-bold text-amber-600 tabular-nums">{blockedRows.length}</p>
                  <p className="text-xs text-muted-foreground">Blocked</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-2xl font-bold text-primary tabular-nums">{fmtCurrency(totalAmount)}</p>
                  <p className="text-xs text-muted-foreground">Total depreciation</p>
                </div>
              </div>

              {/* No-account warning */}
              {noAccountRows.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    <strong>{noAccountRows.length} asset(s)</strong> have no depreciation or accumulated depreciation account set and no category fallback mapping. Set the accounts on the asset TYPE (Fixed Asset Settings → Asset types), on the asset itself, or add a category mapping.
                  </span>
                </div>
              )}

              {/* Table */}
              <div className="rounded-xl border border-border overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border">
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Asset</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Last depr.</th>
                      <th className="px-2 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Days</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Method</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Accounts</th>
                      <th className="px-2 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Amount</th>
                      <th className="px-2 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">New accum.</th>
                      <th className="px-2 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">New NBV</th>
                      <th className="px-2 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Xero NBV</th>
                      <th className="px-2 py-2 text-right font-semibold text-muted-foreground whitespace-nowrap">Diff</th>
                      <th className="px-2 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {preview.map((r, i) => {
                      const isEligible = !r.blocked && r.amount > 0 && r.expenseAccount && r.accumulatedAccount;
                      return (
                        <tr key={r.asset.id} className={isEligible ? (i % 2 ? "bg-muted/5" : "") : "bg-amber-50/30"}>
                          <td className="px-2 py-2">
                            <p className="font-medium text-foreground truncate max-w-[180px]">{r.asset.name}</p>
                            <p className="text-muted-foreground/70 truncate max-w-[180px]">{r.asset.category || "—"}</p>
                          </td>
                          <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(r.lastDepreciationDate)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{r.days || "—"}</td>
                          <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{METHOD_LABEL[r.method] || r.method}</td>
                          <td className="px-2 py-2 whitespace-nowrap">
                            {r.warned ? (
                              <span className="text-amber-600 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Not set
                              </span>
                            ) : (
                              <div className="text-muted-foreground">
                                <p className="truncate max-w-[120px]">{r.expenseAccount?.code} {r.expenseAccount?.name}</p>
                                <p className="truncate max-w-[120px]">{r.accumulatedAccount?.code} {r.accumulatedAccount?.name}</p>
                                {r.usedFallback && <span className="text-[10px] text-blue-500">by category</span>}
                                {!r.usedFallback && r.accountSource === "type" && <span className="text-[10px] text-blue-500">by type</span>}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold text-foreground">
                            {r.amount > 0 ? fmtCurrency(r.amount) : "—"}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{fmtCurrency(r.newAccumulated)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-medium text-primary">{fmtCurrency(r.newBookValue)}</td>
                          <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                            {r.xeroNBV ? fmtCurrency(r.xeroNBV) : "—"}
                          </td>
                          <td className={`px-2 py-2 text-right tabular-nums ${Math.abs(r.difference) > 1 ? "text-amber-600 font-medium" : "text-muted-foreground"}`}>
                            {r.xeroNBV ? fmtCurrency(r.difference) : "—"}
                          </td>
                          <td className="px-2 py-2">
                            {r.blocked ? (
                              <span className="text-amber-600 text-[11px]">{r.blockReason}</span>
                            ) : !r.expenseAccount || !r.accumulatedAccount ? (
                              <span className="text-amber-600 text-[11px]">No accounts</span>
                            ) : (
                              <Check className="w-4 h-4 text-emerald-500" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {eligibleRows.length > 0 && (
                    <tfoot>
                      <tr className="bg-muted/30 border-t border-border font-semibold">
                        <td className="px-2 py-2.5" colSpan={5}>Total ({eligibleRows.length} assets)</td>
                        <td className="px-2 py-2.5 text-right tabular-nums text-foreground">{fmtCurrency(totalAmount)}</td>
                        <td colSpan={5} />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {preview.length === 0 && (
                <div className="py-8 text-center">
                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No registered assets found.</p>
                </div>
              )}
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" onClick={onClose} disabled={posting}>Cancel</Button>
            {preview && eligibleRows.length > 0 && !lockedByPeriod && (
              <Button onClick={handlePost} disabled={posting} className="gap-2">
                {posting ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />}
                {posting ? "Posting…" : `Post Depreciation (${eligibleRows.length} assets · ${fmtCurrency(totalAmount)})`}
              </Button>
            )}
            {preview && eligibleRows.length > 0 && lockedByPeriod && (
              <Button disabled className="gap-2">
                <Lock className="w-4 h-4" /> Locked period
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}