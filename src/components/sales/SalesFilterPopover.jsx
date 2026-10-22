import React, { useState } from "react";
import { Filter, ChevronUp, ChevronDown } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

export function makeSalesDefaultFilters(docTypes) {
  const dt = {};
  docTypes.forEach((d, i) => { dt[d.key] = i === 0; });
  return { deletedVoided: false, showOverdue: false, docTypes: dt };
}

export default function SalesFilterPopover({ filters, onChange, onReset, docTypes, overdueLabel = "Show overdue" }) {
  const [open, setOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(true);
  const base = makeSalesDefaultFilters(docTypes);
  const f = { ...base, ...filters, docTypes: { ...base.docTypes, ...(filters?.docTypes || {}) } };

  const set = (patch) => onChange({ ...f, ...patch });
  const setDoc = (key, val) => set({ docTypes: { ...f.docTypes, [key]: val } });
  const reset = () => { onReset?.(); setOpen(false); };

  const activeCount =
    (f.deletedVoided ? 1 : 0) + (f.showOverdue ? 1 : 0) +
    docTypes.filter(d => f.docTypes[d.key] && !base.docTypes[d.key]).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-input bg-card text-sm font-medium text-foreground hover:bg-accent transition-colors">
          <Filter className="w-4 h-4 text-muted-foreground" />
          Filter
          {activeCount > 0 && (
            <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
              {activeCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="px-4 py-3 border-b border-border">
          <span className="text-sm font-semibold text-foreground">Filter</span>
        </div>

        <div className="px-4 py-3 space-y-3">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" className="rounded border-input w-4 h-4 accent-primary"
              checked={f.deletedVoided} onChange={e => set({ deletedVoided: e.target.checked })} />
            <span className="text-sm text-foreground">Deleted &amp; voided</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" className="rounded border-input w-4 h-4 accent-primary"
              checked={f.showOverdue} onChange={e => set({ showOverdue: e.target.checked })} />
            <span className="text-sm text-foreground">{overdueLabel}</span>
          </label>
        </div>

        <div className="border-t border-border">
          <button type="button"
            onClick={() => setDocOpen(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-accent/50 transition-colors">
            Document types
            {docOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {docOpen && (
            <div className="px-4 pb-3 space-y-2.5">
              {docTypes.map(d => (
                <label key={d.key} className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" className="rounded border-input w-4 h-4 accent-primary"
                    checked={f.docTypes[d.key]} onChange={e => setDoc(d.key, e.target.checked)} />
                  <span className="text-sm text-foreground">{d.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          <button type="button" onClick={reset}
            className="text-sm font-medium text-primary hover:underline">
            Reset to default
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}