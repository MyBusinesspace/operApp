import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, Eye, Clock, Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { buildWorkingReportPages } from "@/components/timesheets/WorkingReportPrint";
import { jsPDF } from "jspdf";

function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function TaskReportsList({ taskId, onViewReport }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    base44.entities.WorkingReport.filter({ task_id: taskId }, "-clock_in_time")
      .then(r => { setReports(r || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [taskId]);

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(prev => {
      if (prev.size === reports.length) return new Set();
      return new Set(reports.map(r => r.id));
    });
  };

  const allSelected = reports.length > 0 && selectedIds.size === reports.length;
  const someSelected = selectedIds.size > 0;

  const handlePrintSelected = async () => {
    const selected = reports.filter(r => selectedIds.has(r.id));
    if (selected.length === 0) return;
    setPrinting(true);

    try {
      const [templates, taskRes, ...entryResults] = await Promise.all([
        base44.entities.WorkingReportTemplate.list("name", 50).catch(() => []),
        taskId ? base44.entities.Task.filter({ id: taskId }).catch(() => []) : Promise.resolve([]),
        ...selected.map(r =>
          r.time_entry_id
            ? base44.entities.TimeEntry.filter({ id: r.time_entry_id }).catch(() => [])
            : Promise.resolve([])
        ),
      ]);
      const template = templates.find(t => t.is_default) || templates[0] || null;
      const task = taskRes[0] || null;

      const enrichedEntries = selected.map((report, i) => {
        const entry = entryResults[i][0] || { id: report.time_entry_id };
        return {
          ...entry,
          report_reference: report.reference,
          report_site_items: report.report_site_items || [],
          report_work_description: report.report_work_description || "",
          report_balance_work: report.report_balance_work || "",
          report_client_comments: report.report_client_comments || "",
          report_client_signature: report.report_client_signature || null,
          on_site: report.on_site ?? entry.on_site,
          clock_in_address: report.clock_in_address || entry.clock_in_address,
          clock_out_address: report.clock_out_address || entry.clock_out_address,
        };
      });

      const safe = (s) => String(s || "").replace(/[\\/:*?"<>|]/g, "").replace(/\s+/g, " ").trim();
      const fileBase = `${safe(task?.contact_name || "Customer")} - ${safe(task?.title || "Task")}`;
      const pdfDoc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < enrichedEntries.length; i++) {
        if (i > 0) pdfDoc.addPage();
        await buildWorkingReportPages({ template, entry: enrichedEntries[i], task, pdf: pdfDoc });
      }
      pdfDoc.save(`${fileBase}.pdf`);
    } catch (e) {
      console.error("Failed to print selected reports", e);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setPrinting(false);
    }
  };

  if (loading) return (
    <div className="px-8 py-3 text-xs text-muted-foreground animate-pulse">Loading reports...</div>
  );

  if (reports.length === 0) return (
    <div className="px-8 py-3 text-xs text-muted-foreground italic">No working reports for this task.</div>
  );

  return (
    <div className="px-6 py-2 space-y-1">
      {/* Selection action bar */}
      {someSelected && (
        <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-4 py-2 mb-1">
          <span className="text-xs font-medium text-primary">
            {selectedIds.size} of {reports.length} selected
          </span>
          <Button
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handlePrintSelected}
            disabled={printing}
          >
            {printing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
            {printing ? "Printing..." : "Print Selected"}
          </Button>
        </div>
      )}

      {/* Header row with select-all */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-b border-border">
        <Checkbox
          checked={allSelected}
          onCheckedChange={toggleAll}
          aria-label="Select all reports"
        />
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
          {allSelected ? "Deselect all" : "Select all"}
        </span>
      </div>

      {reports.map((report) => {
        const checked = selectedIds.has(report.id);
        return (
          <div key={report.id}
            className={`flex items-center justify-between bg-white border rounded-lg px-4 py-2 transition-colors ${
              checked ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted/30"
            }`}>
            <div className="flex items-center gap-3">
              <Checkbox
                checked={checked}
                onCheckedChange={() => toggleOne(report.id)}
                aria-label={`Select report ${report.reference || ""}`}
              />
              <FileText className="w-3.5 h-3.5 text-primary/60 shrink-0" />
              <span className="text-xs font-mono font-medium text-primary">{report.reference || "—"}</span>
              {report.employee_name && (
                <span className="text-xs text-muted-foreground">{report.employee_name}</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              {report.clock_in_time && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {fmtDateTime(report.clock_in_time)}
                </span>
              )}
              {report.duration_minutes != null && (
                <span className="text-xs text-muted-foreground">{fmtDuration(report.duration_minutes)}</span>
              )}
              <button
                onClick={() => onViewReport(report)}
                title="View report"
                className="p-1 rounded text-muted-foreground/50 hover:text-primary transition-colors">
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}