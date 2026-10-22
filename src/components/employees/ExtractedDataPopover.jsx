import React from "react";
import { Sparkles, FileCheck2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parseISO, isValid } from "date-fns";

const FIELD_LABELS = [
  { key: "document_number", label: "Doc Number" },
  { key: "full_name", label: "Full Name" },
  { key: "date_of_birth", label: "Date of Birth", type: "date" },
  { key: "issue_date", label: "Issue Date", type: "date" },
  { key: "expiry_date", label: "Expiry Date", type: "date" },
  { key: "issuing_authority", label: "Issuing Authority" },
  { key: "nationality", label: "Nationality" },
];

const NULLISH = /^(null|n\/?a|none|not\s*found|unknown|nil|-|nada)$/i;

function fmtVal(value, type) {
  if (value == null || value === "") return null;
  if (type === "date") {
    const d = typeof value === "string" ? parseISO(value) : value;
    return isValid(d) ? format(d, "dd MMM yyyy") : null;
  }
  const s = String(value).trim();
  if (!s || NULLISH.test(s)) return null;
  return s;
}

export default function ExtractedDataPopover({ doc }) {
  // Collect all non-empty extracted fields
  const fields = [];
  for (const f of FIELD_LABELS) {
    const raw = doc[f.key];
    const val = fmtVal(raw, f.type);
    if (val) fields.push({ label: f.label, value: val });
  }
  // extra_fields (dynamic key/value)
  if (doc.extra_fields && typeof doc.extra_fields === "object") {
    for (const [k, v] of Object.entries(doc.extra_fields)) {
      if (v != null && v !== "") fields.push({ label: k, value: String(v) });
    }
  }

  if (fields.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-primary/20 bg-primary/5 text-primary hover:bg-primary/10 transition-colors shrink-0"
          title={`${fields.length} AI-extracted field(s)`}
        >
          <Sparkles className="w-2.5 h-2.5" />
          {fields.length}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="flex items-center gap-1.5 mb-2.5 pb-2 border-b border-border">
          <FileCheck2 className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">AI-Extracted Data</span>
          <span className="text-[10px] text-muted-foreground ml-auto">{fields.length} fields</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {fields.map((f, i) => (
            <div key={i} className="inline-flex flex-col gap-0.5 px-2 py-1 rounded-md bg-muted/60 border border-border">
              <span className="text-[9px] uppercase tracking-wide text-muted-foreground leading-none">{f.label}</span>
              <span className="text-[11px] font-medium text-foreground leading-tight">{f.value}</span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}