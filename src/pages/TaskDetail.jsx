import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import {
  ArrowLeft, CheckSquare, Pencil, MapPin, Calendar, Clock, Paperclip,
  User, FolderKanban, Hash, Package, ClipboardList, FileText, Receipt, FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import TaskFormModal from "@/components/tasks/TaskFormModal";
import TaskSubtasks from "@/components/tasks/TaskSubtasks";
import TaskReportsList from "@/components/tasks/TaskReportsList";
import TaskHistoryPanel, { logTaskHistory } from "@/components/tasks/TaskHistoryPanel";
import ReportQuickViewModal from "@/components/tasks/ReportQuickViewModal";
import WorkhandCostPanel from "@/components/shared/WorkhandCostPanel";
import { getEffectiveStatus } from "@/lib/taskStatus";
import { computeChanges } from "@/lib/changeLog";

const STATUS_STYLES = {
  Queued:          "bg-amber-100 text-amber-700",
  Scheduled:       "bg-violet-100 text-violet-700",
  "Not Completed": "bg-orange-100 text-orange-700",
  Active:          "bg-orange-100 text-orange-700",
  Completed:       "bg-emerald-100 text-emerald-700",
  Template:        "bg-cyan-100 text-cyan-700",
  Archived:        "bg-slate-200 text-slate-500",
};

const PRIORITY_STYLES = {
  Low:    "bg-slate-100 text-slate-500",
  Medium: "bg-blue-100 text-blue-700",
  High:   "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
};

const TABS = [
  { id: "all",      label: "All" },
  { id: "reports",  label: "Reports" },
  { id: "subtasks", label: "Subtasks" },
  { id: "labour",   label: "Labour Cost" },
  { id: "invoices", label: "Invoices" },
  { id: "quotes",   label: "Quotes" },
  { id: "history",  label: "History & Notes" },
];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtCurrency(n, currency = "AED") {
  if (!n && n !== 0) return "—";
  return `${currency} ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

function EmptySection({ label, Icon }) {
  return (
    <div className="py-10 text-center">
      {Icon && <Icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />}
      <p className="text-sm text-muted-foreground">No {label.toLowerCase()} found for this task.</p>
    </div>
  );
}

function DocumentsTable({ docs, type }) {
  if (!docs.length) return <EmptySection label={type} Icon={type === "Invoices" ? Receipt : FileCheck2} />;
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <th className="px-4 py-2.5 text-left">Number</th>
            <th className="px-4 py-2.5 text-left">Contact</th>
            <th className="px-4 py-2.5 text-left hidden sm:table-cell">Date</th>
            <th className="px-4 py-2.5 text-left">Status</th>
            <th className="px-4 py-2.5 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {docs.map(d => (
            <tr key={d.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 font-mono text-xs text-primary font-medium">{d.number || d.reference || "—"}</td>
              <td className="px-4 py-3 text-foreground">{d.contact_name || "—"}</td>
              <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                {fmtDate(d.issue_date)}
              </td>
              <td className="px-4 py-3">
                <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                  {d.status || "—"}
                </span>
              </td>
              <td className="px-4 py-3 text-right font-medium text-foreground">{fmtCurrency(d.total, d.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function TaskDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [subtasks, setSubtasks] = useState([]);
  const [reports, setReports] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [editModal, setEditModal] = useState(false);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [reportModal, setReportModal] = useState({ open: false, report: null });
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(u => setCurrentUser(u)).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const t = await base44.entities.Task.get(id).catch(() => null);
      setTask(t || null);
      const results = await Promise.allSettled([
        base44.entities.WorkOrder.list("title", 200),
        base44.entities.TaskSubtask.filter({ task_id: id }, "sort_order"),
        base44.entities.WorkingReport.filter({ task_id: id }, "-clock_in_time"),
        base44.entities.Invoice.list("-created_date", 500),
        base44.entities.Quote.list("-created_date", 500),
        base44.entities.TaskStatus.list("name", 100),
      ]);
      setWorkOrders(results[0].status === "fulfilled" ? results[0].value || [] : []);
      setSubtasks(results[1].status === "fulfilled" ? results[1].value || [] : []);
      setReports(results[2].status === "fulfilled" ? results[2].value || [] : []);
      const invs = results[3].status === "fulfilled" ? results[3].value || [] : [];
      const qts = results[4].status === "fulfilled" ? results[4].value || [] : [];
      setInvoices(invs.filter(d => (d.task_ids || []).includes(id)));
      setQuotes(qts.filter(d => (d.task_ids || []).includes(id)));
      setStatuses(results[5].status === "fulfilled" ? results[5].value || [] : []);
    } catch (e) {
      console.error("TaskDetail load error:", e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (form) => {
    const oldTask = task;
    const updated = await base44.entities.Task.update(id, form);
    const userName = currentUser?.full_name || currentUser?.email || "Unknown";
    // Log status change separately, otherwise log field-level updates
    if (oldTask && form.status && oldTask.status !== form.status) {
      await logTaskHistory({
        taskId: id,
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
        taskId: id,
        taskReference: form.reference || oldTask?.reference || "",
        action: "Updated",
        detail: taskChanges.length > 0 ? taskChanges.join(" · ") : "Task details updated",
        userName,
      });
    }
    setHistoryRefresh(r => r + 1);
    setEditModal(false);
    load();
    return updated;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading task...</div>;
  }
  if (!task) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Task not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/tasks")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Tasks
        </Button>
      </div>
    );
  }

  const effStatus = getEffectiveStatus(task);
  const customStatus = statuses.find(s => s.name === task.status);
  const statusBadgeStyle = customStatus
    ? { backgroundColor: customStatus.color + "20", color: customStatus.color }
    : undefined;
  const statusBadgeClass = customStatus ? "" : (STATUS_STYLES[effStatus] || "bg-muted text-muted-foreground");

  const tabCounts = {
    all: reports.length + subtasks.length + invoices.length + quotes.length,
    reports: reports.length,
    subtasks: subtasks.length,
    labour: 0,
    invoices: invoices.length,
    quotes: quotes.length,
    history: 0,
  };
  const visibleTabs = TABS.filter(t => t.id === "all" || t.id === "labour" || t.id === "history" || (tabCounts[t.id] ?? 0) > 0);

  const mapsLink = task.location_lat && task.location_lng
    ? `https://www.google.com/maps?q=${task.location_lat},${task.location_lng}`
    : task.location_address
      ? `https://www.google.com/maps?q=${encodeURIComponent(task.location_address)}`
      : null;

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to="/tasks" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Tasks
      </Link>

      {/* Header Card */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 shrink-0">
            <CheckSquare className="w-7 h-7 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{task.title}</h1>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${statusBadgeClass}`} style={statusBadgeStyle}>
                {effStatus || "Queued"}
              </span>
              {task.priority && task.priority !== "Medium" && (
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${PRIORITY_STYLES[task.priority]}`}>
                  {task.priority}
                </span>
              )}
              {task.is_recurring && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700">Recurring</span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mt-2">
              {task.reference && (
                <span className="flex items-center gap-1.5 font-mono">
                  <Hash className="w-3.5 h-3.5 shrink-0" /> {task.reference}
                </span>
              )}
              {task.category && (
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" /> {task.category}
                </span>
              )}
              {task.work_order_name && (
                <span className="flex items-center gap-1.5">
                  <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                  <Link to={`/work-orders/${task.work_order_id}`} className="hover:text-primary transition-colors">
                    {task.work_order_name}
                  </Link>
                </span>
              )}
              {task.project_name && (
                <span className="flex items-center gap-1.5">
                  <FolderKanban className="w-3.5 h-3.5 shrink-0" />
                  <Link to={`/projects/${task.project_id}`} className="hover:text-primary transition-colors">
                    {task.project_name}
                  </Link>
                </span>
              )}
              {task.contact_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" />
                  <Link to={`/contacts/${task.contact_id}`} className="hover:text-primary transition-colors">
                    {task.contact_name}
                  </Link>
                </span>
              )}
              {task.asset_name && (
                <span className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 shrink-0" />
                  <Link to={`/assets/${task.asset_id}`} className="hover:text-primary transition-colors">
                    {task.asset_name}
                  </Link>
                </span>
              )}
              {task.planning_date && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {fmtDate(task.planning_date)}
                  {(task.planning_time_in || task.planning_time_out) && (
                    <span className="text-muted-foreground/70">
                      {task.planning_time_in?.slice(0, 5) || "—"} → {task.planning_time_out?.slice(0, 5) || "—"}
                    </span>
                  )}
                </span>
              )}
              {task.location_address && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {task.location_address}
                </span>
              )}
              {mapsLink && (
                <a href={mapsLink} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:underline">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> Google Maps ↗
                </a>
              )}
            </div>

            {task.description && (
              <p className="mt-2 text-sm text-muted-foreground border-l-2 border-border pl-3">{task.description}</p>
            )}
          </div>

          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setEditModal(true)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "Reports",   count: reports.length,      Icon: FileText,    color: "text-primary" },
          { label: "Subtasks",   count: subtasks.length,     Icon: CheckSquare, color: "text-indigo-600" },
          { label: "Invoices",   count: invoices.length,     Icon: Receipt,     color: "text-emerald-600" },
          { label: "Quotes",     count: quotes.length,       Icon: FileCheck2,  color: "text-blue-600" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 text-center">
            <s.Icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
            <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="border-b border-border overflow-x-auto">
          <div className="flex min-w-max">
            {visibleTabs.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}>
                {t.label}
                {tabCounts[t.id] > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    tab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {tabCounts[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {tab === "all" && (
            <div className="space-y-6">
              {reports.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Reports</p>
                  <TaskReportsList taskId={id} onViewReport={(r) => setReportModal({ open: true, report: r })} />
                </div>
              )}
              {subtasks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Subtasks</p>
                  <TaskSubtasks taskId={id} subtasks={subtasks} onSubtasksChange={setSubtasks} />
                </div>
              )}
              {invoices.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Invoices</p>
                  <DocumentsTable docs={invoices} type="Invoices" />
                </div>
              )}
              {quotes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Quotes</p>
                  <DocumentsTable docs={quotes} type="Quotes" />
                </div>
              )}
              {reports.length === 0 && subtasks.length === 0 && invoices.length === 0 && quotes.length === 0 && (
                <EmptySection label="Activity" Icon={CheckSquare} />
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">History & Notes</p>
                <TaskHistoryPanel taskId={id} taskReference={task.reference} refreshTrigger={historyRefresh} />
              </div>
            </div>
          )}
          {tab === "reports" && (
            <TaskReportsList taskId={id} onViewReport={(r) => setReportModal({ open: true, report: r })} />
          )}
          {tab === "subtasks" && (
            <TaskSubtasks taskId={id} subtasks={subtasks} onSubtasksChange={setSubtasks} />
          )}
          {tab === "labour" && (
            <WorkhandCostPanel filterKey="task_id" filterId={id} currency="AED" />
          )}
          {tab === "invoices" && <DocumentsTable docs={invoices} type="Invoices" />}
          {tab === "quotes" && <DocumentsTable docs={quotes} type="Quotes" />}
          {tab === "history" && (
            <TaskHistoryPanel taskId={id} taskReference={task.reference} refreshTrigger={historyRefresh} />
          )}
        </div>
      </motion.div>

      <TaskFormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        onSave={handleSave}
        task={task}
        workOrders={workOrders}
      />

      <ReportQuickViewModal
        open={reportModal.open}
        onClose={() => setReportModal({ open: false, report: null })}
        report={reportModal.report}
        task={task}
      />
    </div>
  );
}