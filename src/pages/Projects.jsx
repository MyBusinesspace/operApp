import React, { useState, useEffect } from "react";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { useNavigate, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatDateValue } from "@/lib/dateOnly";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, FolderKanban, Pencil, Trash2,
  Upload, Download, MapPin, Calendar, User, Square, CheckSquare, ChevronDown, Check,
  Archive, AlertTriangle, Loader2, ClipboardList, Eye, Paperclip, X, ChevronRight
} from "lucide-react";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { Button } from "@/components/ui/button";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import ProjectSplitDetail from "@/components/projects/ProjectSplitDetail";
import ProjectFilesViewer from "@/components/projects/ProjectFilesViewer";
import { archiveProjectChildren } from "@/lib/projectArchive";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { listAll, withRetry } from "@/lib/apiHelpers";

const STATUS_DOT = {
  Draft:      "bg-zinc-500",
  Active:     "bg-emerald-500",
  "On Hold":  "bg-amber-500",
  Completed:  "bg-sky-500",
  Cancelled:  "bg-rose-500",
};

const STATUS_TEXT = {
  Draft:      "text-zinc-400",
  Active:     "text-emerald-400",
  "On Hold":  "text-amber-400",
  Completed:  "text-sky-400",
  Cancelled:  "text-rose-400",
};

const TYPE_DOT = {
  Rental:       "bg-indigo-500",
  Installation: "bg-sky-500",
  Maintenance:  "bg-orange-500",
  Consulting:   "bg-purple-500",
  Construction: "bg-teal-500",
  Other:        "bg-zinc-500",
};

function normStatus(s) {
  if (!s) return "Draft";
  const lower = s.toLowerCase();
  const map = { draft: "Draft", active: "Active", "on hold": "On Hold", "onhold": "On Hold", completed: "Completed", cancelled: "Cancelled", canceled: "Cancelled" };
  return map[lower] || s;
}

function fmtDate(d) {
  if (!d) return "—";
  return formatDateValue(d);
}

export default function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const { can } = usePermissionsMatrix();
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("projects");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [onlyActiveWO, setOnlyActiveWO] = useState(false);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const { sortKey, sortDir, handleSort, applySorting } = useSortable();

  // Split view
  const [splitMode, setSplitMode] = useState(null); // null | 'detail' | 'files'
  const [splitProjectId, setSplitProjectId] = useState(null);
  const [filesProjectId, setFilesProjectId] = useState(null);

  const COLUMN_DEFS = [
    { key: "reference", label: "Reference", required: false },
    { key: "name", label: "Project", required: true },
    { key: "type", label: "Category", required: false },
    { key: "contact_name", label: "Customer", required: false },
    { key: "start_date", label: "Dates", required: false },
    { key: "location", label: "Location", required: false },
    { key: "status", label: "Status", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("projects_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { reference: true, name: true, type: true, contact_name: true, start_date: true, location: true, status: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("projects_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const [activeWOs, setActiveWOs] = useState({});
  const [activeTasks, setActiveTasks] = useState({});
  const [fileCounts, setFileCounts] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      // Phase 1 — essential data (sequential to avoid rate-limit bursts)
      const p = await withRetry(() => base44.entities.Project.list("-created_date", 500));
      setProjects(p.map(proj => ({ ...proj, status: normStatus(proj.status) })));
      const c = await withRetry(() => listAll(base44.entities.Contact, "full_name")).catch(() => []);
      setContacts(c);
      setLoading(false);

      // Phase 2 — secondary counts (sequential, non-blocking)
      const wos = await withRetry(() => base44.entities.WorkOrder.filter({ status: "Active" }, "-created_date", 200)).catch(() => []);
      const woMap = {};
      wos.forEach(w => { if (w.project_id) woMap[w.project_id] = (woMap[w.project_id] || 0) + 1; });
      setActiveWOs(woMap);

      const tasks = await withRetry(() => base44.entities.Task.filter({ status: "Scheduled" }, "-created_date", 500)).catch(() => []);
      const taskMap = {};
      tasks.forEach(t => { if (t.project_id) taskMap[t.project_id] = (taskMap[t.project_id] || 0) + 1; });
      setActiveTasks(taskMap);

      const pf = await withRetry(() => base44.entities.ProjectFile.list("created_date", 5000)).catch(() => []);
      const counts = {};
      (pf || []).forEach(f => { counts[f.project_id] = (counts[f.project_id] || 0) + 1; });
      setFileCounts(counts);
    } catch (err) {
      setLoading(false);
      console.error("Failed to load projects:", err);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "true") { openAdd(); window.history.replaceState({}, "", "/projects"); }
  }, []);

  const sorted = applySorting(projects.filter(p => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(s) ||
      p.reference?.toLowerCase().includes(s) ||
      p.contact_name?.toLowerCase().includes(s) ||
      p.location?.toLowerCase().includes(s);
    const matchType = filterType === "all" || p.type === filterType;
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchWO = !onlyActiveWO || (activeWOs[p.id] || 0) > 0;
    return matchSearch && matchType && matchStatus && matchWO;
  }));
  const filtered = sorted;
  const pagination = useTablePagination(filtered);

  const handleSave = async (form) => {
    if (editing) await base44.entities.Project.update(editing.id, form);
    else await base44.entities.Project.create(form);
    setModal(false);
    setEditing(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this project?")) return;
    await base44.entities.Project.delete(id);
    load();
  };

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [completeConfirm, setCompleteConfirm] = useState(null);
  const [completing, setCompleting] = useState(false);

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const toggleSelectAll = () => {
    setSelectedIds(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)));
  };
  const handleDeleteSelected = async () => {
    setDeleting(true);
    await Promise.all([...selectedIds].map(id => base44.entities.Project.delete(id).catch(err => console.error(err))));
    setSelectedIds(new Set());
    setDeleting(false);
    load();
  };

  const openEdit = (p) => { setEditing(p); setModal(true); };
  const openAdd  = () => { setEditing(null); setModal(true); };

  const handleStatusChange = async (project, newStatus) => {
    if (newStatus === "Completed" && project.status !== "Completed") {
      const [wos, tasks] = await Promise.all([
        withRetry(() => base44.entities.WorkOrder.filter({ project_id: project.id })).catch(() => []),
        withRetry(() => base44.entities.Task.filter({ project_id: project.id })).catch(() => []),
      ]);
      setCompleteConfirm({
        project,
        woCount: (wos || []).length,
        taskCount: (tasks || []).length,
      });
      return;
    }
    await base44.entities.Project.update(project.id, { status: newStatus });
    setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: normStatus(newStatus) } : p));
  };

  const confirmComplete = async () => {
    const { project } = completeConfirm;
    setCompleting(true);
    try {
      await base44.entities.Project.update(project.id, { status: "Completed" });
      await archiveProjectChildren(project.id);
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: "Completed" } : p));
      setCompleteConfirm(null);
      load();
    } catch {
      // ignore — keep dialog open on error
    }
    setCompleting(false);
  };

  // Split view helpers
  const openSplitDetail = (p) => { setSplitMode("detail"); setSplitProjectId(p.id); setFilesProjectId(null); };
  const openSplitFiles = (p) => { setSplitMode("files"); setFilesProjectId(p.id); setSplitProjectId(null); };
  const closeSplit = () => { setSplitMode(null); setSplitProjectId(null); setFilesProjectId(null); };
  const splitProject = projects.find(p => p.id === splitProjectId) || null;
  const filesProject = projects.find(p => p.id === filesProjectId) || null;
  const splitIndex = splitProjectId ? sorted.findIndex(p => p.id === splitProjectId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = sorted[splitIndex + dir];
    if (next) setSplitProjectId(next.id);
  };
  const fileCountFor = (p) => fileCounts[p.id] || 0;

  // Export CSV
  const handleExport = () => {
    const headers = ["name","reference","type","status","contact_name","start_date","end_date","budget","currency","location","tags","notes"];
    const rows = filtered.map(p => headers.map(h => `"${(p[h] ?? "").toString().replace(/"/g,'""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "projects.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  // Import CSV
  const handleImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
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
      for (const r of records) await base44.entities.Project.create(r);
      load();
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const renderTable = (compact) => (
    <div>
      <div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading projects...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <FolderKanban className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No projects found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterType !== "all" || filterStatus !== "all" || onlyActiveWO
                ? "Try adjusting your filters."
                : "Create your first project to get started."}
            </p>
            {!search && filterType === "all" && filterStatus === "all" && !onlyActiveWO && can("projects", "can_create") && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> New Project</Button>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-3 py-3 cursor-pointer" onClick={toggleSelectAll}>
                  {filtered.length > 0 && filtered.every(p => selectedIds.has(p.id))
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : <Square className="w-4 h-4 text-muted-foreground" />}
                </th>
                <th className="px-3 py-3 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">View</th>
                {visibleCols.reference && <SortableTh colKey="reference" label="Reference" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell w-24" />}
                <SortableTh colKey="name" label="Project" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="pl-6" />
                {visibleCols.type && <SortableTh colKey="type" label="Category" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell w-28" />}
                {visibleCols.contact_name && <SortableTh colKey="contact_name" label="Customer" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell w-44" />}
                {visibleCols.start_date && <SortableTh colKey="start_date" label="Dates" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden xl:table-cell w-32" />}
                {visibleCols.location && <SortableTh colKey="location" label="Location" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden xl:table-cell w-32" />}
                {visibleCols.status && <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="w-24" />}
                <th className="px-3 py-3 w-16 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</th>
                <th className="px-4 py-3 w-16"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pagination.pageItems.map((p, idx) => {
                  const isActive = splitMode === "detail" && p.id === splitProjectId;
                  const stripe = idx % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/30" : "";
                  return (
                    <motion.tr key={p.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className={`border-b border-border hover:bg-primary/[0.06] transition-colors group ${selectedIds.has(p.id) ? "bg-primary/10" : ""} ${isActive ? "bg-primary/10" : stripe}`}>
                      <td className="px-3 py-3 w-10" onClick={e => toggleSelect(p.id, e)}>
                        {selectedIds.has(p.id)
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4 text-muted-foreground" />}
                      </td>
                      <td className="px-3 py-3 w-10" onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Split preview"
                          onClick={() => openSplitDetail(p)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                      {visibleCols.reference && (
                      <td className="px-4 py-3 hidden sm:table-cell cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                        {p.reference
                          ? <span className="font-mono text-xs text-primary font-medium">{p.reference}</span>
                          : <span className="text-xs text-muted-foreground/30">—</span>}
                      </td>
                      )}
                      <td className="px-4 py-3 pl-6">
                       <div className="cursor-pointer" onClick={() => navigate(`/projects/${p.id}`)}>
                         <p className="text-xs font-semibold text-foreground hover:text-primary transition-colors leading-tight">
                           {p.name}
                         </p>
                         {(activeWOs[p.id] || activeTasks[p.id]) ? (
                           <div className="flex items-center gap-2.5 mt-1 text-[11px] text-muted-foreground">
                             {activeWOs[p.id] ? (
                               <span className="inline-flex items-center gap-1">
                                 <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                                 {activeWOs[p.id]} WO
                               </span>
                             ) : null}
                             {activeTasks[p.id] ? (
                               <span className="inline-flex items-center gap-1">
                                 <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                                 {activeTasks[p.id]} task{activeTasks[p.id] > 1 ? "s" : ""}
                               </span>
                             ) : null}
                           </div>
                         ) : null}
                       </div>
                      </td>
                      {visibleCols.type && (
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[p.type] || TYPE_DOT.Other}`} />
                          {p.type || "Other"}
                        </span>
                      </td>
                      )}
                      {visibleCols.contact_name && (
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {p.contact_name
                          ? (p.contact_id
                            ? <Link to={`/contacts/${p.contact_id}`} onClick={e => e.stopPropagation()} className="flex items-center gap-1.5 text-xs text-primary hover:underline truncate">
                                <User className="w-3 h-3 shrink-0" /> {p.contact_name}
                              </Link>
                            : <span className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                                <User className="w-3 h-3 shrink-0" /> {p.contact_name}
                              </span>)
                          : <span className="text-xs text-muted-foreground/40">—</span>
                        }
                      </td>
                      )}
                      {visibleCols.start_date && (
                      <td className="px-4 py-3 hidden xl:table-cell">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>{fmtDate(p.start_date)}</span>
                          {p.end_date && <><span className="text-muted-foreground/40">→</span><span>{fmtDate(p.end_date)}</span></>}
                        </div>
                      </td>
                      )}
                      {visibleCols.location && (
                      <td className="px-4 py-3 hidden xl:table-cell">
                        {p.location
                          ? <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <MapPin className="w-3 h-3 shrink-0" />{p.location}
                            </span>
                          : <span className="text-xs text-muted-foreground/40">—</span>
                        }
                      </td>
                      )}
                      {visibleCols.status && (
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger className="inline-flex items-center gap-1.5 text-[11px] font-medium outline-none hover:opacity-70 transition-opacity">
                            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[p.status] || STATUS_DOT.Draft}`} />
                            <span className={STATUS_TEXT[p.status] || STATUS_TEXT.Draft}>{p.status || "Draft"}</span>
                            <ChevronDown className="w-3 h-3 ml-0.5 opacity-40" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            {["Draft", "Active", "On Hold", "Completed", "Cancelled"].map(st => (
                              <DropdownMenuItem
                                key={st}
                                onClick={() => handleStatusChange(p, st)}
                                className="flex items-center justify-between text-xs cursor-pointer"
                              >
                                <span className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${STATUS_DOT[st]}`} />
                                  <span className={STATUS_TEXT[st]}>{st}</span>
                                </span>
                                {p.status === st && <Check className="w-3 h-3 text-primary" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                      )}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => openSplitFiles(p)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fileCountFor(p) > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                          title="View project files">
                          <Paperclip className="w-3.5 h-3.5" />
                          {fileCountFor(p) > 0 && <span className="tabular-nums">{fileCountFor(p)}</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          {can("projects", "can_edit") && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {can("projects", "can_delete") && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(p.id)}>
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
          <BackToOverviewButton to="/business-overview" />
          <ChevronRight className="w-3 h-3" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground">Projects</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Track rentals, installations & project scopes</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="cursor-pointer">
              <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors">
                <Upload className="w-3.5 h-3.5" /> Import
              </span>
            </label>
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport}>
              <Download className="w-3.5 h-3.5" /> Export
            </Button>
            {can("projects", "can_create") && (
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> New Project
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto">
          {[
            { key: "all", label: "All", count: projects.length },
            { key: "Draft", label: "Draft", count: projects.filter(p => p.status === "Draft").length },
            { key: "Active", label: "Active", count: projects.filter(p => p.status === "Active").length },
            { key: "On Hold", label: "On Hold", count: projects.filter(p => p.status === "On Hold").length },
            { key: "Completed", label: "Completed", count: projects.filter(p => p.status === "Completed").length },
            { key: "Cancelled", label: "Cancelled", count: projects.filter(p => p.status === "Cancelled").length },
          ].map(tab => (
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
          <Input placeholder="Search name, reference, client, location..."
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
            {["Rental","Installation","Maintenance","Consulting","Construction","Other"].map(t =>
              <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant={onlyActiveWO ? "default" : "outline"}
          size="sm"
          className="gap-1.5"
          onClick={() => setOnlyActiveWO(v => !v)}
          title="Show only projects with active work orders">
          <ClipboardList className="w-3.5 h-3.5" />
          {onlyActiveWO ? "With Active WO ✓" : "With Active WO"}
        </Button>
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="bg-card border-b border-border px-6 py-2 flex items-center gap-3">
          <span className="text-xs font-medium text-foreground">{selectedIds.size} project{selectedIds.size > 1 ? "s" : ""} selected</span>
          {can("projects", "can_delete") && (
            <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs ml-auto" disabled={deleting} onClick={handleDeleteSelected}>
              <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting..." : "Delete Selected"}
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Cancel</Button>
        </div>
      )}

      {/* Summary */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs font-medium text-foreground tabular-nums">{`${filtered.length} items`}</span>
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card">
        {splitMode === "files" && filesProject && (
          <div className="w-[35%] min-w-0 flex flex-col">
            <ProjectFilesViewer project={filesProject} onClose={closeSplit} />
          </div>
        )}
        <div className={splitMode ? "w-[65%] min-w-0 flex flex-col" : "flex-1 min-w-0 flex flex-col"}>
          {renderTable(splitMode !== null)}
        </div>
        {splitMode === "detail" && (
          <div className="w-[65%] min-w-0 flex flex-col">
            <ProjectSplitDetail
              project={splitProject}
              fileCount={splitProject ? fileCountFor(splitProject) : 0}
              onClose={closeSplit}
              onEdit={(p) => openEdit(p)}
              onPrev={() => navSplit(-1)}
              onNext={() => navSplit(1)}
            />
          </div>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

      {/* Complete project confirmation */}
      <Dialog open={!!completeConfirm} onOpenChange={(o) => !o && setCompleteConfirm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Complete Project
            </DialogTitle>
            <DialogDescription>
              {completeConfirm && (
                <div className="text-xs text-muted-foreground">
                  Marking <strong className="text-foreground">{completeConfirm.project.name}</strong> as Completed will automatically archive:
                  <ul className="mt-3 space-y-1.5">
                    <li className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-muted-foreground" />
                      {completeConfirm.woCount} work order{completeConfirm.woCount !== 1 ? "s" : ""}
                    </li>
                    <li className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-muted-foreground" />
                      {completeConfirm.taskCount} task{completeConfirm.taskCount !== 1 ? "s" : ""}
                    </li>
                  </ul>
                  <p className="mt-3 text-xs">Archived items are excluded from active operations but remain accessible from the Archived tab.</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCompleteConfirm(null)}>Cancel</Button>
            <Button onClick={confirmComplete} disabled={completing} className="gap-1.5">
              {completing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {completing ? "Completing..." : "Complete & Archive"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ProjectFormModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave}
        project={editing}
        contacts={contacts}
      />
    </div>
  );
}