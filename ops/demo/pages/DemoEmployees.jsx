import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  ChevronRight,
  Download,
  Eye,
  Mail,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import EmployeeSplitDetail from "@/components/employees/EmployeeSplitDetail";
import EmployeeFilesViewer from "@/components/employees/EmployeeFilesViewer";
import EmployeePermissionsModal from "@/components/employees/EmployeePermissionsModal";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import { installDemoEntityShim } from "../lib/demoEntityShim.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import DemoEmployeeDialog, {
  DEMO_ROLES,
} from "../components/DemoEmployeeDialog.jsx";
import "../demo.css";

const STATUS_STYLES = {
  Active: "bg-emerald-100 text-emerald-700",
  "On Leave": "bg-amber-100 text-amber-700",
  Inactive: "bg-slate-100 text-slate-600",
  Terminated: "bg-red-100 text-red-600",
};

const COLUMN_DEFS = [
  { key: "role", label: "Role", required: false },
  { key: "contact", label: "Contact", required: false },
  { key: "hire_date", label: "Hire Date", required: false },
  { key: "status", label: "Status", required: false },
];

function initials(name) {
  return (name || "?")
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d.includes("T") ? d : `${d}T00:00:00`).toLocaleDateString(
    "en-GB",
    { day: "2-digit", month: "short", year: "numeric" }
  );
}

export default function DemoEmployees() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const employees = data?.employees || [];
  const teams = data?.teams || [];
  const documents = data?.employeeDocuments || [];
  const users = data?.demoUsers || [];

  const fileCounts = useMemo(() => {
    const counts = {};
    for (const d of documents) {
      counts[d.employee_id] = (counts[d.employee_id] || 0) + 1;
    }
    return counts;
  }, [documents]);

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [visibleCols, setVisibleCols] = useState({
    role: true,
    contact: true,
    hire_date: true,
    status: true,
  });
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [permsModal, setPermsModal] = useState(null);
  const [splitMode, setSplitMode] = useState(null);
  const [splitEmpId, setSplitEmpId] = useState(null);
  const [filesEmpId, setFilesEmpId] = useState(null);

  useEffect(() => {
    if (!data) return undefined;
    return installDemoEntityShim(data);
  }, [data]);

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const toggleCol = (key) => {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filtered = employees.filter((e) => {
    const s = search.toLowerCase();
    const matchSearch =
      !s ||
      (e.full_name || "").toLowerCase().includes(s) ||
      (e.email || "").toLowerCase().includes(s) ||
      (e.department || "").toLowerCase().includes(s) ||
      (e.employee_no || "").toLowerCase().includes(s);
    const matchRole = filterRole === "all" || e.role === filterRole;
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "Inactive"
        ? e.status === "Inactive" || e.status === "Terminated"
        : (e.status || "Active") === filterStatus);
    return matchSearch && matchRole && matchStatus;
  });

  const openAdd = () => {
    setEditing(null);
    setModal(true);
  };
  const openEdit = (emp) => {
    setEditing(emp);
    setModal(true);
  };

  const openSplitDetail = (emp) => {
    setSplitMode("detail");
    setSplitEmpId(emp.id);
    setFilesEmpId(null);
  };
  const openSplitFiles = (emp) => {
    setSplitMode("files");
    setFilesEmpId(emp.id);
    setSplitEmpId(null);
  };
  const closeSplit = () => {
    setSplitMode(null);
    setSplitEmpId(null);
    setFilesEmpId(null);
  };

  const splitEmp = employees.find((e) => e.id === splitEmpId) || null;
  const filesEmp = employees.find((e) => e.id === filesEmpId) || null;
  const splitRole = splitEmp
    ? (data.employeeRoles || DEMO_ROLES).find((r) => r.key === splitEmp.role)
    : null;
  const splitIndex = splitEmpId
    ? filtered.findIndex((e) => e.id === splitEmpId)
    : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = filtered[splitIndex + dir];
    if (next) setSplitEmpId(next.id);
  };
  const fileCountFor = (e) => fileCounts[e.id] || 0;

  const tabCounts = {
    all: employees.length,
    Active: employees.filter((e) => e.status === "Active").length,
    "On Leave": employees.filter((e) => e.status === "On Leave").length,
    Inactive: employees.filter(
      (e) => e.status === "Inactive" || e.status === "Terminated"
    ).length,
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        {/* Same content shell as AppLayout (real Employees page) */}
        <div className="w-full max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col h-full">
        <div className="bg-card border-b border-border px-6 pt-4 pb-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <BackToOverviewButton to="/demo/app/hr-overview" />
            <ChevronRight className="w-3 h-3" />
          </div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Employee Directory
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Manage staff profiles, roles, and contact information
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                className="gap-2"
                title="Demo — view only"
                onClick={(e) => e.preventDefault()}
              >
                <Upload className="w-4 h-4" /> Import Documents
              </Button>
              <Button
                variant="outline"
                className="gap-2"
                title="Demo — view only"
                onClick={(e) => e.preventDefault()}
              >
                <Download className="w-4 h-4" /> Export CSV
              </Button>
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> Add Employee
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-0 overflow-x-auto">
            {[
              { key: "all", label: "All", count: tabCounts.all },
              { key: "Active", label: "Active", count: tabCounts.Active },
              {
                key: "On Leave",
                label: "On Leave",
                count: tabCounts["On Leave"],
              },
              {
                key: "Inactive",
                label: "Inactive",
                count: tabCounts.Inactive,
              },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilterStatus(tab.key)}
                className={`relative flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  filterStatus === tab.key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                {tab.label}
                <span
                  className={`text-xs font-semibold ${
                    filterStatus === tab.key
                      ? "text-primary"
                      : "text-muted-foreground"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email or department..."
              className="pl-9 bg-muted/40 border-muted"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <Select value={filterRole} onValueChange={setFilterRole}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {DEMO_ROLES.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="On Leave">On Leave</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
              <SelectItem value="Terminated">Terminated</SelectItem>
            </SelectContent>
          </Select>
          <ColumnToggle
            columns={COLUMN_DEFS}
            visible={visibleCols}
            onToggle={toggleCol}
          />
        </div>

        <div className="bg-card border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
          <span className="text-sm font-medium text-foreground tabular-nums">
            {filtered.length} items
          </span>
        </div>

        <div className="flex-1 flex min-h-0 bg-card">
          {splitMode === "files" && filesEmp && (
            <div className="w-[35%] min-w-0 flex flex-col">
              <EmployeeFilesViewer employee={filesEmp} onClose={closeSplit} />
            </div>
          )}
          <div
            className={
              splitMode
                ? "w-[65%] min-w-0 flex flex-col"
                : "flex-1 min-w-0 flex flex-col"
            }
          >
            <div className="overflow-auto flex-1">
              {filtered.length === 0 ? (
                <div className="p-16 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                    <Users className="w-7 h-7 text-muted-foreground/60" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-1">
                    No employees found
                  </h3>
                  <p className="text-sm text-muted-foreground mb-6">
                    Try adjusting your filters.
                  </p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 sticky top-0 z-10">
                      <th className="px-3 py-3 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        View
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Employee
                      </th>
                      {visibleCols.role && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden md:table-cell">
                          Role
                        </th>
                      )}
                      {visibleCols.contact && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden lg:table-cell">
                          Contact
                        </th>
                      )}
                      {visibleCols.hire_date && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider hidden xl:table-cell">
                          Hire Date
                        </th>
                      )}
                      {visibleCols.status && (
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Status
                        </th>
                      )}
                      <th className="px-3 py-3 w-16 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Files
                      </th>
                      <th className="px-3 py-3 w-24" />
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filtered.map((emp) => {
                        const isActive =
                          splitMode === "detail" && emp.id === splitEmpId;
                        const fc = fileCountFor(emp);
                        const roleRec = (data.employeeRoles || DEMO_ROLES).find(
                          (r) => r.key === emp.role
                        );
                        return (
                          <motion.tr
                            key={emp.id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className={`border-b border-border/50 hover:bg-muted/20 transition-colors group ${
                              isActive ? "bg-primary/5" : ""
                            }`}
                          >
                            <td
                              className="px-3 py-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-primary"
                                title="Split preview"
                                onClick={() => openSplitDetail(emp)}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </td>
                            <td
                              className="px-4 py-3 cursor-pointer"
                              onClick={() => openSplitDetail(emp)}
                            >
                              <div className="flex items-center gap-3">
                                <Avatar className="w-9 h-9 shrink-0">
                                  <AvatarImage
                                    src={emp.avatar_url}
                                    alt={emp.full_name}
                                  />
                                  <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                                    {initials(emp.full_name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <Link
                                    to={`/demo/app/employees/${emp.id}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="font-semibold text-foreground hover:text-primary transition-colors leading-tight"
                                  >
                                    {emp.full_name}
                                  </Link>
                                  {emp.notes && (
                                    <p className="text-xs text-muted-foreground/70 truncate max-w-[180px]">
                                      {emp.notes}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            {visibleCols.role && (
                              <td className="px-4 py-3 hidden md:table-cell">
                                <span
                                  className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full"
                                  style={{
                                    backgroundColor:
                                      (roleRec?.color || "#6366f1") + "22",
                                    color: roleRec?.color || "#6366f1",
                                  }}
                                >
                                  {roleRec?.name || emp.role || "—"}
                                </span>
                              </td>
                            )}
                            {visibleCols.contact && (
                              <td className="px-4 py-3 hidden lg:table-cell">
                                {emp.email && (
                                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Mail className="w-3 h-3 shrink-0" />
                                    <span className="truncate max-w-[160px]">
                                      {emp.email}
                                    </span>
                                  </span>
                                )}
                                {emp.phone && (
                                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                    <Phone className="w-3 h-3 shrink-0" />
                                    {emp.phone}
                                  </span>
                                )}
                                {!emp.email && !emp.phone && (
                                  <span className="text-xs text-muted-foreground/40">
                                    —
                                  </span>
                                )}
                              </td>
                            )}
                            {visibleCols.hire_date && (
                              <td className="px-4 py-3 hidden xl:table-cell">
                                {emp.hire_date ? (
                                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                    <Calendar className="w-3 h-3 shrink-0" />
                                    {fmtDate(emp.hire_date)}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground/40">
                                    —
                                  </span>
                                )}
                              </td>
                            )}
                            {visibleCols.status && (
                              <td className="px-4 py-3">
                                <span
                                  className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                                    STATUS_STYLES[emp.status] ||
                                    "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {emp.status || "Active"}
                                </span>
                              </td>
                            )}
                            <td
                              className="px-3 py-3 text-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => openSplitFiles(emp)}
                                className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                                  fc > 0
                                    ? "text-primary hover:bg-primary/10"
                                    : "text-muted-foreground/50"
                                }`}
                                title="View employee documents"
                              >
                                <Paperclip className="w-3.5 h-3.5" />
                                {fc > 0 && (
                                  <span className="tabular-nums">{fc}</span>
                                )}
                              </button>
                            </td>
                            <td
                              className="px-4 py-3"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  title="Set role & permissions"
                                  onClick={() => setPermsModal(emp)}
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => openEdit(emp)}
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  title="Demo — view only"
                                  onClick={(e) => e.preventDefault()}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
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
          {splitMode === "detail" && (
            <div className="w-[65%] min-w-0 flex flex-col">
              <EmployeeSplitDetail
                employee={splitEmp}
                role={splitRole}
                fileCount={splitEmp ? fileCountFor(splitEmp) : 0}
                onClose={closeSplit}
                onEdit={(emp) => openEdit(emp)}
                onPermissions={(emp) => setPermsModal(emp)}
                onPrev={() => navSplit(-1)}
                onNext={() => navSplit(1)}
              />
            </div>
          )}
        </div>
        </div>
        </div>

        <DemoEmployeeDialog
          open={modal}
          onClose={() => {
            setModal(false);
            setEditing(null);
          }}
          employee={editing}
          teams={teams}
          users={users}
        />

        <EmployeePermissionsModal
          open={!!permsModal}
          employee={permsModal}
          onClose={() => setPermsModal(null)}
          onSaved={() => setPermsModal(null)}
        />

        <DemoGuideCard pageId="employees" />
      </main>
    </div>
  );
}
