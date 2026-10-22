import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip, ChevronDown } from "lucide-react";
import DocumentFilesPanel from "./DocumentFilesPanel";

export default function DocumentFilesPopover({ docType, docId, docNumber }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);

  const refreshCount = async () => {
    if (!docId) return;
    const list = await base44.entities.DocumentFile.filter({ doc_type: docType, doc_id: docId }, "created_date").catch(() => []);
    setCount(list.length);
  };

  useEffect(() => { refreshCount(); }, [docId]);
  useEffect(() => { if (!open) refreshCount(); }, [open]);

  if (!docId) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-muted/40 hover:bg-muted text-sm font-medium text-foreground transition-colors"
        >
          <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
          Files{count > 0 ? ` (${count})` : ""}
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[440px] p-4">
        <DocumentFilesPanel
          docType={docType}
          docId={docId}
          docNumber={docNumber}
          onFilesChange={(list) => setCount(list.length)}
        />
      </PopoverContent>
    </Popover>
  );
}