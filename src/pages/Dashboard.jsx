import React, { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import { withRetry as withRetrySdk } from "@/lib/sdkRetry";
import {
  Building2, Wrench, Users, DollarSign, TrendingUp, TrendingDown, BarChart3, FileText,
  Clock, CheckSquare, ClipboardList, UserCheck,
} from "lucide-react";
import DepartmentQuickView from "@/components/dashboard/DepartmentQuickView";
import { buildDepartmentStats } from "@/lib/departmentStats";
import OperationsFlowDiagram from "@/components/operations/OperationsFlowDiagram";
import OperationsPeriodFilter from "@/components/operations/OperationsPeriodFilter";
import { useAuth } from "@/lib/AuthContext";
import WelcomeWizard from "@/components/onboarding/WelcomeWizard";

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

const quickAccessLinks = [
  { label: "Timesheets", path: "/timesheets", icon: Clock, color: "text-primary" },
  { label: "Tasks", path: "/tasks", icon: CheckSquare, color: "text-emerald-500" },
  { label: "Work Orders", path: "/work-orders", icon: ClipboardList, color: "text-sky-500" },
  { label: "Leave", path: "/leave", icon: UserCheck, color: "text-amber-500" },
];

export default function Dashboard() {
  const [data, setData] = useState({
    bankAccounts: [], bankTransactions: [], invoices: [], bills: [], journalEntries: [], chartAccounts: [],
    contacts: [], projects: [], assets: [], workOrders: [], tasks: [], employees: [],
    timeEntries: [], purchaseOrders: [], quotes: [],
  });
  const [loading, setLoading] = useState(true);
  const [opsData, setOpsData] = useState(null);
  const [periodMode, setPeriodMode] = useState("month");
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [periodDay, setPeriodDay] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`);
  const [showWizard, setShowWizard] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    (async () => {
      try {
        // Both reads must SUCCEED: a failed read (e.g. a 429) must never be
        // mistaken for a fresh, un-onboarded workspace.
        const [settings, coaSample] = await Promise.all([
          withRetrySdk(() => base44.entities.AccountingSettings.list("-created_date", 10), { tries: 4, label: "dashboard.AccountingSettings" }),
          withRetrySdk(() => base44.entities.ChartOfAccount.list("-created_date", 1), { tries: 4, label: "dashboard.ChartOfAccount" }),
        ]);
        // One completed settings record is enough to keep onboarding shut —
        // even alongside duplicate empty rows.
        const onboardingDone = (settings || []).some((s) => s.onboarding_completed === true);
        if (!onboardingDone && settings[0]?.onboarding_completed !== true && coaSample.length === 0) {
          setShowWizard(true);
        }
      } catch (e) {
        console.error("Onboarding check failed — not opening the setup wizard:", e);
      }
    })();
  }, [user]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const safe = (r) => (Array.isArray(r) ? r : []);
      try {
        const [ba, bt] = await batchedAll([
          () => withRetry(() => base44.entities.BankAccount.list("-created_date", 5000)),
          () => withRetry(() => base44.entities.BankTransaction.list("-date", 500)),
        ]);
        const [inv, bl] = await batchedAll([
          () => withRetry(() => base44.entities.Invoice.list("-created_date", 5000)),
          () => withRetry(() => base44.entities.Bill.list("-created_date", 5000)),
        ]);
        const [je, coa] = await batchedAll([
          () => withRetry(() => base44.entities.JournalEntry.list("-date", 500)),
          () => withRetry(() => base44.entities.ChartOfAccount.filter({ status: "Active" })),
        ]);
        const [ct, pr, as, wo, tk, emp, te, po, qu] = await batchedAll([
          () => withRetry(() => base44.entities.Contact.list("-created_date", 5000)).catch(() => []),
          () => withRetry(() => base44.entities.Project.list("-created_date", 5000)).catch(() => []),
          () => withRetry(() => base44.entities.Asset.list("-created_date", 5000)).catch(() => []),
          () => withRetry(() => base44.entities.WorkOrder.list("-created_date", 5000)).catch(() => []),
          () => withRetry(() => base44.entities.Task.list("-created_date", 5000)).catch(() => []),
          () => withRetry(() => base44.entities.Employee.list("-created_date", 5000)).catch(() => []),
          () => withRetry(() => base44.entities.TimeEntry.list("-created_date", 5000)).catch(() => []),
          () => withRetry(() => base44.entities.PurchaseOrder.list("-created_date", 5000)).catch(() => []),
          () => withRetry(() => base44.entities.Quote.list("-created_date", 5000)).catch(() => []),
        ]);
        setData({
          bankAccounts: safe(ba), bankTransactions: safe(bt),
          invoices: safe(inv), bills: safe(bl),
          journalEntries: safe(je), chartAccounts: safe(coa),
          contacts: safe(ct), projects: safe(pr), assets: safe(as),
          workOrders: safe(wo), tasks: safe(tk), employees: safe(emp),
          timeEntries: safe(te), purchaseOrders: safe(po), quotes: safe(qu),
        });

      } catch (e) {
        console.error("Dashboard load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const years = useCallback(() => {
    const now = new Date().getFullYear();
    const list = [];
    for (let y = now; y >= 2020; y--) list.push(y);
    return list;
  }, []);

  const loadOps = useCallback(async () => {
    try {
      const opsRes = await base44.functions.invoke("apiOperationsOverview", {
        period: { mode: periodMode, year: periodYear, month: periodMonth, day: periodDay },
      });
      setOpsData(opsRes.data || null);
    } catch (e) {
      console.error("Ops overview error:", e);
    }
  }, [periodMode, periodYear, periodMonth, periodDay]);

  useEffect(() => { loadOps(); }, [loadOps]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const {
    bankAccounts, invoices, bills, journalEntries, chartAccounts,
    contacts, projects, assets, workOrders, tasks, employees, timeEntries, purchaseOrders, quotes,
  } = data;

  const departments = buildDepartmentStats({
    contacts, projects, assets, workOrders, tasks, employees, timeEntries,
    purchaseOrders, quotes, invoices, bills, journalEntries, chartAccounts, bankAccounts,
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Overall Quick View</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Your financial and operational snapshot at a glance.
          </p>
        </div>

        {/* Operations flow diagram */}
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
          counts={{
            customer: opsData?.customer,
            project: opsData?.project,
            asset: opsData?.asset,
            wo: opsData?.wo,
            tasks: opsData?.tasks,
            timesheets: opsData?.timesheets,
            invoice: opsData?.invoice,
            bill: opsData?.bill,
            providers: opsData?.providers,
            organization: { hideCount: true, caption: opsData?.organizationName },
            employees: opsData?.employees,
            reports: opsData?.reports,
          }}
        />

        {/* Departments */}
        <DepartmentQuickView departments={departments} />

        {/* Time tracking quick access */}
        <div className="pt-4">
          <h3 className="text-xs font-semibold text-foreground mb-3">Time tracking</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {quickAccessLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group"
              >
                <div className="p-2 rounded-lg bg-primary/8 group-hover:bg-primary/12 transition-colors">
                  <link.icon className={`w-5 h-5 ${link.color}`} strokeWidth={1.5} />
                </div>
                <span className="text-xs font-medium text-foreground">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick access */}
        <div className="pt-4">
          <h3 className="text-xs font-semibold text-foreground mb-3">Quick access</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            {overviewLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group"
              >
                <link.icon className={`w-5 h-5 ${link.color}`} strokeWidth={1.5} />
                <span className="text-xs font-medium text-muted-foreground text-center">{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <WelcomeWizard open={showWizard} onClose={() => setShowWizard(false)} />
    </div>
  );
}