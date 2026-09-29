import { useMemo } from "react";
import { Navigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  DollarSign,
  FileText,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import RevenueChart from "@/components/dashboard/RevenueChart";
import WorkOrdersChart from "@/components/dashboard/WorkOrdersChart";
import RecentActivity from "@/components/dashboard/RecentActivity";
import UpcomingTasks from "@/components/dashboard/UpcomingTasks";
import { Metric } from "@/components/shared/DarkOverview";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoClockedIn from "../components/DemoClockedIn.jsx";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

const overviewLinks = [
  { label: "Business", icon: Building2, color: "text-indigo-400" },
  { label: "Operations", icon: Wrench, color: "text-emerald-400" },
  { label: "Time & HR", icon: Users, color: "text-amber-400" },
  { label: "Finance", icon: DollarSign, color: "text-rose-400" },
  { label: "Sales", icon: TrendingUp, color: "text-emerald-400" },
  { label: "Purchases", icon: TrendingDown, color: "text-sky-400" },
  { label: "Accounting", icon: BarChart3, color: "text-indigo-400" },
  { label: "Reports", icon: FileText, color: "text-amber-400" },
];

export default function DemoDashboard() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();

  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  if (!enabled) {
    return <Navigate to="/" replace />;
  }

  if (!industryId || !data) {
    return <Navigate to="/demo" replace />;
  }

  const {
    workOrders,
    tasks,
    employees,
    invoices,
    bills,
    leaveRequests,
    timeEntries,
  } = data;

  const activeWO = workOrders.filter((w) => w.status === "Active").length;
  const pendingLeave = leaveRequests.filter((l) => l.status === "pending").length;
  const pendingInvoices = invoices.filter(
    (i) => i.status === "Awaiting Payment"
  ).length;
  const activeEmployees = employees.filter((e) => e.status === "Active").length;

  return (
    <div className="min-h-screen bg-background">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        <div className="demo-readonly max-w-[1440px] mx-auto px-4 lg:px-6 py-6">
          <div className="max-w-[1200px] mx-auto space-y-10">
            <div>
              <h1
                className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground"
                style={{ letterSpacing: "-0.02em" }}
              >
                Dashboard
              </h1>
              <p className="mt-3 text-[15px] text-muted-foreground">
                Welcome back. Here's what's happening today.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
              <Metric
                icon={ClipboardList}
                iconColor="text-indigo-400"
                label="Active Work Orders"
                value={activeWO}
              />
              <Metric
                icon={DollarSign}
                iconColor="text-emerald-400"
                label="Pending Invoices"
                value={pendingInvoices}
              />
              <Metric
                icon={CalendarDays}
                iconColor="text-amber-400"
                label="Pending Leave"
                value={pendingLeave}
              />
              <Metric
                icon={Users}
                iconColor="text-rose-400"
                label="Active Employees"
                value={activeEmployees}
              />
            </div>

            <div>
              <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">
                Overview sections
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                {overviewLinks.map((link) => (
                  <div
                    key={link.label}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card opacity-90"
                    aria-disabled="true"
                    title="Demo — view only"
                  >
                    <link.icon
                      className={`w-5 h-5 ${link.color}`}
                      strokeWidth={1.5}
                    />
                    <span className="text-xs font-medium text-muted-foreground text-center">
                      {link.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3">
                <RevenueChart invoices={invoices} bills={bills} />
              </div>
              <div className="lg:col-span-2">
                <WorkOrdersChart workOrders={workOrders} />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <RecentActivity
                workOrders={workOrders}
                tasks={tasks}
                invoices={invoices}
                leaveRequests={leaveRequests}
              />
              <UpcomingTasks tasks={tasks} />
            </div>

            <DemoClockedIn activeEntries={timeEntries} />
          </div>
        </div>

        <DemoGuideCard pageId="dashboard" />
      </main>
    </div>
  );
}
