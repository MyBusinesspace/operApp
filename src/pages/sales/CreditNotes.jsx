import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatDateOnly } from "@/lib/dateOnly";
import { Plus, Search, Pencil, Trash2, FileText, ChevronRight, ChevronDown, Eye, Paperclip } from "lucide-react";
import CreditNotePreviewModal from "@/components/sales/CreditNotePreviewModal";
import SalesFilesViewer from "@/components/sales/SalesFilesViewer";
import { lineTaxPct } from "@/lib/docTaxSemantics";
import { pickCreditNoteTemplate } from "@/lib/creditNoteTemplate";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import PdfGeneratingOverlay from "@/components/shared/PdfGeneratingOverlay";
import { printCreditNotePdfFromHtml } from "@/components/sales/creditNotePdfFromHtml";
import { Printer, Copy } from "lucide-react";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reverseDocumentJournal } from "@/lib/autoPostJournal";
import { useToast } from "@/components/ui/use-toast";

function fmtDate(d) {
  if (!d) return "—";
  return formatDateOnly(d);
}
function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + currency;
}

export default function CreditNotes() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [creditNotes, setCreditNotes] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("credit_notes");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [printing, setPrinting] = useState(null);
  const COLUMN_DEFS = [
    { key: "customer", label: "Customer", required: false },
    { key: "reason", label: "Reason", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("credit_notes_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { customer: true, reason: true };
  });
  const toggleCol = (key) => setVisibleCols(prev => {
    const next = { ...prev, [key]: !prev[key] };
    localStorage.setItem("credit_notes_visible_cols", JSON.stringify(next));
    return next;
  });
  const handleDuplicate = (cn) => {
    const { id, created_date, updated_date, created_by_id, created_by, number, contact_id, contact_name, invoice_id, invoice_number, ...rest } = cn;
    navigate("/sales/credit-notes/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "", invoice_id: "", invoice_number: "" } } });
  };
  const { sortKey, sortDir, handleSort } = useSortable("issue_date", "desc");
  const [statusFilter, setStatusFilter] = useState("all");
  const [templates, setTemplates] = useState([]);
  const [preview, setPreview] = useState(null);
  const [docFileCounts, setDocFileCounts] = useState({});
  const [filesId, setFilesId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpanded = (id) => setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [filesPct, setFilesPct] = useState(() => { const v = Number(localStorage.getItem("credit_notes_files_pct")); return v >= 20 && v <= 50 ? v : 35; });
  const splitWrapRef = useRef(null);
  const startFilesResize = (e) => {
    e.preventDefault();
    const box = splitWrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev) => setFilesPct(Math.min(50, Math.max(20, ((ev.clientX - box.left) / box.width) * 100)));
    const up = () => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      setFilesPct(p => { localStorage.setItem("credit_notes_files_pct", String(Math.round(p))); return p; });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  useEffect(() => {
    const load = async () => {
      const [cns, c] = await Promise.all([
        base44.entities.CreditNote.list("-created_date", 5000),
        base44.entities.Contact.list("full_name", 5000).catch(() => []),
      ]);
      setCreditNotes(cns);
      setContacts(c);
      setLoading(false);
      base44.entities.DocumentTemplate.list("name", 100).then(setTemplates).catch(() => {});
      base44.entities.DocumentFile.filter({ doc_type: "credit_note" }, "created_date", 5000).then(files => {
        const m = {};
        (files || []).forEach(f => { m[f.doc_id] = (m[f.doc_id] || 0) + 1; });
        setDocFileCounts(m);
      }).catch(() => {});
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let list = creditNotes;
    if (statusFilter !== "all") list = list.filter(cn => cn.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(cn =>
        (cn.number || "").toLowerCase().includes(q) ||
        (cn.contact_name || "").toLowerCase().includes(q) ||
        (cn.reason || "").toLowerCase().includes(q)
      );
    }
    if (dateStart) list = list.filter(cn => cn.issue_date && String(cn.issue_date).slice(0, 10) >= dateStart);
    if (dateEnd) list = list.filter(cn => cn.issue_date && String(cn.issue_date).slice(0, 10) <= dateEnd);
    return list;
  }, [creditNotes, search, statusFilter, dateStart, dateEnd]);

  const sorted = useMemo(() => {
    const field = { number: "number", customer: "contact_name", dates: "issue_date", reason: "reason", amount: "total" }[sortKey] || sortKey;
    const numeric = sortKey === "amount";
    return [...filtered].sort((a, b) => {
      const av = a[field] ?? "", bv = b[field] ?? "";
      const cmp = numeric ? (Number(av) || 0) - (Number(bv) || 0)
        : String(av).toLowerCase().localeCompare(String(bv).toLowerCase(), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);
  const pagination = useTablePagination(sorted);

  const handlePrint = async (cn) => {
    setPrinting(cn.id);
    try {
      let fresh = cn;
      try { fresh = await base44.entities.CreditNote.get(cn.id); } catch { fresh = cn; }
      await printCreditNotePdfFromHtml({ creditNote: fresh, contact: contacts.find(c => c.id === fresh.contact_id), template: pickCreditNoteTemplate(templates) });
    } catch (e) {
      toast({ title: "Could not generate the PDF", description: e.message, variant: "destructive" });
    }
    setPrinting(null);
  };

  const fileCountFor = (cn) => (cn.annex_photos || []).filter(p => p.include !== false).length + (docFileCounts[cn.id] || 0);
  const filesDoc = creditNotes.find(x => x.id === filesId) || null;
  const totalCredit = filtered.reduce((s, cn) => s + (cn.base_total || cn.total || 0), 0);

  const handleDelete = async (cn) => {
    if (!confirm(`Delete credit note ${cn.number}? Its journal entry will be reversed.`)) return;
    try {
      await reverseDocumentJournal("CreditNote", cn.id, "credit note deleted");
      await base44.entities.CreditNote.delete(cn.id);
      setCreditNotes(prev => prev.filter(x => x.id !== cn.id));
      toast({ title: "Credit note deleted" });
    } catch (e) {
      toast({ title: "Delete failed", description: e.message, variant: "destructive" });
    }
  };

  const statusCounts = useMemo(() => {
    const counts = { all: creditNotes.length, Draft: 0, "Awaiting Application": 0, Applied: 0, Cancelled: 0 };
    for (const cn of creditNotes) {
      if (counts[cn.status] !== undefined) counts[cn.status]++;
    }
    return counts;
  }, [creditNotes]);

  const TABS = [
    { key: "all", label: "All" },
    { key: "Draft", label: "Draft" },
    { key: "Awaiting Application", label: "Awaiting Application" },
    { key: "Applied", label: "Applied" },
    { key: "Cancelled", label: "Cancelled" },
  ];

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <div className="bg-card px-6 pt-4 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Link to="/sales-overview" className="hover:text-primary transition-colors">Sales overview</Link>
          <ChevronRight className="w-3 h-3" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-3">Credit Notes</h1>
        <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
          <Button onClick={() => navigate("/sales/credit-notes/new")} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 text-xs px-3">
            <Plus className="w-3.5 h-3.5" /> New Credit Note
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/settings/data-export")}>
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Export
          </Button>
          <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
        </div>
        <div className="flex items-stretch gap-0 overflow-x-auto -mb-px">
          {TABS.map(tab => {
            const active = statusFilter === tab.key;
            return (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border border-b-0 border-slate-300 dark:border-slate-600 transition-colors ${
                  active
                    ? "bg-white dark:bg-slate-900 text-black dark:text-white border-t-2 border-t-primary shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/60 text-primary dark:text-primary/80 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}>
                {tab.label}
                <span className={`text-xs font-bold ${active ? "text-black dark:text-white" : "text-primary dark:text-primary/70"}`}>{statusCounts[tab.key] || 0}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by number, customer, reason…"
            className="pl-9 bg-muted/40 border-muted" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-[150px] text-xs" />
        <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-[150px] text-xs" />
        <div className="text-xs text-muted-foreground tabular-nums">
          Total: <span className="font-semibold text-foreground">{fmtAmount(totalCredit)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex bg-card" ref={splitWrapRef}>
        {filesDoc && (
          <>
            <div style={{ width: `${filesPct}%`, minWidth: 260, maxWidth: "55%" }} className="min-w-0 flex flex-col shrink-0">
              <SalesFilesViewer doc={filesDoc} docType="credit_note" onClose={() => setFilesId(null)} />
            </div>
            <div onMouseDown={startFilesResize} title="Drag to resize" className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors" />
          </>
        )}
        <div className="flex-1 min-w-0 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
            <div className="w-6 h-6 border-2 border-muted border-t-primary rounded-full animate-spin mr-2" />
            Loading…
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-xs font-medium text-foreground">No credit notes found</p>
            <p className="text-xs text-muted-foreground mt-1">Create a credit note to credit a customer's account.</p>
          </div>
        ) : (
          <div>
            <table className="w-full text-xs">
              <thead className="bg-white/50 dark:bg-slate-800/50 text-xs uppercase text-slate-700">
                <tr>
                  <th className="w-16 px-3 py-3 text-left font-bold text-slate-700">View</th>
                  <SortableTh colKey="number" label="Number" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  {visibleCols.customer && <SortableTh colKey="customer" label="Customer" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  <SortableTh colKey="dates" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  {visibleCols.reason && <SortableTh colKey="reason" label="Reason" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  <SortableTh colKey="amount" label="Total" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="w-16 px-3 py-3 text-center font-bold text-slate-700">Files</th>
                  <th className="w-36"></th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((cn, idx) => {
                  const isExpanded = expandedIds.has(cn.id);
                  const lines = (cn.line_items || []).filter(l => l.description || l.unit_price);
                  const fc = fileCountFor(cn);
                  return (
                  <React.Fragment key={cn.id}>
                  <tr
                    className="border-t border-slate-200 dark:border-slate-700 hover:bg-primary/[0.06] cursor-pointer transition-colors"
                    onClick={() => navigate(`/sales/credit-notes/${cn.id}/edit`)}
                  >
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-0.5">
                        <button type="button" className="h-7 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground" title={isExpanded ? "Hide lines" : "Show lines"} onClick={() => toggleExpanded(cn.id)}>
                          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Preview" onClick={() => setPreview(cn)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">{cn.number || "—"}</td>
                    {visibleCols.customer && <td className="px-4 py-3 text-muted-foreground">{cn.contact_name || "—"}</td>}
                    <td className="px-4 py-3 text-muted-foreground">{fmtDate(cn.issue_date)}</td>
                    {visibleCols.reason && <td className="px-4 py-3 text-muted-foreground max-w-xs truncate">{cn.reason || "—"}</td>}
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-foreground">{fmtAmount(cn.total, cn.currency)}</td>
                    <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                      <button type="button" onClick={() => setFilesId(cn.id)}
                        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fc > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                        title="View annex files">
                        <Paperclip className="w-3.5 h-3.5" />
                        {fc > 0 && <span className="tabular-nums">{fc}</span>}
                      </button>
                    </td>
                    <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Duplicate" onClick={() => handleDuplicate(cn)}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Print PDF" disabled={!!printing} onClick={() => handlePrint(cn)}>
                          <Printer className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/sales/credit-notes/${cn.id}/edit`)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(cn)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="border-t border-slate-200 dark:border-slate-700 bg-muted/30" onClick={e => e.stopPropagation()}>
                      <td colSpan={20} className="px-6 py-2">
                        {lines.length === 0 ? <p className="text-xs text-muted-foreground">No line items</p> : (
                          <table className="w-full text-xs">
                            <thead><tr className="text-muted-foreground">
                              <th className="text-left font-medium py-1">Description</th>
                              <th className="text-left font-medium py-1 pr-3">Account</th>
                              <th className="text-right font-medium py-1 w-16">Qty</th>
                              <th className="text-right font-medium py-1 w-28">Unit price</th>
                              <th className="text-right font-medium py-1 w-16">Tax</th>
                              <th className="text-right font-medium py-1 w-28">Amount</th>
                            </tr></thead>
                            <tbody>
                              {lines.map((l, i) => (
                                <tr key={i} className="border-t border-border/50">
                                  <td className="py-1 pr-3 whitespace-pre-wrap">{l.description || "—"}</td>
                                  <td className="py-1 pr-3 text-muted-foreground">{l.account_name || l.account_code || l.account || "—"}</td>
                                  <td className="py-1 text-right tabular-nums">{l.quantity ?? "—"}</td>
                                  <td className="py-1 text-right tabular-nums">{fmtAmount(l.unit_price, cn.currency)}</td>
                                  <td className="py-1 text-right tabular-nums">{l.tax_rate != null ? `${lineTaxPct(l, cn)}%` : "—"}</td>
                                  <td className="py-1 text-right tabular-nums font-medium">{fmtAmount(l.amount ?? l.total ?? ((l.quantity || 0) * (l.unit_price || 0)), cn.currency)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
      </div>

      <PaginationFooter pagination={pagination} />
      <PdfGeneratingOverlay active={!!printing} label="Generating Credit Note PDF" />

      <CreditNotePreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        creditNote={preview}
        contact={contacts.find(c => c.id === preview?.contact_id)}
        template={pickCreditNoteTemplate(templates)}
        onPrint={null}
        onEdit={preview ? () => { const cn = preview; setPreview(null); navigate(`/sales/credit-notes/${cn.id}/edit`); } : null}
      />
    </div>
  );
}
