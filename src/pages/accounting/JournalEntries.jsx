import { useState, useEffect, useMemo } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { parseDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Eye, Trash2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { checkPeriodLock } from "@/lib/periodLock";
import JournalEntryFormModal from "@/components/accounting/JournalEntryFormModal";
import { format } from "date-fns";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

const STATUS_TEXT = {
  Draft:  "text-slate-500 dark:text-slate-400",
  Posted: "text-emerald-600 dark:text-emerald-500",
  Voided: "text-red-600 dark:text-red-500",
};

const SOURCE_TEXT = {
  Manual:       "text-purple-600 dark:text-purple-500",
  Invoice:      "text-blue-600 dark:text-blue-500",
  Bill:         "text-orange-600 dark:text-orange-500",
  PurchaseOrder:"text-yellow-600 dark:text-yellow-500",
  PettyCash:    "text-teal-600 dark:text-teal-500",
  Payroll:      "text-pink-600 dark:text-pink-500",
};

export default function JournalEntries() {
  const { can } = usePermissionsMatrix();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("journal_entries");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const PAGE = 500;
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const load = async () => {
    setLoading(true);
    const data = await base44.entities.JournalEntry.list("-date", PAGE, 0);
    setEntries(data);
    setHasMore(data.length >= PAGE);
    setLoading(false);
  };
  const loadMore = async () => {
    setLoadingMore(true);
    const data = await base44.entities.JournalEntry.list("-date", PAGE, entries.length);
    setEntries(prev => [...prev, ...data]);
    setHasMore(data.length >= PAGE);
    setLoadingMore(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const matchSearch = !search ||
        (e.number || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.narration || "").toLowerCase().includes(search.toLowerCase()) ||
        (e.source_number || "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = filterStatus === "All" || e.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [entries, search, filterStatus]);

  const handleDelete = async (entry) => {
    if (entry.status === "Posted") { toast.error("Cannot delete a posted journal entry. Void it first."); return; }
    if (!confirm(`Delete journal entry ${entry.number}?`)) return;
    await base44.entities.JournalEntry.delete(entry.id);
    toast.success("Journal entry deleted");
    load();
  };

  const handleVoid = async (entry) => {
    const { locked, lockDate, error: lockReadError } = await checkPeriodLock(entry.date);
    if (locked) {
      toast.error(lockReadError
        ? "The accounting lock date could not be loaded, so this period is treated as locked. The entry was not voided — try again in a moment."
        : `This entry is dated before the period lock date (${lockDate}). Unlock the period in accounting settings to void it.`);
      return;
    }
    if (!confirm(`Void journal entry ${entry.number}? This cannot be undone.`)) return;
    await base44.entities.JournalEntry.update(entry.id, { status: "Voided" });
    toast.success("Journal entry voided");
    load();
  };

  const handlePost = async (entry) => {
    if (entry.status !== "Draft") return;
    const balanced = Math.abs((entry.total_debit || 0) - (entry.total_credit || 0)) < 0.01;
    if (!balanced) { toast.error("Entry is not balanced (Debit ≠ Credit)"); return; }
    await base44.entities.JournalEntry.update(entry.id, { status: "Posted", posted_date: todayLocalISO() });
    toast.success("Journal entry posted");
    load();
  };

  const totalDebits = filtered.reduce((s, e) => s + (e.total_debit || 0), 0);
  const totalCredits = filtered.reduce((s, e) => s + (e.total_credit || 0), 0);

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Journal Entries</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{entries.length} loaded{hasMore ? " (newest first, more available)" : ""} · {entries.filter(e => e.status === "Posted").length} posted · {entries.filter(e => e.status === "Draft").length} drafts</p>
        </div>
        {can("manual_journals", "can_create") && (
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1.5" /> New Journal Entry
          </Button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Total Entries", value: filtered.length, color: "text-foreground" },
          { label: "Total Debits", value: totalDebits.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), color: "text-blue-600" },
          { label: "Total Credits", value: totalCredits.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }), color: "text-emerald-600" },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by number, narration…" className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1">
          {["All", "Draft", "Posted", "Voided"].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${filterStatus === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="department-table rounded-xl border border-border bg-card overflow-hidden">
        <div className="department-table-heading flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span className="w-28">Number</span>
          <span className="w-24">Date</span>
          <span className="flex-1">Narration</span>
          <span className="w-24">Source</span>
          <span className="w-20">Status</span>
          <span className="w-28 text-right">Debit</span>
          <span className="w-28 text-right">Credit</span>
          <span className="w-24" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-muted-foreground text-xs">Loading entries…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground text-xs">No journal entries found.</p>
            {can("manual_journals", "can_create") && (
              <Button size="sm" className="mt-3" onClick={() => { setEditing(null); setShowForm(true); }}>Create first entry</Button>
            )}
          </div>
        ) : (
          filtered.map((entry, idx) => (
            <div key={entry.id} className="department-table-row flex items-center gap-2 px-4 py-2.5 border-b border-border hover:bg-muted/30 group transition-colors">
              <button
                type="button"
                onClick={() => { setEditing(entry); setShowForm(true); }}
                className="w-28 text-left text-xs font-mono font-medium text-primary hover:underline truncate"
                title="View journal entry"
              >
                {entry.number || "—"}
              </button>
              <span className="w-24 text-xs text-muted-foreground">{entry.date ? format(parseDateOnly(entry.date), "dd MMM yyyy") : "—"}</span>
              <span className="flex-1 text-xs truncate">{entry.narration || "—"}</span>
              <span className="w-24">
                <span className={`text-xs font-medium ${SOURCE_TEXT[entry.source_type] || "text-muted-foreground"}`}>
                  {entry.source_type || "Manual"}
                </span>
              </span>
              <span className="w-20">
                <span className={`text-xs font-semibold ${STATUS_TEXT[entry.status] || "text-muted-foreground"}`}>
                  {entry.status}
                </span>
              </span>
              <span className="w-28 text-right text-xs font-mono tabular-nums text-blue-600">
                {(entry.total_debit || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="w-28 text-right text-xs font-mono tabular-nums text-emerald-600">
                {(entry.total_credit || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="w-24 flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                {can("manual_journals", "can_edit") && (
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(entry); setShowForm(true); }} title="View / Edit">
                    <Eye className="w-3.5 h-3.5" />
                  </Button>
                )}
                {entry.status === "Draft" && can("manual_journals", "can_approve") && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:text-emerald-700" onClick={() => handlePost(entry)} title="Post">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </Button>
                )}
                {entry.status === "Posted" && can("manual_journals", "can_delete") && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => handleVoid(entry)} title="Void">
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                )}
                {entry.status !== "Posted" && can("manual_journals", "can_delete") && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => handleDelete(entry)} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {hasMore && (
        <div className="flex justify-center py-3">
          <Button size="sm" variant="outline" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load 500 more"}</Button>
        </div>
      )}

      {showForm && (
        <JournalEntryFormModal
          open={showForm}
          entry={editing}
          onClose={() => { setShowForm(false); setEditing(null); }}
          onSave={() => { setShowForm(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}