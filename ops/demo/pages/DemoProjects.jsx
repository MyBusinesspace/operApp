import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Calendar,
  ClipboardList,
  Download,
  FolderKanban,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
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
import DemoProjectDialog from "../components/DemoProjectDialog.jsx";
import "../demo.css";

const STATUS_DOT = {
  Draft: "bg-zinc-500",
  Active: "bg-emerald-500",
  "On Hold": "bg-amber-500",
  Completed: "bg-sky-500",
  Cancelled: "bg-rose-500",
};

const STATUS_TEXT = {
  Draft: "text-zinc-400",
  Active: "text-emerald-400",
  "On Hold": "text-amber-400",
  Completed: "text-sky-400",
  Cancelled: "text-rose-400",
};

const TYPE_DOT = {
  Rental: "bg-indigo-500",
  Installation: "bg-sky-500",
  Maintenance: "bg-orange-500",
  Consulting: "bg-purple-500",
  Construction: "bg-teal-500",
  Other: "bg-zinc-500",
};

const COLUMN_DEFS = [
  { key: "reference", label: "Reference", required: false },
  { key: "name", label: "Project", required: true },
  { key: "type", label: "Category", required: false },
  { key: "contact_name", label: "Customer", required: false },
  { key: "start_date", label: "Dates", required: false },
  { key: "location", label: "Location", required: false },
  { key: "status", label: "Status", required: false },
];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function DemoProjects() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const projects = data?.projects || [];
  const contacts = data?.contacts || [];

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [onlyActiveWO, setOnlyActiveWO] = useState(false);
  const [visibleCols, setVisibleCols] = useState({
    reference: true,
    name: true,
    type: true,
    contact_name: true,
    start_date: true,
    location: true,
    status: true,
  });
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const toggleCol = (key) =>
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const filtered = projects.filter((p) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      (p.name || "").toLowerCase().includes(s) ||
      (p.reference || "").toLowerCase().includes(s) ||
      (p.contact_name || "").toLowerCase().includes(s) ||
      (p.location || "").toLowerCase().includes(s);
    const matchType = filterType === "all" || p.type === filterType;
    const matchStatus = filterStatus === "all" || p.status === filterStatus;
    const matchWO = !onlyActiveWO || (p.active_wo_count || 0) > 0;
    return matchSearch && matchType && matchStatus && matchWO;
  });

  const openEdit = (p) => {
    setEditing(p);
    setModal(true);
  };
  const openAdd = () => {
    setEditing(null);
    setModal(true);
  };

  const statusTabs = [
    { key: "all", label: "All", count: projects.length },
    { key: "Draft", label: "Draft", count: projects.filter((p) => p.status === "Draft").length },
    { key: "Active", label: "Active", count: projects.filter((p) => p.status === "Active").length },
    { key: "On Hold", label: "On Hold", count: projects.filter((p) => p.status === "On Hold").length },
    { key: "Completed", label: "Completed", count: projects.filter((p) => p.status === "Completed").length },
    { key: "Cancelled", label: "Cancelled", count: projects.filter((p) => p.status === "Cancelled").length },
  ];

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
              <BackToOverviewButton to="/demo/app/business-overview" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground" style={{ letterSpacing: "-0.02em" }}>
                  Projects
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Track rentals, installations & project scopes
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors cursor-default" title="Demo — view only">
                <Upload className="w-3.5 h-3.5" /> Import
              </span>
              <Button variant="outline" size="sm" className="gap-2" title="Demo — view only" onClick={(e) => e.preventDefault()}>
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> New Project
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
                placeholder="Search name, reference, client, location..."
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
                {["Rental", "Installation", "Maintenance", "Consulting", "Construction", "Other"].map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={onlyActiveWO ? "default" : "outline"}
              size="sm"
              className="gap-1.5"
              onClick={() => setOnlyActiveWO((v) => !v)}
              title="Show only projects with active work orders"
            >
              <ClipboardList className="w-3.5 h-3.5" />
              {onlyActiveWO ? "With Active WO ✓" : "With Active WO"}
            </Button>
            <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <FolderKanban className="w-7 h-7 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No projects found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {visibleCols.reference && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Reference</th>}
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Project</th>
                      {visibleCols.type && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Category</th>}
                      {visibleCols.contact_name && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Customer</th>}
                      {visibleCols.start_date && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Dates</th>}
                      {visibleCols.location && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">Location</th>}
                      {visibleCols.status && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>}
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((p) => (
                      <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors group">
                        {visibleCols.reference && (
                          <td className="px-4 py-3">
                            {p.reference ? (
                              <button type="button" onClick={() => openEdit(p)} className="font-mono text-xs text-primary font-medium hover:underline">
                                {p.reference}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground/30">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => openEdit(p)} className="text-left">
                            <p className="text-sm font-semibold text-foreground hover:text-primary transition-colors">{p.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {(p.active_wo_count || 0)} active WO · {(p.active_task_count || 0)} tasks
                            </p>
                          </button>
                        </td>
                        {visibleCols.type && (
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
                              <span className={`w-2 h-2 rounded-full ${TYPE_DOT[p.type] || TYPE_DOT.Other}`} />
                              {p.type || "Other"}
                            </span>
                          </td>
                        )}
                        {visibleCols.contact_name && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <User className="w-3.5 h-3.5" />
                              {p.contact_name || "—"}
                            </span>
                          </td>
                        )}
                        {visibleCols.start_date && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5" />
                              {fmtDate(p.start_date)} → {fmtDate(p.end_date)}
                            </span>
                          </td>
                        )}
                        {visibleCols.location && (
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5" />
                              {p.location || "—"}
                            </span>
                          </td>
                        )}
                        {visibleCols.status && (
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT[p.status] || STATUS_TEXT.Draft}`}>
                              <span className={`w-2 h-2 rounded-full ${STATUS_DOT[p.status] || STATUS_DOT.Draft}`} />
                              {p.status || "Draft"}
                            </span>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive cursor-default" title="Demo — view only" onClick={(e) => e.preventDefault()}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
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
        <DemoGuideCard pageId="projects" />
      </main>

      <DemoProjectDialog
        open={modal}
        onClose={() => setModal(false)}
        project={editing}
        contacts={contacts}
      />
    </div>
  );
}
