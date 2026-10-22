import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, X, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Simple searchable select dropdown.
 * Props:
 *   value           – selected value (string)
 *   onValueChange   – (value) => void
 *   options         – array of { value, label }
 *   placeholder     – text when nothing selected
 *   searchPlaceholder – text in the search box
 *   className       – extra classes for the trigger button
 */
export default function SearchableSelect({
  value,
  onValueChange,
  options = [],
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className,
  onNavigate,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = options.find((o) => o.value === value) || null;
  const q = search.trim().toLowerCase();
  const filtered = q
    ? options.filter((o) => (o.label || "").toLowerCase().includes(q))
    : options;

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (!containerRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  const handleOpen = () => {
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleSelect = (val) => {
    onValueChange(val);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onValueChange("");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "h-9 w-full flex items-center justify-between gap-1 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring hover:bg-muted/30 transition-colors",
          className
        )}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="flex items-center gap-0.5 shrink-0">
          {selected && onNavigate && (
            <span
              role="button"
              tabIndex={-1}
              onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onNavigate(selected.value); }}
              className="p-0.5 rounded hover:text-primary text-muted-foreground"
              title="View contact"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </span>
          )}
          {selected && (
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

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[200] top-full left-0 mt-1 w-full min-w-[200px] bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-2.5 py-1.5 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* List */}
          <div className="max-h-60 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-sm text-center text-muted-foreground">No results found.</p>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onMouseDown={() => handleSelect(o.value)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-left hover:bg-muted transition-colors",
                    value === o.value ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  {value === o.value && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}