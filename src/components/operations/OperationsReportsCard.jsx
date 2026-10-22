import React from "react";
import { Link } from "react-router-dom";
import { Clock, FileText, ChevronDown } from "lucide-react";

const BACK = "back=/operations-overview";

const REPORTS = [
  { label: "Time & Cost by Client", desc: "Hours logged and labour cost grouped by client", path: `/reports/time-cost?group=client&${BACK}` },
  { label: "Time & Cost by Project", desc: "Hours logged and labour cost grouped by project", path: `/reports/time-cost?group=project&${BACK}` },
  { label: "Working Report Validation History", desc: "Daily validation runs — reports checked, violations found and quarantined", path: `/reports/validation-history?${BACK}` },
  { label: "Working Reports", desc: "Browse and print working reports by day/week, contact, worker, or linked task/invoice", path: `/reports/working-reports?${BACK}` },
];

const statFor = (stats, i) => {
  if (!stats) return null;
  if (i === 0 || i === 1) return `${stats.timeCost.hours}h logged`;
  if (i === 2) {
    const v = stats.validation;
    return `${v.runs} run${v.runs === 1 ? "" : "s"} · ${v.violations} violation${v.violations === 1 ? "" : "s"}`;
  }
  if (i === 3) {
    const c = stats.workingReports.count;
    return `${c} report${c === 1 ? "" : "s"}`;
  }
  return null;
};

export default function OperationsReportsCard({ stats }) {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-100 dark:bg-sky-500/15">
            <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
          </div>
          <span className="text-base font-semibold text-foreground">Operations</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{REPORTS.length} reports</span>
        </div>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {REPORTS.map((r, i) => {
          const stat = statFor(stats, i);
          return (
            <Link
              key={r.path}
              to={r.path}
              className={`flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors group ${
                i < 3 ? "border-b border-border" : ""
              } ${i >= 2 ? "md:border-b-0" : ""} ${i % 2 === 0 ? "md:border-r border-border" : ""}`}
            >
              <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{r.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
              </div>
              {stat && (
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full whitespace-nowrap">
                  {stat}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}