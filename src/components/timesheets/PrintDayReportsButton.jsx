import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Printer, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printWorkingReport, buildWorkingReportPages } from "./WorkingReportPrint";
import { jsPDF } from "jspdf";

export default function PrintDayReportsButton({ dayEntries }) {
  const [printing, setPrinting] = useState(false);

  const handlePrintAll = async (e) => {
    e.stopPropagation();
    setPrinting(true);

    const entryIds = dayEntries.map(e => e.id);

    // Fetch templates + one report per entry in parallel
    const [templates, ...reportResults] = await Promise.all([
      base44.entities.WorkingReportTemplate.list("name", 50).catch(() => []),
      ...entryIds.map(id =>
        base44.entities.WorkingReport.filter({ time_entry_id: id }, "-created_date", 1).catch(() => [])
      ),
    ]);
    const template = templates.find(t => t.is_default) || templates[0] || null;

    // Flatten: one report per entry (the most recent)
    const dayReports = reportResults.map(res => res[0]).filter(Boolean);

    if (dayReports.length === 0) {
      alert("No working reports found for this day.");
      setPrinting(false);
      return;
    }

    // Fetch tasks in parallel
    const taskIds = [...new Set(dayReports.map(r => r.task_id).filter(Boolean))];
    const taskResults = await Promise.all(
      taskIds.map(id => base44.entities.Task.filter({ id }).catch(() => []))
    );
    const taskMap = {};
    taskResults.forEach(res => { if (res[0]) taskMap[res[0].id] = res[0]; });

    if (dayReports.length === 1) {
      // Single report — use normal save
      const report = dayReports[0];
      const entry = dayEntries.find(e => e.id === report.time_entry_id) || {};
      const task = taskMap[report.task_id] || null;
      const enrichedEntry = {
        ...entry,
        report_reference: report.reference,
        report_site_items: report.report_site_items || [],
        report_work_description: report.report_work_description || "",
        report_balance_work: report.report_balance_work || "",
        report_client_comments: report.report_client_comments || "",
        report_client_signature: report.report_client_signature || null,
      };
      await printWorkingReport({ template, entry: enrichedEntry, task });
    } else {
      // Multiple reports — merge into one PDF with page breaks
      const mergedPdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < dayReports.length; i++) {
        const report = dayReports[i];
        const entry = dayEntries.find(e => e.id === report.time_entry_id) || {};
        const task = taskMap[report.task_id] || null;
        const enrichedEntry = {
          ...entry,
          report_reference: report.reference,
          report_site_items: report.report_site_items || [],
          report_work_description: report.report_work_description || "",
          report_balance_work: report.report_balance_work || "",
          report_client_comments: report.report_client_comments || "",
          report_client_signature: report.report_client_signature || null,
        };
        // Build pages into the shared PDF; add page break between reports
        if (i > 0) mergedPdf.addPage();
        await buildWorkingReportPages({ template, entry: enrichedEntry, task, pdf: mergedPdf });
      }
      const dateStr = dayEntries[0]?.clock_in_time
        ? new Date(dayEntries[0].clock_in_time).toLocaleDateString("en-GB").replace(/\//g, "-")
        : "reports";
      mergedPdf.save(`Day_Reports_${dateStr}.pdf`);
    }

    setPrinting(false);
  };

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-7 text-xs gap-1.5"
      onClick={handlePrintAll}
      disabled={printing}
      title="Print all working reports for this day"
    >
      {printing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Printer className="w-3 h-3" />}
      {printing ? "Printing..." : "Print Day Reports"}
    </Button>
  );
}