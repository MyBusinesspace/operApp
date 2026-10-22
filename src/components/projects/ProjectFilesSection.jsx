import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Trash2, FileText, Image as ImageIcon, File as FileIcon, Loader2, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import FileDropzone from "@/components/shared/FileDropzone";
import SharedFileUploadDialog from "@/components/shared/SharedFileUploadDialog";
import SignedLink from "@/components/shared/SignedLink";

function getFileIcon(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return ImageIcon;
  if (ext === "pdf") return FileText;
  return FileIcon;
}

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ProjectFilesSection({ projectId }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadFiles = useCallback(() => {
    if (!projectId) { setFiles([]); return; }
    setLoading(true);
    base44.entities.ProjectFile.filter({ project_id: projectId }, "created_date")
      .then(list => setFiles(list))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => { loadFiles(); }, [loadFiles, refreshKey]);

  const handleDelete = async (id) => {
    if (!confirm("Delete this file?")) return;
    await base44.entities.ProjectFile.delete(id);
    setRefreshKey(k => k + 1);
  };

  const onDone = () => {
    setDroppedFiles(null);
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="col-span-2 space-y-2">
      <Label className="flex items-center gap-2">
        Files
        {files.length > 0 && <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{files.length}</span>}
      </Label>

      <FileDropzone onFilesDropped={setDroppedFiles} className="rounded-lg">
        <div className="border-2 border-dashed border-border rounded-lg p-3 transition-colors hover:border-primary/40">
          {loading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center gap-1 py-3 text-center">
              <Upload className="w-6 h-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">Drag files here or click upload</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {[...files].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map(f => {
                const Icon = getFileIcon(f.file_name);
                return (
                  <div key={f.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-border bg-card group">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-foreground truncate">{f.file_name}</p>
                      <p className="text-[10px] text-muted-foreground">{fmtSize(f.file_size)}</p>
                    </div>
                    <SignedLink href={f.file_url} target="_blank" rel="noreferrer"
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary inline-flex shrink-0">
                      <Download className="w-3.5 h-3.5" />
                    </SignedLink>
                    <button type="button" onClick={() => handleDelete(f.id)}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </FileDropzone>

      <div className="flex justify-end">
        <SharedFileUploadDialog
          entityName="ProjectFile"
          parentIdField="project_id"
          parentIdValue={projectId}
          onDone={onDone}
          initialFiles={droppedFiles}
          trigger={
            <Button type="button" size="sm" variant="outline" className="gap-1.5 text-xs h-8">
              <Upload className="w-3.5 h-3.5" /> Upload files
            </Button>
          }
        />
      </div>
    </div>
  );
}