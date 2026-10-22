export const NAV_DEPARTMENTS = {
  Business: "business", Operations: "operations", HR: "hr", Sales: "sales",
  Purchases: "purchasing", Accounting: "accounting", Reporting: "reporting",
};

const DEPARTMENT_ROUTES = {
  business: ["/business-overview", "/contacts", "/projects", "/assets", "/settings/business", "/settings/assets"],
  operations: ["/operations-overview", "/service-overview", "/work-orders", "/tasks", "/planner", "/timesheets", "/timer-location", "/reports/working-reports", "/day-schedule-print", "/settings/operations", "/settings/service"],
  hr: ["/timehr-overview", "/employees", "/leave", "/payroll", "/settings/hr", "/settings/historical-payments"],
  sales: ["/sales-overview", "/sales", "/settings/sales"],
  purchasing: ["/purchasing-overview", "/purchasing", "/purchases", "/petty-cash", "/settings/purchasing"],
  accounting: ["/finance-overview", "/accounting", "/settings/fixed-assets", "/settings/coa-templates"],
  reporting: ["/reports", "/settings/import-center", "/settings/data-export"],
};

export function getDepartmentForPath(pathname) {
  return Object.entries(DEPARTMENT_ROUTES).find(([, paths]) =>
    paths.some(path => pathname === path || pathname.startsWith(`${path}/`))
  )?.[0] || "reporting";
}