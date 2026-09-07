import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Eye, Trash2, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import JournalEntryFormModal from "@/components/accounting/JournalEntryFormModal";
import { format } from "date-fns";

const STATUS_STYLES = {
  Draft:  "bg-slate-100 text-slate-600",
  Posted: "bg-emerald-100 text-emerald-700",
  Voided: "bg-red-100 text-red-600",
};

const SOURCE_STYLES = {
  Manual:       "bg-purple-100 text-purple-700",
  Invoice:      "bg-blue-100 text-blue-700",
  Bill:         "bg-orange-100 text-orange-700",
  PurchaseOrder:"bg-yellow-100 text-yellow-700",
  PettyCash:    "bg-teal-100 text-teal-700",
  Payroll:      "bg-pink-100 text-pink-700",
};

export default function JournalEntries() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.JournalEntry.list("-date", 500);
    setEntries(data);
    setLoading(false);
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
    if (!confirm(`Void journal entry ${entry.number}? This cannot be undone.`)) return;
    await base44.entities.JournalEntry.update(entry.id, { status: "Voided" });
    toast.success("Journal entry voided");
    load();
  };

  const handlePost = async (entry) => {
    if (entry.status !== "Draft") return;
    const balanced = Math.abs((entry.total_debit || 0) - (entry.total_credit || 0)) < 0.01;
    if (!balanced) { toast.error("Entry is not balanced (Debit ≠ Credit)"); return; }
    await base44.entities.JournalEntry.update(entry.id, { status: "Posted", posted_date: new Date().toISOString().slice(0, 10) });
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
          <p className="text-sm text-muted-foreground mt-0.5">{entries.filter(e => e.status === "Posted").length} posted · {entries.filter(e => e.status === "Draft").length} drafts</p>
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-1.5" /> New Journal Entry
        </Button>
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
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
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
          <div className="py-16 text-center text-muted-foreground text-sm">Loading entries…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-muted-foreground text-sm">No journal entries found.</p>
            <Button size="sm" className="mt-3" onClick={() => { setEditing(null); setShowForm(true); }}>Create first entry</Button>
          </div>
        ) : (
          filtered.map(entry => (
            <div key={entry.id} className="flex items-center gap-2 px-4 py-2.5 border-b border-border hover:bg-muted/30 group transition-colors">
              <span className="w-28 text-sm font-mono font-medium text-primary">{entry.number || "—"}</span>
              <span className="w-24 text-xs text-muted-foreground">{entry.date ? format(new Date(entry.date), "dd MMM yyyy") : "—"}</span>
              <span className="flex-1 text-sm truncate">{entry.narration || "—"}</span>
              <span className="w-24">
                <Badge className={`text-xs px-2 py-0 ${SOURCE_STYLES[entry.source_type] || "bg-muted text-muted-foreground"}`}>
                  {entry.source_type || "Manual"}
                </Badge>
              </span>
              <span className="w-20">
                <Badge className={`text-xs px-2 py-0 ${STATUS_STYLES[entry.status] || "bg-muted text-muted-foreground"}`}>
                  {entry.status}
                </Badge>
              </span>
              <span className="w-28 text-right text-xs font-mono tabular-nums text-blue-600">
                {(entry.total_debit || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className="w-28 text-right text-xs font-mono tabular-nums text-emerald-600">
                {(entry.total_credit || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <div className="w-24 flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(entry); setShowForm(true); }} title="View / Edit">
                  <Eye className="w-3.5 h-3.5" />
                </Button>
                {entry.status === "Draft" && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600 hover:text-emerald-700" onClick={() => handlePost(entry)} title="Post">
                    <CheckCircle className="w-3.5 h-3.5" />
                  </Button>
                )}
                {entry.status === "Posted" && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => handleVoid(entry)} title="Void">
                    <XCircle className="w-3.5 h-3.5" />
                  </Button>
                )}
                {entry.status !== "Posted" && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive/70 hover:text-destructive" onClick={() => handleDelete(entry)} title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

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