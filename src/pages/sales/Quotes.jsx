import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Search, Pencil, Trash2, Clock,
  AlertCircle, CheckCircle2, XCircle, Send, Receipt, Ban, Printer, Eye,
  MoreVertical, Copy, ChevronRight, SlidersHorizontal, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { syncContactType } from "@/lib/syncContactType";
import QuotePreviewModal from "@/components/sales/QuotePreviewModal";
import CopyQuoteToModal from "@/components/sales/CopyQuoteToModal";
import { printQuotePdfFromHtml } from "@/components/sales/quotePdfFromHtml";
import { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { applyRangeToggle } from "@/lib/rangeSelect";
import PdfGeneratingOverlay from "@/components/shared/PdfGeneratingOverlay";
import SortIcon, { SortableTh } from "@/components/shared/SortIcon";
import { useToast } from "@/components/ui/use-toast";
import { retireDocumentNumber } from "@/lib/documentNumbering";

const STATUS_STYLES = {
  Draft:     "bg-slate-100 text-slate-600",
  Sent:      "bg-blue-100 text-blue-700",
  Accepted:  "bg-emerald-100 text-emerald-700",
  Declined:  "bg-red-100 text-red-600",
  Invoiced:  "bg-violet-100 text-violet-700",
  Cancelled: "bg-orange-100 text-orange-600",
};

const STATUS_ICONS = {
  Draft: FileText,
  Sent: Send,
  Accepted: CheckCircle2,
  Declined: XCircle,
  Invoiced: Receipt,
  Cancelled: Ban,
};

const STATUSES = ["Draft", "Sent", "Accepted", "Declined", "Invoiced", "Cancelled"];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + currency;
}

function isExpired(d) {
  if (!d) return false;
  return new Date(d) < new Date();
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

export default function Quotes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState([]);
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
  const [copyToModal, setCopyToModal] = useState(false);
  const [copyToQuote, setCopyToQuote] = useState(null);
  const [sortKey, setSortKey] = useState("created_date");
  const [sortDir, setSortDir] = useState("desc");

  const handleSort = (col) => {
    if (sortKey === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  const sortValue = (q, col) => {
    switch (col) {
      case "number": return (q.number || "").toLowerCase();
      case "reference": return (q.reference || "").toLowerCase();
      case "customer": return (q.contact_name || "").toLowerCase();
      case "dates": return q.issue_date || q.created_date || "";
      case "amount": return q.total || 0;
      case "status": return q.status || "";
      default: return q.created_date || "";
    }
  };

  const load = async () => {
    setLoading(true);
    const [q, c, tmpl] = await Promise.all([
      base44.entities.Quote.list("-created_date", 500),
      base44.entities.Contact.list("full_name", 200).catch(() => []),
      base44.entities.DocumentTemplate.list("-created_date", 100).catch(() => []),
    ]);
    setQuotes(q);
    setContacts(c);
    setTemplates(tmpl);
    setLoading(false);
  };

  const handlePrint = async (q, e) => {
    e?.stopPropagation();
    setPrinting(q.id);
    const template = templates.find(t => t.is_default && (t.document_types || []).includes("quote"))
      || templates.find(t => (t.document_types || []).includes("quote"))
      || templates[0]
      || {};
    // Re-fetch the latest saved quote so the PDF reflects all saved line items / totals
    let fresh = q;
    if (q?.id) {
      try { fresh = await base44.entities.Quote.get(q.id); } catch { fresh = q; }
    }
    const contact = contacts.find(c => c.id === fresh.contact_id);
    await printQuotePdfFromHtml({ quote: fresh, contact, template });
    setPrinting(null);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("create") === "true") {
      navigate("/sales/quotes/new", { replace: true });
    } else if (params.get("open") === "true" && params.get("id")) {
      navigate(`/sales/quotes/${params.get("id")}/edit`, { replace: true });
    }
  }, [location.search]);

  const countBy = (s) => quotes.filter(q => q.status === s).length;

  const tabs = [
    { key: "all",       label: "All",       count: quotes.length },
    { key: "Draft",     label: "Draft",     count: countBy("Draft") },
    { key: "Sent",      label: "Sent",      count: countBy("Sent") },
    { key: "Declined",  label: "Declined",  count: countBy("Declined") },
    { key: "Accepted",  label: "Accepted",  count: countBy("Accepted") },
    { key: "Invoiced",  label: "Invoiced",  count: countBy("Invoiced") },
  ];

  // Clear selection when tab changes
  const handleTabChange = (key) => { setFilterStatus(key); setSelected(new Set()); };

  const filtered = quotes.filter(q => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      q.number?.toLowerCase().includes(s) ||
      q.reference?.toLowerCase().includes(s) ||
      q.contact_name?.toLowerCase().includes(s) ||
      String(q.total || "").includes(s);
    const matchStatus = filterStatus === "all" || q.status === filterStatus;
    return matchSearch && matchStatus;
  }).sort((a, b) => {
    const va = sortValue(a, sortKey);
    const vb = sortValue(b, sortKey);
    let cmp = 0;
    if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
    else cmp = String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const pagination = useTablePagination(filtered);

  const handleDelete = async (id) => {
    if (!confirm("Delete this quote? This action will be permanently recorded in history.")) return;
    const q = quotes.find(x => x.id === id);
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await logDocumentHistory({ docType: "quote", docId: null, docNumber: q?.number || id, action: "Deleted", detail: `Quote ${q?.number || id} deleted (${q?.contact_name || ""}). Number retired.`, userName });
    if (q?.number) await retireDocumentNumber("quote", q.number, id, "quote deleted");
    await base44.entities.Quote.delete(id);
    toast({ title: "Quote deleted", description: q?.number ? `${q.number} has been retired and cannot be reused.` : "Quote deleted." });
    load();
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} quote(s)? This cannot be undone.`)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    const retiredNumbers = [];
    await Promise.all([...selected].map(async id => {
      const q = quotes.find(x => x.id === id);
      await logDocumentHistory({ docType: "quote", docId: null, docNumber: q?.number || id, action: "Deleted", detail: `Quote ${q?.number || id} deleted. Number retired.`, userName });
      if (q?.number) { await retireDocumentNumber("quote", q.number, id, "quote deleted"); retiredNumbers.push(q.number); }
      await base44.entities.Quote.delete(id);
    }));
    setSelected(new Set());
    toast({ title: `${retiredNumbers.length} quote(s) deleted`, description: retiredNumbers.length ? `${retiredNumbers.length} number(s) retired and cannot be reused.` : undefined });
    load();
  };

  const handleBulkSend = async () => {
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await Promise.all([...selected].map(async id => {
      const q = quotes.find(x => x.id === id);
      await base44.entities.Quote.update(id, { status: "Sent" });
      await logDocumentHistory({ docType: "quote", docId: id, docNumber: q?.number || id, action: "Status Changed", detail: `Status changed from ${q?.status} to Sent`, userName });
    }));
    setSelected(new Set());
    load();
  };

  const handleBulkPrint = async () => {
    for (const id of selected) {
      const q = quotes.find(x => x.id === id);
      if (q) await handlePrint(q);
    }
  };

  const handleBulkCopyTo = () => {
    if (selected.size !== 1) return;
    const id = [...selected][0];
    const q = quotes.find(x => x.id === id);
    if (!q) return;
    setCopyToQuote(q);
    setCopyToModal(true);
  };

  const handleCopyToSelect = (type) => {
    setCopyToModal(false);
    if (!copyToQuote) return;
    const { id, created_date, updated_date, created_by_id, number, contact_id, contact_name, ...rest } = copyToQuote;
    const draftBody = { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" };
    if (type === "invoice") {
      navigate("/sales/invoices/new", { state: { duplicate: draftBody } });
    } else {
      navigate("/sales/quotes/new", { state: { duplicate: draftBody } });
    }
    setCopyToQuote(null);
    setSelected(new Set());
  };

  const handleBulkDecline = async () => {
    if (!confirm(`Mark ${selected.size} quote(s) as Declined?`)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await Promise.all([...selected].map(async id => {
      const q = quotes.find(x => x.id === id);
      if (!q || !["Draft", "Sent"].includes(q.status)) return;
      await base44.entities.Quote.update(id, { status: "Declined" });
      await logDocumentHistory({ docType: "quote", docId: id, docNumber: q.number, action: "Status Changed", detail: `Status changed from ${q.status} to Declined`, userName });
    }));
    setSelected(new Set());
    load();
  };

  const handleBulkAccept = async () => {
    if (!confirm(`Mark ${selected.size} quote(s) as Accepted?`)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await Promise.all([...selected].map(async id => {
      const q = quotes.find(x => x.id === id);
      if (!q || !["Draft", "Sent"].includes(q.status)) return;
      await base44.entities.Quote.update(id, { status: "Accepted" });
      await logDocumentHistory({ docType: "quote", docId: id, docNumber: q.number, action: "Status Changed", detail: `Status changed from ${q.status} to Accepted`, userName });
    }));
    setSelected(new Set());
    load();
  };

  const handleBulkUnmarkInvoiced = async () => {
    if (!confirm(`Unmark ${selected.size} quote(s) as Invoiced (revert to Accepted)?`)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await Promise.all([...selected].map(async id => {
      const q = quotes.find(x => x.id === id);
      if (!q || q.status !== "Invoiced") return;
      await base44.entities.Quote.update(id, { status: "Accepted" });
      await logDocumentHistory({ docType: "quote", docId: id, docNumber: q.number, action: "Status Changed", detail: `Status changed from Invoiced to Accepted`, userName });
    }));
    setSelected(new Set());
    load();
  };

  const handleBulkMarkInvoiced = async () => {
    if (!confirm(`Mark ${selected.size} quote(s) as Invoiced?`)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await Promise.all([...selected].map(async id => {
      const q = quotes.find(x => x.id === id);
      if (!q || q.status !== "Accepted") return;
      await base44.entities.Quote.update(id, { status: "Invoiced" });
      await logDocumentHistory({ docType: "quote", docId: id, docNumber: q.number, action: "Status Changed", detail: `Status changed from Accepted to Invoiced`, userName });
    }));
    setSelected(new Set());
    load();
  };

  const handleBulkCreateInvoice = async () => {
    const acceptedSelected = filtered.filter(q => selected.has(q.id) && q.status === "Accepted");
    if (acceptedSelected.length === 0) return;
    // Convert the first selected accepted quote (one at a time to avoid UX confusion)
    handleConvertToInvoice(acceptedSelected[0]);
    setSelected(new Set());
  };

  const toggleSelect = (id, shiftKey = false) => {
    setSelected(prev => applyRangeToggle(prev, filtered.map(it => it.id), id, shiftKey, selectionAnchorRef));
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(q => q.id)));
    }
  };

  const selectedTotal = filtered.filter(q => selected.has(q.id)).reduce((sum, q) => sum + (q.total || 0), 0);
  const firstCurrency = filtered.find(q => selected.has(q.id))?.currency || "AED";

  const openEdit = (q) => navigate(`/sales/quotes/${q.id}/edit`);
  const openAdd  = () => navigate("/sales/quotes/new");

  const handleDuplicate = (q) => {
    const { id, created_date, updated_date, created_by_id, number, contact_id, contact_name, ...rest } = q;
    navigate("/sales/quotes/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  const handleConvertToInvoice = async (q) => {
    const { id, created_date, updated_date, created_by_id, number, expiry_date, status, ...rest } = q;
    // Automatically mark the quote as Invoiced — "Invoiced" only results from creating an invoice
    if (q.status !== "Invoiced") {
      const user = await base44.auth.me().catch(() => null);
      const userName = user?.full_name || user?.email || "Unknown";
      await base44.entities.Quote.update(q.id, { status: "Invoiced" });
      await logDocumentHistory({ docType: "quote", docId: q.id, docNumber: q.number, action: "Status Changed", detail: `Status changed from ${q.status} to Invoiced (converted to invoice)`, userName });
      load();
    }
    navigate("/sales/invoices/new", { state: { fromQuote: { ...rest, number: "", issue_date: new Date().toISOString().slice(0, 10), quote_id: q.id } } });
  };

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
          <h1 className="text-xl font-bold text-foreground">Quotes</h1>
          <div className="flex items-center gap-2">
            <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
              <Plus className="w-4 h-4" /> New quote
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="h-9 w-9">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => navigate("/settings/sales")}>
                  Settings
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
            placeholder="Enter a contact, amount, reference or quote number"
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
            <SelectTrigger className="w-40 h-8 text-sm"><SelectValue placeholder="All Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Summary + bulk actions bar */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs text-muted-foreground flex items-center gap-3">
          {`${filtered.length} items`}
          {filterStatus !== "all" && ` | ${fmtAmount(filtered.reduce((s, q) => s + (q.total || 0), 0), filtered[0]?.currency || "AED")}`}
          {selected.size > 0 && <span className="font-medium text-foreground">{selected.size} selected · {fmtAmount(selectedTotal, firstCurrency)}</span>}
          {filtered.length > 0 && (
            <button
              onClick={toggleSelectAll}
              className="text-xs text-primary hover:underline font-medium"
            >
              {selected.size === filtered.length ? "Deselect all" : "Select all"}
            </button>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          {selected.size > 0 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={handleBulkDelete}>
              Delete ({selected.size})
            </Button>
          )}
          {filterStatus !== "all" && (
            <>
              {/* Unmark as invoiced — always visible on Invoiced tab */}
              {filterStatus === "Invoiced" && (
                <Button size="sm" variant="ghost" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={handleBulkUnmarkInvoiced}>Unmark as invoiced</Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={handleBulkPrint}>Print</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={selected.size === 0} onClick={handleBulkDelete}>Delete</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={handleBulkSend}>Send</Button>
              <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size !== 1} onClick={handleBulkCopyTo}>Copy to</Button>
              {/* Decline / Accept — visible on Draft or Sent tabs */}
              {["Draft", "Sent"].includes(filterStatus) && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0 || !filtered.some(q => selected.has(q.id) && ["Draft", "Sent"].includes(q.status))} onClick={handleBulkDecline}>Decline</Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0 || !filtered.some(q => selected.has(q.id) && ["Draft", "Sent"].includes(q.status))} onClick={handleBulkAccept}>Accept</Button>
                </>
              )}
              {/* Mark as invoiced / Create invoice — visible on Accepted tab */}
              {filterStatus === "Accepted" && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0 || !filtered.some(q => selected.has(q.id) && q.status === "Accepted")} onClick={handleBulkMarkInvoiced}>Mark as invoiced</Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0 || !filtered.some(q => selected.has(q.id) && q.status === "Accepted")} onClick={handleBulkCreateInvoice}>Create invoice</Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-card">
        <div className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm border-t border-border">Loading quotes...</div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center border-t border-border">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7 text-muted-foreground/50" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">No quotes found</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {search || filterStatus !== "all" ? "Try adjusting your filters." : "Create your first quote to get started."}
              </p>
              {!search && filterStatus === "all" && (
                <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                  <Plus className="w-4 h-4" /> New Quote
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={filtered.length > 0 && selected.size === filtered.length}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    <SortableTh colKey="number" label="Number" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableTh colKey="reference" label="Reference" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableTh colKey="customer" label="Customer" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortableTh colKey="dates" label="Dates" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Project / WO</th>
                    <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("amount")}>
                      <span className="inline-flex items-center">
                        Amount
                        <SortIcon sortKey={sortKey} col="amount" sortDir={sortDir} />
                      </span>
                    </th>
                    <th className="px-4 py-3 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {pagination.pageItems.map(q => {
                      const expired = isExpired(q.expiry_date) && !["Accepted", "Invoiced", "Cancelled", "Declined"].includes(q.status);
                      return (
                        <motion.tr
                          key={q.id}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="border-b border-border hover:bg-muted/20 transition-colors group cursor-pointer"
                          onClick={() => openEdit(q)}
                        >
                          <td className="px-4 py-3 w-10" onClick={e => { e.stopPropagation(); toggleSelect(q.id, e.shiftKey); }}>
                            <input
                              type="checkbox"
                              className="rounded border-border"
                              checked={selected.has(q.id)}
                              onClick={e => { e.stopPropagation(); toggleSelect(q.id, e.shiftKey); }}
                              readOnly
                            />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm font-semibold text-primary hover:underline">
                              {q.number || "—"}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-[160px]">
                            <p className="text-sm text-foreground truncate">{q.reference || "—"}</p>
                          </td>
                          <td className="px-4 py-3 max-w-[200px]" onClick={e => e.stopPropagation()}>
                            {q.contact_id ? (
                              <Link to={`/contacts/${q.contact_id}`} className="text-sm font-medium text-primary hover:underline leading-tight truncate block">{q.contact_name || "—"}</Link>
                            ) : (
                              <p className="text-sm font-medium text-foreground leading-tight">{q.contact_name || "—"}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="flex flex-col gap-1">
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="w-3 h-3 shrink-0" />{fmtDate(q.issue_date)}
                              </span>
                              {q.expiry_date ? (
                                <span className={`flex items-center gap-1 text-xs ${expired ? "text-red-600 font-medium" : "text-muted-foreground/60"}`}>
                                  {expired ? <AlertCircle className="w-3 h-3 shrink-0" /> : <span className="w-3 h-3 shrink-0" />}
                                  {fmtDate(q.expiry_date)}
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground/30">No expiry</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden lg:table-cell max-w-[160px]" onClick={e => e.stopPropagation()}>
                            <div className="flex flex-col gap-0.5">
                              {q.project_id ? (
                                <Link to={`/projects/${q.project_id}`} className="text-xs font-medium text-primary hover:underline truncate">{q.project_name}</Link>
                              ) : q.project_name ? (
                                <span className="text-xs font-medium text-foreground truncate">{q.project_name}</span>
                              ) : null}
                              {q.work_order_id ? (
                                <Link to={`/work-orders/${q.work_order_id}`} className="text-xs text-primary/80 hover:underline truncate">{q.work_order_name}</Link>
                              ) : q.work_order_name ? (
                                <span className="text-xs text-muted-foreground truncate">{q.work_order_name}</span>
                              ) : null}
                              {!q.project_name && !q.work_order_name && (
                                <span className="text-xs text-muted-foreground/40">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <StatusBadge status={q.status} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold text-foreground tabular-nums">
                              {fmtAmount(q.total, q.currency)}
                            </span>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Quick Preview"
                                onClick={() => setPreview(q)}>
                                <Eye className="w-3.5 h-3.5" />
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground">
                                    <MoreVertical className="w-3.5 h-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-48">
                                  <DropdownMenuItem onClick={() => handlePrint(q)} disabled={printing === q.id}>
                                    <Printer className="w-4 h-4 mr-2" /> Print PDF
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => openEdit(q)}>
                                    <Pencil className="w-4 h-4 mr-2" /> Edit
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => { setCopyToQuote(q); setCopyToModal(true); }}>
                                    <Copy className="w-4 h-4 mr-2" /> Copy quote to...
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(q.id)}>
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
      </div>

      <PaginationFooter pagination={pagination} />

      {/* Modals */}
      <QuotePreviewModal
        open={!!preview}
        onClose={() => setPreview(null)}
        quote={preview}
        contact={contacts.find(c => c.id === preview?.contact_id)}
        template={
          templates.find(t => t.is_default && (t.document_types || []).includes("quote")) ||
          templates.find(t => (t.document_types || []).includes("quote")) ||
          templates[0]
        }
        onPrint={preview ? () => handlePrint(preview, { stopPropagation: () => {} }) : null}
        onEdit={preview ? () => { const q = preview; setPreview(null); navigate(`/sales/quotes/${q.id}/edit`); } : null}
      />

      <CopyQuoteToModal
        open={copyToModal}
        onClose={() => { setCopyToModal(false); setCopyToQuote(null); }}
        onSelect={handleCopyToSelect}
      />

      <PdfGeneratingOverlay active={!!printing} label="Generating Quote PDF" />
    </div>
  );
}