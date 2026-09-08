import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, Plus, Search, Pencil, Trash2,
  MapPin, FolderKanban, Calendar, User, Package, Square, CheckSquare,
  Archive, ArchiveRestore, Download
} from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WorkOrderFormModal from "@/components/workorders/WorkOrderFormModal";
import { fetchAllBatched } from "@/lib/batchedFetch";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { visibleKeys } from "@/lib/visibleColumns";

const STATUS_STYLES = {
  Active:    "bg-emerald-100 text-emerald-700",
  "On Hold": "bg-amber-100 text-amber-700",
  Archived:  "bg-slate-100 text-slate-500",
};

const PRIORITY_STYLES = {
  Low:    "bg-slate-100 text-slate-500",
  Medium: "bg-blue-100 text-blue-700",
  High:   "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
};

const TYPE_STYLES = {
  Maintenance:  "bg-indigo-100 text-indigo-700",
  Repair:       "bg-red-100 text-red-700",
  Inspection:   "bg-sky-100 text-sky-700",
  Installation: "bg-teal-100 text-teal-700",
  Other:        "bg-slate-100 text-slate-500",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function WorkOrders() {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterContactId, setFilterContactId] = useState(null);
  const [filterContactName, setFilterContactName] = useState(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { sortKey, sortDir, handleSort, applySorting } = useSortable();

  const load = async () => {
    setLoading(true);
    const [wo, p, a] = await Promise.all([
      fetchAllBatched((s, l, sk) => base44.entities.WorkOrder.list(s, l, sk), "-created_date"),
      base44.entities.Project.list("name", 200),
      base44.entities.Asset.list("name", 200),
    ]);
    setWorkOrders(wo);
    setProjects(p);
    setAssets(a);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get("contact_id");
    if (cid) {
      setFilterContactId(cid);
      const found = workOrders.find(w => w.contact_id === cid);
      setFilterContactName(found?.contact_name || "Client");
    }
    if (params.get("create") === "true") { openAdd(); window.history.replaceState({}, "", "/work-orders"); }
  }, []);

  const sorted = applySorting(workOrders.filter(w => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      w.title?.toLowerCase().includes(s) ||
      w.reference?.toLowerCase().includes(s) ||
      w.project_name?.toLowerCase().includes(s) ||
      w.assigned_to?.toLowerCase().includes(s) ||
      w.location?.toLowerCase().includes(s) ||
      w.contact_name?.toLowerCase().includes(s) ||
      w.asset_name?.toLowerCase().includes(s) ||
      w.type?.toLowerCase().includes(s) ||
      w.status?.toLowerCase().includes(s);
    const matchStatus = filterStatus === "all" || w.status === filterStatus;
    const matchType = filterType === "all" || w.type === filterType;
    const matchContact = !filterContactId || w.contact_id === filterContactId;
    return matchSearch && matchStatus && matchType && matchContact;
  }));
  const filtered = sorted;
  const pagination = useTablePagination(filtered);
  const vis = visibleKeys(filtered, {
    reference: w => w.reference,
    type: w => w.type,
    priority: w => w.priority,
    project_name: w => w.project_name,
    asset_name: w => w.asset_name,
    contact_name: w => w.contact_name,
    due_date: w => w.due_date,
  });

  const handleSave = async (form) => {
    // Pull out the staged contact person — it is not a WorkOrder field
    const { _pending_contact_person, ...woData } = form;
    let savedWO;
    if (editing) {
      savedWO = await base44.entities.WorkOrder.update(editing.id, woData);
      // If asset link changed, update the old asset too
      const prevAssetId = editing.asset_id;
      if (prevAssetId && prevAssetId !== form.asset_id) {
        await base44.entities.Asset.update(prevAssetId, { work_order_id: "", work_order_name: "" });
      }
    } else {
      savedWO = await base44.entities.WorkOrder.create(woData);
    }
    // Sync asset: update linked asset with this work order reference
    const woId = savedWO?.id || editing?.id;
    if (form.asset_id) {
      await base44.entities.Asset.update(form.asset_id, { work_order_id: woId, work_order_name: form.title });
    }
    // Create the staged contact person, linked to this work order + project + client (ascends up)
    if (_pending_contact_person && woId) {
      await base44.entities.ContactPerson.create({
        full_name: _pending_contact_person.full_name,
        role: _pending_contact_person.role,
        phone: _pending_contact_person.phone,
        contact_id: form.contact_id || undefined,
        contact_name: form.contact_name || undefined,
        project_id: form.project_id || undefined,
        project_name: form.project_name || undefined,
        work_order_id: woId,
        work_order_name: form.title,
      });
    }
    setModal(false); setEditing(null); load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this work order?")) return;
    await base44.entities.WorkOrder.delete(id); load();
  };

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const handleArchive = async (id, archive) => {
    await base44.entities.WorkOrder.update(id, { status: archive ? "Archived" : "Active" });
    load();
  };
  const handleArchiveSelected = async (archive) => {
    setArchiving(true);
    await Promise.all([...selectedIds].map(id => base44.entities.WorkOrder.update(id, { status: archive ? "Archived" : "Active" }).catch(() => {})));
    setSelectedIds(new Set());
    setArchiving(false);
    load();
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(w => w.id)));
  };
  const handleDeleteSelected = async () => {
    setDeleting(true);
    await Promise.all([...selectedIds].map(id => base44.entities.WorkOrder.delete(id).catch(() => {})));
    setSelectedIds(new Set());
    setDeleting(false);
    load();
  };

  const openEdit = (w) => { setEditing(w); setModal(true); };
  const openAdd  = () => { setEditing(null); setModal(true); };

  const exportCSV = () => {
    exportToCSV(`work-orders-${new Date().toISOString().slice(0, 10)}`, [
      { key: "reference", label: "Reference" },
      { key: "title", label: "Title" },
      { key: "type", label: "Category" },
      { key: "status", label: "Status" },
      { key: "priority", label: "Priority" },
      { key: "project_name", label: "Project" },
      { key: "asset_name", label: "Asset" },
      { key: "contact_name", label: "Company" },
      { key: "location", label: "Location" },
      { key: "assigned_to", label: "Assigned To" },
      { key: "due_date", label: "Due Date" },
      { key: "created_date", label: "Created Date" },
    ], filtered);
  };

  const stats = [
    { label: "Total",    value: workOrders.length,                                       color: "text-foreground" },
    { label: "Active",   value: workOrders.filter(w => w.status === "Active").length,    color: "text-emerald-600" },
    { label: "On Hold",  value: workOrders.filter(w => w.status === "On Hold").length,   color: "text-amber-600" },
    { label: "Archived", value: workOrders.filter(w => w.status === "Archived").length,  color: "text-slate-500" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <ClipboardList className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Work Orders</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Field service & work order management</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <Button className="gap-2 shadow-sm" onClick={openAdd}>
            <Plus className="w-4 h-4" /> New Work Order
          </Button>
        </div>
      </motion.div>

      {/* Status tab bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="flex flex-wrap gap-1 border-b border-border pb-0">
        {[
          { key: "all", label: "All", count: workOrders.length },
          { key: "Active", label: "Active", count: workOrders.filter(w => w.status === "Active").length },
          { key: "On Hold", label: "On Hold", count: workOrders.filter(w => w.status === "On Hold").length },
          { key: "Archived", label: "Archived", count: workOrders.filter(w => w.status === "Archived").length },
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

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} work order{selectedIds.size > 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs" disabled={archiving}
              onClick={() => handleArchiveSelected(true)}>
              <Archive className="w-3.5 h-3.5" /> {archiving ? "Archiving..." : "Archive Selected"}
            </Button>
            <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs" disabled={archiving}
              onClick={() => handleArchiveSelected(false)}>
              <ArchiveRestore className="w-3.5 h-3.5" /> Restore
            </Button>
            <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs" disabled={deleting} onClick={handleDeleteSelected}>
              <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting..." : "Delete Selected"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Filters */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
        className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search title, reference, project, assignee..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {["Maintenance","Repair","Inspection","Installation","Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {filterContactId && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5 text-sm">
            <User className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground font-medium">{filterContactName}</span>
            <button onClick={() => { setFilterContactId(null); setFilterContactName(null); window.history.replaceState({}, "", "/work-orders"); }}
              className="ml-1 text-xs text-primary hover:underline">Clear filter</button>
          </div>
        )}
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading work orders...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No work orders found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterStatus !== "all" || filterType !== "all"
                ? "Try adjusting your filters." : "Create your first work order to get started."}
            </p>
            {!search && filterStatus === "all" && filterType === "all" && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> New Work Order</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="w-10 px-3 py-3 cursor-pointer" onClick={toggleSelectAll}>
                    {filtered.length > 0 && filtered.every(w => selectedIds.has(w.id))
                      ? <CheckSquare className="w-4 h-4 text-primary" />
                      : <Square className="w-4 h-4 text-muted-foreground" />}
                  </th>
                 {vis.has("reference") && <SortableTh colKey="reference" label="Ref" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell w-32" />}
                 <SortableTh colKey="title" label="Work Order" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                 {vis.has("type") && <SortableTh colKey="type" label="Category" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />}
                 <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                 {vis.has("priority") && <SortableTh colKey="priority" label="Priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />}
                 {vis.has("project_name") && <SortableTh colKey="project_name" label="Project" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />}
                 {vis.has("asset_name") && <SortableTh colKey="asset_name" label="Asset" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                 {vis.has("contact_name") && <SortableTh colKey="contact_name" label="Company" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />}
                 {vis.has("due_date") && <SortableTh colKey="due_date" label="Due Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {pagination.pageItems.map(w => (
                    <motion.tr key={w.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      onClick={() => navigate(`/work-orders/${w.id}`)}
                      className={`border-b border-border hover:bg-muted/30 transition-colors group cursor-pointer ${selectedIds.has(w.id) ? "bg-primary/5" : ""}`}>
                      <td className="px-3 py-3 w-10" onClick={e => toggleSelect(w.id, e)}>
                        {selectedIds.has(w.id)
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4 text-muted-foreground" />}
                      </td>
                      {vis.has("reference") && (
                      <td className="px-4 py-3 hidden sm:table-cell w-32">
                        {w.reference
                          ? <span className="text-xs font-mono text-primary hover:underline cursor-pointer">{w.reference}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      <td className="px-4 py-3">
                        <p className="text-sm font-semibold text-foreground leading-tight">{w.title}</p>
                        {w.location && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />{w.location}
                          </span>
                        )}
                      </td>
                      {vis.has("type") && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[w.type] || TYPE_STYLES.Other}`}>
                          {w.type || "Other"}
                        </span>
                      </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[w.status] || STATUS_STYLES.Active}`}>
                          {w.status || "Active"}
                        </span>
                      </td>
                      {vis.has("priority") && (
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PRIORITY_STYLES[w.priority] || PRIORITY_STYLES.Medium}`}>
                          {w.priority || "Medium"}
                        </span>
                      </td>
                      )}
                      {vis.has("project_name") && (
                      <td className="px-4 py-3 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                        {w.project_name
                          ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><FolderKanban className="w-3 h-3 shrink-0" />{w.project_name}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      {vis.has("asset_name") && (
                      <td className="px-4 py-3 hidden xl:table-cell" onClick={e => e.stopPropagation()}>
                        {w.asset_name
                          ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Package className="w-3 h-3 shrink-0" />{w.asset_name}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      {vis.has("contact_name") && (
                      <td className="px-4 py-3 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                        {w.contact_name
                          ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><User className="w-3 h-3 shrink-0" />{w.contact_name}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      {vis.has("due_date") && (
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {w.due_date
                          ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="w-3 h-3 shrink-0" />{fmtDate(w.due_date)}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                           <Button size="icon" variant="ghost" className="h-7 w-7" title={w.status === "Archived" ? "Restore" : "Archive"}
                             onClick={e => { e.stopPropagation(); handleArchive(w.id, w.status !== "Archived"); }}>
                             {w.status === "Archived" ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                           </Button>
                           <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(w); }}>
                             <Pencil className="w-3.5 h-3.5" />
                           </Button>
                           <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); handleDelete(w.id); }}>
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

      <WorkOrderFormModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave}
        workOrder={editing}
        projects={projects}
        assets={assets}
      />
    </div>
  );
}