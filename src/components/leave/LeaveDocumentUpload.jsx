import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { UploadCloud, FileText, X, Loader2, Paperclip } from "lucide-react";

/**
 * Drag-and-drop document upload with a title field per document.
 * `documents` is an array of { title, file_url, file_name, file_type }.
 */
export default function LeaveDocumentUpload({ documents = [], onChange }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const newDoc = {
          title: "",
          file_url,
          file_name: file.name,
          file_type: file.type,
        };
        onChange([...documents, newDoc]);
      }
    } catch (e) {
      alert("Upload failed: " + e.message);
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    handleFiles(files);
  };

  const updateTitle = (idx, title) => {
    onChange(documents.map((d, i) => (i === idx ? { ...d, title } : d)));
  };

  const removeDoc = (idx) => {
    onChange(documents.filter((_, i) => i !== idx));
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1.5">
        <Paperclip className="w-3.5 h-3.5" /> Supporting Documents (optional)
      </Label>

      {/* Uploaded documents list */}
      {documents.length > 0 && (
        <div className="space-y-2">
          {documents.map((doc, idx) => (
            <div key={idx} className="flex items-start gap-2 p-2.5 rounded-lg border border-border bg-muted/20">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <FileText className="w-4 h-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <Input
                  placeholder="Document title (e.g. Medical Certificate)"
                  value={doc.title}
                  onChange={(e) => updateTitle(idx, e.target.value)}
                  className="h-8 text-sm"
                />
                <p className="text-xs text-muted-foreground truncate">
                  {doc.file_name}
                  {doc.file_type && <span className="text-muted-foreground/60"> · {doc.file_type}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeDoc(idx)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed transition-colors flex flex-col items-center justify-center py-6 px-4 text-center
          ${dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/40 hover:bg-muted/30"
          }`}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 text-primary animate-spin mb-2" />
        ) : (
          <UploadCloud className="w-5 h-5 text-muted-foreground mb-2" />
        )}
        <p className="text-xs text-muted-foreground">
          {uploading ? "Uploading..." : "Drag & drop documents here, or click to browse"}
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">PDF, images, Word files, etc.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(Array.from(e.target.files || []))}
        />
      </div>
    </div>
  );
}