import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, RotateCcw, AlertTriangle, Check } from "lucide-react";
import { toast } from "sonner";

function fmtCurrency(v) {
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function RollbackDepreciationModal({ open, onClose, onComplete }) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);
  const [entries, setEntries] = useState([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(defaultTo);
      setConfirmed(false);
      setEntries([]);
    }
  }, [open]);

  const handleConfirm = async () => {
    setLoadingEntries(true);
    // Find journal entries in the date range that are depreciation entries (source_type Manual, narration contains "Depreciation")
    const allJournals = await base44.entities.JournalEntry.filter({ status: "Posted" });
    const inRange = allJournals.filter(j => {
      if (!j.date) return false;
      return j.date >= from && j.date <= to && j.narration?.toLowerCase().includes("depreciation");
    });
    setEntries(inRange);
    setConfirmed(true);
    setLoadingEntries(false);
  };

  const totalAmount = useMemo(() => {
    return entries.reduce((sum, j) => sum + (j.total_debit || 0), 0);
  }, [entries]);

  const handleRollback = async () => {
    if (!entries.length) return;
    if (!confirm(`This will void ${entries.length} journal entry(s) and reverse accumulated depreciation. Continue?`)) return;

    setRunning(true);

    // Group by asset: parse asset name from narration "Depreciation — {asset name} — {month}"
    const assetReversal = {}; // asset name -> amount to reverse

    for (const j of entries) {
      // Void the journal entry
      await base44.entities.JournalEntry.update(j.id, { status: "Voided" });

      // Extract amount from total_debit
      const amount = j.total_debit || 0;
      // Try to extract asset name from narration
      const match = j.narration?.match(/^Depreciation — (.+?) — /);
      if (match) {
        const assetName = match[1];
        assetReversal[assetName] = (assetReversal[assetName] || 0) + amount;
      }
    }

    // Find assets by name and reverse accumulated depreciation
    const allAssets = await base44.entities.Asset.list("name", 500);
    let reversed = 0;
    for (const [assetName, amount] of Object.entries(assetReversal)) {
      const asset = allAssets.find(a => a.name === assetName);
      if (asset) {
        const newAccumulated = Math.max(0, (asset.accumulated_depreciation || 0) - amount);
        await base44.entities.Asset.update(asset.id, {
          accumulated_depreciation: newAccumulated,
          last_depreciation_date: null,
        });
        reversed++;
      }
    }

    toast.success(`Rollback complete — ${entries.length} journal entries voided, ${reversed} asset(s) reversed`);
    setRunning(false);
    onComplete();
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
            <span>This will <strong>void</strong> depreciation journal entries in the selected period and <strong>reverse</strong> accumulated depreciation on the affected assets.</span>
          </div>

          {/* Period selector */}
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <p className="text-sm font-semibold text-foreground mb-3">Select Period to Rollback</p>
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setConfirmed(false); setEntries([]); }}
                  className="h-9 w-44" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={e => { setTo(e.target.value); setConfirmed(false); setEntries([]); }}
                  className="h-9 w-44" />
              </div>
              <Button size="sm" onClick={handleConfirm} disabled={loadingEntries} className="h-9" variant="outline">
                {loadingEntries ? <Loader2 className="w-4 h-4 animate-spin" /> : "Find Entries"}
              </Button>
            </div>
          </div>

          {/* Results table */}
          {confirmed && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="col-span-1"><Check className="w-3.5 h-3.5" /></span>
                <span className="col-span-5">Journal Entry Narration</span>
                <span className="col-span-3">Date</span>
                <span className="col-span-3 text-right">Amount</span>
              </div>

              {entries.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-muted-foreground">No depreciation journal entries found in this period.</p>
                </div>
              ) : (
                <>
                  {entries.map((j, i) => (
                    <div key={j.id}
                      className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/50 text-sm ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                      <div className="col-span-1 flex items-center">
                        <span className="w-4 h-4 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center">
                          <RotateCcw className="w-2.5 h-2.5 text-amber-600" />
                        </span>
                      </div>
                      <div className="col-span-5">
                        <p className="text-sm text-foreground truncate">{j.narration}</p>
                        <p className="text-xs text-muted-foreground">#{j.number || j.id.slice(-6)}</p>
                      </div>
                      <div className="col-span-3 flex items-center text-xs text-muted-foreground">{fmtDate(j.date)}</div>
                      <div className="col-span-3 flex items-center justify-end font-mono text-sm font-semibold text-amber-700">
                        {fmtCurrency(j.total_debit)}
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/30 text-sm font-semibold border-t border-border">
                    <span className="col-span-9 text-foreground">Total to reverse</span>
                    <span className="col-span-3 text-right font-mono text-amber-700">{fmtCurrency(totalAmount)}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
            {confirmed && entries.length > 0 && (
              <Button
                onClick={handleRollback}
                disabled={running}
                variant="destructive"
                className="gap-2"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                {running ? "Rolling back…" : `Rollback ${entries.length} Entry(s)`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}