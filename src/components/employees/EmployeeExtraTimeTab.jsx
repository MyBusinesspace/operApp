import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Clock, ChevronLeft, ChevronRight, Timer, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, parseISO, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import { computeOvertimeForEntries, fmtMins, fmtAED } from "@/lib/overtimeCalc";
import printExtraTimeReport from "./ExtraTimePrint";

export default function EmployeeExtraTimeTab({ employee, employeeId }) {
  const [entries, setEntries] = useState([]);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refMonth, setRefMonth] = useState(new Date());

  const load = async () => {
    setLoading(true);
    try {
      const [comp, sw, profiles, settingsList] = await Promise.all([
        base44.entities.TimeEntry.filter({ employee_id: employeeId, status: "Completed" }, "-clock_in_time", 500),
        base44.entities.TimeEntry.filter({ employee_id: employeeId, status: "Switched" }, "-clock_in_time", 500),
        base44.entities.EmployeePayrollProfile.filter({ employee_id: employeeId }, "-created_date", 1),
        base44.entities.PayrollSettings.list("-created_date", 10),
      ]);
      setEntries([...(comp || []), ...(sw || [])]);
      setProfile(profiles.length > 0 ? profiles[0] : null);
      setSettings(Array.isArray(settingsList) && settingsList.length > 0 ? settingsList[0] : {});
    } catch {
      setEntries([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId]);

  const monthStart = startOfMonth(refMonth);
  const monthEnd = endOfMonth(refMonth);

  const rows = useMemo(() => {
    if (!settings) return [];
    const monthEntries = entries.filter(e => {
      if (!e.clock_in_time) return false;
      const d = new Date(e.clock_in_time);
      return isWithinInterval(d, { start: monthStart, end: monthEnd });
    });
    return computeOvertimeForEntries(monthEntries, settings, profile)
      .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  }, [entries, settings, profile, refMonth]);

  const totals = useMemo(() => {
    let otMins = 0, cost = 0;
    rows.forEach(d => {
      otMins += d.overtimeMins;
      cost += d.overtimeCost;
    });
    const otHours = otMins / 60;
    const avgRate = otHours > 0 ? cost / otHours : 0;
    return { otMins, cost, avgRate, count: rows.length };
  }, [rows]);

  const prevMonth = () => setRefMonth(new Date(refMonth.getFullYear(), refMonth.getMonth() - 1, 1));
  const nextMonth = () => setRefMonth(new Date(refMonth.getFullYear(), refMonth.getMonth() + 1, 1));

  return (
    <div className="space-y-4">
      {/* Header + month nav */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Timer className="w-4 h-4 text-orange-500" />
            Extra Time — {employee?.full_name || "Employee"}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {format(refMonth, "MMMM yyyy")} · {totals.count} time {totals.count === 1 ? "entry" : "entries"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={prevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs font-semibold text-foreground min-w-[7rem] text-center">{format(refMonth, "MMM yyyy")}</span>
          <Button variant="outline" size="sm" className="h-7 w-7 p-0" onClick={nextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 ml-2"
            disabled={loading || rows.length === 0}
            onClick={() => printExtraTimeReport({ employee, profile, rows, totals, refMonth })}
          >
            <Printer className="w-3.5 h-3.5" /> Print
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total OT", value: fmtMins(totals.otMins), accent: true },
          { label: "OT Rate", value: fmtAED(totals.avgRate) + "/h", accent: true },
          { label: "Total Cost", value: fmtAED(totals.cost), accent: true },
          { label: "Entries", value: String(totals.count), accent: false },
        ].map(c => (
          <div key={c.label} className={`rounded-lg border p-3 ${c.accent ? "border-orange-200 bg-orange-50/40" : "border-border bg-muted/30"}`}>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</p>
            <p className={`text-base font-bold leading-tight mt-0.5 ${c.accent ? "text-orange-600" : "text-foreground"}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No overtime for {format(refMonth, "MMMM yyyy")}.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="py-2 px-2 font-semibold uppercase tracking-wider text-muted-foreground">Date</th>
                  <th className="py-2 px-2 font-semibold uppercase tracking-wider text-muted-foreground text-right">Entries</th>
                  <th className="py-2 px-2 font-semibold uppercase tracking-wider text-muted-foreground text-right">Total</th>
                  <th className="py-2 px-2 font-semibold uppercase tracking-wider text-muted-foreground text-right">Regular</th>
                  <th className="py-2 px-2 font-semibold uppercase tracking-wider text-muted-foreground text-right">OT</th>
                  <th className="py-2 px-2 font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                  <th className="py-2 px-2 font-semibold uppercase tracking-wider text-muted-foreground text-right">Rate/h</th>
                  <th className="py-2 px-2 font-semibold uppercase tracking-wider text-muted-foreground text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d.dayKey} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-1.5 px-2 text-foreground whitespace-nowrap font-medium">{format(new Date(d.dayKey + "T12:00:00"), "dd MMM yyyy")}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">{d.entries.length}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">{fmtMins(d.totalMins)}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">{fmtMins(d.regularMins)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold text-orange-600 tabular-nums">{fmtMins(d.overtimeMins)}</td>
                    <td className="py-1.5 px-2 text-muted-foreground capitalize">{d.dayType}</td>
                    <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">{d.otRate.toFixed(1)}</td>
                    <td className="py-1.5 px-2 text-right font-semibold text-orange-600 tabular-nums">{d.overtimeCost.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-amber-50 border-t-2 border-orange-200 font-semibold">
                  <td className="py-2 px-2 text-foreground" colSpan={4}>Total</td>
                  <td className="py-2 px-2 text-right text-orange-700 tabular-nums">{fmtMins(totals.otMins)}</td>
                  <td colSpan={2}></td>
                  <td className="py-2 px-2 text-right text-orange-700 tabular-nums">{fmtAED(totals.cost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}