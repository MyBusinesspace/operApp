import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  CheckSquare,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import ColumnToggle from "@/components/shared/ColumnToggle";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import DemoTaskDialog from "../components/DemoTaskDialog.jsx";
import DemoQuickDraftTaskModal from "../components/DemoQuickDraftTaskModal.jsx";
import "../demo.css";

const STATUS_STYLES = {
  Queued: "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-400",
  Scheduled: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  "Not Completed":
    "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Completed:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  Archived: "bg-zinc-100 text-zinc-500 dark:bg-zinc-500/15 dark:text-zinc-400",
};

const PRIORITY_STYLES = {
  Low: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  High: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  Urgent: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

const COLUMN_DEFS = [
  { key: "reference", label: "Reference", required: false },
  { key: "title", label: "Task", required: true },
  { key: "work_order", label: "WO / Project", required: false },
  { key: "assigned", label: "Assigned", required: false },
  { key: "planning_date", label: "Date", required: false },
  { key: "priority", label: "Priority", required: false },
  { key: "status", label: "Status", required: false },
  { key: "subtasks", label: "Subtasks", required: false },
];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d.includes("T") ? d : d + "T00:00:00").toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "short", year: "numeric" }
  );
}

export default function DemoTasks() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const tasks = data?.tasks || [];
  const contacts = data?.contacts || [];
  const projects = data?.projects || [];
  const assets = data?.assets || [];
  const workOrders = data?.workOrders || [];
  const employees = data?.employees || [];
  const teams = data?.teams || [];

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [visibleCols, setVisibleCols] = useState({
    reference: true,
    title: true,
    work_order: true,
    assigned: true,
    planning_date: true,
    priority: true,
    status: true,
    subtasks: true,
  });
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [quickDraftModal, setQuickDraftModal] = useState(false);

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const toggleCol = (key) =>
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const categories = [
    ...new Set(tasks.map((t) => t.category).filter(Boolean)),
  ];
  const projectNames = [
    ...new Set(tasks.map((t) => t.project_name).filter(Boolean)),
  ];

  const filtered = tasks.filter((t) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      t.title?.toLowerCase().includes(s) ||
      t.reference?.toLowerCase().includes(s) ||
      t.project_name?.toLowerCase().includes(s) ||
      t.work_order_name?.toLowerCase().includes(s) ||
      t.contact_name?.toLowerCase().includes(s) ||
      (t.assigned_employee_names || []).some((n) =>
        n.toLowerCase().includes(s)
      );
    const matchStatus = filterStatus === "all" || t.status === filterStatus;
    const matchCat = filterCategory === "all" || t.category === filterCategory;
    const matchProj =
      filterProject === "all" || t.project_name === filterProject;
    return matchSearch && matchStatus && matchCat && matchProj;
  });

  const openEdit = (t) => {
    setEditing(t);
    setModal(true);
  };
  const openAdd = () => {
    setEditing(null);
    setModal(true);
  };

  const statusTabs = [
    { key: "all", label: "All", count: tasks.length },
    {
      key: "Queued",
      label: "Queued",
      count: tasks.filter((t) => t.status === "Queued").length,
    },
    {
      key: "Scheduled",
      label: "Scheduled",
      count: tasks.filter((t) => t.status === "Scheduled").length,
    },
    {
      key: "Not Completed",
      label: "Not Completed",
      count: tasks.filter((t) => t.status === "Not Completed").length,
    },
    {
      key: "Completed",
      label: "Completed",
      count: tasks.filter((t) => t.status === "Completed").length,
    },
    {
      key: "Archived",
      label: "Archived",
      count: tasks.filter((t) => t.status === "Archived").length,
    },
  ].filter((t) => t.key === "all" || t.count > 0);

  return (
    <div className="min-h-screen bg-background">
      <DemoTopNavBar companyName={data.companyName} />
      <main className="pt-[var(--nav-height)]">
        <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-5">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <BackToOverviewButton to="/demo/app/operations-overview" />
              <div>
                <h1
                  className="text-2xl font-bold tracking-tight text-foreground"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  Tasks
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Plan and track field tasks linked to work orders & projects
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                title="Demo — view only"
                onClick={(e) => e.preventDefault()}
              >
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> New Task
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setQuickDraftModal(true)}
              >
                <Zap className="w-4 h-4" /> Quick Task
              </Button>
            </div>
          </motion.div>

          <div className="flex flex-wrap gap-1 border-b border-border pb-0">
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterStatus(tab.key)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
                  filterStatus === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label} <span className="ml-1 text-xs">{tab.count}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search title, reference, WO, project, assignee..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projectNames.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ColumnToggle
              columns={COLUMN_DEFS}
              visible={visibleCols}
              onToggle={toggleCol}
            />
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <CheckSquare className="w-7 h-7 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  No tasks found
                </h3>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your filters.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {visibleCols.reference && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                          Reference
                        </th>
                      )}
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        Task
                      </th>
                      {visibleCols.work_order && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">
                          WO / Project
                        </th>
                      )}
                      {visibleCols.assigned && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                          Assigned
                        </th>
                      )}
                      {visibleCols.planning_date && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                          Date
                        </th>
                      )}
                      {visibleCols.priority && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">
                          Priority
                        </th>
                      )}
                      {visibleCols.status && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                          Status
                        </th>
                      )}
                      {visibleCols.subtasks && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">
                          Sub / Rpts
                        </th>
                      )}
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => (
                      <tr
                        key={t.id}
                        className="border-b border-border hover:bg-muted/30 transition-colors group"
                      >
                        {visibleCols.reference && (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openEdit(t)}
                              className="font-mono text-xs text-primary font-medium hover:underline"
                            >
                              {t.reference || "—"}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openEdit(t)}
                            className="text-left"
                          >
                            <p className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                              {t.title}
                            </p>
                            {t.category && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {t.category}
                              </p>
                            )}
                          </button>
                        </td>
                        {visibleCols.work_order && (
                          <td className="px-4 py-3 hidden md:table-cell">
                            <div className="text-sm text-muted-foreground space-y-0.5">
                              {t.work_order_name && (
                                <p className="truncate max-w-[180px]">
                                  {t.work_order_name}
                                </p>
                              )}
                              {t.project_name && (
                                <p className="text-xs truncate max-w-[180px]">
                                  {t.project_name}
                                </p>
                              )}
                              {!t.work_order_name && !t.project_name && "—"}
                            </div>
                          </td>
                        )}
                        {visibleCols.assigned && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {(t.assigned_employee_names || []).length > 0 ? (
                              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Users className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate max-w-[140px]">
                                  {(t.assigned_employee_names || []).join(", ")}
                                </span>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                —
                              </span>
                            )}
                          </td>
                        )}
                        {visibleCols.planning_date && (
                          <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground tabular-nums">
                            {fmtDate(t.planning_date)}
                            {t.planning_time_in && (
                              <span className="block text-xs">
                                {t.planning_time_in}
                                {t.planning_time_out
                                  ? `–${t.planning_time_out}`
                                  : ""}
                              </span>
                            )}
                          </td>
                        )}
                        {visibleCols.priority && (
                          <td className="px-4 py-3 hidden xl:table-cell">
                            {t.priority ? (
                              <span
                                className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                  PRIORITY_STYLES[t.priority] ||
                                  PRIORITY_STYLES.Medium
                                }`}
                              >
                                {t.priority}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        )}
                        {visibleCols.status && (
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                STATUS_STYLES[t.status] || STATUS_STYLES.Queued
                              }`}
                            >
                              {t.status}
                            </span>
                          </td>
                        )}
                        {visibleCols.subtasks && (
                          <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground tabular-nums">
                            {t.subtasks_count ?? 0} / {t.reports_count ?? 0}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              type="button"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              onClick={() => openEdit(t)}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                              title="Demo — view only"
                              onClick={(e) => e.preventDefault()}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <DemoTaskDialog
          open={modal}
          onClose={() => {
            setModal(false);
            setEditing(null);
          }}
          task={editing}
          contacts={contacts}
          projects={projects}
          assets={assets}
          workOrders={workOrders}
          employees={employees}
          teams={teams}
          allTasks={tasks}
        />
        <DemoQuickDraftTaskModal
          open={quickDraftModal}
          onClose={() => setQuickDraftModal(false)}
          projects={projects}
          contacts={contacts}
          workOrders={workOrders}
          tasks={tasks}
        />
        <DemoGuideCard pageId="tasks" />
      </main>
    </div>
  );
}
