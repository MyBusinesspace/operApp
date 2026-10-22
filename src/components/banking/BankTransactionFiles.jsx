import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { uploadPrivateFile } from "@/lib/privateFile";
import { Button } from "@/components/ui/button";
import { FileText, Image as ImageIcon, File as FileIcon, Upload, Trash2, Loader2 } from "lucide-react";
import SignedImage from "@/components/shared/SignedImage";
import FilePreviewModal from "@/components/shared/FilePreviewModal";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { toast } from "sonner";

function getFileMeta(url, name) {
  const ext = (name || url || "").split(".").pop().toLowerCase();
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext)) return { Icon: ImageIcon, color: "text-emerald-600 bg-emerald-50", image: true };
  if (ext === "pdf") return { Icon: FileText, color: "text-red-600 bg-red-50", image: false };
  return { Icon: FileIcon, color: "text-sky-600 bg-sky-50", image: false };
}

export default function BankTransactionFiles({ transactionId, txNumber }) {
  const { can } = usePermissionsMatrix();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [viewing, setViewing] = useState(null);
  const inputRef = useRef(null);

  const loadFiles = async () => {
    if (!transactionId) { setFiles([]); return; }
    setLoading(true);
    try {
      const list = await base44.entities.DocumentFile.filter({ doc_type: "bank_transaction", doc_id: transactionId }, "-created_date");
      setFiles(list || []);
    } catch { setFiles([]); }
    setLoading(false);
  };

  useEffect(() => { loadFiles(); }, [transactionId]);

  const handleUpload = async (e) => {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    e.target.value = "";
    setUploading(true);
    try {
      for (const file of selected) {
        const { file_uri } = await uploadPrivateFile(file);
        await base44.entities.DocumentFile.create({
          doc_type: "bank_transaction",
          doc_id: transactionId,
          doc_number: txNumber || "",
          file_name: file.name,
          file_url: file_uri,
          file_size: file.size,
          file_type: file.type,
        });
      }
      toast.success(`${selected.length} file${selected.length > 1 ? "s" : ""} uploaded`);
      loadFiles();
    } catch (err) {
      toast.error("Failed to upload file");
    }
    setUploading(false);
  };

  const handleDelete = async (file) => {
    if (!confirm(`Delete "${file.file_name}"?`)) return;
    try {
      await base44.entities.DocumentFile.delete(file.id);
      loadFiles();
    } catch { toast.error("Failed to delete file"); }
  };

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">Files</span>
          <span className="text-xs text-muted-foreground">{files.length} file(s)</span>
        </div>
        {can("bank_transactions", "can_edit") && (
          <>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={handleUpload} />
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </>
        )}
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : files.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileIcon className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No files attached to this transaction.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {files.map(file => {
              const { Icon, color, image } = getFileMeta(file.file_url, file.file_name);
              return (
                <div key={file.id} className="group relative rounded-lg border border-border bg-card overflow-hidden">
                  <button type="button" onClick={() => setViewing(file)} className="w-full text-left">
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
                  {can("bank_transactions", "can_delete") && (
                    <button
                      onClick={() => handleDelete(file)}
                      className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-background/80 hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {viewing && <FilePreviewModal file={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}