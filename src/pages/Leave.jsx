import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/lib/AuthContext";
import { useCurrentEmployee } from "@/hooks/useCurrentEmployee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Calendar, Clock, CheckCircle, XCircle, AlertCircle, Info,
  UserCheck, Loader2, Trash2, MessageSquare, Eye, Paperclip, Search, ChevronDown, Pencil,
} from "lucide-react";
import { format, differenceInCalendarDays, parseISO } from "date-fns";
import LeaveDocumentUpload from "@/components/leave/LeaveDocumentUpload";
import LeaveEditModal from "@/components/leave/LeaveEditModal";
import { computeAccruedEntitlement } from "@/lib/leaveEntitlement";
import { useTablePagination } from "@/hooks/useTablePagination";
import DataTablePagination from "@/components/shared/DataTablePagination";
import { SortableTh } from "@/components/shared/SortIcon";

// ── Helpers ──────────────────────────────────────────────────
const STATUS_MAP = {
  pending:   { label: "Pending",   color: "bg-amber-100 text-amber-700 border-amber-200", icon: Clock, desc: "Awaiting decision" },
  approved:  { label: "Approved",  color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: CheckCircle, desc: "" },
  rejected:  { label: "Rejected",  color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, desc: "No payroll effect" },
  cancelled: { label: "Cancelled", color: "bg-slate-100 text-slate-600 border-slate-200", icon: AlertCircle, desc: "Ignored in payroll" },
};

const TYPE_LABELS = { vacation: "Vacation", sick: "Sick Leave", other: "Other", unjustified: "Unjustified Absence" };
const TYPE_COLORS = { vacation: "bg-blue-100 text-blue-700", sick: "bg-orange-100 text-orange-700", other: "bg-purple-100 text-purple-700", unjustified: "bg-red-100 text-red-700" };

function fmtDate(d) {
  if (!d) return "—";
  return format(typeof d === "string" ? parseISO(d) : d, "dd MMM yyyy");
}

function fmtNum(n) {
  return (n || 0).toLocaleString();
}

// ── Page ─────────────────────────────────────────────────────
export default function Leave() {
  const { user } = useAuth();
  const { employee: currentEmployee, loading: empLoading } = useCurrentEmployee();
  const [requests, setRequests] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchName, setSearchName] = useState("");
  const [dateFilterMode, setDateFilterMode] = useState("all");
  const [filterMonth, setFilterMonth] = useState("");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");
  const [sortKey, setSortKey] = useState("created_date");
  const [sortDir, setSortDir] = useState("desc");
  const [approveModal, setApproveModal] = useState(null); // { req, action: 'approved'|'rejected' }
  const [adminNotes, setAdminNotes] = useState("");
  const [rejectOption, setRejectOption] = useState("vacation"); // 'vacation' (deduct days) | 'salary' (deduct money)
  const [rejectDays, setRejectDays] = useState(1); // editable days to deduct
  const [rejectSalaryAmount, setRejectSalaryAmount] = useState(0); // editable salary amount to deduct
  const [editModalReq, setEditModalReq] = useState(null); // request being edited
  const [employees, setEmployees] = useState([]);
  const [payrollSettings, setPayrollSettings] = useState({});

  const currentYear = new Date().getFullYear();
  const isAdmin = user?.role === "admin";

  // Check RolePermission for leave module
  const [rolePerms, setRolePerms] = useState([]);
  const [employeeRoles, setEmployeeRoles] = useState([]);
  useEffect(() => {
    base44.entities.RolePermission.list("-created_date", 200).then(list => setRolePerms(list)).catch(() => setRolePerms([]));
    base44.entities.EmployeeRole.list("name", 100).then(list => setEmployeeRoles(list)).catch(() => setEmployeeRoles([]));
  }, []);

  const mappedRole = employeeRoles.find(r => r.name === currentEmployee?.role)?.key || "";

  const canView = isAdmin || rolePerms.find(p => p.role === mappedRole && p.module === "leave")?.can_view !== false;
  const canCreate = isAdmin || rolePerms.find(p => p.role === mappedRole && p.module === "leave")?.can_create !== false;
  const canApprove = isAdmin || !!rolePerms.find(p => p.role === mappedRole && p.module === "leave")?.can_approve;
  const canDelete = isAdmin || !!rolePerms.find(p => p.role === mappedRole && p.module === "leave")?.can_delete;
  const canCreateOnBehalf = isAdmin || !!rolePerms.find(p => p.role === mappedRole && p.module === "leave")?.can_create_on_behalf;

  const load = async () => {
    setLoading(true);
    try {
      let data;
      if (isAdmin || canView) {
        data = await base44.entities.LeaveRequest.list("-created_date", 500);
      } else if (currentEmployee?.id) {
        data = await base44.entities.LeaveRequest.filter(
          { employee_id: currentEmployee.id },
          "-created_date"
        );
      } else {
        data = [];
      }
      setRequests(Array.isArray(data) ? data : []);
    } catch {
      setRequests([]);
    }

    try {
      const p = await base44.entities.EmployeePayrollProfile.list("-created_date", 500);
      setProfiles(Array.isArray(p) ? p : []);
    } catch {
      setProfiles([]);
    }

    if (canCreateOnBehalf || canApprove) {
      try {
        const emps = await base44.entities.Employee.filter({ status: "Active" }, "full_name");
        setEmployees(Array.isArray(emps) ? emps : []);
      } catch {
        setEmployees([]);
      }
    }

    try {
      const s = await base44.entities.PayrollSettings.list();
      setPayrollSettings(Array.isArray(s) && s[0] ? s[0] : {});
    } catch {
      setPayrollSettings({});
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!empLoading) load();
  }, [empLoading, currentEmployee?.id]);

  // ── Leave Balances ─────────────────────────────────────
  const getProfile = (employeeId) => profiles.find(p => p.employee_id === employeeId);

  const getUsedDaysThisYear = (employeeId) => {
    const profile = getProfile(employeeId);
    // Admin can set a manual override for mid-year onboarding — takes precedence
    if (profile?.leave_used_override != null) return profile.leave_used_override;
    // Only approved VACATION consumes the annual leave entitlement.
    // Sick/other approved leave is paid time off but does NOT reduce vacation days.
    return requests
      .filter(r => r.employee_id === employeeId && r.status === "approved" && r.leave_type === "vacation")
      .filter(r => r.start_date && new Date(r.start_date).getFullYear() === currentYear)
      .reduce((sum, r) => sum + (r.total_days || 0), 0);
  };

  const getSickDaysThisYear = (employeeId) =>
    requests
      .filter(r => r.employee_id === employeeId && r.status === "approved" && (r.leave_type === "sick" || r.leave_type === "other"))
      .filter(r => r.start_date && new Date(r.start_date).getFullYear() === currentYear)
      .reduce((sum, r) => sum + (r.total_days || 0), 0);

  const getEmployeeHireDate = (employeeId) => {
    if (currentEmployee?.id === employeeId) return currentEmployee.hire_date;
    return employees.find(e => e.id === employeeId)?.hire_date;
  };

  const getEntitlement = (employeeId) => {
    const full = getProfile(employeeId)?.annual_leave_days ?? 30;
    const { rawEntitlement } = computeAccruedEntitlement({
      hireDate: getEmployeeHireDate(employeeId),
      annualLeaveDays: full,
      currentYear,
    });
    // Round DOWN (floor) for displayed entitlement
    return Math.floor(rawEntitlement);
  };

  const getRemainingDays = (employeeId) => {
    const full = getProfile(employeeId)?.annual_leave_days ?? 30;
    const { rawEntitlement } = computeAccruedEntitlement({
      hireDate: getEmployeeHireDate(employeeId),
      annualLeaveDays: full,
      currentYear,
    });
    // Round UP (ceil) for displayed remaining
    return Math.max(0, Math.ceil(rawEntitlement - getUsedDaysThisYear(employeeId)));
  };

  // ── Estimated absence deduction (rejected leave → unpaid days) ──
  const getDailyRate = (employeeId) => {
    const p = getProfile(employeeId);
    if (!p || p.pay_type === "hourly") return 0;
    const wdp = payrollSettings.working_days_per_month || 22;
    const allowances = (p.components || []).filter(c => c.type === "earning").reduce((s, c) => s + (c.value || 0), 0);
    const totalSalary = (p.basic_salary || 0) + allowances;
    return wdp > 0 ? totalSalary / wdp : 0;
  };

  const countLeaveWorkingDays = (startStr, endStr) => {
    if (!startStr || !endStr) return 0;
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const wdPerWeek = payrollSettings.working_days_per_week || 5;
    const maxDow = wdPerWeek >= 6 ? 6 : 5;
    let count = 0;
    const cur = new Date(start);
    while (cur <= end) {
      const dow = cur.getDay();
      if (dow >= 1 && dow <= maxDow) count++;
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  };

  const getPayability = (req) => {
    if (req.status === "approved") {
      return req.leave_type === "unjustified"
        ? { desc: "Unjustified · Not Payable", deduct: true }
        : { desc: "Justified · Payable", deduct: false };
    }
    if (req.status === "rejected") {
      // Rejected requests normally have no payroll effect, but a salary deduction
      // may have been recorded in admin_notes (rejectOption = 'salary').
      if (getRejectedSalaryDeduction(req) > 0) {
        return { desc: "Salary deduction", deduct: true };
      }
      // A vacation-day deduction was recorded (rejectOption = 'vacation') — no money impact.
      if (req.admin_notes && /\[Deduction:\s*Deduct\s+[\d.]+\s+day/i.test(req.admin_notes)) {
        return { desc: "Vacation days deducted", deduct: false };
      }
      return { desc: "No payroll effect", deduct: false };
    }
    if (req.status === "pending") return { desc: "Awaiting decision", deduct: false };
    if (req.status === "cancelled") return { desc: "Ignored in payroll", deduct: false };
    return { desc: "", deduct: false };
  };

  const getEstimatedDeduction = (req) => {
    const p = getProfile(req.employee_id);
    if (!p || p.pay_type === "hourly") return 0;
    if (!getPayability(req).deduct) return 0;
    const days = countLeaveWorkingDays(req.start_date, req.end_date);
    return Math.round(days * getDailyRate(req.employee_id) * 100) / 100;
  };

  // Rejected requests with a salary deduction option recorded in admin_notes
  const getRejectedSalaryDeduction = (req) => {
    if (req.status !== "rejected" || !req.admin_notes) return 0;
    // Extract the manually-entered salary deduction amount from admin_notes
    const match = req.admin_notes.match(/Deduct\s+([\d.]+)\s+AED\s+of\s+salary/i);
    if (!match) return 0;
    return parseFloat(match[1]) || 0;
  };

  const getPayrollMonth = (req) => {
    const d = new Date(req.end_date || req.start_date);
    return d.toLocaleString("en-US", { month: "long" }) + " " + d.getFullYear();
  };

  const myEntitlement = currentEmployee ? getEntitlement(currentEmployee.id) : 30;
  const myDaysTaken = currentEmployee ? getUsedDaysThisYear(currentEmployee.id) : 0;
  const myRemaining = currentEmployee ? getRemainingDays(currentEmployee.id) : 30;
  const mySickDays = currentEmployee ? getSickDaysThisYear(currentEmployee.id) : 0;

  // ── Form ──────────────────────────────────────────────
  const [form, setForm] = useState({
    leave_type: "vacation",
    start_date: "",
    end_date: "",
    reason: "",
    documents: [],
    on_behalf_employee_id: "",
  });

  const resetForm = () => setForm({ leave_type: "vacation", start_date: "", end_date: "", reason: "", documents: [], on_behalf_employee_id: "" });

  const formDays = form.start_date && form.end_date
    ? Math.max(0, differenceInCalendarDays(parseISO(form.end_date), parseISO(form.start_date)) + 1)
    : 0;

  const handleSubmit = async () => {
    if (!currentEmployee) {
      alert("Your account is not linked to an employee profile. Please contact an admin to link your account.");
      return;
    }
    if (!form.start_date || !form.end_date) return;
    if (formDays < 1) return;

    const targetEmployee = (canCreateOnBehalf && form.on_behalf_employee_id)
      ? employees.find(e => e.id === form.on_behalf_employee_id)
      : currentEmployee;

    if (!targetEmployee) {
      alert("Please select an employee.");
      return;
    }

    setSubmitting(true);
    try {
      await base44.entities.LeaveRequest.create({
        employee_id: targetEmployee.id,
        employee_name: targetEmployee.full_name,
        submitted_by_name: user?.full_name || "",
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        total_days: formDays,
        reason: form.reason,
        documents: form.documents || [],
        status: "pending",
      });
      setShowForm(false);
      resetForm();
      load();
    } catch (e) {
      alert("Failed to submit: " + e.message);
    }
    setSubmitting(false);
  };

  // ── Actions ────────────────────────────────────────────
  const handleAction = async (req, action, notes, rejectOption) => {
    setActionLoading(req.id);
    try {
      let finalNotes = notes || "";
      if (action === "rejected" && rejectOption) {
        const deductionNote = rejectOption === "vacation"
          ? `[Deduction: Deduct ${rejectDays} day(s) from vacation balance]`
          : `[Deduction: Deduct ${rejectSalaryAmount} AED of salary]`;
        finalNotes = (notes ? notes + " " : "") + deductionNote;
      }
      await base44.entities.LeaveRequest.update(req.id, {
        status: action,
        approved_by: user?.id,
        approved_by_name: user?.full_name,
        approved_at: new Date().toISOString(),
        admin_notes: finalNotes,
      });
      // Employee On Leave / Active status is now synced automatically by the
      // syncEmployeeLeaveStatus entity automation on every LeaveRequest change.
      setApproveModal(null);
      setAdminNotes("");
      load();
    } catch (e) {
      alert("Action failed: " + e.message);
    }
    setActionLoading(null);
  };

  const handleDelete = async (req) => {
    if (!confirm(`Delete cancelled request for ${req.employee_name}? This cannot be undone.`)) return;
    setActionLoading(req.id);
    try {
      await base44.entities.LeaveRequest.delete(req.id);
      load();
    } catch (e) {
      alert("Failed to delete: " + e.message);
    }
    setActionLoading(null);
  };

  const handleCancel = async (req) => {
    setActionLoading(req.id);
    try {
      await base44.entities.LeaveRequest.update(req.id, { status: "cancelled" });
      // Employee status is recomputed automatically by the entity automation.
      load();
    } catch (e) {
      alert("Failed: " + e.message);
    }
    setActionLoading(null);
  };

  // ── Filtering & Sorting ───────────────────────────────
  const handleSort = (col) => {
    if (sortKey === col) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  const sortValue = (req, col) => {
    switch (col) {
      case "employee": return (req.employee_name || "").toLowerCase();
      case "type": return req.leave_type || "";
      case "status": return req.status || "";
      case "payroll": return getPayability(req).desc || "";
      case "dates": return req.start_date || "";
      case "reason": return req.reason || req.admin_notes || "";
      case "submitter": return req.submitted_by_name || "";
      case "approver": return req.approved_by_name || "";
      case "created_date": return req.created_date || "";
      default: return "";
    }
  };

  const filtered = requests
    .filter(r => statusFilter === "all" || r.status === statusFilter)
    .filter(r => {
      const q = searchName.trim().toLowerCase();
      if (!q) return true;
      return (r.employee_name || "").toLowerCase().includes(q);
    })
    .filter(r => {
      if (dateFilterMode === "all") return true;
      if (!r.start_date || !r.end_date) return false;
      const reqStart = parseISO(r.start_date);
      const reqEnd = parseISO(r.end_date);
      if (dateFilterMode === "month" && filterMonth) {
        const [y, m] = filterMonth.split("-").map(Number);
        const monthStart = new Date(y, m - 1, 1);
        const monthEnd = new Date(y, m, 0, 23, 59, 59);
        return reqStart <= monthEnd && reqEnd >= monthStart;
      }
      if (dateFilterMode === "range") {
        if (!filterStart && !filterEnd) return true;
        const rangeStart = filterStart ? parseISO(filterStart) : null;
        const rangeEnd = filterEnd ? parseISO(filterEnd) : null;
        if (rangeEnd) rangeEnd.setHours(23, 59, 59);
        if (rangeStart && rangeEnd) return reqStart <= rangeEnd && reqEnd >= rangeStart;
        if (rangeStart) return reqEnd >= rangeStart;
        if (rangeEnd) return reqStart <= rangeEnd;
      }
      return true;
    })
    .sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  const pagination = useTablePagination(filtered);

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const approvedCount = requests.filter(r => r.status === "approved").length;

  if (empLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Leave page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Leave</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {canApprove ? "Manage team leave requests & approvals" : canView ? "View team leave requests" : "Submit and track your leave requests"}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="w-4 h-4" /> New Request
          </Button>
        )}
      </div>

      {/* Summary cards — my leave balance */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {[
          { label: "My Entitlement", value: `${myEntitlement} days`, color: "text-foreground", icon: UserCheck },
          { label: "Days Taken", value: `${myDaysTaken} of ${myEntitlement}`, color: "text-blue-600", icon: Calendar },
          { label: "Remaining", value: `${myRemaining} days`, color: myRemaining <= 5 ? "text-red-600" : "text-emerald-600", icon: CheckCircle },
          { label: "Sick Days Taken", value: mySickDays, color: "text-orange-600", icon: AlertCircle },
          { label: "Pending Requests", value: pendingCount, color: "text-amber-600", icon: Clock },
        ].map(m => (
          <div key={m.label} className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2">
              <m.icon className={`w-4 h-4 ${m.color}`} />
              <p className="text-xs text-muted-foreground">{m.label}</p>
            </div>
            <p className={`text-2xl font-bold mt-1 ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        {["all", "pending", "approved", "rejected", "cancelled"].filter(s => s === "all" || requests.some(r => r.status === s)).map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition-colors ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {s === "all" ? "All" : STATUS_MAP[s]?.label}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <Select value={dateFilterMode} onValueChange={v => setDateFilterMode(v)}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="month">By month</SelectItem>
              <SelectItem value="range">Date range</SelectItem>
            </SelectContent>
          </Select>
          {dateFilterMode === "month" && (
            <div className="flex items-center gap-1.5">
              <Select
                value={filterMonth ? filterMonth.slice(5, 7) : ""}
                onValueChange={v => {
                  const year = filterMonth ? filterMonth.slice(0, 4) : String(new Date().getFullYear());
                  setFilterMonth(`${year}-${v}`);
                }}
              >
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {[
                    { v: "01", l: "January" }, { v: "02", l: "February" }, { v: "03", l: "March" },
                    { v: "04", l: "April" }, { v: "05", l: "May" }, { v: "06", l: "June" },
                    { v: "07", l: "July" }, { v: "08", l: "August" }, { v: "09", l: "September" },
                    { v: "10", l: "October" }, { v: "11", l: "November" }, { v: "12", l: "December" },
                  ].map(m => (
                    <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filterMonth ? filterMonth.slice(0, 4) : ""}
                onValueChange={v => {
                  const month = filterMonth ? filterMonth.slice(5, 7) : String(new Date().getMonth() + 1).padStart(2, "0");
                  setFilterMonth(`${v}-${month}`);
                }}
              >
                <SelectTrigger className="h-8 w-24 text-xs">
                  <SelectValue placeholder="Year" />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {dateFilterMode === "range" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={filterStart} onChange={e => setFilterStart(e.target.value)} className="h-8 w-36 text-xs" />
              <span className="text-xs text-muted-foreground">→</span>
              <Input type="date" value={filterEnd} onChange={e => setFilterEnd(e.target.value)} className="h-8 w-36 text-xs" />
            </div>
          )}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchName}
              onChange={e => setSearchName(e.target.value)}
              placeholder="Search employee name..."
              className="h-8 w-56 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Requests list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <Calendar className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No leave requests found.</p>
            {canCreate && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowForm(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Submit one
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="w-full table-fixed text-sm border-collapse">
              <colgroup>
                <col className="w-[14%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[14%]" />
                <col className="w-[14%]" />
                <col className="w-[15%]" />
                <col className="w-[8%]" />
                <col className="w-[7%]" />
                <col className="w-[7%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <SortableTh colKey="employee" label="Employee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-2 py-2.5" />
                  <SortableTh colKey="type" label="Type" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-2 py-2.5" />
                  <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-2 py-2.5" />
                  <SortableTh colKey="payroll" label="Payroll" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-2 py-2.5" />
                  <SortableTh colKey="dates" label="Dates" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-2 py-2.5" />
                  <SortableTh colKey="reason" label="Reason / Notes" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-2 py-2.5" />
                  <SortableTh colKey="submitter" label="Submitter" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-2 py-2.5" />
                  <SortableTh colKey="approver" label="Approver" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-2 py-2.5" />
                  <th className="px-2 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagination.pageItems.map(req => {
                  const st = STATUS_MAP[req.status] || STATUS_MAP.pending;
                  const StatusIcon = st.icon;
                  const isOwn = req.employee_id === currentEmployee?.id;
                  const pay = getPayability(req);
                  const deduct = getEstimatedDeduction(req);

                  return (
                    <tr key={req.id} className="hover:bg-muted/20 transition-colors align-top">
                      {/* Employee */}
                      <td className="px-2 py-2.5 align-top">
                        <span className="font-semibold text-xs text-foreground truncate block">{req.employee_name}</span>
                      </td>
                      {/* Type */}
                      <td className="px-2 py-2.5 align-top">
                        <Badge className={`text-[10px] ${TYPE_COLORS[req.leave_type] || "bg-muted"}`} variant="outline">
                          {TYPE_LABELS[req.leave_type]}
                        </Badge>
                      </td>
                      {/* Status */}
                      <td className="px-2 py-2.5 align-top">
                        {canApprove && req.status !== "pending" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button
                                disabled={actionLoading === req.id}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${st.color} hover:opacity-80 transition-opacity cursor-pointer`}
                              >
                                <StatusIcon className="w-2.5 h-2.5" />
                                {st.label}
                                <ChevronDown className="w-2.5 h-2.5 opacity-60" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="w-36">
                              <DropdownMenuItem
                                disabled={req.status === "approved"}
                                onClick={() => { setApproveModal({ req, action: "approved" }); setAdminNotes(""); setRejectOption("vacation"); }}
                              >
                                <CheckCircle className="w-3 h-3 text-emerald-600" /> Mark Approved
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={req.status === "rejected"}
                                onClick={() => {
                                  setApproveModal({ req, action: "rejected" });
                                  setAdminNotes("");
                                  setRejectOption("vacation");
                                  setRejectDays(req.total_days || 1);
                                  setRejectSalaryAmount(Math.round((req.total_days || 1) * getDailyRate(req.employee_id)));
                                }}
                              >
                                <XCircle className="w-3 h-3 text-red-600" /> Mark Rejected
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                disabled={req.status === "cancelled"}
                                onClick={() => handleCancel(req)}
                              >
                                <AlertCircle className="w-3 h-3 text-slate-500" /> Cancel
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${st.color}`}>
                            <StatusIcon className="w-2.5 h-2.5" />
                            {st.label}
                          </span>
                        )}
                      </td>
                      {/* Payroll */}
                      <td className="px-2 py-2.5 align-top">
                        <span className="text-[11px] text-muted-foreground leading-tight block">{pay.desc}</span>
                        {req.status === "approved" && req.leave_type === "unjustified" && deduct > 0 && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-medium mt-1">
                            <AlertCircle className="w-2.5 h-2.5" />
                            ≈ {fmtNum(deduct)} AED
                          </span>
                        )}
                        {req.status === "rejected" && (() => {
                          const rejDeduct = getRejectedSalaryDeduction(req);
                          if (rejDeduct > 0) {
                            return (
                              <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-medium mt-1">
                                <AlertCircle className="w-2.5 h-2.5" />
                                ≈ {fmtNum(rejDeduct)} AED
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </td>
                      {/* Dates */}
                      <td className="px-2 py-2.5 align-top">
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground leading-tight">
                          <Calendar className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{fmtDate(req.start_date)} → {fmtDate(req.end_date)}</span>
                        </span>
                        <span className="text-[10px] text-muted-foreground/70 ml-3.5">{req.total_days}d</span>
                      </td>
                      {/* Reason / Notes */}
                      <td className="px-2 py-2.5 align-top">
                        {req.reason && <p className="text-[11px] text-muted-foreground italic truncate">"{req.reason}"</p>}
                        {req.admin_notes && <p className="text-[11px] text-muted-foreground mt-0.5 italic truncate">"{req.admin_notes}"</p>}
                        {req.documents && req.documents.length > 0 && (
                          <div className="flex items-center flex-wrap gap-1 mt-1">
                            {req.documents.map((doc, di) => (
                              <a key={di} href={doc.file_url} target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[10px] px-1 py-0.5 rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors max-w-full"
                                title={doc.file_name}>
                                <Paperclip className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{doc.title || doc.file_name}</span>
                              </a>
                            ))}
                          </div>
                        )}
                      </td>
                      {/* Submitter */}
                      <td className="px-2 py-2.5 align-top">
                        {req.submitted_by_name ? (
                          <div className="text-[11px] text-muted-foreground leading-tight">
                            <span className="font-medium text-foreground/70 truncate block">{req.submitted_by_name}</span>
                            <div className="text-muted-foreground/70">{fmtDate(req.created_date)}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      {/* Approver */}
                      <td className="px-2 py-2.5 align-top">
                        {req.approved_by_name ? (
                          <div className="text-[11px] text-muted-foreground leading-tight">
                            <span className="font-medium text-foreground/70 truncate block">{req.approved_by_name}</span>
                            {req.approved_at && <div className="text-muted-foreground/70">{fmtDate(req.approved_at)}</div>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      {/* Actions */}
                      <td className="px-2 py-2.5 text-right align-top">
                        <div className="flex flex-col items-end gap-1 min-h-[124px] justify-start">
                          {canApprove && (
                            <Button size="sm" variant="ghost"
                              className="text-muted-foreground hover:text-primary h-7 w-7 p-0"
                              disabled={actionLoading === req.id}
                              onClick={() => setEditModalReq(req)}
                              title="Edit request">
                              <Pencil className="w-3 h-3" />
                            </Button>
                          )}
                          {canApprove && req.status === "pending" && (
                            <>
                              <Button size="sm" variant="outline"
                                className="gap-1 text-emerald-600 border-emerald-200 hover:bg-emerald-50 h-7 px-2 text-[11px]"
                                disabled={actionLoading === req.id}
                                onClick={() => { setApproveModal({ req, action: "approved" }); setAdminNotes(""); setRejectOption("vacation"); }}>
                                {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                                Approve
                              </Button>
                              <Button size="sm" variant="outline"
                                className="gap-1 text-red-600 border-red-200 hover:bg-red-50 h-7 px-2 text-[11px]"
                                disabled={actionLoading === req.id}
                                onClick={() => {
                                  setApproveModal({ req, action: "rejected" });
                                  setAdminNotes("");
                                  setRejectOption("vacation");
                                  setRejectDays(req.total_days || 1);
                                  setRejectSalaryAmount(Math.round((req.total_days || 1) * getDailyRate(req.employee_id)));
                                }}>
                                {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                Reject
                              </Button>
                            </>
                          )}
                          {(isOwn || canDelete) && (req.status === "pending" || req.status === "approved") && (
                            <Button size="sm" variant="ghost"
                              className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                              disabled={actionLoading === req.id}
                              onClick={() => handleCancel(req)}>
                              {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </Button>
                          )}
                          {canDelete && req.status === "cancelled" && (
                            <Button size="sm" variant="ghost"
                              className="text-muted-foreground hover:text-destructive h-7 w-7 p-0"
                              disabled={actionLoading === req.id}
                              onClick={() => handleDelete(req)}>
                              {actionLoading === req.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DataTablePagination pagination={pagination} />

      {/* Approval confirmation modal */}
      <Dialog open={!!approveModal} onOpenChange={() => { if (!actionLoading) { setApproveModal(null); setAdminNotes(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {approveModal?.action === "approved" ? "Approve Leave Request" : "Reject Leave Request"}
            </DialogTitle>
            <DialogDescription>
              {approveModal?.req && (
                <span>
                  <strong>{approveModal.req.employee_name}</strong> —{" "}
                  {TYPE_LABELS[approveModal.req.leave_type]} ·{" "}
                  {fmtDate(approveModal.req.start_date)} → {fmtDate(approveModal.req.end_date)}{" "}
                  ({approveModal.req.total_days} day{approveModal.req.total_days !== 1 ? "s" : ""})
                  {approveModal.req.reason && <> · "<em>{approveModal.req.reason}</em>"</>}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          {approveModal?.req && (
            <div className="grid grid-cols-3 gap-3 my-3">
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-lg font-bold text-foreground">{getEntitlement(approveModal.req.employee_id)}</p>
                <p className="text-xs text-muted-foreground">Entitlement</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted/50">
                <p className="text-lg font-bold text-blue-600">{getUsedDaysThisYear(approveModal.req.employee_id)}</p>
                <p className="text-xs text-muted-foreground">Days Used</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${getRemainingDays(approveModal.req.employee_id) <= 5 ? "bg-red-50" : "bg-muted/50"}`}>
                <p className={`text-lg font-bold ${getRemainingDays(approveModal.req.employee_id) <= 5 ? "text-red-600" : "text-emerald-600"}`}>
                  {getRemainingDays(approveModal.req.employee_id)}
                </p>
                <p className="text-xs text-muted-foreground">Remaining</p>
              </div>
            </div>
          )}

          {approveModal?.action === "approved" && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="text-xs text-blue-800 space-y-1">
                  <p className="font-semibold">What happens when you approve this request:</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>The request status changes to <strong>Approved</strong> and your name is recorded as the approver.</li>
                    <li>The employee's status is automatically updated (On Leave during the period, then back to Active).</li>
                    <li>Payroll impact is applied when the next pay period is calculated.</li>
                  </ul>
                </div>
              </div>

              {approveModal?.req?.leave_type === "vacation" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-800 space-y-1">
                    <p className="font-semibold">Vacation / Annual Leave — Paid</p>
                    <p>This is <strong>paid time off</strong>. It consumes <strong>{approveModal.req.total_days}</strong> day(s) from the annual leave entitlement (shown above in "Days Used"). No salary deduction is applied.</p>
                  </div>
                </div>
              )}

              {approveModal?.req?.leave_type === "sick" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-800 space-y-1">
                    <p className="font-semibold">Sick Leave — Paid</p>
                    <p>This is <strong>paid time off</strong> for health reasons. It does <strong>not</strong> consume annual leave days. No salary deduction is applied.</p>
                  </div>
                </div>
              )}

              {approveModal?.req?.leave_type === "other" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-emerald-800 space-y-1">
                    <p className="font-semibold">Other Leave — Paid</p>
                    <p>This is <strong>paid time off</strong>. It does <strong>not</strong> consume annual leave days. No salary deduction is applied.</p>
                  </div>
                </div>
              )}

              {approveModal?.req?.leave_type === "unjustified" && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-red-700 space-y-1">
                    <p className="font-semibold">Unjustified Absence — Unpaid</p>
                    <p>This is an <strong>unpaid absence</strong>. A salary deduction is applied when payroll is calculated:</p>
                    <p>
                      <strong>Deduction impact:</strong>{" "}
                      {countLeaveWorkingDays(approveModal.req.start_date, approveModal.req.end_date)} working day(s) ×{" "}
                      {fmtNum(Math.round(getDailyRate(approveModal.req.employee_id)))} AED/day ≈{" "}
                      <strong>{fmtNum(Math.round(countLeaveWorkingDays(approveModal.req.start_date, approveModal.req.end_date) * getDailyRate(approveModal.req.employee_id)))} AED</strong>{" "}
                      deducted (a day's salary per absent day) from the <strong>{getPayrollMonth(approveModal.req)}</strong> payroll.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {approveModal?.req?.documents?.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Attached Documents</Label>
              <div className="flex flex-col gap-1.5">
                {approveModal.req.documents.map((doc, di) => (
                  <a
                    key={di}
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-md border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    title={doc.file_name}
                  >
                    <Paperclip className="w-3 h-3" />
                    {doc.title || doc.file_name}
                  </a>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              placeholder={approveModal?.action === "approved" ? "Add a note for the employee..." : "Reason for rejection..."}
              value={adminNotes}
              onChange={e => setAdminNotes(e.target.value)}
              rows={3}
            />
          </div>

          {approveModal?.action === "rejected" && (
            <div className="space-y-2">
              <Label className="text-xs">Deduction option</Label>
              <div className="flex flex-col gap-2">
                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${rejectOption === "vacation" ? "border-red-300 bg-red-50" : "border-border bg-card hover:bg-muted/50"}`}>
                  <input
                    type="radio"
                    name="rejectOption"
                    checked={rejectOption === "vacation"}
                    onChange={() => setRejectOption("vacation")}
                    className="mt-0.5 accent-red-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Deduct from vacation balance</p>
                    <p className="text-xs text-muted-foreground mb-2">Deduct days from the employee's annual leave entitlement (days, not money).</p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Days to deduct</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={rejectDays}
                        onChange={e => setRejectDays(parseFloat(e.target.value) || 0)}
                        className="h-8 w-24 text-xs"
                      />
                    </div>
                  </div>
                </label>
                <label className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${rejectOption === "salary" ? "border-red-300 bg-red-50" : "border-border bg-card hover:bg-muted/50"}`}>
                  <input
                    type="radio"
                    name="rejectOption"
                    checked={rejectOption === "salary"}
                    onChange={() => setRejectOption("salary")}
                    className="mt-0.5 accent-red-600"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground">Deduct from salary</p>
                    <p className="text-xs text-muted-foreground mb-2">Deduct a salary amount from the next payroll.</p>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Amount (AED)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={rejectSalaryAmount}
                        onChange={e => setRejectSalaryAmount(parseFloat(e.target.value) || 0)}
                        className="h-8 w-32 text-xs"
                      />
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      Suggested: {approveModal?.req?.total_days || 1} × {fmtNum(Math.round(getDailyRate(approveModal?.req?.employee_id)))} AED/day ≈ {fmtNum(Math.round((approveModal?.req?.total_days || 1) * getDailyRate(approveModal?.req?.employee_id)))} AED
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => { setApproveModal(null); setAdminNotes(""); }} disabled={actionLoading}>
              Cancel
            </Button>
            <Button
              variant={approveModal?.action === "approved" ? "default" : "destructive"}
              onClick={() => approveModal && handleAction(approveModal.req, approveModal.action, adminNotes, rejectOption)}
              disabled={actionLoading}
              className="gap-1.5"
            >
              {actionLoading ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : approveModal?.action === "approved" ? (
                <><CheckCircle className="w-4 h-4" /> Confirm Approval</>
              ) : (
                <><XCircle className="w-4 h-4" /> Confirm Rejection</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New request modal */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Leave Request</DialogTitle>
            <DialogDescription>
              {!currentEmployee ? (
                <span className="text-amber-600 block mt-1">
                  Your account is not linked to an employee profile. An admin must link your user account to an Employee record first.
                </span>
              ) : (
                <>
                  Your annual entitlement: <strong>{myEntitlement} days</strong>.{" "}
                  You've used <strong>{myDaysTaken}</strong> so far —{" "}
                  <strong className={myRemaining <= 5 ? "text-red-600" : "text-emerald-600"}>{myRemaining} remaining</strong>.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            {canCreateOnBehalf && (
              <div>
                <Label className="text-xs">On Behalf Of</Label>
                <Select
                  value={form.on_behalf_employee_id}
                  onValueChange={v => setForm({ ...form, on_behalf_employee_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Yourself (default)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Yourself ({currentEmployee?.full_name})</SelectItem>
                    {employees.filter(e => e.id !== currentEmployee?.id).map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label className="text-xs">Leave Type</Label>
              <Select
                value={form.leave_type}
                onValueChange={v => setForm({ ...form, leave_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vacation">Vacation / Annual Leave</SelectItem>
                  <SelectItem value="sick">Sick Leave</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                  <SelectItem value="unjustified">Unjustified Absence (Unpaid)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={e => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            {form.start_date && form.end_date && (
              <p className={`text-xs ${formDays > myRemaining ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                {formDays} calendar day(s){formDays > myRemaining ? ` — exceeds your ${myRemaining} remaining days` : ""}
              </p>
            )}

            <div>
              <Label className="text-xs">Reason (optional)</Label>
              <Textarea
                placeholder="Briefly describe the reason for your leave..."
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                rows={3}
              />
            </div>

            <LeaveDocumentUpload
              documents={form.documents || []}
              onChange={(docs) => setForm({ ...form, documents: docs })}
            />
          </div>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting || !currentEmployee || !form.start_date || !form.end_date || formDays < 1}
            >
              {submitting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Submit Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit request modal */}
      <LeaveEditModal
        open={!!editModalReq}
        req={editModalReq}
        onClose={() => setEditModalReq(null)}
        onSaved={load}
      />
    </div>
  );
}