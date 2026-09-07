import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Eye } from "lucide-react";
import ReportQuickViewModal from "@/components/tasks/ReportQuickViewModal";

export default function EntryReportButton({ entry }) {
  const [report, setReport] = useState(null);
  const [task, setTask] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!entry?.id) return;
    base44.entities.WorkingReport
      .filter({ time_entry_id: entry.id })
      .then(res => setReport(res[0] || null))
      .catch(() => {});
  }, [entry?.id]);

  // Load task when opening modal
  useEffect(() => {
    if (!open || !entry?.task_id) return;
    base44.entities.Task.filter({ id: entry.task_id })
      .then(res => setTask(res[0] || null))
      .catch(() => {});
  }, [open, entry?.task_id]);

  if (!report) return <span className="text-xs text-muted-foreground/40">—</span>;

  const enrichedEntry = report ? {
    ...entry,
    reference: report.reference,
    report_reference: report.reference,
    report_site_items: report.report_site_items || [],
    report_work_description: report.report_work_description || "",
    report_balance_work: report.report_balance_work || "",
    report_client_comments: report.report_client_comments || "",
    report_client_signature: report.report_client_signature || null,
  } : null;

  return (
    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
      {/* Reference badge */}
      <span className="text-xs font-mono text-primary font-medium">{report.reference || "Report"}</span>

      {/* Quick view button */}
      <button
        type="button"
        title="View report"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="p-1 rounded text-muted-foreground hover:text-primary transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
      </button>

      {/* Shared quick view modal — same as Tasks page */}
      <ReportQuickViewModal
        open={open}
        onClose={() => setOpen(false)}
        report={enrichedEntry}
        task={task}
      />
    </div>
  );
}