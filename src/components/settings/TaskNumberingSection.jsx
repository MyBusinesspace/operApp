import LockedNumbering from "@/components/settings/LockedNumbering";
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, Save, AlertTriangle, RefreshCw } from "lucide-react";

const STORAGE_KEY = "__task_numbering__";
const DEFAULT_FORM = { task_prefix: "TSK", number_padding: 4, include_year: true, next_task_number: 1 };

// ── Global renaming job registry (survives component unmount / navigation) ────
if (!window.__taskRenamingJob) window.__taskRenamingJob = {};

async function runTaskRenameJob(form, recordId, onProgress) {
  if (window.__taskRenamingJob?.running) return;

  // Load all tasks sorted by created_date ASCENDING (oldest gets #1)
  let allRecords = [];
  let page = 0;
  const pageSize = 200;
  while (true) {
    const batch = await base44.entities.Task.list("created_date", pageSize, page * pageSize);
    if (!batch || batch.length === 0) break;
    allRecords = allRecords.concat(batch);
    if (batch.length < pageSize) break;
    page++;
  }

  // Load all WorkingReports and group by task_id (for sync after rename)
  let allWRs = [];
  let wrPage = 0;
  while (true) {
    const wrBatch = await base44.entities.WorkingReport.list("-created_date", 200, wrPage * 200);
    if (!wrBatch || wrBatch.length === 0) break;
    allWRs = allWRs.concat(wrBatch);
    if (wrBatch.length < 200) break;
    wrPage++;
  }
  const wrsByTaskId = {};
  for (const wr of allWRs) {
    if (!wr.task_id) continue;
    if (!wrsByTaskId[wr.task_id]) wrsByTaskId[wr.task_id] = [];
    wrsByTaskId[wr.task_id].push(wr);
  }
  for (const tid in wrsByTaskId) {
    wrsByTaskId[tid].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
  }

  const total = allRecords.length;
  window.__taskRenamingJob = { running: true, current: 0, total, done: false, error: null, phase: "Renaming tasks" };
  onProgress && onProgress({ ...window.__taskRenamingJob });

  const year = new Date().getFullYear();
  const DELAY_MS = 300;
  const taskNewRef = {};

  for (let i = 0; i < allRecords.length; i++) {
    if (!window.__taskRenamingJob) break;
    const r = allRecords[i];
    const num = i + 1;
    const newRef = `${form.task_prefix}-${year}-${num}`;
    await base44.entities.Task.update(r.id, { reference: newRef });
    taskNewRef[r.id] = newRef;
    window.__taskRenamingJob.current = i + 1;
    onProgress && onProgress({ ...window.__taskRenamingJob });
    if (i < allRecords.length - 1) {
      await new Promise(resolve => setTimeout(resolve, DELAY_MS));
    }
  }

  // Sync WorkingReport references to match the new task references
  window.__taskRenamingJob = { ...window.__taskRenamingJob, phase: "Syncing Working Reports", current: 0, total: allWRs.length };
  onProgress && onProgress({ ...window.__taskRenamingJob });

  const wrUpdates = [];
  for (const wr of allWRs) {
    if (!wr.task_id) continue;
    const newTaskRef = taskNewRef[wr.task_id];
    if (!newTaskRef) continue;
    const newNumMatch = newTaskRef.match(/(\d+)$/);
    if (!newNumMatch) continue;
    const newTaskNum = newNumMatch[1];

    let newWRRef = null;
    if (wr.reference) {
      const refMatch = wr.reference.match(/^(.+?)-(\d{4})-(\d+)\.(\d+)$/);
      if (refMatch) {
        const [, wrPrefix, wrYear, , reportIdx] = refMatch;
        newWRRef = `${wrPrefix}-${wrYear}-${newTaskNum}.${reportIdx}`;
      }
    }
    if (!newWRRef) {
      const taskWRs = wrsByTaskId[wr.task_id] || [];
      const idx = taskWRs.indexOf(wr);
      const reportIdx = idx >= 0 ? idx + 1 : 1;
      let wrPrefix = "WR";
      let wrYear = String(year);
      for (const sibling of taskWRs) {
        if (sibling.reference) {
          const m = sibling.reference.match(/^(.+?)-(\d{4})-/);
          if (m) { wrPrefix = m[1]; wrYear = m[2]; break; }
        }
      }
      newWRRef = `${wrPrefix}-${wrYear}-${newTaskNum}.${reportIdx}`;
    }

    if (wr.reference !== newWRRef || wr.task_reference !== newTaskRef) {
      wrUpdates.push({ id: wr.id, reference: newWRRef, task_reference: newTaskRef });
    }
  }

  // Bulk update WRs in batches of 500
  let wrDone = 0;
  for (let i = 0; i < wrUpdates.length; i += 500) {
    if (!window.__taskRenamingJob) break;
    const batch = wrUpdates.slice(i, i + 500);
    await base44.entities.WorkingReport.bulkUpdate(batch);
    wrDone += batch.length;
    window.__taskRenamingJob.current = wrDone;
    onProgress && onProgress({ ...window.__taskRenamingJob });
  }

  const updated = allRecords.length;
  const newForm = { ...form, next_task_number: updated + 1 };
  const data = { name: STORAGE_KEY, footer_notes: JSON.stringify(newForm) };
  if (recordId) await base44.entities.DocumentTemplate.update(recordId, data);
  else await base44.entities.DocumentTemplate.create(data);

  window.__taskRenamingJob = { running: false, current: updated, total, done: true, error: null, newForm, wrSynced: wrUpdates.length };
  onProgress && onProgress({ ...window.__taskRenamingJob });
}

function TaskNumberingSectionInner() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [jobState, setJobState] = useState(() => window.__taskRenamingJob || null);
  const [showRenameConfirm, setShowRenameConfirm] = useState(false);

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const s = list.find(t => t.name === STORAGE_KEY);
      if (s) {
        setRecordId(s.id);
        try { setForm(f => ({ ...f, ...JSON.parse(s.footer_notes || "{}") })); } catch {}
      }
    });
  }, []);

  useEffect(() => {
    const existing = window.__taskRenamingJob;
    if (existing?.running) {
      const interval = setInterval(() => {
        const job = window.__taskRenamingJob;
        setJobState(job ? { ...job } : null);
        if (!job?.running) {
          clearInterval(interval);
          if (job?.newForm) setForm(job.newForm);
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const preview = () => {
    const year = new Date().getFullYear();
    const num = form.next_task_number || 1;
    return `${form.task_prefix}-${year}-${num}`;
  };

  const handleSave = async () => {
    setSaving(true);
    const cleanForm = {
      ...form,
      number_padding: Number(form.number_padding) > 0 ? Number(form.number_padding) : 4,
      next_task_number: Number(form.next_task_number) > 0 ? Number(form.next_task_number) : 1,
    };
    setForm(cleanForm);
    const data = { name: STORAGE_KEY, footer_notes: JSON.stringify(cleanForm) };
    if (recordId) await base44.entities.DocumentTemplate.update(recordId, data);
    else { const c = await base44.entities.DocumentTemplate.create(data); setRecordId(c.id); }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const handleRenameExisting = () => {
    setShowRenameConfirm(false);
    const onProgress = (job) => {
      setJobState({ ...job });
      if (job.newForm) setForm(job.newForm);
    };
    runTaskRenameJob(form, recordId, onProgress).catch(err => {
      window.__taskRenamingJob = { running: false, done: false, error: err.message };
      setJobState({ running: false, done: false, error: err.message });
    });
  };

  const renaming = jobState?.running;
  const renameResult = jobState?.done
    ? { success: true, count: jobState.current }
    : jobState?.error
    ? { success: false, error: jobState.error }
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <Hash className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Task Numbering</h3>
        <span className="ml-auto text-xs text-muted-foreground">Preview: <span className="font-mono text-foreground">{preview()}</span></span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Prefix</Label>
          <Input className="h-8 text-sm" value={form.task_prefix || ""} onChange={e => set("task_prefix", e.target.value)} placeholder="TSK" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Format</Label>
          <div className="flex items-center gap-2 h-8">
            <span className="text-sm text-muted-foreground">e.g. {form.task_prefix || "TSK"}-2026-1</span>
          </div>
        </div>
      </div>

      {/* Rename existing task codes */}
      <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-amber-800">Rename existing task codes</p>
          <p className="text-xs text-amber-700 mt-0.5">
            This will overwrite the reference codes of all existing task records using the current format above.
          </p>
          {renaming && (
            <p className="text-xs text-amber-600 font-medium mt-1">
              Renaming in background… {jobState.current} / {jobState.total}
            </p>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={renaming}
          onClick={() => setShowRenameConfirm(true)}
          className="shrink-0 h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${renaming ? "animate-spin" : ""}`} />
          {renaming ? `${jobState.current}/${jobState.total}` : "Rename All"}
        </Button>
      </div>

      {showRenameConfirm && (
        <div className="mt-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30 flex items-center gap-3">
          <p className="text-xs text-destructive flex-1">Are you sure? All existing task reference codes will be permanently overwritten.</p>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleRenameExisting}>Yes, rename all</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowRenameConfirm(false)}>Cancel</Button>
        </div>
      )}

      {renameResult && (
        <div className={`mt-2 p-2 rounded-lg text-xs ${renameResult.success ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
          {renameResult.success ? `✓ ${renameResult.count} records updated successfully.` : `Error: ${renameResult.error}`}
        </div>
      )}

      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-7 text-xs">
          <Save className="w-3 h-3" /> {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </Button>
      </div>
    </div>
  );
}


export default function TaskNumberingSection(props) {
  return (
    <LockedNumbering>
      <TaskNumberingSectionInner {...props} />
    </LockedNumbering>
  );
}
