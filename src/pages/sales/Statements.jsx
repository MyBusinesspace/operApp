import React, { useState, useEffect, useMemo } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ChevronRight, Search, Printer, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";
import ColumnToggle from "@/components/shared/ColumnToggle";

function fmtAmount(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Statements() {
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statementType, setStatementType] = useState("Outstanding");
  const [asAtDate, setAsAtDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [search, setSearch] = usePersistedSearch("statements");
  const [selected, setSelected] = useState(new Set());

  const COLUMN_DEFS = [
    { key: "name", label: "Name", required: true },
    { key: "email", label: "Email", required: false },
    { key: "address", label: "Address", required: false },
    { key: "outstanding", label: "Outstanding Balance", required: true },
    { key: "overdue", label: "Overdue", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("statements_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { name: true, email: true, address: true, outstanding: true, overdue: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("statements_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const FIELDS = ["contact_id", "contact_name", "total", "amount_paid", "status", "due_date", "issue_date"];
    const loadAllInvoices = async () => {
      const all = [];
      for (let skip = 0; skip < 100000; skip += 5000) {
        const page = await base44.entities.Invoice.list("-issue_date", 5000, skip, FIELDS);
        all.push(...page);
        if (page.length < 5000) break;
      }
      return all;
    };
    const [inv, cont] = await Promise.all([
      loadAllInvoices(),
      base44.entities.Contact.filter({ type: { $in: ["Customer", "Both"] } }, { sort: "full_name", limit: 5000 }).catch(() => ({ items: [] })),
    ]);
    setInvoices(inv);
    setContacts(cont.items || cont || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Build per-contact statement summaries
  const rows = useMemo(() => {
    const asAtKey = asAtDate;
    const todayKey = new Date().toLocaleDateString("en-CA");

    // Filter invoices by date
    const relevantInvoices = invoices.filter(inv => {
      if (inv.status === "Draft" || inv.status === "Cancelled") return false;
      const issueKey = inv.issue_date ? String(inv.issue_date).slice(0, 10) : "";
      if (issueKey && issueKey > asAtKey) return false;
      return true;
    });

    // Group by contact
    const byContact = {};
    relevantInvoices.forEach(inv => {
      const cid = inv.contact_id || "__no_contact__";
      if (!byContact[cid]) {
        byContact[cid] = {
          contact_id: cid,
          contact_name: inv.contact_name || "Unknown",
          invoices: [],
        };
      }
      byContact[cid].invoices.push(inv);
    });

    return Object.values(byContact).map(c => {
      const totalInvoiced = c.invoices.reduce((s, i) => s + (i.total || 0), 0);
      const totalPaid = c.invoices.reduce((s, i) => s + (i.amount_paid || 0), 0);
      const outstanding = totalInvoiced - totalPaid;

      const overdue = c.invoices
        .filter(i => i.status !== "Paid" && i.due_date && String(i.due_date).slice(0, 10) < todayKey)
        .reduce((s, i) => s + Math.max(0, (i.total || 0) - (i.amount_paid || 0)), 0);

      return { ...c, totalInvoiced, totalPaid, outstanding, overdue };
    }).filter(c => {
      if (statementType === "Outstanding") return c.outstanding > 0.005;
      return true; // Activity = all
    }).sort((a, b) => b.outstanding - a.outstanding);
  }, [invoices, asAtDate, statementType]);

  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return r.contact_name.toLowerCase().includes(q);
  });

  const pagination = useTablePagination(filtered);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.contact_id)));
  };

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 pt-4 pb-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link to="/sales-overview" className="hover:text-primary transition-colors">Sales overview</Link>
          <ChevronRight className="w-3 h-3" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-4">Statements</h1>

        {/* Filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Statement Type</span>
            <Select value={statementType} onValueChange={setStatementType}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Outstanding">Outstanding</SelectItem>
                <SelectItem value="Activity">Activity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">as at</span>
            <input
              type="date"
              value={asAtDate}
              onChange={e => setAsAtDate(e.target.value)}
              className="h-8 text-xs rounded-md border border-input bg-transparent px-3 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-medium">Filter by</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-xs w-64"
                placeholder="Contact name or account no."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
          <Button size="sm" className="h-8 gap-1.5" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> Update
          </Button>
          <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center gap-3">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={selected.size === 0}
          onClick={() => {
            for (const contactId of selected) {
              window.open(`/sales/statements/${contactId}?type=${statementType}&asAt=${asAtDate}`, "_blank");
            }
          }}>
          <Printer className="w-3.5 h-3.5" /> Print
        </Button>
        <span className="text-xs text-muted-foreground">
          {selected.size === 0 ? "No items selected" : `${selected.size} selected`}
        </span>
      </div>

      {/* Table */}
      <div className="bg-card overflow-x-auto">
        {loading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Loading statements...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground text-xs">No outstanding balances found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-slate-700 bg-slate-100">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" className="rounded border-border"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Name</th>
                {visibleCols.email && <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden md:table-cell">Email</th>}
                {visibleCols.address && <th className="px-4 py-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden lg:table-cell">Address</th>}
                <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Outstanding Balance</th>
                {visibleCols.overdue && <th className="px-4 py-3 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider text-red-600">Overdue</th>}
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map(row => {
                const contact = contacts.find(c => c.id === row.contact_id);
                return (
                  <tr key={row.contact_id} className="border-b border-slate-200 dark:border-slate-700 hover:bg-primary/[0.06] transition-colors group">
                    <td className="px-4 py-3 w-10">
                      <input type="checkbox" className="rounded border-border"
                        checked={selected.has(row.contact_id)}
                        onChange={() => toggleSelect(row.contact_id)} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/sales/statements/${row.contact_id}?type=${statementType}&asAt=${asAtDate}`)}
                        className="text-xs font-medium text-primary hover:underline text-left"
                      >
                        {row.contact_name}
                      </button>
                    </td>
                    {visibleCols.email && <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{contact?.email || "—"}</td>}
                    {visibleCols.address && (
                      <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground max-w-xs">
                        <span className="truncate block">{[contact?.address, contact?.city, contact?.country].filter(Boolean).join(", ") || "—"}</span>
                      </td>
                    )}
                    <td className="px-4 py-3 text-right text-xs font-semibold tabular-nums">{fmtAmount(row.outstanding)}</td>
                    {visibleCols.overdue && (
                      <td className={`px-4 py-3 text-right text-xs font-semibold tabular-nums ${row.overdue > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                        {row.overdue > 0 ? fmtAmount(row.overdue) : "—"}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <DataTablePagination pagination={pagination} />
    </div>
  );
}