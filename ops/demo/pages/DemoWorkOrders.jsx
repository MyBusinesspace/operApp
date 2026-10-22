import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ClipboardList,
  Download,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
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
import DemoWorkOrderDialog from "../components/DemoWorkOrderDialog.jsx";
import "../demo.css";

const STATUS_STYLES = {
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
  "On Hold": "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
  Archived: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
};

const PRIORITY_STYLES = {
  Low: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
  Medium: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
  High: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400",
  Urgent: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
};

const TYPE_STYLES = {
  Maintenance: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400",
  Repair: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400",
  Inspection: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400",
  Installation: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400",
  Other: "bg-slate-100 text-slate-500 dark:bg-slate-500/15 dark:text-slate-400",
};

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

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DemoWorkOrders() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const workOrders = data?.workOrders || [];
  const contacts = data?.contacts || [];
  const projects = data?.projects || [];
  const assets = data?.assets || [];

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [visibleCols, setVisibleCols] = useState({
    reference: true,
    title: true,
    type: true,
    status: true,
    priority: true,
    project_name: true,
    asset_name: true,
    contact_name: true,
    due_date: true,
  });
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const toggleCol = (key) =>
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const filtered = workOrders.filter((w) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      w.title?.toLowerCase().includes(s) ||
      w.reference?.toLowerCase().includes(s) ||
      w.project_name?.toLowerCase().includes(s) ||
      w.assigned_to?.toLowerCase().includes(s) ||
      w.location?.toLowerCase().includes(s) ||
      w.contact_name?.toLowerCase().includes(s) ||
      w.asset_name?.toLowerCase().includes(s) ||
      w.type?.toLowerCase().includes(s);
    const matchStatus = filterStatus === "all" || w.status === filterStatus;
    const matchType = filterType === "all" || w.type === filterType;
    return matchSearch && matchStatus && matchType;
  });

  const openEdit = (w) => {
    setEditing(w);
    setModal(true);
  };
  const openAdd = () => {
    setEditing(null);
    setModal(true);
  };

  const statusTabs = [
    { key: "all", label: "All", count: workOrders.length },
    { key: "Active", label: "Active", count: workOrders.filter((w) => w.status === "Active").length },
    { key: "On Hold", label: "On Hold", count: workOrders.filter((w) => w.status === "On Hold").length },
    { key: "Archived", label: "Archived", count: workOrders.filter((w) => w.status === "Archived").length },
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
                  Work Orders
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Field service jobs linked to projects, assets & companies
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
                <Plus className="w-4 h-4" /> New Work Order
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
                placeholder="Search title, reference, project, company..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {["Maintenance", "Repair", "Inspection", "Installation", "Other"].map(
                  (t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  )
                )}
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
                  <ClipboardList className="w-7 h-7 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">
                  No work orders found
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
                        Work Order
                      </th>
                      {visibleCols.type && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">
                          Category
                        </th>
                      )}
                      {visibleCols.status && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                          Status
                        </th>
                      )}
                      {visibleCols.priority && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                          Priority
                        </th>
                      )}
                      {visibleCols.project_name && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                          Project
                        </th>
                      )}
                      {visibleCols.asset_name && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">
                          Asset
                        </th>
                      )}
                      {visibleCols.contact_name && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">
                          Company
                        </th>
                      )}
                      {visibleCols.due_date && (
                        <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                          Due
                        </th>
                      )}
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((w) => (
                      <tr
                        key={w.id}
                        className="border-b border-border hover:bg-muted/30 transition-colors group"
                      >
                        {visibleCols.reference && (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => openEdit(w)}
                              className="font-mono text-xs text-primary font-medium hover:underline"
                            >
                              {w.reference}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openEdit(w)}
                            className="text-left"
                          >
                            <p className="text-sm font-medium text-foreground hover:text-primary transition-colors">
                              {w.title}
                            </p>
                            {w.location && (
                              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="w-3 h-3" /> {w.location}
                              </p>
                            )}
                          </button>
                        </td>
                        {visibleCols.type && (
                          <td className="px-4 py-3 hidden md:table-cell">
                            {w.type ? (
                              <span
                                className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                  TYPE_STYLES[w.type] || TYPE_STYLES.Other
                                }`}
                              >
                                {w.type}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        {visibleCols.status && (
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                STATUS_STYLES[w.status] || STATUS_STYLES.Active
                              }`}
                            >
                              {w.status}
                            </span>
                          </td>
                        )}
                        {visibleCols.priority && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {w.priority ? (
                              <span
                                className={`inline-flex text-[11px] font-medium px-2 py-0.5 rounded-full ${
                                  PRIORITY_STYLES[w.priority] || PRIORITY_STYLES.Medium
                                }`}
                              >
                                {w.priority}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        )}
                        {visibleCols.project_name && (
                          <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground">
                            {w.project_name || "—"}
                          </td>
                        )}
                        {visibleCols.asset_name && (
                          <td className="px-4 py-3 hidden xl:table-cell text-sm text-muted-foreground">
                            {w.asset_name || "—"}
                          </td>
                        )}
                        {visibleCols.contact_name && (
                          <td className="px-4 py-3 hidden xl:table-cell text-sm text-muted-foreground">
                            {w.contact_name || "—"}
                          </td>
                        )}
                        {visibleCols.due_date && (
                          <td className="px-4 py-3 hidden lg:table-cell text-sm text-muted-foreground tabular-nums">
                            {fmtDate(w.due_date)}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <button
                              type="button"
                              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                              onClick={() => openEdit(w)}
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

        <DemoWorkOrderDialog
          open={modal}
          onClose={() => {
            setModal(false);
            setEditing(null);
          }}
          workOrder={editing}
          contacts={contacts}
          projects={projects}
          assets={assets}
        />
        <DemoGuideCard pageId="work-orders" />
      </main>
    </div>
  );
}
