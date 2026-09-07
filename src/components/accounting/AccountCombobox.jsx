import React, { useState, useRef, useEffect } from "react";
import { Search, ChevronDown, X } from "lucide-react";

/**
 * Compact account picker with search + grouped by account type.
 * Props:
 *   accounts   – array from useChartOfAccounts()
 *   value      – selected account_id (string)
 *   onChange   – (account | null) => void
 *   placeholder – optional string
 */
export default function AccountCombobox({ accounts = [], value, onChange, placeholder = "— Account —" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = accounts.find(a => a.id === value) || null;

  // Group accounts by type
  const TYPE_ORDER = ["Bank", "Asset", "Liability", "Equity", "Revenue", "Expense", "Cost of Sales", "Other Income", "Other Expense"];

  const filtered = accounts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.code?.toLowerCase().includes(q) ||
      a.name?.toLowerCase().includes(q) ||
      a.type?.toLowerCase().includes(q)
    );
  });

  const grouped = TYPE_ORDER.reduce((acc, type) => {
    const items = filtered.filter(a => a.type === type);
    if (items.length) acc.push({ type, items });
    return acc;
  }, []);
  // catch any type not in TYPE_ORDER
  const otherTypes = [...new Set(filtered.map(a => a.type).filter(t => !TYPE_ORDER.includes(t)))];
  otherTypes.forEach(type => {
    const items = filtered.filter(a => a.type === type);
    if (items.length) grouped.push({ type, items });
  });

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

  const handleSelect = (account) => {
    onChange(account);
    setOpen(false);
    setSearch("");
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        className="h-7 w-full flex items-center justify-between gap-1 rounded-md border border-input bg-transparent px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring hover:bg-muted/30 transition-colors"
      >
        {selected ? (
          <span className="flex items-center gap-1.5 min-w-0 flex-1">
            <span className="font-mono text-muted-foreground shrink-0">{selected.code}</span>
            <span className="truncate text-foreground">{selected.name}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">{placeholder}</span>
        )}
        <span className="flex items-center gap-0.5 shrink-0">
          {selected && (
            <span
              role="button"
              tabIndex={-1}
              onMouseDown={handleClear}
              className="p-0.5 rounded hover:text-destructive text-muted-foreground"
            >
              <X className="w-3 h-3" />
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-[200] top-full left-0 mt-1 w-64 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
          {/* Search */}
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border">
            <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search accounts..."
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* List */}
          <div className="max-h-60 overflow-y-auto">
            {grouped.length === 0 ? (
              <p className="px-3 py-4 text-xs text-center text-muted-foreground">No accounts found.</p>
            ) : (
              grouped.map(({ type, items }) => (
                <div key={type}>
                  <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    {type}
                  </p>
                  {items.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onMouseDown={() => handleSelect(a)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-muted transition-colors ${value === a.id ? "bg-primary/10 text-primary font-medium" : "text-foreground"}`}
                    >
                      <span className="font-mono text-muted-foreground w-10 shrink-0">{a.code}</span>
                      <span className="truncate">{a.name}</span>
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}