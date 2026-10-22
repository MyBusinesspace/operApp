import React from "react";
import { formatDateValue } from "@/lib/dateOnly";
import { X, ChevronUp, ChevronDown, Pencil, Paperclip, ClipboardList, FolderKanban, User, Package, Calendar, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEffectiveStatus } from "@/lib/taskStatus";

const PRIORITY_STYLES = {
  Low:    "bg-slate-100 text-slate-500",
  Medium: "bg-blue-100 text-blue-700",
  High:   "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
};

const STATUS_STYLES = {
  Template:         "bg-cyan-100 text-cyan-700",
  Queued:           "bg-amber-100 text-amber-700",
  Scheduled:        "bg-violet-100 text-violet-700",
  "Not Completed":  "bg-orange-100 text-orange-700",
  Active:           "bg-orange-100 text-orange-700",
  Completed:        "bg-emerald-100 text-emerald-700",
  Archived:         "bg-slate-200 text-slate-500",
};

function fmtDate(d) {
  if (!d) return "—";
  return formatDateValue(d);
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground truncate">{value || "—"}</p>
      </div>
    </div>
  );
}

export default function TaskSplitDetail({ task, fileCount = 0, reportsCount = 0, subtasksCount = 0, onClose, onEdit, onPrev, onNext }) {
  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select a task to preview
      </div>
    );
  }

  const effStatus = getEffectiveStatus(task);

  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Files ({fileCount})
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onEdit?.(task)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onPrev} title="Previous">
            <ChevronUp className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onNext} title="Next">
            <ChevronDown className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close">
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{task.title || "Task"}</h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[effStatus] || "bg-muted text-muted-foreground"}`}>
                  {effStatus || "Queued"}
                </span>
                {task.priority && task.priority !== "Medium" && (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PRIORITY_STYLES[task.priority]}`}>
                    {task.priority}
                  </span>
                )}
                {task.category && (
                  <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">
                    {task.category}
                  </span>
                )}
              </div>
            </div>
          </div>
          {task.reference && <p className="text-sm text-muted-foreground font-mono mt-2">{task.reference}</p>}
        </div>

        <div className="px-6 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm border-b border-border">
          <InfoRow icon={ClipboardList} label="Work Order" value={task.work_order_name} />
          <InfoRow icon={FolderKanban} label="Project" value={task.project_name} />
          <InfoRow icon={User} label="Client" value={task.contact_name} />
          <InfoRow icon={Package} label="Asset" value={task.asset_name} />
          <InfoRow icon={Users} label="Workers" value={(task.assigned_employee_names || []).join(", ")} />
          <InfoRow icon={Calendar} label="Planning date" value={fmtDate(task.planning_date)} />
          <InfoRow icon={Clock} label="Time in" value={task.planning_time_in} />
          <InfoRow icon={Clock} label="Time out" value={task.planning_time_out} />
          <InfoRow icon={MapPin} label="Location" value={task.location_address} />
        </div>

        {(subtasksCount > 0 || reportsCount > 0) && (
          <div className="px-6 py-3 flex items-center gap-4 border-b border-border">
            <div className="flex items-center gap-1.5 text-sm">
              <ClipboardList className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Subtasks:</span>
              <span className="font-medium text-foreground tabular-nums">{subtasksCount}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              <span className="text-muted-foreground">Reports:</span>
              <span className="font-medium text-foreground tabular-nums">{reportsCount}</span>
            </div>
          </div>
        )}

        {task.description && (
          <div className="px-6 py-3">
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{task.description}</p>
          </div>
        )}

        {task.notes && (
          <div className="px-6 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{task.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}