import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Plus, Search, Users, Mail, Phone, Pencil, Trash2, Calendar, Briefcase, Download, Upload } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import EmployeeDocumentImportModal from "@/components/employees/EmployeeDocumentImportModal";
import { useSortable } from "@/hooks/useSortable";
import { SortableTh } from "@/components/shared/SortIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmployeeFormModal from "@/components/employees/EmployeeFormModal";
import { propagateEmployeeRename } from "@/lib/employeeRename";
import { useTablePagination } from "@/hooks/useTablePagination";
import PaginationFooter from "@/components/shared/PaginationFooter";
import { visibleKeys } from "@/lib/visibleColumns";

const STATUS_STYLES = {
  Active:     "bg-emerald-100 text-emerald-700",
  "On Leave": "bg-amber-100 text-amber-700",
  Inactive:   "bg-slate-100 text-slate-600",
  Terminated: "bg-red-100 text-red-600",
};



function initials(name) {
  return name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function fmtDate(d) {
  if (!d) return null;
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const { sortKey, sortDir, handleSort, applySorting } = useSortable();

  const load = async () => {
    setLoading(true);
    const [data, roleList] = await Promise.all([
      base44.entities.Employee.list("-created_date", 500),
      base44.entities.EmployeeRole.list("name", 100),
    ]);
    setEmployees(data);
    setRoles(roleList);
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
    role: e => e.role || e.department,
    contact: e => e.email || e.phone,
    hire_date: e => e.hire_date,
  });
  const pagination = useTablePagination(filtered);

  const handleSave = async (form) => {
    if (editing) {
      await base44.entities.Employee.update(editing.id, form);
      if (editing.full_name && form.full_name && editing.full_name !== form.full_name) {
        await propagateEmployeeRename(base44, editing.id, editing.full_name, form.full_name);
      }
    } else {
      await base44.entities.Employee.create(form);
    }
    setModalOpen(false);
    setEditing(null);
    load();
  };

  const handleEdit   = (emp) => { setEditing(emp); setModalOpen(true); };
  const handleDelete = async (id) => {
    if (!confirm("Remove this employee?")) return;
    await base44.entities.Employee.delete(id);
    load();
  };
  const openAdd = () => { setEditing(null); setModalOpen(true); };

  const exportCSV = async () => {
    setExporting(true);
    try {
      // Fetch leave requests to compute per-employee leave totals
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
      exportToCSV(`employees-with-leaves-${new Date().toISOString().slice(0, 10)}`, [
        { key: "full_name", label: "Full Name" },
        { key: "employee_no", label: "Employee No" },
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Employee Directory</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage staff profiles, roles, and contact information</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="w-4 h-4" /> Import Documents
          </Button>
          <Button variant="outline" className="gap-2" onClick={exportCSV} disabled={exporting || filtered.length === 0}>
            <Download className="w-4 h-4" /> {exporting ? "Exporting..." : "Export CSV"}
          </Button>
          <Button className="gap-2 shadow-sm" onClick={openAdd}>
            <Plus className="w-4 h-4" /> Add Employee
          </Button>
        </div>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total",     value: employees.length,                                                             color: "text-foreground" },
          { label: "Active",    value: employees.filter(e => e.status === "Active").length,                          color: "text-emerald-600" },
          { label: "On Leave",  value: employees.filter(e => e.status === "On Leave").length,                        color: "text-amber-600" },
          { label: "Inactive",  value: employees.filter(e => e.status === "Inactive" || e.status === "Terminated").length, color: "text-slate-500" },
        ].map(stat => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-4 text-center">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{stat.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search by name, email or department..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Roles" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map(r => <SelectItem key={r.key} value={r.name}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            {["Active","On Leave","Inactive","Terminated"].map(s =>
              <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </motion.div>

      {/* Table */}
      {loading ? (
        <div className="bg-card rounded-2xl border border-border p-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-border p-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Users className="w-7 h-7 text-muted-foreground/60" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No employees found</h3>
          <p className="text-sm text-muted-foreground mb-6">
            {search || filterRole !== "all" || filterStatus !== "all"
              ? "Try adjusting your filters."
              : "Add your first employee to get started."}
          </p>
          {!search && filterRole === "all" && filterStatus === "all" && (
            <Button onClick={openAdd} className="gap-2"><Plus className="w-4 h-4" /> Add Employee</Button>
          )}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          className="bg-card rounded-2xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <SortableTh colKey="full_name" label="Employee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  {vis.has("role") && <SortableTh colKey="role" label="Role / Department" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />}
                  {vis.has("contact") && <SortableTh colKey="email" label="Contact" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden lg:table-cell" />}
                  {vis.has("hire_date") && <SortableTh colKey="hire_date" label="Hire Date" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden xl:table-cell" />}
                  <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {pagination.pageItems.map((emp, i) => (
                  <motion.tr key={emp.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-border/50 hover:bg-muted/20 transition-colors group">

                    {/* Employee name + avatar */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-9 h-9 shrink-0">
                          <AvatarImage src={emp.avatar_url} alt={emp.full_name} />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold text-xs">
                            {initials(emp.full_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <Link to={`/employees/${emp.id}`} className="font-semibold text-foreground hover:text-primary transition-colors leading-tight">{emp.full_name}</Link>
                          {emp.notes && <p className="text-xs text-muted-foreground/70 truncate max-w-[180px]">{emp.notes}</p>}
                        </div>
                      </div>
                    </td>

                    {vis.has("role") && (
                     <td className="px-4 py-3 hidden md:table-cell">
                       {(() => {
                         const r = roles.find(r => r.name === emp.role);
                         return (
                           <span className="inline-block text-xs font-medium px-2.5 py-0.5 rounded-full"
                             style={r ? { backgroundColor: r.color + "22", color: r.color } : { backgroundColor: "#f1f5f9", color: "#64748b" }}>
                             {emp.role || "—"}
                           </span>
                         );
                       })()}
                      {emp.department && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <Briefcase className="w-3 h-3 shrink-0" />{emp.department}
                        </span>
                      )}
                    </td>
                    )}

                    {vis.has("contact") && (
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

                    {vis.has("hire_date") && (
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {emp.hire_date
                        ? <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Calendar className="w-3 h-3 shrink-0" />{fmtDate(emp.hire_date)}</span>
                        : <span className="text-xs text-muted-foreground/40">—</span>}
                    </td>
                    )}

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLES[emp.status] || "bg-muted text-muted-foreground"}`}>
                        {emp.status || "Active"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEdit(emp)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(emp.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

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
    </div>
  );
}