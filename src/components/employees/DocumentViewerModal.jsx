import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  FileText, X, Sparkles, Loader2, RefreshCw, Check, AlertCircle,
  CheckCircle2, Clock, Download, Calendar, Hash, User, Globe,
  MapPin, FileCheck, ShieldCheck, ChevronRight,
} from "lucide-react";
import { format, parseISO, isValid } from "date-fns";

// ─── Expiry helpers ─────────────────────────────────────────────────────────
function expiryStatus(dateStr) {
  if (!dateStr) return null;
  const d = typeof dateStr === "string" ? parseISO(dateStr) : dateStr;
  if (!isValid(d)) return null;
  const diff = (d - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "expired";
  if (diff <= 30) return "soon";
  if (diff <= 60) return "warning";
  return "ok";
}

function ExpiryPill({ date, size = "sm" }) {
  const status = expiryStatus(date);
  if (!status) return null;
  const d = typeof date === "string" ? parseISO(date) : date;
  const formatted = format(d, "dd MMM yyyy");
  const cfg = {
    expired: { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", ring: "ring-red-200 dark:ring-red-800", icon: AlertCircle, label: "Expired" },
    soon:    { bg: "bg-red-50 dark:bg-red-950/40", text: "text-red-700 dark:text-red-300", ring: "ring-red-200 dark:ring-red-800", icon: AlertCircle, label: formatted },
    warning: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-200 dark:ring-amber-800", icon: Clock, label: formatted },
    ok:      { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-200 dark:ring-emerald-800", icon: CheckCircle2, label: formatted },
  }[status];
  const Icon = cfg.icon;
  const pad = size === "lg" ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[11px]";
  return (
    <span className={`inline-flex items-center gap-1 ${pad} rounded-full font-semibold ring-1 ${cfg.bg} ${cfg.text} ${cfg.ring}`}>
      <Icon className={size === "lg" ? "w-3.5 h-3.5" : "w-3 h-3"} />
      {status === "expired" ? "Expired" : cfg.label}
    </span>
  );
}

// ─── Field renderer for extracted data ──────────────────────────────────────
const FIELD_META = {
  document_number:   { icon: Hash,       label: "Document No." },
  full_name:         { icon: User,       label: "Full Name" },
  date_of_birth:     { icon: Calendar,   label: "Date of Birth" },
  expiry_date:       { icon: Calendar,   label: "Expiry Date" },
  issue_date:        { icon: Calendar,   label: "Issue Date" },
  issuing_authority: { icon: ShieldCheck, label: "Issuing Authority" },
  nationality:       { icon: Globe,      label: "Nationality" },
};

function formatDateValue(v) {
  if (!v) return null;
  const d = parseISO(v);
  return isValid(d) ? format(d, "dd MMM yyyy") : String(v);
}

function DataField({ fieldKey, value }) {
  const meta = FIELD_META[fieldKey] || { icon: ChevronRight, label: fieldKey.replace(/_/g, " ") };
  const Icon = meta.icon;
  const display = fieldKey.includes("date") ? formatDateValue(value) : String(value);
  return (
    <div className="flex items-start gap-2.5 rounded-lg bg-muted/40 border border-border/60 px-3 py-2.5">
      <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
        <Icon className="w-3.5 h-3.5 text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{meta.label}</p>
        <p className="text-sm font-medium text-foreground truncate" title={display}>{display}</p>
      </div>
    </div>
  );
}

// ─── AI Data Panel ──────────────────────────────────────────────────────────
function AiDataPanel({ fileUrl, docTypeName, onApply, initialFields }) {
  const [extracting, setExtracting] = useState(false);
  const [fields, setFields] = useState(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (initialFields) {
      const saved = {
        document_number: initialFields.document_number || null,
        full_name: initialFields.full_name || null,
        date_of_birth: initialFields.date_of_birth || null,
        expiry_date: initialFields.expiry_date || null,
        issue_date: initialFields.issue_date || null,
        issuing_authority: initialFields.issuing_authority || null,
        nationality: initialFields.nationality || null,
        extra_fields: initialFields.extra_fields || null,
      };
      if (Object.values(saved).some(v => v)) setFields(saved);
    }
    setApplied(false);
  }, [initialFields]);

  const extract = async () => {
    setExtracting(true); setError(null); setFields(null); setApplied(false);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a document data extractor. Analyze this ${docTypeName || "document"} and extract key info.
Return JSON with: document_number, full_name, date_of_birth (YYYY-MM-DD), expiry_date (YYYY-MM-DD), issue_date (YYYY-MM-DD), issuing_authority, nationality, extra_fields (object with any other key info).
Use null for missing fields. Be precise.`,
        file_urls: [fileUrl],
        response_json_schema: {
          type: "object",
          properties: {
            document_number: { type: "string" },
            full_name: { type: "string" },
            date_of_birth: { type: "string" },
            expiry_date: { type: "string" },
            issue_date: { type: "string" },
            issuing_authority: { type: "string" },
            nationality: { type: "string" },
            extra_fields: { type: "object" },
          },
        },
      });
      setFields(result);
    } catch {
      setError("Could not extract data.");
    }
    setExtracting(false);
  };

  const knownFields = fields
    ? Object.entries(fields).filter(([k, v]) => v && FIELD_META[k])
    : [];
  const extraEntries = fields?.extra_fields
    ? Object.entries(fields.extra_fields).filter(([, v]) => v)
    : [];
  const hasData = knownFields.length > 0 || extraEntries.length > 0;

  return (
    <div className="rounded-xl border border-border bg-gradient-to-br from-primary/5 to-transparent p-3.5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-xs font-semibold text-foreground leading-tight">AI Extraction</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Auto-detect document data</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={extract} disabled={extracting}>
          {extracting ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {fields ? "Re-scan" : "Scan"}
        </Button>
      </div>

      {extracting && (
        <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
          Analyzing document...
        </div>
      )}
      {error && <p className="text-xs text-destructive py-1">{error}</p>}

      {fields && !extracting && (
        <div className="space-y-2">
          {hasData ? (
            <div className="grid grid-cols-1 gap-2">
              {knownFields.map(([k, v]) => (
                <DataField key={k} fieldKey={k} value={v} />
              ))}
              {extraEntries.map(([k, v]) => (
                <DataField key={k} fieldKey={k} value={v} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground py-2 text-center">No data extracted.</p>
          )}

          {hasData && onApply && (
            <Button
              size="sm"
              variant={applied ? "secondary" : "default"}
              className="w-full h-8 text-xs gap-1.5 mt-1"
              onClick={() => { onApply(fields); setApplied(true); }}
            >
              {applied ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
              {applied ? "Saved to record" : "Save to record"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Viewer ────────────────────────────────────────────────────────────
export default function DocumentViewerModal({ doc, docTypeName, docTypeColor, onClose, onUpdate }) {
  const isImage = doc.file_url && /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(doc.file_url.split("?")[0]);
  const isPdf = doc.file_url && /\.pdf$/i.test(doc.file_url.split("?")[0]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] flex flex-col overflow-hidden ring-1 ring-border/60 animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with accent bar */}
        <div className="relative shrink-0">
          <div className="h-1 w-full" style={{ backgroundColor: docTypeColor || "var(--primary)" }} />
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: (docTypeColor || "#6366f1") + "20" }}
              >
                <FileText className="w-5 h-5" style={{ color: docTypeColor || "var(--primary)" }} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground truncate">{doc.file_name || "Document"}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {docTypeName && (
                    <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                      {docTypeName}
                    </span>
                  )}
                  {doc.expiry_date && <ExpiryPill date={doc.expiry_date} />}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <a href={doc.file_url} target="_blank" rel="noopener noreferrer" title="Open in new tab">
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <Download className="w-4 h-4" />
                </Button>
              </a>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Body — 50/50 split: viewer left, data right */}
        <div className="flex flex-1 min-h-0 flex-col md:flex-row">
          {/* Preview — left 50% */}
          <div className="md:w-1/2 min-h-0 bg-slate-100 dark:bg-slate-900/50 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-transparent to-slate-200/30 dark:to-slate-950/40 pointer-events-none" />
            <div className="relative h-full flex items-center justify-center p-3 sm:p-6 overflow-auto">
              {isImage ? (
                <img
                  src={doc.file_url}
                  alt={doc.file_name}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-xl ring-1 ring-black/5"
                />
              ) : isPdf ? (
                <iframe
                  src={doc.file_url}
                  title={doc.file_name}
                  className="w-full h-full min-h-[50vh] md:min-h-0 border-0 rounded-lg shadow-xl ring-1 ring-black/5 bg-white"
                />
              ) : (
                <div className="flex flex-col items-center gap-4 text-muted-foreground py-16">
                  <div className="w-20 h-20 rounded-2xl bg-muted flex items-center justify-center">
                    <FileText className="w-10 h-10 opacity-40" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">Preview not available</p>
                    <p className="text-xs text-muted-foreground mt-1">Open the file to view its contents</p>
                  </div>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                    <Button size="sm" variant="outline" className="gap-1.5">
                      <Download className="w-3.5 h-3.5" /> Open in new tab
                    </Button>
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Data panel — right 50% */}
          <div className="md:w-1/2 shrink-0 border-t md:border-t-0 md:border-l border-border overflow-y-auto bg-background">
            <div className="p-4 space-y-4">
              {/* Document info card */}
              <div className="rounded-xl border border-border bg-card p-3.5">
                <div className="flex items-center gap-2 mb-3">
                  <FileCheck className="w-3.5 h-3.5 text-muted-foreground" />
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Info</p>
                </div>
                <div className="space-y-2.5">
                  {doc.document_type_name && (
                    <div className="flex items-start gap-2.5">
                      <span className="text-[11px] text-muted-foreground w-24 shrink-0 mt-0.5">Type</span>
                      <span className="text-xs font-medium text-foreground">{doc.document_type_name}</span>
                    </div>
                  )}
                  {doc.document_number && (
                    <div className="flex items-start gap-2.5">
                      <span className="text-[11px] text-muted-foreground w-24 shrink-0 mt-0.5">Doc Number</span>
                      <span className="text-xs font-medium text-foreground font-mono">{doc.document_number}</span>
                    </div>
                  )}
                  {doc.expiry_date && (
                    <div className="flex items-start gap-2.5">
                      <span className="text-[11px] text-muted-foreground w-24 shrink-0 mt-0.5">Expiry Date</span>
                      <ExpiryPill date={doc.expiry_date} />
                    </div>
                  )}
                  {doc.full_name && (
                    <div className="flex items-start gap-2.5">
                      <span className="text-[11px] text-muted-foreground w-24 shrink-0 mt-0.5">Name</span>
                      <span className="text-xs font-medium text-foreground">{doc.full_name}</span>
                    </div>
                  )}
                  {doc.nationality && (
                    <div className="flex items-start gap-2.5">
                      <span className="text-[11px] text-muted-foreground w-24 shrink-0 mt-0.5">Nationality</span>
                      <span className="text-xs font-medium text-foreground">{doc.nationality}</span>
                    </div>
                  )}
                  {doc.notes && (
                    <div className="flex items-start gap-2.5">
                      <span className="text-[11px] text-muted-foreground w-24 shrink-0 mt-0.5">Notes</span>
                      <span className="text-xs font-medium text-foreground">{doc.notes}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* AI extraction */}
              {doc.file_url && (
                <AiDataPanel
                  fileUrl={doc.file_url}
                  docTypeName={docTypeName}
                  initialFields={doc}
                  onApply={onUpdate ? (f) => onUpdate(doc.id, f) : null}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}