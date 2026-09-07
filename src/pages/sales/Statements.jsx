import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ChevronRight, Search, Printer, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";

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
  const [asAtDate, setAsAtDate] = useState(new Date().toISOString().split("T")[0]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(new Set());

  const load = async () => {
    setLoading(true);
    const [inv, cont] = await Promise.all([
      base44.entities.Invoice.list("-issue_date", 500),
      base44.entities.Contact.list("full_name", 200).catch(() => []),
    ]);
    setInvoices(inv);
    setContacts(cont);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Build per-contact statement summaries
  const rows = useMemo(() => {
    const asAt = new Date(asAtDate);
    asAt.setHours(23, 59, 59);

    // Filter invoices by date
    const relevantInvoices = invoices.filter(inv => {
      if (inv.status === "Draft" || inv.status === "Cancelled") return false;
      const issueDate = inv.issue_date ? new Date(inv.issue_date) : null;
      if (issueDate && issueDate > asAt) return false;
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

      const now = new Date();
      const overdue = c.invoices
        .filter(i => i.status !== "Paid" && i.due_date && new Date(i.due_date) < now)
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
    <div className="flex flex-col h-full">
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
            <span className="text-sm text-muted-foreground font-medium">Statement Type</span>
            <Select value={statementType} onValueChange={setStatementType}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Outstanding">Outstanding</SelectItem>
                <SelectItem value="Activity">Activity</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">as at</span>
            <input
              type="date"
              value={asAtDate}
              onChange={e => setAsAtDate(e.target.value)}
              className="h-8 text-sm rounded-md border border-input bg-transparent px-3 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground font-medium">Filter by</span>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm w-64"
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
        </div>
      </div>

      {/* Action bar */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center gap-3">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" disabled={selected.size === 0}>
          <Printer className="w-3.5 h-3.5" /> Print
        </Button>
        <span className="text-xs text-muted-foreground">
          {selected.size === 0 ? "No items selected" : `${selected.size} selected`}
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-card">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading statements...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground text-sm">No outstanding balances found.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" className="rounded border-border"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleAll} />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Email</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Address</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Outstanding Balance</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider text-red-600">Overdue</th>
              </tr>
            </thead>
            <tbody>
              {pagination.pageItems.map(row => {
                const contact = contacts.find(c => c.id === row.contact_id);
                return (
                  <tr key={row.contact_id} className="border-b border-border hover:bg-muted/20 transition-colors group">
                    <td className="px-4 py-3 w-10">
                      <input type="checkbox" className="rounded border-border"
                        checked={selected.has(row.contact_id)}
                        onChange={() => toggleSelect(row.contact_id)} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(`/sales/statements/${row.contact_id}?type=${statementType}&asAt=${asAtDate}`)}
                        className="text-sm font-medium text-primary hover:underline text-left"
                      >
                        {row.contact_name}
                      </button>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-sm text-muted-foreground">{contact?.email || "—"}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground max-w-xs">
                      <span className="truncate block">{[contact?.address, contact?.city, contact?.country].filter(Boolean).join(", ") || "—"}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums">{fmtAmount(row.outstanding)}</td>
                    <td className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${row.overdue > 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {row.overdue > 0 ? fmtAmount(row.overdue) : "—"}
                    </td>
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