import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { ArrowLeft, Clock, Download, FileText, TrendingUp, X, Eye, Pencil, AlertTriangle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import OvertimeEntryEditModal from "@/components/reports/OvertimeEntryEditModal";
import OvertimeDrillDownModal from "@/components/reports/OvertimeDrillDownModal";
import {
  format, parseISO, isSunday, startOfMonth, endOfMonth,
  eachDayOfInterval, eachWeekOfInterval, eachMonthOfInterval,
  startOfWeek, endOfWeek, addMonths, subMonths, startOfWeek as soW
} from "date-fns";

const VIEW_MODES = [
  { key: "day", label: "Daily", max: 31 },
  { key: "week", label: "Weekly", max: 8 },
  { key: "month", label: "Monthly", max: 12 },
];

function fmt(mins) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h${m > 0 ? ` ${m}m` : ""}`;
}
function fmtAED(val) {
  if (!val) return "—";
  return `${val.toFixed(0)} AED`;
}

function dayTypeFor(dayKey, holidays) {
  if (holidays.includes(dayKey)) return "holiday";
  const d = new Date(dayKey + "T12:00:00");
  return isSunday(d) ? "sunday" : "regular";
}

function otRateFor(dayType, settings, baseHourly) {
  if (dayType === "holiday") {
    const fixed = parseFloat(settings.overtime_fixed_rate_holiday);
    return !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings.overtime_multiplier_holiday || 2.0);
  } else if (dayType === "sunday") {
    const fixed = parseFloat(settings.overtime_fixed_rate_sunday);
    return !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings.overtime_multiplier_sunday || 2.0);
  } else {
    const fixed = parseFloat(settings.overtime_fixed_rate);
    return !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (settings.overtime_multiplier || 1.5);
  }
}

function dayColumnKey(dayKey, viewMode) {
  const d = new Date(dayKey + "T12:00:00");
  if (viewMode === "day") return format(d, "yyyy-MM-dd");
  if (viewMode === "week") return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-'W'ww");
  return format(d, "yyyy-MM");
}

// Build column keys based on view mode and a reference date range
function buildColumns(viewMode, refDate) {
  const now = refDate || new Date();
  if (viewMode === "day") {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return eachDayOfInterval({ start, end }).map(d => ({
      key: format(d, "yyyy-MM-dd"),
      label: format(d, "d"),
      sublabel: format(d, "EEE"),
      isWeekend: isSunday(d) || d.getDay() === 6,
    }));
  }
  if (viewMode === "week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const cols = [];
    for (let i = 0; i < 8; i++) {
      const ws = new Date(start);
      ws.setDate(start.getDate() + i * 7);
      const we = endOfWeek(ws, { weekStartsOn: 1 });
      cols.push({
        key: format(ws, "yyyy-'W'ww"),
        label: `${format(ws, "MMM d")}`,
        sublabel: `– ${format(we, "d")}`,
        start: ws,
        end: we,
      });
    }
    return cols;
  }
  // month
  const cols = [];
  for (let i = 0; i < 12; i++) {
    const m = addMonths(startOfMonth(new Date(now.getFullYear(), 0, 1)), i);
    cols.push({
      key: format(m, "yyyy-MM"),
      label: format(m, "MMM"),
      sublabel: format(m, "yyyy"),
    });
  }
  return cols;
}

function entryColumnKey(entry, viewMode) {
  const d = new Date(entry.clock_in_time);
  if (viewMode === "day") return format(d, "yyyy-MM-dd");
  if (viewMode === "week") return format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-'W'ww");
  return format(d, "yyyy-MM");
}

export default function OvertimeReport() {
  const [entries, setEntries] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState("day");
  const [refDate, setRefDate] = useState(new Date());
  const [showCost, setShowCost] = useState(false);
  const [drillDown, setDrillDown] = useState(null); // { employeeName, colKey }
  const [editingEntry, setEditingEntry] = useState(null);
  const [otThresholdHours, setOtThresholdHours] = useState(4); // flag cells above this
  const [searchQuery, setSearchQuery] = useState("");
  const [groupByTeam, setGroupByTeam] = useState(false);
  const [employeeRecords, setEmployeeRecords] = useState([]);

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      // A switch performs a clock-out, so Switched entries are clocked-out too
      // High limit needed — default filter limit misses entries, breaking OT calc
      base44.entities.TimeEntry.filter({ status: "Completed" }, "-clock_in_time", 5000),
      base44.entities.TimeEntry.filter({ status: "Switched" }, "-clock_in_time", 5000),
      base44.entities.EmployeePayrollProfile.list("-created_date", 500),
      base44.entities.PayrollSettings.list("-created_date", 10),
      base44.entities.Employee.list("-created_date", 500),
    ]).then(([comp, sw, pr, ps, emps]) => {
      setEntries([...(comp || []), ...(sw || [])]);
      setProfiles(pr || []);
      setSettings(ps[0] || {});
      setEmployeeRecords(emps || []);
      setLoading(false);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const profileMap = useMemo(() => {
    const map = {};
    profiles.forEach(p => { map[p.employee_id] = p; });
    return map;
  }, [profiles]);

  // Per-day OT: group entries by employee + day, compute OT from daily total hours.
  // Overtime is based on TOTAL hours worked in a day vs the threshold, not per-entry.
  const dayOtMap = useMemo(() => {
    if (!settings) return {};
    const thresholdMins = (settings.overtime_threshold_daily_h || 8) * 60;
    const holidays = settings.public_holidays || [];
    const map = {}; // empId → { dayKey → dayObj }

    entries.forEach(entry => {
      if (!entry.clock_out_time || !entry.clock_in_time || !entry.employee_id) return;
      const empId = entry.employee_id;
      const d = new Date(entry.clock_in_time);
      const dayKey = format(d, "yyyy-MM-dd");
      if (!map[empId]) map[empId] = {};
      if (!map[empId][dayKey]) map[empId][dayKey] = { dayKey, totalMins: 0, entries: [], overrideMins: 0, hasOverride: false };
      const dur = entry.duration_minutes || Math.round((new Date(entry.clock_out_time) - d) / 60000);
      map[empId][dayKey].totalMins += dur;
      map[empId][dayKey].entries.push(entry);
      if (entry.overtime_override_minutes != null) {
        map[empId][dayKey].hasOverride = true;
        map[empId][dayKey].overrideMins += entry.overtime_override_minutes;
      }
    });

    Object.keys(map).forEach(empId => {
      const profile = profileMap[empId];
      const basicSalary = profile?.basic_salary || 0;
      const workDays = settings.working_days_per_month || 22;
      const workHours = settings.working_hours_per_day || 8;
      // Hourly employees use their hourly_rate directly; salaried employees use
      // basic_salary / working_days / working_hours — same as calculatePayPeriod.
      const baseHourly = profile?.pay_type === "hourly"
        ? (profile.hourly_rate || 0)
        : (basicSalary > 0 ? basicSalary / workDays / workHours : 0);

      Object.keys(map[empId]).forEach(dayKey => {
        const day = map[empId][dayKey];
        let otMins;
        if (day.hasOverride) {
          otMins = Math.max(0, day.overrideMins);
        } else {
          otMins = Math.max(0, day.totalMins - thresholdMins);
        }
        const dayType = dayTypeFor(dayKey, holidays);
        const otRate = otRateFor(dayType, settings, baseHourly);
        day.otMins = otMins;
        day.regularMins = Math.min(day.totalMins, thresholdMins);
        day.dayType = dayType;
        day.otRate = otRate;
        day.otCost = otRate * (otMins / 60);
      });
    });
    return map;
  }, [entries, settings, profileMap]);

  const columns = useMemo(() => buildColumns(viewMode, refDate), [viewMode, refDate]);

  // Group by employee → column, aggregating per-day OT
  const matrix = useMemo(() => {
    const employeeMap = {}; // empId → { colKey → { mins, cost, days: [] } }
    Object.keys(dayOtMap).forEach(empId => {
      Object.keys(dayOtMap[empId]).forEach(dayKey => {
        const day = dayOtMap[empId][dayKey];
        if (day.otMins <= 0 && !day.hasOverride) return; // skip days with no OT
        const colKey = dayColumnKey(dayKey, viewMode);
        if (!employeeMap[empId]) employeeMap[empId] = {};
        if (!employeeMap[empId][colKey]) employeeMap[empId][colKey] = { mins: 0, cost: 0, days: [] };
        employeeMap[empId][colKey].mins += day.otMins;
        employeeMap[empId][colKey].cost += day.otCost;
        employeeMap[empId][colKey].days.push(day);
      });
    });
    return employeeMap;
  }, [dayOtMap, viewMode]);

  const matrix2 = matrix;
  // Display name lookup: employee_id → current full_name (falls back to cached name on entry)
  const employeeDisplayName = useMemo(() => {
    const map = {};
    (employeeRecords || []).forEach(e => {
      if (e.id) map[e.id] = e.full_name || "Unknown";
    });
    // Include employees with time entries but zero overtime
    entries.forEach(entry => {
      const id = entry.employee_id;
      if (id && !map[id]) map[id] = entry.employee_name || "Unknown";
    });
    return map;
  }, [employeeRecords, entries]);

  // Employees with time entries in the current period (even if zero overtime)
  const periodRange = useMemo(() => {
    if (viewMode === "day") return { start: startOfMonth(refDate), end: endOfMonth(refDate) };
    if (viewMode === "week") {
      const first = columns[0]; const last = columns[columns.length - 1];
      return { start: first?.start, end: last?.end };
    }
    const year = refDate.getFullYear();
    return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) };
  }, [viewMode, refDate, columns]);

  const periodEmployeeIds = useMemo(() => {
    const ids = new Set();
    if (periodRange?.start && periodRange?.end) {
      entries.forEach(e => {
        if (!e.clock_in_time || !e.employee_id) return;
        const d = new Date(e.clock_in_time);
        if (d >= periodRange.start && d <= periodRange.end) ids.add(e.employee_id);
      });
    }
    return ids;
  }, [entries, periodRange]);

  const allEmployeeIds = useMemo(() => {
    const set = new Set([...Object.keys(matrix2), ...periodEmployeeIds]);
    return [...set].sort();
  }, [matrix2, periodEmployeeIds]);

  const workersWithOTCount = useMemo(() => Object.keys(matrix2).length, [matrix2]);

  // Worked-hours matrix: total minutes worked per employee × column (shown in green when no OT)
  const workedMatrix = useMemo(() => {
    const map = {};
    if (!periodRange) return map;
    entries.forEach(entry => {
      if (!entry.clock_in_time || !entry.employee_id) return;
      const d = new Date(entry.clock_in_time);
      if (d < periodRange.start || d > periodRange.end) return;
      const colKey = entryColumnKey(entry, viewMode);
      if (!map[entry.employee_id]) map[entry.employee_id] = {};
      if (!map[entry.employee_id][colKey]) map[entry.employee_id][colKey] = 0;
      const dur = entry.duration_minutes || (entry.clock_out_time ? Math.round((new Date(entry.clock_out_time) - d) / 60000) : 0);
      map[entry.employee_id][colKey] += dur;
    });
    return map;
  }, [entries, viewMode, periodRange]);

  // Raw time entries per employee × column (for drilling into green / no-OT cells)
  const cellEntriesMatrix = useMemo(() => {
    const map = {};
    if (!periodRange) return map;
    entries.forEach(entry => {
      if (!entry.clock_in_time || !entry.employee_id) return;
      const d = new Date(entry.clock_in_time);
      if (d < periodRange.start || d > periodRange.end) return;
      const colKey = entryColumnKey(entry, viewMode);
      if (!map[entry.employee_id]) map[entry.employee_id] = {};
      if (!map[entry.employee_id][colKey]) map[entry.employee_id][colKey] = [];
      map[entry.employee_id][colKey].push(entry);
    });
    return map;
  }, [entries, viewMode, periodRange]);

  const employees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allEmployeeIds;
    return allEmployeeIds.filter(id => (employeeDisplayName[id] || "").toLowerCase().includes(q));
  }, [allEmployeeIds, searchQuery, employeeDisplayName]);

  // Map employee_id → team name (from Employee records)
  const employeeTeamMap = useMemo(() => {
    const map = {};
    (employeeRecords || []).forEach(e => {
      if (e.id) map[e.id] = e.team_name || "—";
    });
    return map;
  }, [employeeRecords]);

  // Group employees by team for the team view
  const teamGroups = useMemo(() => {
    const groups = {}; // teamName → [empName, ...]
    employees.forEach(emp => {
      const team = employeeTeamMap[emp] || "—";
      if (!groups[team]) groups[team] = [];
      groups[team].push(emp);
    });
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [employees, employeeTeamMap]);

  // Column totals
  const colTotals = useMemo(() => {
    const totals = {};
    columns.forEach(c => { totals[c.key] = { mins: 0, cost: 0 }; });
    employees.forEach(emp => {
      columns.forEach(c => {
        const cell = matrix2[emp]?.[c.key];
        if (cell) {
          totals[c.key].mins += cell.mins;
          totals[c.key].cost += cell.cost;
        }
      });
    });
    return totals;
  }, [matrix, employees, columns]);

  const grandTotal = useMemo(() => ({
    mins: Object.values(colTotals).reduce((s, c) => s + c.mins, 0),
    cost: Object.values(colTotals).reduce((s, c) => s + c.cost, 0),
  }), [colTotals]);

  const rowTotal = (emp) => {
    let mins = 0, cost = 0;
    columns.forEach(c => {
      const cell = matrix2[emp]?.[c.key];
      if (cell) { mins += cell.mins; cost += cell.cost; }
    });
    return { mins, cost };
  };

  // Aggregate all days across columns for an employee (used by Total drill-down)
  const rowCell = (emp) => {
    let mins = 0, cost = 0;
    const days = [];
    columns.forEach(c => {
      const cell = matrix2[emp]?.[c.key];
      if (cell) {
        mins += cell.mins;
        cost += cell.cost;
        days.push(...(cell.days || []));
      }
    });
    return { mins, cost, days };
  };

  // Subtotal for a set of employees (a team)
  const teamSubtotal = (empNames) => {
    const totals = {};
    columns.forEach(c => { totals[c.key] = { mins: 0, cost: 0 }; });
    let totalMins = 0, totalCost = 0;
    empNames.forEach(emp => {
      columns.forEach(c => {
        const cell = matrix2[emp]?.[c.key];
        if (cell) {
          totals[c.key].mins += cell.mins;
          totals[c.key].cost += cell.cost;
        }
      });
      const rt = rowTotal(emp);
      totalMins += rt.mins; totalCost += rt.cost;
    });
    return { totals, totalMins, totalCost };
  };

  const navigate = (dir) => {
    if (viewMode === "day") setRefDate(d => addMonths(d, dir));
    else if (viewMode === "week") setRefDate(d => { const n = new Date(d); n.setDate(d.getDate() + dir * 7 * 8); return n; });
    else setRefDate(d => { const n = new Date(d); n.setFullYear(d.getFullYear() + dir); return n; });
  };

  const periodLabel = () => {
    if (viewMode === "day") return format(refDate, "MMMM yyyy");
    if (viewMode === "week") return `${format(columns[0]?.label ? new Date(columns[0].start || refDate) : refDate, "MMM yyyy")} – 8 weeks`;
    return format(refDate, "yyyy");
  };

  const exportCSV = () => {
    const header = ["Employee", ...columns.map(c => `${c.label}${c.sublabel ? " " + c.sublabel : ""}`), "Total"];
    const lines = employees.map(emp => {
      const cells = columns.map(c => {
        const cell = matrix2[emp]?.[c.key];
        // Export numeric decimal values (hours or AED) so Excel can compute/rectify directly
        return showCost ? (cell?.cost?.toFixed(2) || "0") : ((cell?.mins || 0) / 60).toFixed(2);
      });
      const rt = rowTotal(emp);
      return [employeeDisplayName[emp] || emp, ...cells, showCost ? rt.cost.toFixed(2) : (rt.mins / 60).toFixed(2)];
    });
    const csv = [header, ...lines].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `overtime-${format(new Date(), "yyyy-MM-dd")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportPDF = () => {
    const headerCells = columns.map(c => `<th>${c.label}${c.sublabel ? `<br><span class="sub">${c.sublabel}</span>` : ""}</th>`).join("");
    const bodyRows = (groupByTeam ? teamGroups.flatMap(([, empNames]) => empNames) : employees).map(emp => {
      const cells = columns.map(c => {
        const cell = matrix2[emp]?.[c.key];
        const val = cell ? (showCost ? cell.cost : cell.mins) : null;
        const worked = !showCost ? (workedMatrix[emp]?.[c.key] || 0) : 0;
        const overThreshold = !showCost && val != null && otThresholdHours > 0 && val > otThresholdHours * 60;
        return `<td class="${overThreshold ? "flag" : ""} ${!val && worked > 0 ? "worked" : ""}">${val ? (showCost ? val.toFixed(0) : fmt(val)) : worked > 0 ? fmt(worked) : "·"}</td>`;
      }).join("");
      const rt = rowTotal(emp);
      return `<tr><td class="name">${employeeDisplayName[emp] || emp}</td>${cells}<td class="total">${rt.mins > 0 ? (showCost ? rt.cost.toFixed(0) : fmt(rt.mins)) : "—"}</td></tr>`;
    }).join("");
    const totalCells = columns.map(c => {
      const ct = colTotals[c.key];
      const val = showCost ? ct?.cost : ct?.mins;
      return `<td class="total">${val ? (showCost ? val.toFixed(0) : fmt(val)) : "·"}</td>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>Overtime Report — ${periodLabel()}</title>
    <style>
      @page { size: landscape; margin: 8mm; }
      body { font-family: Arial, sans-serif; font-size: 9px; color: #1f2937; }
      h1 { font-size: 14px; margin: 0 0 2px; }
      .sub-title { font-size: 10px; color: #6b7280; margin-bottom: 8px; }
      table { border-collapse: collapse; width: 100%; }
      th { background: #f3f4f6; padding: 3px 4px; font-size: 8px; text-transform: uppercase; border: 1px solid #e5e7eb; }
      th .sub { font-size: 7px; font-weight: normal; text-transform: none; }
      td { padding: 2px 4px; text-align: center; border: 1px solid #e5e7eb; font-family: monospace; font-size: 9px; }
      td.name { text-align: left; font-family: Arial, sans-serif; font-weight: 500; white-space: nowrap; }
      td.total { background: #fff9eb; font-weight: bold; color: #92400e; text-align: right; }
      th:first-child { text-align: left; min-width: 120px; }
      th:last-child { background: #fef3c7; color: #92400e; }
      td.flag { color: #dc2626; font-weight: bold; }
      td.worked { color: #059669; }
      tfoot td { background: #f3f4f6; font-weight: bold; }
      tfoot td.total { background: #fde68a; }
      .summary { display: flex; gap: 12px; margin-bottom: 8px; font-size: 10px; }
      .summary div { padding: 3px 10px; background: #f9fafb; border-radius: 4px; }
    </style></head><body>
      <h1>Overtime Report</h1>
      <div class="sub-title">${periodLabel()} — ${showCost ? "Cost (AED)" : "Hours"}</div>
      <div class="summary">
        <div>Workers with OT: <b>${workersWithOTCount}</b></div>
        <div>Total OT: <b>${showCost ? `AED ${grandTotal.cost.toFixed(2)}` : fmt(grandTotal.mins)}</b></div>
      </div>
      <table>
        <thead><tr><th>Employee</th>${headerCells}<th>Total</th></tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot><tr><td class="name">Total</td>${totalCells}<td class="total">${showCost ? `${grandTotal.cost.toFixed(0)} AED` : fmt(grandTotal.mins)}</td></tr></tfoot>
      </table>
    </body></html>`;

    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 250);
  };

  const getDrillDownData = (dd) => {
    if (dd.colKey === "__total__") {
      const rc = rowCell(dd.employeeId);
      return { cell: rc, days: rc.days || [] };
    }
    const otCell = matrix2[dd.employeeId]?.[dd.colKey];
    if (otCell) return { cell: otCell, days: otCell.days || [] };
    // Green cell (worked hours, no OT) — build days from raw entries
    const raw = cellEntriesMatrix[dd.employeeId]?.[dd.colKey] || [];
    const holidays = settings?.public_holidays || [];
    const daysByDayKey = {};
    raw.forEach(e => {
      if (!e.clock_in_time) return;
      const dayKey = format(new Date(e.clock_in_time), "yyyy-MM-dd");
      if (!daysByDayKey[dayKey]) daysByDayKey[dayKey] = { dayKey, totalMins: 0, entries: [], otMins: 0, regularMins: 0, hasOverride: false, dayType: dayTypeFor(dayKey, holidays), otRate: 0, otCost: 0 };
      const dur = e.duration_minutes || (e.clock_out_time ? Math.round((new Date(e.clock_out_time) - new Date(e.clock_in_time)) / 60000) : 0);
      daysByDayKey[dayKey].totalMins += dur;
      daysByDayKey[dayKey].regularMins += dur;
      daysByDayKey[dayKey].entries.push(e);
    });
    return {
      cell: { mins: 0, cost: 0 },
      days: Object.values(daysByDayKey).sort((a, b) => a.dayKey.localeCompare(b.dayKey)),
    };
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Reports
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600"><Clock className="w-5 h-5" /></div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Overtime Report</h1>
              <p className="text-sm text-muted-foreground">Extra hours beyond standard shift — workers × time matrix</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={exportCSV} className="gap-1.5">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
            <Button size="sm" variant="outline" onClick={exportPDF} className="gap-1.5">
              <FileText className="w-4 h-4" /> PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Summary */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Workers with OT</p>
            <p className="text-2xl font-bold text-foreground">{workersWithOTCount}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total OT Hours</p>
            <p className="text-2xl font-bold text-foreground">{fmt(grandTotal.mins)}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total OT Cost</p>
            <p className="text-2xl font-bold text-amber-600">{grandTotal.cost > 0 ? `AED ${grandTotal.cost.toFixed(2)}` : "—"}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Name search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search employee..."
            className="pl-8 pr-3 h-9 rounded-lg border border-border bg-card text-sm focus:outline-none focus:ring-1 focus:ring-ring w-48"
          />
        </div>

        {/* Group by toggle */}
        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 gap-0.5">
          <button onClick={() => setGroupByTeam(false)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!groupByTeam ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            By Employee
          </button>
          <button onClick={() => setGroupByTeam(true)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${groupByTeam ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            By Team
          </button>
        </div>

        {/* View mode */}
        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 gap-0.5">
          {VIEW_MODES.map(m => (
            <button key={m.key} onClick={() => setViewMode(m.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === m.key ? "bg-white shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Period nav */}
        <div className="flex items-center gap-2">
          <button onClick={() => navigate(-1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors text-sm">‹</button>
          <span className="text-sm font-semibold text-foreground min-w-32 text-center">{periodLabel()}</span>
          <button onClick={() => navigate(1)} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors text-sm">›</button>
        </div>

        {/* Hours / Cost toggle */}
        <div className="flex items-center bg-muted/50 rounded-lg p-0.5 gap-0.5">
          <button onClick={() => setShowCost(false)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${!showCost ? "bg-white shadow text-foreground" : "text-muted-foreground"}`}>
            Hours
          </button>
          <button onClick={() => setShowCost(true)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${showCost ? "bg-white shadow text-foreground" : "text-muted-foreground"}`}>
            Cost (AED)
          </button>
        </div>

        {/* Threshold flag control — only meaningful in Hours mode */}
        {!showCost && (
          <div className="flex items-center gap-1.5 text-sm">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-muted-foreground">Flag if &gt;</span>
            <input
              type="number"
              min="0"
              step="0.5"
              value={otThresholdHours}
              onChange={e => setOtThresholdHours(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-14 h-8 px-2 rounded-md border border-border bg-card text-center font-mono text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              title="Highlight cells exceeding this many overtime hours"
            />
            <span className="text-muted-foreground">h</span>
          </div>
        )}
      </div>

      {/* Matrix table */}
      {loading ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-muted-foreground">Loading...</div>
      ) : employees.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center">
          <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No overtime entries in this period.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="text-sm border-collapse" style={{ minWidth: "max-content" }}>
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  {/* Sticky employee column header */}
                  <th className="sticky left-0 z-20 bg-muted text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-36 border-r border-border">
                    Employee
                  </th>
                  {columns.map(col => (
                    <th key={col.key}
                      className={`px-2 py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-14 border-r border-border/50 last:border-r-0 ${col.isWeekend ? "bg-orange-50/50" : ""}`}>
                      <div>{col.label}</div>
                      {col.sublabel && <div className="text-muted-foreground/60 font-normal normal-case tracking-normal">{col.sublabel}</div>}
                    </th>
                  ))}
                  <th className="sticky right-[112px] z-20 bg-amber-50 text-right px-3 py-3 text-xs font-semibold text-amber-700 uppercase tracking-wide w-28 border-l border-border">
                    Total Hours
                  </th>
                  <th className="sticky right-0 z-20 bg-amber-50 text-right px-3 py-3 text-xs font-semibold text-amber-700 uppercase tracking-wide w-28 border-l border-border">
                    Total Cost
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupByTeam ? (
                  teamGroups.flatMap(([team, empNames]) => {
                    const sub = teamSubtotal(empNames);
                    return [
                      <tr key={`team-${team}`} className="bg-primary/5 border-b border-border">
                        <td className="sticky left-0 z-20 bg-indigo-50 px-4 py-2 font-bold text-primary border-r border-border whitespace-nowrap" colSpan={columns.length + 3}>
                          {team} <span className="text-muted-foreground font-normal ml-1">({empNames.length})</span>
                        </td>
                      </tr>,
                      ...empNames.map((emp, ei) => {
                        const rt = rowTotal(emp);
                        return (
                          <tr key={emp} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${ei % 2 === 0 ? "" : "bg-muted/5"}`}>
                            <td className="sticky left-0 z-20 bg-card px-4 py-2.5 pl-8 font-medium text-foreground border-r border-border whitespace-nowrap">
                              {employeeDisplayName[emp]}
                            </td>
                            {columns.map(col => {
                              const cell = matrix2[emp]?.[col.key];
                              const val = cell ? (showCost ? cell.cost : cell.mins) : null;
                              const hasData = cell && cell.days?.length > 0;
                              const worked = !showCost ? (workedMatrix[emp]?.[col.key] || 0) : 0;
                              const overThreshold = !showCost && val != null && otThresholdHours > 0 && val > otThresholdHours * 60;
                              return (
                                <td key={col.key}
                                  onClick={() => (hasData || worked > 0) && setDrillDown({ employeeId: emp, employeeName: employeeDisplayName[emp], colKey: col.key, colLabel: col.label, colSublabel: col.sublabel })}
                                  className={`px-2 py-2.5 text-center font-mono border-r border-border/30 last:border-r-0 ${col.isWeekend ? "bg-orange-50/30" : ""} ${overThreshold ? "text-red-600 font-bold bg-red-50" : val ? "text-amber-700 font-semibold" : worked > 0 ? "text-emerald-600 font-medium" : "text-muted-foreground/30"} ${(hasData || worked > 0) ? "cursor-pointer hover:ring-2 hover:ring-amber-400 hover:z-10 relative hover:bg-amber-100/50 rounded-sm" : ""}`}>
                                  {val
                                    ? showCost
                                      ? val.toFixed(0)
                                      : fmt(val)
                                    : worked > 0
                                      ? fmt(worked)
                                      : "·"}
                                </td>
                              );
                            })}
                            <td
                              onClick={() => rt.mins > 0 && setDrillDown({ employeeId: emp, employeeName: employeeDisplayName[emp], colKey: "__total__", colLabel: "Period Total", colSublabel: periodLabel() })}
                              className={`sticky right-[112px] z-20 bg-amber-50 px-3 py-2.5 text-right font-mono font-bold text-amber-700 border-l border-border whitespace-nowrap w-28 ${rt.mins > 0 ? "cursor-pointer hover:bg-amber-100 hover:ring-2 hover:ring-amber-400 rounded-sm" : ""}`}>
                              {rt.mins > 0 ? fmt(rt.mins) : "—"}
                            </td>
                            <td
                              onClick={() => rt.cost > 0 && setDrillDown({ employeeId: emp, employeeName: employeeDisplayName[emp], colKey: "__total__", colLabel: "Period Total", colSublabel: periodLabel() })}
                              className={`sticky right-0 z-20 bg-amber-50 px-3 py-2.5 text-right font-mono font-bold text-amber-700 border-l border-border whitespace-nowrap w-28 ${rt.cost > 0 ? "cursor-pointer hover:bg-amber-100 hover:ring-2 hover:ring-amber-400 rounded-sm" : ""}`}>
                              {rt.cost > 0 ? `${rt.cost.toFixed(0)} AED` : "—"}
                            </td>
                          </tr>
                        );
                      }),
                      <tr key={`sub-${team}`} className="border-b border-border bg-primary/5 font-semibold">
                        <td className="sticky left-0 z-20 bg-indigo-50 px-4 py-2 text-xs font-bold text-primary uppercase tracking-wide border-r border-border whitespace-nowrap">
                          {team} subtotal
                        </td>
                        {columns.map(col => {
                          const st = sub.totals[col.key];
                          const val = showCost ? st.cost : st.mins;
                          return (
                            <td key={col.key}
                              className={`px-2 py-2 text-center font-mono text-xs border-r border-border/30 last:border-r-0 ${col.isWeekend ? "bg-orange-50/30" : ""} ${val ? "text-primary font-bold" : "text-muted-foreground/30"}`}>
                              {val ? (showCost ? val.toFixed(0) : fmt(val)) : "·"}
                            </td>
                          );
                        })}
                        <td className="sticky right-[112px] z-20 bg-indigo-50 px-3 py-2 text-right font-mono font-bold text-primary border-l border-border text-sm whitespace-nowrap w-28">
                          {fmt(sub.totalMins)}
                        </td>
                        <td className="sticky right-0 z-20 bg-indigo-50 px-3 py-2 text-right font-mono font-bold text-primary border-l border-border text-sm whitespace-nowrap w-28">
                          {`${sub.totalCost.toFixed(0)} AED`}
                        </td>
                      </tr>,
                    ];
                  })
                ) : (
                  employees.map((emp, ei) => {
                    const rt = rowTotal(emp);
                    return (
                      <tr key={emp} className={`border-b border-border/50 hover:bg-muted/20 transition-colors ${ei % 2 === 0 ? "" : "bg-muted/5"}`}>
                        <td className="sticky left-0 z-20 bg-card px-4 py-2.5 font-medium text-foreground border-r border-border whitespace-nowrap">
                          {employeeDisplayName[emp]}
                        </td>
                        {columns.map(col => {
                          const cell = matrix2[emp]?.[col.key];
                          const val = cell ? (showCost ? cell.cost : cell.mins) : null;
                          const hasData = cell && cell.days?.length > 0;
                          const worked = !showCost ? (workedMatrix[emp]?.[col.key] || 0) : 0;
                          const overThreshold = !showCost && val != null && otThresholdHours > 0 && val > otThresholdHours * 60;
                          return (
                            <td key={col.key}
                              onClick={() => (hasData || worked > 0) && setDrillDown({ employeeId: emp, employeeName: employeeDisplayName[emp], colKey: col.key, colLabel: col.label, colSublabel: col.sublabel })}
                              className={`px-2 py-2.5 text-center font-mono border-r border-border/30 last:border-r-0 ${col.isWeekend ? "bg-orange-50/30" : ""} ${overThreshold ? "text-red-600 font-bold bg-red-50" : val ? "text-amber-700 font-semibold" : worked > 0 ? "text-emerald-600 font-medium" : "text-muted-foreground/30"} ${(hasData || worked > 0) ? "cursor-pointer hover:ring-2 hover:ring-amber-400 hover:z-10 relative hover:bg-amber-100/50 rounded-sm" : ""}`}>
                              {val
                                ? showCost
                                  ? val.toFixed(0)
                                  : fmt(val)
                                : worked > 0
                                  ? fmt(worked)
                                  : "·"}
                            </td>
                          );
                        })}
                        <td
                          onClick={() => rt.mins > 0 && setDrillDown({ employeeId: emp, employeeName: employeeDisplayName[emp], colKey: "__total__", colLabel: "Period Total", colSublabel: periodLabel() })}
                          className={`sticky right-[112px] z-20 bg-amber-50 px-3 py-2.5 text-right font-mono font-bold text-amber-700 border-l border-border whitespace-nowrap w-28 ${rt.mins > 0 ? "cursor-pointer hover:bg-amber-100 hover:ring-2 hover:ring-amber-400 rounded-sm" : ""}`}>
                          {rt.mins > 0 ? fmt(rt.mins) : "—"}
                        </td>
                        <td
                          onClick={() => rt.cost > 0 && setDrillDown({ employeeId: emp, employeeName: employeeDisplayName[emp], colKey: "__total__", colLabel: "Period Total", colSublabel: periodLabel() })}
                          className={`sticky right-0 z-20 bg-amber-50 px-3 py-2.5 text-right font-mono font-bold text-amber-700 border-l border-border whitespace-nowrap w-28 ${rt.cost > 0 ? "cursor-pointer hover:bg-amber-100 hover:ring-2 hover:ring-amber-400 rounded-sm" : ""}`}>
                          {rt.cost > 0 ? `${rt.cost.toFixed(0)} AED` : "—"}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {/* Footer totals */}
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td className="sticky left-0 z-20 bg-muted px-4 py-3 text-xs font-bold text-muted-foreground uppercase tracking-wide border-r border-border">
                    Total
                  </td>
                  {columns.map(col => {
                    const ct = colTotals[col.key];
                    const val = showCost ? ct?.cost : ct?.mins;
                    return (
                      <td key={col.key}
                        className={`px-2 py-3 text-center font-mono text-xs border-r border-border/30 last:border-r-0 ${col.isWeekend ? "bg-orange-50/50" : ""} ${val ? "text-amber-700 font-bold" : "text-muted-foreground/30"}`}>
                        {val ? (showCost ? val.toFixed(0) : fmt(val)) : "·"}
                      </td>
                    );
                  })}
                  <td className="sticky right-[112px] z-20 bg-amber-100 px-3 py-3 text-right font-mono font-bold text-amber-800 border-l border-border text-sm whitespace-nowrap w-28">
                    {fmt(grandTotal.mins)}
                  </td>
                  <td className="sticky right-0 z-20 bg-amber-100 px-3 py-3 text-right font-mono font-bold text-amber-800 border-l border-border text-sm whitespace-nowrap w-28">
                    {`${grandTotal.cost.toFixed(0)} AED`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {/* Drill-down modal */}
      {drillDown && (() => {
        const dd = getDrillDownData(drillDown);
        return (
          <OvertimeDrillDownModal
            drillDown={drillDown}
            cell={dd.cell}
            days={dd.days}
            showCost={showCost}
            onEdit={(entry) => setEditingEntry(entry)}
            onRectified={() => loadData()}
            onClose={() => setDrillDown(null)}
          />
        );
      })()}
      {/* Edit / rectify entry modal */}
      {editingEntry && (
        <OvertimeEntryEditModal
          entry={editingEntry}
          settings={settings}
          onClose={() => setEditingEntry(null)}
          onSaved={() => {
            setEditingEntry(null);
            setDrillDown(null);
            loadData();
          }}
        />
      )}
    </div>
  );
}