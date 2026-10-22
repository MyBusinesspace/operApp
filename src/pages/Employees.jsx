import React, { useState, useEffect } from "react";
import { reserveReference } from "@/lib/assignNumber";
import { usePersistedSearch } from "@/hooks/usePersistedSearch";
import { base44 } from "@/api/base44Client";
import { formatDateValue, todayLocalISO } from "@/lib/dateOnly";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";
import { Plus, Search, Users, Mail, Phone, Pencil, Trash2, Calendar, Download, Upload, ShieldCheck, Eye, Paperclip, X, ChevronRight } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import EmployeeDocumentImportModal from "@/components/employees/EmployeeDocumentImportModal";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { Button } from "@/components/ui/button";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmployeeFormModal from "@/components/employees/EmployeeFormModal";
import EmployeePermissionsModal from "@/components/employees/EmployeePermissionsModal";
import InlineRoleCell from "@/components/employees/InlineRoleCell";
import EmployeeSplitDetail from "@/components/employees/EmployeeSplitDetail";
import EmployeeFilesViewer from "@/components/employees/EmployeeFilesViewer";
import { useRoles } from "@/hooks/useRoles";
import { propagateEmployeeRename } from "@/lib/employeeRename";
import { syncUserFromRole, isLastAdministrator } from "@/lib/syncRoleScope";
import { useToast } from "@/components/ui/use-toast";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { visibleKeys } from "@/lib/visibleColumns";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import { withRetry } from "@/lib/apiHelpers";

const STATUS_TEXT = {
  Active:     "text-emerald-600 dark:text-emerald-500",
  "On Leave": "text-amber-600 dark:text-amber-500",
  Inactive:   "text-slate-500 dark:text-slate-400",
  Terminated: "text-red-600 dark:text-red-500",
};

function initials(name) {
  return name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function fmtDate(d) {
  if (!d) return null;
  return formatDateValue(d);
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const { can } = usePermissionsMatrix();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = usePersistedSearch("employees");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [statusOptions, setStatusOptions] = useState([]);
  const [fileCounts, setFileCounts] = useState({});
  const { roles } = useRoles();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [permsModal, setPermsModal] = useState(null);
  const { sortKey, sortDir, handleSort, applySorting } = useSortable();
  const { toast } = useToast();

  // Split view
  const [splitMode, setSplitMode] = useState(null); // null | 'detail' | 'files'
  const [splitEmpId, setSplitEmpId] = useState(null);
  const [filesEmpId, setFilesEmpId] = useState(null);

  const COLUMN_DEFS = [
    { key: "role", label: "Role", required: false },
    { key: "contact", label: "Contact", required: false },
    { key: "hire_date", label: "Hire Date", required: false },
    { key: "status", label: "Status", required: false },
  ];
  const [visibleCols, setVisibleCols] = useState(() => {
    const saved = localStorage.getItem("employees_visible_cols");
    if (saved) try { return JSON.parse(saved); } catch {}
    return { role: true, contact: true, hire_date: true, status: true };
  });
  const toggleCol = (key) => {
    setVisibleCols(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("employees_visible_cols", JSON.stringify(next));
      return next;
    });
  };

  const load = async () => {
    setLoading(true);
    // Stagger calls (not Promise.all) + retry on rate limit to avoid burst errors
    const data = await withRetry(() => base44.entities.Employee.list("-created_date", 5000));
    const statuses = await withRetry(() => base44.entities.EmployeeStatus.list("name", 100)).catch(() => []);
    const docs = await withRetry(() => base44.entities.EmployeeDocument.list("created_date", 5000)).catch(() => []);
    setEmployees(data);
    setStatusOptions((statuses || []).map(s => s.name));
    const counts = {};
    (docs || []).forEach(d => { counts[d.employee_id] = (counts[d.employee_id] || 0) + 1; });
    setFileCounts(counts);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("create") === "true") { openAdd(); window.history.replaceState({}, "", "/employees"); }
  }, []);

  const sorted = applySorting(employees.filter(e => {
    const matchSearch = !search ||
      e.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      e.email?.toLowerCase().includes(search.toLowerCase()) ||
      e.department?.toLowerCase().includes(search.toLowerCase());
    const matchRole   = filterRole   === "all" || e.role   === filterRole;
    const matchStatus = filterStatus === "all" || e.status === filterStatus;
    return matchSearch && matchRole && matchStatus;
  }));
  const filtered = sorted;
  const vis = visibleKeys(filtered, {
    role: e => e.role,
    contact: e => e.email || e.phone,
    hire_date: e => e.hire_date,
  });
  const pagination = useTablePagination(filtered);

  const handleSave = async (form) => {
    if (editing) {
      if (editing.role === "administrator" && form.role && form.role !== "administrator") {
        try {
          if (await isLastAdministrator(editing.id)) {
            toast({ title: "Cannot remove last administrator", description: "At least one administrator is required. Assign another administrator first.", variant: "destructive" });
            return;
          }
        } catch (e) { /* allow on error */ }
      }
      await base44.entities.Employee.update(editing.id, form);
      if (editing.full_name && form.full_name && editing.full_name !== form.full_name) {
        await propagateEmployeeRename(base44, editing.id, editing.full_name, form.full_name);
      }
      if (form.user_id && form.role && (form.role !== editing.role || form.user_id !== editing.user_id)) {
        try {
          const roleRec = (await base44.entities.EmployeeRole.filter({ key: form.role }))?.[0];
          if (roleRec) await syncUserFromRole(form.user_id, roleRec);
        } catch (e) { console.warn("Role sync failed:", e.message); }
      }
    } else {
      let nextNo = form.employee_no;
      const reserved = await reserveReference("Employee");
      if (reserved) nextNo = reserved;
      else try {
        const all = await base44.entities.Employee.list("-created_date", 2000);
        const max = all.reduce((m, e) => { const x = /^EMP-(\d+)$/.exec(e.employee_no || ""); return x ? Math.max(m, parseInt(x[1], 10)) : m; }, 0);
        nextNo = "EMP-" + String(max + 1).padStart(3, "0");
      } catch (e) { console.warn("Employee number failed:", e.message); }
      await base44.entities.Employee.create({ ...form, employee_no: nextNo });
      if (form.user_id && form.role) {
        try {
          const roleRec = (await base44.entities.EmployeeRole.filter({ key: form.role }))?.[0];
          if (roleRec) await syncUserFromRole(form.user_id, roleRec);
        } catch (e) { console.warn("Role sync failed:", e.message); }
      }
    }
    setModalOpen(false);
    setEditing(null);
    load();
  };

  const handleEdit   = (emp) => { setEditing(emp); setModalOpen(true); };
  const handleDelete = async (id) => {
    if (!confirm("Remove this employee?")) return;
    const emp = employees.find(e => e.id === id);
    if (emp?.role === "administrator") {
      try {
        if (await isLastAdministrator(id)) {
          toast({ title: "Cannot delete last administrator", description: "At least one administrator is required. Assign another administrator first.", variant: "destructive" });
          return;
        }
      } catch (e) { /* allow on error */ }
    }
    await base44.entities.Employee.delete(id);
    load();
  };
  const openAdd = () => { setEditing(null); setModalOpen(true); };

  const exportCSV = async () => {
    setExporting(true);
    try {
      const leaveRequests = await base44.entities.LeaveRequest.list("-created_date", 5000);
      const leaveByEmp = {};
      (leaveRequests || []).forEach(r => {
        if (!r.employee_id) return;
        if (!leaveByEmp[r.employee_id]) leaveByEmp[r.employee_id] = { vacation: 0, sick: 0, other: 0, pending: 0, approved: 0, rejected: 0 };
        const days = r.total_days || 0;
        if (r.leave_type === "vacation") leaveByEmp[r.employee_id].vacation += days;
        else if (r.leave_type === "sick") leaveByEmp[r.employee_id].sick += days;
        else if (r.leave_type === "other") leaveByEmp[r.employee_id].other += days;
        if (r.status === "approved") leaveByEmp[r.employee_id].approved += days;
        else if (r.status === "pending") leaveByEmp[r.employee_id].pending += 1;
        else if (r.status === "rejected") leaveByEmp[r.employee_id].rejected += 1;
      });
      exportToCSV(`employees-with-leaves-${todayLocalISO()}`, [
        { key: "full_name", label: "Full Name" },
        { key: "employee_no", label: "Employee No" },
        { key: "id_document_number", label: "ID Document Number" },
        { key: "role", label: "Role" },
        { key: "department", label: "Department" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "status", label: "Status" },
        { key: "hire_date", label: "Hire Date" },
        { key: "team_name", label: "Team" },
        { key: "bank_account", label: "Bank Account" },
        { key: e => (leaveByEmp[e.id]?.vacation || 0), label: "Vacation Days" },
        { key: e => (leaveByEmp[e.id]?.sick || 0), label: "Sick Days" },
        { key: e => (leaveByEmp[e.id]?.other || 0), label: "Other Leave Days" },
        { key: e => (leaveByEmp[e.id]?.approved || 0), label: "Approved Leave Days" },
        { key: e => (leaveByEmp[e.id]?.pending || 0), label: "Pending Requests" },
        { key: e => (leaveByEmp[e.id]?.rejected || 0), label: "Rejected Requests" },
        { key: "notes", label: "Notes" },
      ], filtered);
    } finally {
      setExporting(false);
    }
  };

  // Split view helpers
  const openSplitDetail = (emp) => { setSplitMode("detail"); setSplitEmpId(emp.id); setFilesEmpId(null); };
  const openSplitFiles = (emp) => { setSplitMode("files"); setFilesEmpId(emp.id); setSplitEmpId(null); };
  const closeSplit = () => { setSplitMode(null); setSplitEmpId(null); setFilesEmpId(null); };
  const splitEmp = employees.find(e => e.id === splitEmpId) || null;
  const filesEmp = employees.find(e => e.id === filesEmpId) || null;
  const splitRole = splitEmp ? roles.find(r => r.key === splitEmp.role) : null;
  const splitIndex = splitEmpId ? sorted.findIndex(e => e.id === splitEmpId) : -1;
  const navSplit = (dir) => {
    if (splitIndex < 0) return;
    const next = sorted[splitIndex + dir];
    if (next) setSplitEmpId(next.id);
  };
  const fileCountFor = (e) => fileCounts[e.id] || 0;

  const renderTable = (compact) => (
    <div>
      <div>
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-xs">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-muted-foreground/60" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No employees found</h3>
            <p className="text-xs text-muted-foreground mb-6">
              {search || filterRole !== "all" || filterStatus !== "all"
                ? "Try adjusting your filters."
                : "Add your first employee to get started."}
            </p>
            {!search && filterRole === "all" && filterStatus === "all" && can("employees", "can_create") && (
              <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Employee</Button>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-3 py-3 w-10 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">View</th>
                <SortableTh colKey="full_name" label="Employee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                {vis.has("role") && visibleCols.role && <SortableTh colKey="role" label="Role" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />}
                {vis.has("contact") && visibleCols.contact && <SortableTh colKey="email" label="Contact" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />}
                {vis.has("hire_date") && visibleCols.hire_date && <SortableTh colKey="hire_date" label="Hire Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                {visibleCols.status && <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />}
                <th className="px-3 py-3 w-16 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Files</th>
                <th className="px-3 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {pagination.pageItems.map((emp, idx) => {
                  const isActive = splitMode === "detail" && emp.id === splitEmpId;
                  const fc = fileCountFor(emp);
                  const stripe = idx % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/30" : "";
                  return (
                    <motion.tr key={emp.id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className={`border-b border-border/50 hover:bg-primary/[0.06] transition-colors group ${isActive ? "bg-primary/10" : stripe}`}>
                      <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-primary" title="Split preview"
                          onClick={() => openSplitDetail(emp)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                      </td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => openSplitDetail(emp)}>
                        <div className="flex items-center gap-3">
                          <Avatar className="w-9 h-9 shrink-0">
                            <AvatarImage src={emp.avatar_url} alt={emp.full_name} />
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                              {initials(emp.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <Link to={`/employees/${emp.id}`} onClick={e => e.stopPropagation()} className="font-semibold text-foreground hover:text-primary transition-colors leading-tight">{emp.full_name}</Link>
                            {emp.notes && <p className="text-xs text-muted-foreground/70 truncate max-w-[180px]">{emp.notes}</p>}
                          </div>
                        </div>
                      </td>
                      {vis.has("role") && visibleCols.role && (
                       <td className="px-4 py-3 hidden md:table-cell" onClick={e => e.stopPropagation()}>
                          <InlineRoleCell
                            employee={emp}
                            onUpdated={(updated) => setEmployees(prev => prev.map(e => e.id === updated.id ? updated : e))}
                          />
                       </td>
                      )}
                      {vis.has("contact") && visibleCols.contact && (
                       <td className="px-4 py-3 hidden lg:table-cell">
                       {emp.email && (
                         <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                           <Mail className="w-3 h-3 shrink-0" />
                           <span className="truncate max-w-[160px]">{emp.email}</span>
                         </span>
                       )}
                       {emp.phone && (
                         <span className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                           <Phone className="w-3 h-3 shrink-0" />{emp.phone}
                         </span>
                       )}
                       {!emp.email && !emp.phone && <span className="text-xs text-muted-foreground/40">—</span>}
                     </td>
                      )}
                      {vis.has("hire_date") && visibleCols.hire_date && (
                       <td className="px-4 py-3 hidden xl:table-cell">
                       {emp.hire_date
                         ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Calendar className="w-3 h-3 shrink-0" />{fmtDate(emp.hire_date)}</span>
                         : <span className="text-xs text-muted-foreground/40">—</span>}
                     </td>
                      )}
                      {visibleCols.status && (
                       <td className="px-4 py-3">
                         <span className={`text-xs font-semibold ${STATUS_TEXT[emp.status] || "text-muted-foreground"}`}>
                           {emp.status || "Active"}
                         </span>
                       </td>
                       )}
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => openSplitFiles(emp)}
                          className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors ${fc > 0 ? "text-primary hover:bg-primary/10" : "text-muted-foreground/50"}`}
                          title="View employee documents">
                          <Paperclip className="w-3.5 h-3.5" />
                          {fc > 0 && <span className="tabular-nums">{fc}</span>}
                        </button>
                      </td>
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Set role & permissions"
                            onClick={() => setPermsModal(emp)}>
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </Button>
                          {can("employees", "can_edit") && (
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(emp)}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {can("employees", "can_delete") && (
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(emp.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
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
  );

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <div className="bg-card border-b border-border px-6 pt-4 pb-0">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
          <BackToOverviewButton to="/timehr-overview" />
          <ChevronRight className="w-3 h-3" />
        </div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground">Employee Directory</h1>
              <p className="text-xs text-muted-foreground mt-0.5">Manage staff profiles, roles, and contact information</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="w-4 h-4" /> Import Documents
            </Button>
            <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={exporting || filtered.length === 0}>
              <Download className="w-4 h-4" /> {exporting ? "Exporting..." : "Export CSV"}
            </Button>
            {can("employees", "can_create") && (
              <Button className="gap-2 shadow-sm" onClick={openAdd}>
                <Plus className="w-4 h-4" /> Add Employee
              </Button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto">
          {[
            { key: "all", label: "All", count: employees.length },
            { key: "Active", label: "Active", count: employees.filter(e => e.status === "Active").length },
            { key: "On Leave", label: "On Leave", count: employees.filter(e => e.status === "On Leave").length },
            { key: "Inactive", label: "Inactive", count: employees.filter(e => e.status === "Inactive" || e.status === "Terminated").length },
          ].map(tab => (
            <button key={tab.key} onClick={() => setFilterStatus(tab.key)}
              className={`relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                filterStatus === tab.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}>
              {tab.label}
              <span className={`text-xs font-semibold ${filterStatus === tab.key ? "text-primary" : "text-muted-foreground"}`}>{tab.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <div className="bg-card border-b border-border px-6 py-3 flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, email or department..."
            className="pl-9 bg-muted/40 border-muted" value={search} onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map(r => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {(statusOptions.length ? statusOptions : ["Active","On Leave","Inactive","Terminated"]).map(s =>
              <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
      </div>

      {/* Summary */}
      <div className="bg-card border-b border-border px-6 py-2 flex items-center justify-between min-h-[40px]">
        <span className="text-xs font-medium text-foreground tabular-nums">{`${filtered.length} items`}</span>
      </div>

      {/* Main: split or full */}
      <div className="flex bg-card">
        {splitMode === "files" && filesEmp && (
          <div className="w-[35%] min-w-0 flex flex-col">
            <EmployeeFilesViewer employee={filesEmp} onClose={closeSplit} />
          </div>
        )}
        <div className={splitMode ? "w-[65%] min-w-0 flex flex-col" : "flex-1 min-w-0 flex flex-col"}>
          {renderTable(splitMode !== null)}
        </div>
        {splitMode === "detail" && (
          <div className="w-[65%] min-w-0 flex flex-col">
            <EmployeeSplitDetail
              employee={splitEmp}
              role={splitRole}
              fileCount={splitEmp ? fileCountFor(splitEmp) : 0}
              onClose={closeSplit}
              onEdit={(emp) => handleEdit(emp)}
              onPermissions={(emp) => setPermsModal(emp)}
              onPrev={() => navSplit(-1)}
              onNext={() => navSplit(1)}
            />
          </div>
        )}
      </div>

      <PaginationFooter pagination={pagination} />

      <EmployeeFormModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditing(null); }}
        onSave={handleSave}
        employee={editing}
      />

      <EmployeeDocumentImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onSaved={() => load()}
      />

      <EmployeePermissionsModal
        open={!!permsModal}
        employee={permsModal}
        onClose={() => setPermsModal(null)}
        onSaved={load}
      />
    </div>
  );
}