import React, { useRef, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, X, FileText, Image as ImageIcon, FileArchive, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generateFileReference } from "@/lib/fileNumbering";

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function RowFileIcon({ type }) {
  if (!type) return <FileIcon className="w-7 h-7 text-muted-foreground/50" />;
  if (type.startsWith("image/")) return <ImageIcon className="w-7 h-7 text-blue-400" />;
  if (type === "application/pdf") return <FileText className="w-7 h-7 text-red-400" />;
  if (type.includes("zip") || type.includes("rar")) return <FileArchive className="w-7 h-7 text-amber-400" />;
  return <FileText className="w-7 h-7 text-slate-400" />;
}

const SCOPE_BY_LEVEL = { work_order: "WorkOrder", project: "Project", asset: "Asset", contact: "Contact" };

/**
 * Upload dialog for the unified SharedFile entity.
 * Sets the ascending context links (work order → project → client) on every file
 * so a single record is pulled across all levels — no duplication.
 *
 * Props:
 * - open, onClose
 * - context: { contact_id, contact_name, project_id, project_name, work_order_id, work_order_name, asset_id, asset_name }
 * - onDone: callback after upload completes
 */
export default function SharedFileUploadModal({ open, onClose, context, onDone }) {
  const inputRef = useRef();
  const [pendingFiles, setPendingFiles] = useState([]);
  const [fileTypes, setFileTypes] = useState([]);
  const [typeIds, setTypeIds] = useState({});
  const [postDate, setPostDate] = useState("");
  const [description, setDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progressIdx, setProgressIdx] = useState(-1);

  const level = context.work_order_id ? "work_order" : context.project_id ? "project" : context.asset_id ? "asset" : "contact";
  const scope = SCOPE_BY_LEVEL[level];

  useEffect(() => {
    if (!open) return;
    setPostDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    base44.entities.FileType.list("name", 200).then(all => {
      setFileTypes(all || []);
    }).catch(() => {});
  }, [open]);

  const openPicker = () => inputRef.current?.click();

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    setPendingFiles(selected);
    setTypeIds({});
    e.target.value = "";
  };

  const removeFile = (idx) => {
    setPendingFiles(f => f.filter((_, i) => i !== idx));
    setTypeIds(t => {
      const next = {};
      Object.keys(t).forEach(k => { const ki = parseInt(k); if (ki < idx) next[ki] = t[k]; else if (ki > idx) next[ki - 1] = t[k]; });
      return next;
    });
  };

  const closeDialog = () => {
    if (uploading) return;
    setPendingFiles([]);
    setTypeIds({});
    setDescription("");
    onClose?.();
  };

  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setUploading(true);
    // Ascending links — a single record visible at every level of the chain
    const links = {
      contact_id: context.contact_id || undefined,
      contact_name: context.contact_name || undefined,
      project_id: context.project_id || undefined,
      project_name: context.project_name || undefined,
      work_order_id: context.work_order_id || undefined,
      work_order_name: context.work_order_name || undefined,
      asset_id: context.asset_id || undefined,
      asset_name: context.asset_name || undefined,
    };
    for (let i = 0; i < pendingFiles.length; i++) {
      setProgressIdx(i);
      const file = pendingFiles[i];
      const ft = fileTypes.find(t => t.id === typeIds[i]);
      const typePrefix = ft?.reference_prefix || "";
      const [{ file_url }, reference] = await Promise.all([
        base44.integrations.Core.UploadFile({ file }),
        generateFileReference("SharedFile", "FILE", typePrefix),
      ]);
      await base44.entities.SharedFile.create({
        reference,
        file_name: file.name,
        file_url,
        file_size: file.size,
        file_type: file.type,
        file_type_id: ft?.id || null,
        file_type_name: ft?.name || "",
        post_date: postDate || undefined,
        description: description || undefined,
        ...links,
      });
    }
    setUploading(false);
    setProgressIdx(-1);
    setPendingFiles([]);
    setTypeIds({});
    setDescription("");
    onDone?.();
  };

  return (
    <>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
      <Dialog open={open} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Files are linked to this {level === "work_order" ? "work order" : level} and ascend to its project and client — one record shared everywhere.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Post date</Label>
              <Input type="date" value={postDate} onChange={e => setPostDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={openPicker} disabled={uploading}>
                <Upload className="w-3.5 h-3.5" /> Select files
              </Button>
            </div>
          </div>

          <div>
            <Label className="text-xs">Description (applies to all files in this upload)</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Optional label / note for these files" className="text-sm mt-1" />
          </div>

          <div className="max-h-[44vh] overflow-y-auto space-y-2">
            {pendingFiles.length === 0 ? (
              <div className="border-2 border-dashed border-border rounded-xl p-8 text-center text-xs text-muted-foreground">
                No files selected yet. Click “Select files” to choose files.
              </div>
            ) : pendingFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/20">
                <RowFileIcon type={file.type} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{fmtSize(file.size)}</p>
                </div>
                {fileTypes.length > 0 && (
                  <Select
                    value={typeIds[i] || ""}
                    onValueChange={(v) => setTypeIds(t => ({ ...t, [i]: v }))}
                    disabled={uploading}
                  >
                    <SelectTrigger className="w-48 h-8 text-xs">
                      <SelectValue placeholder="File type (optional)" />
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
                {uploading && progressIdx === i ? (
                  <span className="text-xs text-primary font-medium shrink-0">Uploading...</span>
                ) : uploading ? (
                  <span className="text-xs text-muted-foreground shrink-0">Queued</span>
                ) : (
                  <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeFile(i)}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={uploading}>Cancel</Button>
            <Button onClick={handleUpload} disabled={uploading || !pendingFiles.length} className="gap-1.5">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? `Uploading ${progressIdx + 1}/${pendingFiles.length}...` : `Upload ${pendingFiles.length || ""} file${pendingFiles.length > 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}