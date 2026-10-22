import React from "react";
import { Loader2, FileText } from "lucide-react";

// Full-screen overlay shown while a quote/invoice PDF is being generated.
// Mirrors the "Saving..." feedback pattern used on the form save buttons.
export default function PdfGeneratingOverlay({ active, label = "Generating PDF" }) {
  if (!active) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl px-8 py-7 flex flex-col items-center gap-3 min-w-[240px]">
        <div className="relative">
          <FileText className="w-10 h-10 text-primary" />
          <Loader2 className="w-5 h-5 text-primary absolute -bottom-1 -right-1 animate-spin bg-card rounded-full" />
        </div>
        <div className="text-sm font-semibold text-foreground">{label}...</div>
        <div className="text-xs text-muted-foreground">This may take a few seconds</div>
      </div>
    </div>
  );
}