import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Clock, CheckCircle2, Edit3, AlertCircle } from "lucide-react";
import { format } from "date-fns";

function toLocalDatetimeValue(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDisplay(isoString) {
  if (!isoString) return "—";
  return format(new Date(isoString), "dd MMM yyyy, HH:mm");
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

// entry: TimeEntry — clock_out_time may be null if the clock-out is happening now
// onConfirm(amendedClockIn, amendedClockOut) — called when user confirms
export default function ClockOutTimeReview({ entry, onConfirm, clockOutPhotoUrl, requireClockOutPhoto }) {
  const [editing, setEditing] = useState(false);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [nowISO] = useState(() => new Date().toISOString());

  useEffect(() => {
    if (entry) {
      setClockIn(toLocalDatetimeValue(entry.clock_in_time));
      // If no clock_out yet (active entry being clocked out now), use current time
      setClockOut(toLocalDatetimeValue(entry.clock_out_time || nowISO));
      setReason("");
      setEditing(false);
    }
  }, [entry?.id]);

  const originalIn = entry?.clock_in_time;
  // Use current time as the effective clock-out if not yet set
  const originalOut = entry?.clock_out_time || nowISO;

  const amendedInISO = clockIn ? new Date(clockIn).toISOString() : originalIn;
  const amendedOutISO = clockOut ? new Date(clockOut).toISOString() : originalOut;

  const hasChanged = clockIn !== toLocalDatetimeValue(originalIn) || clockOut !== toLocalDatetimeValue(originalOut);
  const duration = diffMinutes(amendedInISO, amendedOutISO);

  const handleConfirm = async () => {
    setSaving(true);

    // If times were changed, save an amendment request
    if (hasChanged) {
      await base44.entities.TimeEntryAmendment.create({
        time_entry_id: entry.id,
        employee_id: entry.employee_id,
        employee_name: entry.employee_name,
        task_id: entry.task_id,
        task_title: entry.task_title,
        original_clock_in: originalIn,
        original_clock_out: originalOut,
        amended_clock_in: amendedInISO,
        amended_clock_out: amendedOutISO,
        reason: reason.trim(),
        status: "Pending",
      }).catch(() => {});
    }

    setSaving(false);
    onConfirm(amendedInISO, amendedOutISO, hasChanged);
  };

  return (
    <div className="space-y-5">
      {/* Task info */}
      <div className="bg-muted/40 rounded-xl px-4 py-3 space-y-1">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Task</p>
        <p className="text-sm font-semibold text-foreground">{entry?.task_title || "—"}</p>
        {entry?.work_order_name && <p className="text-xs text-muted-foreground">{entry.work_order_name}</p>}
        {entry?.contact_name && <p className="text-xs text-muted-foreground">{entry.contact_name}</p>}
      </div>

      {/* Time summary */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <p className="text-xs text-green-600 font-medium mb-0.5">Clock In</p>
          <p className="text-sm font-bold text-green-800">{formatDisplay(originalIn)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs text-red-600 font-medium mb-0.5">Clock Out</p>
          <p className="text-sm font-bold text-red-800">{formatDisplay(originalOut)}</p>
        </div>
      </div>

      {/* Duration */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        Total duration: <strong className="text-foreground">{fmtDuration(diffMinutes(originalIn, originalOut))}</strong>
      </div>

      {/* Edit toggle */}
      {!editing ? (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex items-center gap-2 text-sm text-primary hover:underline"
        >
          <Edit3 className="w-3.5 h-3.5" /> Request time correction
        </button>
      ) : (
        <div className="space-y-4 border border-amber-200 bg-amber-50 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-semibold">
            <AlertCircle className="w-4 h-4" /> Time Correction Request
          </div>
          <p className="text-xs text-amber-600">
            Your original times are kept. This will send a correction request to management for approval.
          </p>

          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Corrected Clock In</Label>
              <Input type="datetime-local" value={clockIn} onChange={e => setClockIn(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Corrected Clock Out</Label>
              <Input type="datetime-local" value={clockOut} onChange={e => setClockOut(e.target.value)} />
            </div>
          </div>

          {duration != null && (
            <p className="text-xs text-amber-700">
              Corrected duration: <strong>{fmtDuration(duration)}</strong>
            </p>
          )}

          <div className="space-y-1">
            <Label className="text-xs">Reason for correction *</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why the times need to be corrected..."
              rows={2}
            />
          </div>

          <button
            type="button"
            onClick={() => { setEditing(false); setClockIn(toLocalDatetimeValue(originalIn)); setClockOut(toLocalDatetimeValue(originalOut)); setReason(""); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Cancel correction
          </button>
        </div>
      )}

      {/* Confirm button */}
      <Button
        className="w-full gap-2"
        onClick={handleConfirm}
        disabled={saving || (editing && hasChanged && !reason.trim()) || (requireClockOutPhoto && !clockOutPhotoUrl)}
      >
        {saving ? "Saving..." : (
          <>
            <CheckCircle2 className="w-4 h-4" />
            {hasChanged ? "Submit & Continue to Report" : "Confirm & Continue to Report"}
          </>
        )}
      </Button>

      {editing && hasChanged && !reason.trim() && (
        <p className="text-xs text-destructive text-center">Please provide a reason for the time correction.</p>
      )}
    </div>
  );
}