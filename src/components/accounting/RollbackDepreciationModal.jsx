import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { formatDateOnly, formatDateValue } from "@/lib/dateOnly";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, RotateCcw, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { depRunReference, assetTag } from "@/lib/assetDepreciation";

function fmtCurrency(v) {
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
}
function fmtDate(d) {
  if (!d) return "—";
  return formatDateValue(d);
}
function monthEnd(month) {
  // month: "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

const LINE_RE = /^Depreciation — (.+?) — /;

/**
 * Roll back one posted depreciation run (one journal per run, reference DEP-RUN-<monthEnd>).
 * Voids the run's journal entry and, for each asset line (tagged [ASSET:id]),
 * subtracts the posted amount from accumulated_depreciation, recomputes
 * net_book_value (purchase_price - accumulated) and restores
 * last_depreciation_date to the asset's previous still-posted run date (null if none).
 * Runs on or before the accounting lock date cannot be rolled back.
 */
export default function RollbackDepreciationModal({ open, onClose, onComplete }) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [month, setMonth] = useState(defaultMonth);
  const [lockDate, setLockDate] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [run, setRun] = useState(null);          // journal entry of the run
  const [rows, setRows] = useState([]);          // { assetId, name, amount }
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMonth(defaultMonth);
    setSearched(false);
    setRun(null);
    setRows([]);
    (async () => {
      try {
        const settingsList = await base44.entities.AccountingSettings.list("-created_date", 10).catch(() => []);
        const list = Array.isArray(settingsList) ? settingsList : (settingsList?.items || []);
        setLockDate(list[0]?.lock_date || null);
      } catch {}
    })();
  }, [open]);

  const runDate = monthEnd(month);
  const lockedByPeriod = !!(lockDate && runDate <= lockDate);

  const handleFind = async () => {
    setSearching(true);
    setSearched(false);
    setRun(null);
    setRows([]);
    try {
      const ref = depRunReference(runDate);
      const page = await base44.entities.JournalEntry.filter({ reference: ref, status: "Posted" }, { limit: 10 });
      const list = Array.isArray(page) ? page : (page?.items || []);
      const je = list[0] || null;
      setRun(je);
      if (je) {
        const byAsset = {};
        for (const l of je.lines || []) {
          const debit = Number(l.debit) || 0;
          if (debit <= 0) continue;
          const desc = l.description || "";
          const tag = desc.match(/\[ASSET:([^\]]+)\]/);
          if (!tag) continue;
          const name = desc.match(LINE_RE)?.[1] || tag[1];
          const prevTag = desc.match(/\[PREV:([^\]]+)\]/);
          const prevParts = prevTag ? prevTag[1].split("|") : null;
          if (!byAsset[tag[1]]) byAsset[tag[1]] = {
            assetId: tag[1], name, amount: 0,
            prevLastDep: prevParts ? (prevParts[0] === "-" ? null : prevParts[0]) : undefined,
            prevPeriod: prevParts ? (Number(prevParts[1]) || 0) : undefined,
          };
          byAsset[tag[1]].amount += debit;
        }
        setRows(Object.values(byAsset).sort((a, b) => a.name.localeCompare(b.name)));
      }
    } catch (e) {
      toast.error(e?.message || "Could not look up the run");
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  const totalAmount = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows]);

  const handleRollback = async () => {
    if (!run || !rows.length) return;
    setRunning(true);
    try {
      // Re-fetch the run journal to be sure it is still posted
      const freshPage = await base44.entities.JournalEntry.filter({ reference: run.reference, status: "Posted" }, { limit: 10 });
      const fresh = (Array.isArray(freshPage) ? freshPage : (freshPage?.items || [])).find(j => j.id === run.id);
      if (!fresh) {
        toast.error("This run is no longer posted — nothing to roll back.");
        setRunning(false);
        return;
      }

      const allAssets = await base44.entities.Asset.list("name", 5000);
      const assetsById = Object.fromEntries((allAssets || []).map(a => [a.id, a]));

      // Earlier still-posted depreciation runs (to restore last_depreciation_date)
      const priorPage = await base44.entities.JournalEntry.filter(
        { status: "Posted", date: { $lt: run.date } },
        { limit: 5000 }
      );
      const priorRuns = (Array.isArray(priorPage) ? priorPage : (priorPage?.items || []))
        .filter(j => (j.reference || "").startsWith("DEP-RUN-"));

      let reversed = 0;
      const failed = [];
      for (const row of rows) {
        const asset = assetsById[row.assetId];
        if (!asset) { failed.push(`${row.name} (asset not found)`); continue; }
        const tag = assetTag(asset.id);
        // Exact pre-post state recorded in the journal line wins; otherwise fall
        // back to the asset's previous still-posted run date.
        const prev = row.prevLastDep !== undefined
          ? row.prevLastDep
          : priorRuns
              .filter(j => (j.lines || []).some(l => (l.description || "").includes(tag)))
              .map(j => j.date)
              .sort()
              .pop() || null;
        const prevPeriod = row.prevPeriod !== undefined ? row.prevPeriod : 0;
        const newAccumulated = Math.max(0, (Number(asset.accumulated_depreciation) || 0) - row.amount);
        const cost = Number(asset.purchase_price) || 0;
        try {
          await base44.entities.Asset.update(asset.id, {
            accumulated_depreciation: Math.round(newAccumulated * 100) / 100,
            net_book_value: Math.round((cost - newAccumulated) * 100) / 100,
            period_depreciation: prevPeriod,
            last_depreciation_date: prev,
          });
          reversed++;
        } catch {
          failed.push(row.name);
        }
      }

      await base44.entities.JournalEntry.update(run.id, { status: "Voided" });

      if (failed.length) {
        toast.warning(`Journal voided, ${reversed} asset(s) reversed — failed: ${failed.join(", ")}`);
      } else {
        toast.success(`Rollback complete — journal ${run.number || ""} voided, ${reversed} asset(s) reversed`);
      }
      onComplete();
    } catch (e) {
      toast.error(e?.message || "Rollback failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-600" />
            Rollback Depreciation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>This <strong>voids</strong> the journal entry of one depreciation run and <strong>reverses</strong> accumulated depreciation on every asset in it, restoring each asset's previous depreciation state.</span>
          </div>

          {/* Run selector */}
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <p className="text-sm font-semibold text-foreground mb-3">Select run to roll back</p>
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">Run month</Label>
                <Input type="month" value={month} onChange={e => { setMonth(e.target.value); setSearched(false); setRun(null); setRows([]); }}
                  className="h-9 w-44" />
              </div>
              <Button size="sm" onClick={handleFind} disabled={searching || !month} className="h-9" variant="outline">
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find Run"}
              </Button>
            </div>
            {lockedByPeriod && (
              <p className="flex items-center gap-1.5 text-xs text-red-600 mt-2">
                <Lock className="w-3.5 h-3.5" /> This run is on or before the lock date ({lockDate}) and cannot be rolled back.
              </p>
            )}
          </div>

          {/* Results */}
          {searched && !searching && (
            !run ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground">No posted depreciation run found for {formatDateOnly(runDate, "monthYear")}.</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/40 border-b border-border text-xs text-muted-foreground flex items-center justify-between">
                  <span>Journal <strong className="text-foreground">{run.number || run.id.slice(-6)}</strong> · {fmtDate(run.date)} · {run.narration}</span>
                  <span className="font-semibold text-amber-700">{fmtCurrency(run.total_debit)}</span>
                </div>
                <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/20 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <span className="col-span-8">Asset</span>
                  <span className="col-span-4 text-right">Amount to reverse</span>
                </div>
                {rows.map((r, i) => (
                  <div key={r.assetId} className={`grid grid-cols-12 gap-2 px-4 py-2.5 border-b border-border/50 text-sm ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                    <span className="col-span-8 truncate text-foreground">{r.name}</span>
                    <span className="col-span-4 text-right font-mono text-amber-700">{fmtCurrency(r.amount)}</span>
                  </div>
                ))}
                <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/30 text-sm font-semibold border-t border-border">
                  <span className="col-span-8 text-foreground">{rows.length} asset(s) — total to reverse</span>
                  <span className="col-span-4 text-right font-mono text-amber-700">{fmtCurrency(totalAmount)}</span>
                </div>
              </div>
            )
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
            {run && rows.length > 0 && !lockedByPeriod && (
              <Button onClick={handleRollback} disabled={running} variant="destructive" className="gap-2">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {running ? "Rolling back…" : `Rollback ${rows.length} asset(s)`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
