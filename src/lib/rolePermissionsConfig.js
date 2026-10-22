// Shared configuration for the Roles & Permissions UI.
// Used by both the Settings role-definition editor (RolePermissionsSection)
// and the per-employee role-assignment view (EmployeePermissionsModal).
//
// Roles are a FIXED, Xero-style set (no custom role creation). Each role has
// a default permission template per category; admins can refine each role's
// matrix in Settings, and the refined values are persisted as RolePermission
// records keyed by (role.key, module).

// Categories mirror the app's top-nav structure: each category lists its
// overview page, its main pages, and its settings page as separate rows in
// the permission matrix. A general "Settings" category holds the uncategorised
// settings pages (organization, file types, mobile app, …).
export const DEPARTMENTS = [
  {
    key: "business",
    label: "Business",
    documents: "Overview, Companies, Projects, Assets, Settings",
    modules: ["business_overview", "contacts", "projects", "assets", "business_settings"],
    color: "#6366f1",
  },
  {
    key: "operations",
    label: "Operations",
    documents: "Overview, Work Orders, Tasks, Planner, Timesheets, Settings",
    modules: ["operations_overview", "work_orders", "tasks", "planner", "timesheets", "operations_settings"],
    color: "#0ea5e9",
  },
  {
    key: "hr",
    label: "HR",
    documents: "Overview, Employees, Leave, Payroll, Settings",
    modules: ["hr_overview", "employees", "leave", "payroll", "hr_settings"],
    color: "#ec4899",
  },
  {
    key: "sales",
    label: "Sales",
    documents: "Overview, Quotes, Invoices, Products & Services, Customers, Settings",
    modules: ["sales_overview", "quotes", "invoices", "products", "customers", "sales_settings"],
    color: "#22c55e",
  },
  {
    key: "purchases",
    label: "Purchases",
    documents: "Overview, Purchase Orders, Bills, Petty Cash, Suppliers, Settings",
    modules: ["purchasing_overview", "purchase_orders", "bills", "petty_cash", "suppliers", "purchasing_settings"],
    color: "#f59e0b",
  },
  {
    key: "accounting",
    label: "Accounting",
    documents: "Overview, Bank Accounts, Bank Rules, Fixed Assets, Chart of Accounts, Manual Journals, Settings",
    modules: ["accounting_overview", "bank_accounts", "bank_rules", "fixed_assets", "chart_of_accounts", "manual_journals", "accounting_settings"],
    color: "#14b8a6",
  },
  {
    key: "reporting",
    label: "Reporting",
    documents: "Reports, Sales Tax, Data",
    modules: ["reports", "sales_tax_report", "import_center"],
    color: "#8b5cf6",
  },
  {
    key: "settings",
    label: "Settings",
    documents: "Settings hub, Organization, File types, Mobile app, Data export, Historical payments, Asset settings, Service settings",
    modules: ["settings", "organization_settings", "file_types", "mobile_app", "data_export", "historical_payments", "asset_settings", "service_settings"],
    color: "#64748b",
  },
];

export const ALL_MODULE_KEYS = DEPARTMENTS.flatMap(d => d.modules);

export const MODULE_LABELS = {
  // Business
  business_overview: "Business overview",
  contacts: "Companies",
  projects: "Projects",
  assets: "Assets",
  business_settings: "Business settings",
  // Operations
  operations_overview: "Operations overview",
  work_orders: "Work Orders",
  tasks: "Tasks",
  planner: "Planner",
  timesheets: "Timesheets",
  operations_settings: "Operations settings",
  // HR
  hr_overview: "HR overview",
  employees: "Employees",
  leave: "Leave",
  payroll: "Payroll",
  hr_settings: "HR settings",
  // Sales
  sales_overview: "Sales overview",
  quotes: "Quotes",
  invoices: "Invoices",
  products: "Products & Services",
  customers: "Customers",
  sales_settings: "Sales settings",
  // Purchases
  purchasing_overview: "Purchasing overview",
  purchase_orders: "Purchase Orders",
  bills: "Bills",
  petty_cash: "Petty Cash",
  suppliers: "Suppliers",
  purchasing_settings: "Purchasing settings",
  // Accounting
  accounting_overview: "Accounting overview",
  bank_accounts: "Bank Accounts",
  bank_rules: "Bank Rules",
  fixed_assets: "Fixed Assets",
  chart_of_accounts: "Chart of Accounts",
  manual_journals: "Manual Journals",
  accounting_settings: "Accounting settings",
  // Reporting
  reports: "Reports",
  sales_tax_report: "Sales Tax Report",
  import_center: "Data (Import Center)",
  // Settings
  settings: "Settings hub",
  organization_settings: "Organization",
  file_types: "File types",
  mobile_app: "Mobile app",
  data_export: "Data export",
  historical_payments: "Historical payments",
  asset_settings: "Asset settings",
  service_settings: "Service settings",
};

// "Edit" is a composite column that toggles can_create, can_edit and can_delete
// together — they are conceptually the same "modify" capability.
export const PERMISSIONS = [
  { key: "can_view", label: "View", abbr: "V" },
  { key: "can_edit", label: "Edit", abbr: "E", composite: ["can_create", "can_edit", "can_delete"] },
  { key: "can_approve", label: "Approve", abbr: "A" },
];

export const DEFAULT_PERMS = {
  can_view: true,
  can_create: false,
  can_edit: false,
  can_delete: false,
  can_approve: false,
};

// Permission levels used to define each fixed role's default template per category.
export const LEVEL_PERMS = {
  full: { can_view: true, can_create: true, can_edit: true, can_delete: true, can_approve: true },
  edit: { can_view: true, can_create: true, can_edit: true, can_delete: false, can_approve: false },
  view: { can_view: true, can_create: false, can_edit: false, can_delete: false, can_approve: false },
  none: { can_view: false, can_create: false, can_edit: false, can_delete: false, can_approve: false },
};

// The fixed, Xero-style role set. `icon` is a lucide-react icon name.
export const FIXED_ROLES = [
  {
    key: "administrator",
    name: "Administrator",
    icon: "Shield",
    color: "#5D5FEF",
    description: "Access all areas. Suitable for advisors and experienced accounting users.",
    defaults: { business: "full", operations: "full", hr: "full", sales: "full", purchases: "full", accounting: "full", reporting: "full", settings: "full" },
  },
  {
    key: "standard",
    name: "Standard",
    icon: "Lock",
    color: "#6366f1",
    description: "Access everything except some settings and accounting features.",
    defaults: { business: "full", operations: "full", hr: "full", sales: "full", purchases: "full", accounting: "full", reporting: "full", settings: "view" },
  },
  {
    key: "sales_purchases",
    name: "Sales and purchases",
    icon: "DollarSign",
    color: "#22c55e",
    description: "Access quotes, invoices, bills, purchase orders, and relevant reports.",
    defaults: { business: "view", operations: "view", sales: "full", purchases: "full", accounting: "full", reporting: "view", settings: "view" },
  },
  {
    key: "sales",
    name: "Sales",
    icon: "FileText",
    color: "#0ea5e9",
    description: "Access quotes, invoices, and relevant reports.",
    defaults: { business: "view", operations: "view", sales: "full", reporting: "view", settings: "view" },
  },
  {
    key: "draft_sales_purchases",
    name: "Draft sales and purchases",
    icon: "Pencil",
    color: "#f59e0b",
    description: "Create draft quotes, invoices, bills, and purchase orders.",
    defaults: { business: "view", sales: "edit", purchases: "edit", accounting: "edit", reporting: "view", settings: "view" },
  },
  {
    key: "purchases",
    name: "Purchases",
    icon: "ClipboardList",
    color: "#ec4899",
    description: "Access bills, purchase orders, and relevant reports.",
    defaults: { business: "view", operations: "view", purchases: "full", accounting: "full", reporting: "view", settings: "view" },
  },
  {
    key: "payroll_admin",
    name: "Payroll admin",
    icon: "Briefcase",
    color: "#14b8a6",
    description: "Access all payroll features and relevant reports.",
    defaults: { business: "view", operations: "view", hr: "full", reporting: "view", settings: "view" },
  },
  {
    key: "employee",
    name: "Employee",
    icon: "User",
    color: "#64748b",
    description: "Access operations modules, submit leave and timesheets, view own HR data.",
    defaults: { business: "edit", operations: "edit", hr: "view", reporting: "view", settings: "view" },
  },
  {
    key: "viewer",
    name: "Viewer",
    icon: "Eye",
    color: "#94a3b8",
    description: "View-only access across all areas.",
    defaults: { business: "view", operations: "view", hr: "view", sales: "view", purchases: "view", accounting: "view", reporting: "view", settings: "view" },
  },
];

export function fixedRoleByKey(key) {
  return FIXED_ROLES.find(r => r.key === key);
}

export function fixedRoleByName(name) {
  return FIXED_ROLES.find(r => r.name === name);
}

// Icons available for roles (lucide-react names).
export const ROLE_ICON_OPTIONS = [
  "Shield", "Lock", "DollarSign", "FileText", "Pencil", "ClipboardList",
  "Briefcase", "User", "Eye", "Users", "Settings", "Wrench", "Truck",
  "HardHat", "Crown", "Star", "Zap", "Building2", "Cpu", "Heart",
];

// Merge a DB EmployeeRole record with config defaults (icon/color/description)
// so custom roles get sensible fallbacks while system roles keep their template.
export function mergeDbRole(dbRole) {
  const fr = fixedRoleByKey(dbRole.key);
  return {
    id: dbRole.id,
    key: dbRole.key,
    name: dbRole.name,
    icon: dbRole.icon || fr?.icon || "Shield",
    color: dbRole.color || fr?.color || "#6366f1",
    description: dbRole.description || fr?.description || "",
    is_system: !!dbRole.is_system,
    sort_order: dbRole.sort_order || 0,
    can_view_all_employees: !!dbRole.can_view_all_employees,
    can_view_all_leave: !!dbRole.can_view_all_leave,
    can_view_all_payroll: !!dbRole.can_view_all_payroll,
    can_view_all_petty_cash: !!dbRole.can_view_all_petty_cash,
    can_edit_all_employees: dbRole.can_edit_all_employees,
    can_edit_all_leave: dbRole.can_edit_all_leave,
    can_edit_all_payroll: dbRole.can_edit_all_payroll,
    can_edit_all_petty_cash: dbRole.can_edit_all_petty_cash,
  };
}

// Generate a unique role key from a display name.
export function slugifyRoleKey(name, existingKeys = []) {
  const base = (name || "role").toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "role";
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) { key = `${base}_${i++}`; }
  return key;
}

// Overview pages and per-category settings pages are view-only for non-admin
// roles (admins keep full). This separates "view the overview / tweak settings"
// from the create/edit/delete level granted to a category's main pages, so a
// role can edit Companies without getting edit on Business settings.
const OVERVIEW_MODULES = new Set([
  "business_overview", "operations_overview", "hr_overview",
  "sales_overview", "purchasing_overview", "accounting_overview",
]);
const CATEGORY_SETTINGS_MODULES = new Set([
  "business_settings", "operations_settings", "hr_settings",
  "sales_settings", "purchasing_settings", "accounting_settings",
]);

// Default permission flags for a (roleKey, moduleKey) combo, derived from the
// fixed role's category-level template. Overviews & category-settings are
// capped at "view" for non-admins. Falls back to none.
export function getDefaultPerms(roleKey, moduleKey) {
  const role = fixedRoleByKey(roleKey);
  if (!role) return { ...DEFAULT_PERMS };
  const dept = DEPARTMENTS.find(d => d.modules.includes(moduleKey));
  const level = (dept && role.defaults[dept.key]) || "none";
  if (roleKey !== "administrator" && (OVERVIEW_MODULES.has(moduleKey) || CATEGORY_SETTINGS_MODULES.has(moduleKey))) {
    return level === "none" ? { ...LEVEL_PERMS.none } : { ...LEVEL_PERMS.view };
  }
  return { ...LEVEL_PERMS[level] };
}

// Resolve the underlying flags a column controls (handles composite "Edit").
export function resolveKeys(perm) {
  return perm.composite ? perm.composite : [perm.key];
}

// A cell is "on" only when ALL underlying flags for the perm are on for the module.
export function cellOn(permsMap, roleKey, moduleKey, perm) {
  const keys = resolveKeys(perm);
  return keys.every(k => permsMap[`${roleKey}|${moduleKey}`]?.[k]);
}

// Category-level status: 'full' | 'some' | 'none'
export function categoryStatus(permsMap, roleKey, dept) {
  const allOn = dept.modules.every(mk => PERMISSIONS.every(p => cellOn(permsMap, roleKey, mk, p)));
  if (allOn) return "full";
  const anyOn = dept.modules.some(mk => PERMISSIONS.some(p => cellOn(permsMap, roleKey, mk, p)));
  return anyOn ? "some" : "none";
}