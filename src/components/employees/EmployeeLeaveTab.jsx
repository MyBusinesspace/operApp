import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { formatDateValue, parseDateOnly } from "@/lib/dateOnly";
import { Pencil, Check, X, CalendarDays, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
  return formatDateValue(d);
}

export default function EmployeeLeaveTab({ employeeId }) {
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingYear, setEditingYear] = useState(null);
  const [rowEditValues, setRowEditValues] = useState({ entitlement: null, used: null, remaining: null });
  const [editingAccum, setEditingAccum] = useState(false);
  const [accumValue, setAccumValue] = useState(null);
  const [saving, setSaving] = useState(false);
  const [payrollSettings, setPayrollSettings] = useState({});
  const [employee, setEmployee] = useState(null);

  const currentYear = new Date().getFullYear();

  const load = async () => {
    setLoading(true);
    const [profiles, leaveRequests, settingsList] = await Promise.all([
      base44.entities.EmployeePayrollProfile.filter({ employee_id: employeeId }, "-created_date", 1),
      base44.entities.LeaveRequest.filter({ employee_id: employeeId }, "-start_date", 50),
      base44.entities.PayrollSettings.list(),
    ]);
    setPayrollSettings(Array.isArray(settingsList) && settingsList[0] ? settingsList[0] : {});
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
  // Past year   → used defaults to entitlement (all leave assumed used, remaining 0)
  // Current year → prorated accrual (2.5 days per completed month)
  // Future year  → no entitlement accrues before the year begins
  // Any value can be manually overridden per year via yearly_leave_overrides.
  const fullEntitlement = profile?.annual_leave_days ?? 30;

  // Count approved vacation days that fall within a specific calendar year
  // (cross-year vacations are split: only days inside `year` are counted)
  const countVacationDaysInYear = (year) =>
    requests
      .filter(r => r.status === "approved" && r.leave_type === "vacation" && r.start_date)
      .reduce((sum, r) => {
        if (!r.end_date) return parseDateOnly(r.start_date).getFullYear() === year ? sum + (r.total_days || 0) : sum;
        const cur = parseDateOnly(r.start_date);
        const end = parseDateOnly(r.end_date);
        let days = 0;
        while (cur <= end) { if (cur.getFullYear() === year) days++; cur.setDate(cur.getDate() + 1); }
        return sum + days;
      }, 0);

  // Compute the full balance for any year (used for the 5-year table)
  const computeYearBalance = (year) => {
    const yOverride = (profile?.yearly_leave_overrides || {})[String(year)] || {};
    const legacyUsed = year === currentYear ? profile?.leave_used_override : null;
    const usedInYear = countVacationDaysInYear(year);
    const sickInYear = requests
      .filter(r => r.status === "approved" && (r.leave_type === "sick" || r.leave_type === "other") && r.start_date && parseDateOnly(r.start_date).getFullYear() === year)
      .reduce((sum, r) => sum + (r.total_days || 0), 0);

    let ent, used, rem, isPror = false, months = 0, usedByYr = {}, beforeHire = false;

    const hireYear = employee?.hire_date ? parseDateOnly(employee.hire_date).getFullYear() : null;
    beforeHire = hireYear == null || hireYear > year;

    if (year < currentYear) {
      if (beforeHire) {
        ent = yOverride.entitlement != null ? yOverride.entitlement : 0;
      } else if (hireYear === year) {
        const { rawEntitlement, isProrated: prorated, months: m } = computeAccruedEntitlement({
          hireDate: employee?.hire_date, annualLeaveDays: fullEntitlement, currentYear: year, today: new Date(year, 11, 31),
        });
        months = m; isPror = prorated;
        ent = yOverride.entitlement != null ? yOverride.entitlement : Math.floor(rawEntitlement);
      } else {
        ent = yOverride.entitlement != null ? yOverride.entitlement : fullEntitlement;
      }
      used = yOverride.used != null ? yOverride.used : ent;
      rem = yOverride.remaining != null ? yOverride.remaining : Math.max(0, ent - used);
    } else if (year > currentYear) {
      ent = yOverride.entitlement != null ? yOverride.entitlement : 0;
      used = yOverride.used != null ? yOverride.used : usedInYear;
      rem = yOverride.remaining != null ? yOverride.remaining : Math.max(0, ent - used);
    } else {
      const { rawEntitlement, isProrated: prorated, months: m } = computeAccruedEntitlement({
        hireDate: employee?.hire_date, annualLeaveDays: fullEntitlement, currentYear,
      });
      isPror = prorated; months = m;
      const entOverride = yOverride.entitlement != null ? yOverride.entitlement : null;
      const usedOverride = yOverride.used != null ? yOverride.used : legacyUsed;
      ent = entOverride != null ? entOverride : Math.floor(rawEntitlement);
      used = usedOverride != null ? usedOverride : usedInYear;
      rem = yOverride.remaining != null ? yOverride.remaining : Math.max(0, ent - used);
      // Breakdown: how many of the used vacation days fall in each calendar year
      requests
        .filter(r => r.status === "approved" && r.leave_type === "vacation" && r.start_date && parseDateOnly(r.start_date).getFullYear() === year)
        .forEach(r => {
          if (!r.end_date) { usedByYr[year] = (usedByYr[year] || 0) + (r.total_days || 0); return; }
          const cur = parseDateOnly(r.start_date);
          const end = parseDateOnly(r.end_date);
          while (cur <= end) { const y = cur.getFullYear(); usedByYr[y] = (usedByYr[y] || 0) + 1; cur.setDate(cur.getDate() + 1); }
        });
    }

    return { entitlement: ent, used, remaining: rem, sickDays: sickInYear, isProrated: isPror, accruedMonths: months, usedDaysByYear: usedByYr, override: yOverride, autoUsed: usedInYear, beforeHire };
  };

  // 5-year window: last 3 + current + next
  const tableYears = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
  const tableBalances = tableYears.map(y => ({ year: y, ...computeYearBalance(y) }));

  // Current year balance (for the footer note)
  const currentYearBalance = tableBalances.find(b => b.year === currentYear) || {};

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
    const start = parseDateOnly(startStr);
    const end = parseDateOnly(endStr);
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
    const d = parseDateOnly(r.end_date || r.start_date);
    return d.toLocaleString("en-US", { month: "long" }) + " " + d.getFullYear();
  };

  const startRowEdit = (year, override) => {
    setRowEditValues({
      entitlement: override.entitlement ?? null,
      used: override.used ?? null,
      remaining: override.remaining ?? null,
    });
    setEditingYear(year);
  };

  const cancelRowEdit = () => setEditingYear(null);

  const saveRowEdit = async (year) => {
    setSaving(true);
    if (profile) {
      const existing = profile.yearly_leave_overrides || {};
      const updated = {
        ...existing,
        [String(year)]: {
          entitlement: rowEditValues.entitlement === "" || rowEditValues.entitlement == null ? null : Number(rowEditValues.entitlement),
          used: rowEditValues.used === "" || rowEditValues.used == null ? null : Number(rowEditValues.used),
          remaining: rowEditValues.remaining === "" || rowEditValues.remaining == null ? null : Number(rowEditValues.remaining),
        },
      };
      await base44.entities.EmployeePayrollProfile.update(profile.id, {
        yearly_leave_overrides: updated,
      });
    }
    setSaving(false);
    setEditingYear(null);
    load();
  };

  // ── Accumulated total across the 5-year window ──
  const totals = tableBalances.reduce(
    (acc, b) => ({
      entitlement: acc.entitlement + (b.entitlement || 0),
      used: acc.used + (b.used || 0),
      sick: acc.sickDays + (b.sickDays || 0),
      remaining: acc.remaining + (b.remaining || 0),
    }),
    { entitlement: 0, used: 0, sick: 0, remaining: 0 }
  );
  const accumulatedOverride = profile?.accumulated_leave_override;
  const accumulatedValue = accumulatedOverride != null ? accumulatedOverride : totals.remaining;

  const startEditAccum = () => {
    setAccumValue(accumulatedOverride != null ? accumulatedOverride : "");
    setEditingAccum(true);
  };

  const saveAccum = async () => {
    setSaving(true);
    if (profile) {
      await base44.entities.EmployeePayrollProfile.update(profile.id, {
        accumulated_leave_override: accumValue === "" || accumValue == null ? null : Number(accumValue),
      });
    }
    setSaving(false);
    setEditingAccum(false);
    load();
  };

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Leave Balance Card */}
      <div className="bg-muted/30 rounded-xl p-5">
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <CalendarDays className="w-3.5 h-3.5 inline mr-1.5" />
            Leave Balance
          </h3>
        </div>

        <div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-1.5 px-2 text-[11px] font-medium text-muted-foreground">Year</th>
                <th className="text-right py-1.5 px-2 text-[11px] font-medium text-muted-foreground">Entitlement</th>
                <th className="text-right py-1.5 px-2 text-[11px] font-medium text-muted-foreground">Used</th>
                <th className="text-right py-1.5 px-2 text-[11px] font-medium text-muted-foreground">Sick</th>
                <th className="text-right py-1.5 px-2 text-[11px] font-medium text-muted-foreground">Remaining</th>
                <th className="w-14 py-1.5 px-1"></th>
              </tr>
            </thead>
            <tbody>
              {tableBalances.map(({ year, entitlement: e, used: u, remaining: rm, sickDays: sd, isProrated: pr, override: ov, accruedMonths: mo, usedDaysByYear: uby, beforeHire: bh }) => {
                const isCur = year === currentYear;
                const isEditing = editingYear === year;
                return (
                  <tr
                    key={year}
                    className={`border-b border-border/30 transition-colors ${isCur ? "bg-primary/5" : "hover:bg-muted/40"}`}
                  >
                    <td className="py-1.5 px-2 font-medium tabular-nums">
                      <span className={isCur ? "text-primary font-semibold" : ""}>{year}</span>
                      {isCur && <span className="ml-1.5 text-[9px] text-primary">●</span>}
                      {bh && !ov.entitlement && <span className="block text-[9px] text-muted-foreground/50">pre-hire</span>}
                    </td>
                    {isEditing ? (
                      <>
                        <td className="py-1 px-2 text-right">
                          <Input
                            type="number"
                            value={rowEditValues.entitlement ?? ""}
                            onChange={ev => setRowEditValues(prev => ({ ...prev, entitlement: ev.target.value === "" ? null : parseFloat(ev.target.value) }))}
                            placeholder={String(e)}
                            className="h-7 w-16 text-right text-sm"
                          />
                        </td>
                        <td className="py-1 px-2 text-right">
                          <Input
                            type="number"
                            value={rowEditValues.used ?? ""}
                            onChange={ev => setRowEditValues(prev => ({ ...prev, used: ev.target.value === "" ? null : parseFloat(ev.target.value) }))}
                            placeholder={String(u)}
                            className="h-7 w-16 text-right text-sm"
                          />
                        </td>
                        <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${bh ? "text-muted-foreground/40" : "text-orange-600"}`}>{sd}</td>
                        <td className="py-1 px-2 text-right">
                          <Input
                            type="number"
                            value={rowEditValues.remaining ?? ""}
                            onChange={ev => setRowEditValues(prev => ({ ...prev, remaining: ev.target.value === "" ? null : parseFloat(ev.target.value) }))}
                            placeholder={String(rm)}
                            className="h-7 w-16 text-right text-sm"
                          />
                        </td>
                        <td className="py-1 px-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={cancelRowEdit} disabled={saving}>
                              <X className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="default" size="sm" className="h-7 w-7 p-0" onClick={() => saveRowEdit(year)} disabled={saving}>
                              {saving ? <span className="block w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </Button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          <span className={`font-semibold ${bh && !ov.entitlement ? "text-muted-foreground/40" : "text-foreground"}`}>{e}</span>
                          {pr && !ov.entitlement && (
                            <span className="block text-[9px] text-amber-600">prorated · {(fullEntitlement / 12).toFixed(1)}×{mo}</span>
                          )}
                          {ov.entitlement != null && <span className="block text-[9px] text-amber-600">manual</span>}
                        </td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          <span className={`font-semibold ${bh && !ov.used ? "text-muted-foreground/40" : "text-blue-600"}`}>{u}</span>
                          {Object.keys(uby).length > 1 && !ov.used && (
                            <span className="block text-[9px] text-muted-foreground/70">
                              {Object.entries(uby).sort().map(([y, d]) => `${d}d ${y}`).join(' · ')}
                            </span>
                          )}
                          {ov.used != null && <span className="block text-[9px] text-amber-600">manual</span>}
                        </td>
                        <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${bh ? "text-muted-foreground/40" : "text-orange-600"}`}>{sd}</td>
                        <td className="py-1.5 px-2 text-right tabular-nums">
                          <span className={`font-semibold ${bh && !ov.remaining ? "text-muted-foreground/40" : rm < 0 ? "text-red-600" : "text-emerald-600"}`}>{rm}</span>
                          {ov.remaining != null && <span className="block text-[9px] text-amber-600">manual</span>}
                        </td>
                        <td className="py-1.5 px-1 text-right">
                          <button
                            onClick={() => startRowEdit(year, ov)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            title="Edit this year"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
              {/* Total / Accumulated row */}
              <tr className="border-t-2 border-border bg-muted/20">
                <td className="py-2 px-2 font-bold text-xs uppercase tracking-wider text-muted-foreground">
                  Total
                  {accumulatedOverride != null && <span className="block text-[9px] text-amber-600">manual</span>}
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-bold text-foreground">{totals.entitlement}</td>
                <td className="py-2 px-2 text-right tabular-nums font-bold text-blue-600">{totals.used}</td>
                <td className="py-2 px-2 text-right tabular-nums font-bold text-orange-600">{totals.sick}</td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {editingAccum ? (
                    <div className="flex items-center justify-end gap-1">
                      <Input
                        type="number"
                        value={accumValue ?? ""}
                        onChange={e => setAccumValue(e.target.value === "" ? null : parseFloat(e.target.value))}
                        placeholder={String(totals.remaining)}
                        className="h-7 w-16 text-right text-sm"
                      />
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingAccum(false)} disabled={saving}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="default" size="sm" className="h-7 w-7 p-0" onClick={saveAccum} disabled={saving}>
                        {saving ? <span className="block w-3.5 h-3.5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-end gap-1.5 group">
                      <span className={`font-bold ${accumulatedValue < 0 ? "text-red-600" : "text-emerald-600"}`}>{accumulatedValue}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); startEditAccum(); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
                        title="Edit accumulated carry-over"
                      >
                        <Pencil className="w-3 h-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </td>
                <td className="py-2 px-1"></td>
              </tr>
            </tbody>
          </table>
          {currentYearBalance.isProrated && !(currentYearBalance.override || {}).entitlement && (
            <p className="text-[10px] text-muted-foreground/70 mt-2 text-center">
              Current year entitlement: {(fullEntitlement / 12).toFixed(1)} d/mo × {currentYearBalance.accruedMonths} completed months = {currentYearBalance.entitlement} days
            </p>
          )}
          <p className="text-[10px] text-muted-foreground/60 mt-1.5 text-center">
            Past years default to fully used. Each row and the accumulated total are editable — by law, unused leave is forfeited unless manually carried over.
          </p>
        </div>
      </div>

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
    </div>
  );
}