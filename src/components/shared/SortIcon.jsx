import React from "react";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SortIcon({ sortKey, col, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 text-primary inline" />
    : <ChevronDown className="w-3 h-3 ml-1 text-primary inline" />;
}

export function SortableTh({ colKey, label, sortKey, sortDir, onSort, className = "" }) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-bold text-slate-700 uppercase tracking-wider cursor-pointer hover:text-slate-900 select-none ${className}`}
      onClick={() => onSort(colKey)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon sortKey={sortKey} col={colKey} sortDir={sortDir} />
      </span>
    </th>
  );
}

// Div-based sortable header for flex-layout tables (not a real <table>/<th>).
// Uses cn (tailwind-merge) so responsive display utilities (e.g. "hidden sm:inline-flex")
// cleanly override the base inline-flex without conflicts.
export function SortableSpan({ colKey, label, sortKey, sortDir, onSort, className = "" }) {
  return (
    <span
      className={cn("inline-flex items-center cursor-pointer hover:text-foreground select-none", className)}
      onClick={() => onSort(colKey)}
    >
      {label}
      <SortIcon sortKey={sortKey} col={colKey} sortDir={sortDir} />
    </span>
  );
}