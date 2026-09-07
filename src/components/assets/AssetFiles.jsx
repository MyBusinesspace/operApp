import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, File, Trash2, Download, FileText, Image, FileArchive } from "lucide-react";
import { Button } from "@/components/ui/button";
import SharedFileUploadDialog from "@/components/shared/SharedFileUploadDialog";
import FileTypeCell from "@/components/shared/FileTypeCell";

function fmtSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function FileIcon({ type }) {
  if (!type) return <File className="w-8 h-8 text-muted-foreground/50" />;
  if (type.startsWith("image/")) return <Image className="w-8 h-8 text-blue-400" />;
  if (type === "application/pdf") return <FileText className="w-8 h-8 text-red-400" />;
  if (type.includes("zip") || type.includes("rar")) return <FileArchive className="w-8 h-8 text-amber-400" />;
  return <FileText className="w-8 h-8 text-slate-400" />;
}

export default function AssetFiles({ assetId, files, onRefresh }) {
  const [localFiles, setLocalFiles] = useState(files);

  useEffect(() => { setLocalFiles(files); }, [files]);

  const handleTypeUpdated = (updated) =>
    setLocalFiles(prev => prev.map(f => f.id === updated.id ? updated : f));

  const handleDelete = async (id) => {
    if (!confirm("Delete this file?")) return;
    await base44.entities.AssetFile.delete(id);
    onRefresh();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-full inline-block" />
          Files
          {files.length > 0 && <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{files.length}</span>}
        </h3>
        <SharedFileUploadDialog
          entityName="AssetFile"
          parentIdField="asset_id"
          parentIdValue={assetId}
          onDone={onRefresh}
          trigger={
            <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary cursor-pointer">
              <Upload className="w-3.5 h-3.5" />Upload file
            </Button>
          }
        />
      </div>

      {files.length === 0 ? (
        <SharedFileUploadDialog
          entityName="AssetFile"
          parentIdField="asset_id"
          parentIdValue={assetId}
          onDone={onRefresh}
          trigger={
            <div className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
              <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground">Click or drag files here to upload</p>
              <p className="text-xs text-muted-foreground/60 mt-1">PDF, images, spreadsheets and more</p>
            </div>
          }
        />
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-32">Reference</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">File</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-40">Type</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Size</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Added</th>
                <th className="px-3 py-1.5 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {[...localFiles].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map((f, i) => (
                <tr key={f.id || i} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                  <td className="px-4 py-2 hidden sm:table-cell">
                    <span className="font-mono text-xs text-primary font-medium">{f.reference || "—"}</span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <FileIcon type={f.file_type} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{f.file_name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2 hidden sm:table-cell">
                    <FileTypeCell file={f} entityName="AssetFile" onUpdated={handleTypeUpdated} />
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell">{fmtSize(f.file_size)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">{fmtDate(f.created_date)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                      <a href={f.file_url} target="_blank" rel="noreferrer"
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => handleDelete(f.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}