import React, { useState, useEffect, useRef } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { compareDateOnly, formatDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Search, Clock, AlertCircle, CheckCircle2, Send, Receipt, Ban,
  ChevronRight, ChevronDown, X, Eye, Paperclip, Copy, FilePlus2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import QuotePreviewModal from "@/components/sales/QuotePreviewModal";
import CopyQuoteToModal from "@/components/sales/CopyQuoteToModal";
import { printQuotePdfFromHtml } from "@/components/sales/quotePdfFromHtml";
import { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import { itemsError } from "@/lib/lineItemValidation";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { applyRangeToggle } from "@/lib/rangeSelect";
import PdfGeneratingOverlay from "@/components/shared/PdfGeneratingOverlay";
import SortIcon, { SortableTh } from "@/components/shared/SortIcon";
import { useToast } from "@/components/ui/use-toast";
import { retireDocumentNumber } from "@/lib/documentNumbering";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { useSortable } from "@/hooks/useSortable";
import SalesFilterPopover, { makeSalesDefaultFilters } from "@/components/sales/SalesFilterPopover";
import SalesSplitDetail from "@/components/sales/SalesSplitDetail";
import SalesFilesViewer from "@/components/sales/SalesFilesViewer";
import { lineTaxPct } from "@/lib/docTaxSemantics";

const SORT_FIELD = {
  number: "number",
  reference: "reference",
  customer: "contact_name",
  dates: "issue_date",
  expiry: "expiry_date",
  project_wo: "project_name",
  status: "status",
  amount: "total",
};

const QUOTE_DOC_TYPES = [
  { key: "quotes", label: "Quotes" },
  { key: "creditNotes", label: "Credit notes" },
  { key: "prepayments", label: "Prepayments" },
];

function fmtDate(d) {
  if (!d) return "—";
  return formatDateOnly(d);
}
function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + currency;
}
function isExpired(q) {
  if (!q.expiry_date || ["Accepted", "Invoiced", "Cancelled", "Declined"].includes(q.status)) return false;
  return compareDateOnly(q.expiry_date, todayLocalISO()) < 0;
}

export default function Quotes() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState([]);
  const { can } = usePermissionsMatrix();
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [docFileCounts, setDocFileCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(null);
  const [search, setSearch] = usePersistedSearch("quotes");
  const [filterStatus, setFilterStatus] = useState("all");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const selectionAnchorRef = useRef(null);
  const [copyToModal, setCopyToModal] = useState(false);
  const [copyToQuote, setCopyToQuote] = useState(null);
  const { sortKey, sortDir, handleSort } = useSortable("issue_date", "desc");

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [dateType, setDateType] = useState("any");
  const [filters, setFilters] = useState(() => makeSalesDefaultFilters(QUOTE_DOC_TYPES));

  const [splitMode, setSplitMode] = useState(null);
  const [splitId, setSplitId] = useState(null);
  const [filesId, setFilesId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const toggleExpanded = (id) => setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [filesPct, setFilesPct] = useState(() => { const v = Number(localStorage.getItem("quotes_files_pct")); return v >= 20 && v <= 50 ? v : 35; });
  const splitWrapRef = useRef(null);
  const startFilesResize = (e) => {
    e.preventDefault();
    const box = splitWrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev) => setFilesPct(Math.min(50, Math.max(20, ((ev.clientX - box.left) / box.width) * 100)));
    const up = () => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      setFilesPct(p => { localStorage.setItem("quotes_files_pct", String(Math.round(p))); return p; });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "project_wo", label: "Project / WO", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("quotes_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, project_wo: false };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("quotes_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const [q, c, tmpl, df] = await Promise.all([
      base44.entities.Quote.list("-created_date", 5000),
      base44.entities.Contact.list("full_name", 5000).catch(() => []),
      base44.entities.DocumentTemplate.list("-created_date", 100).then(l => (l || []).filter(t => !(t.name || "").startsWith("__"))).catch(() => []),
      base44.entities.DocumentFile.filter({ doc_type: "quote" }, "created_date", 5000).catch(() => []),
    ]);
    setQuotes(q);
    setContacts(c);
    setTemplates(tmpl);
    const counts = {};
    (df || []).forEach(f => { counts[f.doc_id] = (counts[f.doc_id] || 0) + 1; });
    setDocFileCounts(counts);
    setLoading(false);
  };

  const handlePrint = async (q, e) => {
    e?.stopPropagation();
    setPrinting(q.id);
    const template = templates.find(t => t.is_default && (t.document_types || []).includes("quote"))
      || templates.find(t => (t.document_types || []).includes("quote"))
      || templates[0]
      || {};
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

  const tabs = React.useMemo(() => {
    const counts = quotes.reduce((acc, q) => { acc[q.status] = (acc[q.status] || 0) + 1; return acc; }, {});
    return [
      { key: "all",       label: "All",       count: quotes.length },
      { key: "Draft",     label: "Draft",     count: counts["Draft"] || 0 },
      { key: "Sent",      label: "Sent",      count: counts["Sent"] || 0 },
      { key: "Declined",  label: "Declined",  count: counts["Declined"] || 0 },
      { key: "Accepted",  label: "Accepted",  count: counts["Accepted"] || 0 },
      { key: "Invoiced",  label: "Invoiced",  count: counts["Invoiced"] || 0 },
      { key: "Cancelled", label: "Cancelled", count: counts["Cancelled"] || 0 },
    ];
  }, [quotes]);

  const handleTabChange = (key) => { setFilterStatus(key); setSelected(new Set()); };

  const filtered = React.useMemo(() => {
    const s = search.toLowerCase();
    return quotes.filter(q => {
      const matchSearch = !search ||
        q.number?.toLowerCase().includes(s) ||
        q.reference?.toLowerCase().includes(s) ||
        q.contact_name?.toLowerCase().includes(s) ||
        String(q.total || "").includes(s);
      const matchStatus = filterStatus === "all" || q.status === filterStatus;

      if (filters.showOverdue && !isExpired(q)) return false;
      if (!filters.deletedVoided && q.status === "Cancelled") return false;
      if (!filters.docTypes.quotes) return false;

      if (dateStart || dateEnd) {
        const dates = [];
        if (dateType === "any" || dateType === "transaction") dates.push(q.issue_date);
        if (dateType === "any" || dateType === "expiry") dates.push(q.expiry_date);
        const inRange = dates.some(d => {
          if (!d) return false;
          if (dateStart && compareDateOnly(d, dateStart) < 0) return false;
          if (dateEnd && compareDateOnly(d, dateEnd) > 0) return false;
          return true;
        });
        if (!inRange) return false;
      }

      return matchSearch && matchStatus;
    });
  }, [quotes, search, filterStatus, dateStart, dateEnd, dateType, filters]);

  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    const field = SORT_FIELD[sortKey];
    const numeric = sortKey === "amount";
    return [...filtered].sort((a, b) => {
      const av = a[field] ?? "";
      const bv = b[field] ?? "";
      let cmp;
      if (numeric) {
        cmp = (Number(av) || 0) - (Number(bv) || 0);
      } else {
        cmp = String(av).toLowerCase().localeCompare(String(bv).toLowerCase(), undefined, { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const pagination = useTablePagination(sorted);

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
    const emptyQuotes = [...selected].map(id => quotes.find(x => x.id === id)).filter(q => q && itemsError(q.line_items, "Sent"));
    if (emptyQuotes.length) { toast({ title: "Line items required", description: `${emptyQuotes.length} quote(s) have no line item — add one before sending.`, variant: "destructive" }); return; }
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
    const emptyQuotes = [...selected].map(id => quotes.find(x => x.id === id)).filter(q => q && itemsError(q.line_items, "Accepted"));
    if (emptyQuotes.length) { toast({ title: "Line items required", description: `${emptyQuotes.length} quote(s) have no line item — add one before accepting.`, variant: "destructive" }); return; }
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
    const emptyQuotes = [...selected].map(id => quotes.find(x => x.id === id)).filter(q => q && itemsError(q.line_items, "Invoiced"));
    if (emptyQuotes.length) { toast({ title: "Line items required", description: `${emptyQuotes.length} quote(s) have no line item — add one before invoicing.`, variant: "destructive" }); return; }
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
    handleConvertToInvoice(acceptedSelected[0]);
    setSelected(new Set());
  };

  const toggleSelect = (id, shiftKey = false) => {
    setSelected(prev => applyRangeToggle(prev, filtered.map(it => it.id), id, shiftKey, selectionAnchorRef));
  };
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(q => q.id)));
  };

  const selectedTotal = filtered.filter(q => selected.has(q.id)).reduce((sum, q) => sum + (q.total || 0), 0);
  const firstCurrency = filtered.find(q => selected.has(q.id))?.currency || "AED";
  const totalAmount = filtered.reduce((s, q) => s + (q.total || 0), 0);
  const totalCurrency = filtered[0]?.currency || "AED";

  const openEdit = (q) => navigate(`/sales/quotes/${q.id}/edit`);
  const openAdd  = () => navigate("/sales/quotes/new");

  const handleDuplicate = (q) => {
    const { id, created_date, updated_date, created_by_id, number, contact_id, contact_name, ...rest } = q;
    navigate("/sales/quotes/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  const handleConvertToInvoice = async (q) => {
    const emptyProblem = itemsError(q?.line_items, "Invoiced");
    if (emptyProblem) { toast({ title: "Line items required", description: emptyProblem, variant: "destructive" }); return; }
    const { id, created_date, updated_date, created_by_id, number, expiry_date, status, ...rest } = q;
    if (q.status !== "Invoiced") {
      const user = await base44.auth.me().catch(() => null);
      const userName = user?.full_name || user?.email || "Unknown";
      await base44.entities.Quote.update(q.id, { status: "Invoiced" });
      await logDocumentHistory({ docType: "quote", docId: q.id, docNumber: q.number, action: "Status Changed", detail: `Status changed from ${q.status} to Invoiced (converted to invoice)`, userName });
      load();
    }
    navigate("/sales/invoices/new", { state: { fromQuote: { ...rest, number: "", issue_date: todayLocalISO(), quote_id: q.id } } });
  };

  const fileCountFor = (q) => (q.annex_photos || []).filter(p => p.include !== false).length + (docFileCounts[q.id] || 0);

  const openSplitDetail = (q) => { setSplitMode("detail"); setSplitId(q.id); setFilesId(null); };
  const openSplitFiles = (q) => { setSplitMode("files"); setFilesId(q.id); setSplitId(null); };
  const closeSplit = () => { setSplitMode(null); setSplitId(null); setFilesId(null); };
  const splitDoc = quotes.find(q => q.id === splitId) || null;
  const filesDoc = quotes.find(q => q.id === filesId) || null;
  const splitIndex = splitId ? sorted.findIndex(q => q.id === splitId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = sorted[splitIndex + dir];
    if (next) setSplitId(next.id);
  };

  const renderTable = (compact) => (
    <div className="min-w-0 max-w-full">
      <div className="overflow-x-auto max-w-full">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading quotes...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No quotes found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterStatus !== "all" ? "Try adjusting your filters." : "Create your first quote to get started."}
            </p>
            {!search && filterStatus === "all" && can("quotes", "can_create") && (
              <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4" /> New Quote
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
                {filterStatus !== "all" && (
                  <th className="px-3 py-3 w-10">
                    <input type="checkbox" className="rounded border-border" checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll} />
                  </th>
                )}
                <th className="px-3 py-3 w-16 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">View</th>
                <SortableTh colKey="customer" label="From" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh colKey="number" label="Number" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                {visibleCols.reference && <SortableTh colKey="reference" label="Reference" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                <SortableTh colKey="dates" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh colKey="expiry" label="Expiry date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-3 py-3 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("amount")}>
                  <span className="inline-flex items-center">Amount<SortIcon sortKey={sortKey} col="amount" sortDir={sortDir} /></span>
                </th>
                {visibleCols.project_wo && <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden lg:table-cell">Project / WO</th>}
                <th className="px-3 py-3 w-16 text-center text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Files</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pagination.pageItems.map((q, idx) => {
                  const expired = isExpired(q);
                  const fc = fileCountFor(q);
                  const isActive = splitMode === "detail" && q.id === splitId;
                  const stripe = "";
                  const isExpanded = expandedIds.has(q.id);
                  const lines = (q.line_items || []).filter(l => l.description || l.unit_price);
                  return (
                    <React.Fragment key={q.id}>
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => openEdit(q)}
                      className={`border-b border-slate-200 dark:border-slate-700 hover:bg-primary/[0.06] transition-colors group cursor-pointer ${isActive ? "bg-primary/10" : stripe}`}>
                      {filterStatus !== "all" && (
                        <td className="px-3 py-3 w-10" onClick={e => { e.stopPropagation(); toggleSelect(q.id, e.shiftKey); }}>
                          <input type="checkbox" className="rounded border-border" checked={selected.has(q.id)} onClick={e => { e.stopPropagation(); toggleSelect(q.id, e.shiftKey); }} readOnly />
                        </td>
                      )}
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          <button type="button" className="h-7 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground" title={isExpanded ? "Hide lines" : "Show lines"} onClick={() => toggleExpanded(q.id)}>
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Preview" onClick={() => setPreview(q)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-3 max-w-[200px]">
                        <span className="text-xs font-semibold text-foreground truncate block">{q.contact_name || "—"}</span>
                      </td>
                      <td className="px-3 py-3" onClick={() => openEdit(q)}><span className="text-xs font-bold text-foreground">{q.number || "—"}</span></td>
                      {visibleCols.reference && <td className="px-3 py-3 max-w-[160px]" onClick={() => openEdit(q)}><p className="text-xs text-foreground truncate">{q.reference || "—"}</p></td>}
                      <td className="px-3 py-3" onClick={() => openEdit(q)}>
                        <span className="flex items-center gap-1 text-xs text-foreground"><Clock className="w-3 h-3 shrink-0 text-muted-foreground" />{fmtDate(q.issue_date)}</span>
                      </td>
                      <td className="px-3 py-3" onClick={() => openEdit(q)}>
                        {q.expiry_date ? (
                          <span className={`flex items-center gap-1 text-xs ${expired ? "text-red-600 font-medium" : "text-foreground"}`}>
                            {expired && <AlertCircle className="w-3 h-3 shrink-0" />}{fmtDate(q.expiry_date)}
                          </span>
                        ) : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right" onClick={() => openEdit(q)}><span className="text-xs font-bold tabular-nums text-foreground">{fmtAmount(q.total, q.currency)}</span></td>
                      {visibleCols.project_wo && (
                        <td className="px-3 py-3 hidden lg:table-cell max-w-[160px]" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col gap-0.5">
                            {q.project_id ? <Link to={`/projects/${q.project_id}`} className="text-xs font-medium text-primary hover:underline truncate">{q.project_name}</Link>
                              : q.project_name ? <span className="text-xs font-medium text-foreground truncate">{q.project_name}</span> : null}
                            {q.work_order_id ? <Link to={`/work-orders/${q.work_order_id}`} className="text-xs text-primary/80 hover:underline truncate">{q.work_order_name}</Link>
                              : q.work_order_name ? <span className="text-xs text-muted-foreground truncate">{q.work_order_name}</span> : null}
                            {!q.project_name && !q.work_order_name && <span className="text-xs text-muted-foreground/40">—</span>}
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => openSplitFiles(q)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fc > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                          title="View annex files">
                          <Paperclip className="w-3.5 h-3.5" />
                          {fc > 0 && <span className="tabular-nums">{fc}</span>}
                        </button>
                      </td>
                    </motion.tr>
                    {isExpanded && (
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-muted/30" onClick={e => e.stopPropagation()}>
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
                                    <td className="py-1 text-right tabular-nums">{fmtAmount(l.unit_price, q.currency)}</td>
                                    <td className="py-1 text-right tabular-nums">{l.tax_rate != null ? `${lineTaxPct(l, q)}%` : "—"}</td>
                                    <td className="py-1 text-right tabular-nums font-medium">{fmtAmount(l.amount ?? l.total ?? ((l.quantity || 0) * (l.unit_price || 0)), q.currency)}</td>
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
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <div className="bg-card px-6 pt-4 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Link to="/sales-overview" className="hover:text-primary transition-colors">Sales overview</Link>
          <ChevronRight className="w-3 h-3" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-3">Quotes</h1>
        <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
          {can("quotes", "can_create") && (
            <Button onClick={openAdd} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 text-xs px-3">
              <Plus className="w-3.5 h-3.5" /> New Quote
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs">
                <Copy className="w-3.5 h-3.5 mr-1.5" /> Settings
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => navigate("/settings/sales")}>Settings</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-stretch gap-0 overflow-x-auto -mb-px">
          {tabs.map(tab => {
            const active = filterStatus === tab.key;
            return (
              <button key={tab.key} onClick={() => handleTabChange(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold whitespace-nowrap border border-b-0 border-slate-300 dark:border-slate-600 transition-colors ${
                  active
                    ? "bg-white dark:bg-slate-900 text-black dark:text-white border-t-2 border-t-primary shadow-sm"
                    : "bg-slate-50 dark:bg-slate-800/60 text-primary dark:text-primary/80 border-transparent hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}>
                {tab.label}
                <span className={`text-xs font-bold ${active ? "text-black dark:text-white" : "text-primary dark:text-primary/70"}`}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Enter a contact, amount, reference or quote number" className="pl-9 bg-muted/40 border-muted" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-[150px] text-xs" />
        <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-[150px] text-xs" />
        <Select value={dateType} onValueChange={setDateType}>
          <SelectTrigger className="w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any date</SelectItem>
            <SelectItem value="transaction">Transaction date</SelectItem>
            <SelectItem value="expiry">Expiry date</SelectItem>
          </SelectContent>
        </Select>
        <SalesFilterPopover filters={filters} onChange={setFilters} onReset={() => setFilters(makeSalesDefaultFilters(QUOTE_DOC_TYPES))} docTypes={QUOTE_DOC_TYPES} overdueLabel="Show expired quotes" />
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Summary + bulk */}
      <div className="bg-slate-100 dark:bg-slate-800 border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs text-muted-foreground tabular-nums">
          {`${filtered.length} items`}
          <span className="ml-2 font-bold text-foreground">{fmtAmount(totalAmount, totalCurrency)}</span>
          {selected.size > 0 && <span className="ml-3 text-primary font-medium">{selected.size} selected · {fmtAmount(selectedTotal, firstCurrency)}</span>}
        </span>
        <div className="flex items-center gap-1.5">
          {filterStatus !== "all" && (
            <>
              {filterStatus === "Invoiced" && (
                <Button size="sm" variant="ghost" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={handleBulkUnmarkInvoiced}>Unmark as invoiced</Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={handleBulkPrint}>Print</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={selected.size === 0} onClick={handleBulkDelete}>Delete</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={handleBulkSend}>Send</Button>
              <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size !== 1} onClick={handleBulkCopyTo}>Copy to</Button>
              {["Draft", "Sent"].includes(filterStatus) && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0 || !filtered.some(q => selected.has(q.id) && ["Draft", "Sent"].includes(q.status))} onClick={handleBulkDecline}>Decline</Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0 || !filtered.some(q => selected.has(q.id) && ["Draft", "Sent"].includes(q.status))} onClick={handleBulkAccept}>Accept</Button>
                </>
              )}
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

      {/* Main: split or full */}
      <div className="flex bg-card" ref={splitWrapRef}>
        {splitMode === "files" && filesDoc && (
          <>
            <div style={{ width: `${filesPct}%`, minWidth: 260, maxWidth: "55%" }} className="min-w-0 flex flex-col shrink-0">
              <SalesFilesViewer doc={filesDoc} docType="quote" onClose={closeSplit} />
            </div>
            <div onMouseDown={startFilesResize} title="Drag to resize" className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors" />
          </>
        )}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {renderTable(splitMode !== null)}
        </div>
        {splitMode === "detail" && (
          <div className="w-[60%] min-w-0 flex flex-col shrink-0">
            <SalesSplitDetail
              doc={splitDoc} kind="quote"
              contact={contacts.find(c => c.id === splitDoc?.contact_id)}
              fileCount={splitDoc ? fileCountFor(splitDoc) : 0}
              onClose={closeSplit}
              onEdit={(q) => openEdit(q)}
              onDuplicate={handleDuplicate}
              onPrint={(q) => handlePrint(q)}
              onPreview={(q) => setPreview(q)}
              onExtra={handleConvertToInvoice}
              extraAction={{ label: "Convert to Invoice", icon: FilePlus2, show: can("invoices", "can_create") && splitDoc?.status === "Accepted" }}
              onPrev={() => navSplit(-1)}
              onNext={() => navSplit(1)}
            />
          </div>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

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