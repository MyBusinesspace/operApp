import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock, Save } from "lucide-react";
import { format } from "date-fns";
import { isoToTzDatetimeLocal, tzDatetimeLocalToISO, tzTime, tzDateKey } from "@/lib/timezones";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";

function toLocalDatetimeValue(isoString, tz) {
  return isoToTzDatetimeLocal(isoString, tz);
}

function diffMinutes(a, b) {
  if (!a || !b) return null;
  return Math.round((new Date(b) - new Date(a)) / 60000);
}

function fmtDuration(mins) {
  if (mins == null || mins < 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Modal for manager to directly edit a TimeEntry's clock-in/out times
// Can be used on a pending amendment OR directly on a time entry
export default function AmendmentEditModal({ open, onClose, entry, amendment, onSaved }) {
  const orgTz = useOrgTimezone();
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && entry) {
      // Pre-fill with amendment's suggested times if available, else entry's actual times
      setClockIn(toLocalDatetimeValue(amendment?.amended_clock_in || entry.clock_in_time, orgTz));
      setClockOut(toLocalDatetimeValue(amendment?.amended_clock_out || entry.clock_out_time, orgTz));
      setNotes("");
    }
  }, [open, entry?.id, orgTz]);

  const clockInISO = clockIn ? tzDatetimeLocalToISO(clockIn, orgTz) : null;
  const clockOutISO = clockOut ? tzDatetimeLocalToISO(clockOut, orgTz) : null;
  const duration = diffMinutes(clockInISO, clockOutISO);

  const handleSave = async () => {
    if (!clockInISO) return;
    setSaving(true);

    // Update the time entry directly
    const update = { clock_in_time: clockInISO };
    if (clockOutISO) {
      update.clock_out_time = clockOutISO;
      if (duration != null) update.duration_minutes = duration;
    }
    await base44.entities.TimeEntry.update(entry.id, update);

    // If there's a pending amendment, mark it as approved with manager notes
    if (amendment?.id) {
      await base44.entities.TimeEntryAmendment.update(amendment.id, {
        status: "Approved",
        manager_notes: notes.trim() || "Edited directly by manager",
        amended_clock_in: clockInISO,
        amended_clock_out: clockOutISO,
      });
    }

    setSaving(false);
    onSaved?.();
    onClose();
  };

  if (!entry) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Time Entry</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Entry info */}
          <div className="bg-muted/40 rounded-lg px-3 py-2.5 space-y-0.5">
            <p className="text-xs text-muted-foreground font-medium">{entry.employee_name}</p>
            <p className="text-sm font-semibold text-foreground">{entry.task_title || "—"}</p>
            {entry.work_order_name && <p className="text-xs text-muted-foreground">{entry.work_order_name}</p>}
          </div>

          {/* Amendment reason (read-only) */}
          {amendment?.reason && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <p className="text-xs text-amber-700 font-medium mb-0.5">Employee's reason:</p>
              <p className="text-xs text-amber-800 italic">"{amendment.reason}"</p>
            </div>
          )}

          {/* Original times */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-muted/30 rounded-lg px-3 py-2">
              <p className="text-muted-foreground mb-0.5">Original In</p>
              <p className="font-mono font-semibold">{entry.clock_in_time ? `${tzTime(entry.clock_in_time, orgTz)} ${tzDateKey(entry.clock_in_time, orgTz).slice(8)}/${tzDateKey(entry.clock_in_time, orgTz).slice(5, 7)}` : "—"}</p>
            </div>
            <div className="bg-muted/30 rounded-lg px-3 py-2">
              <p className="text-muted-foreground mb-0.5">Original Out</p>
              <p className="font-mono font-semibold">{entry.clock_out_time ? `${tzTime(entry.clock_out_time, orgTz)} ${tzDateKey(entry.clock_out_time, orgTz).slice(8)}/${tzDateKey(entry.clock_out_time, orgTz).slice(5, 7)}` : "—"}</p>
            </div>
          </div>

          {/* Edit fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Clock In *</Label>
              <Input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Clock Out</Label>
              <Input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)} />
            </div>
          </div>

          {duration != null && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="w-3.5 h-3.5" />
              New duration: <strong className="text-foreground">{fmtDuration(duration)}</strong>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Manager notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Corrected after review..."
              rows={2}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !clockIn} className="gap-1.5">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}