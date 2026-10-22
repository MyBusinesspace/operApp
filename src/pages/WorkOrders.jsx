import React, { useState, useEffect } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { formatDateValue, todayLocalISO } from "@/lib/dateOnly";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ClipboardList, Plus, Search, Pencil, Trash2,
  MapPin, FolderKanban, Calendar, User, Package, Square, CheckSquare,
  Archive, ArchiveRestore, Download, Eye, Paperclip, X, ChevronRight
} from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { Button } from "@/components/ui/button";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WorkOrderFormModal from "@/components/workorders/WorkOrderFormModal";
import WorkOrderSplitDetail from "@/components/workorders/WorkOrderSplitDetail";
import WorkOrderFilesViewer from "@/components/workorders/WorkOrderFilesViewer";
import { fetchAllBatched } from "@/lib/batchedFetch";
import { withRetry } from "@/lib/apiHelpers";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { visibleKeys } from "@/lib/visibleColumns";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";

const STATUS_TEXT = {
  Active:    "text-emerald-600 dark:text-emerald-500",
  "On Hold": "text-amber-600 dark:text-amber-500",
  Archived:  "text-slate-500 dark:text-slate-400",
};

const PRIORITY_TEXT = {
  Low:    "text-slate-500 dark:text-slate-400",
  Medium: "text-blue-600 dark:text-blue-500",
  High:   "text-orange-600 dark:text-orange-500",
  Urgent: "text-red-600 dark:text-red-500",
};

const TYPE_TEXT = {
  Maintenance:  "text-indigo-600 dark:text-indigo-500",
  Repair:       "text-red-600 dark:text-red-500",
  Inspection:   "text-sky-600 dark:text-sky-500",
  Installation: "text-teal-600 dark:text-teal-500",
  Other:        "text-slate-500 dark:text-slate-400",
};

function fmtDate(d) {
  if (!d) return "—";
  return formatDateValue(d);
}

export default function WorkOrders() {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState([]);
  const { can } = usePermissionsMatrix();
  const [projects, setProjects] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("work_orders");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterContactId, setFilterContactId] = useState(null);
  const [filterContactName, setFilterContactName] = useState(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { sortKey, sortDir, handleSort, applySorting } = useSortable();

  // Split view
  const [splitMode, setSplitMode] = useState(null); // null | 'detail' | 'files'
  const [splitId, setSplitId] = useState(null);
  const [filesId, setFilesId] = useState(null);
  const [fileCounts, setFileCounts] = useState({});

  const load = async () => {
    setLoading(true);
    // Stagger calls (not Promise.all) + retry on rate limit to avoid burst errors
    const wo = await withRetry(() => fetchAllBatched((s, l, sk) => base44.entities.WorkOrder.list(s, l, sk), "-created_date"));
    const p = await withRetry(() => base44.entities.Project.list("name", 200)).catch(() => []);
    const a = await withRetry(() => base44.entities.Asset.list("name", 200)).catch(() => []);
    const wf = await withRetry(() => base44.entities.WorkOrderFile.list("created_date", 5000)).catch(() => []);
    setWorkOrders(wo);
    setProjects(p);
    setAssets(a);
    const counts = {};
    (wf || []).forEach(f => { counts[f.work_order_id] = (counts[f.work_order_id] || 0) + 1; });
    setFileCounts(counts);
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

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "title", label: "Work Order", required: true },
    { key: "type", label: "Category", required: false },
    { key: "status", label: "Status", required: false },
    { key: "priority", label: "Priority", required: false },
    { key: "project_name", label: "Project", required: false },
    { key: "asset_name", label: "Asset", required: false },
    { key: "contact_name", label: "Company", required: false },
    { key: "due_date", label: "Due Date", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("workorders_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, title: true, type: true, status: true, priority: true, project_name: true, asset_name: true, contact_name: true, due_date: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("workorders_visible_cols", JSON.stringify(next));
      return next;
    });
  };
  const colVis = {
    reference: visibleCols.reference && vis.has("reference"),
    type: visibleCols.type && vis.has("type"),
    priority: visibleCols.priority && vis.has("priority"),
    project_name: visibleCols.project_name && vis.has("project_name"),
    asset_name: visibleCols.asset_name && vis.has("asset_name"),
    contact_name: visibleCols.contact_name && vis.has("contact_name"),
    due_date: visibleCols.due_date && vis.has("due_date"),
  };

  const handleSave = async (form) => {
    const { _pending_contact_person, ...woData } = form;
    let savedWO;
    if (editing) {
      savedWO = await base44.entities.WorkOrder.update(editing.id, woData);
      const prevAssetId = editing.asset_id;
      if (prevAssetId && prevAssetId !== form.asset_id) {
        await base44.entities.Asset.update(prevAssetId, { work_order_id: "", work_order_name: "" });
      }
    } else {
      savedWO = await base44.entities.WorkOrder.create(woData);
    }
    const woId = savedWO?.id || editing?.id;
    if (form.asset_id) {
      await base44.entities.Asset.update(form.asset_id, { work_order_id: woId, work_order_name: form.title });
    }
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
    await Promise.all([...selectedIds].map(id => base44.entities.WorkOrder.update(id, { status: archive ? "Archived" : "Active" }).catch(err => console.error(err))));
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
    await Promise.all([...selectedIds].map(id => base44.entities.WorkOrder.delete(id).catch(err => console.error(err))));
    setSelectedIds(new Set());
    setDeleting(false);
    load();
  };

  const openEdit = (w) => { setEditing(w); setModal(true); };
  const openAdd  = () => { setEditing(null); setModal(true); };

  const openSplitDetail = (w) => { setSplitMode("detail"); setSplitId(w.id); setFilesId(null); };
  const openSplitFiles = (w) => { setSplitMode("files"); setFilesId(w.id); setSplitId(null); };
  const closeSplit = () => { setSplitMode(null); setSplitId(null); setFilesId(null); };
  const splitWorkOrder = workOrders.find(w => w.id === splitId) || null;
  const filesWorkOrder = workOrders.find(w => w.id === filesId) || null;
  const splitIndex = splitId ? sorted.findIndex(w => w.id === splitId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = sorted[splitIndex + dir];
    if (next) setSplitId(next.id);
  };
  const fileCountFor = (w) => fileCounts[w.id] || 0;

  const exportCSV = () => {
    exportToCSV(`work-orders-${todayLocalISO()}`, [
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

  const renderTable = (compact) => (
    <div>
      <div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading work orders...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No work orders found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterStatus !== "all" || filterType !== "all"
                ? "Try adjusting your filters." : "Create your first work order to get started."}
            </p>
            {!search && filterStatus === "all" && filterType === "all" && can("work_orders", "can_create") && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> New Work Order</Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-3 cursor-pointer" onClick={toggleSelectAll}>
                  {filtered.length > 0 && filtered.every(w => selectedIds.has(w.id))
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : <Square className="w-4 h-4 text-muted-foreground" />}
                </th>
                <th className="px-3 py-3 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">View</th>
               {colVis.reference && <SortableTh colKey="reference" label="Ref" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell w-32" />}
               <SortableTh colKey="title" label="Work Order" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
               {colVis.type && <SortableTh colKey="type" label="Category" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />}
               <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
               {colVis.priority && <SortableTh colKey="priority" label="Priority" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />}
               {colVis.project_name && <SortableTh colKey="project_name" label="Project" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />}
               {colVis.asset_name && <SortableTh colKey="asset_name" label="Asset" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
               {colVis.contact_name && <SortableTh colKey="contact_name" label="Company" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />}
               {colVis.due_date && <SortableTh colKey="due_date" label="Due Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                <th className="px-3 py-3 w-16 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pagination.pageItems.map((w, idx) => {
                  const isActive = splitMode === "detail" && w.id === splitId;
                  const stripe = idx % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/30" : "";
                  return (
                    <motion.tr key={w.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className={`border-b border-border hover:bg-primary/[0.06] transition-colors group ${selectedIds.has(w.id) ? "bg-primary/10" : ""} ${isActive ? "bg-primary/10" : stripe}`}>
                      <td className="px-3 py-3 w-10" onClick={e => toggleSelect(w.id, e)}>
                        {selectedIds.has(w.id)
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4 text-muted-foreground" />}
                      </td>
                      <td className="px-3 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Split preview"
                          onClick={() => openSplitDetail(w)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                      {colVis.reference && (
                      <td className="px-4 py-3 hidden sm:table-cell w-32 cursor-pointer" onClick={() => navigate(`/work-orders/${w.id}`)}>
                        {w.reference
                          ? <span className="text-xs font-mono text-primary hover:underline cursor-pointer">{w.reference}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      <td className="px-4 py-3 cursor-pointer" onClick={() => navigate(`/work-orders/${w.id}`)}>
                        <p className="text-xs font-semibold text-foreground hover:text-primary transition-colors leading-tight">{w.title}</p>
                        {w.location && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0" />{w.location}
                          </span>
                        )}
                      </td>
                      {colVis.type && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-xs font-medium ${TYPE_TEXT[w.type] || TYPE_TEXT.Other}`}>
                          {w.type || "Other"}
                        </span>
                      </td>
                      )}
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold ${STATUS_TEXT[w.status] || STATUS_TEXT.Active}`}>
                          {w.status || "Active"}
                        </span>
                      </td>
                      {colVis.priority && (
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`text-xs font-medium ${PRIORITY_TEXT[w.priority] || PRIORITY_TEXT.Medium}`}>
                          {w.priority || "Medium"}
                        </span>
                      </td>
                      )}
                      {colVis.project_name && (
                      <td className="px-4 py-3 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                        {w.project_name
                          ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><FolderKanban className="w-3 h-3 shrink-0" />{w.project_name}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      {colVis.asset_name && (
                      <td className="px-4 py-3 hidden xl:table-cell" onClick={e => e.stopPropagation()}>
                        {w.asset_name
                          ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Package className="w-3 h-3 shrink-0" />{w.asset_name}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      {colVis.contact_name && (
                      <td className="px-4 py-3 hidden lg:table-cell" onClick={e => e.stopPropagation()}>
                        {w.contact_name
                          ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><User className="w-3 h-3 shrink-0" />{w.contact_name}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      {colVis.due_date && (
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {w.due_date
                          ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Calendar className="w-3 h-3 shrink-0" />{fmtDate(w.due_date)}</span>
                          : <span className="text-xs text-muted-foreground/40">—</span>}
                      </td>
                      )}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => openSplitFiles(w)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fileCountFor(w) > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                          title="View work order files">
                          <Paperclip className="w-3.5 h-3.5" />
                          {fileCountFor(w) > 0 && <span className="tabular-nums">{fileCountFor(w)}</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                           <Button size="icon" variant="ghost" className="h-7 w-7" title={w.status === "Archived" ? "Restore" : "Archive"}
                             onClick={e => { e.stopPropagation(); handleArchive(w.id, w.status !== "Archived"); }}>
                             {w.status === "Archived" ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                           </Button>
                           {can("work_orders", "can_edit") && (
                             <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEdit(w); }}>
                               <Pencil className="w-3.5 h-3.5" />
                             </Button>
                           )}
                           {can("work_orders", "can_delete") && (
                             <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={e => { e.stopPropagation(); handleDelete(w.id); }}>
                               <Trash2 className="w-3.5 h-3.5" />
                             </Button>
                           )}
                         </div>
                      </td>
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
      <div className="bg-card border-b border-border px-6 pt-4 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <BackToOverviewButton to="/operations-overview" />
          <ChevronRight className="w-3 h-3" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Work Orders</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Field service & work order management</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={filtered.length === 0}>
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            {can("work_orders", "can_create") && (
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> New Work Order
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto">
          {[
            { key: "all", label: "All", count: workOrders.length },
            { key: "Active", label: "Active", count: workOrders.filter(w => w.status === "Active").length },
            { key: "On Hold", label: "On Hold", count: workOrders.filter(w => w.status === "On Hold").length },
            { key: "Archived", label: "Archived", count: workOrders.filter(w => w.status === "Archived").length },
          ].filter(tab => tab.key === "all" || tab.count > 0).map(tab => (
            <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                filterStatus === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}>
              {tab.label}
              <span className={`text-xs font-semibold ${filterStatus === tab.key ? "text-primary" : "text-muted-foreground"}`}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search title, reference, project, assignee..."
            className="pl-9 bg-muted/40 border-muted" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {["Maintenance","Repair","Inspection","Installation","Other"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {filterContactId && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/30 rounded-lg px-3 py-1.5 text-xs">
            <User className="w-3.5 h-3.5 text-primary" />
            <span className="text-foreground font-medium">{filterContactName}</span>
            <button onClick={() => { setFilterContactId(null); setFilterContactName(null); window.history.replaceState({}, "", "/work-orders"); }}
              className="ml-1 text-xs text-primary hover:underline">Clear filter</button>
          </div>
        )}
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-card border-b border-border px-6 py-2 flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">{selectedIds.size} work order{selectedIds.size > 1 ? "s" : ""} selected</span>
          <div className="flex items-center gap-2 ml-auto">
            <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs" disabled={archiving}
              onClick={() => handleArchiveSelected(true)}>
              <Archive className="w-3.5 h-3.5" /> {archiving ? "Archiving..." : "Archive Selected"}
            </Button>
            <Button size="sm" variant="secondary" className="gap-1.5 h-7 text-xs" disabled={archiving}
              onClick={() => handleArchiveSelected(false)}>
              <ArchiveRestore className="w-3.5 h-3.5" /> Restore
            </Button>
            {can("work_orders", "can_delete") && (
              <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs" disabled={deleting} onClick={handleDeleteSelected}>
                <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting..." : "Delete Selected"}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs font-medium text-foreground tabular-nums">{`${filtered.length} items`}</span>
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card">
        {splitMode === "files" && filesWorkOrder && (
          <div className="w-[35%] min-w-0 flex flex-col">
            <WorkOrderFilesViewer workOrder={filesWorkOrder} onClose={closeSplit} />
          </div>
        )}
        <div className={splitMode ? "w-[65%] min-w-0 flex flex-col" : "flex-1 min-w-0 flex flex-col"}>
          {renderTable(splitMode !== null)}
        </div>
        {splitMode === "detail" && (
          <div className="w-[65%] min-w-0 flex flex-col">
            <WorkOrderSplitDetail
              workOrder={splitWorkOrder}
              fileCount={splitWorkOrder ? fileCountFor(splitWorkOrder) : 0}
              onClose={closeSplit}
              onEdit={(w) => openEdit(w)}
              onPrev={() => navSplit(-1)}
              onNext={() => navSplit(1)}
            />
          </div>
        )}
      </div>

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