import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { Search, ChevronDown, X } from "lucide-react";

/**
 * Compact account picker with search + grouped by account type.
 * The dropdown renders in a portal (document.body) so it escapes any
 * ancestor with `overflow: hidden` (e.g. rounded table wrappers).
 *
 * Props:
 *   accounts   – array from useChartOfAccounts()
 *   value      – selected account_id (string)
 *   onChange   – (account | null) => void
 *   placeholder – optional string
 */
export default function AccountCombobox({ accounts = [], value, onChange, placeholder = "— Account —" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [rect, setRect] = useState(null);
  const containerRef = useRef(null);
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);

  const selected = accounts.find(a => a.id === value) || null;

  // Group accounts by category
  const CATEGORY_ORDER = ["Assets", "Liabilities", "Equity", "Revenue", "Expenses"];

  const filtered = accounts.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.code?.toLowerCase().includes(q) ||
      a.name?.toLowerCase().includes(q) ||
      a.type?.toLowerCase().includes(q)
    );
  });

  const grouped = CATEGORY_ORDER.reduce((acc, category) => {
    const items = filtered.filter(a => a.category === category);
    if (items.length) acc.push({ category, items });
    return acc;
  }, []);
  // catch any category not in CATEGORY_ORDER
  const otherCategories = [...new Set(filtered.map(a => a.category).filter(t => !CATEGORY_ORDER.includes(t)))];
  otherCategories.forEach(category => {
    const items = filtered.filter(a => a.category === category);
    if (items.length) grouped.push({ category, items });
  });

  // Track the trigger position so the portal dropdown can follow it
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handle = (e) => {
      if (containerRef.current?.contains(e.target)) return;
      if (dropdownRef.current?.contains(e.target)) return;
      setOpen(false);
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

  // Flip the dropdown above the trigger when there isn't room below
  const DROPDOWN_HEIGHT = 300; // search bar + max-h-60 list, approximate
  const flipUp = rect ? rect.bottom + DROPDOWN_HEIGHT > window.innerHeight : false;
  const dropdownStyle = rect
    ? { position: "fixed", top: flipUp ? rect.top - DROPDOWN_HEIGHT - 4 : rect.bottom + 4, left: rect.left, zIndex: 9999, pointerEvents: "auto" }
    : undefined;

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger */}
      <button
        ref={triggerRef}
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

      {/* Dropdown — rendered in a portal so it escapes overflow-hidden parents */}
      {open && rect && createPortal(
        <div ref={dropdownRef} style={dropdownStyle} className="w-64 bg-popover border border-border rounded-lg shadow-xl overflow-hidden">
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
              grouped.map(({ category, items }) => (
                <div key={category}>
                  <p className="px-3 pt-2 pb-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    {category}
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
        </div>,
        document.body
      )}
    </div>
  );
}