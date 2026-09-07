import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import {
  Mail, Phone, Briefcase, Calendar, Link2, FileStack, CalendarDays, DollarSign,
  FileText, AlertCircle, Clock, CheckCircle2, ChevronRight, User,
} from "lucide-react";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtMoney(n) {
  if (!n && n !== 0) return "—";
  return `AED ${new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)}`;
}
function initials(name) {
  return name?.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "?";
}

function expiryStatus(dateStr) {
  if (!dateStr) return null;
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0) return "expired";
  if (diff <= 30) return "soon";
  if (diff <= 60) return "warning";
  return "ok";
}
function ExpiryBadge({ date }) {
  const status = expiryStatus(date);
  if (!status) return <span className="text-xs text-muted-foreground">No expiry</span>;
  const cfg = {
    expired: { color: "bg-red-100 text-red-700", Icon: AlertCircle, label: "Expired" },
    soon:    { color: "bg-red-100 text-red-700", Icon: AlertCircle, label: fmtDate(date) },
    warning: { color: "bg-amber-100 text-amber-700", Icon: Clock, label: fmtDate(date) },
    ok:      { color: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2, label: fmtDate(date) },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.color}`}>
      <cfg.Icon className="w-3 h-3" /> {cfg.label}
    </span>
  );
}

function InfoRow({ label, Icon, value, fallback = "—" }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </span>
      <span className="text-sm font-medium text-foreground text-right truncate">{value || fallback}</span>
    </div>
  );
}

function SectionCard({ title, Icon, count, onMore, children }) {
  return (
    <div className="bg-muted/30 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <Icon className="w-3.5 h-3.5" /> {title}
          {count != null && <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-card text-muted-foreground">{count}</span>}
        </h3>
        {onMore && (
          <button onClick={onMore} className="flex items-center gap-0.5 text-xs text-primary hover:underline">
            View all <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

export default function EmployeeAllSummary({ employee, onSwitchTab }) {
  const [docs, setDocs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const currentYear = new Date().getFullYear();

  const load = async () => {
    setLoading(true);
    try {
      const [d, profiles, leaves] = await Promise.all([
        base44.entities.EmployeeDocument.filter({ employee_id: employee.id }),
        base44.entities.EmployeePayrollProfile.filter({ employee_id: employee.id }, "-created_date", 1),
        base44.entities.LeaveRequest.filter({ employee_id: employee.id }, "-start_date", 50),
      ]);
      setDocs(d || []);
      setProfile(Array.isArray(profiles) && profiles.length ? profiles[0] : null);
      setLeaveRequests(leaves || []);
    } catch (e) {
      console.error("summary load error", e);
    }
    setLoading(false);
  };

  useEffect(() => { if (employee?.id) load(); }, [employee?.id]);

  // Leave balance
  const entitlement = profile?.annual_leave_days ?? 30;
  const usedDays = profile?.leave_used_override != null
    ? profile.leave_used_override
    : leaveRequests
        .filter(r => r.status === "approved" && r.start_date && new Date(r.start_date).getFullYear() === currentYear)
        .reduce((sum, r) => sum + (r.total_days || 0), 0);
  const remaining = entitlement - usedDays;

  // Salary breakdown
  const payType = profile?.pay_type || "salary";
  const basic = payType === "hourly" ? 0 : (profile?.basic_salary || 0);
  const components = profile?.components || [];
  const earnings = components.filter(c => c.type === "earning");
  const deductions = components.filter(c => c.type === "deduction");
  const extrasTotal = earnings.reduce((s, c) => s + (c.value || 0), 0);
  const dedTotal = deductions.reduce((s, c) => s + (c.value || 0), 0);
  const gross = basic + extrasTotal - dedTotal;

  // Docs with expiry (show all, highlight expiring)
  const docsByExpiry = [...docs].sort((a, b) => {
    if (!a.expiry_date) return 1;
    if (!b.expiry_date) return -1;
    return new Date(a.expiry_date) - new Date(b.expiry_date);
  });

  if (loading) return <div className="py-10 text-center text-sm text-muted-foreground">Loading summary...</div>;

  return (
    <div className="space-y-4">
      {/* Top: Personal Info + Employment */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SectionCard title="Personal Info" Icon={User}>
          <div className="space-y-3">
            <InfoRow label="Full Name" value={employee.full_name} />
            <InfoRow label="Employee No" value={employee.employee_no} />
            <InfoRow label="IBAN / Bank Account" value={employee.bank_account} />
            <InfoRow label="Email" Icon={Mail} value={employee.email} />
            <InfoRow label="Phone" Icon={Phone} value={employee.phone} />
          </div>
        </SectionCard>
        <SectionCard title="Employment" Icon={Briefcase}>
          <div className="space-y-3">
            <InfoRow label="Role" value={employee.role} />
            <InfoRow label="Department" Icon={Briefcase} value={employee.department} />
            <InfoRow label="Team" value={employee.team_name} />
            <InfoRow label="Status" value={employee.status} />
            <InfoRow label="Hire Date" Icon={Calendar} value={fmtDate(employee.hire_date)} />
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
              <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"><Link2 className="w-3 h-3" /> App User</span>
              {employee.user_id
                ? <span className="text-xs font-medium text-primary truncate">{employee.user_email || employee.user_id}</span>
                : <span className="text-xs text-amber-600 font-medium">Not linked</span>}
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => onSwitchTab?.("Documents")}
          className="bg-card border border-border rounded-xl p-3 text-center hover:border-primary/40 transition-colors">
          <FileStack className="w-4 h-4 mx-auto mb-1 text-primary" />
          <div className="text-xl font-bold text-foreground">{docs.length}</div>
          <div className="text-xs text-muted-foreground">Documents</div>
        </button>
        <button onClick={() => onSwitchTab?.("Leave")}
          className="bg-card border border-border rounded-xl p-3 text-center hover:border-primary/40 transition-colors">
          <CalendarDays className="w-4 h-4 mx-auto mb-1 text-indigo-600" />
          <div className="text-xl font-bold text-foreground">{remaining}<span className="text-xs font-normal text-muted-foreground">/{entitlement}d</span></div>
          <div className="text-xs text-muted-foreground">Leave Left</div>
        </button>
        <button onClick={() => onSwitchTab?.("Salary")}
          className="bg-card border border-border rounded-xl p-3 text-center hover:border-primary/40 transition-colors">
          <DollarSign className="w-4 h-4 mx-auto mb-1 text-emerald-600" />
          <div className="text-xl font-bold text-foreground">{fmtMoney(gross)}</div>
          <div className="text-xs text-muted-foreground">Monthly Gross</div>
        </button>
      </div>

      {/* Documents summary */}
      <SectionCard title="Documents" Icon={FileStack} count={docs.length} onMore={() => onSwitchTab?.("Documents")}>
        {docs.length === 0 ? (
          <p className="text-xs text-muted-foreground italic py-2">No documents on file.</p>
        ) : (
          <div className="space-y-1.5">
            {docsByExpiry.slice(0, 6).map(doc => (
              <div key={doc.id} className="flex items-center gap-2 py-1.5 border-b border-border/30 last:border-0">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{doc.document_type_name || doc.file_name || "Document"}</p>
                  {doc.notes && <p className="text-[10px] text-muted-foreground truncate">{doc.notes}</p>}
                </div>
                <ExpiryBadge date={doc.expiry_date} />
              </div>
            ))}
            {docs.length > 6 && (
              <button onClick={() => onSwitchTab?.("Documents")} className="text-xs text-primary hover:underline pt-1">
                +{docs.length - 6} more documents
              </button>
            )}
          </div>
        )}
      </SectionCard>

      {/* Leave + Salary grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Leave */}
        <SectionCard title={`${currentYear} Leave Balance`} Icon={CalendarDays} onMore={() => onSwitchTab?.("Leave")}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-lg font-bold text-foreground">{entitlement}</p>
              <p className="text-[10px] text-muted-foreground">Entitlement</p>
            </div>
            <div>
              <p className="text-lg font-bold text-blue-600">{usedDays}</p>
              <p className="text-[10px] text-muted-foreground">Used</p>
            </div>
            <div>
              <p className={`text-lg font-bold ${remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>{remaining}</p>
              <p className="text-[10px] text-muted-foreground">Remaining</p>
            </div>
          </div>
          {leaveRequests.filter(r => r.status === "pending").length > 0 && (
            <p className="text-[11px] text-amber-600 mt-2 text-center">
              {leaveRequests.filter(r => r.status === "pending").length} pending request(s)
            </p>
          )}
        </SectionCard>

        {/* Salary */}
        <SectionCard title="Salary Breakdown" Icon={DollarSign} onMore={() => onSwitchTab?.("Salary")}>
          {profile ? (
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Basic {payType === "hourly" && "(hourly)"}</span>
                <span className="font-medium text-foreground">
                  {payType === "hourly" ? `${fmtMoney(profile.hourly_rate || 0)}/hr` : fmtMoney(basic)}
                </span>
              </div>
              {earnings.map((c, i) => (
                <div key={`e${i}`} className="flex items-center justify-between">
                  <span className="text-emerald-700">+ {c.component_name}</span>
                  <span className="font-medium text-emerald-700">{fmtMoney(c.value || 0)}</span>
                </div>
              ))}
              {deductions.map((c, i) => (
                <div key={`d${i}`} className="flex items-center justify-between">
                  <span className="text-red-600">− {c.component_name}</span>
                  <span className="font-medium text-red-600">{fmtMoney(c.value || 0)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1.5 border-t border-border/50">
                <span className="font-semibold text-foreground">Gross / month</span>
                <span className="font-bold text-foreground">{fmtMoney(gross)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic py-2">No payroll profile set up yet.</p>
          )}
        </SectionCard>
      </div>

      {employee.notes && (
        <div className="bg-muted/30 rounded-xl p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Notes</h3>
          <p className="text-sm text-foreground">{employee.notes}</p>
        </div>
      )}
    </div>
  );
}