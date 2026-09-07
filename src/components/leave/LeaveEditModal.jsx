import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Loader2, Save } from "lucide-react";
import { differenceInCalendarDays, parseISO, format } from "date-fns";

const TYPE_LABELS = {
  vacation: "Vacation",
  sick: "Sick Leave",
  other: "Other",
  unjustified: "Unjustified Absence",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

export default function LeaveEditModal({ open, req, onClose, onSaved }) {
  const [form, setForm] = useState({
    leave_type: "vacation",
    status: "pending",
    start_date: "",
    end_date: "",
    reason: "",
    admin_notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (req) {
      setForm({
        leave_type: req.leave_type || "vacation",
        status: req.status || "pending",
        start_date: req.start_date || "",
        end_date: req.end_date || "",
        reason: req.reason || "",
        admin_notes: req.admin_notes || "",
      });
      setError("");
    }
  }, [req]);

  const totalDays = form.start_date && form.end_date
    ? Math.max(0, differenceInCalendarDays(parseISO(form.end_date), parseISO(form.start_date)) + 1)
    : 0;

  const handleSave = async () => {
    if (!form.start_date || !form.end_date) {
      setError("Start and end dates are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await base44.entities.LeaveRequest.update(req.id, {
        leave_type: form.leave_type,
        status: form.status,
        start_date: form.start_date,
        end_date: form.end_date,
        total_days: totalDays,
        reason: form.reason,
        admin_notes: form.admin_notes,
      });
      onSaved();
      onClose();
    } catch (e) {
      setError("Failed to save: " + e.message);
    }
    setSaving(false);
  };

  if (!req) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" /> Edit Leave Request
          </DialogTitle>
          <DialogDescription>
            <strong>{req.employee_name}</strong> — modify type, status, dates, and notes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Leave Type</Label>
              <Select
                value={form.leave_type}
                onValueChange={v => setForm({ ...form, leave_type: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">Vacation / Annual Leave</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="unjustified">Unjustified Absence</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select
                value={form.status}
                onValueChange={v => setForm({ ...form, status: v })}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })}
              />
            </div>
          </div>

          {form.start_date && form.end_date && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">{totalDays} calendar day(s)</Badge>
              <span className="text-[11px] text-muted-foreground">
                {format(parseISO(form.start_date), "dd MMM yyyy")} → {format(parseISO(form.end_date), "dd MMM yyyy")}
              </span>
            </div>
          )}

          <div>
            <Label className="text-xs">Reason</Label>
            <Textarea
              placeholder="Reason for the leave..."
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              rows={2}
            />
          </div>

          <div>
            <Label className="text-xs">Admin Notes</Label>
            <Textarea
              placeholder="Internal notes..."
              value={form.admin_notes}
              onChange={e => setForm({ ...form, admin_notes: e.target.value })}
              rows={2}
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}