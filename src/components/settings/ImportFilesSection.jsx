import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, Check, Loader2, AlertCircle, RefreshCw, ChevronRight,
  Building2, FolderKanban, Wrench, Box, Building, UserCheck, FileText, X, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { useToast } from "@/components/ui/use-toast";

// Each destination maps a dropped file to the right file entity + ascending link.
const DESTINATIONS = [
  {
    key: "ContactFile", label: "Contact Company File", icon: Building2,
    desc: "Trade license, certificates, contracts…", color: "bg-blue-50 text-blue-600",
    linkEntity: "Contact", linkLabel: "Contact / Company", linkField: "contact_id",
    linkNameField: "contact_name", nameField: "full_name", supportsFileType: true,
    hasDescription: true, viewPath: (id) => `/contacts/${id}`,
  },
  {
    key: "ProjectFile", label: "Project File", icon: FolderKanban,
    desc: "Drawings, permits, agreements…", color: "bg-sky-50 text-sky-600",
    linkEntity: "Project", linkLabel: "Project", linkField: "project_id",
    linkNameField: "project_name", nameField: "name", supportsFileType: true,
    hasDescription: true, viewPath: (id) => `/projects/${id}`,
  },
  {
    key: "WorkOrderFile", label: "Work Order File", icon: Wrench,
    desc: "Service reports, checklists…", color: "bg-amber-50 text-amber-600",
    linkEntity: "WorkOrder", linkLabel: "Work Order", linkField: "work_order_id",
    linkNameField: "work_order_name", nameField: "title", supportsFileType: true,
    hasDescription: true, viewPath: (id) => `/work-orders/${id}`,
  },
  {
    key: "AssetFile", label: "Asset File", icon: Box,
    desc: "Manuals, inspection certs, photos…", color: "bg-indigo-50 text-indigo-600",
    linkEntity: "Asset", linkLabel: "Asset / Equipment", linkField: "asset_id",
    linkNameField: "asset_name", nameField: "name", supportsFileType: true,
    hasDescription: true, viewPath: (id) => `/assets/${id}`,
  },
  {
    key: "OrganizationFile", label: "Organization File", icon: Building,
    desc: "Company-wide documents & records", color: "bg-violet-50 text-violet-600",
    linkEntity: "Organization", linkLabel: "Organization", linkField: "organization_id",
    nameField: "name", fileLabelField: "name", supportsFileType: true,
    viewPath: () => "/settings/organization",
  },
  {
    key: "EmployeeDocument", label: "Worker File", icon: UserCheck,
    desc: "Passport, visa, license, HR docs…", color: "bg-teal-50 text-teal-600",
    linkEntity: "Employee", linkLabel: "Employee / Worker", linkField: "employee_id",
    linkNameField: "employee_name", nameField: "full_name", docType: true,
    viewPath: (id) => `/employees/${id}`,
  },
];

const FILES_STEPS = [
  { num: 1, label: "Destination" },
  { num: 2, label: "Upload File" },
  { num: 3, label: "Link & Save" },
];

function FilesStepper({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {FILES_STEPS.map((step, i) => (
        <React.Fragment key={step.num}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
              currentStep > step.num ? "bg-primary text-primary-foreground"
              : currentStep === step.num ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
              : "bg-muted text-muted-foreground"}`}>
              {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
            </div>
            <span className={`text-sm font-medium hidden sm:inline ${currentStep >= step.num ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
          </div>
          {i < FILES_STEPS.length - 1 && (
            <div className={`w-10 sm:w-16 h-0.5 mx-1 rounded-full transition-colors duration-300 ${currentStep > step.num ? "bg-primary" : "bg-muted"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// Lightweight searchable record picker
function RecordPicker({ label, records, displayField, value, onChange, placeholder }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = records.find(r => r.id === value) || null;
  const filtered = (records || []).filter(r =>
    String(r[displayField] || "").toLowerCase().includes(query.toLowerCase())
  ).slice(0, 50);
  return (
    <div className="relative">
      <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label} *</label>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full h-10 px-3 rounded-md border border-input bg-transparent text-left text-sm flex items-center justify-between hover:border-primary/40 transition-colors">
        <span className={selected ? "text-foreground truncate" : "text-muted-foreground"}>
          {selected ? (selected[displayField] || "Untitled") : (placeholder || "Select…")}
        </span>
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute z-40 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-72 overflow-hidden flex flex-col">
            <div className="p-2 border-b border-border">
              <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full h-8 px-2 rounded-md border border-input bg-transparent text-sm outline-none focus:border-primary" />
            </div>
            <div className="overflow-y-auto">
              {filtered.length === 0 ? (
                <p className="px-3 py-4 text-xs text-muted-foreground text-center">No records found</p>
              ) : filtered.map(r => (
                <button key={r.id} type="button"
                  onClick={() => { onChange(r.id); setOpen(false); setQuery(""); }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors truncate ${value === r.id ? "bg-primary/10 font-medium" : ""}`}>
                  {r[displayField] || "Untitled"}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function ImportFilesSection() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [destination, setDestination] = useState(null);
  const [uploaded, setUploaded] = useState(null); // { file_url, file_name, file_size, file_type }
  const [uploading, setUploading] = useState(false);
  const [records, setRecords] = useState([]);
  const [fileTypes, setFileTypes] = useState([]);
  const [docTypes, setDocTypes] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  const [fileTypeId, setFileTypeId] = useState("");
  const [docTypeId, setDocTypeId] = useState("");
  const [description, setDescription] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  // Load records + metadata when a destination is chosen
  useEffect(() => {
    if (!destination) return;
    let active = true;
    setLoadingMeta(true); setError("");
    (async () => {
      try {
        const list = await base44.entities[destination.linkEntity].list("-updated_date", 500);
        if (!active) return;
        setRecords(list || []);
        if (destination.supportsFileType) {
          try { const ft = await base44.entities.FileType.list("-created_date", 200); if (active) setFileTypes(ft || []); } catch {}
        }
        if (destination.docType) {
          try { const dt = await base44.entities.EmployeeDocumentType.list("-created_date", 200); if (active) setDocTypes(dt || []); } catch {}
        }
      } catch (err) {
        if (active) setError(err.message || "Could not load records");
      } finally {
        if (active) setLoadingMeta(false);
      }
    })();
    return () => { active = false; };
  }, [destination?.key]);

  const reset = () => {
    setStep(1); setDestination(null); setUploaded(null);
    setSelectedRecordId(null); setFileTypeId(""); setDocTypeId("");
    setDescription(""); setExpiryDate(""); setDone(null); setError("");
  };

  const handleFile = async (f) => {
    if (!f) return;
    setError("");
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
      setUploaded({ file_url, file_name: f.name, file_size: f.size, file_type: f.type || "application/octet-stream" });
    } catch (err) {
      setError(err.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const buildPayload = () => {
    const rec = records.find(r => r.id === selectedRecordId);
    if (!rec) throw new Error("Please select a record");
    const linkVal = rec.id;
    const linkName = rec[destination.nameField] || "";
    const ft = destination.supportsFileType ? fileTypes.find(t => t.id === fileTypeId) : null;
    const base = { file_url: uploaded.file_url };
    if (destination.key === "EmployeeDocument") {
      const dt = docTypes.find(t => t.id === docTypeId);
      if (!dt) throw new Error("Please select a document type");
      return {
        ...base,
        employee_id: linkVal,
        employee_name: linkName,
        document_type_id: dt.id,
        document_type_name: dt.name,
        file_name: uploaded.file_name,
        expiry_date: dt.requires_expiry && expiryDate ? expiryDate : undefined,
        notes: description || undefined,
      };
    }
    if (destination.key === "OrganizationFile") {
      return {
        ...base,
        organization_id: linkVal,
        name: uploaded.file_name,
        file_name: uploaded.file_name,
        file_size: uploaded.file_size,
        file_type: uploaded.file_type,
        file_type_id: ft?.id,
        file_type_name: ft?.name,
        notes: description || undefined,
      };
    }
    return {
      ...base,
      [destination.linkField]: linkVal,
      [destination.linkNameField]: linkName,
      file_name: uploaded.file_name,
      file_size: uploaded.file_size,
      file_type: uploaded.file_type,
      file_type_id: ft?.id,
      file_type_name: ft?.name,
      description: description || undefined,
    };
  };

  const handleSave = async () => {
    setError(""); setSaving(true);
    try {
      const payload = buildPayload();
      await base44.entities[destination.key].create(payload);
      const rec = records.find(r => r.id === selectedRecordId);
      setDone({ destination, recordName: rec?.[destination.nameField] || "" });
    } catch (err) {
      setError(err.message || "Could not save file");
      toast({ variant: "destructive", title: "Save failed", description: err.message || "Could not save file" });
    } finally {
      setSaving(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">File Saved</h2>
          <p className="text-muted-foreground mt-1">
            <span className="font-medium text-foreground">{done.recordName || "Record"}</span> now has your file attached.
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={reset} variant="outline" className="gap-1.5"><RefreshCw className="w-4 h-4" /> Upload Another</Button>
            <Link to={done.destination.viewPath(selectedRecordId)}>
              <Button className="gap-1.5">Open {done.destination.linkLabel} <ChevronRight className="w-4 h-4" /></Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <FilesStepper currentStep={step} />

      <AnimatePresence mode="wait">
        {/* STEP 1 — DESTINATION */}
        {step === 1 && (
          <motion.div key="f1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-8">
              <FileText className="w-10 h-10 mx-auto text-primary mb-3" />
              <h2 className="text-xl font-bold text-foreground">Where should this file go?</h2>
              <p className="text-sm text-muted-foreground mt-1">Pick the type of record you want to attach the file to</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {DESTINATIONS.map((d) => (
                <motion.button key={d.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => { setDestination(d); setStep(2); }}
                  className="p-5 rounded-xl border-2 border-border text-left transition-all duration-200 hover:border-primary/40 hover:bg-accent/50">
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-lg ${d.color} shrink-0`}><d.icon className="w-5 h-5" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{d.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{d.desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* STEP 2 — UPLOAD */}
        {step === 2 && destination && (
          <motion.div key="f2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-6">
              <div className={`w-10 h-10 mx-auto mb-3 rounded-lg ${destination.color} flex items-center justify-center`}>
                <destination.icon className="w-5 h-5" />
              </div>
              <h2 className="text-xl font-bold text-foreground">Upload a {destination.label}</h2>
              <p className="text-sm text-muted-foreground mt-1">Drop any file — PDF, image, document, scan…</p>
            </div>
            <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => !uploaded && !uploading && inputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all duration-200 ${
                dragOver ? "border-primary bg-primary/5"
                : uploaded ? "border-emerald-300 bg-emerald-50/50"
                : "border-border hover:border-primary/40 hover:bg-accent/30 cursor-pointer"}`}>
              <input ref={inputRef} type="file" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
              {uploading ? (
                <div className="flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">Uploading…</p></div>
              ) : uploaded ? (
                <div className="flex flex-col items-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="w-5 h-5 text-emerald-600" /></div>
                  <p className="font-medium text-foreground">{uploaded.file_name}</p>
                  <p className="text-xs text-muted-foreground">{(uploaded.file_size / 1024).toFixed(1)} KB</p>
                  <button onClick={(e) => { e.stopPropagation(); setUploaded(null); }}
                    className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1"><X className="w-3 h-3" /> Remove & choose another</button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Upload className="w-5 h-5 text-primary" /></div>
                  <div><p className="font-medium text-foreground">Click to upload or drag & drop</p><p className="text-xs text-muted-foreground mt-0.5">Any file type</p></div>
                </div>
              )}
            </div>
            {error && <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
            <div className="flex gap-3 justify-between mt-6">
              <Button variant="outline" onClick={() => { setStep(1); setUploaded(null); setError(""); }} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
              <Button onClick={() => setStep(3)} disabled={!uploaded} className="gap-1.5">Continue <ChevronRight className="w-4 h-4" /></Button>
            </div>
          </motion.div>
        )}

        {/* STEP 3 — LINK & SAVE */}
        {step === 3 && destination && uploaded && (
          <motion.div key="f3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-6">
              <Check className="w-10 h-10 mx-auto text-emerald-600 mb-3" />
              <h2 className="text-xl font-bold text-foreground">Link & save</h2>
              <p className="text-sm text-muted-foreground mt-1">Select the {destination.linkLabel.toLowerCase()} this file belongs to</p>
            </div>

            {loadingMeta ? (
              <div className="flex items-center justify-center py-10 gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Loading records…</div>
            ) : records.length === 0 ? (
              <div className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>No {destination.linkLabel.toLowerCase()}s found. Create one first, then come back to attach the file.</span>
              </div>
            ) : (
              <div className="space-y-4">
                <RecordPicker label={destination.linkLabel} records={records}
                  displayField={destination.nameField} value={selectedRecordId}
                  onChange={setSelectedRecordId} placeholder={`Select a ${destination.linkLabel.toLowerCase()}…`} />

                {/* Document type (worker files) */}
                {destination.docType && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Document Type *</label>
                    <select value={docTypeId} onChange={(e) => setDocTypeId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-transparent text-sm">
                      <option value="">— Select type —</option>
                      {docTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    {(() => { const dt = docTypes.find(t => t.id === docTypeId); return dt?.requires_expiry ? (
                      <div className="mt-3">
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Expiry Date</label>
                        <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)}
                          className="w-full h-10 px-3 rounded-md border border-input bg-transparent text-sm" />
                      </div>
                    ) : null; })()}
                  </div>
                )}

                {/* File type (non-worker files) */}
                {destination.supportsFileType && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">File Type</label>
                    <select value={fileTypeId} onChange={(e) => setFileTypeId(e.target.value)}
                      className="w-full h-10 px-3 rounded-md border border-input bg-transparent text-sm">
                      <option value="">— None —</option>
                      {fileTypes.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Description / notes */}
                {(destination.hasDescription || destination.docType) && (
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                      {destination.docType ? "Notes" : "Description"}
                    </label>
                    <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
                      placeholder="Optional notes about this file…"
                      className="w-full px-3 py-2 rounded-md border border-input bg-transparent text-sm resize-none" />
                  </div>
                )}

                {/* Selected file summary */}
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/40 border border-border">
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{uploaded.file_name}</p>
                    <p className="text-xs text-muted-foreground">{(uploaded.file_size / 1024).toFixed(1)} KB</p>
                  </div>
                </div>

                {error && <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

                <div className="flex gap-3 justify-between pt-2">
                  <Button variant="outline" onClick={() => { setStep(2); setError(""); }} disabled={saving} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
                  <Button onClick={handleSave} disabled={saving || !selectedRecordId || (destination.docType && !docTypeId)} className="gap-1.5 min-w-[140px]">
                    {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</> : <><Upload className="w-4 h-4" /> Save File</>}
                  </Button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}