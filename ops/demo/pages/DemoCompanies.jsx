import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Download,
  FolderPlus,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import DemoCompanyDialog from "../components/DemoCompanyDialog.jsx";
import DemoGroupDialog from "../components/DemoGroupDialog.jsx";
import "../demo.css";

const TYPE_STYLES = {
  Customer: "bg-indigo-500/10 text-indigo-400",
  Provider: "bg-violet-500/10 text-violet-400",
  Both: "bg-emerald-500/10 text-emerald-400",
  Contact: "bg-zinc-500/10 text-zinc-400",
};

const STATUS_STYLES = {
  Active: "bg-emerald-500/10 text-emerald-400",
  Inactive: "bg-amber-500/10 text-amber-400",
  Archived: "bg-zinc-500/10 text-zinc-500",
};

const COLUMN_DEFS = [
  { key: "reference", label: "Reference", required: false },
  { key: "full_name", label: "Company", required: true },
  { key: "email", label: "Contact Info", required: false },
  { key: "type", label: "Category", required: false },
  { key: "status", label: "Status", required: false },
  { key: "group_id", label: "Group", required: false },
  { key: "city", label: "Location", required: false },
  { key: "contact_persons", label: "Persons", required: false },
];

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function avatarColor(str) {
  const palette = [
    "bg-indigo-500/20",
    "bg-sky-500/20",
    "bg-emerald-500/20",
    "bg-amber-500/20",
    "bg-rose-500/20",
    "bg-purple-500/20",
    "bg-teal-500/20",
  ];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) {
    h = (h * 31 + str.charCodeAt(i)) % palette.length;
  }
  return palette[h];
}

export default function DemoCompanies() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();

  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const contacts = data?.contacts || [];
  const groups = data?.contactGroups || [];

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterGroup, setFilterGroup] = useState("all");
  const [visibleCols, setVisibleCols] = useState({
    reference: true,
    full_name: true,
    email: true,
    type: true,
    status: true,
    group_id: true,
    city: true,
    contact_persons: true,
  });
  const [companyOpen, setCompanyOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  if (!enabled) {
    return <Navigate to="/" replace />;
  }

  if (!industryId || !data) {
    return <Navigate to="/demo" replace />;
  }

  const toggleCol = (key) => {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filtered = contacts.filter((c) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      (c.full_name || "").toLowerCase().includes(s) ||
      (c.email || "").toLowerCase().includes(s) ||
      (c.company || "").toLowerCase().includes(s) ||
      (c.phone || "").toLowerCase().includes(s) ||
      (c.reference || "").toLowerCase().includes(s);
    const matchType = filterType === "all" || c.type === filterType;
    const matchStatus =
      filterStatus === "all" || (c.status || "Active") === filterStatus;
    const matchGroup =
      filterGroup === "all" ||
      (filterGroup === "__none__"
        ? !c.group_id
        : c.group_id === filterGroup);
    return matchSearch && matchType && matchStatus && matchGroup;
  });

  const openEdit = (c) => {
    setEditing(c);
    setCompanyOpen(true);
  };
  const openAdd = () => {
    setEditing(null);
    setCompanyOpen(true);
  };
  const openGroup = (g = null) => {
    setEditingGroup(g);
    setGroupOpen(true);
  };

  const statusTabs = [
    { key: "all", label: "All", count: contacts.length },
    {
      key: "Active",
      label: "Active",
      count: contacts.filter((c) => c.status === "Active").length,
    },
    {
      key: "Inactive",
      label: "Inactive",
      count: contacts.filter((c) => c.status === "Inactive").length,
    },
    {
      key: "Archived",
      label: "Archived",
      count: contacts.filter((c) => c.status === "Archived").length,
    },
  ].filter((tab) => tab.key === "all" || tab.count > 0);

  return (
    <div className="min-h-screen bg-background">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        <div className="max-w-[1200px] mx-auto px-6 py-8 space-y-5">
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <BackToOverviewButton to="/demo/app/business-overview" />
              <div>
                <h1
                  className="text-2xl font-bold tracking-tight text-foreground"
                  style={{ letterSpacing: "-0.02em" }}
                >
                  Companies
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Customers, providers & company groups
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border border-border bg-card hover:bg-accent transition-colors cursor-default"
                title="Demo — view only"
              >
                <Upload className="w-3.5 h-3.5" /> Import
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                title="Demo — view only"
                onClick={(e) => e.preventDefault()}
              >
                <Download className="w-3.5 h-3.5" /> Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => openGroup(null)}
              >
                <FolderPlus className="w-4 h-4" /> New Group
              </Button>
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> Add Company
              </Button>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.08 }}
            className="flex flex-wrap gap-1 border-b border-border pb-0"
          >
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
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12 }}
            className="flex flex-wrap items-center gap-3"
          >
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search name, email, company..."
                className="pl-9 text-foreground placeholder:text-muted-foreground"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {["Customer", "Provider", "Both", "Contact"].map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Groups" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Groups</SelectItem>
                <SelectItem value="__none__">No group</SelectItem>
                {groups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ColumnToggle
              columns={COLUMN_DEFS}
              visible={visibleCols}
              onToggle={toggleCol}
            />
          </motion.div>

          {groups.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 }}
              className="flex flex-wrap gap-2"
            >
              {groups.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium cursor-pointer hover:shadow-sm transition-all group/g"
                  style={{
                    borderColor: g.color + "60",
                    backgroundColor: g.color + "15",
                    color: g.color,
                  }}
                  onClick={() =>
                    setFilterGroup(filterGroup === g.id ? "all" : g.id)
                  }
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: g.color }}
                  />
                  {g.name}
                  <span className="ml-1 opacity-60">
                    ({contacts.filter((c) => c.group_id === g.id).length})
                  </span>
                  <span
                    className="ml-1 opacity-0 group-hover/g:opacity-60 flex gap-0.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Pencil
                      className="w-3 h-3 cursor-pointer hover:opacity-100"
                      onClick={() => openGroup(g)}
                    />
                    <Trash2
                      className="w-3 h-3 cursor-default"
                      title="Demo — view only"
                    />
                  </span>
                </div>
              ))}
            </motion.div>
          )}

          <div className="bg-card rounded-2xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {visibleCols.reference && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden sm:table-cell">
                        Reference
                      </th>
                    )}
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      Company
                    </th>
                    {visibleCols.email && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        Contact Info
                      </th>
                    )}
                    {visibleCols.type && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden md:table-cell">
                        Category
                      </th>
                    )}
                    {visibleCols.status && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                        Status
                      </th>
                    )}
                    {visibleCols.group_id && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">
                        Group
                      </th>
                    )}
                    {visibleCols.city && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden lg:table-cell">
                        Location
                      </th>
                    )}
                    {visibleCols.contact_persons && (
                      <th className="px-4 py-3 text-xs font-semibold text-muted-foreground hidden xl:table-cell">
                        Persons
                      </th>
                    )}
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="px-4 py-12 text-center text-sm text-muted-foreground"
                      >
                        No companies match your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-border hover:bg-muted/30 transition-colors group"
                      >
                        {visibleCols.reference && (
                          <td className="px-4 py-3 hidden sm:table-cell">
                            {c.reference ? (
                              <button
                                type="button"
                                onClick={() => openEdit(c)}
                                className="font-mono text-xs text-primary font-medium hover:underline"
                              >
                                {c.reference}
                              </button>
                            ) : (
                              <span className="text-xs text-muted-foreground/30">
                                —
                              </span>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openEdit(c)}
                            className="flex items-center gap-3 text-left w-full"
                          >
                            <Avatar className="w-9 h-9 shrink-0">
                              <AvatarFallback
                                className={`${avatarColor(c.full_name)} text-white font-semibold text-xs`}
                              >
                                {initials(c.full_name)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-semibold text-foreground leading-tight hover:text-primary transition-colors">
                                {c.company || c.full_name}
                              </p>
                              {c.company && c.full_name && (
                                <p className="text-xs text-muted-foreground">
                                  {c.full_name}
                                </p>
                              )}
                            </div>
                          </button>
                        </td>
                        {visibleCols.email && (
                          <td className="px-4 py-3">
                            <div className="space-y-0.5">
                              {c.email && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Mail className="w-3 h-3 shrink-0" />
                                  <span className="truncate max-w-[160px]">
                                    {c.email}
                                  </span>
                                </div>
                              )}
                              {c.phone && (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Phone className="w-3 h-3 shrink-0" />
                                  <span>{c.phone}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        )}
                        {visibleCols.type && (
                          <td className="px-4 py-3 hidden md:table-cell">
                            <span
                              className={`text-xs font-medium px-2.5 py-1 rounded-full ${TYPE_STYLES[c.type] || TYPE_STYLES.Contact}`}
                            >
                              {c.type || "Contact"}
                            </span>
                          </td>
                        )}
                        {visibleCols.status && (
                          <td className="px-4 py-3 hidden lg:table-cell">
                            <span
                              className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[c.status] || STATUS_STYLES.Active}`}
                            >
                              {c.status || "Active"}
                            </span>
                          </td>
                        )}
                        {visibleCols.group_id && (
                          <td className="px-4 py-3 hidden xl:table-cell">
                            {c.group_id &&
                              (() => {
                                const g = groups.find(
                                  (gr) => gr.id === c.group_id
                                );
                                return g ? (
                                  <span
                                    className="flex items-center gap-1.5 text-xs font-medium"
                                    style={{ color: g.color }}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: g.color }}
                                    />
                                    {g.name}
                                  </span>
                                ) : null;
                              })()}
                          </td>
                        )}
                        {visibleCols.city && (
                          <td className="px-4 py-3 hidden lg:table-cell text-xs text-muted-foreground">
                            {c.city}
                            {c.city && c.country ? ", " : ""}
                            {c.country}
                          </td>
                        )}
                        {visibleCols.contact_persons && (
                          <td className="px-4 py-3 hidden xl:table-cell">
                            {c.contact_person && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="w-3 h-3 shrink-0" />
                                <span>1</span>
                              </div>
                            )}
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEdit(c)}
                              title="Edit company"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive cursor-default"
                              title="Demo — view only"
                              onClick={(e) => e.preventDefault()}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <DemoGuideCard pageId="companies" />
      </main>

      <DemoCompanyDialog
        open={companyOpen}
        onClose={() => setCompanyOpen(false)}
        contact={editing}
        groups={groups}
      />
      <DemoGroupDialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        group={editingGroup}
      />
    </div>
  );
}
