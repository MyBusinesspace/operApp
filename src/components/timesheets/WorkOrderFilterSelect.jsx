import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, X, Check, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { cn } from "@/lib/utils";

/**
 * Work Order filter dropdown with server-side debounced search.
 * Bypasses the client-side record-load limit by querying the WorkOrder
 * entity on the server as the user types (title / reference).
 *
 * Props:
 *   value          – selected WorkOrder id (string) or ""
 *   onValueChange  – (id, workOrder) => void
 *   className      – extra classes for the trigger button
 */
export default function WorkOrderFilterSelect({ value, onValueChange, className }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  // Debounced server-side search
  useEffect(() => {
    if (!open) return;
    const term = search.trim();
    if (!term) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const items = await base44.entities.WorkOrder.filter(
          {
            $or: [
              { title: { $regex: term, $options: "i" } },
              { reference: { $regex: term, $options: "i" } },
            ],
          },
          { sort: "title", limit: 50, fields: ["title", "reference"] }
        );
        if (!cancelled) setResults(items || []);
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, open]);

  // Resolve the selected label when a value is set externally
  useEffect(() => {
    if (!value) { setSelectedLabel(""); return; }
    let cancelled = false;
    (async () => {
      try {
        const wo = await base44.entities.WorkOrder.get(value);
        if (!cancelled) setSelectedLabel(wo?.title || wo?.reference || "Selected");
      } catch {
        if (!cancelled) setSelectedLabel("Selected");
      }
    })();
    return () => { cancelled = true; };
  }, [value]);

  const handleOpen = () => {
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (wo) => {
    onValueChange(wo.id, wo);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onValueChange("", null);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "h-9 w-full flex items-center justify-between gap-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring hover:bg-muted/30 transition-colors",
          className
        )}
      >
        <span className={cn("truncate", !value && "text-muted-foreground")}>
          {value ? selectedLabel : "All Work Orders"}
        </span>
        <span className="flex items-center gap-0.5 shrink-0">
          {value && (
            <span
              role="button"
              tabIndex={-1}
              onMouseDown={handleClear}
              className="p-0.5 rounded hover:text-destructive text-muted-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </span>
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </span>
      </button>

      {open && (
        <div className="absolute z-[200] top-full left-0 mt-1 w-full min-w-[220px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search work orders…"
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
          </div>
          <div className="max-h-60 overflow-y-auto">
            {!search.trim() ? (
              <p className="px-3 py-4 text-sm text-center text-muted-foreground">
                Type to search work orders…
              </p>
            ) : loading ? (
              <p className="px-3 py-4 text-sm text-center text-muted-foreground">Searching…</p>
            ) : results.length === 0 ? (
              <p className="px-3 py-4 text-sm text-center text-muted-foreground">No results found.</p>
            ) : (
              results.map((wo) => (
                <button
                  key={wo.id}
                  type="button"
                  onMouseDown={() => handleSelect(wo)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                    value === wo.id ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                  )}
                >
                  <span className="truncate">{wo.title || wo.reference || "Untitled"}</span>
                  {value === wo.id && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}