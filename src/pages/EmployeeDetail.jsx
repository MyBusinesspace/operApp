import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { ArrowLeft, Pencil, Mail, Phone, Calendar, Briefcase, FileText, DollarSign, Receipt, CalendarDays, FileStack, Link2, Clock, Award, CreditCard, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import EmployeeFormModal from "@/components/employees/EmployeeFormModal";
import { propagateEmployeeRename } from "@/lib/employeeRename";
import EmployeeDocumentsTab from "@/components/employees/EmployeeDocumentsTab";
import EmployeePayrollProfileTab from "@/components/employees/EmployeePayrollProfileTab";
import EmployeePaySlipsTab from "@/components/employees/EmployeePaySlipsTab";
import EmployeeExtraTimeTab from "@/components/employees/EmployeeExtraTimeTab";
import EmployeeLeaveTab from "@/components/employees/EmployeeLeaveTab";
import EmployeeGratuityTab from "@/components/employees/EmployeeGratuityTab";
import EmployeeTimelineTab from "@/components/employees/EmployeeTimelineTab";
import EmployeeAllSummary from "@/components/employees/EmployeeAllSummary";
import { usePermission } from "@/hooks/usePermissions";

const STATUS_STYLES = {
  Active:     "bg-emerald-100 text-emerald-700",
  "On Leave": "bg-amber-100 text-amber-700",
  Inactive:   "bg-slate-100 text-slate-600",
  Terminated: "bg-red-100 text-red-600",
};
const ROLE_STYLES = {
  Admin:      "bg-primary/10 text-primary",
  Manager:    "bg-purple-100 text-purple-700",
  Supervisor: "bg-blue-100 text-blue-700",
  Technician: "bg-cyan-100 text-cyan-700",
  Staff:      "bg-slate-100 text-slate-600",
  Contractor: "bg-orange-100 text-orange-700",
};

function initials(name) {
  return name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const TABS = ["All", "Documents", "Leave", "Gratuity", "Salary", "Pay Slips", "Extra Time", "Timeline"];

export default function EmployeeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("All");
  const [editModal, setEditModal] = useState(false);
  const payrollView = usePermission("payroll", "can_view");
  const payrollEdit = usePermission("payroll", "can_edit");
  // Salary & Pay Slips are payroll-sensitive: only show to roles with payroll can_view.
  const visibleTabs = TABS.filter(t => !["Salary", "Pay Slips", "Gratuity", "Extra Time"].includes(t) || payrollView.allowed);

  const load = async () => {
    setLoading(true);
    const res = await base44.entities.Employee.filter({ id });
    setEmployee(Array.isArray(res) ? res[0] : res);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  const handleSave = async (form) => {
    await base44.entities.Employee.update(id, form);
    if (employee?.full_name && form.full_name && employee.full_name !== form.full_name) {
      await propagateEmployeeRename(base44, id, employee.full_name, form.full_name);
    }
    setEditModal(false);
    load();
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">Loading...</div>;
  if (!employee) return (
    <div className="text-center py-20">
      <p className="text-muted-foreground">Employee not found.</p>
      <Button variant="outline" className="mt-4" onClick={() => navigate("/employees")}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to="/employees" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Employees
      </Link>

      {/* Hero Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden border border-border">
        {/* Banner */}
        <div className="bg-primary h-28 relative" />

        {/* Profile row */}
        <div className="bg-card px-6 pb-6">
          <div className="flex items-start gap-4 -mt-10">
            <Avatar className="w-20 h-20 border-4 border-card shadow-lg shrink-0 mt-0">
              <AvatarImage src={employee.avatar_url} alt={employee.full_name} className="object-cover" />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-2xl">
                {initials(employee.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0 pt-12">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground">{employee.full_name}</h1>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${ROLE_STYLES[employee.role] || "bg-muted text-muted-foreground"}`}>
                  {employee.role}
                </span>
                <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLES[employee.status] || "bg-muted text-muted-foreground"}`}>
                  {employee.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mt-1.5">
                {employee.employee_no && <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />#{employee.employee_no}</span>}
                {employee.bank_account && <span className="flex items-center gap-1.5"><CreditCard className="w-3.5 h-3.5" />{employee.bank_account}</span>}
                {employee.email    && <span className="flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" />{employee.email}</span>}
                {employee.phone    && <span className="flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" />{employee.phone}</span>}
                {employee.department && <span className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" />{employee.department}</span>}
                {employee.hire_date && <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" />Hired {fmtDate(employee.hire_date)}</span>}
              </div>
              {employee.notes && <p className="mt-1 text-sm text-muted-foreground border-l-2 border-border pl-3">{employee.notes}</p>}
            </div>
            <Button variant="outline" size="sm" className="gap-2 shrink-0 mt-12" onClick={() => setEditModal(true)}>
              <Pencil className="w-3.5 h-3.5" /> Edit
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">
        <div className="border-b border-border overflow-x-auto">
          <div className="flex min-w-max">
            {visibleTabs.map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b transition-colors ${
                  tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}>
                {t === "All"      && <span className="flex items-center gap-2"><FileText className="w-3.5 h-3.5" />{t}</span>}
                {t === "Documents"&& <span className="flex items-center gap-2"><FileStack className="w-3.5 h-3.5" />{t}</span>}
                {t === "Leave"    && <span className="flex items-center gap-2"><CalendarDays className="w-3.5 h-3.5" />{t}</span>}
                {t === "Gratuity" && <span className="flex items-center gap-2"><Award className="w-3.5 h-3.5" />{t}</span>}
                {t === "Salary"   && <span className="flex items-center gap-2"><DollarSign className="w-3.5 h-3.5" />{t}</span>}
                {t === "Pay Slips"&& <span className="flex items-center gap-2"><Receipt className="w-3.5 h-3.5" />{t}</span>}
                {t === "Extra Time" && <span className="flex items-center gap-2"><Timer className="w-3.5 h-3.5" />{t}</span>}
                {t === "Timeline" && <span className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" />{t}</span>}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6">
          {tab === "All" && <EmployeeAllSummary employee={employee} onSwitchTab={setTab} />}
          {tab === "Documents" && <EmployeeDocumentsTab employeeId={id} employeeName={employee.full_name} />}
          {tab === "Leave"     && <EmployeeLeaveTab employeeId={id} />}
          {tab === "Gratuity"  && payrollView.allowed && <EmployeeGratuityTab employee={employee} employeeId={id} />}
          {tab === "Salary"    && payrollView.allowed && <EmployeePayrollProfileTab employeeId={id} employeeName={employee.full_name} readOnly={!payrollEdit.allowed} />}
          {tab === "Pay Slips" && payrollView.allowed && <EmployeePaySlipsTab employeeId={id} />}
          {tab === "Extra Time" && payrollView.allowed && <EmployeeExtraTimeTab employee={employee} employeeId={id} />}
          {tab === "Timeline" && <EmployeeTimelineTab employeeId={id} />}
        </div>
      </motion.div>

      <EmployeeFormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        onSave={handleSave}
        employee={employee}
      />
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-foreground text-right truncate">{value || "—"}</span>
    </div>
  );
}