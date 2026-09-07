import React, { useRef, useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, X, FileText, Image as ImageIcon, FileArchive, File as FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

/**
 * Shared file upload dialog with file type selection.
 * After the user picks files from the OS picker, this dialog opens showing
 * each file with a file type dropdown. The selected type's reference_prefix
 * is used to generate references like FILE-TL-2026-0001.
 *
 * Props:
 * - entityName: e.g. "AssetFile", "ContactFile"
 * - parentIdField: e.g. "asset_id", "contact_id"
 * - parentIdValue: the ID value
 * - onDone: callback after all files uploaded
 * - trigger: React node for the button that opens the file picker
 */
const SCOPE_MAP = {
  ContactFile: "Contact",
  ProjectFile: "Project",
  AssetFile: "Asset",
  WorkOrderFile: "WorkOrder",
  OrganizationFile: "Organization",
};

export default function SharedFileUploadDialog({ entityName, parentIdField, parentIdValue, onDone, trigger, scope }) {
  const inputRef = useRef();
  const [pendingFiles, setPendingFiles] = useState([]);
  const [fileTypes, setFileTypes] = useState([]);
  const [typeIds, setTypeIds] = useState({});
  const [uploading, setUploading] = useState(false);
  const [progressIdx, setProgressIdx] = useState(-1);

  useEffect(() => {
    base44.entities.FileType.list("name", 200).then(all => {
      setFileTypes(all || []);
    }).catch(() => {});
  }, []);

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
      Object.keys(t).forEach(k => { if (parseInt(k) < idx) next[k] = t[k]; else if (parseInt(k) > idx) next[parseInt(k) - 1] = t[k]; });
      return next;
    });
  };

  const handleUpload = async () => {
    if (!pendingFiles.length) return;
    setUploading(true);
    for (let i = 0; i < pendingFiles.length; i++) {
      setProgressIdx(i);
      const file = pendingFiles[i];
      const ft = fileTypes.find(t => t.id === typeIds[i]);
      const typePrefix = ft?.reference_prefix || "";
      const [{ file_url }, reference] = await Promise.all([
        base44.integrations.Core.UploadFile({ file }),
        generateFileReference(entityName, "FILE", typePrefix),
      ]);
      await base44.entities[entityName].create({
        reference,
        [parentIdField]: parentIdValue,
        file_name: file.name,
        file_url,
        file_size: file.size,
        file_type: file.type,
        file_type_id: ft?.id || null,
        file_type_name: ft?.name || "",
      });
    }
    setUploading(false);
    setProgressIdx(-1);
    setPendingFiles([]);
    setTypeIds({});
    onDone();
  };

  const closeDialog = () => {
    if (uploading) return;
    setPendingFiles([]);
    setTypeIds({});
  };

  return (
    <>
      <span onClick={openPicker}>{trigger}</span>
      <input ref={inputRef} type="file" multiple className="hidden" onChange={handleFileChange} />
      <Dialog open={pendingFiles.length > 0} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Files</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Select a file type for each file to generate a type-specific reference code (e.g. FILE-TL-2026-0001).
          </p>
          <div className="max-h-[50vh] overflow-y-auto space-y-2">
            {pendingFiles.map((file, i) => (
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
              {uploading ? `Uploading ${progressIdx + 1}/${pendingFiles.length}...` : `Upload ${pendingFiles.length} file${pendingFiles.length > 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}