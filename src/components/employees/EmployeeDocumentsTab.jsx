import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Upload, Trash2, FileText, Plus, AlertCircle, CheckCircle2, Clock,
  Eye, X, Sparkles, Loader2, FolderOpen, Check
} from "lucide-react";
import ExtractedDataPopover from "./ExtractedDataPopover";

// ─── Quick Upload Modal (single file for a specific type) ─────────────────────
function QuickUploadModal({ open, onClose, onDone, employeeId, employeeName, docType }) {
  const [file, setFile] = useState(null);
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef();

  useEffect(() => {
    if (open) { setFile(null); setExpiryDate(""); setNotes(""); setSaving(false); }
  }, [open]);

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.entities.EmployeeDocument.create({
      employee_id: employeeId,
      employee_name: employeeName,
      document_type_id: docType?.id,
      document_type_name: docType?.name,
      file_url,
      file_name: file.name,
      expiry_date: expiryDate || null,
      notes: notes || "",
    });
    setSaving(false);
    onDone();
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Upload {docType?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-input rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary hover:bg-muted/20 transition-colors"
          >
            {file ? (
              <>
                <FileText className="w-8 h-8 text-primary" />
                <p className="text-sm font-medium text-foreground text-center">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
              </>
            ) : (
              <>
                <FolderOpen className="w-8 h-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to select a file</p>
                <p className="text-xs text-muted-foreground">Images or PDF</p>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => setFile(e.target.files[0] || null)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Expiry Date (optional)</Label>
            <Input type="date" className="h-8 text-sm" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Notes (optional)</Label>
            <Input className="h-8 text-sm" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Document number" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={!file || saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {saving ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DocumentViewerModal from "@/components/employees/DocumentViewerModal";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function expiryStatus(dateStr) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "expired";
  if (diff <= 30) return "soon";
  if (diff <= 60) return "warning";
  return "ok";
}

function ExpiryBadge({ date }) {
  const status = expiryStatus(date);
  if (!status) return null;
  const cfg = {
    expired: { color: "bg-red-100 text-red-700", label: "Expired" },
    soon:    { color: "bg-red-100 text-red-700", label: date },
    warning: { color: "bg-amber-100 text-amber-700", label: date },
    ok:      { color: "bg-emerald-100 text-emerald-700", label: date },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
      {status === "expired" || status === "soon" ? <AlertCircle className="w-3 h-3" /> :
       status === "warning" ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
      {cfg.label === date
        ? new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
        : cfg.label}
    </span>
  );
}

// ─── Bulk Upload Modal ────────────────────────────────────────────────────────
// States: "select" → drop files | "analyzing" → AI classifies | "review" → user confirms | "saving"
function BulkUploadModal({ open, onClose, onDone, employeeId, employeeName, docTypes }) {
  const [stage, setStage] = useState("select"); // select | analyzing | review | saving
  const [files, setFiles] = useState([]);
  const [items, setItems] = useState([]); // { file, previewUrl, status, document_type_id, document_type_name, expiry_date, notes, document_number, ai_confidence }
  const [savingIdx, setSavingIdx] = useState(-1);
  const dropRef = useRef();
  const fileRef = useRef();

  useEffect(() => {
    if (open) { setStage("select"); setFiles([]); setItems([]); setSavingIdx(-1); }
  }, [open]);

  const addFiles = (newFiles) => {
    setFiles(prev => [...prev, ...Array.from(newFiles)]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer.files);
  };

  const removeFile = (idx) => setFiles(f => f.filter((_, i) => i !== idx));

  // Classify all files with AI
  const analyzeAll = async () => {
    setStage("analyzing");
    const docTypeNames = docTypes.map(t => t.name).join(", ");

    const analyzed = await Promise.all(files.map(async (file) => {
      const base = { file, previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null, document_type_id: "", document_type_name: "", expiry_date: "", notes: "", document_number: "", ai_confidence: "low" };
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `You are a document classifier and data extractor.
Available document types: ${docTypeNames}
Also available: "Other" (if none match).

Analyze this document image/file and return:
- document_type: the best matching type from the list above, or "Other"
- confidence: "high", "medium", or "low"
- document_number: ID/license/passport number if visible
- full_name: name on document
- expiry_date: in YYYY-MM-DD format if visible
- issue_date: in YYYY-MM-DD format if visible
- issuing_authority: country or authority

Be concise and accurate.`,
          file_urls: [file_url],
          response_json_schema: {
            type: "object",
            properties: {
              document_type: { type: "string" },
              confidence: { type: "string" },
              document_number: { type: "string" },
              full_name: { type: "string" },
              expiry_date: { type: "string" },
              issue_date: { type: "string" },
              issuing_authority: { type: "string" }
            }
          }
        });

        const matchedType = docTypes.find(t => t.name.toLowerCase() === (result.document_type || "").toLowerCase());
        return {
          ...base,
          _uploaded_url: file_url,
          document_type_id: matchedType?.id || "",
          document_type_name: matchedType?.name || result.document_type || "Other",
          expiry_date: result.expiry_date || "",
          document_number: result.document_number || "",
          notes: result.document_number ? `No. ${result.document_number}` : "",
          ai_confidence: result.confidence || "low",
          ai_full_name: result.full_name || "",
          ai_issuing: result.issuing_authority || "",
        };
      } catch {
        return { ...base, document_type_name: "Unknown", ai_confidence: "low" };
      }
    }));

    setItems(analyzed);
    setStage("review");
  };

  const updateItem = (idx, patch) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));

  const saveAll = async () => {
    setStage("saving");
    for (let i = 0; i < items.length; i++) {
      setSavingIdx(i);
      const item = items[i];
      if (!item.document_type_id) continue; // skip unclassified if user didn't assign
      let file_url = item._uploaded_url;
      if (!file_url) {
        const res = await base44.integrations.Core.UploadFile({ file: item.file });
        file_url = res.file_url;
      }
      await base44.entities.EmployeeDocument.create({
        employee_id: employeeId,
        employee_name: employeeName,
        document_type_id: item.document_type_id,
        document_type_name: item.document_type_name,
        file_url,
        file_name: item.file.name,
        expiry_date: item.expiry_date || null,
        notes: item.notes || "",
      });
    }
    setSavingIdx(-1);
    onDone();
  };

  const confidenceColor = (c) => c === "high" ? "text-emerald-600" : c === "medium" ? "text-amber-600" : "text-red-500";
  const confidenceLabel = (c) => c === "high" ? "High" : c === "medium" ? "Medium" : "Low";

  return (
    <Dialog open={open} onOpenChange={stage === "saving" ? undefined : onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            {stage === "select" && "Upload Multiple Documents"}
            {stage === "analyzing" && "AI is analyzing your documents..."}
            {stage === "review" && "Review & Confirm"}
            {stage === "saving" && "Saving documents..."}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pt-1">

          {/* STAGE: select */}
          {stage === "select" && (
            <>
              {/* Drop zone */}
              <div
                ref={dropRef}
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-input rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-muted/20 transition-colors"
              >
                <FolderOpen className="w-10 h-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Images (JPG, PNG) and PDFs supported</p>
                </div>
                <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={e => addFiles(e.target.files)} />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{files.length} file{files.length !== 1 ? "s" : ""} selected</p>
                  {files.map((f, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/30 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate text-foreground">{f.name}</span>
                      <span className="text-xs text-muted-foreground">{(f.size / 1024).toFixed(0)} KB</span>
                      <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* STAGE: analyzing */}
          {stage === "analyzing" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <div className="relative">
                <Sparkles className="w-12 h-12 text-primary animate-pulse" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Analyzing {files.length} document{files.length !== 1 ? "s" : ""}...</p>
                <p className="text-xs text-muted-foreground mt-1">AI is identifying document types, expiry dates and key data</p>
              </div>
              <div className="w-full max-w-xs bg-muted rounded-full h-1.5 overflow-hidden">
                <div className="h-full bg-primary rounded-full animate-pulse w-2/3" />
              </div>
            </div>
          )}

          {/* STAGE: review */}
          {stage === "review" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">AI has classified your documents. Review and adjust if needed before saving.</p>
              {items.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-border overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-muted/20">
                    {item.previewUrl
                      ? <img src={item.previewUrl} alt="" className="w-10 h-10 object-cover rounded-md shrink-0 border border-border" />
                      : <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-muted-foreground" /></div>}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.file.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs font-medium ${confidenceColor(item.ai_confidence)}`}>
                          {confidenceLabel(item.ai_confidence)} confidence
                        </span>
                        {item.ai_full_name && <span className="text-xs text-muted-foreground">· {item.ai_full_name}</span>}
                      </div>
                    </div>
                    <button onClick={() => removeItem(idx)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 px-4 py-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Document Type</Label>
                      <Select value={item.document_type_id} onValueChange={v => {
                        const t = docTypes.find(t => t.id === v);
                        updateItem(idx, { document_type_id: v, document_type_name: t?.name || "" });
                      }}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select type..." /></SelectTrigger>
                        <SelectContent>
                          {docTypes.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Expiry Date</Label>
                      <Input type="date" className="h-8 text-xs" value={item.expiry_date} onChange={e => updateItem(idx, { expiry_date: e.target.value })} />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs">Notes</Label>
                      <Input className="h-8 text-xs" value={item.notes} onChange={e => updateItem(idx, { notes: e.target.value })} placeholder="Optional notes" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* STAGE: saving */}
          {stage === "saving" && (
            <div className="flex flex-col items-center gap-4 py-10">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Saving {savingIdx + 1} of {items.length}...</p>
                <p className="text-xs text-muted-foreground mt-1">{items[savingIdx]?.file?.name}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
          {stage === "select" && (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button onClick={analyzeAll} disabled={files.length === 0} className="gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Analyze with AI ({files.length})
              </Button>
            </>
          )}
          {stage === "review" && (
            <>
              <Button variant="outline" onClick={() => setStage("select")}>Back</Button>
              <Button onClick={saveAll} disabled={items.length === 0} className="gap-1.5">
                <Check className="w-3.5 h-3.5" /> Save {items.length} document{items.length !== 1 ? "s" : ""}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function EmployeeDocumentsTab({ employeeId, employeeName }) {
  const [docs, setDocs] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [quickUploadType, setQuickUploadType] = useState(null);
  const [viewingDoc, setViewingDoc] = useState(null);

  const load = async () => {
    setLoading(true);
    const [d, t] = await Promise.all([
      base44.entities.EmployeeDocument.filter({ employee_id: employeeId }),
      base44.entities.EmployeeDocumentType.list("name", 100),
    ]);
    setDocs(d);
    setDocTypes(t);
    setLoading(false);
  };

  useEffect(() => { if (employeeId) load(); }, [employeeId]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this document?")) return;
    await base44.entities.EmployeeDocument.delete(id);
    if (viewingDoc?.id === id) setViewingDoc(null);
    load();
  };

  const handleAiApply = async (docId, fields) => {
    const updates = {};
    if (fields.expiry_date) updates.expiry_date = fields.expiry_date;
    if (fields.document_number) updates.document_number = fields.document_number;
    if (fields.full_name) updates.full_name = fields.full_name;
    if (fields.date_of_birth) updates.date_of_birth = fields.date_of_birth;
    if (fields.issue_date) updates.issue_date = fields.issue_date;
    if (fields.issuing_authority) updates.issuing_authority = fields.issuing_authority;
    if (fields.nationality) updates.nationality = fields.nationality;
    if (fields.extra_fields && Object.keys(fields.extra_fields).length > 0) updates.extra_fields = fields.extra_fields;
    // Keep notes in sync with the document number for quick visibility in the table
    if (fields.document_number) updates.notes = `No. ${fields.document_number}`;
    if (Object.keys(updates).length > 0) {
      await base44.entities.EmployeeDocument.update(docId, updates);
      load();
      setViewingDoc(d => d?.id === docId ? { ...d, ...updates } : d);
    }
  };

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading documents...</div>;

  const grouped = docTypes.map(type => ({ type, docs: docs.filter(d => d.document_type_id === type.id) }));
  const ungrouped = docs.filter(d => !docTypes.find(t => t.id === d.document_type_id));
  const viewingType = viewingDoc ? docTypes.find(t => t.id === viewingDoc.document_type_id) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{docs.length} document{docs.length !== 1 ? "s" : ""} on file</p>
        <Button size="sm" className="gap-1.5" onClick={() => setUploadModal(true)}>
          <Plus className="w-3.5 h-3.5" /> Upload Documents
        </Button>
      </div>

      {docTypes.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          No document types configured. Go to <strong>Settings → Service</strong> to add document types first.
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(({ type, docs: typeDocs }) => (
            <div key={type.id} className="rounded-xl border border-border overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/30 border-b border-border">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: type.color || "#6366f1" }} />
                <span className="text-sm font-semibold text-foreground">{type.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">{typeDocs.length} file{typeDocs.length !== 1 ? "s" : ""}</span>
                <button
                  onClick={() => setQuickUploadType(type)}
                  className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary transition-colors"
                  title={`Upload ${type.name}`}
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
              {typeDocs.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted-foreground italic">No documents uploaded yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {typeDocs.map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{doc.file_name || "Document"}</p>
                        {doc.document_number && <p className="text-xs text-muted-foreground truncate">No. {doc.document_number}</p>}
                        {!doc.document_number && doc.notes && <p className="text-xs text-muted-foreground truncate">{doc.notes}</p>}
                      </div>
                      <ExtractedDataPopover doc={doc} />
                      {doc.expiry_date && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Expiry</span>
                          <ExpiryBadge date={doc.expiry_date} />
                        </div>
                      )}
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button onClick={() => setViewingDoc(doc)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary"><Eye className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(doc.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {ungrouped.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/30 border-b border-border text-sm font-semibold text-foreground">Other</div>
              <div className="divide-y divide-border">
                {ungrouped.map(doc => (
                  <div key={doc.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
                    <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{doc.file_name || "Document"}</p>
                      {doc.document_number && <p className="text-xs text-muted-foreground truncate">No. {doc.document_number}</p>}
                    </div>
                    <ExtractedDataPopover doc={doc} />
                    {doc.expiry_date && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Expiry</span>
                        <ExpiryBadge date={doc.expiry_date} />
                      </div>
                    )}
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button onClick={() => setViewingDoc(doc)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDelete(doc.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {viewingDoc && (
        <DocumentViewerModal
          doc={viewingDoc}
          docTypeName={viewingType?.name}
          docTypeColor={viewingType?.color}
          onClose={() => setViewingDoc(null)}
          onUpdate={handleAiApply}
        />
      )}

      <BulkUploadModal
        open={uploadModal}
        onClose={() => setUploadModal(false)}
        onDone={() => { setUploadModal(false); load(); }}
        employeeId={employeeId}
        employeeName={employeeName}
        docTypes={docTypes}
      />

      <QuickUploadModal
        open={!!quickUploadType}
        onClose={() => setQuickUploadType(null)}
        onDone={() => { setQuickUploadType(null); load(); }}
        employeeId={employeeId}
        employeeName={employeeName}
        docType={quickUploadType}
      />
    </div>
  );
}