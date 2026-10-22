import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Users, Clock, TrendingUp, AlertCircle, Loader2, DollarSign } from "lucide-react";
import { computeLabourCost, fetchProfiles, loadLabourContext, loadAttendanceScope } from "@/lib/labourCost";

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
 *   - filterKey: "project_id" | "work_order_id" | "task_id"
 *   - filterId:  the entity's id
 *
 * The panel groups labour cost by the payroll currency stamped on each TimeEntry,
 * so entries in different currencies are never summed together. When all entries
 * share one currency the display is identical to the old single-currency view.
 */
export default function WorkhandCostPanel({ filterKey, filterId }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [byCurrency, setByCurrency] = useState({});
  const [totalHours, setTotalHours] = useState(0);
  const [payrollSettings, setPayrollSettings] = useState(null);
  const [missingProfiles, setMissingProfiles] = useState([]);

  useEffect(() => {
    if (!filterId) return;
    loadData();
  }, [filterId, filterKey]);

  const loadData = async () => {
    setLoading(true);
    try {
      const fieldEntries = await base44.entities.TimeEntry.filter({ [filterKey]: filterId });
      const timeEntries = [...(fieldEntries || []), ...(await loadAttendanceScope(filterKey, filterId))];

      if (!timeEntries || timeEntries.length === 0) {
        setRows([]);
        setMissingProfiles([]);
        setByCurrency({});
        setTotalHours(0);
        setLoading(false);
        return;
      }

      const employeeIds = [...new Set(timeEntries.map(e => e.employee_id).filter(Boolean))];
      const profileMap = await fetchProfiles(employeeIds);
      const ctx = await loadLabourContext(timeEntries);
      const { rows, totals, missingProfiles, byCurrency } = computeLabourCost(timeEntries, profileMap, ctx);
      setPayrollSettings(ctx.settings);

      setRows(rows);
      setMissingProfiles(missingProfiles);
      setByCurrency(byCurrency || {});
      setTotalHours(totals.hours);
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
  const currencyCodes = Object.keys(byCurrency);
  const isMultiCurrency = currencyCodes.length > 1;

  return (
    <div className="space-y-4">
      {/* Summary cards — one set per currency when multiple, else single set */}
      {currencyCodes.length === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-card border border-border rounded-xl p-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center mb-2">
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-lg font-bold text-blue-600">{fmtHours(Math.round(totalHours * 60))}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total Hours</p>
          </div>
        </div>
      ) : (
        currencyCodes.map(cur => {
          const c = byCurrency[cur];
          return (
            <div key={cur}>
              {isMultiCurrency && (
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {cur} Labour Cost
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Hours", value: fmtHours(Math.round(c.hours * 60)), icon: Clock, color: "text-blue-600", bg: "bg-blue-50" },
                  { label: "Regular Pay", value: `${cur} ${fmtCurrency(c.regularCost)}`, icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50" },
                  { label: "Overtime Pay", value: `${cur} ${fmtCurrency(c.otCost)}`, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50" },
                  { label: "Total Labour Cost", value: `${cur} ${fmtCurrency(c.total)}`, icon: Users, color: "text-primary", bg: "bg-primary/10" },
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
            </div>
          );
        })
      )}

      {isMultiCurrency && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            <span className="font-semibold">Multiple currencies:</span> Time entries span {currencyCodes.join(", ")}. Costs are shown per currency and are never combined.
          </p>
        </div>
      )}

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
                  <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{r.currency} {fmtCurrency(r.hourlyRate)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground hidden md:table-cell">{r.currency} {fmtCurrency(r.overtimeRate)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700 hidden lg:table-cell">{r.currency} {fmtCurrency(r.regularCost)}</td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    {r.overtimeCost > 0
                      ? <span className="text-amber-600">{r.currency} {fmtCurrency(r.overtimeCost)}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-foreground">{r.currency} {fmtCurrency(r.totalCost)}</td>
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

              {/* Totals row — per currency when multi-currency, single row otherwise */}
              {isMultiCurrency ? (
                currencyCodes.map(cur => {
                  const c = byCurrency[cur];
                  return (
                    <tr key={cur} className="bg-muted/30 border-t-2 border-border font-semibold">
                      <td className="px-4 py-3 text-foreground">TOTAL ({cur})</td>
                      <td className="px-4 py-3 text-right text-foreground">{fmtHours(Math.round(c.hours * 60))}</td>
                      <td className="px-4 py-3 hidden sm:table-cell" />
                      <td className="px-4 py-3 hidden sm:table-cell" />
                      <td className="px-4 py-3 hidden md:table-cell" />
                      <td className="px-4 py-3 hidden md:table-cell" />
                      <td className="px-4 py-3 text-right text-emerald-700 hidden lg:table-cell">{cur} {fmtCurrency(c.regularCost)}</td>
                      <td className="px-4 py-3 text-right text-amber-600 hidden lg:table-cell">{cur} {fmtCurrency(c.otCost)}</td>
                      <td className="px-4 py-3 text-right text-primary text-base">{cur} {fmtCurrency(c.total)}</td>
                    </tr>
                  );
                })
              ) : (
                <tr className="bg-muted/30 border-t-2 border-border font-semibold">
                  <td className="px-4 py-3 text-foreground">TOTAL</td>
                  <td className="px-4 py-3 text-right text-foreground">{fmtHours(Math.round(totalHours * 60))}</td>
                  <td className="px-4 py-3 hidden sm:table-cell" />
                  <td className="px-4 py-3 hidden sm:table-cell" />
                  <td className="px-4 py-3 hidden md:table-cell" />
                  <td className="px-4 py-3 hidden md:table-cell" />
                  <td className="px-4 py-3 text-right text-emerald-700 hidden lg:table-cell">{currencyCodes[0]} {fmtCurrency(byCurrency[currencyCodes[0]]?.regularCost)}</td>
                  <td className="px-4 py-3 text-right text-amber-600 hidden lg:table-cell">{currencyCodes[0]} {fmtCurrency(byCurrency[currencyCodes[0]]?.otCost)}</td>
                  <td className="px-4 py-3 text-right text-primary text-base">{currencyCodes[0]} {fmtCurrency(byCurrency[currencyCodes[0]]?.total)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-muted-foreground px-1">
        * Hourly rate = monthly salary / {payrollSettings?.working_days_per_month || 22} working days / {payrollSettings?.working_hours_per_day || 8} hours. Overtime is calculated on the employee's whole day (all tasks) above {payrollSettings?.overtime_threshold_daily_h || 8}h, using the overtime rates saved in Payroll settings, and each task carries its share. Currency is stamped per time entry from the payroll currency at clock-in.
      </p>
    </div>
  );
}