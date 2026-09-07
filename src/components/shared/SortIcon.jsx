import React from "react";
import { ChevronsUpDown, ChevronUp, ChevronDown } from "lucide-react";

export default function SortIcon({ sortKey, col, sortDir }) {
  if (sortKey !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 opacity-40 inline" />;
  return sortDir === "asc"
    ? <ChevronUp className="w-3 h-3 ml-1 text-primary inline" />
    : <ChevronDown className="w-3 h-3 ml-1 text-primary inline" />;
}

export function SortableTh({ colKey, label, sortKey, sortDir, onSort, className = "" }) {
  return (
    <th
      className={`px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none ${className}`}
      onClick={() => onSort(colKey)}
    >
      <span className="inline-flex items-center">
        {label}
        <SortIcon sortKey={sortKey} col={colKey} sortDir={sortDir} />
      </span>
    </th>
  );
}