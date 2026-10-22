import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Scale, AlertTriangle, Check } from "lucide-react";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Preview + confirm dialog for the Opening Balance journal.
 * Called after a Trial Balance import. Calls generateOpeningBalance in
 * dry-run to show the user what will be created, then on confirm calls it
 * with dry_run=false to actually generate the journal.
 */
export default function OpeningBalanceGenerateDialog({ open, onDone, onClose }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const loadPreview = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await base44.functions.invoke("generateOpeningBalance", { dry_run: true });
      setPreview(res.data);
    } catch (err) {
      setError(err.message || "Failed to preview opening balance");
    }
    setLoading(false);
  };

  const handleConfirm = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await base44.functions.invoke("generateOpeningBalance", { dry_run: false });
      setGenerating(false);
      onDone(res.data);
    } catch (err) {
      setError(err.message || "Failed to generate opening balance");
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !generating) { onClose(); } }}>
      <DialogContent className="max-w-lg" onOpenAutoFocus={loadPreview}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-4 h-4" /> Generate Opening Balance Journal
          </DialogTitle>
          <DialogDescription>
            Creates a single journal entry dated the day before your earliest GL transaction, posting all Chart of Accounts opening balances into the ledger so every report includes them automatically.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Computing opening balances…</span>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          </div>
        )}

        {preview && !loading && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground">Conversion Date</p>
                <p className="text-sm font-semibold text-foreground">{preview.conversion_date}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30 border border-border">
                <p className="text-xs text-muted-foreground">Lines</p>
                <p className="text-sm font-semibold text-foreground tabular-nums">{preview.line_count}</p>
              </div>
              <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-xs text-muted-foreground">Total Debit</p>
                <p className="text-sm font-semibold text-blue-600 tabular-nums">{num(preview.total_debit)}</p>
              </div>
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-xs text-muted-foreground">Total Credit</p>
                <p className="text-sm font-semibold text-emerald-600 tabular-nums">{num(preview.total_credit)}</p>
              </div>
            </div>

            {preview.would_replace && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>An existing opening balance journal ({preview.existing_entry?.number}) will be voided and replaced.</span>
              </div>
            )}

            {Math.abs(preview.balancing_amount) > 0.01 && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Trial balance is off by {num(Math.abs(preview.balancing_amount))}. A balancing line of {num(Math.abs(preview.balancing_amount))} will be posted to "{preview.balancing_account_name}"{preview.balancing_account_exists ? "" : " (will be created)"}.
                </span>
              </div>
            )}

            {preview.balanced && Math.abs(preview.balancing_amount) <= 0.01 && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">
                <Check className="w-4 h-4" /> Trial balance is balanced — no rounding line needed.
              </div>
            )}

            {preview.lines && preview.lines.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Code</th>
                      <th className="px-2 py-1.5 text-left font-semibold text-muted-foreground">Account</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-muted-foreground">Debit</th>
                      <th className="px-2 py-1.5 text-right font-semibold text-muted-foreground">Credit</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {preview.lines.map((l, i) => (
                      <tr key={i} className="hover:bg-muted/20">
                        <td className="px-2 py-1.5 font-mono text-foreground">{l.account_code || "—"}</td>
                        <td className="px-2 py-1.5 text-foreground max-w-[160px] truncate" title={l.account_name}>{l.account_name || "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{l.debit ? num(l.debit) : "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-foreground">{l.credit ? num(l.credit) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={generating}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading || generating || !preview}>
            {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : "Generate Opening Balance"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}