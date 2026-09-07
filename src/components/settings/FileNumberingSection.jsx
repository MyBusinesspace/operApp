import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, Save, AlertTriangle, RefreshCw } from "lucide-react";

const STORAGE_KEY = "__shared_file_numbering__";
const DEFAULT_FORM = { prefix: "FILE", number_padding: 4, include_year: true, next_number: 1 };

if (!window.__fileRenamingJobs) window.__fileRenamingJobs = {};

/**
 * Reference numbering section for the unified SharedFile entity.
 * Preserves each file's type prefix (e.g. FILE-TL-2026-0001) during rename
 * by looking up the FileType.reference_prefix via file_type_id.
 */
export default function FileNumberingSection() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [jobState, setJobState] = useState(() => window.__fileRenamingJobs[STORAGE_KEY] || null);
  const [showRenameConfirm, setShowRenameConfirm] = useState(false);

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const s = list.find(t => t.name === STORAGE_KEY);
      if (s) {
        setRecordId(s.id);
        try {
          const parsed = JSON.parse(s.footer_notes || "{}");
          setForm(f => ({ ...f, ...parsed }));
        } catch {}
      }
    });
  }, []);

  useEffect(() => {
    const existing = window.__fileRenamingJobs[STORAGE_KEY];
    if (existing?.running) {
      const interval = setInterval(() => {
        const job = window.__fileRenamingJobs[STORAGE_KEY];
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
    const padded = String(form.next_number || 1).padStart(form.number_padding || 4, "0");
    return form.include_year ? `${form.prefix}-TYPE-${year}-${padded}` : `${form.prefix}-TYPE-${padded}`;
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { name: STORAGE_KEY, footer_notes: JSON.stringify(form) };
    if (recordId) await base44.entities.DocumentTemplate.update(recordId, data);
    else { const c = await base44.entities.DocumentTemplate.create(data); setRecordId(c.id); }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const handleRenameExisting = async () => {
    if (window.__fileRenamingJobs[STORAGE_KEY]?.running) return;
    setShowRenameConfirm(false);
    window.__fileRenamingJobs[STORAGE_KEY] = { running: true, current: 0, total: 0, done: false, error: null };
    setJobState({ ...window.__fileRenamingJobs[STORAGE_KEY] });

    try {
      // Load all file types to map file_type_id -> reference_prefix
      const typeList = await base44.entities.FileType.list("name", 500);
      const typeMap = {};
      (typeList || []).forEach(t => { typeMap[t.id] = (t.reference_prefix || "").trim(); });

      // Load all SharedFiles (paginated)
      let allRecords = [];
      let page = 0;
      const pageSize = 200;
      while (true) {
        const batch = await base44.entities.SharedFile.list("-created_date", pageSize, page * pageSize);
        if (!batch || batch.length === 0) break;
        allRecords = allRecords.concat(batch);
        if (batch.length < pageSize) break;
        page++;
      }

      const total = allRecords.length;
      window.__fileRenamingJobs[STORAGE_KEY].total = total;
      setJobState({ ...window.__fileRenamingJobs[STORAGE_KEY] });

      const year = String(new Date().getFullYear());
      const DELAY_MS = 250;

      for (let i = 0; i < allRecords.length; i++) {
        if (!window.__fileRenamingJobs[STORAGE_KEY]) break;
        const r = allRecords[i];
        const num = i + 1;
        const padded = String(num).padStart(form.number_padding || 4, "0");
        const tp = typeMap[r.file_type_id] || "";
        const newRef = tp
          ? (form.include_year ? `${form.prefix}-${tp}-${year}-${padded}` : `${form.prefix}-${tp}-${padded}`)
          : (form.include_year ? `${form.prefix}-${year}-${padded}` : `${form.prefix}-${padded}`);
        await base44.entities.SharedFile.update(r.id, { reference: newRef });
        window.__fileRenamingJobs[STORAGE_KEY].current = i + 1;
        setJobState({ ...window.__fileRenamingJobs[STORAGE_KEY] });
        if (i < allRecords.length - 1) {
          await new Promise(resolve => setTimeout(resolve, DELAY_MS));
        }
      }

      const newForm = { ...form, next_number: total + 1 };
      const data = { name: STORAGE_KEY, footer_notes: JSON.stringify(newForm) };
      if (recordId) await base44.entities.DocumentTemplate.update(recordId, data);
      else await base44.entities.DocumentTemplate.create(data);

      window.__fileRenamingJobs[STORAGE_KEY] = { running: false, current: total, total, done: true, error: null, newForm };
      setJobState({ ...window.__fileRenamingJobs[STORAGE_KEY] });
    } catch (err) {
      window.__fileRenamingJobs[STORAGE_KEY] = { running: false, done: false, error: err.message };
      setJobState({ ...window.__fileRenamingJobs[STORAGE_KEY] });
    }
  };

  const renaming = jobState?.running;
  const renameResult = jobState?.done
    ? { success: true, count: jobState.current }
    : jobState?.error
    ? { success: false, error: jobState.error }
    : null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <Hash className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">File Reference Numbering</h3>
        <span className="ml-auto text-xs text-muted-foreground">Preview: <span className="font-mono text-foreground">{preview()}</span></span>
      </div>

      <p className="text-xs text-muted-foreground mb-3">
        New files get an automatic reference like <span className="font-mono text-foreground">{preview()}</span>, where <span className="font-mono">TYPE</span> is the selected file type's prefix (e.g. TL, CERT). The counter increments automatically on each upload.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Prefix</Label>
          <Input className="h-8 text-sm" value={form.prefix || ""} onChange={e => set("prefix", e.target.value)} placeholder="FILE" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Number padding</Label>
          <Input className="h-8 text-sm" type="number" min={1} max={8} value={form.number_padding || 4} onChange={e => set("number_padding", Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Next number</Label>
          <Input className="h-8 text-sm" type="number" min={1} value={form.next_number || 1} onChange={e => set("next_number", Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Include year</Label>
          <div className="flex items-center gap-2 h-8">
            <input type="checkbox" checked={!!form.include_year} onChange={e => set("include_year", e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className="text-sm text-muted-foreground">e.g. FILE-TL-2026-0001</span>
          </div>
        </div>
      </div>

      <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-amber-800">Rename existing file codes</p>
          <p className="text-xs text-amber-700 mt-0.5">
            This will renumber all existing files sequentially, preserving each file's type prefix.
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
          <p className="text-xs text-destructive flex-1">Are you sure? All existing file reference codes will be permanently overwritten.</p>
          <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleRenameExisting}>Yes, rename all</Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowRenameConfirm(false)}>Cancel</Button>
        </div>
      )}

      {renameResult && (
        <div className={`mt-2 p-2 rounded-lg text-xs ${renameResult.success ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-destructive/10 text-destructive border border-destructive/20"}`}>
          {renameResult.success ? `✓ ${renameResult.count} files updated successfully.` : `Error: ${renameResult.error}`}
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