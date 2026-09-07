import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, History } from "lucide-react";

const num = (v) => (parseFloat(v) || 0);

export default function HistoricalPaymentModal({ open, employeeId, employeeName, paymentType, onClose, onSaved }) {
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const title = paymentType === "gratuity" ? "Annual Gratuity" : "Annual Leave Bonus";

  const handleSave = async () => {
    setError("");
    if (!amount || num(amount) <= 0) {
      setError("Enter a valid amount.");
      return;
    }
    if (!year) {
      setError("Enter a valid year.");
      return;
    }
    setSaving(true);
    try {
      // 1. Create the historical payment record
      await base44.entities.HistoricalPayment.create({
        employee_id: employeeId,
        employee_name: employeeName,
        payment_type: paymentType,
        year: parseInt(year),
        amount: num(amount),
        payment_date: paymentDate || null,
        notes: notes || `Historical ${title.toLowerCase()} for ${year}`,
      });

      // 2. Update the payroll profile's "last paid year" flag so the system
      //    knows this payment was already made (prevents auto-payment).
      const profiles = await base44.entities.EmployeePayrollProfile.filter({ employee_id: employeeId }, "-created_date", 1);
      if (profiles.length > 0) {
        const prof = profiles[0];
        const update = {};
        if (paymentType === "gratuity") {
          if (!prof.last_gratuity_year || parseInt(year) > prof.last_gratuity_year) {
            update.last_gratuity_year = parseInt(year);
          }
        } else {
          if (!prof.last_annual_bonus_year || parseInt(year) > prof.last_annual_bonus_year) {
            update.last_annual_bonus_year = parseInt(year);
          }
        }
        if (Object.keys(update).length > 0) {
          await base44.entities.EmployeePayrollProfile.update(prof.id, update).catch(() => {});
        }
      }

      onSaved?.();
      // reset
      setAmount("");
      setPaymentDate("");
      setNotes("");
      onClose();
    } catch (e) {
      console.error("Historical payment error:", e);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4 text-primary" />
            Record Historical {title}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            Record a {title.toLowerCase()} payment made before this system was in use, so the history and "last paid year" status are accurate.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">Year</Label>
            <Input type="number" value={year} onChange={e => setYear(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Amount (AED)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Payment Date (approx.)</Label>
            <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="h-9" />
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" className="h-9" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <History className="w-3.5 h-3.5" />}
            {saving ? "Saving…" : "Record Payment"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}