import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import {
  Package, Plus, Search, Pencil, Trash2, MoreVertical, Tag, Layers, Upload, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import ProductFormModal from "@/components/sales/ProductFormModal";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";

const TYPE_STYLES = {
  Product: "bg-blue-100 text-blue-700",
  Service: "bg-violet-100 text-violet-700",
};

function fmtPrice(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const DEFAULT_COLUMNS = ["code", "name", "type", "cost_price", "sale_price", "quantity"];

export default function Products() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [selected, setSelected] = useState([]);

  const COLUMN_LABELS = {
    code: "Code",
    name: "Name",
    type: "Type",
    cost_price: "Cost price",
    sale_price: "Sale price",
    quantity: "Quantity",
    unit: "Unit",
    sale_tax_rate: "Sales Tax %",
    purchase_tax_rate: "Purchase Tax %",
  };

  const ALL_COLUMNS = Object.keys(COLUMN_LABELS);

  const load = async () => {
    setLoading(true);
    const data = await base44.entities.Product.list("code", 500).catch(() => []);
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
    await Promise.all(selected.map(id => base44.entities.Product.delete(id)));
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
      await Promise.all(records.map(r => base44.entities.Product.create(r)));
      load();
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const countByType = (t) => products.filter(p => p.type === t).length;

  const toggleColumn = (col) => {
    setColumns(c => c.includes(col) ? c.filter(x => x !== col) : [...c, col]);
  };

  const renderCell = (p, col) => {
    switch (col) {
      case "code": return (
        <span className="inline-flex items-center px-2 py-0.5 rounded bg-muted text-xs font-mono font-semibold text-foreground border border-border">{p.code}</span>
      );
      case "name": return <span className="text-sm font-semibold text-foreground">{p.name || "—"}</span>;
      case "type": return (
        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[p.type] || "bg-muted text-muted-foreground"}`}>
          {p.type === "Service" ? <Tag className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
          {p.type || "—"}
        </span>
      );
      case "cost_price": return <span className="text-sm text-muted-foreground tabular-nums">{p.is_purchased ? fmtPrice(p.cost_price) : "—"}</span>;
      case "sale_price": return <span className="text-sm font-medium tabular-nums">{p.is_sold ? fmtPrice(p.sale_price) : "—"}</span>;
      case "quantity": return (
        <span className="text-sm tabular-nums">
          {p.track_inventory ? (p.quantity ?? 0) : <span className="text-muted-foreground/40">—</span>}
          {p.unit && p.track_inventory ? <span className="text-xs text-muted-foreground ml-1">{p.unit}</span> : null}
        </span>
      );
      case "unit": return <span className="text-sm text-muted-foreground">{p.unit || "—"}</span>;
      case "sale_tax_rate": return <span className="text-sm tabular-nums">{p.is_sold ? `${p.sale_tax_rate ?? 0}%` : "—"}</span>;
      case "purchase_tax_rate": return <span className="text-sm tabular-nums">{p.is_purchased ? `${p.purchase_tax_rate ?? 0}%` : "—"}</span>;
      default: return "—";
    }
  };

  return (
    <div className="space-y-5" onClick={() => setShowColumns(false)}>
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Products & Services</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage your item catalog for quotes and invoices</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <label>
            <Button variant="outline" className="gap-2 cursor-pointer" asChild>
              <span><Upload className="w-4 h-4" /> Import CSV</span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
          </label>
          <Button className="gap-2 shadow-sm" onClick={openAdd}>
            <Plus className="w-4 h-4" /> New item
          </Button>
        </div>
      </motion.div>

      {/* Summary cards */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.06 }}
        className="grid grid-cols-3 gap-3">
        {[
          { label: "Total items", value: products.length, color: "text-foreground" },
          { label: "Products", value: countByType("Product"), color: "text-blue-600" },
          { label: "Services", value: countByType("Service"), color: "text-violet-600" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Filters + column picker */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by code, name or description..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="Product">Product</SelectItem>
            <SelectItem value="Service">Service</SelectItem>
          </SelectContent>
        </Select>

        {/* Column picker */}
        <div className="relative" onClick={e => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="gap-2 h-9"
            onClick={() => setShowColumns(v => !v)}>
            <Layers className="w-4 h-4" /> Columns
          </Button>
          {showColumns && (
            <div className="absolute right-0 top-10 z-50 bg-popover border border-border rounded-xl shadow-xl p-4 w-56">
              <p className="text-sm font-semibold mb-1">Columns</p>
              <p className="text-xs text-muted-foreground mb-3">Select columns to show in the table.</p>
              <div className="space-y-2">
                {ALL_COLUMNS.map(col => (
                  <label key={col} className="flex items-center gap-2.5 text-sm cursor-pointer">
                    <input type="checkbox" checked={columns.includes(col)} onChange={() => toggleColumn(col)}
                      className="h-4 w-4 rounded accent-primary" />
                    {COLUMN_LABELS[col]}
                  </label>
                ))}
              </div>
              <div className="flex justify-between mt-4 pt-3 border-t border-border">
                <Button variant="ghost" size="sm" onClick={() => setColumns(DEFAULT_COLUMNS)}>Reset</Button>
                <Button size="sm" onClick={() => setShowColumns(false)}>Apply</Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl">
          <span className="text-sm font-medium">{selected.length} selected</span>
          <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs ml-auto" onClick={handleDeleteSelected}>
            <Trash2 className="w-3.5 h-3.5" /> Delete selected
          </Button>
        </div>
      )}

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading items...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No items found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterType !== "all" ? "Try adjusting your filters." : "Create your first product or service."}
            </p>
            {!search && filterType === "all" && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> New item</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll} className="h-4 w-4 rounded accent-primary cursor-pointer" />
                  </th>
                  {columns.map(col => (
                    <th key={col} className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {COLUMN_LABELS[col]}
                    </th>
                  ))}
                  <th className="px-4 py-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {pagination.pageItems.map(p => (
                    <motion.tr key={p.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="border-b border-border hover:bg-muted/20 transition-colors group cursor-pointer"
                      onClick={() => openEdit(p)}>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSelect(p.id)}
                          className="h-4 w-4 rounded accent-primary cursor-pointer" />
                      </td>
                      {columns.map(col => (
                        <td key={col} className="px-4 py-3">{renderCell(p, col)}</td>
                      ))}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground">
                                <MoreVertical className="w-3.5 h-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuItem onClick={() => openEdit(p)}>
                                <Pencil className="w-4 h-4 mr-2" /> Edit
                              </DropdownMenuItem>
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
      </motion.div>

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