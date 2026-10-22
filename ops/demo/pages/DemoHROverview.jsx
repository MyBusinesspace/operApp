import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarCheck,
  ChevronRight,
  Clock,
  DollarSign,
  Users,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";
import { startOfWeek, endOfWeek } from "date-fns";
import {
  DarkHero,
  Metric,
  StatusRow,
  DarkSection,
} from "@/components/shared/DarkOverview";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function mapLeaveType(t) {
  const s = (t || "").toLowerCase();
  if (s === "vacation" || s === "annual") return "vacation";
  if (s === "sick") return "sick";
  return "other";
}

function DemoQuickCard({ icon: Icon, iconColor, label, subtitle, to }) {
  const className =
    "group flex items-center gap-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors p-4";
  const body = (
    <>
      <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">
          {subtitle}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <div className={`${className} cursor-default`} title="Demo — view only">
      {body}
    </div>
  );
}

export default function DemoHROverview() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const employees = data.employees || [];
  const leaveRequests = data.leaveRequests || [];
  const payPeriods = data.payPeriods || [];
  const timeEntries = data.timeEntries || [];

  const empGroups = { Active: 0, "On Leave": 0, Inactive: 0, Terminated: 0 };
  for (const e of employees) {
    if (empGroups[e.status] !== undefined) empGroups[e.status]++;
  }

  const leavePending = leaveRequests.filter((l) => l.status === "pending").length;
  const now = new Date();
  const leaveApprovedThisMonth = leaveRequests.filter((l) => {
    if (l.status !== "approved") return false;
    const d = new Date(l.approved_at || l.created_date);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
  const thisWeekEntries = timeEntries.filter((e) => {
    const d = new Date(e.clock_in_time || e.created_date);
    return d >= weekStart && d <= weekEnd;
  });
  const weekMinutes = thisWeekEntries.reduce((s, e) => {
    if (e.clock_in_time && e.clock_out_time) {
      return (
        s +
        Math.max(
          0,
          Math.round(
            (new Date(e.clock_out_time) - new Date(e.clock_in_time)) / 60000
          )
        )
      );
    }
    return s + (e.duration_minutes || 0);
  }, 0);
  const weekHours = Math.round((weekMinutes / 60) * 10) / 10;
  const activeClockedIn = timeEntries.filter((e) => e.status === "Active").length;
  const latestPayPeriod = payPeriods[0];

  const leaveChartData = (() => {
    const thisMonth = leaveRequests.filter((l) => {
      const d = new Date(l.created_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const map = { vacation: 0, sick: 0, other: 0 };
    for (const l of thisMonth) {
      map[mapLeaveType(l.leave_type)] += l.total_days || 0;
    }
    return [
      { name: "Vacation", days: map.vacation, fill: "#818cf8" },
      { name: "Sick", days: map.sick, fill: "#fbbf24" },
      { name: "Other", days: map.other, fill: "#38bdf8" },
    ];
  })();

  const statusColor = (status) => {
    if (status === "paid") return "text-emerald-400";
    if (status === "approved") return "text-indigo-400";
    if (status === "in_review") return "text-amber-400";
    return "text-muted-foreground";
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        <div className="sticky top-[var(--nav-height)] z-10 bg-background/80 backdrop-blur-xl border-b border-border">
          <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-medium tracking-tight">
              <Link
                to="/demo/app"
                className="hover:text-foreground transition-colors"
              >
                Overview
              </Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-foreground">Time & HR</span>
            </div>
            <Link
              to="/demo/app/employees"
              className="flex items-center gap-1.5 text-xs text-primary-foreground bg-primary hover:bg-primary/90 transition-colors font-semibold px-3.5 py-1.5 rounded-lg"
            >
              Create <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
          <DarkHero
            title="Time & HR overview"
            subtitle="Track attendance, manage leave requests and run payroll — your workforce, organized."
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
            <Metric
              icon={Users}
              iconColor="text-indigo-400"
              label="Employees"
              value={employees.length}
            />
            <Metric
              icon={Clock}
              iconColor="text-emerald-400"
              label="Week Hours"
              value={`${weekHours}h`}
            />
            <Metric
              icon={CalendarCheck}
              iconColor="text-amber-400"
              label="Pending Leave"
              value={leavePending}
            />
            <Metric
              icon={DollarSign}
              iconColor="text-rose-400"
              label="Pay Periods"
              value={payPeriods.length}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <DarkSection
              title="Employees"
              icon={Users}
              iconColor="text-indigo-400"
              seeAllTo="/demo/app/employees"
            >
              <StatusRow
                title="Active"
                count={empGroups.Active}
                accentColor="text-emerald-400"
              />
              <StatusRow
                title="On Leave"
                count={empGroups["On Leave"]}
                accentColor="text-amber-400"
              />
              <StatusRow
                title="Inactive"
                count={empGroups.Inactive}
                accentColor="text-muted-foreground"
              />
              <StatusRow
                title="Terminated"
                count={empGroups.Terminated}
                accentColor="text-muted-foreground/70"
              />
            </DarkSection>

            <DarkSection
              title="Leave"
              icon={CalendarCheck}
              iconColor="text-amber-400"
              seeAllTo="/demo/app/leave"
            >
              <div className="grid grid-cols-2 gap-4 py-3">
                <div>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Pending
                  </p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {leavePending}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Approved (mo)
                  </p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {leaveApprovedThisMonth}
                  </p>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-[13px] text-muted-foreground font-medium mb-2">
                  This month — days by type
                </p>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={leaveChartData}
                      layout="vertical"
                      margin={{ top: 0, right: 10, left: 50, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="#27272a"
                        horizontal={false}
                      />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: "#71717a" }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 10, fill: "#71717a" }}
                        axisLine={false}
                        tickLine={false}
                        width={50}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#1a1a1a",
                          border: "1px solid #27272a",
                          borderRadius: 8,
                          fontSize: 12,
                          color: "#fff",
                        }}
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

            <DarkSection
              title="Timesheets"
              icon={Clock}
              iconColor="text-emerald-400"
              seeAllTo="/demo/app/timesheets"
            >
              <div className="grid grid-cols-2 gap-4 py-3">
                <div>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Week Entries
                  </p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {thisWeekEntries.length}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Week Hours
                  </p>
                  <p className="text-xl font-bold text-foreground mt-0.5">
                    {weekHours}h
                  </p>
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <p className="text-[13px] text-muted-foreground font-medium mb-2">
                  Clocked in now
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <p className="text-sm font-semibold text-foreground">
                    {activeClockedIn} employee
                    {activeClockedIn !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </DarkSection>
          </div>

          <DarkSection
            title="Payroll"
            icon={DollarSign}
            iconColor="text-rose-400"
            bgClass="bg-card"
          >
            {latestPayPeriod ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4">
                <div>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Latest Period
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    {latestPayPeriod.name}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Status
                  </p>
                  <p
                    className={`text-sm font-semibold mt-0.5 ${statusColor(
                      latestPayPeriod.status
                    )}`}
                  >
                    {latestPayPeriod.status?.replace("_", " ")}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Employees
                  </p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    {latestPayPeriod.employee_count || 0}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] text-muted-foreground font-medium">
                    Total Net Pay
                  </p>
                  <p className="text-sm font-bold text-emerald-400 mt-0.5">
                    AED {fmt(latestPayPeriod.total_net || 0)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/70 py-6 text-center">
                No pay periods yet.
              </p>
            )}
          </DarkSection>

          <div>
            <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">
              Quick access
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <DemoQuickCard
                to="/demo/app/employees"
                icon={Users}
                iconColor="text-indigo-400"
                label="Employees"
                subtitle={`${employees.length} total`}
              />
              <DemoQuickCard
                to="/demo/app/timesheets"
                icon={Clock}
                iconColor="text-emerald-400"
                label="Timesheets"
                subtitle={`${timeEntries.length} entries`}
              />
              <DemoQuickCard
                to="/demo/app/leave"
                icon={CalendarCheck}
                iconColor="text-amber-400"
                label="Leave"
                subtitle={`${leaveRequests.length} requests`}
              />
              <DemoQuickCard
                icon={DollarSign}
                iconColor="text-rose-400"
                label="Payroll"
                subtitle={`${payPeriods.length} periods`}
              />
            </div>
          </div>
        </div>

        <DemoGuideCard pageId="hr-overview" />
      </main>
    </div>
  );
}
