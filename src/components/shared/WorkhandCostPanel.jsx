import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, Clock, TrendingUp, AlertCircle, Loader2, DollarSign } from "lucide-react";

// Overtime threshold: hours per day beyond which OT rate kicks in
const OT_THRESHOLD_HOURS = 8;
// Default overtime multiplier if no specific rate configured
const DEFAULT_OT_MULTIPLIER = 1.5;

function fmtCurrency(n) {
  if (!n && n !== 0) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtHours(mins) {
  if (!mins) return "0h 0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

/**
 * WorkhandCostPanel
 * Props:
 *   - filterKey: "project_id" | "work_order_id"
 *   - filterId:  the entity's id
 *   - currency:  display currency code (default "AED")
 */
export default function WorkhandCostPanel({ filterKey, filterId, currency = "AED" }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]); // per-employee breakdown
  const [totals, setTotals] = useState({ hours: 0, regularCost: 0, otCost: 0, total: 0 });
  const [missingProfiles, setMissingProfiles] = useState([]);

  useEffect(() => {
    if (!filterId) return;
    loadData();
  }, [filterId, filterKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Fetch time entries for this project/work order
      const timeEntries = await base44.entities.TimeEntry.filter({ [filterKey]: filterId });

      if (!timeEntries || timeEntries.length === 0) {
        setRows([]);
        setTotals({ hours: 0, regularCost: 0, otCost: 0, total: 0 });
        setLoading(false);
        return;
      }

      // Unique employee IDs
      const employeeIds = [...new Set(timeEntries.map(e => e.employee_id).filter(Boolean))];

      // Fetch payroll profiles for those employees in parallel
      const profiles = await Promise.all(
        employeeIds.map(eid =>
          base44.entities.EmployeePayrollProfile.filter({ employee_id: eid })
            .then(res => (res && res.length > 0 ? res[0] : null))
            .catch(() => null)
        )
      );

      const profileMap = {}; // employee_id → profile
      employeeIds.forEach((eid, i) => { profileMap[eid] = profiles[i]; });

      // Group time entries by employee, then by date (to detect overtime per day)
      const byEmployee = {};
      timeEntries.forEach(entry => {
        const eid = entry.employee_id;
        if (!eid) return;
        if (!byEmployee[eid]) byEmployee[eid] = { name: entry.employee_name || eid, entries: [] };
        byEmployee[eid].entries.push(entry);
      });

      const missing = [];
      let totalHours = 0, totalRegularCost = 0, totalOtCost = 0;

      const computedRows = Object.entries(byEmployee).map(([eid, { name, entries }]) => {
        const profile = profileMap[eid];

        // Sum total minutes
        const totalMins = entries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
        const totalHoursEmp = totalMins / 60;

        // Group by calendar date to compute OT per day
        const byDate = {};
        entries.forEach(e => {
          const dateKey = (e.clock_in_time || "").slice(0, 10) || "unknown";
          if (!byDate[dateKey]) byDate[dateKey] = 0;
          byDate[dateKey] += (e.duration_minutes || 0) / 60;
        });

        let regularHours = 0;
        let overtimeHours = 0;
        Object.values(byDate).forEach(dayHours => {
          if (dayHours <= OT_THRESHOLD_HOURS) {
            regularHours += dayHours;
          } else {
            regularHours += OT_THRESHOLD_HOURS;
            overtimeHours += dayHours - OT_THRESHOLD_HOURS;
          }
        });

        if (!profile || !profile.basic_salary) {
          missing.push(name);
          return {
            employeeId: eid,
            name,
            totalMins,
            regularHours,
            overtimeHours,
            hourlyRate: null,
            overtimeRate: null,
            regularCost: null,
            overtimeCost: null,
            totalCost: null,
          };
        }

        // Derive hourly rate from monthly salary (÷ 22 working days ÷ 8 hours)
        const hourlyRate = profile.pay_type === "hourly"
          ? (profile.hourly_rate || 0)
          : (profile.basic_salary || 0) / 22 / 8;

        const overtimeRate = hourlyRate * DEFAULT_OT_MULTIPLIER;
        const regularCost = regularHours * hourlyRate;
        const overtimeCost = overtimeHours * overtimeRate;
        const totalCost = regularCost + overtimeCost;

        totalHours += totalHoursEmp;
        totalRegularCost += regularCost;
        totalOtCost += overtimeCost;

        return {
          employeeId: eid,
          name,
          totalMins,
          regularHours,
          overtimeHours,
          hourlyRate,
          overtimeRate,
          regularCost,
          overtimeCost,
          totalCost,
        };
      });

      setRows(computedRows);
      setMissingProfiles(missing);
      setTotals({
        hours: totalHours,
        regularCost: totalRegularCost,
        otCost: totalOtCost,
        total: totalRegularCost + totalOtCost,
      });
    } catch (err) {
      console.error("WorkhandCostPanel error:", err);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Calculating labour costs...
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="py-12 text-center">
        <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No time entries found for this record.</p>
        <p className="text-xs text-muted-foreground/60 mt-1">Labour costs will appear here once employees clock in.</p>
      </div>
    );
  }

  const knownRows = rows.filter(r => r.totalCost !== null);
  const unknownRows = rows.filter(r => r.totalCost === null);

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Hours", value: fmtHours(Math.round(totals.hours * 60)), icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Regular Pay", value: `${currency} ${fmtCurrency(totals.regularCost)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Overtime Pay", value: `${currency} ${fmtCurrency(totals.otCost)}`, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
          { label: "Total Labour Cost", value: `${currency} ${fmtCurrency(totals.total)}`, icon: Users, color: "text-primary", bg: "bg-primary/10" },
        ].map(card => (
          <div key={card.label} className="bg-card border border-border rounded-xl p-3">
            <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center mb-2`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
            <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Missing profiles warning */}
      {missingProfiles.length > 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold">Missing payroll profiles:</span> {missingProfiles.join(", ")}.
            Set up their payroll profile to include them in cost calculations.
          </p>
        </div>
      )}

      {/* Per-employee breakdown */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Employee Breakdown</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <th className="px-4 py-2.5 text-left">Employee</th>
                <th className="px-4 py-2.5 text-right">Total Hours</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">Regular Hrs</th>
                <th className="px-4 py-2.5 text-right hidden sm:table-cell">OT Hrs</th>
                <th className="px-4 py-2.5 text-right hidden md:table-cell">Hourly Rate</th>
                <th className="px-4 py-2.5 text-right hidden md:table-cell">OT Rate</th>
                <th className="px-4 py-2.5 text-right hidden lg:table-cell">Regular Pay</th>
                <th className="px-4 py-2.5 text-right hidden lg:table-cell">OT Pay</th>
                <th className="px-4 py-2.5 text-right font-bold text-foreground">Total Cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {knownRows.map(r => (
                <tr key={r.employeeId} className="hover:bg-muted/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                        {(r.name || "?")[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmtHours(r.totalMins)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{r.regularHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell">
                    {r.overtimeHours > 0
                      ? <span className="text-amber-600 font-medium">{r.overtimeHours.toFixed(1)}h</span>
                      : <span className="text-muted-foreground">0h</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{currency} {fmtCurrency(r.hourlyRate)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{currency} {fmtCurrency(r.overtimeRate)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700 hidden lg:table-cell">{currency} {fmtCurrency(r.regularCost)}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    {r.overtimeCost > 0
                      ? <span className="text-amber-600">{currency} {fmtCurrency(r.overtimeCost)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">{currency} {fmtCurrency(r.totalCost)}</td>
                </tr>
              ))}

              {unknownRows.map(r => (
                <tr key={r.employeeId} className="hover:bg-muted/20 opacity-60">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                        {(r.name || "?")[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-foreground">{r.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmtHours(r.totalMins)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{r.regularHours.toFixed(1)}h</td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden sm:table-cell">{r.overtimeHours > 0 ? `${r.overtimeHours.toFixed(1)}h` : "0h"}</td>
                  <td colSpan={5} className="px-4 py-3 text-right">
                    <span className="text-xs text-amber-600 italic">No payroll profile — cost not calculated</span>
                  </td>
                </tr>
              ))}

              {/* Totals row */}
              <tr className="bg-muted/30 border-t-2 border-border font-semibold">
                <td className="px-4 py-3 text-foreground">TOTAL</td>
                <td className="px-4 py-3 text-right text-foreground">{fmtHours(Math.round(totals.hours * 60))}</td>
                <td className="px-4 py-3 hidden sm:table-cell" />
                <td className="px-4 py-3 hidden sm:table-cell" />
                <td className="px-4 py-3 hidden md:table-cell" />
                <td className="px-4 py-3 hidden md:table-cell" />
                <td className="px-4 py-3 text-right text-emerald-700 hidden lg:table-cell">{currency} {fmtCurrency(totals.regularCost)}</td>
                <td className="px-4 py-3 text-right text-amber-600 hidden lg:table-cell">{currency} {fmtCurrency(totals.otCost)}</td>
                <td className="px-4 py-3 text-right text-primary text-base">{currency} {fmtCurrency(totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground px-1">
        * Hourly rate derived from monthly salary ÷ 22 working days ÷ 8 hours. Overtime applies after {OT_THRESHOLD_HOURS}h/day at {DEFAULT_OT_MULTIPLIER}× rate.
      </p>
    </div>
  );
}