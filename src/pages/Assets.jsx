import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Package, Pencil, Trash2,
  Upload, Download, MapPin, User, FolderKanban, Calendar
} from "lucide-react";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AssetFormModal from "@/components/assets/AssetFormModal";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { visibleKeys } from "@/lib/visibleColumns";

const STATUS_STYLES = {
  Available:         "bg-emerald-500/10 text-emerald-400",
  "In Use":          "bg-sky-500/10 text-sky-400",
  "Under Maintenance": "bg-amber-500/10 text-amber-400",
  Retired:           "bg-zinc-500/10 text-zinc-500",
};

const CATEGORY_STYLES = {
  Crane:     "bg-indigo-500/10 text-indigo-400",
  Hoist:     "bg-sky-500/10 text-sky-400",
  Platform:  "bg-teal-500/10 text-teal-400",
  Vehicle:   "bg-orange-500/10 text-orange-400",
  Tool:      "bg-purple-500/10 text-purple-400",
  Equipment: "bg-zinc-500/10 text-zinc-400",
  Other:     "bg-zinc-500/10 text-zinc-500",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCurrency(amount, currency = "USD") {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

export default function Assets() {
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [assetGroups, setAssetGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { sortKey, sortDir, handleSort, applySorting } = useSortable();

  const COLUMN_DEFS = [
    { key: "reference",  label: "Reference", required: false },
    { key: "name",       label: "Asset",     required: true },
    { key: "category",   label: "Category",  required: false },
    { key: "status",     label: "Status",    required: false },
    { key: "contact",    label: "Contact",   required: false },
    { key: "project",    label: "Project",   required: false },
    { key: "location",   label: "Location",   required: false },
    { key: "purchase",   label: "Purchase",  required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("assets_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, name: true, category: true, status: true, contact: true, project: true, location: true, purchase: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("assets_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const [a, c, p, wo, ag] = await Promise.all([
      base44.entities.Asset.list("-created_date", 500),
      base44.entities.Contact.list("full_name", 200),
      base44.entities.Project.list("name", 200),
      base44.entities.WorkOrder.list("title", 200),
      base44.entities.AssetGroup.list("name", 200),
    ]);
    setAssets(a);
    setContacts(c);
    setProjects(p);
    setWorkOrders(wo);
    setAssetGroups(ag);
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "true") { openAdd(); window.history.replaceState({}, "", "/assets"); }
  }, []);

  const sorted = applySorting(assets.filter(a => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      a.name?.toLowerCase().includes(s) ||
      a.reference?.toLowerCase().includes(s) ||
      a.serial_number?.toLowerCase().includes(s) ||
      a.contact_name?.toLowerCase().includes(s) ||
      a.project_name?.toLowerCase().includes(s) ||
      a.manufacturer?.toLowerCase().includes(s) ||
      a.location?.toLowerCase().includes(s);
    const matchCat = filterCategory === "all" || a.category === filterCategory;
    const matchStat = filterStatus === "all" || a.status === filterStatus;
    const matchGroup = filterGroup === "all" || a.group_id === filterGroup;
    return matchSearch && matchCat && matchStat && matchGroup;
  }));
  const filtered = sorted;
  const vis = visibleKeys(filtered, {
    reference: a => a.reference,
    category: a => a.category,
    status: a => a.status,
    contact: a => a.contact_name,
    project: a => a.project_name,
    location: a => a.location,
    purchase: a => a.purchase_price || a.purchase_date,
  });
  const colVis = {
    reference: visibleCols.reference && vis.has("reference"),
    category: visibleCols.category && vis.has("category"),
    status: visibleCols.status && vis.has("status"),
    contact: visibleCols.contact && vis.has("contact"),
    project: visibleCols.project && vis.has("project"),
    location: visibleCols.location && vis.has("location"),
    purchase: visibleCols.purchase && vis.has("purchase"),
  };
  const pagination = useTablePagination(filtered);

  const handleSave = async (form) => {
    let savedAsset;
    if (editing) {
      savedAsset = await base44.entities.Asset.update(editing.id, form);
    } else {
      savedAsset = await base44.entities.Asset.create(form);
    }
    const assetId = savedAsset?.id || editing?.id;
    const newWOIds = Array.isArray(form.work_order_ids) ? form.work_order_ids : (form.work_order_id ? [form.work_order_id] : []);
    // Sync: set asset reference on newly linked work orders, clear on removed ones
    const prevWOIds = Array.isArray(editing?.work_order_ids) && editing.work_order_ids.length > 0
      ? editing.work_order_ids
      : editing?.work_order_id ? [editing.work_order_id] : [];
    const removed = prevWOIds.filter(wid => !newWOIds.includes(wid));
    const added = newWOIds.filter(wid => !prevWOIds.includes(wid));
    const kept = newWOIds.filter(wid => prevWOIds.includes(wid));
    for (const wid of removed) {
      await base44.entities.WorkOrder.update(wid, { asset_id: "", asset_name: "" });
    }
    for (const wid of added) {
      await base44.entities.WorkOrder.update(wid, { asset_id: assetId, asset_name: form.name });
    }

    // If the asset name changed, propagate the new name to kept work orders
    // and to all tasks linked to this asset (directly or via its work orders).
    const nameChanged = editing && (form.name || "") !== (editing.name || "");
    if (nameChanged) {
      try {
        for (const wid of kept) {
          await base44.entities.WorkOrder.update(wid, { asset_name: form.name });
        }
        // Tasks directly linked to this asset
        await base44.entities.Task.updateMany({ asset_id: assetId }, { $set: { asset_name: form.name } });
        // Tasks linked via any work order of this asset
        for (const wid of newWOIds) {
          await base44.entities.Task.updateMany({ work_order_id: wid }, { $set: { asset_name: form.name } });
        }
      } catch (e) { console.error("Failed to sync asset name to tasks/work orders", e); }
    }

    setModal(false); setEditing(null); load(true);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this asset?")) return;
    await base44.entities.Asset.delete(id); load();
  };

  const openEdit = (a) => { setEditing(a); setModal(true); };
  const openAdd  = () => { setEditing(null); setModal(true); };

  const handleExport = () => {
    const headers = ["name","reference","serial_number","category","status","manufacturer","model","year","contact_name","project_name","purchase_date","purchase_price","currency","location","notes"];
    const rows = filtered.map(a => headers.map(h => `"${(a[h] ?? "").toString().replace(/"/g,'""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "assets.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const lines = evt.target.result.split("\n").filter(Boolean);
      const headers = lines[0].split(",").map(h => h.replace(/"/g,"").trim());
      const records = lines.slice(1).map(line => {
        const vals = line.match(/(".*?"|[^,]+|(?<=,)(?=,))/g) || [];
        const obj = {};
        headers.forEach((h, i) => { obj[h] = (vals[i] || "").replace(/^"|"$/g,"").trim(); });
        return obj;
      }).filter(r => r.name);
      for (const r of records) await base44.entities.Asset.create(r);
      load();
    };
    reader.readAsText(file); e.target.value = "";
  };

  const stats = [
    { label: "Total",              value: assets.length,                                             color: "text-foreground" },
    { label: "Available",          value: assets.filter(a => a.status === "Available").length,       color: "text-emerald-600" },
    { label: "In Use",             value: assets.filter(a => a.status === "In Use").length,          color: "text-blue-600" },
    { label: "Under Maintenance",  value: assets.filter(a => a.status === "Under Maintenance").length, color: "text-amber-600" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="space-y-5 max-w-[1200px] mx-auto px-6 py-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground" style={{ letterSpacing: "-0.02em" }}>Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">Equipment, machinery & asset tracking</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate("/settings/import-center?entity=Asset")}>
            <Upload className="w-3.5 h-3.5" /> Import
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
            <Download className="w-3.5 h-3.5" /> Export
          </Button>
          <Button className="gap-2 shadow-sm" onClick={openAdd}>
            <Plus className="w-4 h-4" /> New Asset
          </Button>
        </div>
      </motion.div>

      {/* Status tab bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="flex flex-wrap gap-1 border-b border-border pb-0">
        {[
          { key: "all", label: "All", count: assets.length },
          { key: "Available", label: "Available", count: assets.filter(a => a.status === "Available").length },
          { key: "In Use", label: "In Use", count: assets.filter(a => a.status === "In Use").length },
          { key: "Under Maintenance", label: "Maintenance", count: assets.filter(a => a.status === "Under Maintenance").length },
          { key: "Retired", label: "Retired", count: assets.filter(a => a.status === "Retired").length },
        ].filter(tab => tab.key === "all" || tab.count > 0).map(tab => (
          <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              filterStatus === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.label} <span className="ml-1 text-xs">{tab.count}</span>
          </button>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
        className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search name, serial, reference, contact, project..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {["Crane","Hoist","Platform","Vehicle","Tool","Equipment","Other"].map(c =>
              <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterGroup} onValueChange={setFilterGroup}>
          <SelectTrigger className="w-40"><SelectValue placeholder="All Groups" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {assetGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading assets...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Package className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No assets found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterCategory !== "all" || filterStatus !== "all"
                ? "Try adjusting your filters." : "Create your first asset to get started."}
            </p>
            {!search && filterCategory === "all" && filterStatus === "all" && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> New Asset</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {colVis.reference && <SortableTh colKey="reference" label="Reference" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-32" />}
                  <SortableTh colKey="name" label="Asset" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  {colVis.category && <SortableTh colKey="category" label="Category" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  {colVis.status && <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  {colVis.contact && <SortableTh colKey="contact_name" label="Contact" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  {colVis.project && <SortableTh colKey="project_name" label="Project" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  {colVis.location && <SortableTh colKey="location" label="Location" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  {colVis.purchase && <SortableTh colKey="purchase_date" label="Purchase" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {pagination.pageItems.map(a => (
                    <motion.tr key={a.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="border-b border-border hover:bg-muted/30 transition-colors group">
                      {colVis.reference && (
                        <td className="px-4 py-3" onClick={() => navigate(`/assets/${a.id}`)}>
                          {a.reference
                            ? <span className="font-mono text-xs text-primary font-medium cursor-pointer">{a.reference}</span>
                            : <span className="text-xs text-muted-foreground/30">—</span>}
                        </td>
                      )}
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/assets/${a.id}`)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground hover:text-primary transition-colors leading-tight">{a.name}</p>
                          {a.group_id && (() => { const g = assetGroups.find(x => x.id === a.group_id); return g ? <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: (g.color || "#6366f1") + "22", color: g.color || "#6366f1" }}>{g.name}</span> : null; })()}
                        </div>
                        {a.serial_number && <p className="text-xs text-muted-foreground/60 mt-0.5">{a.serial_number}</p>}
                        {(a.manufacturer || a.model) && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">{[a.manufacturer, a.model, a.year].filter(Boolean).join(" · ")}</p>
                        )}
                      </td>
                      {colVis.category && (
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CATEGORY_STYLES[a.category] || CATEGORY_STYLES.Other}`}>
                            {a.category || "Other"}
                          </span>
                        </td>
                      )}
                      {colVis.status && (
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[a.status] || STATUS_STYLES.Available}`}>
                            {a.status || "Available"}
                          </span>
                        </td>
                      )}
                      {colVis.contact && (
                        <td className="px-4 py-3">
                          {a.contact_name
                            ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><User className="w-3 h-3 shrink-0" />{a.contact_name}</span>
                            : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                      )}
                      {colVis.project && (
                        <td className="px-4 py-3">
                          {a.project_name
                            ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><FolderKanban className="w-3 h-3 shrink-0" />{a.project_name}</span>
                            : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                      )}
                      {colVis.location && (
                        <td className="px-4 py-3">
                          {a.location
                            ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3 h-3 shrink-0" />{a.location}</span>
                            : <span className="text-xs text-muted-foreground/40">—</span>}
                        </td>
                      )}
                      {colVis.purchase && (
                        <td className="px-4 py-3">
                          <div className="text-xs">
                            {a.purchase_price ? <p className="font-semibold text-foreground">{fmtCurrency(a.purchase_price, a.currency)}</p> : null}
                            {a.purchase_date ? <p className="text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(a.purchase_date)}</p> : null}
                            {!a.purchase_price && !a.purchase_date && <span className="text-muted-foreground/40">—</span>}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(a.id)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
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

      <AssetFormModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave}
        asset={editing}
        contacts={contacts}
        projects={projects}
        workOrders={workOrders}
      />
      </div>
    </div>
  );
}