import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import {
  ArrowLeft, ClipboardList, Pencil, MapPin, Calendar,
  User, FolderKanban, CheckSquare, Clock, Paperclip, Hash, Wrench, Package
} from "lucide-react";

const TASK_STATUS_STYLES = {
  Pending:      "bg-amber-100 text-amber-700",
  "In Progress":"bg-blue-100 text-blue-700",
  Completed:    "bg-emerald-100 text-emerald-700",
  Cancelled:    "bg-red-100 text-red-600",
  "On Hold":    "bg-slate-100 text-slate-500",
};

function TasksTable({ tasks }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell w-32">Ref</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Task</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Contact / Asset</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Date / Time</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">Assigned</th>
            <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => (
            <tr key={t.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              <td className="px-4 py-3 hidden sm:table-cell w-32">
                {t.reference
                  ? <Link to={`/tasks/${t.id}`} className="text-xs font-mono text-primary hover:underline">{t.reference}</Link>
                  : <span className="text-xs text-muted-foreground/40">—</span>}
              </td>
              <td className="px-4 py-3">
                <p className="font-medium text-foreground leading-tight">{t.title || "—"}</p>
                {t.project_name && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground/70 mt-0.5">
                    <FolderKanban className="w-3 h-3 shrink-0" />{t.project_name}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 hidden md:table-cell">
                {t.contact_name && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <User className="w-3 h-3 shrink-0 text-blue-400" />{t.contact_name}
                  </span>
                )}
                {t.asset_name && (
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                    <Package className="w-3 h-3 shrink-0 text-orange-400" />{t.asset_name}
                  </span>
                )}
                {!t.contact_name && !t.asset_name && <span className="text-xs text-muted-foreground/40">—</span>}
              </td>
              <td className="px-4 py-3 hidden sm:table-cell">
                {t.planning_date && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="w-3 h-3 shrink-0" />
                    {new Date(t.planning_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                )}
                {(t.planning_time_in || t.planning_time_out) && (
                  <span className="text-xs text-muted-foreground/70 block mt-0.5">
                    {t.planning_time_in?.slice(0,5) || "—"} → {t.planning_time_out?.slice(0,5) || "—"}
                  </span>
                )}
                {!t.planning_date && !t.planning_time_in && <span className="text-xs text-muted-foreground/40">—</span>}
              </td>
              <td className="px-4 py-3 hidden lg:table-cell">
                {(t.assigned_user_names || []).length > 0
                  ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><User className="w-3 h-3 shrink-0" />{(t.assigned_user_names || []).join(", ")}</span>
                  : <span className="text-xs text-muted-foreground/40">—</span>}
              </td>
              <td className="px-4 py-3">
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${TASK_STATUS_STYLES[t.status] || "bg-muted text-muted-foreground"}`}>
                  {t.status || "Pending"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
import { Button } from "@/components/ui/button";
import WorkOrderFormModal from "@/components/workorders/WorkOrderFormModal";
import WorkOrderHistory from "@/components/workorders/WorkOrderHistory";
import SharedFilesPanel from "@/components/shared/SharedFilesPanel";
import WorkhandCostPanel from "@/components/shared/WorkhandCostPanel";
import ContactPersonPanel from "@/components/contacts/ContactPersonPanel";
import { computeChanges } from "@/lib/changeLog";

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

const TABS = [
  { id: "all",     label: "All" },
  { id: "tasks",   label: "Tasks" },
  { id: "contact_persons", label: "Contact Persons" },
  { id: "labour",  label: "Labour Cost" },
  { id: "history", label: "History & Notes" },
  { id: "files",   label: "Files" },
];

function EmptySection({ label, Icon }) {
  return (
    <div className="py-10 text-center">
      {Icon && <Icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />}
      <p className="text-sm text-muted-foreground">No {label.toLowerCase()} found for this work order.</p>
    </div>
  );
}

export default function WorkOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [workOrder, setWorkOrder] = useState(null);
  const [projects, setProjects] = useState([]);
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [editModal, setEditModal] = useState(false);

  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [files, setFiles] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);

  const load = async () => {
    setLoading(true);
    const [wos, p, a] = await Promise.all([
      base44.entities.WorkOrder.filter({ id }),
      base44.entities.Project.list("name", 200),
      base44.entities.Asset.list("name", 200),
    ]);
    const found = Array.isArray(wos) ? wos[0] : wos;
    setWorkOrder(found || null);
    setProjects(p);
    setAssets(a);

    const results = await Promise.allSettled([
      base44.entities.Task?.filter({ work_order_id: id }) || Promise.resolve([]),
      base44.entities.WorkOrderNote.filter({ work_order_id: id }),
      base44.entities.SharedFile.filter({ work_order_id: id }),
      base44.entities.ContactPerson.filter({ work_order_id: id }),
      base44.entities.TimeEntry?.filter({ work_order_id: id }) || Promise.resolve([]),
    ]);
    setTasks(results[0].status === "fulfilled" ? results[0].value || [] : []);
    setNotes(results[1].status === "fulfilled" ? results[1].value || [] : []);
    setFiles(results[2].status === "fulfilled" ? results[2].value || [] : []);
    setContactPersons(results[3].status === "fulfilled" ? results[3].value || [] : []);
    setTimeEntries(results[4].status === "fulfilled" ? results[4].value || [] : []);

    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (form) => {
    // Pull out the staged contact person — it is not a WorkOrder field
    const { _pending_contact_person, ...woData } = form;
    const changes = computeChanges(workOrder, woData, [
      ["title", "Title"], ["reference", "Reference"], ["status", "Status"],
      ["priority", "Priority"], ["type", "Type"], ["project_name", "Project"],
      ["contact_name", "Client"], ["asset_name", "Asset"], ["assigned_to", "Assigned To"],
      ["scheduled_date", "Scheduled Date"], ["due_date", "Due Date"],
      ["location", "Location"], ["maps_link", "Maps Link"],
      ["description", "Description"], ["notes", "Notes"],
    ]);
    await base44.entities.WorkOrder.update(id, woData);

    // Propagate asset / contact / project changes to all tasks linked to this work order
    const inheritedChanged =
      (woData.asset_id || "") !== (workOrder.asset_id || "") ||
      (woData.asset_name || "") !== (workOrder.asset_name || "") ||
      (woData.contact_id || "") !== (workOrder.contact_id || "") ||
      (woData.contact_name || "") !== (workOrder.contact_name || "") ||
      (woData.project_id || "") !== (workOrder.project_id || "") ||
      (woData.project_name || "") !== (workOrder.project_name || "");
    if (inheritedChanged) {
      try {
        const woTasks = await base44.entities.Task.filter({ work_order_id: id });
        if (woTasks && woTasks.length > 0) {
          await base44.entities.Task.bulkUpdate(
            woTasks.map(t => ({
              id: t.id,
              asset_id: woData.asset_id || "",
              asset_name: woData.asset_name || "",
              contact_id: woData.contact_id || "",
              contact_name: woData.contact_name || "",
              project_id: woData.project_id || "",
              project_name: woData.project_name || "",
            }))
          );
        }
      } catch (e) { console.error("Failed to sync inherited fields to tasks", e); }
    }

    // Create the staged contact person, linked to this work order + project + client (ascends up)
    if (_pending_contact_person) {
      await base44.entities.ContactPerson.create({
        full_name: _pending_contact_person.full_name,
        role: _pending_contact_person.role,
        phone: _pending_contact_person.phone,
        contact_id: form.contact_id || undefined,
        contact_name: form.contact_name || undefined,
        project_id: form.project_id || undefined,
        project_name: form.project_name || undefined,
        work_order_id: id,
        work_order_name: form.title,
      });
    }
    if (changes.length > 0) {
      try {
        await base44.entities.WorkOrderNote.create({
          work_order_id: id,
          action: "Update",
          note: changes.join(" · "),
        });
      } catch (e) { console.error("Failed to log history", e); }
    }
    setEditModal(false);
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading work order...</div>;
  }

  if (!workOrder) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Work order not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/work-orders")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Work Orders
        </Button>
      </div>
    );
  }

  const tabCounts = {
    all: tasks.length,
    tasks: tasks.length,
    contact_persons: contactPersons.length,
    labour: timeEntries.length,
    history: notes.length,
    files: files.length,
  };

  const visibleTabs = TABS.filter(t => t.id === "all" || (tabCounts[t.id] ?? 0) > 0);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to={workOrder.contact_id ? `/work-orders?contact_id=${workOrder.contact_id}` : "/work-orders"} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> {workOrder.contact_id ? `${workOrder.contact_name} Work Orders` : "Work Orders"}
      </Link>

      {/* Header Card */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 shrink-0">
            <ClipboardList className="w-7 h-7 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{workOrder.title}</h1>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_STYLES[workOrder.type] || TYPE_STYLES.Other}`}>
                {workOrder.type || "Other"}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[workOrder.status] || STATUS_STYLES.Active}`}>
                {workOrder.status || "Active"}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${PRIORITY_STYLES[workOrder.priority] || PRIORITY_STYLES.Medium}`}>
                {workOrder.priority || "Medium"}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mt-2">
              {workOrder.reference && (
                <span className="flex items-center gap-1.5 font-mono">
                  <Hash className="w-3.5 h-3.5 shrink-0" /> {workOrder.reference}
                </span>
              )}
              {workOrder.project_name && (
                <span className="flex items-center gap-1.5">
                  <FolderKanban className="w-3.5 h-3.5 shrink-0" />
                  <Link to={`/projects/${workOrder.project_id}`} className="hover:text-primary transition-colors">
                    {workOrder.project_name}
                  </Link>
                </span>
              )}
              {workOrder.contact_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" /> {workOrder.contact_name}
                </span>
              )}
              {workOrder.asset_name && (
                <span className="flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 shrink-0" />
                  <Link to={`/assets/${workOrder.asset_id}`} className="hover:text-primary transition-colors">
                    {workOrder.asset_name}
                  </Link>
                </span>
              )}
              {workOrder.assigned_to && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" /> {workOrder.assigned_to}
                </span>
              )}
              {(workOrder.scheduled_date || workOrder.due_date) && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {workOrder.scheduled_date ? fmtDate(workOrder.scheduled_date) : ""}
                  {workOrder.due_date ? ` → ${fmtDate(workOrder.due_date)}` : ""}
                </span>
              )}
              {workOrder.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {workOrder.location}
                </span>
              )}
              {workOrder.maps_link && (
                <a href={workOrder.maps_link} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:underline">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> Google Maps ↗
                </a>
              )}
            </div>

            {workOrder.description && (
              <p className="mt-2 text-sm text-muted-foreground border-l-2 border-border pl-3">{workOrder.description}</p>
            )}
          </div>

          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setEditModal(true)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="grid grid-cols-3 gap-2">
        {[
          { label: "Tasks",  count: tasks.length,  Icon: CheckSquare, color: "text-indigo-600" },
          { label: "Notes",  count: notes.length,  Icon: Clock,       color: "text-blue-600" },
          { label: "Files",  count: files.length,  Icon: Paperclip,   color: "text-emerald-600" },
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
            tasks.length === 0 && notes.length === 0 && files.length === 0
              ? <EmptySection label="Activity" Icon={ClipboardList} />
              : (
                <div className="space-y-6">
                  {tasks.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Tasks</p>
                      <TasksTable tasks={tasks} />
                    </div>
                  )}
                  {notes.length > 0 && (
                    <WorkOrderHistory workOrderId={id} notes={notes} onRefresh={load} />
                  )}
                  {files.length > 0 && (
                    <SharedFilesPanel context={{ work_order_id: id, work_order_name: workOrder.title, project_id: workOrder.project_id || undefined, project_name: workOrder.project_name || undefined, contact_id: workOrder.contact_id || undefined, contact_name: workOrder.contact_name || undefined }} files={files} onRefresh={load} />
                  )}
                </div>
              )
          )}
          {tab === "tasks" && (
            tasks.length === 0
              ? <EmptySection label="Tasks" Icon={CheckSquare} />
              : <TasksTable tasks={tasks} />
          )}
          {tab === "contact_persons" && (
            <ContactPersonPanel context={{
              work_order_id: id,
              work_order_name: workOrder.title,
              project_id: workOrder.project_id || undefined,
              project_name: workOrder.project_name || undefined,
              contact_id: workOrder.contact_id || undefined,
              contact_name: workOrder.contact_name || undefined,
            }} />
          )}
          {tab === "labour" && (
            <WorkhandCostPanel filterKey="work_order_id" filterId={id} currency="AED" />
          )}
          {tab === "history" && (
            <WorkOrderHistory workOrderId={id} notes={notes} onRefresh={load} />
          )}
          {tab === "files" && (
            <SharedFilesPanel context={{ work_order_id: id, work_order_name: workOrder.title, project_id: workOrder.project_id || undefined, project_name: workOrder.project_name || undefined, contact_id: workOrder.contact_id || undefined, contact_name: workOrder.contact_name || undefined }} files={files} onRefresh={load} />
          )}
        </div>
      </motion.div>

      <WorkOrderFormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        onSave={handleSave}
        workOrder={workOrder}
        projects={projects}
        assets={assets}
      />
    </div>
  );
}