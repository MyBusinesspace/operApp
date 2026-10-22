// Maps a route path to the permissions-matrix module key.
// Order matters: more specific prefixes are listed before the shorter prefixes
// they would otherwise shadow (e.g. "/sales/quotes" before "/sales").
const RULES = [
  // ── Overview pages ──
  ["/business-overview", "business_overview"],
  ["/operations-overview", "operations_overview"],
  ["/timehr-overview", "hr_overview"],
  ["/sales-overview", "sales_overview"],
  ["/purchasing-overview", "purchasing_overview"],
  ["/finance-overview", "accounting_overview"],
  ["/service-overview", "operations_overview"],

  // ── Sales sub-pages (before "/sales") ──
  ["/sales/quotes", "quotes"],
  ["/sales/invoices", "invoices"],
  ["/sales/products", "products"],
  ["/sales/customers", "customers"],
  ["/sales/statements", "customers"],
  ["/sales", "sales_overview"],

  // ── Purchasing sub-pages (before "/purchasing") ──
  ["/purchasing/purchase-orders", "purchase_orders"],
  ["/purchasing/bills", "bills"],
  ["/purchasing/suppliers", "suppliers"],
  ["/purchasing", "purchasing_overview"],
  ["/purchases", "purchasing_overview"],
  ["/petty-cash", "petty_cash"],

  // ── Accounting sub-pages (before "/accounting") ──
  ["/accounting/banks", "bank_accounts"],
  ["/accounting/bank-rules", "bank_rules"],
  ["/accounting/fixed-assets", "fixed_assets"],
  ["/accounting/chart-of-accounts", "chart_of_accounts"],
  ["/accounting/journal-entries", "manual_journals"],
  ["/accounting", "accounting_overview"],

  // ── Reports ──
  ["/reports/sales-tax", "sales_tax_report"],
  ["/reports", "reports"],

  // ── Settings sub-pages (before "/settings") ──
  ["/settings/business", "business_settings"],
  ["/settings/operations", "operations_settings"],
  ["/settings/hr", "hr_settings"],
  ["/settings/sales", "sales_settings"],
  ["/settings/purchasing", "purchasing_settings"],
  ["/settings/fixed-assets", "accounting_settings"],
  ["/settings/import-center", "import_center"],
  ["/settings/organization", "organization_settings"],
  ["/settings/file-types", "file_types"],
  ["/settings/mobile-app", "mobile_app"],
  ["/settings/data-export", "data_export"],
  ["/settings/historical-payments", "historical_payments"],
  ["/settings/assets", "asset_settings"],
  ["/settings/service", "service_settings"],
  ["/settings", "settings"],

  // ── Operations pages ──
  ["/work-orders", "work_orders"],
  ["/tasks", "tasks"],
  ["/planner", "planner"],
  ["/timesheets", "timesheets"],
  ["/timer-location", "timesheets"],
  ["/day-schedule-print", "operations_settings"],

  // ── HR pages ──
  ["/employees", "employees"],
  ["/leave", "leave"],
  ["/payroll", "payroll"],

  // ── Business pages ──
  ["/contacts", "contacts"],
  ["/projects", "projects"],
  ["/assets", "assets"],
];

export function pathToModule(pathname = "") {
  for (const [prefix, module] of RULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return module;
  }
  // Home / dashboard and anything unmatched → business overview (the app home).
  return "business_overview";
}