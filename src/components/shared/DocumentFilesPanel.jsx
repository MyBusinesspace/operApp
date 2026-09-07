import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import {
  Upload, Trash2, Eye, Download, FileText,
  Image as ImageIcon, FileArchive, File, Loader2, Paperclip
} from "lucide-react";
import FileViewerModal from "./FileViewerModal";

const MAX_SIZE_MB = 25;

function formatBytes(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getFileMeta(fileType, fileName) {
  const type = fileType || "";
  const ext = (fileName || "").split(".").pop().toLowerCase();
  if (type.startsWith("image/")) return { Icon: ImageIcon, color: "text-emerald-600 bg-emerald-50" };
  if (type === "application/pdf" || ext === "pdf") return { Icon: FileText, color: "text-red-600 bg-red-50" };
  if (type.includes("zip") || type.includes("archive") || ["zip", "rar", "7z", "tar"].includes(ext))
    return { Icon: FileArchive, color: "text-amber-600 bg-amber-50" };
  return { Icon: File, color: "text-sky-600 bg-sky-50" };
}

export default function DocumentFilesPanel({ docType, docId, docNumber, onFilesChange }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewingFile, setViewingFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const onlineLabel = docType === "invoice" ? "Include with online invoice" : "Include with online quote";

  const load = async () => {
    if (!docId) return;
    setLoading(true);
    const list = await base44.entities.DocumentFile.filter({ doc_type: docType, doc_id: docId }, "created_date").catch(() => []);
    setFiles(list);
    setLoading(false);
    onFilesChange?.(list);
  };

  useEffect(() => { load(); }, [docId]);

  const persistFiles = async (selected) => {
    setUploading(true);
    for (const file of selected) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      await base44.entities.DocumentFile.create({
        doc_type: docType,
        doc_id: docId,
        doc_number: docNumber || "",
        file_name: file.name,
        file_url,
        file_size: file.size,
        file_type: file.type,
      });
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
    load();
  };

  const handleUpload = (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length) persistFiles(selectedFiles);
  };

  const handleDelete = async (fileId) => {
    if (!confirm("Remove this file?")) return;
    await base44.entities.DocumentFile.delete(fileId);
    load();
  };

  const handleToggleInclude = async (file, checked) => {
    await base44.entities.DocumentFile.update(file.id, { include_in_pdf: checked });
    setFiles(prev => prev.map(f => f.id === file.id ? { ...f, include_in_pdf: checked } : f));
  };

  const handleDragOver = (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragging(true); };
  const handleDragLeave = () => setDragging(false);
  const handleDrop = async (e) => {
    e.preventDefault();
    setDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    if (droppedFiles.length) persistFiles(droppedFiles);
  };

  const openPicker = () => inputRef.current?.click();

  if (!docId) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-5 text-center">
        <Paperclip className="w-4 h-4 text-muted-foreground/40 mx-auto mb-1.5" />
        <p className="text-xs text-muted-foreground">Save the document first to attach files.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleUpload} />

      <span className="text-sm font-semibold text-foreground">Attach files</span>

      {/* Drop zone */}
      <div
        className={`rounded-lg border-2 border-dashed p-5 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/20"
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openPicker}
      >
        <p className="text-sm text-muted-foreground mb-3">Drag and drop files or select manually</p>
        <div className="flex justify-center" onClick={e => e.stopPropagation()}>
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={openPicker} disabled={uploading}>
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {uploading ? "Uploading..." : "Upload files"}
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-3">{MAX_SIZE_MB} MB max size per file</p>
      </div>

      {/* File list */}
      {loading ? (
        <div className="flex items-center justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : files.length > 0 ? (
        <div className="space-y-2">
          {files.map(file => {
            const { Icon, color } = getFileMeta(file.file_type, file.file_name);
            const isImage = file.file_type?.startsWith("image/");
            return (
              <div key={file.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                <div className="flex items-center gap-3">
                  {isImage ? (
                    <img src={file.file_url} alt={file.file_name}
                      className="w-8 h-8 object-cover rounded-md border border-border shrink-0" />
                  ) : (
                    <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.file_name}</p>
                    <p className="text-xs text-muted-foreground">{formatBytes(file.file_size)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button type="button" className="text-xs font-medium text-primary hover:underline"
                      onClick={() => setViewingFile(file)}>
                      View
                    </button>
                    <a href={file.file_url} download={file.file_name} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Download">
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    </a>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      title="Remove" onClick={() => handleDelete(file.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer pl-11 mt-1.5" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="rounded border-border w-3.5 h-3.5 accent-primary"
                    checked={file.include_in_pdf === true}
                    onChange={e => handleToggleInclude(file, e.target.checked)}
                  />
                  <span className="text-xs text-muted-foreground">{onlineLabel}</span>
                </label>
              </div>
            );
          })}
        </div>
      ) : null}

      {viewingFile && <FileViewerModal file={viewingFile} onClose={() => setViewingFile(null)} />}
    </div>
  );
}