import React from "react";
import { FileText, Clock } from "lucide-react";

function fmtDuration(mins) {
  if (mins == null) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function TaskReportsCell({ reports = [], onViewReport }) {
  if (reports.length === 0) return <span className="text-xs text-muted-foreground/40 italic">No reports</span>;
  return (
    <div className="space-y-0.5 min-w-[180px] max-w-[260px] py-0.5">
      {reports.slice(0, 2).map(r => (
        <button key={r.id} onClick={() => onViewReport(r)}
          className="flex items-center gap-1.5 text-xs w-full hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 transition-colors">
          <FileText className="w-3 h-3 text-primary/60 shrink-0" />
          <span className="font-mono text-primary font-medium shrink-0">{r.reference || "—"}</span>
          <span className="text-muted-foreground truncate">· {r.report_leader_name || r.employee_name || "—"}</span>
          {r.duration_minutes != null && (
            <span className="text-muted-foreground/70 ml-auto flex items-center gap-0.5 shrink-0">
              <Clock className="w-2.5 h-2.5" />{fmtDuration(r.duration_minutes)}
            </span>
          )}
        </button>
      ))}
      {reports.length > 2 && (
        <span className="text-xs text-muted-foreground/60 pl-5">+{reports.length - 2} more reports</span>
      )}
    </div>
  );
}