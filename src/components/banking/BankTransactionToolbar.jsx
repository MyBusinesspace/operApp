import { Search, MoreHorizontal, RotateCcw, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Xero-style toolbar for bank transaction tables.
 * Left: Remove & Redo, More, selection count.
 * Right: Search input.
 */
export default function BankTransactionToolbar({ search, setSearch, selectedCount = 0, onRemoveRedo, statusFilter, setStatusFilter }) {
  return (
    <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5"
          disabled={selectedCount === 0}
          onClick={onRemoveRedo}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Remove &amp; Redo
        </Button>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled>
          <MoreHorizontal className="w-3.5 h-3.5" /> More
        </Button>
        <span className="text-xs text-muted-foreground flex items-center gap-1 ml-1">
          {selectedCount > 0
            ? `${selectedCount} item${selectedCount > 1 ? "s" : ""} selected`
            : "No items selected"}
          <HelpCircle className="w-3 h-3 text-muted-foreground/40" />
        </span>
      </div>

      <div className="flex items-center gap-3">
        {setStatusFilter && (
          <div className="flex gap-1">
            {["All", "Unreconciled", "Reconciled"].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/40"}`}>
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 pr-3 text-xs border border-input rounded-md bg-card w-56 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>
    </div>
  );
}