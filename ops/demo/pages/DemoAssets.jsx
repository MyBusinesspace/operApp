import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Download,
  FolderKanban,
  MapPin,
  Package,
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
import DemoAssetDialog from "../components/DemoAssetDialog.jsx";
import "../demo.css";

const STATUS_STYLES = {
  Available: "bg-emerald-500/10 text-emerald-400",
  "In Use": "bg-sky-500/10 text-sky-400",
  "Under Maintenance": "bg-amber-500/10 text-amber-400",
  Retired: "bg-zinc-500/10 text-zinc-500",
};

const CATEGORY_STYLES = {
  Crane: "bg-indigo-500/10 text-indigo-400",
  Hoist: "bg-sky-500/10 text-sky-400",
  Platform: "bg-teal-500/10 text-teal-400",
  Vehicle: "bg-orange-500/10 text-orange-400",
  Tool: "bg-purple-500/10 text-purple-400",
  Equipment: "bg-zinc-500/10 text-zinc-400",
  Other: "bg-zinc-500/10 text-zinc-500",
};

const COLUMN_DEFS = [
  { key: "reference", label: "Reference", required: false },
  { key: "name", label: "Asset", required: true },
  { key: "category", label: "Category", required: false },
  { key: "status", label: "Status", required: false },
  { key: "contact", label: "Contact", required: false },
  { key: "project", label: "Project", required: false },
  { key: "location", label: "Location", required: false },
  { key: "purchase", label: "Purchase", required: false },
];

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtCurrency(amount, currency = "USD") {
  if (!amount) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function DemoAssets() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const assets = data?.assets || [];
  const contacts = data?.contacts || [];
  const projects = data?.projects || [];
  const workOrders = data?.workOrders || [];
  const assetGroups = data?.assetGroups || [];

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [visibleCols, setVisibleCols] = useState({
    reference: true,
    name: true,
    category: true,
    status: true,
    contact: true,
    project: true,
    location: true,
    purchase: true,
  });
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const toggleCol = (key) =>
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));

  const filtered = assets.filter((a) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      (a.name || "").toLowerCase().includes(s) ||
      (a.reference || "").toLowerCase().includes(s) ||
      (a.serial_number || "").toLowerCase().includes(s) ||
      (a.contact_name || "").toLowerCase().includes(s) ||
      (a.project_name || "").toLowerCase().includes(s) ||
      (a.manufacturer || "").toLowerCase().includes(s) ||
      (a.location || "").toLowerCase().includes(s);
    const matchCat = filterCategory === "all" || a.category === filterCategory;
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    const matchGroup = filterGroup === "all" || a.group_id === filterGroup;
    return matchSearch && matchCat && matchStatus && matchGroup;
  });

  const openEdit = (a) => {
    setEditing(a);
    setModal(true);
  };
  const openAdd = () => {
    setEditing(null);
    setModal(true);
  };

  const statusTabs = [
    { key: "all", label: "All", count: assets.length },
    { key: "Available", label: "Available", count: assets.filter((a) => a.status === "Available").length },
    { key: "In Use", label: "In Use", count: assets.filter((a) => a.status === "In Use").length },
    { key: "Under Maintenance", label: "Maintenance", count: assets.filter((a) => a.status === "Under Maintenance").length },
    { key: "Retired", label: "Retired", count: assets.filter((a) => a.status === "Retired").length },
  ].filter((tab) => tab.key === "all" || tab.count > 0);

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
                  Assets
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Equipment, machinery & asset tracking
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" className="gap-2" title="Demo — view only" onClick={(e) => e.preventDefault()}>
                <Upload className="w-3.5 h-3.5" /> Import
              </Button>
              <Button variant="outline" size="sm" className="gap-2" title="Demo — view only" onClick={(e) => e.preventDefault()}>
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> New Asset
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
                placeholder="Search name, serial, reference, contact, project..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {["Crane", "Hoist", "Platform", "Vehicle", "Tool", "Equipment", "Other"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                {assetGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
          </div>

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            {filtered.length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                  <Package className="w-7 h-7 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-1">No assets found</h3>
                <p className="text-sm text-muted-foreground">Try adjusting your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {visibleCols.reference && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Reference</th>}
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Asset</th>
                      {visibleCols.category && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">Category</th>}
                      {visibleCols.status && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">Status</th>}
                      {visibleCols.contact && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Contact</th>}
                      {visibleCols.project && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">Project</th>}
                      {visibleCols.location && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">Location</th>}
                      {visibleCols.purchase && <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">Purchase</th>}
                      <th className="px-4 py-3 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id} className="border-b border-border hover:bg-muted/30 transition-colors group">
                        {visibleCols.reference && (
                          <td className="px-4 py-3">
                            {a.reference ? (
                              <button type="button" onClick={() => openEdit(a)} className="font-mono text-xs text-primary font-medium hover:underline">
                                {a.reference}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground/30">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <button type="button" onClick={() => openEdit(a)} className="text-left">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-semibold text-foreground hover:text-primary transition-colors">{a.name}</p>
                              {a.group_name && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{a.group_name}</span>
                              )}
                            </div>
                            {a.serial_number && (
                              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{a.serial_number}</p>
                            )}
                            {(a.manufacturer || a.model || a.year) && (
                              <p className="text-xs text-muted-foreground">
                                {[a.manufacturer, a.model, a.year].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </button>
                        </td>
                        {visibleCols.category && (
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CATEGORY_STYLES[a.category] || CATEGORY_STYLES.Other}`}>
                              {a.category || "Other"}
                            </span>
                          </td>
                        )}
                        {visibleCols.status && (
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[a.status] || STATUS_STYLES.Available}`}>
                              {a.status || "Available"}
                            </span>
                          </td>
                        )}
                        {visibleCols.contact && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {a.contact_name ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <User className="w-3.5 h-3.5" />
                                {a.contact_name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                        )}
                        {visibleCols.project && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            {a.project_name ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                                <FolderKanban className="w-3.5 h-3.5" />
                                {a.project_name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/40">—</span>
                            )}
                          </td>
                        )}
                        {visibleCols.location && (
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                              <MapPin className="w-3.5 h-3.5" />
                              {a.location || "—"}
                            </span>
                          </td>
                        )}
                        {visibleCols.purchase && (
                          <td className="px-4 py-3 hidden xl:table-cell text-xs text-muted-foreground">
                            <div>{fmtCurrency(a.purchase_price, a.currency || "AED")}</div>
                            <div>{fmtDate(a.purchase_date)}</div>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
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
        <DemoGuideCard pageId="assets" />
      </main>

      <DemoAssetDialog
        open={modal}
        onClose={() => setModal(false)}
        asset={editing}
        contacts={contacts}
        projects={projects}
        workOrders={workOrders}
        groups={assetGroups}
      />
    </div>
  );
}
