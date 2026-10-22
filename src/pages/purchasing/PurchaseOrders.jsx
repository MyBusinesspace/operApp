import React, { useState, useEffect, useRef } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { compareDateOnly, formatDateOnly, todayLocalISO } from "@/lib/dateOnly";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Search, Clock, AlertCircle, CheckCircle2, Ban, Receipt,
  ChevronRight, X, Eye, Paperclip
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import ColumnToggle from "@/components/shared/ColumnToggle";
import SortIcon, { SortableTh } from "@/components/shared/SortIcon";
import { useSortable } from "@/hooks/useSortable";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { retireDocumentNumber } from "@/lib/documentNumbering";
import PurchaseOrdersFilterPopover, { defaultPurchaseOrderFilters } from "@/components/purchasing/PurchaseOrdersFilterPopover";
import PurchaseOrderSplitDetail from "@/components/purchasing/PurchaseOrderSplitDetail";
import PurchaseOrderFilesViewer from "@/components/purchasing/PurchaseOrderFilesViewer";

const SORT_FIELD = {
  number: "number",
  supplier: "contact_name",
  dates: "issue_date",
  delivery: "delivery_date",
  status: "status",
  amount: "total",
};

const STATUS_STYLES = {
  Draft:               "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400",
  "Awaiting Approval": "bg-amber-100 text-amber-700",
  Approved:            "bg-emerald-100 text-emerald-700",
  Billed:              "bg-violet-100 text-violet-700",
  Cancelled:           "bg-orange-100 text-orange-600",
};

const STATUS_ICONS = {
  Draft:               FileText,
  "Awaiting Approval": AlertCircle,
  Approved:            CheckCircle2,
  Billed:              Receipt,
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
function isOverdueDelivery(po) {
  if (!po.delivery_date || po.status === "Billed" || po.status === "Cancelled") return false;
  return compareDateOnly(po.delivery_date, todayLocalISO()) < 0;
}

const STATUS_TEXT = {
  Draft:               "text-slate-500 dark:text-slate-400",
  "Awaiting Approval": "text-amber-600 dark:text-amber-500",
  Approved:            "text-emerald-600 dark:text-emerald-500",
  Billed:              "text-violet-600 dark:text-violet-500",
  Cancelled:           "text-orange-600 dark:text-orange-500",
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-semibold ${STATUS_TEXT[status] || "text-muted-foreground"}`}>
      {status}
    </span>
  );
}

export default function PurchaseOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pos, setPos] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [docFileCounts, setDocFileCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("purchase_orders");
  const [filterStatus, setFilterStatus] = useState("all");
  const [preview, setPreview] = useState(null);
  const { can } = usePermissionsMatrix();
  const { sortKey, sortDir, handleSort } = useSortable("issue_date", "desc");

  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [dateType, setDateType] = useState("any");

  const [filters, setFilters] = useState(defaultPurchaseOrderFilters);

  const [splitMode, setSplitMode] = useState(null);
  const [filesPct, setFilesPct] = useState(() => { const v = Number(localStorage.getItem("purchase_orders_files_pct")); return v >= 20 && v <= 50 ? v : 35; });
  const [detailPct, setDetailPct] = useState(() => { const v = Number(localStorage.getItem("purchase_orders_detail_pct")); return v >= 30 && v <= 60 ? v : 55; });
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
      if (mode === "files") setFilesPct(p => { localStorage.setItem("purchase_orders_files_pct", String(Math.round(p))); return p; });
      else setDetailPct(p => { localStorage.setItem("purchase_orders_detail_pct", String(Math.round(p))); return p; });
    };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const [splitPoId, setSplitPoId] = useState(null);
  const [filesPoId, setFilesPoId] = useState(null);

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "supplier", label: "Supplier", required: true },
    { key: "dates", label: "Date", required: true },
    { key: "delivery", label: "Delivery date", required: true },
    { key: "status", label: "Status", required: true },
    { key: "amount", label: "Amount", required: true },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("purchase_orders_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, supplier: true, dates: true, delivery: true, status: true, amount: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("purchase_orders_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    const [p, c, df] = await Promise.all([
      base44.entities.PurchaseOrder.list("-created_date", 5000),
      base44.entities.Contact.list("full_name", 5000).catch(() => []),
      base44.entities.DocumentFile.filter({ doc_type: "purchase_order" }, "created_date", 5000).catch(() => []),
    ]);
    setPos(p);
    setContacts(c);
    const counts = {};
    (df || []).forEach(f => { counts[f.doc_id] = (counts[f.doc_id] || 0) + 1; });
    setDocFileCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("create") === "true") {
      navigate("/purchasing/purchase-orders/new", { replace: true });
    }
  }, [location.search]);

  const tabs = React.useMemo(() => {
    const counts = pos.reduce((acc, p) => { acc[p.status] = (acc[p.status] || 0) + 1; return acc; }, {});
    return [
      { key: "all",                label: "All",               count: pos.length },
      { key: "Draft",              label: "Draft",             count: counts["Draft"] || 0 },
      { key: "Awaiting Approval",  label: "Awaiting Approval", count: counts["Awaiting Approval"] || 0 },
      { key: "Approved",           label: "Approved",          count: counts["Approved"] || 0 },
      { key: "Billed",             label: "Billed",            count: counts["Billed"] || 0 },
      { key: "Cancelled",          label: "Cancelled",         count: counts["Cancelled"] || 0 },
    ];
  }, [pos]);

  const handleTabChange = (key) => { setFilterStatus(key); };

  const filtered = React.useMemo(() => {
    const s = search.toLowerCase();
    return pos.filter(p => {
      const matchSearch = !search ||
        p.number?.toLowerCase().includes(s) ||
        p.reference?.toLowerCase().includes(s) ||
        p.contact_name?.toLowerCase().includes(s) ||
        String(p.total || "").includes(s);
      const matchStatus = filterStatus === "all" || p.status === filterStatus;

      if (filters.showOverdueDelivery && !isOverdueDelivery(p)) return false;
      if (!filters.deletedVoided && p.status === "Cancelled") return false;
      if (!filters.docTypes.purchaseOrders) return false;

      if (dateStart || dateEnd) {
        const dates = [];
        if (dateType === "any" || dateType === "transaction") dates.push(p.issue_date);
        if (dateType === "any" || dateType === "delivery") dates.push(p.delivery_date);
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
  }, [pos, search, filterStatus, dateStart, dateEnd, dateType, filters]);

  const sorted = React.useMemo(() => {
    if (!sortKey) return filtered;
    const field = SORT_FIELD[sortKey];
    const numeric = sortKey === "amount";
    return [...filtered].sort((a, b) => {
      const av = a[field] ?? "";
      const bv = b[field] ?? "";
      let cmp;
      if (numeric) {
        cmp = (Number(a.total) || 0) - (Number(b.total) || 0);
      } else {
        cmp = String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const pagination = useTablePagination(sorted);

  const handleDelete = async (id) => {
    if (!confirm("Delete this purchase order?")) return;
    const p = pos.find(x => x.id === id);
    if (p?.number) await retireDocumentNumber("purchase_order", p.number, id, "purchase order deleted");
    await base44.entities.PurchaseOrder.delete(id);
    load();
  };

  const handleConvertToBill = (po) => {
    const { id, created_date, updated_date, created_by_id, number, delivery_date, status, ...rest } = po;
    navigate("/purchasing/bills/new", { state: { duplicate: { ...rest, status: "Draft", number: "", issue_date: todayLocalISO(), purchase_order_id: po.id, purchase_order_number: po.number } } });
  };

  const handleDuplicate = (p) => {
    const { id, created_date, updated_date, created_by_id, number, ...rest } = p;
    navigate("/purchasing/purchase-orders/new", { state: { duplicate: { ...rest, status: "Draft", number: "" } } });
  };

  const openEdit = (p) => navigate(`/purchasing/purchase-orders/${p.id}/edit`);
  const openAdd  = () => navigate("/purchasing/purchase-orders/new");

  const [expandedPos, setExpandedPos] = useState({});
  const toggleExpand = async (po) => {
    const cur = expandedPos[po.id];
    if (cur?.open) { setExpandedPos(p => ({ ...p, [po.id]: { ...cur, open: false } })); return; }
    setExpandedPos(p => ({ ...p, [po.id]: { open: true, loading: !cur?.full, full: cur?.full } }));
    if (!cur?.full) {
      try {
        const full = await base44.entities.PurchaseOrder.get(po.id);
        setExpandedPos(p => ({ ...p, [po.id]: { open: p[po.id]?.open ?? true, loading: false, full } }));
      } catch {
        setExpandedPos(p => ({ ...p, [po.id]: { open: true, loading: false, full: po } }));
      }
    }
  };
  const handlePrint = async (po) => {
    let fresh = po;
    try { fresh = await base44.entities.PurchaseOrder.get(po.id); } catch {}
    const contact = contacts.find(c => c.id === fresh.contact_id);
    let template = {};
    try {
      const tpls = (await base44.entities.DocumentTemplate.list("-created_date", 50)).filter(t => !String(t.name || "").startsWith("__"));
      template = tpls.find(t => t.is_default && (t.document_types || []).includes("purchase_order")) || tpls.find(t => (t.document_types || []).includes("purchase_order")) || tpls.find(t => t.is_default) || tpls[0] || {};
    } catch {}
    try { const m = await import("@/components/purchasing/purchaseOrderPdfFromHtml"); await m.printPurchaseOrderPdfFromHtml({ purchaseOrder: fresh, contact, template }); } catch {}
  };
  const openSplitDetail = (p) => { setSplitMode("detail"); setSplitPoId(p.id); setFilesPoId(null); };
  const openSplitFiles = (p) => { setSplitMode("files"); setFilesPoId(p.id); setSplitPoId(null); };
  const closeSplit = () => { setSplitMode(null); setSplitPoId(null); setFilesPoId(null); };
  const splitPo = pos.find(p => p.id === splitPoId) || null;
  const filesPo = pos.find(p => p.id === filesPoId) || null;
  const splitIndex = splitPoId ? sorted.findIndex(p => p.id === splitPoId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = sorted[splitIndex + dir];
    if (next) setSplitPoId(next.id);
  };

  const totalAmount = filtered.reduce((s, p) => s + (p.total || 0), 0);
  const totalCurrency = filtered[0]?.currency || "AED";

  const fileCountFor = (p) => (p.annex_photos || []).filter(ph => ph.include !== false).length + (docFileCounts[p.id] || 0);

  const renderTable = (compact) => (
    <div className="min-w-0 max-w-full">
      <div className="overflow-x-auto max-w-full">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading purchase orders...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No purchase orders found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterStatus !== "all" ? "Try adjusting your filters." : "Create your first purchase order to get started."}
            </p>
            {!search && filterStatus === "all" && can("purchase_orders", "can_create") && (
              <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4" /> New Purchase Order
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-border bg-slate-100 dark:bg-slate-800">
                <th className="px-3 py-3 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">View</th>
                <SortableTh colKey="supplier" label="From" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                {visibleCols.reference && <SortableTh colKey="number" label="PO Number" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                <SortableTh colKey="dates" label="Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                {visibleCols.delivery && <SortableTh colKey="delivery" label="Delivery date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                {visibleCols.amount && (
                  <th className="px-3 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none" onClick={() => handleSort("amount")}>
                    <span className="inline-flex items-center">Amount<SortIcon sortKey={sortKey} col="amount" sortDir={sortDir} /></span>
                  </th>
                )}
                <th className="px-3 py-3 w-16 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pagination.pageItems.map((p, idx) => {
                  const overdue = isOverdueDelivery(p);
                  const fc = fileCountFor(p);
                  const isActive = splitMode === "detail" && p.id === splitPoId;
                  const stripe = idx % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/30" : "";
                  return (
                    <React.Fragment key={p.id}>
                    <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => openEdit(p)}
                      className={`border-b border-border hover:bg-primary/[0.06] transition-colors group cursor-pointer ${isActive ? "bg-primary/10" : stripe}`}>
                      <td className="px-3 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button type="button" title="Show line items" onClick={() => toggleExpand(p)}
                          className="inline-flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10">
                          <ChevronRight className={`w-4 h-4 transition-transform ${expandedPos[p.id]?.open ? "rotate-90" : ""}`} />
                        </button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Split preview"
                          onClick={() => openSplitDetail(p)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                      <td className="px-3 py-3 max-w-[200px]">
                        <span className="text-xs font-semibold text-foreground truncate block">{p.contact_name || "—"}</span>
                      </td>
                      {visibleCols.reference && <td className="px-3 py-3 max-w-[160px]" onClick={() => openEdit(p)}><p className="text-xs font-bold text-foreground truncate">{p.number || "—"}</p></td>}
                      <td className="px-3 py-3" onClick={() => openEdit(p)}>
                        <span className="flex items-center gap-1 text-xs text-foreground"><Clock className="w-3 h-3 shrink-0 text-muted-foreground" />{fmtDate(p.issue_date)}</span>
                      </td>
                      {visibleCols.delivery && (
                        <td className="px-3 py-3" onClick={() => openEdit(p)}>
                          {p.delivery_date ? (
                            <span className={`flex items-center gap-1 text-xs ${overdue ? "text-red-600 font-medium" : "text-foreground"}`}>
                              {overdue && <AlertCircle className="w-3 h-3 shrink-0" />}{fmtDate(p.delivery_date)}
                            </span>
                          ) : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                      )}
                      {visibleCols.amount && <td className="px-3 py-3 text-right" onClick={() => openEdit(p)}><span className="text-xs font-bold tabular-nums text-foreground">{fmtAmount(p.total, p.currency)}</span></td>}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => openSplitFiles(p)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fc > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                          title="View annex files">
                          <Paperclip className="w-3.5 h-3.5" />
                          {fc > 0 && <span className="tabular-nums">{fc}</span>}
                        </button>
                        {p.status === "Approved" && (
                          <button type="button" onClick={() => handleConvertToBill(p)} title="Convert to bill"
                            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 ml-1 rounded-md text-primary hover:bg-primary/10">
                            <Receipt className="w-3.5 h-3.5" /> Bill
                          </button>
                        )}
                      </td>
                    </motion.tr>
                    {expandedPos[p.id]?.open && (() => { const ex = expandedPos[p.id]; const cc = 4 + (visibleCols.reference ? 1 : 0) + (visibleCols.delivery ? 1 : 0) + (visibleCols.amount ? 1 : 0); return (
                      <tr className="border-b border-border bg-muted/20">
                        <td colSpan={cc} className="px-6 py-3">
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
                    ); })()}
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
        <h1 className="text-xl font-bold text-foreground mb-3">Purchase Orders</h1>
        <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
          {can("purchase_orders", "can_create") && (
            <Button onClick={openAdd} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 text-xs px-3">
              <Plus className="w-3.5 h-3.5" /> New Purchase Order
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
          <Input placeholder="Enter a contact, amount, reference or PO number"
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
            <SelectItem value="delivery">Delivery date</SelectItem>
          </SelectContent>
        </Select>
        <PurchaseOrdersFilterPopover filters={filters} onChange={setFilters} onReset={() => setFilters(defaultPurchaseOrderFilters)} />
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Summary */}
      <div className="bg-slate-100 dark:bg-slate-800 border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs text-muted-foreground tabular-nums">
          {`${filtered.length} items`}
          <span className="ml-2 font-bold text-foreground">{fmtAmount(totalAmount, totalCurrency)}</span>
        </span>
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card" ref={splitWrapRef}>
        {splitMode === "files" && filesPo && (
          <>
<div style={{ width: `${filesPct}%`, minWidth: 260, maxWidth: "55%" }} className="min-w-0 flex flex-col shrink-0">
            <PurchaseOrderFilesViewer po={filesPo} onClose={closeSplit} />
          </div>
<div onMouseDown={startResize("files")} title="Drag to resize" className="w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors" />
</>
        )}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {renderTable(splitMode === "files")}
        </div>
      </div>

      {splitMode === "detail" && splitPo && (
        <PurchaseOrderSplitDetail
          po={splitPo}
          contact={contacts.find(c => c.id === splitPo?.contact_id)}
          onClose={closeSplit}
          onEdit={(p) => openEdit(p)}
          onPrint={handlePrint}
        />
      )}

      <PaginationFooter pagination={pagination} />

      {/* Quick Preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{preview.number || "Purchase Order"}</h3>
              <StatusBadge status={preview.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><p className="text-xs text-muted-foreground">Supplier</p><p className="font-medium">{preview.contact_name || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Reference</p><p className="font-medium">{preview.reference || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Issue Date</p><p className="font-medium">{fmtDate(preview.issue_date)}</p></div>
              <div><p className="text-xs text-muted-foreground">Delivery Date</p><p className="font-medium">{fmtDate(preview.delivery_date)}</p></div>
            </div>
            <div className="flex justify-between items-center border-t border-border pt-3">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-bold tabular-nums">{fmtAmount(preview.total, preview.currency)}</span>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setPreview(null)}>Close</Button>
              <Button onClick={() => { setPreview(null); openEdit(preview); }}>Edit PO</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}