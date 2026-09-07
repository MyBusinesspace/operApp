// Maps a route path to the permissions-matrix module key.
// Order matters: more specific prefixes (e.g. "*-overview") are listed before
// the shorter prefixes they would otherwise shadow (e.g. "/sales").
const RULES = [
  ["/sales-overview", "sales"],
  ["/purchasing-overview", "purchases"],
  ["/operations-overview", "work_orders"],
  ["/business-overview", "contacts"],
  ["/service-overview", "work_orders"],
  ["/timehr-overview", "employees"],
  ["/finance-overview", "accounting"],
  ["/contacts", "contacts"],
  ["/projects", "projects"],
  ["/assets", "assets"],
  ["/work-orders", "work_orders"],
  ["/planner", "planner"],
  ["/timesheets", "timesheets"],
  ["/timer-location", "timesheets"],
  ["/leave", "leave"],
  ["/payroll", "payroll"],
  ["/employees", "employees"],
  ["/purchasing", "purchases"],
  ["/purchases", "purchases"],
  ["/petty-cash", "petty_cash"],
  ["/accounting", "accounting"],
  ["/settings", "settings"],
  ["/reports", "reports"],
  ["/sales", "sales"],
];

export function pathToModule(pathname = "") {
  for (const [prefix, module] of RULES) {
    if (pathname === prefix || pathname.startsWith(prefix + "/")) return module;
  }
  return "dashboard";
}