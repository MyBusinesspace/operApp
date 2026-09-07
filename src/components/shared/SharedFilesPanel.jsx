import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, File, Trash2, Download, FileText, Image, FileArchive, Pencil, Link2, Briefcase, FolderKanban, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import SharedFileUploadModal from "./SharedFileUploadModal";
import SharedFileEditModal from "./SharedFileEditModal";
import SharedFileLinkModal from "./SharedFileLinkModal";
import FilePreviewModal from "./FilePreviewModal";
import FileTypeCell from "./FileTypeCell";

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

const SCOPE_BY_LEVEL = { work_order: "WorkOrder", project: "Project", asset: "Asset", contact: "Contact" };

/**
 * Unified files panel for the SharedFile entity.
 * A single file record ascends the chain (work order → project → client), so it
 * is pulled from the same source everywhere instead of being duplicated per entity.
 *
 * Props:
 * - context: { contact_id, contact_name, project_id, project_name, work_order_id, work_order_name, asset_id, asset_name }
 * - files: SharedFile records (fetched by the parent, filtered by the relevant key)
 * - onRefresh: reload callback
 */
export default function SharedFilesPanel({ context, files, onRefresh }) {
  const [localFiles, setLocalFiles] = useState(files);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [linking, setLinking] = useState(null);
  const [previewing, setPreviewing] = useState(null);

  useEffect(() => { setLocalFiles(files); }, [files]);

  const level = context.work_order_id ? "work_order" : context.project_id ? "project" : context.asset_id ? "asset" : "contact";
  const scope = SCOPE_BY_LEVEL[level];

  const handleTypeUpdated = (updated) =>
    setLocalFiles(prev => prev.map(f => f.id === updated.id ? updated : f));

  const handleEditSaved = (updated) => {
    setLocalFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
    setEditing(null);
  };

  const handleLinkSaved = (updated) => {
    setLocalFiles(prev => prev.map(f => f.id === updated.id ? updated : f));
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this file?")) return;
    await base44.entities.SharedFile.delete(id);
    onRefresh();
  };

  // Origin badge: at client / project level, indicate where an ascended file came from
  const fileOrigin = (f) => {
    if (level === "contact") {
      if (f.work_order_id && f.work_order_name) return { label: "Work Order", name: f.work_order_name };
      if (f.project_id && f.project_name) return { label: "Project", name: f.project_name };
      if (f.asset_id && f.asset_name) return { label: "Asset", name: f.asset_name };
    } else if (level === "project") {
      if (f.work_order_id && f.work_order_name) return { label: "Work Order", name: f.work_order_name };
      if (f.asset_id && f.asset_name) return { label: "Asset", name: f.asset_name };
    }
    return null;
  };

  const openUpload = () => setUploadOpen(true);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-full inline-block" />
          Files
          {files.length > 0 && (
            <span className="text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{files.length}</span>
          )}
        </h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary cursor-pointer" onClick={openUpload}>
          <Upload className="w-3.5 h-3.5" />Upload file
        </Button>
      </div>

      {files.length === 0 ? (
        <button type="button" onClick={openUpload}
          className="w-full border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors">
          <Upload className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Click or drag files here to upload</p>
          <p className="text-xs text-muted-foreground/60 mt-1">PDF, images, spreadsheets and more</p>
        </button>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-32">Reference</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">File</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-40">Type</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Post Date</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Origin</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Size</th>
                <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Added</th>
                <th className="px-3 py-1.5 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {[...localFiles].sort((a, b) => new Date(b.post_date || b.created_date) - new Date(a.post_date || a.created_date)).map((f, i) => {
                const origin = fileOrigin(f);
                return (
                  <tr key={f.id || i} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                    <td className="px-4 py-2 hidden sm:table-cell">
                      <span className="font-mono text-xs text-primary font-medium">{f.reference || "—"}</span>
                    </td>
                    <td className="px-4 py-2">
                      <button type="button" onClick={() => setPreviewing(f)} className="flex items-center gap-3 group/row text-left">
                        <FileIcon type={f.file_type} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground leading-tight truncate group-hover/row:text-primary group-hover/row:underline">{f.file_name}</p>
                          {f.description && <p className="text-xs text-muted-foreground truncate">{f.description}</p>}
                        </div>
                      </button>
                    </td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      <FileTypeCell file={f} entityName="SharedFile" scope={scope} onUpdated={handleTypeUpdated} />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">{fmtDate(f.post_date)}</td>
                    <td className="px-4 py-2 hidden lg:table-cell">
                      {origin ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-md px-1.5 py-1">
                          {origin.label === "Work Order"
                            ? <Briefcase className="w-3 h-3 shrink-0 text-primary" />
                            : origin.label === "Asset"
                              ? <Package className="w-3 h-3 shrink-0 text-primary" />
                              : <FolderKanban className="w-3 h-3 shrink-0 text-primary" />}
                          <span className="font-semibold text-primary">From {origin.label}:</span>
                          <span className="truncate max-w-[140px]">{origin.name}</span>
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground hidden sm:table-cell">{fmtSize(f.file_size)}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground hidden md:table-cell">{fmtDate(f.created_date)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary" title="Link to another scope" onClick={() => setLinking(f)}>
                          <Link2 className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary" title="Edit" onClick={() => setEditing(f)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-primary" title="Download" onClick={() => {
                          const a = document.createElement("a");
                          a.href = f.file_url; a.download = f.file_name || "file";
                          document.body.appendChild(a); a.click(); a.remove();
                        }}>
                          <Download className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive" title="Delete" onClick={() => handleDelete(f.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SharedFileUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        context={context}
        onDone={() => { setUploadOpen(false); onRefresh(); }}
      />
      {editing && (
        <SharedFileEditModal
          open={!!editing}
          file={editing}
          scope={scope}
          onClose={() => setEditing(null)}
          onSaved={handleEditSaved}
        />
      )}
      {linking && (
        <SharedFileLinkModal
          open={!!linking}
          file={linking}
          context={context}
          onClose={() => setLinking(null)}
          onSaved={handleLinkSaved}
        />
      )}
      <FilePreviewModal file={previewing} onClose={() => setPreviewing(null)} />
    </div>
  );
}