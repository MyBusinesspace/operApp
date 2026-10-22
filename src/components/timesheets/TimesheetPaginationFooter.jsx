import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

/**
 * Xero-style pagination footer for the Timesheets page.
 * Left: page selector + items-per-page selector + total count.
 * Right: page number links with Start / Prev / Next / End controls.
 */
export default function TimesheetPaginationFooter({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
}) {
  if (totalItems === 0) return null;
  const page = Math.max(1, Math.min(currentPage, totalPages));

  // Build a window of page numbers around the current page (max 5 visible)
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pages = [];
  for (let i = start; i <= end; i++) pages.push(i);

  const linkBtn = (label, target, Icon, disabled) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onPageChange(target)}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md text-xs transition-colors ${
        disabled
          ? "text-muted-foreground/40 cursor-not-allowed"
          : "text-primary hover:bg-primary/10"
      }`}
      title={label}
    >
      {Icon ? <Icon className="w-3.5 h-3.5" /> : label}
    </button>
  );

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2.5 bg-muted/30 border border-border rounded-xl text-xs text-muted-foreground">
      {/* Left: page selector + items per page */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span>Page</span>
          <select
            value={page}
            onChange={(e) => onPageChange(Number(e.target.value))}
            className="h-7 rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
          >
            {Array.from({ length: totalPages }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
          <span>of {totalPages} ({totalItems.toLocaleString()} total items)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>Showing</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-7 rounded-md border border-input bg-card px-1.5 text-xs text-foreground"
          >
            <option value={100}>100</option>
            <option value={200}>200</option>
            <option value={500}>500</option>
          </select>
          <span>items per page</span>
        </div>
      </div>

      {/* Right: page links */}
      <div className="flex items-center gap-0.5">
        {linkBtn("Start", 1, ChevronsLeft, page === 1)}
        {linkBtn("Previous", page - 1, ChevronLeft, page === 1)}
        {start > 1 && <span className="px-1 text-muted-foreground">…</span>}
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPageChange(p)}
            className={`inline-flex items-center justify-center min-w-7 h-7 px-2 rounded-md text-xs transition-colors ${
              p === page
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-primary hover:bg-primary/10"
            }`}
          >
            {p}
          </button>
        ))}
        {end < totalPages && <span className="px-1 text-muted-foreground">…</span>}
        {linkBtn("Next", page + 1, ChevronRight, page === totalPages)}
        {linkBtn("End", totalPages, ChevronsRight, page === totalPages)}
      </div>
    </div>
  );
}