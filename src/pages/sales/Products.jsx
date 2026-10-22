import React, { useState, useEffect } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Package, Plus, Search, Trash2, Upload, Download, Eye, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ProductFormModal from "@/components/sales/ProductFormModal";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { useToast } from "@/components/ui/use-toast";
import ProductSplitDetail from "@/components/sales/ProductSplitDetail";
import ProductFilesPopover from "@/components/sales/ProductFilesPopover";

function fmtPrice(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const COLUMN_DEFS = [
  { key: "code", label: "Code", required: true },
  { key: "name", label: "Name", required: true },
  { key: "cost_price", label: "Cost price", required: false },
  { key: "sale_price", label: "Sale price", required: false },
  { key: "quantity", label: "Quantity", required: false },
  { key: "unit", label: "Unit", required: false },
  { key: "sale_tax_rate", label: "Sales Tax %", required: false },
  { key: "purchase_tax_rate", label: "Purchase Tax %", required: false },
];

export default function Products() {
  const [products, setProducts] = useState([]);
  const { can } = usePermissionsMatrix();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("products");
  const [filterType, setFilterType] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("products_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { code: true, name: true, cost_price: true, sale_price: true, quantity: true, unit: false, sale_tax_rate: false, purchase_tax_rate: false };
  });
  const [selected, setSelected] = useState([]);
  const [splitId, setSplitId] = useState(null);

  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("products_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const activeColumns = COLUMN_DEFS.filter(c => visibleCols[c.key]);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Product.list("code", 5000).catch(() => []);
    setProducts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = products.filter(p => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      p.code?.toLowerCase().includes(s) ||
      p.name?.toLowerCase().includes(s) ||
      p.sale_description?.toLowerCase().includes(s);
    const matchType = filterType === "all" || p.type === filterType;
    return matchSearch && matchType;
  });

  const pagination = useTablePagination(filtered);

  const handleSave = async (form, duplicate = false) => {
    if (editing?.id) {
      await base44.entities.Product.update(editing.id, form);
    } else {
      await base44.entities.Product.create(form);
    }
    if (!duplicate) {
      setModal(false);
      setEditing(null);
    }
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this item?")) return;
    await base44.entities.Product.delete(id);
    load();
  };

  const handleDeleteSelected = async () => {
    if (!confirm(`Delete ${selected.length} selected item(s)?`)) return;
    const results = await Promise.allSettled(selected.map(id => base44.entities.Product.delete(id)));
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) {
      toast({ title: "Delete completed with errors", description: `${selected.length - failed} deleted, ${failed} failed.`, variant: "destructive" });
    }
    setSelected([]);
    load();
  };

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  const toggleAll = () => setSelected(s => s.length === filtered.length ? [] : filtered.map(p => p.id));

  const openEdit = (p) => { setEditing(p); setModal(true); };
  const openAdd  = () => { setEditing(null); setModal(true); };

  const handleExport = () => {
    const FIELDS = ["code", "name", "type", "unit", "is_sold", "sale_price", "sale_tax_rate", "sale_description", "is_purchased", "cost_price", "purchase_tax_rate", "purchase_description", "track_inventory", "quantity", "notes"];
    const header = FIELDS.join(",");
    const rows = products.map(p =>
      FIELDS.map(f => {
        const val = p[f] ?? "";
        const str = String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n") ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(",")
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "products.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const text = evt.target.result;
      const lines = text.trim().split("\n");
      const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
      const records = lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,))/g) || [];
        const obj = {};
        headers.forEach((h, i) => {
          let v = (vals[i] || "").trim().replace(/^"|"$/g, "").replace(/""/g, '"');
          if (v === "true") v = true;
          else if (v === "false") v = false;
          else if (v !== "" && !isNaN(v)) v = Number(v);
          obj[h] = v;
        });
        return obj;
      }).filter(r => r.code && r.name);
      const results = await Promise.allSettled(records.map(r => base44.entities.Product.create(r)));
      const succeeded = results.filter(r => r.status === "fulfilled").length;
      const failed = results.length - succeeded;
      if (failed > 0) {
        toast({ title: "Import completed with errors", description: `${succeeded} imported, ${failed} failed.`, variant: "destructive" });
      } else {
        toast({ title: "Import successful", description: `${succeeded} item(s) imported.` });
      }
      load();
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const countByType = (t) => products.filter(p => p.type === t).length;

  const renderCell = (p, col) => {
    switch (col) {
      case "code": return (
        <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-xs font-mono font-semibold text-foreground border border-border">{p.code}</span>
      );
      case "name": return <span className="text-xs font-semibold text-foreground">{p.name || "—"}</span>;
      case "cost_price": return <span className="text-xs font-medium tabular-nums text-foreground">{p.is_purchased ? fmtPrice(p.cost_price) : "—"}</span>;
      case "sale_price": return <span className="text-xs font-bold tabular-nums text-foreground">{p.is_sold ? fmtPrice(p.sale_price) : "—"}</span>;
      case "quantity": return (
        <span className="text-xs tabular-nums">
          {p.track_inventory ? (p.quantity ?? 0) : <span className="text-muted-foreground/40">—</span>}
          {p.unit && p.track_inventory ? <span className="text-xs text-muted-foreground ml-1">{p.unit}</span> : null}
        </span>
      );
      case "unit": return <span className="text-xs text-muted-foreground">{p.unit || "—"}</span>;
      case "sale_tax_rate": return <span className="text-xs tabular-nums">{p.is_sold ? `${p.sale_tax_rate ?? 0}%` : "—"}</span>;
      case "purchase_tax_rate": return <span className="text-xs tabular-nums">{p.is_purchased ? `${p.purchase_tax_rate ?? 0}%` : "—"}</span>;
      default: return "—";
    }
  };

  const openSplitDetail = (p) => setSplitId(p.id);
  const closeSplit = () => setSplitId(null);
  const splitDoc = products.find(p => p.id === splitId) || null;
  const splitIndex = splitId ? filtered.findIndex(p => p.id === splitId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = filtered[splitIndex + dir];
    if (next) setSplitId(next.id);
  };

  const renderTable = (compact) => (
    <div>
      <div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading items...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No items found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterType !== "all" ? "Try adjusting your filters." : "Create your first product or service."}
            </p>
            {!search && filterType === "all" && can("products", "can_create") && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> New item</Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-slate-300 dark:border-slate-700 bg-white/50 dark:bg-slate-800/50">
                 <th className="px-3 py-3 w-10">
                   <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0}
                     onChange={toggleAll} className="h-4 w-4 rounded accent-primary cursor-pointer" />
                 </th>
                 <th className="px-3 py-3 w-10 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">View</th>
                 <th className="px-3 py-3 w-10 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">Files</th>
                 {activeColumns.map(col => (
                   <th key={col.key} className="px-4 py-3 text-left text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">{col.label}</th>
                 ))}
               </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pagination.pageItems.map(p => {
                  const isActive = p.id === splitId;
                  return (
                    <motion.tr key={p.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className={`border-b border-slate-200 dark:border-slate-700 hover:bg-primary/[0.06] transition-colors group ${isActive ? "bg-primary/10" : ""}`}>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded accent-primary cursor-pointer" />
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Split preview" onClick={() => openSplitDetail(p)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <ProductFilesPopover product={p} />
                      </td>
                      {activeColumns.map(col => (
                        <td key={col.key} className="px-4 py-3 cursor-pointer" onClick={() => openSplitDetail(p)}>{renderCell(p, col.key)}</td>
                      ))}
                    </motion.tr>
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
        <h1 className="text-xl font-bold text-foreground mb-3">Products & Services</h1>
        <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export CSV
          </Button>
          <label>
            <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs cursor-pointer" asChild>
              <span><Upload className="w-3.5 h-3.5" /> Import CSV</span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </label>
          {can("products", "can_create") && (
            <Button className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm h-8 text-xs px-3" onClick={openAdd}>
              <Plus className="w-3.5 h-3.5" /> New item
            </Button>
          )}
        </div>
        <div className="flex items-stretch gap-0 overflow-x-auto -mb-px">
          {[
            { key: "all", label: "All", count: products.length },
            { key: "Product", label: "Products", count: countByType("Product") },
            { key: "Service", label: "Services", count: countByType("Service") },
          ].map(tab => {
            const active = filterType === tab.key;
            return (
              <button key={tab.key} onClick={() => setFilterType(tab.key)}
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

      {/* Stats */}
      <div className="bg-card border-b border-border px-6 py-3">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total items", value: products.length, color: "text-foreground" },
            { label: "Products", value: countByType("Product"), color: "text-blue-600" },
            { label: "Services", value: countByType("Service"), color: "text-violet-600" },
          ].map(s => (
            <div key={s.label} className="bg-muted/30 rounded-xl border border-border p-3 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters + bulk */}
      <div className="bg-card border-b border-border px-6 py-3 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by code, name or description..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
        {selected.length > 0 && (
          <Button size="sm" variant="destructive" className="gap-1.5 h-8 text-xs" onClick={handleDeleteSelected}>
            <Trash2 className="w-3.5 h-3.5" /> Delete selected ({selected.length})
          </Button>
        )}
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card">
        <div className={splitId ? "w-[65%] min-w-0 flex flex-col" : "flex-1 min-w-0 flex flex-col"}>
          {renderTable(splitId !== null)}
        </div>
        {splitId && (
          <div className="w-[35%] min-w-0 flex flex-col">
            <ProductSplitDetail
              product={splitDoc}
              onClose={closeSplit}
              onEdit={(p) => openEdit(p)}
              onPrev={() => navSplit(-1)}
              onNext={() => navSplit(1)}
            />
          </div>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

      <ProductFormModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave}
        product={editing}
      />
    </div>
  );
}