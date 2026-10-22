import { assignOfficialNumber } from "@/lib/assignNumber";
import { ChevronDown as ChevronDownIcon } from "lucide-react";
import React, { useState, useEffect, useRef } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { compareDateOnly, formatDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Search, Clock,
  AlertCircle, CheckCircle2, Send, Ban, RefreshCw, ChevronRight, X, Eye, Paperclip, Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { printBillPdfFromHtml } from "@/components/purchasing/billPdfFromHtml";


import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { applyRangeToggle } from "@/lib/rangeSelect";
import { itemsError } from "@/lib/lineItemValidation";
import ColumnToggle from "@/components/shared/ColumnToggle";
import SortIcon, { SortableTh } from "@/components/shared/SortIcon";
import { useSortable } from "@/hooks/useSortable";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { retireDocumentNumber } from "@/lib/documentNumbering";
import { reverseDocumentJournal, autoPostJournal } from "@/lib/autoPostJournal";
import BillsFilterPopover, { defaultBillFilters } from "@/components/purchasing/BillsFilterPopover";
import BillSplitDetail from "@/components/purchasing/BillSplitDetail";
import BillFilesViewer from "@/components/purchasing/BillFilesViewer";

const SORT_FIELD = {
  reference: "reference",
  supplier: "contact_name",
  dates: "issue_date",
  due: "due_date",
  status: "status",
  paid: "amount_paid",
};

const STATUS_STYLES = {
  Draft:               "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  "Awaiting Approval": "bg-amber-100 text-amber-700",
  "Awaiting Payment":  "bg-emerald-100 text-emerald-700",
  Paid:                "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  Repeating:           "bg-violet-100 text-violet-700",
  Cancelled:           "bg-orange-100 text-orange-600",
};

const STATUS_ICONS = {
  Draft: FileText,
  "Awaiting Approval": AlertCircle,
  "Awaiting Payment":  Send,
  Paid:                CheckCircle2,
  Repeating:           RefreshCw,
  Cancelled:           Ban,
};

function fmtDate(d) {
  if (!d) return "—";
  return formatDateOnly(d);
}
function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + currency;
}
function getAmountPaid(b) {
  if (b.amount_paid) return b.amount_paid;
  return (b.payments || []).reduce((s, p) => s + (p.amount || 0), 0);
}
function isOverdue(b) {
  if (!b.due_date || b.status === "Paid" || b.status === "Cancelled") return false;
  return compareDateOnly(b.due_date, todayLocalISO()) < 0;
}

const STATUS_TEXT = {
  Draft:               "text-slate-500 dark:text-slate-400",
  "Awaiting Approval": "text-amber-600 dark:text-amber-500",
  "Awaiting Payment":  "text-emerald-600 dark:text-emerald-500",
  Paid:                "text-slate-500 dark:text-slate-400",
  Repeating:           "text-violet-600 dark:text-violet-500",
  Cancelled:           "text-orange-600 dark:text-orange-500",
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold ${STATUS_TEXT[status] || "text-muted-foreground"}`}>
      {status}
    </span>
  );
}

export default function Bills() {
  const location = useLocation();
  const navigate = useNavigate();
  const [bills, setBills] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [docFileCounts, setDocFileCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(null);
  const { toast } = useToast();
  const [search, setSearch] = usePersistedSearch("bills");
  const [filterStatus, setFilterStatus] = useState("all");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [deleting, setDeleting] = useState(null);
  const selectionAnchorRef = useRef(null);
  const { sortKey, sortDir, handleSort } = useSortable("issue_date", "desc");
  const { can } = usePermissionsMatrix();

  // Date range filter
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [dateType, setDateType] = useState("any");

  // Advanced filter
  const [filters, setFilters] = useState(defaultBillFilters);

  // Split view
  const [splitMode, setSplitMode] = useState(null); // null | 'detail' | 'files'
  const [filesPct, setFilesPct] = useState(() => { const v = Number(localStorage.getItem("bills_files_pct")); return v >= 20 && v <= 50 ? v : 35; });
  const [detailPct, setDetailPct] = useState(() => { const v = Number(localStorage.getItem("bills_detail_pct")); return v >= 30 && v <= 60 ? v : 55; });
  const splitWrapRef = useRef(null);
  const startResize = (mode) => (e) => {
    e.preventDefault();
    const box = splitWrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev) => {
      const x = ((ev.clientX - box.left) / box.width) * 100;
      if (mode === "files") setFilesPct(Math.min(50, Math.max(20, x)));
      else setDetailPct(Math.min(60, Math.max(30, 100 - x)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up);
      if (mode === "files") setFilesPct(p => { localStorage.setItem("bills_files_pct", String(Math.round(p))); return p; });
      else setDetailPct(p => { localStorage.setItem("bills_detail_pct", String(Math.round(p))); return p; });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [splitBillId, setSplitBillId] = useState(null);
  const [filesBillId, setFilesBillId] = useState(null);

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "supplier", label: "Supplier", required: true },
    { key: "dates", label: "Date", required: true },
    { key: "due", label: "Due date", required: true },
    { key: "status", label: "Status", required: true },
    { key: "paid", label: "Paid", required: true },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("bills_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, supplier: true, dates: true, due: true, status: true, paid: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("bills_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const [b, c, df, tmpl] = await Promise.all([
      base44.entities.Bill.list("-created_date", 5000),
      base44.entities.Contact.list("full_name", 5000).catch(() => []),
      base44.entities.DocumentFile.filter({ doc_type: "bill" }, "created_date", 5000).catch(() => []),
      base44.entities.DocumentTemplate.list("-created_date", 50).then(l => (l || []).filter(t => !(t.name || "").startsWith("__"))).catch(() => []),
    ]);
    setBills(b);
    setContacts(c);
    setTemplates(tmpl);
    const counts = {};
    (df || []).forEach(f => { counts[f.doc_id] = (counts[f.doc_id] || 0) + 1; });
    setDocFileCounts(counts);
    setLoading(false);
  };

  // Returning from the editor must reload the list and its split-detail props.
  useEffect(() => { load(); }, [location.key]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusParam = params.get("status");
    if (statusParam) {
      setFilterStatus(statusParam);
      navigate("/purchasing/bills", { replace: true });
    } else if (params.get("create") === "true") {
      navigate("/purchasing/bills/new", { replace: true });
    }
  }, [location.search]);

  const tabs = React.useMemo(() => {
    const counts = bills.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
    return [
      { key: "all",                label: "All",               count: bills.length },
      { key: "Draft",              label: "Draft",             count: counts["Draft"] || 0 },
      { key: "Awaiting Approval",  label: "Awaiting Approval", count: counts["Awaiting Approval"] || 0 },
      { key: "Awaiting Payment",   label: "Awaiting Payment",  count: counts["Awaiting Payment"] || 0 },
      { key: "Paid",               label: "Paid",              count: counts["Paid"] || 0 },
      { key: "Repeating",          label: "Repeating",         count: counts["Repeating"] || 0 },
      { key: "Cancelled",          label: "Anulada",         count: counts["Cancelled"] || 0 },
    ];
  }, [bills]);

  const handleTabChange = (key) => { setFilterStatus(key); setSelected(new Set()); };

  const filtered = React.useMemo(() => {
    const s = search.toLowerCase();
    return bills.filter(b => {
      const matchSearch = !search ||
        b.number?.toLowerCase().includes(s) ||
        b.reference?.toLowerCase().includes(s) ||
        b.contact_name?.toLowerCase().includes(s) ||
        String(b.total || "").includes(s);
      const matchStatus = filterStatus === "all" || b.status === filterStatus;

      // Advanced filters
      if (filters.showOverdue && !isOverdue(b)) return false;
      if (!filters.deletedVoided && b.status === "Cancelled") return false;
      if (!filters.docTypes.bills) return false;

      // Date range
      if (dateStart || dateEnd) {
        const dates = [];
        if (dateType === "any" || dateType === "transaction") dates.push(b.issue_date);
        if (dateType === "any" || dateType === "due") dates.push(b.due_date);
        if (dateType === "any" || dateType === "paid") {
          (b.payments || []).forEach(p => p.date && dates.push(p.date));
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
  }, [bills, search, filterStatus, dateStart, dateEnd, dateType, filters]);

  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    const field = SORT_FIELD[sortKey];
    const numeric = sortKey === "paid";
    return [...filtered].sort((a, b) => {
      const av = a[field] ?? "";
      const bv = b[field] ?? "";
      let cmp;
      if (numeric) {
        cmp = (Number(getAmountPaid(a)) || 0) - (Number(getAmountPaid(b)) || 0);
      } else {
        cmp = String(av).toLowerCase().localeCompare(String(bv).toLowerCase(), undefined, { numeric: true });
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const pagination = useTablePagination(sorted);

  const handleDelete = async (id) => {
    if (!confirm("Delete this bill?")) return;
    const b = bills.find(x => x.id === id);
    await reverseDocumentJournal("Bill", id, "bill deleted").catch(err => console.error(err));
    if (b?.number) await retireDocumentNumber("bill", b.number, id, "bill deleted");
    await base44.entities.Bill.delete(id);
    load();
  };

  const toggleSelect = (id, shiftKey = false) => {
    setSelected(prev => applyRangeToggle(prev, filtered.map(it => it.id), id, shiftKey, selectionAnchorRef));
  };
  const toggleSelectAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(b => b.id)));
  };

  const bulkStatus = async (newStatus) => {
    const emptyBills = [...selected].map(id => bills.find(x => x.id === id)).filter(x => x && itemsError(x.line_items, newStatus));
    if (emptyBills.length) { toast({ title: "Line items required", description: `${emptyBills.length} bill(s) have no line item: ${emptyBills.slice(0, 5).map(x => x.number || x.id).join(", ")}${emptyBills.length > 5 ? "…" : ""}`, variant: "destructive" }); return; }
    if (newStatus === "Paid") {
      const unpaid = [...selected].map(id => bills.find(x => x.id === id)).filter(x => x && (Number(x.amount_paid) || 0) < (Number(x.total) || 0) - 0.005);
      if (unpaid.length) { toast({ title: "Payment required", description: `${unpaid.length} bill(s) have no payment covering the total. Record the payment first (it creates the bank line and journal).`, variant: "destructive" }); return; }
    }
    await Promise.all([...selected].map(async id => {
      const b = bills.find(x => x.id === id);
      let updated = await base44.entities.Bill.update(id, { status: newStatus });
      if (b && !b.number && ["Awaiting Payment", "Paid"].includes(newStatus)) {
        const n = await assignOfficialNumber("Bill", id);
        if (n) updated = { ...updated, number: n };
      }
      if (newStatus === "Awaiting Payment" && b && b.status !== "Awaiting Payment") {
        await autoPostJournal("Bill", { ...b, ...updated, id }).catch(err => console.error(err));
      }
    }));
    setSelected(new Set()); load();
  };

  const bulkDelete = async () => {
    if (deleting) return;
    if (!confirm(`Delete ${selected.size} bill(s)?`)) return;
    const ids = [...selected];
    const byId = new Map(bills.map(x => [x.id, x]));
    const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
    const failed = [];
    setDeleting({ done: 0, total: ids.length });
    try {
      // Find in bulk which bills have posted journals or payment bank lines; only those need reversing.
      const withJournal = new Set();
      for (const part of chunk(ids, 100)) {
        const entries = await base44.entities.JournalEntry.filter({ source_type: "Bill", source_id: { $in: part }, status: "Posted" }, undefined, 1000).catch(() => []);
        entries.forEach(j => j.source_id && withJournal.add(j.source_id));
        const txs = await base44.entities.BankTransaction.filter({ source_id: { $in: part } }, undefined, 1000).catch(() => []);
        txs.forEach(t => t.source_id && withJournal.add(t.source_id));
      }
      const toReverse = ids.filter(id => withJournal.has(id));
      for (const part of chunk(toReverse, 6)) {
        await Promise.all(part.map(id => reverseDocumentJournal("Bill", id, "bill deleted").catch(err => { console.error(err); failed.push(id); })));
      }
      const okIds = ids.filter(id => !failed.includes(id));
      let done = 0;
      for (const part of chunk(okIds, 50)) {
        const bad = [];
        try { await base44.entities.Bill.deleteMany({ id: { $in: part } }); }
        catch (err) {
          console.error(err);
          for (const id of part) { try { await base44.entities.Bill.delete(id); } catch (e2) { bad.push(id); } }
        }
        bad.forEach(id => failed.push(id));
        const deletedPart = part.filter(id => !bad.includes(id));
        try {
          await base44.entities.RetiredDocumentNumber.bulkCreate(deletedPart.filter(id => byId.get(id)?.number).map(id => { const n = byId.get(id).number; return { doc_type: "bill", number: n, year: new Date().getFullYear(), prefix: (n.split("-")[0] || "").trim(), doc_id: id, reason: "bill deleted" }; }));
        } catch (err) { console.error(err); }
        done += part.length;
        const gone = new Set(deletedPart);
        setBills(prev => prev.filter(x => !gone.has(x.id)));
        setSelected(prev => { const n = new Set(prev); gone.forEach(i => n.delete(i)); return n; });
        setDeleting({ done, total: ids.length });
      }
    } catch (err) {
      console.error(err);
    }
    setDeleting(null);
    toast({
      title: `${ids.length - failed.length} of ${ids.length} bill(s) deleted`,
      description: failed.length ? `Could not delete: ${failed.slice(0, 10).map(id => byId.get(id)?.number || id).join(", ")}` : undefined,
      variant: failed.length ? "destructive" : undefined,
    });
    load();
  };

  const getTemplate = () => {
    const real = templates.filter(t => !String(t.name || "").startsWith("__"));
    return real.find(t => t.is_default && (t.document_types || []).includes("bill")) ||
      real.find(t => (t.document_types || []).includes("bill")) ||
      real.find(t => t.is_default) ||
      real[0] || {};
  };

  const handlePrint = async (b) => {
    setPrinting(b.id);
    const template = getTemplate();
    let fresh = b;
    if (b?.id) { try { fresh = await base44.entities.Bill.get(b.id); } catch { fresh = b; } }
    const contact = contacts.find(c => c.id === fresh.contact_id);
    try { await printBillPdfFromHtml({ bill: fresh, contact, template }); }
    catch { toast({ title: "PDF failed", description: "Could not generate the PDF", variant: "destructive" }); }
    setPrinting(null);
  };

  const bulkPrint = async () => {
    for (const id of selected) {
      const b = bills.find(x => x.id === id);
      if (b) await handlePrint(b);
    }
  };

  const handleDuplicate = (b) => {
    const { id, created_date, updated_date, created_by_id, number, ...rest } = b;
    navigate("/purchasing/bills/new", { state: { duplicate: { ...rest, status: "Draft", number: "" } } });
  };

  const openEdit = (b) => navigate(`/purchasing/bills/${b.id}/edit`);
  const openAdd  = () => navigate("/purchasing/bills/new");

  // Split view helpers
  const openSplitDetail = (b) => {
    setSplitMode("detail");
    setSplitBillId(b.id);
    setFilesBillId(null);
  };
  const openSplitFiles = (b) => {
    setSplitMode("files");
    setFilesBillId(b.id);
    setSplitBillId(null);
  };
  const closeSplit = () => {
    setSplitMode(null);
    setSplitBillId(null);
    setFilesBillId(null);
  };
  const splitBill = bills.find(b => b.id === splitBillId) || null;
  const filesBill = bills.find(b => b.id === filesBillId) || null;
  const splitIndex = splitBillId ? sorted.findIndex(b => b.id === splitBillId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = sorted[splitIndex + dir];
    if (next) setSplitBillId(next.id);
  };

  const selectedTotal = filtered.filter(b => selected.has(b.id)).reduce((s, b) => s + (b.total || 0), 0);
  const firstCurrency = filtered.find(b => selected.has(b.id))?.currency || "AED";
  const totalAmount = filtered.reduce((s, b) => s + (b.total || 0), 0);
  const totalCurrency = filtered[0]?.currency || "AED";

  const fileCountFor = (b) => (b.annex_photos || []).filter(p => p.include !== false).length + (docFileCounts[b.id] || 0);

  const [expandedBills, setExpandedBills] = useState({});
  const toggleExpand = async (bill) => {
    const cur = expandedBills[bill.id];
    if (cur?.open) { setExpandedBills(p => ({ ...p, [bill.id]: { ...cur, open: false } })); return; }
    setExpandedBills(p => ({ ...p, [bill.id]: { open: true, loading: !cur?.full, full: cur?.full } }));
    if (!cur?.full) {
      try {
        const full = await base44.entities.Bill.get(bill.id);
        setExpandedBills(p => ({ ...p, [bill.id]: { open: p[bill.id]?.open ?? true, loading: false, full } }));
      } catch {
        setExpandedBills(p => ({ ...p, [bill.id]: { open: true, loading: false, full: bill } }));
      }
    }
  };

  const renderTable = (compact) => (
    <div className="min-w-0 max-w-full">
      <div className="overflow-x-auto max-w-full">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading bills...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No bills found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterStatus !== "all" ? "Try adjusting your filters." : "Create your first bill to get started."}
            </p>
            {!search && filterStatus === "all" && can("bills", "can_create") && (
              <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4" /> New Bill
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-border bg-slate-100 dark:bg-slate-800">
                <th className="px-3 py-3 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">View</th>
                <SortableTh colKey="supplier" label="From" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                {visibleCols.reference && <SortableTh colKey="reference" label="Reference" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                <SortableTh colKey="dates" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                {visibleCols.due && <SortableTh colKey="due" label="Due date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                {visibleCols.paid && (
                  <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("paid")}>
                    <span className="inline-flex items-center">Paid<SortIcon sortKey={sortKey} col="paid" sortDir={sortDir} /></span>
                  </th>
                )}
                <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Due</th>
                <th className="px-3 py-3 w-16 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pagination.pageItems.map((b, idx) => {
                  const overdue = isOverdue(b);
                  const paid = getAmountPaid(b);
                  const due = (b.total || 0) - paid;
                  const fc = fileCountFor(b);
                  const isActive = splitMode === "detail" && b.id === splitBillId;
                  const stripe = idx % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/30" : "";
                  const ex = expandedBills[b.id];
                  const colCount = 5 + (visibleCols.reference ? 1 : 0) + (visibleCols.due ? 1 : 0) + (visibleCols.paid ? 1 : 0);
                  return (
                    <React.Fragment key={b.id}>
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => openEdit(b)}
                      className={`border-b border-border hover:bg-primary/[0.06] transition-colors group cursor-pointer ${isActive ? "bg-primary/10" : stripe}`}>
                      <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button type="button" title="Show line items" onClick={() => toggleExpand(b)}
                          className="inline-flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10">
                          <ChevronRight className={`w-4 h-4 transition-transform ${ex?.open ? "rotate-90" : ""}`} />
                        </button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Split preview"
                          onClick={() => openSplitDetail(b)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                      <td className="px-3 py-3 max-w-[200px]">
                        <span className="text-xs font-semibold text-foreground truncate block">{b.contact_name || "—"}</span>
                      </td>
                      {visibleCols.reference && <td className="px-3 py-3 max-w-[160px]" onClick={() => openEdit(b)}><p className="text-xs text-foreground truncate">{b.reference || "—"}</p></td>}
                      <td className="px-3 py-3" onClick={() => openEdit(b)}>
                        <span className="flex items-center gap-1 text-xs text-foreground"><Clock className="w-3 h-3 shrink-0 text-muted-foreground" />{fmtDate(b.issue_date)}</span>
                      </td>
                      {visibleCols.due && (
                        <td className="px-3 py-3" onClick={() => openEdit(b)}>
                          {b.due_date ? (
                            <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-medium" : "text-foreground"}`}>
                              {overdue && <AlertCircle className="w-3 h-3 shrink-0" />}{fmtDate(b.due_date)}
                            </span>
                          ) : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                      )}
                      {visibleCols.paid && <td className="px-3 py-3 text-right"><span className="text-xs font-medium tabular-nums text-foreground">{fmtAmount(paid, b.currency)}</span></td>}
                      <td className="px-3 py-3 text-right"><span className={`text-xs font-bold tabular-nums ${due > 0 ? "text-foreground" : "text-muted-foreground"}`}>{fmtAmount(due, b.currency)}</span></td>
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => openSplitFiles(b)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fc > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                          title="View annex files">
                          <Paperclip className="w-3.5 h-3.5" />
                          {fc > 0 && <span className="tabular-nums">{fc}</span>}
                        </button>
                      </td>
                    </motion.tr>
                    {ex?.open && (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={colCount} className="px-6 py-3">
                          {ex.loading ? (
                            <p className="text-xs text-muted-foreground">Loading line items...</p>
                          ) : (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="text-left font-semibold py-1 pr-3">Description</th>
                                  <th className="text-left font-semibold py-1 pr-3">Account</th>
                                  <th className="text-right font-semibold py-1 px-3">Qty</th>
                                  <th className="text-right font-semibold py-1 px-3">Unit price</th>
                                  <th className="text-right font-semibold py-1 px-3">Tax</th>
                                  <th className="text-right font-semibold py-1 pl-3">Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {((ex.full?.line_items || []).filter(l => l.description || l.unit_price)).length === 0 ? (
                                  <tr><td colSpan={6} className="py-2 text-muted-foreground">No line items</td></tr>
                                ) : (ex.full.line_items.filter(l => l.description || l.unit_price)).map((l, i) => (
                                  <tr key={i} className="border-t border-border/60">
                                    <td className="py-1.5 pr-3 text-foreground">{l.description || "—"}</td>
                                    <td className="py-1.5 pr-3 text-muted-foreground">{l.account_name || l.account_code || "—"}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">{l.quantity ?? "—"}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">{fmtAmount(l.unit_price, ex.full.currency)}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">{l.tax_rate != null ? `${l.tax_rate}%` : "—"}</td>
                                    <td className="py-1.5 pl-3 text-right font-medium tabular-nums">{fmtAmount(l.total, ex.full.currency)}</td>
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
          <Link to="/purchasing-overview" className="hover:text-primary transition-colors">Purchasing overview</Link>
          <ChevronRight className="w-3 h-3" />
        </div>
        <h1 className="text-xl font-bold text-foreground mb-3">Bills</h1>
        <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
          {can("bills", "can_create") && (
            <Button onClick={openAdd} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 text-xs px-3">
              <Plus className="w-3.5 h-3.5" /> New Bill
            </Button>
          )}
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
          <Input placeholder="Enter a contact, amount, or reference"
            className="pl-9 bg-muted/40 border-muted" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
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
        <BillsFilterPopover filters={filters} onChange={setFilters} onReset={() => setFilters(defaultBillFilters)} />
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Summary + bulk actions — totals at top-left */}
      <div className="bg-slate-100 dark:bg-slate-800 border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs text-muted-foreground tabular-nums">
          {`${filtered.length} items`}
          <span className="ml-2 font-bold text-foreground">{fmtAmount(totalAmount, totalCurrency)}</span>
          {selected.size > 0 && <span className="ml-3 font-medium text-primary">{selected.size} selected · {fmtAmount(selectedTotal, firstCurrency)}</span>}
        </span>
        <div className="flex items-center gap-1.5">
          {filterStatus !== "all" && (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={bulkPrint}><Printer className="w-3.5 h-3.5 mr-1" />Print</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={selected.size === 0 || !!deleting} onClick={bulkDelete}>{deleting ? `Deleting ${deleting.done}/${deleting.total}...` : "Delete"}</Button>
              {filterStatus === "Draft" && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={() => bulkStatus("Awaiting Approval")}>Submit for Approval</Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0} onClick={() => bulkStatus("Awaiting Payment")}>Approve</Button>
                </>
              )}
              {filterStatus === "Awaiting Approval" && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={() => bulkStatus("Draft")}>Revert to Draft</Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0} onClick={() => bulkStatus("Awaiting Payment")}>Approve</Button>
                </>
              )}
              {filterStatus === "Awaiting Payment" && (
                <Button size="sm" className="h-7 text-xs px-3 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={selected.size === 0} onClick={() => bulkStatus("Paid")}>Mark as Paid</Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card" ref={splitWrapRef}>
        {splitMode === "files" && filesBill && (
          <>
<div style={{ width: `${filesPct}%`, minWidth: 260, maxWidth: "55%" }} className="min-w-0 flex flex-col shrink-0">
            <BillFilesViewer bill={filesBill} onClose={closeSplit} />
          </div>
<div onMouseDown={startResize("files")} title="Drag to resize" className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors" />
</>
        )}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {renderTable(splitMode === "files")}
        </div>
      </div>

      {splitMode === "detail" && splitBill && (
        <BillSplitDetail
          bill={splitBill}
          contact={contacts.find(c => c.id === splitBill?.contact_id)}
          onClose={closeSplit}
          onEdit={(b) => openEdit(b)}
          onPrint={(b) => handlePrint(b)}
        />
      )}

      <PaginationFooter pagination={pagination} />

      {/* Quick Preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{preview.number || "Bill"}</h3>
              <StatusBadge status={preview.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-xs text-muted-foreground">Supplier</p><p className="font-medium">{preview.contact_name || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Reference</p><p className="font-medium">{preview.reference || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Issue Date</p><p className="font-medium">{fmtDate(preview.issue_date)}</p></div>
              <div><p className="text-xs text-muted-foreground">Due Date</p><p className={`font-medium ${isOverdue(preview) ? "text-red-600" : ""}`}>{fmtDate(preview.due_date)}</p></div>
            </div>
            <div className="flex justify-between items-center border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-bold tabular-nums">{fmtAmount(preview.total, preview.currency)}</span>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
              <Button onClick={() => { setPreview(null); openEdit(preview); }}>Edit Bill</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}