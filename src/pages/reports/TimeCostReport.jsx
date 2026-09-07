import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, FolderOpen, Clock, DollarSign, ChevronDown, ChevronRight, Printer } from "lucide-react";

function fmtHours(mins) {
  if (!mins) return "0h 0m";
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h}h ${m}m`;
}
function fmtCurrency(v) {
  if (!v) return "AED 0.00";
  return "AED " + new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

const now = new Date();
const DEFAULT_FROM = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
const DEFAULT_TO = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

export default function TimeCostReport() {
  const urlParams = new URLSearchParams(window.location.search);
  const [groupBy, setGroupBy] = useState(urlParams.get("group") === "project" ? "project" : "client"); // "client" | "project"
  const [from, setFrom] = useState(DEFAULT_FROM);
  const [to, setTo] = useState(DEFAULT_TO);
  const [pendingFrom, setPendingFrom] = useState(DEFAULT_FROM);
  const [pendingTo, setPendingTo] = useState(DEFAULT_TO);

  const [entries, setEntries] = useState([]);
  const [profiles, setProfiles] = useState([]); // EmployeePayrollProfile
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState({});

  const load = async () => {
    setLoading(true);
    // A switch performs a clock-out, so Switched entries are clocked-out too
    const [comp, sw, payrollProfiles] = await Promise.all([
      base44.entities.TimeEntry.filter({ status: "Completed" }),
      base44.entities.TimeEntry.filter({ status: "Switched" }),
      base44.entities.EmployeePayrollProfile.list("-created_date", 500),
    ]);
    setEntries([...(comp || []), ...(sw || [])]);
    setProfiles(payrollProfiles || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleUpdate = () => { setFrom(pendingFrom); setTo(pendingTo); };

  // Build hourly rate map: employee_id -> AED/hour
  const hourlyRateMap = useMemo(() => {
    const map = {};
    profiles.forEach(p => {
      if (!p.employee_id) return;
      if (p.pay_type === "hourly" && p.hourly_rate) {
        map[p.employee_id] = p.hourly_rate;
      } else if (p.basic_salary) {
        // monthly salary -> hourly (working days * 8h)
        map[p.employee_id] = p.basic_salary / (22 * 8);
      }
    });
    return map;
  }, [profiles]);

  // Filter entries by date range
  const filtered = useMemo(() => {
    return entries.filter(e => {
      if (!e.clock_in_time) return false;
      const d = e.clock_in_time.slice(0, 10);
      return d >= from && d <= to;
    });
  }, [entries, from, to]);

  // Group by client or project
  const grouped = useMemo(() => {
    const map = {};
    filtered.forEach(e => {
      const key = groupBy === "client"
        ? (e.contact_id || "__none__")
        : (e.project_id || "__none__");
      const label = groupBy === "client"
        ? (e.contact_name || "No client")
        : (e.project_name || "No project");

      if (!map[key]) map[key] = { id: key, label, entries: [] };
      map[key].entries.push(e);
    });

    // Compute totals per group, and breakdown per employee within group
    return Object.values(map)
      .map(group => {
        const byEmployee = {};
        group.entries.forEach(e => {
          const empKey = e.employee_id || "__emp__";
          if (!byEmployee[empKey]) byEmployee[empKey] = { name: e.employee_name || "Unknown", minutes: 0, cost: 0, entryCount: 0 };
          const mins = e.duration_minutes || 0;
          const rate = hourlyRateMap[e.employee_id] || 0;
          const cost = (mins / 60) * rate;
          byEmployee[empKey].minutes += mins;
          byEmployee[empKey].cost += cost;
          byEmployee[empKey].entryCount++;
        });

        const totalMinutes = group.entries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
        const totalCost = Object.values(byEmployee).reduce((s, emp) => s + emp.cost, 0);

        // Task breakdown
        const byTask = {};
        group.entries.forEach(e => {
          const taskKey = e.task_id || "__task__";
          if (!byTask[taskKey]) byTask[taskKey] = { title: e.task_title || "Unknown task", minutes: 0, employees: new Set() };
          byTask[taskKey].minutes += e.duration_minutes || 0;
          if (e.employee_name) byTask[taskKey].employees.add(e.employee_name);
        });

        return {
          ...group,
          totalMinutes,
          totalCost,
          employees: Object.values(byEmployee).sort((a, b) => b.minutes - a.minutes),
          tasks: Object.values(byTask).sort((a, b) => b.minutes - a.minutes),
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
  }, [filtered, groupBy, hourlyRateMap]);

  const grandTotalMinutes = grouped.reduce((s, g) => s + g.totalMinutes, 0);
  const grandTotalCost = grouped.reduce((s, g) => s + g.totalCost, 0);

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));
  const hasRates = Object.keys(hourlyRateMap).length > 0;

  const fromLabel = new Date(from + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const toLabel = new Date(to + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Reports
        </Link>
        <h1 className="text-xl font-bold text-foreground mt-1">Time & Cost Report</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Hours worked and labour cost by client or project, based on time entries</p>
      </div>

      {/* Controls */}
      <div className="flex items-end gap-4 flex-wrap p-4 rounded-xl border border-border bg-card">
        {/* Group by toggle */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Group by</label>
          <div className="flex rounded-lg border border-input overflow-hidden h-9">
            <button
              onClick={() => setGroupBy("client")}
              className={`flex items-center gap-1.5 px-3 text-sm font-medium transition-colors ${groupBy === "client" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-muted"}`}
            >
              <Users className="w-3.5 h-3.5" /> Client
            </button>
            <button
              onClick={() => setGroupBy("project")}
              className={`flex items-center gap-1.5 px-3 text-sm font-medium transition-colors border-l border-input ${groupBy === "project" ? "bg-primary text-primary-foreground" : "bg-transparent text-foreground hover:bg-muted"}`}
            >
              <FolderOpen className="w-3.5 h-3.5" /> Project
            </button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">From</label>
          <input type="date" value={pendingFrom} onChange={e => setPendingFrom(e.target.value)}
            className="h-9 px-3 text-sm rounded-md border border-input bg-transparent focus:outline-none focus:ring-1 focus:ring-ring w-40" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">To</label>
          <input type="date" value={pendingTo} onChange={e => setPendingTo(e.target.value)}
            className="h-9 px-3 text-sm rounded-md border border-input bg-transparent focus:outline-none focus:ring-1 focus:ring-ring w-40" />
        </div>
        <Button size="sm" onClick={handleUpdate} className="h-9">Update</Button>
        <Button size="sm" variant="outline" className="gap-1.5 h-9 ml-auto" onClick={() => window.print()}>
          <Printer className="w-4 h-4" /> Print
        </Button>
      </div>

      {!hasRates && (
        <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          ⚠ No payroll profiles found — cost calculations will show AED 0.00. Set up employee payroll profiles to see labour costs.
        </div>
      )}

      {/* Summary cards */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10"><Clock className="w-5 h-5 text-primary" /></div>
            <div>
              <p className="text-lg font-bold font-mono text-foreground">{fmtHours(grandTotalMinutes)}</p>
              <p className="text-xs text-muted-foreground">Total time logged</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-100"><DollarSign className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-lg font-bold font-mono text-foreground">{fmtCurrency(grandTotalCost)}</p>
              <p className="text-xs text-muted-foreground">Total labour cost</p>
            </div>
          </div>
          <div className="p-4 rounded-xl border border-border bg-card flex items-center gap-3">
            <div className="p-2 rounded-lg bg-violet-100">
              {groupBy === "client" ? <Users className="w-5 h-5 text-violet-600" /> : <FolderOpen className="w-5 h-5 text-violet-600" />}
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{grouped.length}</p>
              <p className="text-xs text-muted-foreground">{groupBy === "client" ? "Clients" : "Projects"} · {fromLabel} – {toLabel}</p>
            </div>
          </div>
        </div>
      )}

      {/* Main table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span className="col-span-5">{groupBy === "client" ? "Client" : "Project"}</span>
          <span className="col-span-2 text-right">Entries</span>
          <span className="col-span-2 text-right">Total Time</span>
          <span className="col-span-2 text-right">Labour Cost</span>
          <span className="col-span-1" />
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
        ) : grouped.length === 0 ? (
          <div className="py-16 text-center">
            <Clock className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No completed time entries found for this period.</p>
          </div>
        ) : (
          <>
            {grouped.map((group, i) => {
              const isOpen = !!expanded[group.id];
              const pct = grandTotalMinutes > 0 ? (group.totalMinutes / grandTotalMinutes) * 100 : 0;
              return (
                <React.Fragment key={group.id}>
                  {/* Group row */}
                  <div
                    className={`grid grid-cols-12 gap-2 px-4 py-3.5 border-b border-border hover:bg-muted/20 transition-colors cursor-pointer group ${isOpen ? "bg-muted/10" : i % 2 !== 0 ? "bg-muted/5" : ""}`}
                    onClick={() => toggleExpand(group.id)}
                  >
                    <div className="col-span-5 flex items-center gap-2 min-w-0">
                      {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{group.label}</p>
                        {/* Mini progress bar */}
                        <div className="mt-1 h-1.5 w-32 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary/60 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    </div>
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="text-sm text-muted-foreground">{group.entries.length}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="text-sm font-mono font-semibold text-foreground">{fmtHours(group.totalMinutes)}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-end">
                      <span className="text-sm font-mono font-semibold text-green-700">{fmtCurrency(group.totalCost)}</span>
                    </div>
                    <div className="col-span-1 flex items-center justify-end">
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">{pct.toFixed(0)}%</span>
                    </div>
                  </div>

                  {/* Expanded: employee breakdown + task breakdown */}
                  {isOpen && (
                    <div className="border-b border-border bg-muted/5 px-4 py-4 space-y-4">
                      {/* By employee */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Employee</p>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase">
                            <span className="col-span-5">Employee</span>
                            <span className="col-span-2 text-right">Entries</span>
                            <span className="col-span-2 text-right">Time</span>
                            <span className="col-span-3 text-right">Cost</span>
                          </div>
                          {group.employees.map((emp, ei) => (
                            <div key={ei} className={`grid grid-cols-12 gap-2 px-3 py-2.5 text-sm border-t border-border/50 ${ei % 2 !== 0 ? "bg-muted/5" : ""}`}>
                              <span className="col-span-5 font-medium text-foreground">{emp.name}</span>
                              <span className="col-span-2 text-right text-muted-foreground">{emp.entryCount}</span>
                              <span className="col-span-2 text-right font-mono text-foreground">{fmtHours(emp.minutes)}</span>
                              <span className="col-span-3 text-right font-mono text-green-700">{fmtCurrency(emp.cost)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* By task */}
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">By Task</p>
                        <div className="rounded-lg border border-border overflow-hidden">
                          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/30 text-xs font-semibold text-muted-foreground uppercase">
                            <span className="col-span-7">Task</span>
                            <span className="col-span-3">Employees</span>
                            <span className="col-span-2 text-right">Time</span>
                          </div>
                          {group.tasks.map((task, ti) => (
                            <div key={ti} className={`grid grid-cols-12 gap-2 px-3 py-2.5 text-sm border-t border-border/50 ${ti % 2 !== 0 ? "bg-muted/5" : ""}`}>
                              <span className="col-span-7 text-foreground truncate">{task.title}</span>
                              <span className="col-span-3 text-xs text-muted-foreground truncate">{[...task.employees].join(", ") || "—"}</span>
                              <span className="col-span-2 text-right font-mono text-foreground">{fmtHours(task.minutes)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            {/* Grand total */}
            <div className="grid grid-cols-12 gap-2 px-4 py-3.5 bg-muted/30 border-t-2 border-border font-bold text-sm">
              <span className="col-span-5 text-foreground">Total</span>
              <span className="col-span-2 text-right text-foreground">{filtered.length}</span>
              <span className="col-span-2 text-right font-mono text-foreground">{fmtHours(grandTotalMinutes)}</span>
              <span className="col-span-2 text-right font-mono text-green-700">{fmtCurrency(grandTotalCost)}</span>
              <span className="col-span-1" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}