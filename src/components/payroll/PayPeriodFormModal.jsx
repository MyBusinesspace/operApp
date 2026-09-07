import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, addMonths } from "date-fns";
import PayPeriodWorkerSelector from "./PayPeriodWorkerSelector";

export default function PayPeriodFormModal({ open, onClose, onCreate, saving, defaults }) {
  const today = new Date();
  const defaultStart = format(startOfMonth(today), "yyyy-MM-dd");
  const defaultEnd   = format(endOfMonth(today), "yyyy-MM-dd");

  const [form, setForm] = useState(defaults || {
    name: format(today, "MMMM yyyy"),
    start_date: defaultStart,
    end_date: defaultEnd,
    pay_date: format(new Date(today.getFullYear(), today.getMonth(), 25), "yyyy-MM-dd"),
    notes: "",
    selected_employee_ids: [],
  });

  const set = (field, value) => {
    const updated = { ...form, [field]: value };
    // Auto-generate name when dates change
    if (field === "start_date") {
      try { updated.name = format(new Date(value), "MMMM yyyy"); } catch {}
    }
    setForm(updated);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate({ ...form, status: "draft" });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{defaults ? "Duplicate Pay Period" : "New Pay Period"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. June 2025" required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">End Date</Label>
              <Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Pay Date</Label>
            <Input type="date" value={form.pay_date} onChange={e => set("pay_date", e.target.value)} required />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Notes (optional)</Label>
            <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Any notes..." />
          </div>
          <PayPeriodWorkerSelector
            selectedIds={form.selected_employee_ids || []}
            onChange={(ids) => set("selected_employee_ids", ids)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> Creating…</> : "Create Pay Period"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}