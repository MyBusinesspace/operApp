import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import {
  ArrowLeft, FolderKanban, Pencil, MapPin, Calendar,
  User, ClipboardList, CheckSquare, Clock, Paperclip, Hash, DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import ProjectFormModal from "@/components/projects/ProjectFormModal";
import ProjectHistory from "@/components/projects/ProjectHistory";
import SharedFilesPanel from "@/components/shared/SharedFilesPanel";
import WorkhandCostPanel from "@/components/shared/WorkhandCostPanel";
import ContactPersonPanel from "@/components/contacts/ContactPersonPanel";
import ProjectFinancialsTable from "@/components/projects/ProjectFinancialsTable";
import { archiveProjectChildren } from "@/lib/projectArchive";
import { computeChanges } from "@/lib/changeLog";
import { getVisibleColumns } from "@/lib/visibleColumns";

const STATUS_STYLES = {
  Draft:      "bg-slate-100 text-slate-600",
  Active:     "bg-emerald-100 text-emerald-700",
  "On Hold":  "bg-amber-100 text-amber-700",
  Completed:  "bg-blue-100 text-blue-700",
  Cancelled:  "bg-red-100 text-red-600",
};

const TYPE_STYLES = {
  Rental:       "bg-indigo-100 text-indigo-700",
  Installation: "bg-sky-100 text-sky-700",
  Maintenance:  "bg-orange-100 text-orange-700",
  Consulting:   "bg-purple-100 text-purple-700",
  Construction: "bg-teal-100 text-teal-700",
  Other:        "bg-slate-100 text-slate-600",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCurrency(amount, currency = "USD") {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

const TABS = [
  { id: "all",         label: "All" },
  { id: "work_orders", label: "Work Orders" },
  { id: "tasks",       label: "Tasks" },
  { id: "contact_persons", label: "Contact Persons" },
  { id: "labour",      label: "Labour Cost" },
  { id: "invoices",    label: "Invoices" },
  { id: "bills",       label: "Bills" },
  { id: "history",     label: "History & Notes" },
  { id: "files",       label: "Files", alwaysShow: true },
];

function EmptySection({ label, Icon }) {
  return (
    <div className="py-10 text-center">
      {Icon && <Icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />}
      <p className="text-sm text-muted-foreground">No {label.toLowerCase()} found for this project.</p>
    </div>
  );
}

// ── Unified columns: Reference | Name | Type | Date | End Date | Status
const TH = ({ children }) => (
  <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">{children}</th>
);
const TD = ({ children, muted }) => (
  <td className={`px-3 py-2.5 text-sm ${muted ? "text-muted-foreground" : "text-foreground"}`}>{children}</td>
);

const COLUMNS = [
  {
    key: "ref",
    label: "Reference",
    value: (n) => n.ref,
    render: (n) => n.refLink
      ? <Link to={n.refLink} className="font-medium text-primary hover:underline">{n.ref || "—"}</Link>
      : <span className="font-medium">{n.ref || "—"}</span>,
  },
  {
    key: "name",
    label: "Name",
    value: (n) => n.name,
    muted: true,
    render: (n) => n.nameLink
      ? <Link to={n.nameLink} className="text-primary hover:underline">{n.name || "—"}</Link>
      : (n.name || "—"),
  },
  { key: "type", label: "Type", value: (n) => n.type, muted: true, render: (n) => n.type || "—" },
  { key: "date", label: "Date", value: (n) => n.date, muted: true, render: (n) => n.date || "—" },
  { key: "endDate", label: "End Date", value: (n) => n.endDate, muted: true, render: (n) => n.endDate || "—" },
  { key: "status", label: "Status", value: (n) => n.status, render: (n) => n.status || "—" },
];

function normalizeRow(row) {
  const section = row._section;
  if (section === "Work Order") {
    return {
      ref: row.reference || null,
      refLink: row.reference ? `/work-orders/${row.id}` : null,
      name: row.title,
      nameLink: `/work-orders/${row.id}`,
      type: row.type,
      date: fmtDate(row.scheduled_date),
      endDate: fmtDate(row.due_date),
      status: row.status,
    };
  }
  // Task
  return {
    ref: row.reference || row.title,
    refLink: `/tasks/${row.id}`,
    name: row.reference ? row.title : null,
    nameLink: null,
    type: row.category || row.priority,
    date: fmtDate(row.planning_date),
    endDate: null,
    status: row.status,
  };
}

function UnifiedTable({ rows }) {
  const normalized = rows.map(normalizeRow);
  const visible = getVisibleColumns(normalized, COLUMNS);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/20">
            {visible.map(col => <TH key={col.key}>{col.label}</TH>)}
          </tr>
        </thead>
        <tbody>
          {normalized.map((n, idx) => (
            <tr key={rows[idx].id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
              {visible.map(col => (
                <TD key={col.key} muted={col.muted}>{col.render(n)}</TD>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Aliases for individual tabs (rows need _section for normalizeRow)
function WorkOrdersTable({ rows }) {
  return <UnifiedTable rows={rows.map(r => ({ ...r, _section: "Work Order" }))} />;
}
function TasksTable({ rows }) {
  return <UnifiedTable rows={rows.map(r => ({ ...r, _section: "Task" }))} />;
}
function AllTable({ rows }) {
  return <UnifiedTable rows={rows} />;
}

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [project, setProject] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [editModal, setEditModal] = useState(false);

  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [notes, setNotes] = useState([]);
  const [projectFiles, setProjectFiles] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [bills, setBills] = useState([]);

  const load = async () => {
    setLoading(true);
    const [projs, c] = await Promise.all([
      base44.entities.Project.filter({ id }),
      base44.entities.Contact.list("full_name", 200),
    ]);
    const found = Array.isArray(projs) ? projs[0] : projs;
    setProject(found || null);
    setContacts(c);

    const results = await Promise.allSettled([
      base44.entities.WorkOrder?.filter({ project_id: id }) || Promise.resolve([]),
      base44.entities.Task?.filter({ project_id: id }) || Promise.resolve([]),
      base44.entities.ProjectNote.filter({ project_id: id }),
      base44.entities.SharedFile.filter({ project_id: id }),
      base44.entities.ContactPerson.filter({ project_id: id }),
      base44.entities.TimeEntry?.filter({ project_id: id }) || Promise.resolve([]),
      base44.entities.Invoice?.filter({ project_id: id }) || Promise.resolve([]),
      base44.entities.Bill?.filter({ project_id: id }) || Promise.resolve([]),
    ]);
    setWorkOrders(results[0].status === "fulfilled" ? results[0].value || [] : []);
    setTasks(results[1].status === "fulfilled" ? results[1].value || [] : []);
    setNotes(results[2].status === "fulfilled" ? results[2].value || [] : []);
    setProjectFiles(results[3].status === "fulfilled" ? results[3].value || [] : []);
    setContactPersons(results[4].status === "fulfilled" ? results[4].value || [] : []);
    setTimeEntries(results[5].status === "fulfilled" ? results[5].value || [] : []);
    setInvoices(results[6].status === "fulfilled" ? results[6].value || [] : []);
    setBills(results[7].status === "fulfilled" ? results[7].value || [] : []);

    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Hide empty tabs — fall back to "All" when the active tab becomes empty
  useEffect(() => {
    const counts = {
      all: workOrders.length + tasks.length,
      work_orders: workOrders.length,
      tasks: tasks.length,
      contact_persons: contactPersons.length,
      labour: timeEntries.length,
      invoices: invoices.length,
      bills: bills.length,
      history: notes.length,
      files: projectFiles.length,
    };
    const visible = TABS.filter(t => t.id === "all" || t.alwaysShow || (counts[t.id] ?? 0) > 0);
    if (!visible.find(t => t.id === tab)) setTab("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, workOrders.length, tasks.length, contactPersons.length, timeEntries.length, invoices.length, bills.length, notes.length, projectFiles.length]);

  const handleSave = async (form) => {
    const wasCompleted = project?.status === "Completed";
    const changes = computeChanges(project, form, [
      ["name", "Name"], ["reference", "Reference"], ["type", "Type"],
      ["status", "Status"], ["contact_name", "Client"], ["start_date", "Start Date"],
      ["end_date", "End Date"], ["budget", "Budget"], ["currency", "Currency"],
      ["location", "Location"], ["location_name", "Location Name"],
      ["maps_link", "Maps Link"], ["description", "Description"], ["notes", "Notes"],
      ["tags", "Tags"], ["contact_person", "Contact Person"],
      ["contact_phone", "Contact Phone"], ["contact_email", "Contact Email"],
    ]);
    await base44.entities.Project.update(id, form);
    // Update locally instead of a full reload
    setProject(prev => ({ ...prev, ...form }));
    // When a project transitions to Completed, archive its WOs & Tasks
    if (!wasCompleted && form.status === "Completed") {
      await archiveProjectChildren(id);
      setWorkOrders(prev => prev.map(w => ({ ...w, status: "Archived" })));
      setTasks(prev => prev.map(t => ({ ...t, status: "Archived" })));
    }
    if (changes.length > 0) {
      try {
        const note = await base44.entities.ProjectNote.create({
          project_id: id,
          action: "Update",
          note: changes.join(" · "),
        });
        setNotes(prev => [...prev, note]);
      } catch (e) { console.error("Failed to log history", e); }
    }
    setEditModal(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading project...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Project not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/projects")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Projects
        </Button>
      </div>
    );
  }

  const tabCounts = {
    all: workOrders.length + tasks.length,
    work_orders: workOrders.length,
    tasks: tasks.length,
    contact_persons: contactPersons.length,
    labour: timeEntries.length,
    invoices: invoices.length,
    bills: bills.length,
    history: notes.length,
    files: projectFiles.length,
  };

  const visibleTabs = TABS.filter(t => t.id === "all" || t.alwaysShow || (tabCounts[t.id] ?? 0) > 0);

  const allItems = [
    ...workOrders.map(w => ({ ...w, _section: "Work Order" })),
    ...tasks.map(t => ({ ...t, _section: "Task" })),
  ];

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Projects
      </Link>

      {/* Header Card */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="p-3 rounded-xl bg-primary/10 shrink-0">
            <FolderKanban className="w-7 h-7 text-primary" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_STYLES[project.type] || TYPE_STYLES.Other}`}>
                {project.type || "Other"}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[project.status] || STATUS_STYLES.Draft}`}>
                {project.status || "Draft"}
              </span>
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mt-2">
              {project.reference && (
                <span className="flex items-center gap-1.5 font-mono">
                  <Hash className="w-3.5 h-3.5 shrink-0" /> {project.reference}
                </span>
              )}
              {project.contact_name && (
                <span className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 shrink-0" /> {project.contact_name}
                </span>
              )}
{(project.start_date || project.end_date) && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  {fmtDate(project.start_date)}{project.end_date ? ` → ${fmtDate(project.end_date)}` : ""}
                </span>
              )}
              {project.budget && (
                <span className="flex items-center gap-1.5 font-semibold text-foreground">
                  <DollarSign className="w-3.5 h-3.5 shrink-0" />
                  {fmtCurrency(project.budget, project.currency)}
                </span>
              )}
              {project.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 shrink-0" /> {project.location}
                </span>
              )}
            </div>

            {project.description && (
              <p className="mt-2 text-sm text-muted-foreground border-l-2 border-border pl-3">{project.description}</p>
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
          { label: "Work Orders", count: workOrders.length, Icon: ClipboardList, color: "text-orange-600" },
          { label: "Tasks",       count: tasks.length,      Icon: CheckSquare,   color: "text-indigo-600" },
          { label: "Notes",       count: notes.length,      Icon: Clock,         color: "text-blue-600" },
          { label: "Files",       count: projectFiles.length, Icon: Paperclip,   color: "text-emerald-600" },
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
            allItems.length === 0
              ? <EmptySection label="Activity" Icon={FolderKanban} />
              : <AllTable rows={allItems} />
          )}
          {tab === "work_orders" && (
            workOrders.length === 0
              ? <EmptySection label="Work Orders" Icon={ClipboardList} />
              : <WorkOrdersTable rows={workOrders} />
          )}
          {tab === "tasks" && (
            tasks.length === 0
              ? <EmptySection label="Tasks" Icon={CheckSquare} />
              : <TasksTable rows={tasks} />
          )}
          {tab === "contact_persons" && (
            <ContactPersonPanel context={{
              project_id: id,
              project_name: project.name,
              contact_id: project.contact_id || undefined,
              contact_name: project.contact_name || undefined,
            }} />
          )}
          {tab === "labour" && (
            <WorkhandCostPanel filterKey="project_id" filterId={id} currency={project.currency || "AED"} />
          )}
          {tab === "invoices" && (
            <ProjectFinancialsTable rows={invoices} kind="invoice" />
          )}
          {tab === "bills" && (
            <ProjectFinancialsTable rows={bills} kind="bill" />
          )}
          {tab === "history" && (
            <ProjectHistory projectId={id} notes={notes} onRefresh={load} />
          )}
          {tab === "files" && (
            <SharedFilesPanel context={{
              project_id: id,
              project_name: project.name,
              contact_id: project.contact_id || undefined,
              contact_name: project.contact_name || undefined,
            }} files={projectFiles} onRefresh={load} />
          )}
        </div>
      </motion.div>

      <ProjectFormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        onSave={handleSave}
        project={project}
        contacts={contacts}
      />
    </div>
  );
}