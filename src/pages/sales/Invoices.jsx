import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Search, Pencil, Trash2, Clock,
  AlertCircle, CheckCircle2, Send, Ban, Printer, Eye,
  MoreVertical, Copy, ChevronRight, ChevronDown, SlidersHorizontal, X,
  RefreshCw, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import InvoicePreviewModal from "@/components/sales/InvoicePreviewModal";
import { printInvoicePdfFromHtml } from "@/components/sales/invoicePdfFromHtml";
import { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { applyRangeToggle } from "@/lib/rangeSelect";
import PdfGeneratingOverlay from "@/components/shared/PdfGeneratingOverlay";
import { useToast } from "@/components/ui/use-toast";
import { retireDocumentNumber } from "@/lib/documentNumbering";

const STATUS_STYLES = {
  Draft:              "bg-slate-100 text-slate-600",
  "Awaiting Approval":"bg-amber-100 text-amber-700",
  "Awaiting Payment": "bg-blue-100 text-blue-700",
  Paid:               "bg-emerald-100 text-emerald-700",
  Repeating:          "bg-violet-100 text-violet-700",
  Cancelled:          "bg-orange-100 text-orange-600",
};

const STATUS_ICONS = {
  Draft:              FileText,
  "Awaiting Approval":AlertCircle,
  "Awaiting Payment": Send,
  Paid:               CheckCircle2,
  Repeating:          RefreshCw,
  Cancelled:          Ban,
};

const STATUSES = ["Draft", "Awaiting Approval", "Awaiting Payment", "Paid", "Repeating", "Cancelled"];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + currency;
}

function isOverdue(inv) {
  if (!inv.due_date || inv.status === "Paid" || inv.status === "Cancelled") return false;
  return new Date(inv.due_date) < new Date();
}

function StatusBadge({ status }) {
  const Icon = STATUS_ICONS[status] || FileText;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[status] || "bg-muted text-muted-foreground"}`}>
      <Icon className="w-3 h-3" />
      {status}
    </span>
  );
}

export default function Invoices() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [invoices, setInvoices] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const selectionAnchorRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const [inv, c, tmpl] = await Promise.all([
      base44.entities.Invoice.list("-created_date", 500),
      base44.entities.Contact.list("full_name", 500).catch(() => []),
      base44.entities.DocumentTemplate.list("-created_date", 50).catch(() => []),
    ]);
    setInvoices(inv);
    setContacts(c);
    setTemplates(tmpl);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusParam = params.get("status");
    if (statusParam) {
      setFilterStatus(statusParam);
      navigate("/sales/invoices", { replace: true });
    } else if (params.get("create") === "true") {
      navigate("/sales/invoices/new", { replace: true });
    } else if (params.get("open") === "true" && params.get("id")) {
      navigate(`/sales/invoices/${params.get("id")}/edit`, { replace: true });
    }
  }, [location.search]);

  const getTemplate = () =>
    templates.find(t => t.is_default && (t.document_types || []).includes("invoice")) ||
    templates.find(t => (t.document_types || []).includes("invoice")) ||
    templates[0] || {};

  const handlePrint = async (inv, e) => {
    e?.stopPropagation();
    setPrinting(inv.id);
    const template = getTemplate();
    // Re-fetch the latest saved invoice so the PDF reflects all saved line items / totals
    let fresh = inv;
    if (inv?.id) {
      try { fresh = await base44.entities.Invoice.get(inv.id); } catch { fresh = inv; }
    }
    const contact = contacts.find(c => c.id === fresh.contact_id);
    await printInvoicePdfFromHtml({ invoice: fresh, contact, template });
    setPrinting(null);
  };

  const countBy = (s) => invoices.filter(i => i.status === s).length;

  const tabs = [
    { key: "all",                label: "All",               count: invoices.length },
    { key: "Draft",              label: "Draft",             count: countBy("Draft") },
    { key: "Awaiting Approval",  label: "Awaiting Approval", count: countBy("Awaiting Approval") },
    { key: "Awaiting Payment",   label: "Awaiting Payment",  count: countBy("Awaiting Payment") },
    { key: "Paid",               label: "Paid",              count: countBy("Paid") },
    { key: "Repeating",          label: "Repeating",         count: countBy("Repeating") },
  ];

  const handleTabChange = (key) => { setFilterStatus(key); setSelected(new Set()); };

  const filtered = invoices.filter(inv => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      inv.number?.toLowerCase().includes(s) ||
      inv.reference?.toLowerCase().includes(s) ||
      inv.contact_name?.toLowerCase().includes(s) ||
      String(inv.total || "").includes(s);
    const matchStatus = filterStatus === "all" || inv.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const pagination = useTablePagination(filtered);

  const handleDelete = async (id) => {
    if (!confirm("Delete this invoice? This action will be permanently recorded in history.")) return;
    const inv = invoices.find(x => x.id === id);
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await logDocumentHistory({ docType: "invoice", docId: null, docNumber: inv?.number || id, action: "Deleted", detail: `Invoice ${inv?.number || id} deleted (${inv?.contact_name || ""}). Number retired.`, userName });
    if (inv?.number) await retireDocumentNumber("invoice", inv.number, id, "invoice deleted");
    await base44.entities.Invoice.delete(id);
    toast({ title: "Invoice deleted", description: inv?.number ? `${inv.number} has been retired and cannot be reused.` : "Invoice deleted." });
    load();
  };

  const openEdit = (inv) => navigate(`/sales/invoices/${inv.id}/edit`);
  const openAdd  = () => navigate("/sales/invoices/new");

  const handleDuplicate = (inv) => {
    const { id, created_date, updated_date, created_by_id, number, contact_id, contact_name, ...rest } = inv;
    navigate("/sales/invoices/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  const handleDuplicateAsQuote = (inv) => {
    const { id, created_date, updated_date, created_by_id, number, due_date, contact_id, contact_name, ...rest } = inv;
    navigate("/sales/quotes/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  // Bulk actions
  const toggleSelect = (id, shiftKey = false) => {
    setSelected(prev => applyRangeToggle(prev, filtered.map(it => it.id), id, shiftKey, selectionAnchorRef));
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(i => i.id)));
  };

  const bulkQuickStatus = async (newStatus, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await Promise.all([...selected].map(async id => {
      const inv = invoices.find(x => x.id === id);
      if (!inv) return;
      await base44.entities.Invoice.update(id, { status: newStatus });
      await logDocumentHistory({ docType: "invoice", docId: id, docNumber: inv.number, action: "Status Changed", detail: `Status changed from ${inv.status} to ${newStatus}`, userName });
    }));
    setSelected(new Set());
    load();
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} invoice(s)? This cannot be undone.`)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    const retiredNumbers = [];
    await Promise.all([...selected].map(async id => {
      const inv = invoices.find(x => x.id === id);
      await logDocumentHistory({ docType: "invoice", docId: null, docNumber: inv?.number || id, action: "Deleted", detail: `Invoice ${inv?.number || id} deleted. Number retired.`, userName });
      if (inv?.number) { await retireDocumentNumber("invoice", inv.number, id, "invoice deleted"); retiredNumbers.push(inv.number); }
      await base44.entities.Invoice.delete(id);
    }));
    setSelected(new Set());
    toast({ title: `${retiredNumbers.length} invoice(s) deleted`, description: retiredNumbers.length ? `${retiredNumbers.length} number(s) retired and cannot be reused.` : undefined });
    load();
  };

  const handleBulkPrint = async () => {
    for (const id of selected) {
      const inv = invoices.find(x => x.id === id);
      if (inv) await handlePrint(inv);
    }
  };

  const selectedTotal = filtered.filter(i => selected.has(i.id)).reduce((sum, i) => sum + (i.total || 0), 0);
  const firstCurrency = filtered.find(i => selected.has(i.id))?.currency || "AED";

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 pt-4 pb-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link to="/sales-overview" className="hover:text-primary transition-colors">Sales overview</Link>
          <ChevronRight className="w-3 h-3" />
        </div>

        {/* Title row */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Invoices</h1>
        </div>

        {/* Xero-style action toolbar */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          {/* New Invoice split button */}
          <div className="flex items-center">
            <Button
              onClick={openAdd}
              className="rounded-r-none gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 text-sm px-3"
            >
              <Plus className="w-3.5 h-3.5" /> New Invoice
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="rounded-l-none border-l border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 px-2">
                  <ChevronDown className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuItem onClick={() => navigate("/sales/invoices/new", { state: { initial: { status: "Repeating" } } })}>
                  <RefreshCw className="w-4 h-4 mr-2" /> New Repeating Invoice
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate("/sales/invoices/new", { state: { initial: { status: "Draft", _creditNote: true } } })}>
                  <FileText className="w-4 h-4 mr-2" /> New Credit Note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5" onClick={() => navigate("/sales/statements")}>
            Send Statements
          </Button>

          <Button variant="outline" size="sm" className="h-8 text-sm px-3 gap-1.5" onClick={() => navigate("/settings/sales")}>
            Settings
          </Button>
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-0 overflow-x-auto">
          {tabs.filter(t => t.key === "all" || t.count > 0).map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                filterStatus === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab.label}
              <span className={`text-xs font-semibold ${filterStatus === tab.key ? "text-primary" : "text-muted-foreground"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Search + filter bar */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Enter a contact, amount, reference or invoice number"
            className="pl-9 bg-muted/40 border-muted"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Button
          variant="outline"
          className={`gap-2 shrink-0 ${showFilters ? "bg-primary/10 border-primary text-primary" : ""}`}
          onClick={() => setShowFilters(f => !f)}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filter
        </Button>
      </div>

      {/* Extra filters panel */}
      {showFilters && (
        <div className="bg-muted/30 border-b border-border px-6 py-3 flex flex-wrap items-center gap-3">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-48 h-8 text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary + bulk actions bar */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs text-muted-foreground">
          {`${filtered.length} items`}
          {filterStatus !== "all" && ` | ${fmtAmount(filtered.reduce((s, i) => s + (i.total || 0), 0), filtered[0]?.currency || "AED")}`}
          {selected.size > 0 && filterStatus !== "all" && (
            <span className="ml-3 font-medium text-foreground">{selected.size} selected · {fmtAmount(selectedTotal, firstCurrency)}</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {filterStatus !== "all" && (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={handleBulkPrint}>Print</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={selected.size === 0} onClick={handleBulkDelete}>Delete</Button>

              {/* Draft tab actions */}
              {filterStatus === "Draft" && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0}
                    onClick={() => bulkQuickStatus("Awaiting Approval", `Submit ${selected.size} invoice(s) for approval?`)}>
                    Submit for Approval
                  </Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0}
                    onClick={() => bulkQuickStatus("Awaiting Payment", `Mark ${selected.size} invoice(s) as Awaiting Payment?`)}>
                    Approve
                  </Button>
                </>
              )}

              {/* Awaiting Approval tab actions */}
              {filterStatus === "Awaiting Approval" && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0}
                    onClick={() => bulkQuickStatus("Draft", `Revert ${selected.size} invoice(s) to Draft?`)}>
                    Revert to Draft
                  </Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0}
                    onClick={() => bulkQuickStatus("Awaiting Payment", `Approve ${selected.size} invoice(s)?`)}>
                    Approve
                  </Button>
                </>
              )}

              {/* Awaiting Payment tab actions */}
              {filterStatus === "Awaiting Payment" && (
                <Button size="sm" className="h-7 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={selected.size === 0}
                  onClick={() => bulkQuickStatus("Paid", `Mark ${selected.size} invoice(s) as Paid?`)}>
                  Mark as Paid
                </Button>
              )}

              {/* Paid tab — no extra actions needed */}

              {/* Repeating tab — no extra status actions */}
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-card">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm border-t border-border">Loading invoices...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center border-t border-border">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No invoices found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterStatus !== "all" ? "Try adjusting your filters." : "Create your first invoice to get started."}
            </p>
            {!search && filterStatus === "all" && (
              <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4" /> New Invoice
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {filterStatus !== "all" && (
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Number</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Dates</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Project / WO</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {pagination.pageItems.map(inv => {
                    const overdue = isOverdue(inv);
                    return (
                      <motion.tr
                        key={inv.id}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="border-b border-border hover:bg-muted/20 transition-colors group cursor-pointer"
                        onClick={() => openEdit(inv)}
                      >
                        {filterStatus !== "all" && (
                          <td className="px-4 py-3 w-10" onClick={e => { e.stopPropagation(); toggleSelect(inv.id, e.shiftKey); }}>
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={selected.has(inv.id)}
                              onClick={e => { e.stopPropagation(); toggleSelect(inv.id, e.shiftKey); }}
                              readOnly
                            />
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <span className="text-sm font-semibold text-primary hover:underline">{inv.number || "—"}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[160px]">
                          <p className="text-sm text-foreground truncate">{inv.reference || "—"}</p>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]" onClick={e => e.stopPropagation()}>
                          {inv.contact_id ? (
                            <Link to={`/contacts/${inv.contact_id}`} className="text-sm font-medium text-primary hover:underline leading-tight truncate block">{inv.contact_name || "—"}</Link>
                          ) : (
                            <p className="text-sm font-medium text-foreground leading-tight">{inv.contact_name || "—"}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex flex-col gap-1">
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="w-3 h-3 shrink-0" />{fmtDate(inv.issue_date)}
                            </span>
                            {inv.due_date ? (
                              <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-medium" : "text-muted-foreground/60"}`}>
                                {overdue ? <AlertCircle className="w-3 h-3 shrink-0" /> : <span className="w-3 h-3 shrink-0" />}
                                {fmtDate(inv.due_date)}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/30">No due date</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell max-w-[160px]" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col gap-0.5">
                            {inv.project_id ? (
                              <Link to={`/projects/${inv.project_id}`} className="text-xs font-medium text-primary hover:underline truncate">{inv.project_name}</Link>
                            ) : inv.project_name ? (
                              <span className="text-xs font-medium text-foreground truncate">{inv.project_name}</span>
                            ) : null}
                            {inv.work_order_id ? (
                              <Link to={`/work-orders/${inv.work_order_id}`} className="text-xs text-primary/80 hover:underline truncate">{inv.work_order_name}</Link>
                            ) : inv.work_order_name ? (
                              <span className="text-xs text-muted-foreground truncate">{inv.work_order_name}</span>
                            ) : null}
                            {!inv.project_name && !inv.work_order_name && (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {fmtAmount(inv.total, inv.currency)}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Quick Preview"
                              onClick={() => setPreview(inv)}>
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground">
                                  <MoreVertical className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem onClick={() => handlePrint(inv)} disabled={printing === inv.id}>
                                  <Printer className="w-4 h-4 mr-2" /> Print PDF
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => openEdit(inv)}>
                                  <Pencil className="w-4 h-4 mr-2" /> Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleDuplicate(inv)}>
                                  <Copy className="w-4 h-4 mr-2" /> Duplicate Invoice
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(inv.id)}>
                                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

      {/* Modals */}
      <InvoicePreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        invoice={preview}
        contact={contacts.find(c => c.id === preview?.contact_id)}
        template={getTemplate()}
        onPrint={preview ? () => handlePrint(preview) : null}
        onEdit={preview ? () => { const inv = preview; setPreview(null); navigate(`/sales/invoices/${inv.id}/edit`); } : null}
      />

      <PdfGeneratingOverlay active={!!printing} label="Generating Invoice PDF" />
    </div>
  );
}