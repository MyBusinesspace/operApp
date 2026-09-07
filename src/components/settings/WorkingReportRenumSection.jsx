import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { withRetry } from "@/lib/apiHelpers";
import { fetchAllBatched } from "@/lib/batchedFetch";

if (!window.__wrRenumJob) window.__wrRenumJob = {};

async function runRenumJob(form, onProgress) {
  if (window.__wrRenumJob.running) return;
  const prefix = form.ref_prefix || "WR";
  const includeYear = form.ref_include_year !== false;
  const year = new Date().getFullYear();

  const tasks = await fetchAllBatched(
    (s, l, sk) => withRetry(() => base44.entities.Task.list(s, l, sk)),
    "-created_date",
    { batchSize: 500, maxItems: 50000 }
  ).catch(() => []);
  const taskRefMap = {};
  for (const t of tasks) if (t.id && t.reference) taskRefMap[t.id] = t.reference;

  const reports = await fetchAllBatched(
    (s, l, sk) => withRetry(() => base44.entities.WorkingReport.list(s, l, sk)),
    "-created_date",
    { batchSize: 500, maxItems: 50000 }
  ).catch(() => []);

  const total = reports.length;
  window.__wrRenumJob = { running: true, current: 0, total, done: false, error: null };
  onProgress?.({ ...window.__wrRenumJob });

  // Group by task, oldest-first, then assign 1, 2, 3…
  const byTask = {};
  for (const r of reports) {
    const key = r.task_id || "__notask__";
    (byTask[key] = byTask[key] || []).push(r);
  }
  for (const k of Object.keys(byTask)) {
    byTask[k].sort((a, b) => new Date(a.created_date || 0) - new Date(b.created_date || 0));
  }
  for (const key of Object.keys(byTask)) {
    const taskRef = key === "__notask__" ? "" : (taskRefMap[key] || "");
    const taskNumMatch = taskRef.match(/(\d+)$/);
    const taskNum = taskNumMatch ? taskNumMatch[1] : "";
    byTask[key].forEach((r, i) => {
      if (taskNum) {
        const refBase = includeYear ? `${prefix}-${year}-${taskNum}` : `${prefix}-${taskNum}`;
        r.__newRef = `${refBase}.${i + 1}`;
      } else {
        r.__newRef = r.reference || "";
      }
    });
  }

  let idx = 0;
  for (const r of reports) {
    if (!window.__wrRenumJob) break;
    if (r.__newRef && r.__newRef !== r.reference) {
      await withRetry(() => base44.entities.WorkingReport.update(r.id, { reference: r.__newRef })).catch(() => {});
    }
    idx++;
    window.__wrRenumJob.current = idx;
    if (idx % 5 === 0 || idx === total) onProgress?.({ ...window.__wrRenumJob });
    if (idx < total) await new Promise(res => setTimeout(res, 120));
  }

  window.__wrRenumJob = { running: false, current: idx, total, done: true, error: null };
  onProgress?.({ ...window.__wrRenumJob });
}

export default function WorkingReportRenumSection({ form }) {
  const [job, setJob] = useState(() => window.__wrRenumJob || null);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    if (window.__wrRenumJob?.running) {
      const interval = setInterval(() => {
        setJob(window.__wrRenumJob ? { ...window.__wrRenumJob } : null);
        if (!window.__wrRenumJob?.running) clearInterval(interval);
      }, 500);
      return () => clearInterval(interval);
    }
  }, []);

  const start = () => {
    setShowConfirm(false);
    runRenumJob(form, (j) => setJob({ ...j })).catch(err => {
      window.__wrRenumJob = { running: false, done: false, error: err.message };
      setJob({ running: false, done: false, error: err.message });
    });
  };

  const renaming = job?.running;
  const result = job?.done
    ? { success: true, count: job.current }
    : job?.error
    ? { success: false, error: job.error }
    : null;
  const yearTag = form.ref_include_year !== false ? `${new Date().getFullYear()}-` : "";

  return (
    <div className="mt-3 space-y-2">
      <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-amber-800">Renumber existing reports</p>
          <p className="text-xs text-amber-700 mt-0.5">
            Reassigns every existing working report reference to the task-based format (<span className="font-mono">{form.ref_prefix || "WR"}-{yearTag}0004.1</span>, …), sequenced per task by creation order.
          </p>
          {renaming && <p className="text-xs text-amber-600 font-medium mt-1">Renumbering… {job.current} / {job.total}</p>}
        </div>
        <Button size="sm" variant="outline" disabled={renaming} onClick={() => setShowConfirm(true)}
          className="shrink-0 h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 gap-1">
          <RefreshCw className={`w-3 h-3 ${renaming ? "animate-spin" : ""}`} />
          {renaming ? `${job.current}/${job.total}` : "Renumber All"}
        </Button>
      </div>
      {showConfirm && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-3">
          <p className="text-xs text-destructive flex-1">Are you sure? All existing working report references will be permanently overwritten.</p>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={start}>Yes, renumber all</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowConfirm(false)}>Cancel</Button>
        </div>
      )}
      {result && (
        <div className={`p-2 rounded-lg text-xs ${result.success ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
          {result.success ? `✓ ${result.count} reports renumbered.` : `Error: ${result.error}`}
        </div>
      )}
    </div>
  );
}