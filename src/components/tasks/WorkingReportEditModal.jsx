import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Convert ISO datetime string to value for <input type="datetime-local">
function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

// Convert datetime-local input value back to ISO string
function localInputToISO(localStr) {
  if (!localStr) return null;
  const d = new Date(localStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

function calcDurationMinutes(clockInISO, clockOutISO) {
  if (!clockInISO || !clockOutISO) return 0;
  const diff = new Date(clockOutISO).getTime() - new Date(clockInISO).getTime();
  return diff > 0 ? Math.round(diff / 60000) : 0;
}

function fmtDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function WorkingReportEditModal({ open, onClose, report, onSaved }) {
  const [workDescription, setWorkDescription] = useState("");
  const [balanceWork, setBalanceWork] = useState("");
  const [clientComments, setClientComments] = useState("");
  const [siteItems, setSiteItems] = useState([]);
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [timeEntryId, setTimeEntryId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !report) return;
    setWorkDescription(report.report_work_description || "");
    setBalanceWork(report.report_balance_work || "");
    setClientComments(report.report_client_comments || "");
    setSiteItems((report.report_site_items || []).map(it => ({ ...it })));
    setClockIn(isoToLocalInput(report.clock_in_time));
    setClockOut(isoToLocalInput(report.clock_out_time));
    setTimeEntryId(report.time_entry_id || null);
    setError("");
  }, [open, report?.id]);

  const duration = calcDurationMinutes(localInputToISO(clockIn), localInputToISO(clockOut));

  const updateSiteItem = (idx, patch) => {
    setSiteItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };
  const addSiteItem = () => {
    setSiteItems(prev => [...prev, { description: "", done: false }]);
  };
  const removeSiteItem = (idx) => {
    setSiteItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    setError("");
    try {
      const clockInISO = localInputToISO(clockIn);
      const clockOutISO = localInputToISO(clockOut);
      const dur = calcDurationMinutes(clockInISO, clockOutISO);

      // 1. Update WorkingReport text fields + cached times
      const reportPatch = {
        report_work_description: workDescription,
        report_balance_work: balanceWork,
        report_client_comments: clientComments,
        report_site_items: siteItems,
      };
      if (clockInISO) reportPatch.clock_in_time = clockInISO;
      if (clockOutISO) reportPatch.clock_out_time = clockOutISO;
      reportPatch.duration_minutes = dur;

      const updated = await base44.entities.WorkingReport.update(report.id, reportPatch);

      // 2. Update underlying TimeEntry times if linked
      if (timeEntryId && (clockInISO || clockOutISO)) {
        const tePatch = {};
        if (clockInISO) tePatch.clock_in_time = clockInISO;
        if (clockOutISO) tePatch.clock_out_time = clockOutISO;
        tePatch.duration_minutes = dur;
        try {
          await base44.entities.TimeEntry.update(timeEntryId, tePatch);
        } catch (teErr) {
          console.warn("Failed to update TimeEntry times", teErr);
        }
      }

      onSaved?.({ ...report, ...updated });
      onClose();
    } catch (e) {
      console.error("Failed to save working report", e);
      setError(e?.message || "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!report) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">Edit Working Report — {report.reference || "—"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Time section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Time</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Clock In</Label>
                <Input
                  type="datetime-local"
                  value={clockIn}
                  onChange={e => setClockIn(e.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Clock Out</Label>
                <Input
                  type="datetime-local"
                  value={clockOut}
                  onChange={e => setClockOut(e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              Duration: <span className="font-medium text-foreground tabular-nums">{fmtDuration(duration)}</span>
              {timeEntryId && <span className="ml-2 text-muted-foreground/60">· updates linked TimeEntry</span>}
            </div>
          </div>

          {/* Report text section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Report Details</h3>
            <div className="space-y-1.5">
              <Label className="text-xs">Describe your work</Label>
              <Textarea
                value={workDescription}
                onChange={e => setWorkDescription(e.target.value)}
                rows={3}
                disabled={saving}
                placeholder="What work was performed..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Balance work</Label>
              <Textarea
                value={balanceWork}
                onChange={e => setBalanceWork(e.target.value)}
                rows={2}
                disabled={saving}
                placeholder="Remaining / pending work..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Client comments</Label>
              <Textarea
                value={clientComments}
                onChange={e => setClientComments(e.target.value)}
                rows={2}
                disabled={saving}
                placeholder="Client feedback..."
              />
            </div>
          </div>

          {/* Site checklist */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Site Checklist</h3>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addSiteItem} disabled={saving}>
                <Plus className="w-3 h-3" /> Add item
              </Button>
            </div>
            {siteItems.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No checklist items.</p>
            ) : (
              <div className="space-y-1.5">
                {siteItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Checkbox
                      checked={!!item.done}
                      onCheckedChange={(v) => updateSiteItem(idx, { done: !!v })}
                      disabled={saving}
                    />
                    <Input
                      value={item.description || ""}
                      onChange={e => updateSiteItem(idx, { description: e.target.value })}
                      disabled={saving}
                      className="h-8 text-sm"
                      placeholder="Checklist item..."
                    />
                    <button
                      type="button"
                      onClick={() => removeSiteItem(idx)}
                      disabled={saving}
                      className="p-1.5 rounded text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}