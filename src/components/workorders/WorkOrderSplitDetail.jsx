import React from "react";
import { formatDateValue } from "@/lib/dateOnly";
import { X, ChevronUp, ChevronDown, Pencil, Paperclip, MapPin, Calendar, User, Package, FolderKanban, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_STYLES = {
  Active:    "bg-emerald-100 text-emerald-700",
  "On Hold": "bg-amber-100 text-amber-700",
  Archived:  "bg-slate-100 text-slate-500",
};

const PRIORITY_STYLES = {
  Low:    "bg-slate-100 text-slate-500",
  Medium: "bg-blue-100 text-blue-700",
  High:   "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
};

const TYPE_STYLES = {
  Maintenance:  "bg-indigo-100 text-indigo-700",
  Repair:       "bg-red-100 text-red-700",
  Inspection:   "bg-sky-100 text-sky-700",
  Installation: "bg-teal-100 text-teal-700",
  Other:        "bg-slate-100 text-slate-500",
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

export default function WorkOrderSplitDetail({ workOrder, fileCount = 0, onClose, onEdit, onPrev, onNext }) {
  if (!workOrder) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select a work order to preview
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Files ({fileCount})
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onEdit?.(workOrder)}>
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
              <h2 className="text-xl font-bold text-foreground truncate">{workOrder.title || "Work Order"}</h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[workOrder.status] || STATUS_STYLES.Active}`}>
                  {workOrder.status || "Active"}
                </span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PRIORITY_STYLES[workOrder.priority] || PRIORITY_STYLES.Medium}`}>
                  {workOrder.priority || "Medium"}
                </span>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[workOrder.type] || TYPE_STYLES.Other}`}>
                  {workOrder.type || "Other"}
                </span>
              </div>
            </div>
          </div>
          {workOrder.reference && <p className="text-sm text-muted-foreground font-mono mt-2">{workOrder.reference}</p>}
        </div>

        <div className="px-6 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm border-b border-border">
          <InfoRow icon={FolderKanban} label="Project" value={workOrder.project_name} />
          <InfoRow icon={Package} label="Asset" value={workOrder.asset_name} />
          <InfoRow icon={User} label="Company" value={workOrder.contact_name} />
          <InfoRow icon={User} label="Assigned to" value={workOrder.assigned_to} />
          <InfoRow icon={MapPin} label="Location" value={workOrder.location} />
          <InfoRow icon={Calendar} label="Due date" value={fmtDate(workOrder.due_date)} />
        </div>

        {workOrder.description && (
          <div className="px-6 py-3">
            <p className="text-xs text-muted-foreground mb-1">Description</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{workOrder.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}