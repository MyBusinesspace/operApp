import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText } from "lucide-react";
import { getSignedUrl } from "@/lib/privateFile";

export default function FilePreviewModal({ file, onClose }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!file?.file_url) { setSrc(null); return; }
    let active = true;
    getSignedUrl(file.file_url)
      .then(url => { if (active) setSrc(url); })
      .catch(() => { if (active) setSrc(file.file_url); });
    return () => { active = false; };
  }, [file?.file_url]);

  if (!file) return null;

  const name = (file.file_name || file.file_url || "").toLowerCase();
  const isImage = (file.file_type || "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
  const isPdf = file.file_type === "application/pdf" || /\.pdf$/i.test(name);
  const isVideo = (file.file_type || "").startsWith("video/") || /\.(mp4|webm|ogg|mov|m4v)$/i.test(name);
  const isAudio = (file.file_type || "").startsWith("audio/") || /\.(mp3|wav|m4a|aac|flac)$/i.test(name);

  const download = () => {
    if (!src) return;
    const a = document.createElement("a");
    a.href = src;
    a.download = file.file_name || "file";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onClose?.()}>
      <DialogContent className="max-w-5xl w-[95vw] p-0 overflow-hidden flex flex-col" >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="min-w-0">
            <DialogTitle className="text-base truncate">{file.file_name}</DialogTitle>
            {file.reference && (
              <DialogDescription className="font-mono text-xs">{file.reference}</DialogDescription>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-muted/40 overflow-auto flex items-center justify-center p-4">
          {!src ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-16">
              <div className="w-4 h-4 border-2 border-muted border-t-primary rounded-full animate-spin" />
              Loading preview…
            </div>
          ) : isImage ? (
            <img src={src} alt={file.file_name} className="max-h-[70vh] max-w-full object-contain rounded" />
          ) : isPdf ? (
            <iframe src={src} title={file.file_name} className="w-full h-[70vh] border-0 bg-white" />
          ) : isVideo ? (
            <video src={src} controls className="max-h-[70vh] max-w-full rounded" />
          ) : isAudio ? (
            <audio src={src} controls />
          ) : (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <FileText className="w-12 h-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No inline preview available for this file type.</p>
              <Button variant="default" size="sm" className="gap-1.5" onClick={download}>
                <Download className="w-4 h-4" /> Download to view
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}