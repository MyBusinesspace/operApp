import React, { useState } from "react";
import { Upload, Trash2, Loader2, Eye, EyeOff, FileText, File as FileIcon } from "lucide-react";
import { uploadPrivateFile } from "@/lib/privateFile";
import SignedImage from "@/components/shared/SignedImage";

function isImage(url = "") {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
}
function isPdf(url = "") {
  return /\.pdf$/i.test(url);
}

/**
 * Reusable annex files manager for Quotes, Invoices, Bills and Purchase Orders.
 * Accepts any file type (images, PDFs, documents). Files are uploaded to private
 * storage and rendered via signed URLs. Images show a thumbnail; other files show
 * a file-type icon.
 * Props: files (array of { url, caption, include }), onChange(newArray).
 *       Backward compatible with the legacy `photos` prop.
 */
export default function AnnexPhotosSection({ files, photos, onChange }) {
  const list = files ?? photos ?? [];
  const [uploading, setUploading] = useState(false);

  const handleAdd = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const { file_uri } = await uploadPrivateFile(file);
      onChange([...(list || []), { url: file_uri, caption: file.name, include: true }]);
    } catch {}
    setUploading(false);
  };

  const updateFile = (i, patch) => {
    onChange((list || []).map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const removeFile = (i) => {
    onChange((list || []).filter((_, idx) => idx !== i));
  };

  return (
    <div className="rounded-xl border border-slate-300 bg-slate-50 px-5 py-4">
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
          <FileIcon className="w-3.5 h-3.5" /> Annex files
        </label>
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            onChange={(e) => {
              const fs = Array.from(e.target.files || []);
              if (fs.length) fs.forEach(handleAdd);
              e.target.value = "";
            }}
            multiple
          />
          <span className="inline-flex items-center gap-1.5 text-xs font-medium border border-input bg-card text-foreground px-2.5 py-1.5 rounded-md hover:bg-accent transition-colors">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            {uploading ? "Uploading..." : "Add file"}
          </span>
        </label>
      </div>

      {(list || []).length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No annex files yet. Added files appear on a dedicated annex page in the PDF. Supports JPEG, PNG, PDF and more.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {(list || []).map((p, i) => {
            const included = p.include !== false;
            const img = isImage(p.url);
            const pdf = isPdf(p.url);
            return (
              <div key={i} className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="relative aspect-video bg-muted/40 flex items-center justify-center overflow-hidden">
                  {img ? (
                    <SignedImage src={p.url} alt={p.caption || `File ${i + 1}`} className="w-full h-full object-cover" />
                  ) : pdf ? (
                    <div className="flex flex-col items-center gap-1 text-red-600">
                      <FileText className="w-8 h-8" />
                      <span className="text-[10px] font-medium text-muted-foreground">PDF</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-sky-600">
                      <FileIcon className="w-8 h-8" />
                      <span className="text-[10px] font-medium text-muted-foreground">File</span>
                    </div>
                  )}
                  <button
                    type="button"
                    title={included ? "Included in PDF" : "Excluded from PDF"}
                    onClick={() => updateFile(i, { include: !included })}
                    className={`absolute top-1.5 right-1.5 inline-flex items-center justify-center w-7 h-7 rounded-md border shadow-sm transition-colors ${
                      included
                        ? "bg-white/90 border-border text-emerald-600 hover:bg-white"
                        : "bg-white/90 border-border text-muted-foreground hover:bg-white"
                    }`}
                  >
                    {included ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="p-2 space-y-1.5">
                  <input
                    type="text"
                    placeholder="Caption..."
                    value={p.caption || ""}
                    onChange={(e) => updateFile(i, { caption: e.target.value })}
                    className="w-full text-xs rounded-md border border-input bg-transparent px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  />
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-medium ${included ? "text-emerald-600" : "text-muted-foreground"}`}>
                      {included ? "Included in PDF" : "Excluded"}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Remove file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}