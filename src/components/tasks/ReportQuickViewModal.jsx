import React, { useState, useEffect } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import { base44 } from "@/api/base44Client";
import WorkingReportPreview from "@/components/timesheets/WorkingReportPreview";
import { printWorkingReport } from "@/components/timesheets/WorkingReportPrint";

export default function ReportQuickViewModal({ open, onClose, report, task }) {
  const [template, setTemplate] = useState(null);
  const [subtasks, setSubtasks] = useState([]);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open) return;
    base44.entities.WorkingReportTemplate.list("name", 50).catch(() => []).then(tmpls => {
      setTemplate((tmpls || []).find(t => t.is_default) || tmpls?.[0] || null);
    });
    const taskId = report?.task_id || task?.id;
    if (taskId) {
      base44.entities.TaskSubtask.filter({ task_id: taskId }, "sort_order").catch(() => []).then(subs => {
        setSubtasks(subs || []);
      });
    } else {
      setSubtasks([]);
    }
  }, [open, report?.task_id]);

  const handlePrint = async () => {
    if (!report) return;
    setPrinting(true);
    await printWorkingReport({ template, entry: { ...report, report_reference: report.reference }, task: { ...task, subtasks } });
    setPrinting(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card z-10">
          <span className="text-sm font-semibold text-foreground">
            Working Report — {report?.reference || "—"}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 px-3" onClick={handlePrint} disabled={printing || !report}>
            <Printer className="w-3 h-3" />
            {printing ? "Printing..." : "Print PDF"}
          </Button>
        </div>

        {/* Body */}
        <div className="p-5">
          {report
            ? <WorkingReportPreview template={template} entry={report} task={{ ...task, subtasks }} />
            : <div className="py-12 text-center text-sm text-muted-foreground">No report selected.</div>
          }
        </div>
      </DialogContent>
    </Dialog>
  );
}