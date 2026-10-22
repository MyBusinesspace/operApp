import { useMemo, useState, useCallback } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  BarChart3,
  Building2,
  DollarSign,
  FileText,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import BankAccountWidget from "@/components/dashboard/xero/BankAccountWidget";
import InvoicesOwedWidget from "@/components/dashboard/xero/InvoicesOwedWidget";
import BillsToPayWidget from "@/components/dashboard/xero/BillsToPayWidget";
import RecentPaymentsWidget from "@/components/dashboard/xero/RecentPaymentsWidget";
import CashInOutWidget from "@/components/dashboard/xero/CashInOutWidget";
import NetProfitWidget from "@/components/dashboard/xero/NetProfitWidget";
import WatchlistWidget from "@/components/dashboard/xero/WatchlistWidget";
import KeyMetricsWidget from "@/components/dashboard/xero/KeyMetricsWidget";
import { buildDemoKeyMetricsData } from "@/lib/keyMetricsDemoData";
import OperationsFlowDiagram from "@/components/operations/OperationsFlowDiagram";
import OperationsPeriodFilter from "@/components/operations/OperationsPeriodFilter";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

const overviewLinks = [
  {
    label: "Business",
    path: "/demo/app/business-overview",
    icon: Building2,
    color: "text-indigo-400",
  },
  {
    label: "Operations",
    path: "/demo/app/operations-overview",
    icon: Wrench,
    color: "text-emerald-400",
  },
  { label: "Time & HR", path: null, icon: Users, color: "text-amber-400" },
  { label: "Finance", path: null, icon: DollarSign, color: "text-rose-400" },
  {
    label: "Sales",
    path: "/demo/app/sales-overview",
    icon: TrendingUp,
    color: "text-emerald-400",
  },
  {
    label: "Purchases",
    path: "/demo/app/purchasing-overview",
    icon: TrendingDown,
    color: "text-sky-400",
  },
  { label: "Accounting", path: null, icon: BarChart3, color: "text-indigo-400" },
  { label: "Reports", path: null, icon: FileText, color: "text-amber-400" },
];

const DEMO_BANKS = [
  {
    id: "demo-bank-ops",
    name: "Operating Account",
    account_number: "4521",
    account_type: "Bank",
    currency: "AED",
    status: "Active",
    show_on_dashboard: true,
    opening_balance: 285000,
    opening_balance_date: "2025-01-01",
  },
  {
    id: "demo-bank-payroll",
    name: "Payroll Account",
    account_number: "8890",
    account_type: "Bank",
    currency: "AED",
    status: "Active",
    show_on_dashboard: true,
    opening_balance: 92000,
    opening_balance_date: "2025-01-01",
  },
  {
    id: "demo-bank-savings",
    name: "Reserve Savings",
    account_number: "1104",
    account_type: "Bank",
    currency: "AED",
    status: "Active",
    show_on_dashboard: true,
    opening_balance: 410000,
    opening_balance_date: "2025-01-01",
  },
];

function nodeCount(total, breakdown = []) {
  return { total, breakdown };
}

export default function DemoDashboard() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();

  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const [demoMode, setDemoMode] = useState(true);
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

  const finance = useMemo(() => buildDemoKeyMetricsData(), []);

  if (!enabled) {
    return <Navigate to="/" replace />;
  }

  if (!industryId || !data) {
    return <Navigate to="/demo" replace />;
  }

  const contacts = data.contacts || [];
  const projects = data.projects || [];
  const assets = data.assets || [];
  const workOrders = data.workOrders || [];
  const tasks = data.tasks || [];
  const employees = data.employees || [];
  const timeEntries = data.timeEntries || [];
  const rawInvoices = data.invoices || [];
  const bills = data.bills || [];

  const invoices = rawInvoices.map((inv, i) => {
    if (inv.due_date) return inv;
    const d = new Date();
    d.setDate(d.getDate() + (i % 5 - 2) * 7);
    return { ...inv, due_date: d.toISOString().slice(0, 10) };
  });

  const bankTransactions = finance.bankTransactions.map((t, i) => ({
    ...t,
    bank_account_id: DEMO_BANKS[i % DEMO_BANKS.length].id,
    status: i % 9 === 0 ? "Unreconciled" : "Reconciled",
  }));

  const journalEntries = finance.journalEntries;
  const chartAccounts = finance.chartAccounts;
  const kmJournalEntries = demoMode ? journalEntries : [];
  const kmBankTransactions = demoMode ? bankTransactions : [];
  const kmChartAccounts = demoMode ? chartAccounts : [];

  const customers = contacts.filter(
    (c) => c.type === "Customer" || c.type === "Both"
  );
  const providers = contacts.filter(
    (c) => c.type === "Provider" || c.type === "Both"
  );

  const opsCounts = {
    customer: nodeCount(customers.length, [
      { label: "Active", value: customers.filter((c) => c.status === "Active").length },
    ]),
    project: nodeCount(projects.length, [
      { label: "Active", value: projects.filter((p) => p.status === "Active").length },
      { label: "On Hold", value: projects.filter((p) => p.status === "On Hold").length },
    ]),
    asset: nodeCount(assets.length, [
      { label: "In Use", value: assets.filter((a) => a.status === "In Use").length },
      { label: "Available", value: assets.filter((a) => a.status === "Available").length },
    ]),
    wo: nodeCount(workOrders.length, [
      { label: "Active", value: workOrders.filter((w) => w.status === "Active").length },
    ]),
    tasks: nodeCount(tasks.length, [
      { label: "Open", value: tasks.filter((t) => ["Queued", "Scheduled", "Not Completed", "Open", "In Progress"].includes(t.status)).length },
    ]),
    timesheets: nodeCount(timeEntries.length, [
      { label: "Active", value: timeEntries.filter((t) => t.status === "Active").length },
    ]),
    invoice: nodeCount(invoices.length, [
      { label: "Awaiting", value: invoices.filter((i) => i.status === "Awaiting Payment").length },
    ]),
    bill: nodeCount(bills.length, [
      { label: "Awaiting", value: bills.filter((b) => b.status === "Awaiting Payment").length },
    ]),
    providers: nodeCount(providers.length),
    organization: { hideCount: true, caption: data.companyName },
    employees: nodeCount(employees.length, [
      { label: "Active", value: employees.filter((e) => e.status === "Active").length },
    ]),
    reports: nodeCount(Math.max(3, tasks.filter((t) => t.status === "Completed").length + 2)),
  };

  return (
    <div className="min-h-screen bg-background">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        <div className="max-w-[1400px] mx-auto px-6 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Overall Quick View
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your financial and operational snapshot at a glance.
            </p>
          </div>

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

          <div className="relative">
            <KeyMetricsWidget
              journalEntries={kmJournalEntries}
              bankTransactions={kmBankTransactions}
              chartAccounts={kmChartAccounts}
            />
            <button
              type="button"
              onClick={() => setDemoMode((v) => !v)}
              className={`absolute top-3 right-3 inline-flex items-center gap-1.5 px-3 h-8 rounded-md text-xs font-medium border transition-colors ${
                demoMode
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              {demoMode ? "Demo data on" : "Load demo data"}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {DEMO_BANKS.map((bank) => (
              <BankAccountWidget
                key={bank.id}
                account={bank}
                transactions={bankTransactions}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <InvoicesOwedWidget invoices={invoices} />
            <BillsToPayWidget bills={bills} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CashInOutWidget transactions={bankTransactions} />
            <NetProfitWidget
              journalEntries={journalEntries}
              chartAccounts={chartAccounts}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RecentPaymentsWidget invoices={invoices} />
            <WatchlistWidget
              chartAccounts={chartAccounts}
              journalEntries={journalEntries}
            />
          </div>

          <div className="pt-4">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Quick access
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
              {overviewLinks.map((link) => {
                const className =
                  "flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group";
                const body = (
                  <>
                    <link.icon
                      className={`w-5 h-5 ${link.color}`}
                      strokeWidth={1.5}
                    />
                    <span className="text-xs font-medium text-muted-foreground text-center group-hover:text-foreground transition-colors">
                      {link.label}
                    </span>
                  </>
                );
                if (link.path) {
                  return (
                    <Link key={link.label} to={link.path} className={className}>
                      {body}
                    </Link>
                  );
                }
                return (
                  <div
                    key={link.label}
                    className={`${className} cursor-default`}
                    title="Demo — view only"
                  >
                    {body}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DemoGuideCard pageId="dashboard" />
      </main>
    </div>
  );
}
