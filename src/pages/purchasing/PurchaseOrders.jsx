import React, { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Search, Pencil, Trash2, Clock,
  AlertCircle, CheckCircle2, Ban, Receipt,
  ChevronRight, X, Eye, Copy, MoreVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { applyRangeToggle } from "@/lib/rangeSelect";

const STATUS_STYLES = {
  Draft:               "bg-slate-100 text-slate-600",
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
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtAmount(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + " " + currency;
}

function StatusBadge({ status }) {
  const Icon = STATUS_ICONS[status] || FileText;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[status] || "bg-muted text-muted-foreground"}`}>
      <Icon className="w-3 h-3" />{status}
    </span>
  );
}

export default function PurchaseOrders() {
  const location = useLocation();
  const navigate = useNavigate();
  const [pos, setPos] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [preview, setPreview] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const selectionAnchorRef = useRef(null);

  const load = async () => {
    setLoading(true);
    const [p, c] = await Promise.all([
      base44.entities.PurchaseOrder.list("-created_date", 500),
      base44.entities.Contact.list("full_name", 200).catch(() => []),
    ]);
    setPos(p);
    setContacts(c);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("create") === "true") {
      navigate("/purchasing/purchase-orders/new", { replace: true });
    }
  }, [location.search]);

  const countBy = (s) => pos.filter(p => p.status === s).length;

  const tabs = [
    { key: "all",                label: "All",               count: pos.length },
    { key: "Draft",              label: "Draft",             count: countBy("Draft") },
    { key: "Awaiting Approval",  label: "Awaiting Approval", count: countBy("Awaiting Approval") },
    { key: "Approved",           label: "Approved",          count: countBy("Approved") },
    { key: "Billed",             label: "Billed",            count: countBy("Billed") },
  ];

  const handleTabChange = (key) => { setFilterStatus(key); setSelected(new Set()); };

  const filtered = pos.filter(p => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      p.number?.toLowerCase().includes(s) ||
      p.reference?.toLowerCase().includes(s) ||
      p.contact_name?.toLowerCase().includes(s) ||
      String(p.total || "").includes(s);
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const pagination = useTablePagination(filtered);

  const handleDelete = async (id) => {
    if (!confirm("Delete this purchase order?")) return;
    await base44.entities.PurchaseOrder.delete(id);
    load();
  };

  const handleConvertToBill = (po) => {
    const { id, created_date, updated_date, created_by_id, number, delivery_date, status, ...rest } = po;
    navigate("/purchasing/bills/new", { state: { duplicate: { ...rest, status: "Draft", number: "", issue_date: new Date().toISOString().slice(0, 10), purchase_order_id: po.id, purchase_order_number: po.number } } });
  };

  const toggleSelect = (id, shiftKey = false) => {
    setSelected(prev => applyRangeToggle(prev, filtered.map(it => it.id), id, shiftKey, selectionAnchorRef));
  };
  const toggleSelectAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)));
  };

  const bulkStatus = async (newStatus) => {
    await Promise.all([...selected].map(id => base44.entities.PurchaseOrder.update(id, { status: newStatus })));
    setSelected(new Set()); load();
  };

  const bulkDelete = async () => {
    if (!confirm(`Delete ${selected.size} purchase order(s)?`)) return;
    await Promise.all([...selected].map(id => base44.entities.PurchaseOrder.delete(id)));
    setSelected(new Set()); load();
  };

  const handleDuplicate = (p) => {
    const { id, created_date, updated_date, created_by_id, number, ...rest } = p;
    navigate("/purchasing/purchase-orders/new", { state: { duplicate: { ...rest, status: "Draft", number: "" } } });
  };

  const openEdit = (p) => navigate(`/purchasing/purchase-orders/${p.id}/edit`);
  const openAdd  = () => navigate("/purchasing/purchase-orders/new");

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 pt-4 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <Link to="/purchasing-overview" className="hover:text-primary transition-colors">Purchasing overview</Link>
          <ChevronRight className="w-3 h-3" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Purchase Orders</h1>
          <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
            <Plus className="w-4 h-4" /> New purchase order
          </Button>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto">
          {tabs.filter(t => t.key === "all" || t.count > 0).map(tab => (
            <button key={tab.key} onClick={() => handleTabChange(tab.key)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                filterStatus === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}>
              {tab.label}
              <span className={`text-xs font-semibold ${filterStatus === tab.key ? "text-primary" : "text-muted-foreground"}`}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Enter a supplier, amount, reference or PO number"
            className="pl-9 bg-muted/40 border-muted" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Summary + bulk */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs text-muted-foreground">
          {`${filtered.length} items`}
          {filterStatus !== "all" && ` | ${fmtAmount(filtered.reduce((s, p) => s + (p.total || 0), 0), filtered[0]?.currency || "AED")}`}
          {selected.size > 0 && <span className="ml-3 font-medium text-foreground">{selected.size} selected</span>}
        </span>
        <div className="flex items-center gap-1.5">
          {filterStatus !== "all" && (
            <>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-3 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={selected.size === 0} onClick={bulkDelete}>Delete</Button>
              {filterStatus === "Draft" && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={() => bulkStatus("Awaiting Approval")}>Submit for Approval</Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0} onClick={() => bulkStatus("Approved")}>Approve</Button>
                </>
              )}
              {filterStatus === "Awaiting Approval" && (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-3" disabled={selected.size === 0} onClick={() => bulkStatus("Draft")}>Revert to Draft</Button>
                  <Button size="sm" className="h-7 text-xs px-3 bg-slate-800 hover:bg-slate-900 text-white" disabled={selected.size === 0} onClick={() => bulkStatus("Approved")}>Approve</Button>
                </>
              )}
              {filterStatus === "Approved" && (
                <Button size="sm" className="h-7 text-xs px-3 bg-violet-600 hover:bg-violet-700 text-white" disabled={selected.size === 0} onClick={() => bulkStatus("Billed")}>Mark as Billed</Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-card">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm border-t border-border">Loading purchase orders...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center border-t border-border">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FileText className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No purchase orders found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterStatus !== "all" ? "Try adjusting your filters." : "Create your first purchase order to get started."}
            </p>
            {!search && filterStatus === "all" && (
              <Button onClick={openAdd} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
                <Plus className="w-4 h-4" /> New Purchase Order
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
                      <input type="checkbox" className="rounded border-border"
                        checked={filtered.length > 0 && selected.size === filtered.length} onChange={toggleSelectAll} />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">PO Number</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Dates</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Project / WO</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Amount</th>
                  <th className="px-4 py-3 w-16"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {pagination.pageItems.map(p => (
                    <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="border-b border-border hover:bg-muted/20 transition-colors group cursor-pointer"
                      onClick={() => openEdit(p)}>
                      {filterStatus !== "all" && (
                        <td className="px-4 py-3 w-10" onClick={e => { e.stopPropagation(); toggleSelect(p.id, e.shiftKey); }}>
                          <input type="checkbox" className="rounded border-border" checked={selected.has(p.id)}
                            onClick={e => { e.stopPropagation(); toggleSelect(p.id, e.shiftKey); }} readOnly />
                        </td>
                      )}
                      <td className="px-4 py-3"><span className="text-sm font-semibold text-primary hover:underline">{p.number || "—"}</span></td>
                      <td className="px-4 py-3 max-w-[160px]"><p className="text-sm text-foreground truncate">{p.reference || "—"}</p></td>
                      <td className="px-4 py-3 max-w-[200px]" onClick={e => e.stopPropagation()}>
                        {p.contact_id ? (
                          <Link to={`/contacts/${p.contact_id}`} className="text-sm font-medium text-primary hover:underline">{p.contact_name || "—"}</Link>
                        ) : (
                          <p className="text-sm font-medium">{p.contact_name || "—"}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <div className="flex flex-col gap-1">
                          <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="w-3 h-3 shrink-0" />{fmtDate(p.issue_date)}</span>
                          {p.delivery_date && <span className="flex items-center gap-1 text-xs text-muted-foreground/60"><span className="w-3 h-3 shrink-0" />{fmtDate(p.delivery_date)}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell max-w-[160px]" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col gap-0.5">
                          {p.project_name && <span className="text-xs font-medium text-foreground truncate">{p.project_name}</span>}
                          {p.work_order_name && <span className="text-xs text-muted-foreground truncate">{p.work_order_name}</span>}
                          {!p.project_name && !p.work_order_name && <span className="text-xs text-muted-foreground/40">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}><StatusBadge status={p.status} /></td>
                      <td className="px-4 py-3 text-right"><span className="text-sm font-semibold tabular-nums">{fmtAmount(p.total, p.currency)}</span></td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Quick Preview"
                            onClick={() => setPreview(p)}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground">
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-52">
                              <DropdownMenuItem onClick={() => openEdit(p)}>
                                <Pencil className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleDuplicate(p)}>
                                <Copy className="w-4 h-4 mr-2" /> Duplicate PO
                              </DropdownMenuItem>
                              {p.status === "Approved" && (
                                <DropdownMenuItem onClick={() => handleConvertToBill(p)}>
                                  <Receipt className="w-4 h-4 mr-2" /> Convert to Bill
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDelete(p.id)}>
                                <Trash2 className="w-4 h-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

      {/* Quick Preview */}
      {preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setPreview(null)}>
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-foreground">{preview.number || "Purchase Order"}</h3>
              <StatusBadge status={preview.status} />
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Supplier</p><p className="font-medium">{preview.contact_name || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Reference</p><p className="font-medium">{preview.reference || "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Issue Date</p><p className="font-medium">{fmtDate(preview.issue_date)}</p></div>
              <div><p className="text-xs text-muted-foreground">Delivery Date</p><p className="font-medium">{fmtDate(preview.delivery_date)}</p></div>
              {preview.project_name && <div><p className="text-xs text-muted-foreground">Project</p><p className="font-medium">{preview.project_name}</p></div>}
              {preview.work_order_name && <div><p className="text-xs text-muted-foreground">Work Order</p><p className="font-medium">{preview.work_order_name}</p></div>}
            </div>
            {(preview.line_items || []).length > 0 && (
              <div className="border border-border rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40"><tr>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Description</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Qty</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total</th>
                  </tr></thead>
                  <tbody>{(preview.line_items || []).filter(l => l.description).map((l, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-2">{l.description}</td>
                      <td className="px-3 py-2 text-right">{l.quantity}</td>
                      <td className="px-3 py-2 text-right font-medium">{l.total?.toFixed(2)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Total</span>
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