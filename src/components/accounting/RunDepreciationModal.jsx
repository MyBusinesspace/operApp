import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, TrendingDown, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

function fmtCurrency(v) {
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
}

function calcMonthlyDepr(asset) {
  const cost = asset.purchase_price || 0;
  const residual = asset.residual_value || 0;
  const method = asset.depreciation_method || "straight_line";
  const life = asset.useful_life_years || 0;
  const rate = asset.depreciation_rate || 0;
  const accumulated = asset.accumulated_depreciation || 0;
  const bookValue = cost - accumulated;

  if (bookValue <= residual + 0.01) return 0;

  let annual = 0;
  if (method === "straight_line" && life > 0) {
    annual = (cost - residual) / life;
  } else if (method === "diminishing_value" && rate > 0) {
    annual = (bookValue - residual) * (rate / 100);
  }
  if (!annual || annual <= 0) return 0;
  return Math.min(annual / 12, bookValue - residual);
}

export default function RunDepreciationModal({ open, assets, onClose, onComplete }) {
  // Default: from = first day of current month, to = last day of current month
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [confirmed, setConfirmed] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setTo(defaultTo);
      setConfirmed(false);
    }
  }, [open]);

  const eligible = useMemo(() => {
    return assets
      .filter(a =>
        a.accounting_status === "registered" &&
        a.purchase_price &&
        (a.useful_life_years || a.depreciation_rate)
      )
      .map(a => ({
        ...a,
        monthlyDepr: calcMonthlyDepr(a),
      }))
      .filter(a => a.monthlyDepr > 0);
  }, [assets]);

  const totalDepr = eligible.reduce((s, a) => s + a.monthlyDepr, 0);

  const handleRun = async () => {
    setRunning(true);
    const today = to;
    const monthLabel = new Date(to).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
    let posted = 0;

    for (const asset of eligible) {
      const lines = [];
      if (asset.depreciation_account_id) {
        lines.push({
          account_id: asset.depreciation_account_id,
          account_name: asset.depreciation_account_name || "Depreciation Expense",
          description: `Depreciation — ${asset.name} (${monthLabel})`,
          debit: asset.monthlyDepr,
          credit: 0,
        });
      }
      if (asset.accumulated_account_id) {
        lines.push({
          account_id: asset.accumulated_account_id,
          account_name: asset.accumulated_account_name || "Accumulated Depreciation",
          description: `Accumulated depreciation — ${asset.name} (${monthLabel})`,
          debit: 0,
          credit: asset.monthlyDepr,
        });
      }

      if (lines.length === 2) {
        await base44.entities.JournalEntry.create({
          date: today,
          narration: `Depreciation — ${asset.name} — ${monthLabel}`,
          source_type: "Manual",
          status: "Posted",
          total_debit: asset.monthlyDepr,
          total_credit: asset.monthlyDepr,
          lines,
        });
      }

      const newAccumulated = (asset.accumulated_depreciation || 0) + asset.monthlyDepr;
      await base44.entities.Asset.update(asset.id, {
        accumulated_depreciation: newAccumulated,
        last_depreciation_date: today,
      });
      posted++;
    }

    toast.success(`Depreciation run complete — ${posted} asset(s) processed`);
    setRunning(false);
    onComplete();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingDown className="w-5 h-5 text-violet-600" />
            Run Depreciation
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 pt-1">
          {/* Period selector */}
          <div className="p-4 rounded-xl border border-border bg-muted/20">
            <p className="text-sm font-semibold text-foreground mb-3">Depreciable Assets</p>
            <div className="flex items-end gap-4 flex-wrap">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setConfirmed(false); }}
                  className="h-9 w-44 bg-muted/40" readOnly />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input type="date" value={to} onChange={e => { setTo(e.target.value); setConfirmed(false); }}
                  className="h-9 w-44" />
              </div>
              {!confirmed && (
                <Button size="sm" onClick={() => setConfirmed(true)} className="h-9">
                  Confirm
                </Button>
              )}
            </div>
          </div>

          {/* Asset table */}
          {confirmed && (
            <div className="rounded-xl border border-border overflow-hidden">
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <span className="col-span-3">Asset</span>
                <span className="col-span-3">Accumulated Depr. Account</span>
                <span className="col-span-3">Depreciation Expense Account</span>
                <span className="col-span-2 text-right">Monthly Amount</span>
                <span className="col-span-1 text-right">Book Value</span>
              </div>

              {eligible.length === 0 ? (
                <div className="py-10 text-center">
                  <AlertTriangle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No eligible assets — set up depreciation settings first.</p>
                </div>
              ) : (
                <>
                  {eligible.map((a, i) => {
                    const bookValue = (a.purchase_price || 0) - (a.accumulated_depreciation || 0);
                    return (
                      <div key={a.id}
                        className={`grid grid-cols-12 gap-2 px-4 py-3 border-b border-border/50 text-sm hover:bg-muted/20 transition-colors ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                        <div className="col-span-3">
                          <p className="font-medium text-foreground text-sm truncate">{a.name}</p>
                          <p className="text-xs text-muted-foreground">{a.category} · {a.reference}</p>
                        </div>
                        <div className="col-span-3 flex items-center">
                          {a.accumulated_account_id ? (
                            <span className="text-xs text-foreground truncate">
                              {a.accumulated_account_name}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Not set
                            </span>
                          )}
                        </div>
                        <div className="col-span-3 flex items-center">
                          {a.depreciation_account_id ? (
                            <span className="text-xs text-foreground truncate">
                              {a.depreciation_account_name}
                            </span>
                          ) : (
                            <span className="text-xs text-amber-600 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Not set
                            </span>
                          )}
                        </div>
                        <div className="col-span-2 flex items-center justify-end">
                          <span className="text-sm font-mono font-semibold text-foreground">
                            {fmtCurrency(a.monthlyDepr)}
                          </span>
                        </div>
                        <div className="col-span-1 flex items-center justify-end">
                          <span className="text-xs font-mono text-primary">
                            {fmtCurrency(bookValue)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Total row */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/30 text-sm font-semibold border-t border-border">
                    <span className="col-span-9 text-foreground">Total</span>
                    <span className="col-span-2 text-right font-mono text-foreground">{fmtCurrency(totalDepr)}</span>
                    <span className="col-span-1" />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-1">
            <Button variant="outline" onClick={onClose} disabled={running}>Cancel</Button>
            {confirmed && eligible.length > 0 && (
              <Button onClick={handleRun} disabled={running} className="gap-2">
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingDown className="w-4 h-4" />}
                {running ? "Running…" : `Run Depreciation (${eligible.length} assets)`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}