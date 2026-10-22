import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Save, AlertTriangle } from "lucide-react";

function toLocalDatetimeInput(isoStr) {
  if (!isoStr) return "";
  const d = new Date(isoStr);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

function fmtMins(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}

function fmtTime(isoStr) {
  if (!isoStr) return "—";
  const d = new Date(isoStr);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function OvertimeEntryEditModal({ entry, settings, onClose, onSaved }) {
  const [clockIn, setClockIn] = useState(toLocalDatetimeInput(entry?.clock_in_time));
  const [clockOut, setClockOut] = useState(toLocalDatetimeInput(entry?.clock_out_time));
  const [saving, setSaving] = useState(false);
  const [siblingEntries, setSiblingEntries] = useState([]);

  // Load other time entries for the same employee (to detect overlaps on save)
  useEffect(() => {
    if (!entry?.employee_id) return;
    let active = true;
    (async () => {
      try {
        const [comp, sw] = await Promise.all([
          base44.entities.TimeEntry.filter({ employee_id: entry.employee_id, status: "Completed" }, "-clock_in_time", 5000),
          base44.entities.TimeEntry.filter({ employee_id: entry.employee_id, status: "Switched" }, "-clock_in_time", 5000),
        ]);
        if (!active) return;
        const all = [...(comp || []), ...(sw || [])].filter(e => e.id !== entry.id && e.clock_in_time && e.clock_out_time);
        setSiblingEntries(all);
      } catch {
        /* ignore — overlap check is best-effort */
      }
    })();
    return () => { active = false; };
  }, [entry?.employee_id, entry?.id]);

  // Detect overlapping sibling entries for the current edited range
  const overlaps = (() => {
    if (!clockIn || !clockOut) return [];
    const cin = new Date(clockIn);
    const cout = new Date(clockOut);
    if (!(cout > cin)) return [];
    return siblingEntries.filter(e => {
      const oIn = new Date(e.clock_in_time);
      const oOut = new Date(e.clock_out_time);
      // Ranges overlap when cin < oOut AND oIn < cout
      return cin < oOut && oIn < cout;
    });
  })();

  const handleSave = async () => {
    if (!clockIn || !clockOut || overlaps.length > 0) return;
    setSaving(true);
    try {
      const cin = new Date(clockIn);
      const cout = new Date(clockOut);
      const duration = Math.round((cout - cin) / 60000);
      await base44.entities.TimeEntry.update(entry.id, {
        clock_in_time: cin.toISOString(),
        clock_out_time: cout.toISOString(),
        duration_minutes: duration,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await base44.entities.TimeEntry.delete(entry.id);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  // Live OT preview after edit
  const previewOT = () => {
    if (!clockIn || !clockOut) return null;
    const cin = new Date(clockIn);
    const cout = new Date(clockOut);
    if (cout <= cin) return { totalMins: 0, overtimeMins: 0, invalid: true };
    const totalMins = Math.round((cout - cin) / 60000);
    let overtimeMins = 0;
    if (settings?.overtime_use_clock_time !== false && settings?.shift_end_time) {
      const [endH, endM] = settings.shift_end_time.split(":").map(Number);
      const shiftEnd = new Date(cin);
      shiftEnd.setHours(endH, endM, 0, 0);
      if (cout > shiftEnd) overtimeMins = Math.round((cout - shiftEnd) / 60000);
    } else {
      const thresholdMins = (settings?.overtime_threshold_daily_h || 8) * 60;
      overtimeMins = Math.max(0, totalMins - thresholdMins);
    }
    return { totalMins, overtimeMins };
  };
  const preview = previewOT();

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Rectify Time Entry
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{entry?.employee_name}</span> · {entry?.task_title || "No task"}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Clock In</Label>
              <Input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Clock Out</Label>
              <Input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)} />
            </div>
          </div>
          {preview && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total duration:</span>
                <span className="font-mono font-bold">{fmtMins(preview.totalMins)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Overtime after edit:</span>
                <span className="font-mono font-bold text-amber-700">{preview.overtimeMins > 0 ? fmtMins(preview.overtimeMins) : "—"}</span>
              </div>
            </div>
          )}
          {overlaps.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 font-semibold text-red-700">
                <AlertTriangle className="w-4 h-4" />
                Overlaps with {overlaps.length} other {overlaps.length === 1 ? "entry" : "entries"}
              </div>
              <div className="space-y-1">
                {overlaps.map(o => (
                  <div key={o.id} className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-2 text-xs text-red-600">
                    <span className="break-words">{o.task_title || "No task"}</span>
                    <span className="font-mono whitespace-nowrap sm:text-right">{fmtTime(o.clock_in_time)} → {fmtTime(o.clock_out_time)}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-red-600/80">Cannot save — this range overlaps existing time entries. Adjust the times to avoid the overlap.</p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={saving} className="gap-1.5">
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !clockIn || !clockOut || overlaps.length > 0} className="gap-1.5">
            <Save className="w-3.5 h-3.5" /> {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}