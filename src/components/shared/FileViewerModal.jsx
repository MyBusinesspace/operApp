import React, { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Download, ZoomIn, ZoomOut } from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function FileViewerModal({ file, onClose }) {
  const isImage = file.file_type?.startsWith("image/");
  const isPDF = file.file_type === "application/pdf" || file.file_name?.toLowerCase().endsWith(".pdf");

  return (
    <Dialog open={!!file} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="truncate pr-8">{file?.file_name}</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto flex-1 min-h-0">
          {isImage ? (
            <ImagePane file={file} />
          ) : isPDF ? (
            <PdfPane file={file} />
          ) : (
            <div className="p-8 text-center text-sm text-muted-foreground">
              Preview not available. Use download to open the file.
            </div>
          )}
        </div>
        <div className="shrink-0 flex justify-end pt-3 border-t border-border">
          <a href={file?.file_url} download={file?.file_name} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="outline" className="gap-1.5">
              <Download className="w-3.5 h-3.5" /> Download
            </Button>
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ImagePane({ file }) {
  const [zoom, setZoom] = useState(1);
  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div className="flex items-center gap-1">
        <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.max(0.25, +(z - 0.25).toFixed(2)))}><ZoomOut className="w-4 h-4" /></Button>
        <span className="text-xs w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button size="sm" variant="outline" onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}><ZoomIn className="w-4 h-4" /></Button>
      </div>
      <img src={file.file_url} alt={file.file_name}
        style={{ transform: `scale(${zoom})`, transformOrigin: "center" }}
        className="max-w-full object-contain transition-transform" />
    </div>
  );
}

function PdfPane({ file }) {
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [pageWidth, setPageWidth] = useState(0);
  const scrollRef = useRef(null);

  const measure = () => {
    const cw = scrollRef.current?.clientWidth || 700;
    setPageWidth(Math.max(200, cw - 32));
  };

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const renderWidth = pageWidth ? pageWidth * scale : undefined;

  return (
    <div ref={scrollRef} className="flex flex-col items-center gap-3 p-4">
      <div className="flex items-center gap-1 sticky top-0 bg-background/80 backdrop-blur px-2 py-1 rounded-md border border-border z-10">
        <span className="text-xs px-1 tabular-nums">{numPages || "…"} page(s)</span>
        <div className="w-px h-4 bg-border mx-1" />
        <Button size="sm" variant="outline" onClick={() => setScale(s => Math.max(0.25, +(s - 0.25).toFixed(2)))}><ZoomOut className="w-4 h-4" /></Button>
        <span className="text-xs w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
        <Button size="sm" variant="outline" onClick={() => setScale(s => Math.min(3, +(s + 0.25).toFixed(2)))}><ZoomIn className="w-4 h-4" /></Button>
      </div>
      <Document
        file={file.file_url}
        onLoadSuccess={({ numPages }) => setNumPages(numPages)}
        loading={<div className="text-muted-foreground text-sm py-10">Loading…</div>}
        error={<div className="text-muted-foreground text-sm py-10">Failed to load PDF.</div>}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map(n => (
          <Page key={n} pageNumber={n} width={renderWidth} className="shadow-md bg-white" />
        ))}
      </Document>
    </div>
  );
}