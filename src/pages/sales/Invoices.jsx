import React, { useState, useEffect, useRef } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Search, Clock, AlertCircle, CheckCircle2, Send, Ban,
  RefreshCw, ChevronRight, ChevronDown, X, Eye, Paperclip, FilePlus2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import InvoicePreviewModal from "@/components/sales/InvoicePreviewModal";
import CreditNotePreviewModal from "@/components/sales/CreditNotePreviewModal";
import { pickCreditNoteTemplate } from "@/lib/creditNoteTemplate";
import { compareDateOnly, formatDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { printInvoicePdfFromHtml } from "@/components/sales/invoicePdfFromHtml";
import { logDocumentHistory } from "@/components/sales/DocumentHistoryPanel";
import { itemsError } from "@/lib/lineItemValidation";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { applyRangeToggle } from "@/lib/rangeSelect";
import PdfGeneratingOverlay from "@/components/shared/PdfGeneratingOverlay";
import { useToast } from "@/components/ui/use-toast";
import { retireDocumentNumber } from "@/lib/documentNumbering";
import { reverseDocumentJournal, autoPostJournal, postCreditNoteJournal } from "@/lib/autoPostJournal";
import ColumnToggle from "@/components/shared/ColumnToggle";
import SortIcon, { SortableTh } from "@/components/shared/SortIcon";
import { useSortable } from "@/hooks/useSortable";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import SalesFilterPopover, { makeSalesDefaultFilters } from "@/components/sales/SalesFilterPopover";
import SalesSplitDetail from "@/components/sales/SalesSplitDetail";
import { lineTaxPct } from "@/lib/docTaxSemantics";
import SalesFilesViewer from "@/components/sales/SalesFilesViewer";
import { withRetry } from "@/lib/apiHelpers";

const SORT_FIELD = {
  number: "number",
  reference: "reference",
  customer: "contact_name",
  dates: "issue_date",
  due: "due_date",
  project_wo: "project_name",
  status: "status",
  amount: "total",
  paid: "amount_paid",
};

const STATUS_STYLES = {
  Draft:              "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  "Awaiting Approval":"bg-amber-100 text-amber-700",
  "Awaiting Payment": "bg-blue-100 text-blue-700",
  "Awaiting Application": "bg-blue-100 text-blue-700",
  Paid:               "bg-emerald-100 text-emerald-700",
  Applied:            "bg-emerald-100 text-emerald-700",
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

const INVOICE_DOC_TYPES = [
  { key: "invoices", label: "Invoices" },
  { key: "creditNotes", label: "Credit notes" },
  { key: "prepayments", label: "Prepayments" },
  { key: "overpayments", label: "Overpayments" },
];

// ── Per-type configuration ──────────────────────────────────────────────────
// The merged "Sales documents" list is driven entirely by this object: entity,
// label, editor route, preview modal, valid statuses, status-to-tab mapping and
// the row / bulk actions each document type is allowed to use.
const DOC_TYPES = {
  invoice: {
    key: "invoice",
    label: "Invoice",
    badgeClass: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
    entityName: "Invoice",
    filterKey: "invoices",
    journalType: "Invoice",
    historyDocType: "invoice",
    retireDocType: "invoice",
    postingStatus: "Awaiting Payment",
    postJournal: (doc) => autoPostJournal("Invoice", doc),
    validStatuses: ["Draft", "Awaiting Approval", "Awaiting Payment", "Paid", "Repeating", "Cancelled"],
    tabs: {
      Draft: "Draft",
      "Awaiting Approval": "Awaiting Approval",
      "Awaiting Payment": "Awaiting Payment",
      Paid: "Paid",
      Repeating: "Repeating",
      Cancelled: "Cancelled",
    },
    editorRoute: (id) => `/sales/invoices/${id}/edit`,
    previewModal: InvoicePreviewModal,
    previewProps: (doc, ctx) => ({
      invoice: doc, contact: ctx.contact, template: ctx.invoiceTemplate,
      onPrint: () => ctx.onPrint(doc), onEdit: () => ctx.onEdit(doc),
    }),
    rowActions: ["expand", "preview", "detail", "files", "print", "payments"],
    bulkActions: ["print", "status", "delete"],
    requiresIssueDateFor: ["Awaiting Payment"],
    requiresPaymentFor: ["Paid"],
    dueDateFromIssue: true,
    deleteReason: "invoice deleted",
    deleteConfirm: "Delete this invoice? This action will be permanently recorded in history.",
  },
  credit_note: {
    key: "credit_note",
    label: "Credit note",
    badgeClass: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
    entityName: "CreditNote",
    filterKey: "creditNotes",
    journalType: "CreditNote",
    historyDocType: "credit_note",
    retireDocType: "credit_note",
    postingStatus: "Awaiting Application",
    postJournal: (doc) => postCreditNoteJournal(doc),
    validStatuses: ["Draft", "Awaiting Approval", "Awaiting Application", "Applied", "Cancelled"],
    tabs: {
      Draft: "Draft",
      "Awaiting Application": "Awaiting Payment",
      Applied: "Paid",
      Cancelled: "Cancelled",
    },
    editorRoute: (id) => `/sales/credit-notes/${id}/edit`,
    previewModal: CreditNotePreviewModal,
    previewProps: (doc, ctx) => ({
      creditNote: doc, contact: ctx.contact, template: ctx.creditNoteTemplate,
      onPrint: null, onEdit: () => ctx.onEdit(doc),
    }),
    rowActions: ["preview"],
    bulkActions: ["status", "delete"],
    requiresIssueDateFor: [],
    requiresPaymentFor: [],
    dueDateFromIssue: false,
    deleteReason: "credit note deleted",
    deleteConfirm: "Delete this credit note? Its journal entry will be reversed and its number retired.",
  },
};

// Bulk status actions per tab. Each action declares, per document type, the
// target status and the statuses it may be applied from — so a mixed selection
// is updated type by type and the rest is reported as skipped.
const TAB_BULK_ACTIONS = {
  Draft: [
    { key: "submit", label: "Submit for Approval", confirm: (n) => `Submit ${n} invoice(s) for approval?`,
      types: { invoice: { to: "Awaiting Approval", from: ["Draft"] } } },
    { key: "approve", label: "Approve", style: "dark", confirm: (n) => `Mark ${n} invoice(s) as Awaiting Payment?`,
      types: { invoice: { to: "Awaiting Payment", from: ["Draft"] } } },
  ],
  "Awaiting Approval": [
    { key: "revert", label: "Revert to Draft", confirm: (n) => `Revert ${n} invoice(s) to Draft?`,
      types: { invoice: { to: "Draft", from: ["Awaiting Approval"] } } },
    { key: "approve", label: "Approve", style: "dark", confirm: (n) => `Approve ${n} invoice(s)?`,
      types: { invoice: { to: "Awaiting Payment", from: ["Awaiting Approval"] } } },
  ],
  "Awaiting Payment": [
    { key: "markPaid", label: "Mark as Paid", style: "emerald", confirm: (n) => `Mark ${n} invoice(s) as Paid?`,
      types: { invoice: { to: "Paid", from: ["Awaiting Payment"] } } },
    { key: "markApplied", label: "Mark as Applied", style: "emerald", confirm: (n) => `Mark ${n} credit note(s) as Applied?`,
      types: { credit_note: { to: "Applied", from: ["Awaiting Application"] } } },
  ],
};

const allows = (doc, action) => (DOC_TYPES[doc?.doc_type]?.rowActions || []).includes(action);
const allowsBulk = (doc, action) => (DOC_TYPES[doc?.doc_type]?.bulkActions || []).includes(action);
const tabKeyFor = (doc) => {
  const cfg = DOC_TYPES[doc?.doc_type];
  if (!cfg || !cfg.validStatuses.includes(doc.status)) return null;
  return cfg.tabs[doc.status] || null;
};
const groupByType = (list) => list.reduce((acc, d) => { (acc[d.doc_type] ||= []).push(d); return acc; }, {});

function fmtDate(d) {
  if (!d) return "—";
  return formatDateOnly(d);
}
function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + currency;
}
function getAmountPaid(inv) {
  if (inv.amount_paid) return inv.amount_paid;
  return (inv.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
}
function isOverdue(inv) {
  if (!inv.due_date || inv.status === "Paid" || inv.status === "Cancelled") return false;
  return compareDateOnly(inv.due_date, todayLocalISO()) < 0;
}

// Lightweight list: line items (about 80% of the payload) load on demand.
const LIST_FIELDS = ["number","reference","title","doc_summary","quote_id","contact_id","contact_name","status","issue_date","due_date","currency","incoterm","subtotal","discount_total","tax_amount","total","exchange_rate","base_total","amount_paid","notes","terms","project_id","project_name","work_order_id","work_order_name","task_ids","task_names","task_references","payments","annex_photos","created_date","updated_date","created_by_id","created_by","is_sample","series"];

// Both document types are listed by default in the merged view.
const makeDefaultFilters = () => {
  const base = makeSalesDefaultFilters(INVOICE_DOC_TYPES);
  return { ...base, docTypes: { ...base.docTypes, creditNotes: true } };
};

export default function Invoices() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [docs, setDocs] = useState([]);
  const { can } = usePermissionsMatrix();
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [docFileCounts, setDocFileCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(null);
  const [search, setSearch] = usePersistedSearch("invoices");
  const [filterStatus, setFilterStatus] = useState("all");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(null);
  const selectionAnchorRef = useRef(null);
  const { sortKey, sortDir, handleSort } = useSortable("issue_date", "desc");

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [dateType, setDateType] = useState("any");
  const [filters, setFilters] = useState(makeDefaultFilters);

  const [splitMode, setSplitMode] = useState(null);
  const [splitId, setSplitId] = useState(null);
  const [filesId, setFilesId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());
  const [fullMap, setFullMap] = useState({});
  const fullRef = useRef({});
  const hydrate = async (doc) => {
    if (!doc || Array.isArray(doc.line_items)) return doc;
    const cfg = DOC_TYPES[doc.doc_type];
    if (!cfg) return doc;
    if (fullRef.current[doc.id]) return fullRef.current[doc.id];
    try {
      const f = await base44.entities[cfg.entityName].get(doc.id);
      const withType = { ...f, doc_type: doc.doc_type };
      fullRef.current[doc.id] = withType;
      setFullMap(p => ({ ...p, [doc.id]: withType }));
      return withType;
    } catch { return doc; }
  };
  const toggleExpanded = (id) => {
    setExpandedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const doc = docs.find(x => x.id === id);
    if (doc) hydrate(doc);
  };
  const openPreview = async (doc) => { setPreview(await hydrate(doc)); };
  const [filesPct, setFilesPct] = useState(() => { const v = Number(localStorage.getItem("invoices_files_pct")); return v >= 20 && v <= 50 ? v : 35; });
  const splitWrapRef = useRef(null);
  const startFilesResize = (e) => {
    e.preventDefault();
    const box = splitWrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev) => setFilesPct(Math.min(50, Math.max(20, ((ev.clientX - box.left) / box.width) * 100)));
    const up = () => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      setFilesPct(p => { localStorage.setItem("invoices_files_pct", String(Math.round(p))); return p; });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "project_wo", label: "Project / WO", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("invoices_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, project_wo: false };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("invoices_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const [inv, cns, c, tmpl, df] = await Promise.all([
      withRetry(() => base44.entities.Invoice.list("-created_date", 5000, 0, LIST_FIELDS)),
      withRetry(() => base44.entities.CreditNote.list("-created_date", 5000)),
      withRetry(() => base44.entities.Contact.list("full_name", 500)).catch(() => []),
      withRetry(() => base44.entities.DocumentTemplate.list("-created_date", 50)).then(l => (l || []).filter(t => !(t.name || "").startsWith("__"))).catch(() => []),
      withRetry(() => base44.entities.DocumentFile.filter({ doc_type: "invoice" }, "created_date", 5000)).catch(() => []),
    ]);
    setDocs([
      ...(inv || []).map(d => ({ ...d, doc_type: "invoice" })),
      ...(cns || []).map(d => ({ ...d, doc_type: "credit_note" })),
    ]);
    setContacts(c);
    setTemplates(tmpl);
    const counts = {};
    (df || []).forEach(f => { counts[f.doc_id] = (counts[f.doc_id] || 0) + 1; });
    setDocFileCounts(counts);
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

  const handlePrint = async (doc, e) => {
    e?.stopPropagation();
    if (!allows(doc, "print")) return;
    setPrinting(doc.id);
    const template = getTemplate();
    let fresh = doc;
    if (doc?.id) {
      try { fresh = await base44.entities.Invoice.get(doc.id); } catch { fresh = doc; }
    }
    const contact = contacts.find(c => c.id === fresh.contact_id);
    await printInvoicePdfFromHtml({ invoice: fresh, contact, template });
    setPrinting(null);
  };

  const tabs = React.useMemo(() => {
    const counts = {};
    docs.forEach(d => { const k = tabKeyFor(d); if (k) counts[k] = (counts[k] || 0) + 1; });
    return [
      { key: "all",                label: "All",               count: docs.length },
      { key: "Draft",              label: "Draft",             count: counts["Draft"] || 0 },
      { key: "Awaiting Approval",  label: "Awaiting Approval", count: counts["Awaiting Approval"] || 0 },
      { key: "Awaiting Payment",   label: "Awaiting Payment",  count: counts["Awaiting Payment"] || 0 },
      { key: "Paid",               label: "Paid",              count: counts["Paid"] || 0 },
      { key: "Repeating",          label: "Repeating",         count: counts["Repeating"] || 0 },
      { key: "Cancelled",          label: "Cancelled",         count: counts["Cancelled"] || 0 },
    ];
  }, [docs]);

  const handleTabChange = (key) => { setFilterStatus(key); setSelected(new Set()); };

  const filtered = React.useMemo(() => {
    const s = search.toLowerCase();
    return docs.filter(doc => {
      const cfg = DOC_TYPES[doc.doc_type];
      if (!cfg) return false;
      const matchSearch = !search ||
        doc.number?.toLowerCase().includes(s) ||
        doc.reference?.toLowerCase().includes(s) ||
        doc.contact_name?.toLowerCase().includes(s) ||
        String(doc.total || "").includes(s);
      const tabKey = tabKeyFor(doc);
      const matchStatus = filterStatus === "all" || tabKey === filterStatus;

      if (!filters.docTypes[cfg.filterKey]) return false;
      if (filters.showOverdue && !isOverdue(doc)) return false;
      if (!filters.deletedVoided && doc.status === "Cancelled" && filterStatus !== "Cancelled") return false;

      if (dateStart || dateEnd) {
        const dates = [];
        if (dateType === "any" || dateType === "transaction") dates.push(doc.issue_date);
        if (dateType === "any" || dateType === "due") dates.push(doc.due_date);
        if (dateType === "any" || dateType === "paid") {
          (doc.payments || []).forEach(p => p.date && dates.push(p.date));
        }
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
  }, [docs, search, filterStatus, dateStart, dateEnd, dateType, filters]);

  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    const field = SORT_FIELD[sortKey];
    const numeric = sortKey === "amount" || sortKey === "paid";
    return [...filtered].sort((a, b) => {
      const av = a[field] ?? "";
      const bv = b[field] ?? "";
      let cmp;
      if (sortKey === "paid") {
        cmp = (Number(getAmountPaid(a)) || 0) - (Number(getAmountPaid(b)) || 0);
      } else if (numeric) {
        cmp = (Number(av) || 0) - (Number(bv) || 0);
      } else {
        cmp = String(av).toLowerCase().localeCompare(String(bv).toLowerCase(), undefined, { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const pagination = useTablePagination(sorted);

  const handleDelete = async (id) => {
    const doc = docs.find(x => x.id === id);
    if (!doc) return;
    const cfg = DOC_TYPES[doc.doc_type];
    if (!confirm(cfg.deleteConfirm)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await logDocumentHistory({ docType: cfg.historyDocType, docId: null, docNumber: doc.number || id, action: "Deleted", detail: `${cfg.label} ${doc.number || id} deleted (${doc.contact_name || ""}). Number retired.`, userName });
    await reverseDocumentJournal(cfg.journalType, id, cfg.deleteReason).catch(err => console.error(err));
    if (doc.number) await retireDocumentNumber(cfg.retireDocType, doc.number, id, cfg.deleteReason);
    await base44.entities[cfg.entityName].delete(id);
    toast({ title: `${cfg.label} deleted`, description: doc.number ? `${doc.number} has been retired and cannot be reused.` : `${cfg.label} deleted.` });
    load();
  };

  const openEdit = (doc) => navigate(DOC_TYPES[doc.doc_type].editorRoute(doc.id));
  const openAdd  = () => navigate("/sales/invoices/new");

  const handleDuplicate = async (doc0) => {
    const inv = await hydrate(doc0);
    const { id, created_date, updated_date, created_by_id, doc_type, number, contact_id, contact_name, ...rest } = inv;
    navigate("/sales/invoices/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  const handleDuplicateAsQuote = async (doc0) => {
    const inv = await hydrate(doc0);
    const { id, created_date, updated_date, created_by_id, doc_type, number, due_date, contact_id, contact_name, ...rest } = inv;
    navigate("/sales/quotes/new", { state: { duplicate: { ...rest, status: "Draft", number: "", contact_id: "", contact_name: "" } } });
  };

  const toggleSelect = (id, shiftKey = false) => {
    setSelected(prev => applyRangeToggle(prev, filtered.map(it => it.id), id, shiftKey, selectionAnchorRef));
  };
  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(i => i.id)));
  };

  const selectedDocs = () => [...selected].map(id => docs.find(x => x.id === id)).filter(Boolean);

  const bulkChangeStatus = async (action) => {
    const sel = selectedDocs();
    const targets = sel.filter(d => {
      if (!allowsBulk(d, "status")) return false;
      const rule = action.types[d.doc_type];
      return rule && rule.from.includes(d.status);
    });
    const skipped = sel.length - targets.length;
    if (!targets.length) {
      toast({ title: "Nothing to update", description: "None of the selected documents can be moved by this action.", variant: "destructive" });
      return;
    }
    if (!confirm(action.confirm(targets.length))) return;

    // Documents without a real line item cannot be activated — report them instead of saving.
    const full = await Promise.all(targets.map(d => hydrate(d)));
    const emptyDocs = full.filter(d => d && itemsError(d.line_items, action.types[d.doc_type].to));
    if (emptyDocs.length) {
      toast({ title: "Line items required", description: `${emptyDocs.length} document(s) have no line item: ${emptyDocs.slice(0, 5).map(x => x.number || x.id).join(", ")}${emptyDocs.length > 5 ? "…" : ""}`, variant: "destructive" });
      return;
    }
    const unpaid = full.filter(d => DOC_TYPES[d.doc_type].requiresPaymentFor.includes(action.types[d.doc_type].to) && (Number(d.amount_paid) || 0) < (Number(d.total) || 0) - 0.005);
    if (unpaid.length) {
      toast({ title: "Payment required", description: `${unpaid.length} invoice(s) have no payment covering the total. Record the payment first (it creates the bank line and journal).`, variant: "destructive" });
      return;
    }
    let issueDateForUndated = null;
    const undated = full.filter(d => DOC_TYPES[d.doc_type].requiresIssueDateFor.includes(action.types[d.doc_type].to) && !d.issue_date);
    if (undated.length) {
      const today = todayLocalISO();
      const v = prompt(`${undated.length} invoice(s) have no issue date. Enter the issue date (YYYY-MM-DD) to use:`, today);
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) { toast({ title: "Cancelled", description: "A valid issue date is required to approve undated invoices.", variant: "destructive" }); return; }
      issueDateForUndated = v.trim();
    }

    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    await Promise.all(full.map(async d => {
      const cfg = DOC_TYPES[d.doc_type];
      const rule = action.types[d.doc_type];
      const patch = { status: rule.to };
      if (issueDateForUndated && !d.issue_date) {
        patch.issue_date = issueDateForUndated;
        if (cfg.dueDateFromIssue && !d.due_date) patch.due_date = issueDateForUndated;
      }
      const updated = await base44.entities[cfg.entityName].update(d.id, patch);
      await logDocumentHistory({ docType: cfg.historyDocType, docId: d.id, docNumber: d.number, action: "Status Changed", detail: `Status changed from ${d.status} to ${rule.to}`, userName });
      if (rule.to === cfg.postingStatus && d.status !== cfg.postingStatus) {
        await cfg.postJournal({ ...d, ...updated, id: d.id }).catch(err => console.error(err));
      }
    }));
    setSelected(new Set());
    load();
    if (skipped > 0) {
      toast({ title: `${targets.length} document(s) updated`, description: `${skipped} selected document(s) were skipped — this action does not apply to their type or status.` });
    }
  };

  const handleBulkDelete = async () => {
    if (deleting) return;
    const targets = selectedDocs().filter(d => allowsBulk(d, "delete"));
    if (!targets.length) return;
    if (!confirm(`Delete ${targets.length} document(s)? This cannot be undone.`)) return;
    const user = await base44.auth.me().catch(() => null);
    const userName = user?.full_name || user?.email || "Unknown";
    const total = targets.length;
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    const failed = [];
    let done = 0;
    setDeleting({ done: 0, total });
    try {
      for (const [type, list] of Object.entries(groupByType(targets))) {
        const cfg = DOC_TYPES[type];
        const entity = base44.entities[cfg.entityName];
        const ids = list.map(d => d.id);
        const byId = new Map(list.map(d => [d.id, d]));
        // 1) Only documents that actually have posted journals / payment bank lines need reversing: find them in bulk.
        const withJournal = new Set();
        for (const part of chunk(ids, 100)) {
          const entries = await base44.entities.JournalEntry.filter({ source_type: cfg.journalType, source_id: { $in: part }, status: "Posted" }, undefined, 1000).catch(() => []);
          entries.forEach(j => j.source_id && withJournal.add(j.source_id));
          const txs = await base44.entities.BankTransaction.filter({ source_id: { $in: part } }, undefined, 1000).catch(() => []);
          txs.forEach(t => t.source_id && withJournal.add(t.source_id));
        }
        const toReverse = ids.filter(id => withJournal.has(id));
        for (const part of chunk(toReverse, 6)) {
          await Promise.all(part.map(id => reverseDocumentJournal(cfg.journalType, id, cfg.deleteReason).catch(err => { console.error(err); failed.push(byId.get(id)?.number || id); })));
        }
        const okIds = ids.filter(id => !failed.includes(byId.get(id)?.number || id));
        // 2) One server-side batch delete per 50 records, with a per-record fallback only if a batch fails.
        for (const part of chunk(okIds, 50)) {
          try { await entity.deleteMany({ id: { $in: part } }); }
          catch (err) {
            console.error(err);
            for (const id of part) { try { await entity.delete(id); } catch (e2) { failed.push(byId.get(id)?.number || id); } }
          }
          // 3) Audit trail and retired numbers in bulk.
          const deletedPart = part.filter(id => !failed.includes(byId.get(id)?.number || id));
          try {
            await base44.entities.DocumentHistory.bulkCreate(deletedPart.map(id => ({ doc_type: cfg.historyDocType, doc_id: null, doc_number: byId.get(id)?.number || id, action: "Deleted", detail: `${cfg.label} ${byId.get(id)?.number || id} deleted. Number retired.`, user_name: userName, note: "" })));
            await base44.entities.RetiredDocumentNumber.bulkCreate(deletedPart.filter(id => byId.get(id)?.number).map(id => { const n = byId.get(id).number; return { doc_type: cfg.retireDocType, number: n, year: parseInt((n.match(/-(\d{4})-/) || [])[1] || new Date().getFullYear(), 10), prefix: (n.split("-")[0] || "").trim(), doc_id: id, reason: cfg.deleteReason }; }));
          } catch (err) { console.error(err); }
          done += part.length;
          const gone = new Set(deletedPart);
          setDocs(prev => prev.filter(x => !gone.has(x.id)));
          setSelected(prev => { const n = new Set(prev); gone.forEach(i => n.delete(i)); return n; });
          setDeleting({ done, total });
        }
      }
    } catch (err) {
      console.error(err);
      toast({ title: "Delete stopped", description: String(err?.message || err), variant: "destructive" });
    }
    setDeleting(null);
    toast({
      title: `${total - failed.length} of ${total} document(s) deleted`,
      description: failed.length ? `Could not delete: ${failed.slice(0, 10).join(", ")}${failed.length > 10 ? "..." : ""}` : "Numbers retired and cannot be reused.",
      variant: failed.length ? "destructive" : undefined,
    });
    load();
  };

  const handleBulkPrint = async () => {
    const sel = selectedDocs();
    const printable = sel.filter(d => allowsBulk(d, "print"));
    for (const doc of printable) await handlePrint(doc);
    const skipped = sel.length - printable.length;
    if (skipped > 0) {
      toast({ title: `Printing ${printable.length} document(s)`, description: `${skipped} selected credit note(s) were skipped — PDF print is available on invoices only.` });
    }
  };

  const selectedTotal = filtered.filter(i => selected.has(i.id)).reduce((sum, i) => sum + (i.total || 0), 0);
  const firstCurrency = filtered.find(i => selected.has(i.id))?.currency || "AED";
  const totalAmount = filtered.reduce((s, i) => s + (i.total || 0), 0);
  const totalCurrency = filtered[0]?.currency || "AED";

  const fileCountFor = (doc) => (doc.annex_photos || []).filter(p => p.include !== false).length + (docFileCounts[doc.id] || 0);

  const openSplitDetail = (doc) => { setSplitMode("detail"); setSplitId(doc.id); setFilesId(null); };
  const openSplitFiles = (doc) => { setSplitMode("files"); setFilesId(doc.id); setSplitId(null); };
  const closeSplit = () => { setSplitMode(null); setSplitId(null); setFilesId(null); };
  const splitLite = docs.find(i => i.id === splitId) || null;
  useEffect(() => { if (splitLite && !Array.isArray(splitLite.line_items)) hydrate(splitLite); }, [splitId]);
  const splitDoc = splitLite ? (fullMap[splitLite.id] || splitLite) : null;
  const filesDoc = docs.find(i => i.id === filesId) || null;
  const splitIndex = splitId ? sorted.findIndex(i => i.id === splitId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = sorted[splitIndex + dir];
    if (next) setSplitId(next.id);
  };

  const previewCtx = (doc) => ({
    contact: contacts.find(c => c.id === doc?.contact_id),
    invoiceTemplate: getTemplate(),
    creditNoteTemplate: pickCreditNoteTemplate(templates),
    onPrint: (d) => handlePrint(d),
    onEdit: (d) => { setPreview(null); navigate(DOC_TYPES[d.doc_type].editorRoute(d.id)); },
  });

  const renderTable = () => (
    <div className="min-w-0 max-w-full">
      <div className="overflow-x-auto max-w-full">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading invoices and credit notes...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No documents found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterStatus !== "all" ? "Try adjusting your filters." : "Create your first invoice or credit note to get started."}
            </p>
            {!search && filterStatus === "all" && can("invoices", "can_create") && (
              <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4" /> New Invoice
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
                <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Type</th>
                <SortableTh colKey="customer" label="From" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh colKey="number" label="Number" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                {visibleCols.reference && <SortableTh colKey="reference" label="Reference" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                <SortableTh colKey="dates" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <SortableTh colKey="due" label="Due date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                <th className="px-3 py-3 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("paid")}>
                  <span className="inline-flex items-center">Paid<SortIcon sortKey={sortKey} col="paid" sortDir={sortDir} /></span>
                </th>
                <th className="px-3 py-3 text-right text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("amount")}>
                  <span className="inline-flex items-center">Due<SortIcon sortKey={sortKey} col="amount" sortDir={sortDir} /></span>
                </th>
                <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Status</th>
                {visibleCols.project_wo && <th className="px-3 py-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider hidden lg:table-cell">Project / WO</th>}
                <th className="px-3 py-3 w-16 text-center text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Files</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pagination.pageItems.map((doc) => {
                  const cfg = DOC_TYPES[doc.doc_type];
                  const overdue = isOverdue(doc);
                  const paid = getAmountPaid(doc);
                  const due = (doc.total || 0) - paid;
                  const fc = fileCountFor(doc);
                  const isActive = splitMode === "detail" && doc.id === splitId;
                  const canExpand = allows(doc, "expand");
                  const isExpanded = canExpand && expandedIds.has(doc.id);
                  const lines = ((fullMap[doc.id] || doc).line_items || []).filter(l => l.description || l.unit_price);
                  const linesLoading = isExpanded && !Array.isArray((fullMap[doc.id] || doc).line_items);
                  return (
                    <React.Fragment key={doc.id}>
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => openEdit(doc)}
                      className={`border-b border-slate-200 dark:border-slate-700 hover:bg-primary/[0.06] transition-colors group cursor-pointer ${isActive ? "bg-primary/10" : ""}`}>
                      {filterStatus !== "all" && (
                        <td className="px-3 py-3 w-10" onClick={e => { e.stopPropagation(); toggleSelect(doc.id, e.shiftKey); }}>
                          <input type="checkbox" className="rounded border-border" checked={selected.has(doc.id)} onClick={e => { e.stopPropagation(); toggleSelect(doc.id, e.shiftKey); }} readOnly />
                        </td>
                      )}
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-0.5">
                          {canExpand && (
                            <button type="button" className="h-7 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground" title={isExpanded ? "Hide lines" : "Show lines"} onClick={() => toggleExpanded(doc.id)}>
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </button>
                          )}
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Preview" onClick={() => openPreview(doc)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-3" onClick={() => openEdit(doc)}>
                        <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${cfg.badgeClass}`}>{cfg.label}</span>
                      </td>
                      <td className="px-3 py-3 max-w-[200px]">
                        <span className="text-xs font-semibold text-foreground truncate block">{doc.contact_name || "—"}</span>
                      </td>
                      <td className="px-3 py-3" onClick={() => openEdit(doc)}><span className="text-xs font-bold text-foreground">{doc.number || "—"}</span></td>
                      {visibleCols.reference && <td className="px-3 py-3 max-w-[160px]" onClick={() => openEdit(doc)}><p className="text-xs text-foreground truncate">{doc.reference || "—"}</p></td>}
                      <td className="px-3 py-3" onClick={() => openEdit(doc)}>
                        <span className="flex items-center gap-1 text-xs text-foreground"><Clock className="w-3 h-3 shrink-0 text-muted-foreground" />{doc.issue_date ? fmtDate(doc.issue_date) : (["Draft","Awaiting Approval"].includes(doc.status) ? <span className="italic text-muted-foreground">Sin fecha (borrador)</span> : "—")}</span>
                      </td>
                      <td className="px-3 py-3" onClick={() => openEdit(doc)}>
                        {doc.due_date ? (
                          <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-medium" : "text-foreground"}`}>
                            {overdue && <AlertCircle className="w-3 h-3 shrink-0" />}{fmtDate(doc.due_date)}
                          </span>
                        ) : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right" onClick={() => openEdit(doc)}>
                        <span className="text-xs font-medium tabular-nums text-foreground">{allows(doc, "payments") ? fmtAmount(paid, doc.currency) : "—"}</span>
                      </td>
                      <td className="px-3 py-3 text-right" onClick={() => openEdit(doc)}><span className="text-xs font-bold tabular-nums text-foreground">{fmtAmount(due, doc.currency)}</span></td>
                      <td className="px-3 py-3" onClick={() => openEdit(doc)}>
                        <span className={`inline-flex items-center whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[doc.status] || "bg-muted text-muted-foreground"}`}>{doc.status}</span>
                      </td>
                      {visibleCols.project_wo && (
                        <td className="px-3 py-3 hidden lg:table-cell max-w-[160px]" onClick={e => e.stopPropagation()}>
                          <div className="flex flex-col gap-0.5">
                            {doc.project_id ? <Link to={`/projects/${doc.project_id}`} className="text-xs font-medium text-primary hover:underline truncate">{doc.project_name}</Link>
                              : doc.project_name ? <span className="text-xs font-medium text-foreground truncate">{doc.project_name}</span> : null}
                            {doc.work_order_id ? <Link to={`/work-orders/${doc.work_order_id}`} className="text-xs text-primary/80 hover:underline truncate">{doc.work_order_name}</Link>
                              : doc.work_order_name ? <span className="text-xs text-muted-foreground truncate">{doc.work_order_name}</span> : null}
                            {!doc.project_name && !doc.work_order_name && <span className="text-xs text-muted-foreground/40">—</span>}
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        {allows(doc, "files") ? (
                          <button type="button" onClick={() => openSplitFiles(doc)}
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fc > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                            title="View annex files">
                            <Paperclip className="w-3.5 h-3.5" />
                            {fc > 0 && <span className="tabular-nums">{fc}</span>}
                          </button>
                        ) : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                    </motion.tr>
                    {isExpanded && (
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-muted/30" onClick={e => e.stopPropagation()}>
                        <td colSpan={20} className="px-6 py-2">
                          {linesLoading ? <p className="text-xs text-muted-foreground">Loading line items...</p> : lines.length === 0 ? <p className="text-xs text-muted-foreground">No line items</p> : (
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
                                    <td className="py-1 text-right tabular-nums">{fmtAmount(l.unit_price, doc.currency)}</td>
                                    <td className="py-1 text-right tabular-nums">{l.tax_rate != null ? `${lineTaxPct(l, doc)}%` : "—"}</td>
                                    <td className="py-1 text-right tabular-nums font-medium">{fmtAmount(l.amount ?? l.total ?? ((l.quantity || 0) * (l.unit_price || 0)), doc.currency)}</td>
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
        {/* Breadcrumb + title */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
          <Link to="/sales-overview" className="hover:text-primary transition-colors">Sales overview</Link>
          <ChevronRight className="w-3 h-3" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-3">Sales documents</h1>

        {/* Action buttons row */}
        <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
          {can("invoices", "can_create") && (
            <div className="flex items-center">
              <Button onClick={openAdd} className="rounded-r-none gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 text-xs px-3">
                <Plus className="w-3.5 h-3.5" /> New Invoice
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button className="rounded-l-none border-l border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 px-2">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={() => navigate("/sales/invoices/new", { state: { initial: { status: "Repeating" } } })}>
                    <RefreshCw className="w-4 h-4 mr-2" /> New Repeating Invoice
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("/sales/credit-notes/new")}>
                    <FileText className="w-4 h-4 mr-2" /> New Credit Note
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/sales/invoices/new", { state: { initial: { status: "Repeating" } } })}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> New Repeating Invoice
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/sales/credit-notes/new")}>
            <FileText className="w-3.5 h-3.5 mr-1.5" /> New Credit Note
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/sales/statements")}>
            <Send className="w-3.5 h-3.5 mr-1.5" /> Send Statements
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/settings/import-center")}>
            <FilePlus2 className="w-3.5 h-3.5 mr-1.5" /> Import
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => navigate("/settings/data-export")}>
            <FileText className="w-3.5 h-3.5 mr-1.5" /> Export
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Invoice Reminders: On
          </Button>
        </div>

        {/* Tab navigation - Xero box style */}
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
          <Input placeholder="Enter a contact, amount, reference, invoice or credit note number" className="pl-9 bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>}
        </div>
        <Input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)} className="w-[150px] text-xs" />
        <Input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)} className="w-[150px] text-xs" />
        <Select value={dateType} onValueChange={setDateType}>
          <SelectTrigger className="w-[150px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Any date</SelectItem>
            <SelectItem value="transaction">Transaction date</SelectItem>
            <SelectItem value="due">Due date</SelectItem>
            <SelectItem value="paid">Paid date</SelectItem>
          </SelectContent>
        </Select>
        <SalesFilterPopover filters={filters} onChange={setFilters} onReset={() => setFilters(makeDefaultFilters())} docTypes={INVOICE_DOC_TYPES} overdueLabel="Show overdue invoices" />
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
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={handleBulkPrint}>Print</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={selected.size === 0 || !!deleting} onClick={handleBulkDelete}>{deleting ? `Deleting ${deleting.done}/${deleting.total}...` : "Delete"}</Button>
              {(TAB_BULK_ACTIONS[filterStatus] || []).map(action => (
                <Button key={action.key} size="sm" variant={action.style ? "default" : "outline"}
                  className={`h-7 text-xs px-3 ${action.style === "dark" ? "bg-slate-800 hover:bg-slate-900 text-white" : action.style === "emerald" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""}`}
                  disabled={selected.size === 0} onClick={() => bulkChangeStatus(action)}>
                  {action.label}
                </Button>
              ))}
            </>
          )}
        </div>
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card" ref={splitWrapRef}>
        {splitMode === "files" && filesDoc && (
          <>
            <div style={{ width: `${filesPct}%`, minWidth: 260, maxWidth: "55%" }} className="min-w-0 flex flex-col shrink-0">
              <SalesFilesViewer doc={filesDoc} docType="invoice" onClose={closeSplit} />
            </div>
            <div onMouseDown={startFilesResize} title="Drag to resize" className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors" />
          </>
        )}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {renderTable()}
        </div>
        {splitMode === "detail" && (
          <div className="w-[60%] min-w-0 flex flex-col shrink-0">
            <SalesSplitDetail
              doc={splitDoc} kind="invoice"
              contact={contacts.find(c => c.id === splitDoc?.contact_id)}
              fileCount={splitDoc ? fileCountFor(splitDoc) : 0}
              onClose={closeSplit}
              onEdit={(inv) => openEdit(inv)}
              onDuplicate={handleDuplicate}
              onPrint={(inv) => handlePrint(inv)}
              onPreview={(inv) => openPreview(inv)}
              onExtra={handleDuplicateAsQuote}
              extraAction={{ label: "Copy to Quote", icon: FilePlus2, show: can("quotes", "can_create") }}
              onPrev={() => navSplit(-1)}
              onNext={() => navSplit(1)}
            />
          </div>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

      {Object.entries(DOC_TYPES).map(([type, cfg]) => {
        const doc = preview && preview.doc_type === type ? preview : null;
        const Modal = cfg.previewModal;
        return (
          <Modal
            key={type}
            open={!!doc}
            onClose={() => setPreview(null)}
            {...(doc ? cfg.previewProps(doc, previewCtx(doc)) : {})}
          />
        );
      })}

      <PdfGeneratingOverlay active={!!printing} label="Generating Invoice PDF" />
    </div>
  );
}