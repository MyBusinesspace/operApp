import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { MapPin, Clock, User, Briefcase, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { tzTime, tzDateKey } from "@/lib/timezones";
import { useOrgTimezone } from "@/hooks/useOrgTimezone";
import TimeEntryMap from "./TimeEntryMap";

function formatDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function TimeEntryDetailModal({ open, entry, onClose }) {
  const [task, setTask] = useState(null);
  const orgTz = useOrgTimezone();

  useEffect(() => {
    if (open && entry?.task_id) {
      base44.entities.Task.filter({ id: entry.task_id }).then(res => setTask(res[0] || null)).catch(() => {});
    }
  }, [open, entry]);

  if (!entry) return null;

  // Compute duration from actual clock in/out times so it always reflects amended times
  const computedDuration = (entry.clock_in_time && entry.clock_out_time)
    ? Math.max(0, Math.round((new Date(entry.clock_out_time) - new Date(entry.clock_in_time)) / 60000))
    : entry.duration_minutes;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Time Entry Detail</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">

          {/* Status + duration */}
          <div className="flex items-center justify-between gap-3">
            <Badge variant="outline" className="text-xs font-medium">{entry.status}</Badge>
            <span className="font-mono text-lg font-bold text-foreground">{formatDuration(computedDuration)}</span>
          </div>

          {/* Core info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1"><User className="w-3 h-3" /> Employee</p>
              <p className="font-medium text-foreground">{entry.employee_name || "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1"><Briefcase className="w-3 h-3" /> Task</p>
              <p className="font-medium text-foreground">{entry.task_title}</p>
            </div>
            {entry.work_order_name && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">Work Order</p>
                <p className="font-medium text-foreground">{entry.work_order_name}</p>
              </div>
            )}
            {entry.contact_name && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">Contact</p>
                <p className="font-medium text-foreground">{entry.contact_name}</p>
              </div>
            )}
            {entry.project_name && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">Project</p>
                <p className="font-medium text-foreground">{entry.project_name}</p>
              </div>
            )}
            {entry.asset_name && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground font-medium">Asset</p>
                <p className="font-medium text-foreground">{entry.asset_name}</p>
              </div>
            )}
          </div>

          {/* Times */}
          <div className="grid grid-cols-2 gap-3 bg-muted/30 rounded-xl p-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-1"><Clock className="w-3 h-3" /> Clock In</p>
              <p className="font-medium">{entry.clock_in_time ? `${tzDateKey(entry.clock_in_time, orgTz)} ${tzTime(entry.clock_in_time, orgTz)}:${format(new Date(entry.clock_in_time), "ss")}` : "—"}</p>
              {entry.clock_in_address && <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1"><MapPin className="w-3 h-3 shrink-0 mt-0.5" />{entry.clock_in_address}</p>}
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-1"><Clock className="w-3 h-3" /> Clock Out</p>
              <p className="font-medium">{entry.clock_out_time ? `${tzDateKey(entry.clock_out_time, orgTz)} ${tzTime(entry.clock_out_time, orgTz)}:${format(new Date(entry.clock_out_time), "ss")}` : "—"}</p>
              {entry.clock_out_address && <p className="text-xs text-muted-foreground mt-1 flex items-start gap-1"><MapPin className="w-3 h-3 shrink-0 mt-0.5" />{entry.clock_out_address}</p>}
            </div>
          </div>

          {/* On-site status */}
          {entry.on_site != null && (
            <div className={`flex items-center gap-2 p-3 rounded-xl text-sm font-medium ${entry.on_site ? "bg-green-50 text-green-700 border border-green-200" : "bg-orange-50 text-orange-700 border border-orange-200"}`}>
              {entry.on_site ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {entry.on_site ? "Employee was On Site" : "Employee was Off Site"}
              {entry.distance_from_task_m != null && ` — ${entry.distance_from_task_m}m from task location`}
            </div>
          )}

          {/* Map */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Location Map</p>
            <TimeEntryMap entry={entry} task={task} />
            <p className="text-xs text-muted-foreground mt-1.5">
              <span className="inline-flex items-center gap-1 mr-3">🔵 Task site + radius</span>
              <span className="inline-flex items-center gap-1 mr-3">🟢 Clock in</span>
              <span className="inline-flex items-center gap-1">🔴 Clock out</span>
            </p>
          </div>

          {entry.notes && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-foreground">{entry.notes}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}