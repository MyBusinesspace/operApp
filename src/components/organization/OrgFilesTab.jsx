import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Upload, Trash2, FileText, Eye, X, FolderOpen, Loader2,
  ExternalLink, Plus, FileImage, FileArchive, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { generateFileReference } from "@/lib/fileNumbering";
import FileTypeCell from "@/components/shared/FileTypeCell";

// ─── Document Viewer ───────────────────────────────────────────────────────────
function DocumentViewer({ doc, onClose }) {
  const isImage = doc.file_url && /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(doc.file_url.split("?")[0]);
  const isPdf = doc.file_url && /\.pdf$/i.test(doc.file_url.split("?")[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{doc.name}</span>
            {doc.file_size && <span className="text-xs text-muted-foreground">({formatSize(doc.file_size)})</span>}
          </div>
          <div className="flex items-center gap-1">
            <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
              <Button size="icon" variant="ghost" className="h-8 w-8"><ExternalLink className="w-3.5 h-3.5" /></Button>
            </a>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground ml-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 bg-muted/30 flex items-center justify-center overflow-hidden min-h-0">
          {isImage
            ? <img src={doc.file_url} alt={doc.name} className="max-w-full max-h-full object-contain" />
            : isPdf
            ? <iframe src={doc.file_url} title={doc.name} className="w-full h-full border-0" style={{ minHeight: 500 }} />
            : <div className="flex flex-col items-center gap-3 text-muted-foreground py-16">
                <FileText className="w-14 h-14 opacity-20" />
                <p className="text-sm font-medium">Preview not available</p>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer">
                  <Button size="sm" variant="outline" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Open in new tab</Button>
                </a>
              </div>
          }
        </div>
        {doc.notes && (
          <div className="px-5 py-3 border-t border-border text-sm text-muted-foreground shrink-0">
            <span className="font-medium text-foreground">Notes: </span>{doc.notes}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bulk Upload Modal ─────────────────────────────────────────────────────────
function BulkUploadModal({ open, onClose, onDone, orgId, fileTypes = [] }) {
  const [files, setFiles] = useState([]);
  const [stage, setStage] = useState("select"); // select | saving
  const [savingIdx, setSavingIdx] = useState(-1);
  const [notes, setNotes] = useState({});
  const [typeIds, setTypeIds] = useState({});
  const fileRef = useRef();

  useEffect(() => {
    if (open) { setFiles([]); setStage("select"); setSavingIdx(-1); setNotes({}); setTypeIds({}); }
  }, [open]);

  const addFiles = (newFiles) => setFiles(prev => [...prev, ...Array.from(newFiles)]);
  const removeFile = (idx) => setFiles(f => f.filter((_, i) => i !== idx));

  const handleDrop = (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); };

  const saveAll = async () => {
    setStage("saving");
    for (let i = 0; i < files.length; i++) {
      setSavingIdx(i);
      const file = files[i];
      const ft = fileTypes.find(t => t.id === typeIds[i]);
      const typePrefix = ft?.reference_prefix || "";
      const reference = await generateFileReference("OrganizationFile", "FILE", typePrefix);
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.OrganizationFile.create({
        organization_id: orgId,
        name: file.name,
        file_url,
        file_type: file.type,
        file_size: file.size,
        reference,
        file_type_id: ft?.id || null,
        file_type_name: ft?.name || "",
        notes: notes[i] || "",
      });
    }
    onDone();
  };

  return (
    <Dialog open={open} onOpenChange={stage === "saving" ? undefined : onClose}>
      <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            {stage === "select" ? "Upload Documents" : "Uploading..."}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 min-h-0 pt-1">
          {stage === "select" && (
            <>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-input rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-muted/20 transition-colors"
              >
                <FolderOpen className="w-10 h-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm font-medium text-foreground">Drop files here or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, images and any document type accepted</p>
                </div>
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => addFiles(e.target.files)} />
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{files.length} file{files.length !== 1 ? "s" : ""} selected</p>
                  {files.map((f, i) => (
                    <div key={i} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/20">
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate text-sm font-medium text-foreground">{f.name}</span>
                        <span className="text-xs text-muted-foreground">{formatSize(f.size)}</span>
                        <button onClick={e => { e.stopPropagation(); removeFile(i); }} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="px-3 py-2 border-t border-border space-y-2">
                        {fileTypes.length > 0 && (
                          <Select value={typeIds[i] || ""} onValueChange={v => setTypeIds(t => ({ ...t, [i]: v }))}>
                            <SelectTrigger className="h-7 text-xs">
                              <SelectValue placeholder="Select file type (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              {fileTypes.map(ft => (
                                <SelectItem key={ft.id} value={ft.id} className="text-xs">
                                  {ft.name}{ft.reference_prefix ? ` (${ft.reference_prefix})` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <Input
                          className="h-7 text-xs"
                          placeholder="Optional notes (e.g. Trade License 2025)"
                          value={notes[i] || ""}
                          onChange={e => setNotes(n => ({ ...n, [i]: e.target.value }))}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {stage === "saving" && (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-foreground">Uploading {savingIdx + 1} of {files.length}...</p>
                <p className="text-xs text-muted-foreground mt-1">{files[savingIdx]?.name}</p>
              </div>
            </div>
          )}
        </div>

        {stage === "select" && (
          <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={saveAll} disabled={files.length === 0} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" /> Upload {files.length > 0 ? `(${files.length})` : ""}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function fileIcon(fileType) {
  if (!fileType) return <FileText className="w-4 h-4 text-muted-foreground" />;
  if (fileType.startsWith("image/")) return <FileImage className="w-4 h-4 text-blue-500" />;
  if (fileType === "application/pdf") return <FileText className="w-4 h-4 text-red-500" />;
  if (fileType.includes("zip") || fileType.includes("rar")) return <FileArchive className="w-4 h-4 text-amber-500" />;
  return <FileText className="w-4 h-4 text-muted-foreground" />;
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function OrgFilesTab({ orgId }) {
  const [files, setFiles] = useState([]);
  const [fileTypes, setFileTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploadModal, setUploadModal] = useState(false);
  const [viewingDoc, setViewingDoc] = useState(null);

  const load = async () => {
    setLoading(true);
    const f = await base44.entities.OrganizationFile.filter({ organization_id: orgId }, "-created_date");
    setFiles(f);
    setLoading(false);
  };

  useEffect(() => { if (orgId) load(); }, [orgId]);

  useEffect(() => {
    base44.entities.FileType.list("name", 200).then(all => {
      setFileTypes((all || []).filter(t => t.entity_scope === "Organization"));
    }).catch(() => {});
  }, []);

  const handleDelete = async (id) => {
    if (!confirm("Delete this file?")) return;
    await base44.entities.OrganizationFile.delete(id);
    if (viewingDoc?.id === id) setViewingDoc(null);
    load();
  };

  const handleTypeUpdated = (updated) =>
    setFiles(prev => prev.map(f => f.id === updated.id ? updated : f));

  if (loading) return <div className="py-12 text-center text-sm text-muted-foreground">Loading files...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between pt-2">
        <p className="text-sm text-muted-foreground">{files.length} file{files.length !== 1 ? "s" : ""} stored</p>
        <Button size="sm" className="gap-1.5" onClick={() => setUploadModal(true)}>
          <Plus className="w-3.5 h-3.5" /> Upload Documents
        </Button>
      </div>

      {files.length === 0 ? (
        <div
          onClick={() => setUploadModal(true)}
          className="border-2 border-dashed border-input rounded-xl p-12 flex flex-col items-center gap-3 cursor-pointer hover:border-primary hover:bg-muted/20 transition-colors text-center"
        >
          <FolderOpen className="w-10 h-10 text-muted-foreground/40" />
          <div>
            <p className="text-sm font-medium text-foreground">No files yet</p>
            <p className="text-xs text-muted-foreground mt-1">Upload trade licenses, certificates, contracts, and other company documents</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 mt-1">
            <Upload className="w-3.5 h-3.5" /> Upload Files
          </Button>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden divide-y divide-border">
          {files.map(f => (
            <div key={f.id} className="flex items-center gap-3 px-4 py-2 hover:bg-muted/20 group transition-colors">
              <div className="shrink-0">{fileIcon(f.file_type)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {f.reference && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">{f.reference}</span>}
                  <p className="text-sm font-medium text-foreground truncate">{f.name}</p>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  {f.file_size && <span className="text-xs text-muted-foreground">{formatSize(f.file_size)}</span>}
                  {f.notes && <span className="text-xs text-muted-foreground">· {f.notes}</span>}
                </div>
              </div>
              <div className="shrink-0">
                <FileTypeCell file={f} entityName="OrganizationFile" onUpdated={handleTypeUpdated} scope="Organization" />
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <button onClick={() => setViewingDoc(f)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary">
                  <Eye className="w-3.5 h-3.5" />
                </button>
                <a href={f.file_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-primary">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </a>
                <button onClick={() => handleDelete(f.id)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingDoc && <DocumentViewer doc={viewingDoc} onClose={() => setViewingDoc(null)} />}

      <BulkUploadModal
        open={uploadModal}
        onClose={() => setUploadModal(false)}
        onDone={() => { setUploadModal(false); load(); }}
        orgId={orgId}
        fileTypes={fileTypes}
      />
    </div>
  );
}