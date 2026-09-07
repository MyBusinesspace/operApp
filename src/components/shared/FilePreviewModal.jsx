import React from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, FileText, File } from "lucide-react";

export default function FilePreviewModal({ file, onClose }) {
  if (!file) return null;

  const isImage = (file.file_type || "").startsWith("image/");
  const isPdf = file.file_type === "application/pdf";
  const isVideo = (file.file_type || "").startsWith("video/");
  const isAudio = (file.file_type || "").startsWith("audio/");

  const download = () => {
    const a = document.createElement("a");
    a.href = file.file_url;
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={download}>
              <Download className="w-4 h-4" /> Download
            </Button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-muted/40 overflow-auto flex items-center justify-center p-4">
          {isImage ? (
            <img src={file.file_url} alt={file.file_name} className="max-h-[70vh] max-w-full object-contain rounded" />
          ) : isPdf ? (
            <iframe src={file.file_url} title={file.file_name} className="w-full h-[70vh] border-0 bg-white" />
          ) : isVideo ? (
            <video src={file.file_url} controls className="max-h-[70vh] max-w-full rounded" />
          ) : isAudio ? (
            <audio src={file.file_url} controls />
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