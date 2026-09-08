import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import { motion, AnimatePresence } from "framer-motion";
import { CheckSquare, Plus, Search, Pencil, Trash2, Clock, FolderKanban, ClipboardList, ChevronDown, ChevronRight, ChevronUp, ArrowUpDown, User, Package, Users, RefreshCw, FileText, Square, Zap, Copy, FileCheck2, Sparkles, Archive, ArchiveRestore, Download } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TaskFormModal from "@/components/tasks/TaskFormModal";
import QuickDraftTaskModal from "@/components/tasks/QuickDraftTaskModal";
import TaskSubtasks from "@/components/tasks/TaskSubtasks";
import ReportQuickViewModal from "@/components/tasks/ReportQuickViewModal.jsx";
import TaskReportsList from "@/components/tasks/TaskReportsList.jsx";
import TaskSubtasksCell from "@/components/tasks/TaskSubtasksCell.jsx";
import TaskReportsCell from "@/components/tasks/TaskReportsCell.jsx";
import TaskHistoryPanel, { logTaskHistory } from "@/components/tasks/TaskHistoryPanel.jsx";
import { getEffectiveStatus } from "@/lib/taskStatus";
import { generateTaskReference } from "@/lib/taskReference";
import { computeChanges } from "@/lib/changeLog";
import { visibleKeys } from "@/lib/visibleColumns";
import { usePermission } from "@/hooks/usePermissions";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";

const PRIORITY_STYLES = {
  Low:    "bg-slate-100 text-slate-500",
  Medium: "bg-blue-100 text-blue-700",
  High:   "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
};

function strColor(str) {
  const colors = ["bg-rose-400","bg-pink-400","bg-fuchsia-400","bg-purple-400","bg-violet-400","bg-indigo-400","bg-blue-400","bg-sky-400","bg-cyan-400","bg-teal-400","bg-emerald-400","bg-green-400","bg-lime-400","bg-yellow-400","bg-orange-400"];
  let hash = 0;
  for (let i = 0; i < (str || "").length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function UserAvatar({ name, photoUrl }) {
  const initials = (name || "?").split(" ").map(p => p[0]).join("").slice(0, 2).toUpperCase();
  return (
    <Avatar className="w-7 h-7 ring-2 ring-white shrink-0" title={name}>
      <AvatarImage src={photoUrl} alt={name} />
      <AvatarFallback className={`${strColor(name)} text-white text-xs font-bold`}>{initials}</AvatarFallback>
    </Avatar>
  );
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_OPTIONS = ["Template", "Queued", "Scheduled", "Not Completed", "Completed"];
const STATUS_STYLES = {
  Template:         "bg-cyan-100 text-cyan-700",
  Queued:           "bg-amber-100 text-amber-700",
  Scheduled:        "bg-violet-100 text-violet-700",
  "Not Completed":  "bg-orange-100 text-orange-700",
  Active:           "bg-orange-100 text-orange-700",
  Completed:        "bg-emerald-100 text-emerald-700",
  Archived:         "bg-slate-200 text-slate-500",
};

function StatusBadge({ status, statuses = [] }) {
  const custom = statuses.find(s => s.name === status);
  const badgeClass = custom
    ? null
    : STATUS_STYLES[status] || "bg-muted text-muted-foreground";
  const badgeStyle = custom ? { backgroundColor: custom.color + "20", color: custom.color } : undefined;

  return (
    <span
      className={`text-xs font-medium px-2.5 py-1 rounded-full ${badgeClass || ""}`}
      style={badgeStyle}
    >
      {status || "Queued"}
    </span>
  );
}

function StatusToggle({ status, canEdit, onToggle, statuses }) {
  // Only show toggle for Completed / Not Completed / Active
  const toggleable = status === "Completed" || status === "Not Completed" || status === "Active";
  if (!canEdit || !toggleable) {
    return <StatusBadge status={status} statuses={statuses} />;
  }
  const isCompleted = status === "Completed";
  return (
    <button
      onClick={onToggle}
      className={`text-xs font-medium px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 ${
        isCompleted
          ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
          : "bg-orange-100 text-orange-700 hover:bg-orange-200"
      }`}
      title={isCompleted ? "Click to mark as Not Completed" : "Click to mark as Completed"}
    >
      <span className={`w-2 h-2 rounded-full ${isCompleted ? "bg-emerald-500" : "bg-orange-500"}`} />
      {status}
    </button>
  );
}

const SORT_CONFIG = {
  reference:  t => t.reference || "",
  title:      t => t.title || "",
  category:   t => t.category || "",
  work_order: t => t.work_order_name || "",
  contact:    t => t.contact_name || t.asset_name || "",
  assigned:   t => t.assigned_employee_names?.[0] || t.assigned_user_names?.[0] || "",
  date:       t => t.planning_date ? new Date(t.planning_date).getTime() : 0,
  status:     t => getEffectiveStatus(t),
  created:    t => t.created_date ? new Date(t.created_date).getTime() : 0,
};

function SortableTh({ label, sortKey, currentKey, dir, onSort, className }) {
  const active = currentKey === sortKey;
  return (
    <th className={className}>
      <button onClick={() => onSort(sortKey)} className="flex items-center gap-1 hover:text-foreground transition-colors">
        {label}
        {active
          ? (dir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
          : <ArrowUpDown className="w-3 h-3 opacity-30" />}
      </button>
    </th>
  );
}

function CategoryBadge({ category, categories }) {
  const custom = categories.find(c => c.name === category);
  if (!category) return <span className="text-xs text-muted-foreground/40">—</span>;
  if (custom) {
    return <span className="text-xs font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: custom.color + "20", color: custom.color }}>{category}</span>;
  }
  return <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700">{category}</span>;
}

export default function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employeesMap, setEmployeesMap] = useState({});
  const [subtasksMap, setSubtasksMap] = useState({});
  const [reportsMap, setReportsMap] = useState({});
  const { allowed: canEditTasks } = usePermission("tasks", "can_edit");
  const [expandedTask, setExpandedTask] = useState(null);
  const [expandedReports, setExpandedReports] = useState(null);
  const [expandedHistory, setExpandedHistory] = useState(null);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);
  const [reportModal, setReportModal] = useState({ open: false, report: null, task: null });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterContact, setFilterContact] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [filterWorkOrder, setFilterWorkOrder] = useState("all");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [modal, setModal] = useState(false);
  const [quickDraftModal, setQuickDraftModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const loadingRef = useRef(false);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  // Auto-correct stale DB statuses using the same getEffectiveStatus logic
  // used everywhere else, so badge / tab / DB all agree.

  const load = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
    const [t, w] = await batchedAll([
      () => withRetry(() => base44.entities.Task.list("-created_date", 5000)),
      () => withRetry(() => base44.entities.WorkOrder.list("title", 200)),
    ], 2);
    const [st, cat] = await batchedAll([
      () => withRetry(() => base44.entities.TaskStatus.list("name", 100)),
      () => withRetry(() => base44.entities.TaskCategory.list("name", 100)),
    ], 2);
    const [subs, emps, reps] = await batchedAll([
      () => withRetry(() => base44.entities.TaskSubtask.list("created_date", 500)),
      () => withRetry(() => base44.entities.Employee.list("full_name", 500)),
      () => withRetry(() => base44.entities.WorkingReport.list("-clock_in_time", 5000)),
    ], 3);

    // Fix any tasks with incorrect status (apply correct status logic)
    const correctedTasks = t.map(task => {
      const correct = getEffectiveStatus(task);
      return correct !== task.status ? { ...task, status: correct } : task;
    });
    // Persist corrections silently in background — sequential with delay to avoid rate limits
    const corrections = correctedTasks.filter((task, i) => task.status !== t[i].status);
    if (corrections.length > 0) {
      (async () => {
        for (const task of corrections) {
          await base44.entities.Task.update(task.id, { status: task.status }).catch(() => {});
          await new Promise(r => setTimeout(r, 200));
        }
      })();
    }

    setTasks(correctedTasks);
    setWorkOrders(w);
    setStatuses(st);
    setCategories(cat);
    // Build employees lookup map by id
    const empMap = {};
    (emps || []).forEach(e => { empMap[e.id] = e; });
    setEmployeesMap(empMap);
    // Group subtasks by task_id, ordered by manual sort_order (fallback to creation time)
    const sortedSubs = [...(subs || [])].sort((a, b) =>
      ((a.sort_order ?? 0) - (b.sort_order ?? 0)) ||
      (a.created_date || "").localeCompare(b.created_date || "") ||
      (a.id || "").localeCompare(b.id || ""));
    const map = {};
    sortedSubs.forEach(s => { if (!map[s.task_id]) map[s.task_id] = []; map[s.task_id].push(s); });
    setSubtasksMap(map);
    const rMap = {};
    (reps || []).forEach(r => { if (!rMap[r.task_id]) rMap[r.task_id] = []; rMap[r.task_id].push(r); });
    setReportsMap(rMap);
    setLoading(false);
    } catch (e) {
      setLoading(false);
      console.error("Tasks load error:", e);
    } finally {
      loadingRef.current = false;
    }
  };

  const pendingOpenIdRef = useRef(null);

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "true") { openAdd(); window.history.replaceState({}, "", "/tasks"); }
    if (params.get("quickdraft") === "true") { setQuickDraftModal(true); window.history.replaceState({}, "", "/tasks"); }
    const openId = params.get("open");
    if (openId) { pendingOpenIdRef.current = openId; window.history.replaceState({}, "", "/tasks"); }
    load();
    const onQuickDraft = () => setQuickDraftModal(true);
    window.addEventListener("operapp:quick-draft-task", onQuickDraft);
    return () => window.removeEventListener("operapp:quick-draft-task", onQuickDraft);
  }, []);

  useEffect(() => {
    if (pendingOpenIdRef.current && tasks.length > 0) {
      const found = tasks.find(t => t.id === pendingOpenIdRef.current);
      if (found) { openEdit(found); pendingOpenIdRef.current = null; }
    }
  }, [tasks]);

  const allStatuses = statuses.length > 0 ? statuses.map(s => s.name) : ["Queued","Scheduled","Not Completed","Completed"];
  const allCategories = categories.map(c => c.name);

  const recurringTemplates = tasks.filter(t => t.is_recurring);
  const templateTasks = tasks.filter(t => !t.is_recurring && getEffectiveStatus(t) === "Template");
  const regularTasks = tasks.filter(t => !t.is_recurring && getEffectiveStatus(t) !== "Template");

  // Generated recurring tasks that fall in the current week/month (no planning date yet but belong to current period)
  const isCurrentPeriodRecurring = (t) => {
    if (!t.recurrence_template_id) return false;
    if (getEffectiveStatus(t) === "Completed" || getEffectiveStatus(t) === "Not Completed") return false;
    // Find the template to know frequency
    const template = tasks.find(tmpl => tmpl.id === t.recurrence_template_id);
    const freq = template?.recurrence_frequency || "monthly";
    const now = new Date();
    // Use planning_date if set, otherwise use created_date as the occurrence date
    const occDate = t.planning_date ? new Date(t.planning_date) : new Date(t.created_date);
    if (freq === "weekly" || freq === "daily") {
      // Same ISO week
      const getWeek = (d) => {
        const jan1 = new Date(d.getFullYear(), 0, 1);
        return Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      };
      return occDate.getFullYear() === now.getFullYear() && getWeek(occDate) === getWeek(now);
    } else {
      // monthly / quarterly — same month & year
      return occDate.getFullYear() === now.getFullYear() && occDate.getMonth() === now.getMonth();
    }
  };

  const plannedTasks = regularTasks.filter(t => getEffectiveStatus(t) === "Scheduled");

  // Base set: tasks matching the status tab + search + category (non-dropdown filters)
  const statusSet = (
    filterStatus === "recurring"  ? recurringTemplates :
    filterStatus === "templates"  ? templateTasks :
    filterStatus === "scheduled"  ? plannedTasks :
    regularTasks
  );
  const baseFiltered = statusSet.filter(t => {
    const s = search.toLowerCase();
    const matchSearch = !search ||
      t.title?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s) ||
      t.reference?.toLowerCase().includes(s) ||
      t.category?.toLowerCase().includes(s) ||
      t.work_order_name?.toLowerCase().includes(s) ||
      t.project_name?.toLowerCase().includes(s) ||
      t.contact_name?.toLowerCase().includes(s) ||
      t.asset_name?.toLowerCase().includes(s) ||
      (t.assigned_user_names || []).some(n => n.toLowerCase().includes(s)) ||
      (t.assigned_employee_names || []).some(n => n.toLowerCase().includes(s)) ||
      (t.assigned_team_names || []).some(n => n.toLowerCase().includes(s));
    const effStatus = getEffectiveStatus(t);
    const matchStatus =
      filterStatus === "all" ||
      filterStatus === "recurring" ||
      filterStatus === "templates" ||
      filterStatus === "scheduled" ||
      (filterStatus === "Active"
        ? (effStatus === "Not Completed" || effStatus === "Active")
        : filterStatus === "Queued"
        ? (effStatus === "Queued")
        : effStatus === filterStatus);
    const matchCat = filterCategory === "all" || t.category === filterCategory;
    return matchSearch && matchStatus && matchCat;
  });

  // Coordinated dropdown options: each derived from tasks matching all OTHER active dropdown filters
  const tasksExcluding = (exclude) => baseFiltered.filter(t => {
    if (exclude !== "employee"  && !(filterEmployee  === "all" || (t.assigned_employee_names || []).includes(filterEmployee))) return false;
    if (exclude !== "workOrder" && !(filterWorkOrder === "all" || t.work_order_name === filterWorkOrder)) return false;
    if (exclude !== "project"   && !(filterProject   === "all" || t.project_name   === filterProject))  return false;
    if (exclude !== "contact"   && !(filterContact   === "all" || t.contact_name   === filterContact))  return false;
    return true;
  });

  const availEmployees  = [...new Map(tasksExcluding("employee").flatMap(t => (t.assigned_employees || []).map((id, i) => [id, t.assigned_employee_names?.[i] || "?"]))).values()].sort((a, b) => a.localeCompare(b));
  const availWorkOrders = (() => {
    const map = new Map();
    // Work Orders referenced by tasks (coordinated with active filters)
    tasksExcluding("workOrder").filter(t => t.work_order_id).forEach(t => map.set(t.work_order_id, t.work_order_name));
    // Also surface every Work Order belonging to the active project/contact filters,
    // even those without tasks yet — so all of a project's WOs stay visible.
    if (filterProject !== "all" || filterContact !== "all") {
      workOrders.forEach(wo => {
        if (filterProject !== "all" && wo.project_name !== filterProject) return;
        if (filterContact !== "all" && wo.contact_name !== filterContact) return;
        map.set(wo.id, wo.title);
      });
    }
    return [...map.values()].sort((a, b) => a.localeCompare(b));
  })();
  const availProjects   = [...new Map(tasksExcluding("project").filter(t => t.project_id).map(t => [t.project_id, t.project_name])).values()].sort((a, b) => a.localeCompare(b));
  const availContacts   = [...new Map(tasksExcluding("contact").filter(t => t.contact_id).map(t => [t.contact_id, t.contact_name])).values()].sort((a, b) => a.localeCompare(b));

  // Final filtered set: base + all dropdown filters
  const filtered = baseFiltered.filter(t => {
    const matchEmp     = filterEmployee  === "all" || (t.assigned_employee_names || []).includes(filterEmployee);
    const matchWO      = filterWorkOrder === "all" || t.work_order_name === filterWorkOrder;
    const matchProject = filterProject   === "all" || t.project_name   === filterProject;
    const matchContact = filterContact   === "all" || t.contact_name   === filterContact;
    return matchEmp && matchWO && matchProject && matchContact;
  });

  const sorted = (() => {
    if (!sortKey) return filtered;
    const getter = SORT_CONFIG[sortKey];
    if (!getter) return filtered;
    return [...filtered].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);
      let cmp;
      if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sortDir === "asc" ? cmp : -cmp;
    });
  })();

  const vis = visibleKeys(sorted, {
    reference: t => t.reference || t.is_recurring,
    work_order: t => t.work_order_name || t.project_name || t.contact_name || t.asset_name,
    subtasks: t => (subtasksMap[t.id] || []).length,
    reports: t => (reportsMap[t.id] || []).length,
  });

  const pagination = useTablePagination(sorted);

  const handleSave = async (form, options = {}) => {
    let result;
    const userName = currentUser?.full_name || currentUser?.email || "Unknown";
    // Copy as Template always creates a new task, leaving the original untouched
    if (editing?.id && !options.asTemplate) {
      const oldTask = tasks.find(t => t.id === editing.id);
      await base44.entities.Task.update(editing.id, form);
      if (oldTask && form.status && oldTask.status !== form.status) {
        await logTaskHistory({
          taskId: editing.id,
          taskReference: form.reference || oldTask.reference || "",
          action: "Status Changed",
          detail: `Status changed from ${oldTask.status || "Queued"} to ${form.status}`,
          userName,
        });
      } else {
        const taskChanges = computeChanges(oldTask, form, [
          ["title", "Title"], ["description", "Description"], ["category", "Category"],
          ["work_order_name", "Work Order"], ["project_name", "Project"],
          ["contact_name", "Client"], ["asset_name", "Asset"],
          ["assigned_employee_names", "Workers"], ["assigned_user_names", "Users"],
          ["planning_date", "Planning Date"], ["planning_time_in", "Time In"],
          ["planning_time_out", "Time Out"], ["priority", "Priority"],
          ["notes", "Notes"], ["location_address", "Location"],
        ]);
        await logTaskHistory({
          taskId: editing.id,
          taskReference: form.reference || oldTask?.reference || "",
          action: "Updated",
          detail: taskChanges.length > 0 ? taskChanges.join(" · ") : "Task details updated",
          userName,
        });
      }
    } else {
      result = await base44.entities.Task.create(form);
      await logTaskHistory({
        taskId: result.id,
        taskReference: result.reference || "",
        action: "Created",
        detail: `Task ${result.reference || result.title} created`,
        userName,
      });
    }
    setModal(false); setEditing(null); load();
    return result;
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this task?")) return;
    const task = tasks.find(t => t.id === id);
    const userName = currentUser?.full_name || currentUser?.email || "Unknown";
    await base44.entities.Task.delete(id);
    await logTaskHistory({
      taskId: id,
      taskReference: task?.reference || "",
      action: "Deleted",
      detail: `Task ${task?.reference || task?.title || ""} deleted`,
      userName,
    });
    load();
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const allIds = sorted.map(t => t.id);
    if (allIds.every(id => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} selected task(s)? This cannot be undone.`)) return;
    setDeleting(true);
    for (const id of selectedIds) {
      await base44.entities.Task.delete(id).catch(() => {});
    }
    setSelectedIds(new Set());
    setDeleting(false);
    load();
  };

  const handleStatusChange = async (taskId, newStatus) => {
    const oldTask = tasks.find(t => t.id === taskId);
    const oldStatus = getEffectiveStatus(oldTask);
    await base44.entities.Task.update(taskId, { status: newStatus });
    const userName = currentUser?.full_name || currentUser?.email || "Unknown";
    await logTaskHistory({
      taskId,
      taskReference: oldTask?.reference || "",
      action: "Status Changed",
      detail: `Status changed from ${oldStatus || "Queued"} to ${newStatus}`,
      userName,
    });
    setTasks(prev => prev.map(t => {
      if (t.id !== taskId) return t;
      const updated = { ...t, status: newStatus };
      return { ...updated, status: getEffectiveStatus(updated) };
    }));
    setHistoryRefresh(r => r + 1);
  };

  const handleDuplicate = async (t) => {
    const { id, created_date, updated_date, created_by_id, reference, ...rest } = t;
    const newRef = await generateTaskReference();
    const dup = await base44.entities.Task.create({ ...rest, reference: newRef, status: "Queued" });
    load();
  };

  const handleConvertToTemplate = async (t) => {
    await base44.entities.Task.update(t.id, { status: "Template" });
    load();
  };

  const handleUseTemplate = async (t) => {
    // Strip template-specific fields so the editor opens as a NEW task
    const { id, created_date, updated_date, created_by_id, reference, status,
      planning_date, planning_time_in, planning_time_out,
      is_recurring, recurrence_frequency, recurrence_day_of_month,
      recurrence_day_of_week, recurrence_end_date, last_generated_date,
      recurrence_template_id, ...rest } = t;
    // Fetch the template's subtasks so they can be cloned into the new task
    let templateSubtasks = [];
    try {
      templateSubtasks = await base44.entities.TaskSubtask.filter({ task_id: t.id });
    } catch { /* ignore */ }
    setEditing({ ...rest, _template_subtasks: templateSubtasks }); // no id → new task mode
    setModal(true);
  };

  const openEdit = (t) => { setEditing(t); setModal(true); };
  const openAdd  = () => { setEditing(null); setModal(true); };

  const exportCSV = () => {
    exportToCSV(`tasks-${new Date().toISOString().slice(0, 10)}`, [
      { key: "reference", label: "Reference" },
      { key: "title", label: "Title" },
      { key: "description", label: "Description" },
      { key: "category", label: "Category" },
      { key: r => getEffectiveStatus(r), label: "Status" },
      { key: "priority", label: "Priority" },
      { key: "work_order_name", label: "Work Order" },
      { key: "project_name", label: "Project" },
      { key: "contact_name", label: "Client" },
      { key: "asset_name", label: "Asset" },
      { key: r => (r.assigned_employee_names || []).join("; "), label: "Assigned Employees" },
      { key: r => (r.assigned_user_names || []).join("; "), label: "Assigned Users" },
      { key: "planning_date", label: "Planning Date" },
      { key: "planning_time_in", label: "Time In" },
      { key: "planning_time_out", label: "Time Out" },
      { key: "location_address", label: "Location" },
      { key: "created_date", label: "Created Date" },
    ], sorted);
  };

  const toggleExpand = (id) => setExpandedTask(prev => prev === id ? null : id);
  const toggleReports = (id) => setExpandedReports(prev => prev === id ? null : id);
  const toggleHistory = (id) => setExpandedHistory(prev => prev === id ? null : id);

  const stats = [
    { label: "Total",     value: tasks.length,                                        color: "text-foreground" },
    { label: "Queued",    value: tasks.filter(t => getEffectiveStatus(t) === "Queued").length,     color: "text-amber-600" },
    { label: "Not Completed", value: tasks.filter(t => { const s = getEffectiveStatus(t); return s === "Not Completed" || s === "Active"; }).length, color: "text-orange-600" },
    { label: "Completed", value: tasks.filter(t => getEffectiveStatus(t) === "Completed").length,  color: "text-emerald-600" },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <CheckSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Tasks</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage tasks, assignments & schedules</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" className="gap-2" onClick={handleBulkDelete} disabled={deleting}>
              <Trash2 className="w-4 h-4" /> {deleting ? "Deleting…" : `Delete (${selectedIds.size})`}
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={sorted.length === 0}>
            <Download className="w-4 h-4" /> Export CSV
          </Button>
          <div className="flex flex-col gap-2">
            <Button className="gap-2 shadow-sm" onClick={openAdd}>
              <Plus className="w-4 h-4" /> New Task
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setQuickDraftModal(true)}>
              <Zap className="w-4 h-4" /> Quick Task
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Status tab bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="flex flex-wrap gap-1 border-b border-border pb-0">
        {[
          { key: "all",       label: "All",       count: regularTasks.length },
          { key: "templates", label: "Templates", count: templateTasks.length, iconTemplate: true },
          { key: "Queued",    label: "Queued",    count: regularTasks.filter(t => getEffectiveStatus(t) === "Queued").length  },
          { key: "scheduled", label: "Scheduled", count: plannedTasks.length, iconPlanned: true },
          { key: "Active",    label: "Not Completed", count: regularTasks.filter(t => { const s = getEffectiveStatus(t); return s === "Not Completed" || s === "Active"; }).length },
          { key: "Completed", label: "Completed", count: regularTasks.filter(t => getEffectiveStatus(t) === "Completed").length },
          { key: "Archived", label: "Archived", count: regularTasks.filter(t => getEffectiveStatus(t) === "Archived").length, iconArchive: true },
          { key: "recurring", label: "Recurring", count: recurringTemplates.length, icon: true },
        ].filter(tab => tab.key === "all" || tab.count > 0).map(tab => (
          <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              filterStatus === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {tab.icon && <RefreshCw className="w-3 h-3 inline mr-1" />}
            {tab.iconPlanned && <Clock className="w-3 h-3 inline mr-1 text-sky-500" />}
            {tab.iconTemplate && <FileText className="w-3 h-3 inline mr-1 text-cyan-500" />}
            {tab.iconArchive && <Archive className="w-3 h-3 inline mr-1 text-slate-500" />}
            {tab.label} <span className="ml-1 text-xs">{tab.count}</span>
          </button>
        ))}
      </motion.div>

      {/* Filters */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.12 }}
        className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search tasks, contacts, projects..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {availEmployees.length > 0 && (
          <Select value={filterEmployee} onValueChange={setFilterEmployee}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Employees" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {availEmployees.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {availWorkOrders.length > 0 && (
          <Select value={filterWorkOrder} onValueChange={setFilterWorkOrder}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Work Orders" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Work Orders</SelectItem>
              {availWorkOrders.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {availProjects.length > 0 && (
          <Select value={filterProject} onValueChange={setFilterProject}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Projects" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {availProjects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {availContacts.length > 0 && (
          <Select value={filterContact} onValueChange={setFilterContact}>
            <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Customers" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {availContacts.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading tasks...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <CheckSquare className="w-7 h-7 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No tasks found</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {search || filterStatus !== "all" || filterCategory !== "all" || filterContact !== "all" || filterProject !== "all" || filterWorkOrder !== "all" || filterEmployee !== "all" ? "Try adjusting your filters." : "Create your first task to get started."}
            </p>
            {!search && filterStatus === "all" && filterCategory === "all" && filterContact === "all" && filterProject === "all" && filterWorkOrder === "all" && filterEmployee === "all" && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> New Task</Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-6"></th>
                  <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-8">
                    <button onClick={toggleSelectAll} className="hover:text-foreground transition-colors">
                      {sorted.length > 0 && sorted.every(t => selectedIds.has(t.id))
                        ? <CheckSquare className="w-4 h-4 text-primary" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                  {vis.has("reference") && <SortableTh label="Ref" sortKey="reference" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-24" />}
                  <SortableTh label="Task" sortKey="title" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider" />
                  {vis.has("work_order") && <SortableTh label="WO / Project / Client" sortKey="work_order" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell" />}
                  {vis.has("subtasks") && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Subtasks</th>}
                  {vis.has("reports") && <th className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Reports</th>}
                  <SortableTh label="Created" sortKey="created" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell whitespace-nowrap" />
                  <SortableTh label="Status" sortKey="status" currentKey={sortKey} dir={sortDir} onSort={handleSort} className="px-2 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24 whitespace-nowrap" />
                  <th className="px-2 py-2.5 w-16"></th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {pagination.pageItems.map(t => {
                    const subs = subtasksMap[t.id] || [];
                    const doneSubs = subs.filter(s => s.done).length;
                    const isExpanded = expandedTask === t.id;
                    const isReportsExpanded = expandedReports === t.id;
                    const isHistoryExpanded = expandedHistory === t.id;
                    const hasReports = true; // always show report icon — reports can exist for any task
                    return (
                      <React.Fragment key={t.id}>
                        <motion.tr
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                          className="border-b border-border hover:bg-muted/20 transition-colors group">

                          {/* Expand toggle */}
                          <td className="px-2 py-2.5">
                            <div className="flex flex-col gap-1 items-center">
                              {subs.length > 0 && (
                                <button onClick={() => toggleExpand(t.id)}
                                  className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
                                  title="Subtasks">
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {hasReports && (
                                <button onClick={() => toggleReports(t.id)}
                                  title="Working Reports"
                                  className={`p-0.5 rounded transition-colors ${isReportsExpanded ? "text-primary" : "text-muted-foreground/50 hover:text-primary"}`}>
                                  <FileText className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button onClick={() => toggleHistory(t.id)}
                                title="History & Notes"
                                className={`p-0.5 rounded transition-colors ${isHistoryExpanded ? "text-primary" : "text-muted-foreground/50 hover:text-primary"}`}>
                                <Clock className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>

                          {/* Selection checkbox */}
                          <td className="px-2 py-2.5">
                            <button onClick={() => toggleSelect(t.id)} className="p-0.5 rounded text-muted-foreground hover:text-primary transition-colors">
                              {selectedIds.has(t.id)
                                ? <CheckSquare className="w-4 h-4 text-primary" />
                                : <Square className="w-4 h-4" />}
                            </button>
                          </td>

                          {vis.has("reference") && (
                          <td className="px-2 py-2.5 hidden sm:table-cell">
                            <div className="flex items-center gap-1">
                             {t.recurrence_template_id && <RefreshCw className="w-3 h-3 text-violet-400 shrink-0" title="Auto-generated recurring task" />}
                             {t.is_recurring
                               ? <span className="text-xs font-medium text-violet-500 bg-violet-50 px-2 py-0.5 rounded-full flex items-center gap-1"><RefreshCw className="w-3 h-3" />Template</span>
                               : t.reference
                                 ? <button onClick={() => navigate(`/tasks/${t.id}`)} className="font-mono text-xs text-primary font-medium hover:underline cursor-pointer">{t.reference}</button>
                                 : <span className="text-xs text-muted-foreground/30">—</span>}
                            </div>
                          </td>
                          )}

                          {/* Task title */}
                          <td className="px-2 py-2.5 max-w-[220px]">
                            <p className="text-sm font-semibold text-foreground leading-tight truncate">{t.title}</p>
                            {t.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{t.description}</p>}
                            {/* Subtask progress */}
                            {subs.length > 0 && (
                              <div className="flex items-center gap-1.5 mt-1">
                                <div className="h-1 flex-1 max-w-[80px] bg-muted rounded-full overflow-hidden">
                                  <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(doneSubs / subs.length) * 100}%` }} />
                                </div>
                                <span className="text-xs text-muted-foreground">{doneSubs}/{subs.length}</span>
                              </div>
                            )}
                            {t.priority && t.priority !== "Medium" && (
                              <span className={`inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[t.priority]}`}>
                                {t.priority}
                              </span>
                            )}
                          </td>

                          {vis.has("work_order") && (
                          <td className="px-2 py-2.5 hidden lg:table-cell max-w-[180px]">
                            {t.work_order_name && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <ClipboardList className="w-3 h-3 shrink-0 text-primary/60" />
                                <span className="truncate">{t.work_order_name}</span>
                              </span>
                            )}
                            {t.project_name && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground/60 mt-0.5">
                                <FolderKanban className="w-3 h-3 shrink-0" />
                                <span className="truncate">{t.project_name}</span>
                              </span>
                            )}
                            {t.contact_name && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground/60 mt-0.5">
                                <User className="w-3 h-3 shrink-0 text-blue-400" />
                                <span className="truncate">{t.contact_name}</span>
                              </span>
                            )}
                            {t.asset_name && (
                              <span className="flex items-center gap-1 text-xs text-muted-foreground/60 mt-0.5">
                                <Package className="w-3 h-3 shrink-0 text-orange-400" />
                                <span className="truncate">{t.asset_name}</span>
                              </span>
                            )}
                            {!t.work_order_name && !t.project_name && !t.contact_name && !t.asset_name && <span className="text-xs text-muted-foreground/40">—</span>}
                          </td>
                          )}

                          {vis.has("subtasks") && (
                          <td className="px-2 py-2.5 hidden md:table-cell">
                            <TaskSubtasksCell subtasks={subs} />
                          </td>
                          )}

                          {vis.has("reports") && (
                          <td className="px-2 py-2.5 hidden lg:table-cell">
                            <TaskReportsCell
                              reports={reportsMap[t.id] || []}
                              onViewReport={(report) => setReportModal({ open: true, report, task: t })}
                            />
                          </td>
                          )}

                          {/* Created date */}
                          <td className="px-2 py-2.5 hidden md:table-cell whitespace-nowrap text-xs text-muted-foreground">
                            {fmtDate(t.created_date)}
                          </td>

                          {/* Status */}
                          <td className="px-2 py-2.5">
                            <StatusToggle
                              status={getEffectiveStatus(t)}
                              canEdit={canEditTasks}
                              statuses={statuses}
                              onToggle={() => {
                                const eff = getEffectiveStatus(t);
                                const newStatus = eff === "Completed" ? "Not Completed" : "Completed";
                                handleStatusChange(t.id, newStatus);
                              }}
                            />
                          </td>

                          {/* Actions */}
                          <td className="px-2 py-2.5">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(t)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            {getEffectiveStatus(t) === "Archived" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-500 hover:text-slate-700" title="Restore (unarchive)"
                                onClick={() => handleStatusChange(t.id, "Queued")}>
                                <ArchiveRestore className="w-3.5 h-3.5" />
                              </Button>
                            )}
                            {getEffectiveStatus(t) === "Template" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-cyan-600 hover:text-cyan-700" title="Create task from template" onClick={() => handleUseTemplate(t)}>
                                <Sparkles className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(t.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          </td>
                        </motion.tr>

                        {/* Expanded subtasks row */}
                        {isExpanded && (
                        <tr className="border-b border-border bg-muted/10">
                          <td colSpan={10} className="px-8 py-4">
                              <TaskSubtasks taskId={t.id} subtasks={subs} onSubtasksChange={(next) => setSubtasksMap(prev => ({ ...prev, [t.id]: next }))} />
                            </td>
                          </tr>
                        )}

                        {/* Expanded reports sub-list row */}
                        {isReportsExpanded && (
                        <tr className="border-b border-border bg-slate-50/60">
                          <td colSpan={10} className="py-2">
                              <TaskReportsList
                                taskId={t.id}
                                onViewReport={(report) => setReportModal({ open: true, report, task: t })}
                              />
                            </td>
                          </tr>
                        )}

                        {/* Expanded history row */}
                        {isHistoryExpanded && (
                        <tr className="border-b border-border bg-slate-50/60">
                          <td colSpan={10} className="px-8 py-4">
                              <TaskHistoryPanel
                                taskId={t.id}
                                taskReference={t.reference}
                                refreshTrigger={historyRefresh}
                              />
                            </td>
                          </tr>
                        )}


                      </React.Fragment>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <PaginationFooter pagination={pagination} />

      <ReportQuickViewModal
        open={reportModal.open}
        onClose={() => setReportModal({ open: false, report: null, task: null })}
        report={reportModal.report}
        task={reportModal.task}
      />

      <TaskFormModal
        open={modal}
        onClose={() => { setModal(false); setEditing(null); }}
        onSave={handleSave}
        task={editing}
        workOrders={workOrders}
      />

      <QuickDraftTaskModal
        open={quickDraftModal}
        onClose={() => setQuickDraftModal(false)}
        onCreated={() => load()}
      />
    </div>
  );
}