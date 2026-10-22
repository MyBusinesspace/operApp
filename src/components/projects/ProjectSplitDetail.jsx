import React from "react";
import { formatDateValue } from "@/lib/dateOnly";
import { X, ChevronUp, ChevronDown, Pencil, Paperclip, MapPin, Calendar, User, Tag, FolderKanban } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_DOT = {
  Draft:      "bg-zinc-500",
  Active:     "bg-emerald-500",
  "On Hold":  "bg-amber-500",
  Completed:  "bg-sky-500",
  Cancelled:  "bg-rose-500",
};

const TYPE_DOT = {
  Rental:       "bg-indigo-500",
  Installation: "bg-sky-500",
  Maintenance:  "bg-orange-500",
  Consulting:   "bg-purple-500",
  Construction: "bg-teal-500",
  Other:        "bg-zinc-500",
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

export default function ProjectSplitDetail({ project, fileCount = 0, onClose, onEdit, onPrev, onNext }) {
  if (!project) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
        Select a project to preview
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-card border-l border-border min-w-0">
      {/* Action bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Paperclip className="w-3.5 h-3.5" /> Files ({fileCount})
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => onEdit?.(project)}>
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
        {/* Header */}
        <div className="px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <FolderKanban className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground truncate">{project.name || "Project"}</h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                  <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[project.status] || STATUS_DOT.Draft}`} />
                  {project.status || "Draft"}
                </span>
                {project.type && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                    <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[project.type] || TYPE_DOT.Other}`} />
                    {project.type}
                  </span>
                )}
              </div>
            </div>
          </div>
          {project.reference && <p className="text-sm text-muted-foreground font-mono mt-2">{project.reference}</p>}
        </div>

        {/* Info grid */}
        <div className="px-6 py-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm border-b border-border">
          <InfoRow icon={User} label="Customer" value={project.contact_name} />
          <InfoRow icon={Tag} label="Category" value={project.type} />
          <InfoRow icon={MapPin} label="Location" value={project.location} />
          <InfoRow icon={Calendar} label="Start date" value={fmtDate(project.start_date)} />
          <InfoRow icon={Calendar} label="End date" value={fmtDate(project.end_date)} />
        </div>

        {/* Notes */}
        {project.notes && (
          <div className="px-6 py-3">
            <p className="text-xs text-muted-foreground mb-1">Notes</p>
            <p className="text-sm text-foreground whitespace-pre-wrap">{project.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}