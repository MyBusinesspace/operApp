import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Clock, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { printWorkingReport } from "@/components/timesheets/WorkingReportPrint";
import WorkingReportPreview from "@/components/timesheets/WorkingReportPreview";

export default function TaskWorkingReports({ task }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState(null);
  const [current, setCurrent] = useState(0);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [rpts, tmpls] = await Promise.all([
        base44.entities.WorkingReport.filter({ task_id: task.id }, "-clock_in_time").catch(() => []),
        base44.entities.WorkingReportTemplate.list("name", 50).catch(() => []),
      ]);
      setReports(rpts || []);
      setCurrent(0);
      const def = (tmpls || []).find(t => t.is_default) || tmpls?.[0] || null;
      setTemplate(def);
      setLoading(false);
    };
    load();
  }, [task.id]);

  const handlePrint = async () => {
    const entry = reports[current];
    if (!entry) return;
    setPrinting(true);
    await printWorkingReport({ template, entry: { ...entry, report_reference: entry.reference }, task });
    setPrinting(false);
  };

  if (loading) {
    return (
      <div className="px-8 py-4 text-xs text-muted-foreground animate-pulse">Loading reports...</div>
    );
  }

  if (reports.length === 0) {
    return (
      <div className="px-8 py-4 text-xs text-muted-foreground italic">No working reports recorded for this task.</div>
    );
  }

  const entry = reports[current];

  return (
    <div className="bg-slate-50 border-t border-border px-6 py-5">
      {/* Navigation header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-primary/60" />
          <span className="text-sm font-semibold text-foreground">
            Working Report — {entry?.reference || `#${current + 1}`}
          </span>
          {reports.length > 1 && (
            <span className="text-xs text-muted-foreground">({current + 1} of {reports.length})</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {reports.length > 1 && (
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7"
                disabled={current === 0} onClick={() => setCurrent(c => c - 1)}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7"
                disabled={current === reports.length - 1} onClick={() => setCurrent(c => c + 1)}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 px-3"
            onClick={handlePrint} disabled={printing}>
            <Printer className="w-3 h-3" />
            {printing ? "Printing..." : "Print PDF"}
          </Button>
        </div>
      </div>

      {/* Filled preview scaled down */}
      <div style={{ transform: "scale(0.8)", transformOrigin: "top left", width: "125%", marginBottom: "-20%" }}>
        <WorkingReportPreview template={template} entry={entry} task={task} />
      </div>
    </div>
  );
}