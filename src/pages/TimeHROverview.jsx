import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import {
  Users, Clock, CalendarCheck, DollarSign, ChevronRight
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from "recharts";
import { format, addDays, startOfDay, startOfWeek, endOfWeek } from "date-fns";
import {
  DarkHeader, DarkHero, Metric, StatusRow, DarkSection, DarkQuickLink, DarkLoading
} from "@/components/shared/DarkOverview";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function TimeHROverview() {
  const [employees, setEmployees] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [payPeriods, setPayPeriods] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [emp, lr, pp, te] = await batchedAll([
        () => withRetry(() => base44.entities.Employee.list("full_name", 500)),
        () => withRetry(() => base44.entities.LeaveRequest.list("-created_date", 200)),
        () => withRetry(() => base44.entities.PayPeriod.list("-created_date", 100)),
        () => withRetry(() => base44.entities.TimeEntry.list("-created_date", 500)),
      ], 2);
      setEmployees(Array.isArray(emp) ? emp : []);
      setLeaveRequests(Array.isArray(lr) ? lr : []);
      setPayPeriods(Array.isArray(pp) ? pp : []);
      setTimeEntries(Array.isArray(te) ? te : []);
      setLoading(false);
    };
    load();
  }, []);

  const empGroups = useMemo(() => {
    const groups = { Active: 0, "On Leave": 0, Inactive: 0, Terminated: 0 };
    for (const e of employees) {
      if (groups[e.status] !== undefined) groups[e.status]++;
    }
    return groups;
  }, [employees]);

  const leavePending = leaveRequests.filter(l => l.status === "pending").length;
  const leaveApprovedThisMonth = useMemo(() => {
    const now = new Date();
    return leaveRequests.filter(l => {
      if (l.status !== "approved") return false;
      const d = new Date(l.approved_at || l.created_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;
  }, [leaveRequests]);

  const thisWeekEntries = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
    return timeEntries.filter(e => {
      const d = new Date(e.clock_in_time);
      return d >= weekStart && d <= weekEnd;
    });
  }, [timeEntries]);

  const weekMinutes = thisWeekEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
  const weekHours = Math.round(weekMinutes / 60 * 10) / 10;
  const activeClockedIn = timeEntries.filter(e => e.status === "Active").length;

  const latestPayPeriod = payPeriods[0];

  const leaveChartData = useMemo(() => {
    const now = new Date();
    const thisMonth = leaveRequests.filter(l => {
      const d = new Date(l.created_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const map = { vacation: 0, sick: 0, other: 0 };
    for (const l of thisMonth) map[l.leave_type] = (map[l.leave_type] || 0) + (l.total_days || 0);
    return [
      { name: "Vacation", days: map.vacation, fill: "#818cf8" },
      { name: "Sick", days: map.sick, fill: "#fbbf24" },
      { name: "Other", days: map.other, fill: "#38bdf8" },
    ];
  }, [leaveRequests]);

  if (loading) return <DarkLoading />;

  const statusColor = (status) => {
    if (status === "paid") return "text-emerald-400";
    if (status === "approved") return "text-indigo-400";
    if (status === "in_review") return "text-amber-400";
    return "text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DarkHeader sectionLabel="Time & HR" createTo="/employees" />

      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
        <DarkHero
          title="Time & HR overview"
          subtitle="Track attendance, manage leave requests and run payroll — your workforce, organized."
        />

        {/* Top metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
          <Metric icon={Users} iconColor="text-indigo-400" label="Employees" value={employees.length} />
          <Metric icon={Clock} iconColor="text-emerald-400" label="Week Hours" value={`${weekHours}h`} />
          <Metric icon={CalendarCheck} iconColor="text-amber-400" label="Pending Leave" value={leavePending} />
          <Metric icon={DollarSign} iconColor="text-rose-400" label="Pay Periods" value={payPeriods.length} />
        </div>

        {/* Employees + Leave + Timesheets */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <DarkSection title="Employees" icon={Users} iconColor="text-indigo-400" seeAllTo="/employees">
            <StatusRow title="Active" count={empGroups.Active} accentColor="text-emerald-400" />
            <StatusRow title="On Leave" count={empGroups["On Leave"]} accentColor="text-amber-400" />
            <StatusRow title="Inactive" count={empGroups.Inactive} accentColor="text-muted-foreground" />
            <StatusRow title="Terminated" count={empGroups.Terminated} accentColor="text-muted-foreground/70" />
          </DarkSection>

          <DarkSection title="Leave" icon={CalendarCheck} iconColor="text-amber-400" seeAllTo="/leave">
            <div className="grid grid-cols-2 gap-4 py-3">
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Pending</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{leavePending}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Approved (mo)</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{leaveApprovedThisMonth}</p>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-[13px] text-muted-foreground font-medium mb-2">This month — days by type</p>
              <div className="h-28">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leaveChartData} layout="vertical" margin={{ top: 0, right: 10, left: 50, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#71717a" }} axisLine={false} tickLine={false} width={50} />
                    <Tooltip
                      contentStyle={{ background: "#1a1a1a", border: "1px solid #27272a", borderRadius: 8, fontSize: 12, color: "#fff" }}
                      formatter={(v) => [`${v} days`, ""]}
                      cursor={{ fill: "#ffffff0a" }}
                    />
                    <Bar dataKey="days" radius={[0, 3, 3, 0]} maxBarSize={16}>
                      {leaveChartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </DarkSection>

          <DarkSection title="Timesheets" icon={Clock} iconColor="text-emerald-400" seeAllTo="/timesheets">
            <div className="grid grid-cols-2 gap-4 py-3">
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Week Entries</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{thisWeekEntries.length}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Week Hours</p>
                <p className="text-xl font-bold text-foreground mt-0.5">{weekHours}h</p>
              </div>
            </div>
            <div className="border-t border-border pt-3">
              <p className="text-[13px] text-muted-foreground font-medium mb-2">Clocked in now</p>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <p className="text-sm font-semibold text-foreground">{activeClockedIn} employee{activeClockedIn !== 1 ? "s" : ""}</p>
              </div>
            </div>
          </DarkSection>
        </div>

        {/* Payroll summary */}
        <DarkSection title="Payroll" icon={DollarSign} iconColor="text-rose-400" seeAllTo="/payroll" bgClass="bg-card">
          {latestPayPeriod ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4">
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Latest Period</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{latestPayPeriod.name}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Status</p>
                <p className={`text-sm font-semibold mt-0.5 ${statusColor(latestPayPeriod.status)}`}>
                  {latestPayPeriod.status?.replace("_", " ")}
                </p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Employees</p>
                <p className="text-sm font-semibold text-foreground mt-0.5">{latestPayPeriod.employee_count || 0}</p>
              </div>
              <div>
                <p className="text-[13px] text-muted-foreground font-medium">Total Net Pay</p>
                <p className="text-sm font-bold text-emerald-400 mt-0.5">AED {fmt(latestPayPeriod.total_net || 0)}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground/70 py-6 text-center">No pay periods yet.</p>
          )}
        </DarkSection>

        {/* Quick Links */}
        <div>
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">Quick access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DarkQuickLink to="/employees" icon={Users} iconColor="text-indigo-400" label="Employees" subtitle={`${employees.length} total`} />
            <DarkQuickLink to="/timesheets" icon={Clock} iconColor="text-emerald-400" label="Timesheets" subtitle={`${timeEntries.length} entries`} />
            <DarkQuickLink to="/leave" icon={CalendarCheck} iconColor="text-amber-400" label="Leave" subtitle={`${leaveRequests.length} requests`} />
            <DarkQuickLink to="/payroll" icon={DollarSign} iconColor="text-rose-400" label="Payroll" subtitle={`${payPeriods.length} periods`} />
          </div>
        </div>
      </div>
    </div>
  );
}