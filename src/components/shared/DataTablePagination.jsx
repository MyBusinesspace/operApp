import React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const PAGE_SIZES = [10, 25, 50, 100, 200];

/**
 * Consistent table pagination footer:
 *   Items per page · Showing X–Y of Z · ◀ Page N of M ▶
 * Matches the layout shown in the reference screenshot.
 */
export default function DataTablePagination({ pagination, className = "" }) {
  const { page, setPage, pageSize, setPageSize, totalItems, totalPages, range } = pagination;
  if (totalItems === 0) return null;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-2.5 text-xs text-muted-foreground ${className}`}
    >
      <div className="flex items-center gap-2">
        <span>Items per page</span>
        <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
          <SelectTrigger className="h-7 w-[72px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>
          Showing items {range.from}–{range.to} of {totalItems}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => setPage(page - 1)}
          disabled={page <= 1}
          className="rounded-md p-1 text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Select value={String(page)} onValueChange={(v) => setPage(Number(v))}>
          <SelectTrigger className="h-7 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <SelectItem key={p} value={String(p)}>
                Page {p} of {totalPages}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          onClick={() => setPage(page + 1)}
          disabled={page >= totalPages}
          className="rounded-md p-1 text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}