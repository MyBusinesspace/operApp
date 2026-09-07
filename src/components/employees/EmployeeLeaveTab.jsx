import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Pencil, Check, X, CalendarDays, Clock, UserCheck, UserX, Ban, CalendarCheck, History, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import HistoricalPaymentModal from "./HistoricalPaymentModal";
import VacationYearTracker from "./VacationYearTracker";
import { computeAccruedEntitlement } from "@/lib/leaveEntitlement";

const STATUS_STYLES = {
  approved:  "bg-emerald-100 text-emerald-700",
  pending:   "bg-amber-100 text-amber-700",
  rejected:  "bg-red-100 text-red-600",
  cancelled: "bg-slate-100 text-slate-600",
};

const STATUS_META = {
  approved:  { label: "Approved", desc: "" },
  pending:   { label: "Pending", desc: "Awaiting decision" },
  rejected:  { label: "Rejected", desc: "No payroll effect" },
  cancelled: { label: "Cancelled", desc: "Ignored in payroll" },
};

const LEAVE_TYPE_LABELS = {
  vacation: "Vacation",
  sick: "Sick Leave",
  other: "Other",
  unjustified: "Unjustified Absence",
};

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EmployeeLeaveTab({ employeeId }) {
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState({ entitlement: null, used: null, remaining: null });
  const [saving, setSaving] = useState(false);
  const [payrollSettings, setPayrollSettings] = useState({});
  const [payrollEntries, setPayrollEntries] = useState([]);
  const [historicalPayments, setHistoricalPayments] = useState([]);
  const [showHistorical, setShowHistorical] = useState(false);
  const [employee, setEmployee] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const currentYear = new Date().getFullYear();

  const load = async () => {
    setLoading(true);
    const [profiles, leaveRequests, settingsList, entries, histPayments] = await Promise.all([
      base44.entities.EmployeePayrollProfile.filter({ employee_id: employeeId }, "-created_date", 1),
      base44.entities.LeaveRequest.filter({ employee_id: employeeId }, "-start_date", 50),
      base44.entities.PayrollSettings.list(),
      base44.entities.PayrollEntry.filter({ employee_id: employeeId }, "-created_date", 50),
      base44.entities.HistoricalPayment.filter({ employee_id: employeeId, payment_type: "leave_bonus" }, "-year", 50),
    ]);
    setPayrollSettings(Array.isArray(settingsList) && settingsList[0] ? settingsList[0] : {});
    setPayrollEntries(Array.isArray(entries) ? entries : []);
    setHistoricalPayments(Array.isArray(histPayments) ? histPayments : []);
    const prof = profiles.length > 0 ? profiles[0] : null;
    setProfile(prof);
    try {
      const emp = await base44.entities.Employee.get(employeeId);
      setEmployee(emp || null);
    } catch { setEmployee(null); }
    setRequests(leaveRequests);
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId]);

  // ── Year-aware leave balance ────────────────────────────────────────────
  // Past year   → remaining defaults to 0 (unused leave is forfeited)
  // Current year → prorated accrual (2.5 days per completed month)
  // Future year  → entitlement defaults to 0 (not yet accrued)
  // Any value can be manually overridden per year via yearly_leave_overrides.
  const fullEntitlement = profile?.annual_leave_days ?? 30;
  const yearKey = String(selectedYear);
  const yearOverride = (profile?.yearly_leave_overrides || {})[yearKey] || {};
  // Backward compat: legacy leave_used_override applies to the current year
  const legacyUsedOverride = selectedYear === currentYear ? profile?.leave_used_override : null;

  const autoUsedThisYear = requests
    .filter(r => r.status === "approved" && r.leave_type === "vacation" && r.start_date && new Date(r.start_date).getFullYear() === selectedYear)
    .reduce((sum, r) => sum + (r.total_days || 0), 0);

  const sickDays = requests
    .filter(r => r.status === "approved" && (r.leave_type === "sick" || r.leave_type === "other") && r.start_date && new Date(r.start_date).getFullYear() === selectedYear)
    .reduce((sum, r) => sum + (r.total_days || 0), 0);

  let entitlement, used, remaining, isProrated = false;

  if (selectedYear < currentYear) {
    // Past year — full entitlement, actual used, remaining forfeited (0) by default
    entitlement = yearOverride.entitlement != null ? yearOverride.entitlement : fullEntitlement;
    used = yearOverride.used != null ? yearOverride.used : autoUsedThisYear;
    remaining = yearOverride.remaining != null ? yearOverride.remaining : 0;
  } else if (selectedYear > currentYear) {
    // Future year — nothing accrued yet
    entitlement = yearOverride.entitlement != null ? yearOverride.entitlement : 0;
    used = yearOverride.used != null ? yearOverride.used : 0;
    remaining = yearOverride.remaining != null ? yearOverride.remaining : 0;
  } else {
    // Current year — prorated accrual
    const { rawEntitlement, isProrated: prorated } = computeAccruedEntitlement({
      hireDate: employee?.hire_date,
      annualLeaveDays: fullEntitlement,
      currentYear,
    });
    isProrated = prorated;
    const entOverride = yearOverride.entitlement != null ? yearOverride.entitlement : null;
    const usedOverride = yearOverride.used != null ? yearOverride.used : legacyUsedOverride;
    entitlement = entOverride != null ? entOverride : Math.floor(rawEntitlement);
    used = usedOverride != null ? usedOverride : autoUsedThisYear;
    // Remaining: ceil from raw when auto, else derived from (possibly overridden) entitlement
    remaining = yearOverride.remaining != null
      ? yearOverride.remaining
      : (entOverride != null || usedOverride != null)
        ? Math.max(0, entitlement - used)
        : Math.max(0, Math.ceil(rawEntitlement - used));
  }

  // Annual Leave Bonus payment history — PayrollEntry line items + historical payments
  const leaveBonusHistory = [];
  for (const e of payrollEntries) {
    for (const li of (e.line_items || [])) {
      if (li.component_code === "ALB" || /leave bonus/i.test(li.component_name || "")) {
        leaveBonusHistory.push({
          id: e.id + "_" + (li.component_code || li.component_name),
          source: "payroll",
          pay_period_name: e.pay_period_name,
          amount: li.amount,
          notes: li.notes,
          status: e.status,
          year: null,
        });
      }
    }
  }
  for (const h of historicalPayments) {
    leaveBonusHistory.push({
      id: "hist_" + h.id,
      source: "historical",
      pay_period_name: `Historical · ${h.year}`,
      amount: h.amount,
      notes: h.notes,
      status: "paid",
      year: h.year,
    });
  }
  leaveBonusHistory.sort((a, b) => (b.year || 0) - (a.year || 0));
  const totalLeaveBonusPaid = leaveBonusHistory.reduce((s, h) => s + (h.amount || 0), 0);

  // ── Estimated absence deduction (rejected leave → unpaid days) ──
  const dailyRate = (() => {
    if (!profile || profile.pay_type === "hourly") return 0;
    const wdp = payrollSettings.working_days_per_month || 22;
    const allowances = (profile.components || []).filter(c => c.type === "earning").reduce((s, c) => s + (c.value || 0), 0);
    const totalSalary = (profile.basic_salary || 0) + allowances;
    return wdp > 0 ? totalSalary / wdp : 0;
  })();

  const countLeaveWorkingDays = (startStr, endStr) => {
    if (!startStr || !endStr) return 0;
    const start = new Date(startStr);
    const end = new Date(endStr);
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

  const getPayabilityDesc = (r) => {
    if (r.status === "approved") {
      return r.leave_type === "unjustified" ? "Unjustified · Not Payable" : "Justified · Payable";
    }
    return STATUS_META[r.status]?.desc || "";
  };

  const getEstimatedDeduction = (r) => {
    if (!profile || profile.pay_type === "hourly") return 0;
    if (!(r.status === "approved" && r.leave_type === "unjustified")) return 0;
    const days = countLeaveWorkingDays(r.start_date, r.end_date);
    return Math.round(days * dailyRate * 100) / 100;
  };

  const getPayrollMonth = (r) => {
    const d = new Date(r.end_date || r.start_date);
    return d.toLocaleString("en-US", { month: "long" }) + " " + d.getFullYear();
  };

  const startEdit = () => {
    setEditValues({
      entitlement: yearOverride.entitlement ?? null,
      used: yearOverride.used ?? null,
      remaining: yearOverride.remaining ?? null,
    });
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async () => {
    setSaving(true);
    if (profile) {
      const existing = profile.yearly_leave_overrides || {};
      const updated = {
        ...existing,
        [yearKey]: {
          entitlement: editValues.entitlement === "" || editValues.entitlement == null ? null : Number(editValues.entitlement),
          used: editValues.used === "" || editValues.used == null ? null : Number(editValues.used),
          remaining: editValues.remaining === "" || editValues.remaining == null ? null : Number(editValues.remaining),
        },
      };
      await base44.entities.EmployeePayrollProfile.update(profile.id, {
        yearly_leave_overrides: updated,
      });
    }
    setSaving(false);
    setEditing(false);
    load();
  };

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Leave Balance Card */}
      <div className="bg-muted/30 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <CalendarDays className="w-3.5 h-3.5 inline mr-1.5" />
              Leave Balance
            </h3>
            {/* Year selector */}
            <div className="flex items-center gap-1 ml-2">
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditing(false); setSelectedYear(y => y - 1); }}>
                <ChevronLeft className="w-3.5 h-3.5" />
              </Button>
              <span className="text-sm font-semibold text-foreground tabular-nums min-w-[3rem] text-center">{selectedYear}</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setEditing(false); setSelectedYear(y => y + 1); }}>
                <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
            {selectedYear < currentYear && <Badge variant="outline" className="text-[9px] text-slate-500 border-slate-300">past year</Badge>}
            {selectedYear > currentYear && <Badge variant="outline" className="text-[9px] text-slate-500 border-slate-300">future year</Badge>}
          </div>
          {editing ? (
            <div className="flex items-center gap-1.5">
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={cancelEdit} disabled={saving}>
                <X className="w-3.5 h-3.5" />
              </Button>
              <Button variant="default" size="sm" className="h-7 w-7 p-0" onClick={saveEdit} disabled={saving}>
                {saving ? <span className="block w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={startEdit}>
              <Pencil className="w-3 h-3" /> Edit Balance
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Override the {selectedYear} balance. Leave a field blank to use the default ({selectedYear < currentYear ? "past year" : selectedYear > currentYear ? "future year" : "prorated"}).
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Entitlement</label>
                <Input
                  type="number"
                  value={editValues.entitlement ?? ""}
                  onChange={e => setEditValues(prev => ({ ...prev, entitlement: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                  placeholder={String(selectedYear < currentYear ? fullEntitlement : selectedYear > currentYear ? 0 : entitlement)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Used</label>
                <Input
                  type="number"
                  value={editValues.used ?? ""}
                  onChange={e => setEditValues(prev => ({ ...prev, used: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                  placeholder={String(selectedYear === currentYear ? autoUsedThisYear : selectedYear < currentYear ? autoUsedThisYear : 0)}
                  className="h-9"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Remaining</label>
                <Input
                  type="number"
                  value={editValues.remaining ?? ""}
                  onChange={e => setEditValues(prev => ({ ...prev, remaining: e.target.value === "" ? null : parseFloat(e.target.value) }))}
                  placeholder={String(selectedYear < currentYear ? 0 : selectedYear > currentYear ? 0 : Math.max(0, entitlement - used))}
                  className="h-9"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-foreground">{entitlement}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Entitlement{isProrated && <span className="text-amber-600 font-medium block">(prorated)</span>}
                {yearOverride.entitlement != null && <span className="text-amber-600 font-medium block">(manual)</span>}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{used}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Used {yearOverride.used != null && <span className="text-amber-600 font-medium">(manual)</span>}
              </p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-orange-600">{sickDays}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Sick Days Taken</p>
            </div>
            <div className="text-center">
              <p className={`text-2xl font-bold ${remaining < 0 ? "text-red-600" : "text-emerald-600"}`}>{remaining}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Remaining{yearOverride.remaining != null && <span className="text-amber-600 font-medium block">(manual)</span>}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Vacation Year Tracker — one row per year since hire date */}
      <VacationYearTracker
        employee={employee}
        profile={profile}
        requests={requests}
        leaveBonusHistory={leaveBonusHistory}
        currentYear={currentYear}
        onUpdated={load}
      />

      {/* Leave History */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          <Clock className="w-3.5 h-3.5 inline mr-1.5" />
          Leave History
        </h3>

        {requests.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No leave records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Type</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Dates</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Days</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Reason</th>
                  <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Deduction</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Reviewed By</th>
                </tr>
              </thead>
              <tbody>
                {requests.map(r => (
                  <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3">{LEAVE_TYPE_LABELS[r.leave_type] || r.leave_type}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</td>
                    <td className="py-2.5 px-3 text-center font-medium">{r.total_days || 0}d</td>
                    <td className="py-2.5 px-3 max-w-[200px] truncate text-muted-foreground">{r.reason || "—"}</td>
                    <td className="py-2.5 px-3 text-center">
                      <Badge className={`text-[10px] font-semibold px-2 py-0.5 ${STATUS_STYLES[r.status] || ""}`}>
                        {STATUS_META[r.status]?.label || r.status}
                      </Badge>
                      {getPayabilityDesc(r) && (
                        <p className="text-[9px] text-muted-foreground italic mt-0.5">{getPayabilityDesc(r)}</p>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {r.status === "approved" && r.leave_type === "unjustified" ? (
                        <div className="flex flex-col items-end">
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-red-50 text-red-700 border border-red-200 font-medium">
                            ≈ {getEstimatedDeduction(r).toLocaleString()} AED
                          </span>
                          <span className="text-[9px] text-muted-foreground mt-0.5">{getPayrollMonth(r)} payroll</span>
                        </div>
                      ) : r.status === "approved" ? (
                        <span className="text-xs text-emerald-600">Paid</span>
                      ) : r.status === "rejected" ? (
                        <span className="text-xs text-muted-foreground">No effect</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground">
                      {r.approved_by_name || "—"}
                      {r.admin_notes && <p className="text-xs text-muted-foreground mt-0.5 italic">{r.admin_notes}</p>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Annual Leave Bonus History */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <CalendarCheck className="w-3.5 h-3.5 inline mr-1.5" />
            Annual Leave Bonus History
          </h3>
          <Button variant="default" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setShowHistorical(true)}>
            <History className="w-3.5 h-3.5" /> Record Historical Payment
          </Button>
        </div>
        {leaveBonusHistory.length === 0 ? (
          <div className="py-8 text-center">
            <CalendarCheck className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No annual leave bonus paid yet.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 inline-flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Total paid:</span>
              <span className="font-bold text-emerald-600">{totalLeaveBonusPaid.toLocaleString("en-AE", { maximumFractionDigits: 2 })} AED</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Period / Year</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-muted-foreground">Amount</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">Notes</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveBonusHistory.map(h => (
                    <tr key={h.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3 font-medium">
                        {h.pay_period_name}
                        {h.source === "historical" && (
                          <Badge variant="outline" className="ml-2 text-[9px] text-amber-600 border-amber-300">historical</Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-emerald-600">{(h.amount || 0).toLocaleString("en-AE", { maximumFractionDigits: 2 })} AED</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{h.notes || "—"}</td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant="secondary" className="text-[10px] capitalize">{h.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <HistoricalPaymentModal
        open={showHistorical}
        employeeId={employeeId}
        employeeName={employee?.full_name}
        paymentType="leave_bonus"
        onClose={() => setShowHistorical(false)}
        onSaved={load}
      />
    </div>
  );
}