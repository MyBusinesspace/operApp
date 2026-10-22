import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { X, FileText, Image as ImageIcon, File, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import SignedImage from "@/components/shared/SignedImage";
import FilePreviewModal from "@/components/shared/FilePreviewModal";

function getFileMeta(url, name) {
  const ext = (name || url || "").split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return { Icon: ImageIcon, color: "text-emerald-600 bg-emerald-50", image: true };
  if (ext === "pdf") return { Icon: FileText, color: "text-red-600 bg-red-50", image: false };
  return { Icon: File, color: "text-sky-600 bg-sky-50", image: false };
}

export default function PurchaseOrderFilesViewer({ po, onClose }) {
  const [docFiles, setDocFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    if (!po?.id) { setDocFiles([]); return; }
    let active = true;
    setLoading(true);
    base44.entities.DocumentFile.filter({ doc_type: "purchase_order", doc_id: po.id }, "created_date")
      .then(list => { if (active) setDocFiles(list); })
      .catch(() => { if (active) setDocFiles([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [po?.id]);

  const annexFiles = (po?.annex_photos || []).filter(p => p.include !== false).map((p, i) => ({
    id: `annex-${i}`,
    file_name: p.caption || `Annex ${i + 1}`,
    file_url: p.url,
    file_type: "",
  }));
  const allFiles = [...annexFiles, ...docFiles];

  return (
    <div className="flex flex-col h-full bg-card border-r border-border min-w-0">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{po?.number || "Purchase order files"}</p>
          <p className="text-xs text-muted-foreground">{allFiles.length} file(s)</p>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Close">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : allFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <File className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No annex files attached to this purchase order.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {allFiles.map(file => {
              const { Icon, color, image } = getFileMeta(file.file_url, file.file_name);
              return (
                <button key={file.id} type="button" onClick={() => setViewing(file)}
                  className="rounded-lg border border-border bg-card overflow-hidden text-left hover:border-primary/50 hover:shadow-sm transition-all">
                  <div className="aspect-video bg-muted/40 flex items-center justify-center overflow-hidden">
                    {image ? (
                      <SignedImage src={file.file_url} alt={file.file_name} className="w-full h-full object-cover" />
                    ) : (
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-xs font-medium text-foreground truncate">{file.file_name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {viewing && <FilePreviewModal file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}