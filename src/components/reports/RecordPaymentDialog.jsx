import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { todayLocalISO } from "@/lib/dateOnly";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CreditCard, Lock } from "lucide-react";
import { toast } from "sonner";
import { recordPayment } from "@/lib/recordPayment";
import { getSingleton } from "@/lib/singletonSettings";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Record Payment dialog — used on the Aged Receivables / Aged Payables reports.
 *
 * Reuses the app's existing payment logic (recordPayment) so the payment is
 * recorded exactly as it would be from the invoice/bill detail page.
 *
 * Props:
 *   open: boolean
 *   docType: "invoice" | "bill"
 *   doc: full invoice/bill object
 *   onClose: () => void
 *   onSaved: () => void  — called after save so the parent can refresh
 */
export default function RecordPaymentDialog({ open, docType, doc, onClose, onSaved }) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [lockDate, setLockDate] = useState(null);
  const [lockError, setLockError] = useState(false);
  const [form, setForm] = useState({ amount: "", date: "", bank_account_id: "", bank_account_name: "", reference: "" });
  const [saving, setSaving] = useState(false);

  const outstanding = doc ? Math.max(0, (doc.total || 0) - (doc.amount_paid || 0)) : 0;

  useEffect(() => {
    if (!open) return;
    base44.entities.BankAccount.filter({ status: "Active" }).then(setBankAccounts).catch(() => {});
    // A failed lock-date read must never look like "no lock".
    (async () => {
      try {
        const settingsRec = await getSingleton(base44.entities.AccountingSettings, "AccountingSettings");
        setLockDate(settingsRec?.lock_date || null);
        setLockError(false);
      } catch (e) {
        console.error("Could not read the accounting lock date:", e);
        setLockError(true);
        toast.error("Could not load the accounting lock date — the period is treated as locked until settings load.");
      }
    })();
  }, [open]);

  useEffect(() => {
    if (open && doc) {
      setForm({
        amount: outstanding.toFixed(2),
        date: todayLocalISO(),
        bank_account_id: "",
        bank_account_name: "",
        reference: "",
      });
    }
  }, [open, doc]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.date) { toast.error("Payment date is required"); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Amount must be greater than 0"); return; }
    if (Number(form.amount) > outstanding) { toast.error(`Amount cannot exceed outstanding (${num(outstanding)})`); return; }
    if (!form.bank_account_id) { toast.error("Please select a bank account"); return; }

    if (lockError) {
      toast.error("The accounting lock date could not be loaded, so the period is treated as locked. Try again in a moment.");
      return;
    }
    if (lockDate && form.date <= lockDate) {
      toast.error(`Payment date must be after the accounting lock date (${lockDate})`);
      return;
    }

    setSaving(true);
    try {
      await recordPayment(docType, doc, form, true, doc.currency);
      toast.success("Payment recorded");
      onSaved();
    } catch (err) {
      toast.error("Failed to record payment: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-primary" />
            Record Payment — {doc.number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          {/* Outstanding info */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{docType === "invoice" ? "Invoice" : "Bill"} total</p>
              <p className="text-sm font-mono font-semibold text-foreground">{num(doc.total)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="text-sm font-mono font-semibold text-destructive">{num(outstanding)}</p>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1">
            <Label className="text-xs">Amount</Label>
            <Input type="number" step="0.01" value={form.amount}
              onChange={(e) => set("amount", e.target.value)} className="h-9" />
            {Number(form.amount) > outstanding && (
              <p className="text-xs text-destructive">Cannot exceed outstanding ({num(outstanding)})</p>
            )}
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label className="text-xs">Payment date</Label>
            <Input type="date" value={form.date} onChange={(e) => set("date", e.target.value)} className="h-9" />
            {lockDate && form.date <= lockDate && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <Lock className="w-3 h-3" /> Date is on or before the lock date ({lockDate})
              </p>
            )}
          </div>

          {/* Bank account */}
          <div className="space-y-1">
            <Label className="text-xs">Bank account</Label>
            <Select value={form.bank_account_id} onValueChange={(v) => {
              const acc = bankAccounts.find((b) => b.id === v);
              set("bank_account_id", v);
              set("bank_account_name", acc?.name || "");
            }}>
              <SelectTrigger><SelectValue placeholder="Select bank account…" /></SelectTrigger>
              <SelectContent>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.account_number ? ` (${b.account_number})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference */}
          <div className="space-y-1">
            <Label className="text-xs">Reference <span className="text-muted-foreground/50">(optional)</span></Label>
            <Input value={form.reference} onChange={(e) => set("reference", e.target.value)}
              className="h-9" placeholder="Cheque / ref" />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {saving ? "Saving…" : "Record payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}