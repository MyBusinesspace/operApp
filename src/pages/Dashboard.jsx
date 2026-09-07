import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll, withCache } from "@/lib/apiHelpers";
import {
  ClipboardList, Users, FileText, CalendarDays,
  DollarSign, TrendingUp, TrendingDown, Wrench,
  Building2, BarChart3
} from "lucide-react";
import RevenueChart from "../components/dashboard/RevenueChart";
import WorkOrdersChart from "../components/dashboard/WorkOrdersChart";
import RecentActivity from "../components/dashboard/RecentActivity";
import UpcomingTasks from "../components/dashboard/UpcomingTasks";
import ClockedInWidget from "../components/dashboard/ClockedInWidget";
import { Metric } from "@/components/shared/DarkOverview";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const overviewLinks = [
  { label: "Business", path: "/business-overview", icon: Building2, color: "text-indigo-400" },
  { label: "Operations", path: "/operations-overview", icon: Wrench, color: "text-emerald-400" },
  { label: "Time & HR", path: "/timehr-overview", icon: Users, color: "text-amber-400" },
  { label: "Finance", path: "/finance-overview", icon: DollarSign, color: "text-rose-400" },
  { label: "Sales", path: "/sales-overview", icon: TrendingUp, color: "text-emerald-400" },
  { label: "Purchases", path: "/purchasing-overview", icon: TrendingDown, color: "text-sky-400" },
  { label: "Accounting", path: "/accounting", icon: BarChart3, color: "text-indigo-400" },
  { label: "Reports", path: "/reports", icon: FileText, color: "text-amber-400" },
];

export default function Dashboard() {
  const [data, setData] = useState({
    workOrders: [], tasks: [], employees: [], invoices: [],
    bills: [], leaveRequests: [], contacts: [], timeEntries: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const safe = (r) => (Array.isArray(r) ? r : []);
      try {
        // Batch in groups of 2 with retry+backoff to avoid rate limits
        const [wo, t] = await batchedAll([
          () => withRetry(() => base44.entities.WorkOrder.list("-created_date", 200)),
          () => withRetry(() => base44.entities.Task.list("-created_date", 500)),
        ]);
        const [emp, inv] = await batchedAll([
          () => withRetry(() => base44.entities.Employee.list("full_name", 200)),
          () => withRetry(() => base44.entities.Invoice.list("-created_date", 200)),
        ]);
        const [bl, lr] = await batchedAll([
          () => withRetry(() => base44.entities.Bill.list("-created_date", 200)),
          () => withRetry(() => base44.entities.LeaveRequest.list("-created_date", 100)),
        ]);
        const [ct, te] = await batchedAll([
          () => withRetry(() => base44.entities.Contact.list("full_name", 200)),
          () => withRetry(() => base44.entities.TimeEntry.list("-created_date", 300)),
        ]);
        setData({
          workOrders: safe(wo), tasks: safe(t), employees: safe(emp),
          invoices: safe(inv), bills: safe(bl), leaveRequests: safe(lr),
          contacts: safe(ct), timeEntries: safe(te),
        });
      } catch (e) {
        console.error("Dashboard load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const { workOrders, tasks, employees, invoices, bills, leaveRequests, timeEntries } = data;

  const activeWO = workOrders.filter(w => w.status === "Active").length;
  const pendingLeave = leaveRequests.filter(l => l.status === "pending").length;
  const pendingInvoices = invoices.filter(i => i.status === "Awaiting Payment").length;
  const unpaidTotal = invoices.filter(i => i.status === "Awaiting Payment" || i.status === "Draft")
    .reduce((s, i) => s + (i.total || 0) - (i.amount_paid || 0), 0);
  const activeEmployees = employees.filter(e => e.status === "Active").length;
  const activeClockedIn = timeEntries.filter(e => e.status === "Active").length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
        {/* Header */}
        <div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground" style={{ letterSpacing: "-0.02em" }}>
            Dashboard
          </h1>
          <p className="mt-3 text-[15px] text-muted-foreground">
            Welcome back. Here's what's happening today.
          </p>
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
          <Metric icon={ClipboardList} iconColor="text-indigo-400" label="Active Work Orders" value={activeWO} />
          <Metric icon={DollarSign} iconColor="text-emerald-400" label="Pending Invoices" value={pendingInvoices} />
          <Metric icon={CalendarDays} iconColor="text-amber-400" label="Pending Leave" value={pendingLeave} />
          <Metric icon={Users} iconColor="text-rose-400" label="Active Employees" value={activeEmployees} />
        </div>

        {/* Overview links */}
        <div>
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">Overview sections</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {overviewLinks.map(link => (
              <Link key={link.path} to={link.path}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group">
                <link.icon className={`w-5 h-5 ${link.color}`} strokeWidth={1.5} />
                <span className="text-xs font-medium text-muted-foreground text-center">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3">
            <RevenueChart invoices={invoices} bills={bills} />
          </div>
          <div className="lg:col-span-2">
            <WorkOrdersChart workOrders={workOrders} />
          </div>
        </div>

        {/* Activity + Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <RecentActivity workOrders={workOrders} tasks={tasks} invoices={invoices} leaveRequests={leaveRequests} />
          <UpcomingTasks tasks={tasks} />
        </div>

        {/* Clocked In Widget */}
        <ClockedInWidget activeEntries={timeEntries} />
      </div>
    </div>
  );
}