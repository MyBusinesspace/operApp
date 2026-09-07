import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import {
  Wrench, ClipboardList, Clock, BarChart3, Timer, LayoutGrid, ChevronRight
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";
import { format, addDays, startOfDay } from "date-fns";
import {
  DarkHeader, DarkHero, Metric, StatusRow, DarkSection, DarkQuickLink, DarkLoading
} from "@/components/shared/DarkOverview";

export default function OperationsOverview() {
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [wo, t, te] = await batchedAll([
        () => withRetry(() => base44.entities.WorkOrder.list("-created_date", 500)),
        () => withRetry(() => base44.entities.Task.list("-created_date", 500)),
        () => withRetry(() => base44.entities.TimeEntry.list("-created_date", 500)),
      ], 2);
      setWorkOrders(Array.isArray(wo) ? wo : []);
      setTasks(Array.isArray(t) ? t : []);
      setTimeEntries(Array.isArray(te) ? te : []);
      setLoading(false);
    };
    load();
  }, []);

  const woGroups = useMemo(() => {
    const groups = { Active: 0, "On Hold": 0, Archived: 0 };
    for (const wo of workOrders) {
      if (groups[wo.status] !== undefined) groups[wo.status]++;
    }
    return groups;
  }, [workOrders]);

  const taskGroups = useMemo(() => {
    const groups = { Queued: 0, Scheduled: 0, "Not Completed": 0, Completed: 0 };
    for (const t of tasks) {
      if (groups[t.status] !== undefined) groups[t.status]++;
    }
    return groups;
  }, [tasks]);

  const thisWeekEntries = useMemo(() => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    return timeEntries.filter(e => new Date(e.clock_in_time) >= weekStart);
  }, [timeEntries]);

  const weekMinutes = thisWeekEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
  const weekHours = Math.round(weekMinutes / 60 * 10) / 10;
  const activeClockedIn = timeEntries.filter(e => e.status === "Active").length;
  const activeEntries = timeEntries.filter(e => e.status === "Active");

  const tasksChartData = useMemo(() => {
    const today = startOfDay(new Date());
    const days = [];
    for (let i = 0; i < 12; i++) {
      const d = addDays(today, i);
      days.push({ label: format(d, "d"), fullLabel: format(d, "d MMM"), dateKey: format(d, "yyyy-MM-dd"), scheduled: 0, completed: 0 });
    }
    for (const task of tasks) {
      if (!task.planning_date) continue;
      const key = startOfDay(new Date(task.planning_date));
      const match = days.find(d => d.dateKey === format(key, "yyyy-MM-dd"));
      if (match) {
        if (task.status === "Completed") match.completed++;
        else match.scheduled++;
      }
    }
    return days;
  }, [tasks]);

  const navigateTo = (path, status) => {
    window.location.href = `${path}?status=${encodeURIComponent(status)}`;
  };

  if (loading) return <DarkLoading />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DarkHeader sectionLabel="Operations" createTo="/work-orders" />

      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
        <DarkHero
          title="Operations overview"
          subtitle="Schedule and track field service work — work orders, tasks, and live timesheets from a single command center."
        />

        {/* Top metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
          <Metric icon={Wrench} iconColor="text-indigo-400" label="Work Orders" value={workOrders.length} />
          <Metric icon={ClipboardList} iconColor="text-emerald-400" label="Tasks" value={tasks.length} />
          <Metric icon={Timer} iconColor="text-amber-400" label="Clocked In" value={activeClockedIn} />
          <Metric icon={BarChart3} iconColor="text-rose-400" label="Hours This Week" value={`${weekHours}h`} />
        </div>

        {/* Work Orders + Tasks + Timesheets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DarkSection title="Work Orders" icon={Wrench} iconColor="text-indigo-400" seeAllTo="/work-orders">
            <StatusRow title="Active" count={woGroups.Active} accentColor="text-emerald-400" onClick={() => navigateTo("/work-orders", "Active")} />
            <StatusRow title="On Hold" count={woGroups["On Hold"]} accentColor="text-amber-400" onClick={() => navigateTo("/work-orders", "On Hold")} />
            <StatusRow title="Archived" count={woGroups.Archived} accentColor="text-zinc-500" onClick={() => navigateTo("/work-orders", "Archived")} />
          </DarkSection>

          <DarkSection title="Tasks" icon={ClipboardList} iconColor="text-emerald-400" seeAllTo="/tasks">
            <StatusRow title="Queued" count={taskGroups.Queued} onClick={() => navigateTo("/tasks", "Queued")} />
            <StatusRow title="Scheduled" count={taskGroups.Scheduled} accentColor="text-indigo-400" onClick={() => navigateTo("/tasks", "Scheduled")} />
            <StatusRow title="Not Completed" count={taskGroups["Not Completed"]} accentColor="text-amber-400" onClick={() => navigateTo("/tasks", "Not Completed")} />
            <StatusRow title="Completed" count={taskGroups.Completed} accentColor="text-zinc-500" onClick={() => navigateTo("/tasks", "Completed")} />
          </DarkSection>

          <DarkSection title="Timesheets" icon={Clock} iconColor="text-amber-400" seeAllTo="/timesheets">
            <div className="py-3 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">This Week</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{thisWeekEntries.length}</p>
                <p className="text-xs text-muted-foreground/70">entries</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Total Hours</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{weekHours}h</p>
                <p className="text-xs text-muted-foreground/70">{weekMinutes} min</p>
              </div>
            </div>
            <div className="py-3 border-t border-border">
              <p className="text-[13px] text-muted-foreground font-medium mb-2">Currently clocked in</p>
              {activeEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground/70">No one clocked in</p>
              ) : (
                <div className="space-y-1.5">
                  {activeEntries.slice(0, 4).map(e => (
                    <div key={e.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                      <span className="truncate">{e.employee_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DarkSection>
        </div>

        {/* Tasks chart */}
        <DarkSection title="Tasks — upcoming days" icon={BarChart3} iconColor="text-rose-400" bgClass="bg-card">
          <div className="h-52 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tasksChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "#1a1a1a", border: "1px solid #27272a", borderRadius: 8, fontSize: 12, color: "#fff" }}
                  labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel || ""}
                  cursor={{ fill: "#ffffff0a" }}
                />
                <Bar dataKey="scheduled" name="Scheduled" fill="#818cf8" radius={[3, 3, 0, 0]} maxBarSize={20} stackId="a" />
                <Bar dataKey="completed" name="Completed" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={20} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DarkSection>

        {/* Quick Links */}
        <div>
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">Quick access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DarkQuickLink to="/work-orders" icon={Wrench} iconColor="text-indigo-400" label="Work Orders" subtitle={`${workOrders.length} total`} />
            <DarkQuickLink to="/tasks" icon={ClipboardList} iconColor="text-emerald-400" label="Tasks" subtitle={`${tasks.length} total`} />
            <DarkQuickLink to="/timesheets" icon={Clock} iconColor="text-amber-400" label="Timesheets" subtitle={`${timeEntries.length} entries`} />
            <DarkQuickLink to="/planner" icon={LayoutGrid} iconColor="text-rose-400" label="Planner" subtitle="Schedule tasks" />
          </div>
        </div>
      </div>
    </div>
  );
}