import { useState } from "react";
import { FileText, TrendingUp, Scale, BarChart3, Clock, ClipboardList, ChevronDown, ChevronRight, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";

const SECTIONS = [
  {
    key: "accounting",
    label: "Accounting",
    icon: BarChart3,
    color: "#14b8a6",
    reports: [
      { label: "Profit & Loss", desc: "Income vs expenses over a period", path: "/reports/profit-loss" },
      { label: "Balance Sheet", desc: "Assets, liabilities & equity at a point in time", path: "/reports/balance-sheet" },
      { label: "Trial Balance", desc: "All account balances — debits and credits", path: "/reports/trial-balance" },
      { label: "Account Transactions", desc: "All journal lines for a selected account over a period", path: "/reports/account-transactions" },
      { label: "Bank Reconciliation", desc: "Reconciled vs unreconciled transactions by account", path: "/reports/bank-reconciliation" },
      { label: "Account Summary", desc: "Movements and closing balance per chart account", path: "/reports/account-summary" },
      { label: "Fixed Asset Reconciliation", desc: "Compare asset register vs balance sheet by asset group", path: "/reports/fixed-asset-reconciliation" },
    ],
  },
  {
    key: "sales",
    label: "Sales",
    icon: TrendingUp,
    color: "#22c55e",
    reports: [
      { label: "Aged Receivables Summary", desc: "Outstanding customer invoices by age bucket", path: "/reports/aged-receivables" },
    ],
  },
  {
    key: "purchases",
    label: "Purchases",
    icon: ClipboardList,
    color: "#f59e0b",
    reports: [
      { label: "Aged Payables Summary", desc: "Outstanding supplier bills by age bucket", path: "/reports/aged-payables" },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: Clock,
    color: "#0ea5e9",
    reports: [
      { label: "Time & Cost by Client", desc: "Hours logged and labour cost grouped by client", path: "/reports/time-cost?group=client" },
      { label: "Time & Cost by Project", desc: "Hours logged and labour cost grouped by project", path: "/reports/time-cost?group=project" },
      { label: "Working Report Validation History", desc: "Daily validation runs — reports checked, violations found and quarantined", path: "/reports/validation-history" },
      { label: "Working Reports", desc: "Browse and print working reports by day/week, contact, worker, or linked task/invoice", path: "/reports/working-reports" },
    ],
  },
  {
    key: "hr",
    label: "HR",
    icon: Scale,
    color: "#ec4899",
    reports: [
      { label: "Payroll Summary", desc: "Total payments, taxes, and deductions per employee per pay period", path: "/reports/payroll" },
      { label: "Overtime Report", desc: "Extra hours worked beyond standard shift with cost per employee", path: "/reports/overtime" },
    ],
  },
];

export default function Reports() {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BackToOverviewButton to="/finance-overview" />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Financial statements, aging analysis and reconciliation reports</p>
        </div>
      </div>

      {SECTIONS.map(section => {
        const Icon = section.icon;
        const isCollapsed = collapsed[section.key];
        return (
          <div key={section.key} className="rounded-xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => toggle(section.key)}
              className="w-full flex items-center justify-between px-5 py-4 hover:bg-primary/[0.06] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${section.color}1a` }}>
                  <Icon className="w-4 h-4" style={{ color: section.color }} />
                </div>
                <span className="text-base font-semibold text-foreground">{section.label}</span>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{section.reports.length} reports</span>
              </div>
              {isCollapsed ? <ChevronRight className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>

            {!isCollapsed && (
              <div className="border-t border-border grid grid-cols-1 md:grid-cols-2">
                {section.reports.map((report, i) => (
                  <Link
                    key={report.path}
                    to={report.path}
                    className={`flex items-center justify-between px-5 py-4 hover:bg-primary/[0.06] transition-colors group ${
                      i % 2 === 0 && i === section.reports.length - 1 && section.reports.length % 2 !== 0
                        ? "md:col-span-2"
                        : ""
                    } ${i < section.reports.length - (section.reports.length % 2 === 0 ? 2 : 1) ? "border-b border-border" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-xs font-medium text-foreground">{report.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{report.desc}</p>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}