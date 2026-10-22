import { useCallback, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowUpRight,
  ChevronRight,
  ClipboardList,
  Clock,
  FileText,
  LayoutGrid,
  Wrench,
} from "lucide-react";
import OperationsFlowDiagram from "@/components/operations/OperationsFlowDiagram";
import OperationsPeriodFilter from "@/components/operations/OperationsPeriodFilter";
import OperationsTrendChart from "@/components/operations/OperationsTrendChart";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

function nodeCount(total, breakdown = []) {
  return { total, breakdown };
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

function buildDemoTrend(mode, year, month) {
  if (mode === "day") {
    return Array.from({ length: 12 }, (_, i) => {
      const h = i * 2;
      return {
        label: String(h).padStart(2, "0"),
        fullLabel: `${String(h).padStart(2, "0")}:00`,
        tasks: Math.max(0, Math.round(2 + Math.sin(i) * 2)),
        reports: Math.max(0, Math.round(1 + Math.cos(i) * 1.5)),
      };
    });
  }
  if (mode === "year") {
    return Array.from({ length: 12 }, (_, i) => {
      const d = new Date(year, i, 1);
      return {
        label: d.toLocaleString("en", { month: "short" }),
        fullLabel: d.toLocaleString("en", { month: "long", year: "numeric" }),
        tasks: 8 + ((i * 3) % 7),
        reports: 3 + ((i * 2) % 5),
      };
    });
  }
  // month / default — last weeks of selected month
  const [y, m] = (month || `${year}-01`).split("-").map(Number);
  return Array.from({ length: 8 }, (_, i) => {
    const day = 1 + i * 3;
    const d = new Date(y, m - 1, day);
    return {
      label: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      fullLabel: d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }),
      tasks: 4 + ((i * 2) % 6),
      reports: 1 + (i % 4),
    };
  });
}

const DEMO_REPORTS = [
  {
    label: "Time & Cost by Client",
    desc: "Hours logged and labour cost grouped by client",
    stat: "142h logged",
  },
  {
    label: "Time & Cost by Project",
    desc: "Hours logged and labour cost grouped by project",
    stat: "142h logged",
  },
  {
    label: "Working Report Validation History",
    desc: "Daily validation runs — reports checked, violations found and quarantined",
    stat: "12 runs · 3 violations",
  },
  {
    label: "Working Reports",
    desc: "Browse and print working reports by day/week, contact, worker, or linked task",
    stat: "28 reports",
  },
];

export default function DemoOperationsOverview() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const [periodMode, setPeriodMode] = useState("month");
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  );
  const [periodDay, setPeriodDay] = useState(
    `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`
  );

  const years = useCallback(() => {
    const now = new Date().getFullYear();
    const list = [];
    for (let y = now; y >= 2020; y--) list.push(y);
    return list;
  }, []);

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const contacts = data.contacts || [];
  const projects = data.projects || [];
  const assets = data.assets || [];
  const workOrders = data.workOrders || [];
  const tasks = data.tasks || [];
  const timeEntries = data.timeEntries || [];
  const invoices = data.invoices || [];
  const bills = data.bills || [];

  const customers = contacts.filter(
    (c) => c.type === "Customer" || c.type === "Both"
  );
  const providers = contacts.filter(
    (c) => c.type === "Provider" || c.type === "Both"
  );

  const opsCounts = {
    customer: nodeCount(customers.length, [
      {
        label: "Active",
        value: customers.filter((c) => c.status === "Active").length,
      },
    ]),
    project: nodeCount(projects.length, [
      {
        label: "Active",
        value: projects.filter((p) => p.status === "Active").length,
      },
      {
        label: "On Hold",
        value: projects.filter((p) => p.status === "On Hold").length,
      },
    ]),
    asset: nodeCount(assets.length, [
      {
        label: "In Use",
        value: assets.filter((a) => a.status === "In Use").length,
      },
      {
        label: "Available",
        value: assets.filter((a) => a.status === "Available").length,
      },
    ]),
    wo: nodeCount(workOrders.length, [
      {
        label: "Active",
        value: workOrders.filter((w) => w.status === "Active").length,
      },
    ]),
    tasks: nodeCount(tasks.length, [
      {
        label: "Open",
        value: tasks.filter(
          (t) =>
            ["Queued", "Scheduled", "Not Completed", "Open", "In Progress"].includes(
              t.status
            )
        ).length,
      },
    ]),
    timesheets: nodeCount(timeEntries.length, [
      {
        label: "Active",
        value: timeEntries.filter((t) => t.status === "Active").length,
      },
    ]),
    invoice: nodeCount(invoices.length, [
      {
        label: "Awaiting",
        value: invoices.filter((i) => i.status === "Awaiting Payment").length,
      },
    ]),
    bill: nodeCount(bills.length, [
      {
        label: "Awaiting",
        value: bills.filter((b) => b.status === "Awaiting Payment").length,
      },
    ]),
    providers: nodeCount(providers.length),
    organization: { hideCount: true, caption: data.companyName },
    reports: nodeCount(
      Math.max(3, tasks.filter((t) => t.status === "Completed").length + 2)
    ),
  };

  const trend = buildDemoTrend(periodMode, periodYear, periodMonth);
  const trendTitle =
    periodMode === "year"
      ? `Tasks & Working Reports — ${periodYear}`
      : periodMode === "month"
        ? `Tasks & Working Reports — ${new Date(periodMonth + "-01").toLocaleString("en", { month: "long", year: "numeric" })}`
        : periodMode === "day"
          ? `Tasks & Working Reports — ${new Date(periodDay + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
          : "Tasks & Working Reports — last 12 months";

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
              <span className="text-foreground">Operations</span>
            </div>
            <Link
              to="/demo/app/work-orders"
              className="flex items-center gap-1.5 text-xs text-primary-foreground bg-primary hover:bg-primary/90 transition-colors font-semibold px-3.5 py-1.5 rounded-lg"
            >
              Create <ArrowUpRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
          <OperationsFlowDiagram
            headerExtra={
              <OperationsPeriodFilter
                mode={periodMode}
                year={periodYear}
                month={periodMonth}
                day={periodDay}
                onMode={setPeriodMode}
                onYear={setPeriodYear}
                onMonth={setPeriodMonth}
                onDay={setPeriodDay}
                years={years()}
              />
            }
            counts={opsCounts}
          />

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-100 dark:bg-sky-500/15">
                  <Clock className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                </div>
                <span className="text-base font-semibold text-foreground">
                  Operations
                </span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {DEMO_REPORTS.length} reports
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2">
              {DEMO_REPORTS.map((r, i) => (
                <div
                  key={r.label}
                  className={`flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors cursor-default ${
                    i < 3 ? "border-b border-border" : ""
                  } ${i >= 2 ? "md:border-b-0" : ""} ${
                    i % 2 === 0 ? "md:border-r border-border" : ""
                  }`}
                  title="Demo — view only"
                >
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{r.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full whitespace-nowrap">
                    {r.stat}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <OperationsTrendChart
            key={`${periodMode}-${periodYear}-${periodMonth}-${periodDay}`}
            data={trend}
            title={trendTitle}
            mode={periodMode}
          />

          <div>
            <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">
              Quick access
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <DemoQuickCard
                to="/demo/app/work-orders"
                icon={Wrench}
                iconColor="text-indigo-400"
                label="Work Orders"
                subtitle={`${workOrders.length} total`}
              />
              <DemoQuickCard
                to="/demo/app/tasks"
                icon={ClipboardList}
                iconColor="text-emerald-400"
                label="Tasks"
                subtitle={`${tasks.length} total`}
              />
              <DemoQuickCard
                to="/demo/app/timesheets"
                icon={Clock}
                iconColor="text-amber-400"
                label="Timesheets"
                subtitle={`${timeEntries.length} entries`}
              />
              <DemoQuickCard
                to="/demo/app/planner"
                icon={LayoutGrid}
                iconColor="text-rose-400"
                label="Planner"
                subtitle="Schedule tasks"
              />
            </div>
          </div>
        </div>

        <DemoGuideCard pageId="operations-overview" />
      </main>
    </div>
  );
}
