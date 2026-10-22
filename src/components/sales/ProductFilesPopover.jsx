import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip, FileText, File as FileIcon } from "lucide-react";
import SignedImage from "@/components/shared/SignedImage";
import FilePreviewModal from "@/components/shared/FilePreviewModal";

function isImage(url = "") {
  return /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(url);
}
function isPdf(url = "") {
  return /\.pdf$/i.test(url);
}

export default function ProductFilesPopover({ product }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const files = product?.annex_photos || [];

  if (!product?.id) return null;

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            title={files.length ? `${files.length} file(s)` : "No files"}
            className={`inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors ${files.length ? "text-primary hover:bg-primary/10" : "text-muted-foreground/40 hover:bg-muted"}`}
          >
            <Paperclip className="w-4 h-4" />
            {files.length > 0 && (
              <span className="ml-0.5 text-[10px] font-bold leading-none">{files.length}</span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[360px] p-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            Annex files ({files.length})
          </p>
          {files.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3 text-center">No files attached.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-[280px] overflow-y-auto">
              {files.map((f, i) => {
                const img = isImage(f.url);
                const pdf = isPdf(f.url);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setPreview({ file_url: f.url, file_name: f.caption || `File ${i + 1}` })}
                    className="relative aspect-square rounded-lg border border-border bg-muted/40 overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-primary/40 transition"
                  >
                    {img ? (
                      <SignedImage src={f.url} alt={f.caption || `File ${i + 1}`} className="w-full h-full object-cover" />
                    ) : pdf ? (
                      <div className="flex flex-col items-center gap-1 text-red-600">
                        <FileText className="w-7 h-7" />
                        <span className="text-[9px] font-medium text-muted-foreground">PDF</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-1 text-sky-600">
                        <FileIcon className="w-7 h-7" />
                        <span className="text-[9px] font-medium text-muted-foreground">File</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </PopoverContent>
      </Popover>
      {preview && (
        <FilePreviewModal file={preview} onClose={() => setPreview(null)} />
      )}
    </>
  );
}