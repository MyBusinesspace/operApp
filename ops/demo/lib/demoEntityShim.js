/**
 * Temporarily backs demo pages with fixture data through the real base44
 * entity API so source UI components (EmployeeDetail tabs, etc.) render
 * unchanged — no invented screens.
 */
import { base44 } from "@/api/base44Client";

const ENTITY_FIXTURE_KEYS = {
  Employee: "employees",
  EmployeeDocument: "employeeDocuments",
  EmployeeDocumentType: "employeeDocumentTypes",
  EmployeePayrollProfile: "payrollProfiles",
  LeaveRequest: "leaveRequests",
  PayrollSettings: "payrollSettingsList",
  PayrollEntry: "payrollEntries",
  HistoricalPayment: "historicalPayments",
  PayPeriod: "payPeriods",
  PayrollComponent: "payrollComponents",
  TimeEntry: "timeEntries",
  SalaryAuditLog: "salaryAuditLogs",
  PayrollAuditLog: "payrollAuditLogs",
  Team: "teams",
  User: "demoUsers",
  EmployeeStatus: "employeeStatuses",
  EmployeeRole: "employeeRoles",
  RolePermission: "rolePermissions",
};

function matchFilter(items, filter) {
  if (!filter || typeof filter !== "object") return items;
  return items.filter((item) =>
    Object.entries(filter).every(([k, v]) => item[k] === v)
  );
}

function sortItems(items, order) {
  if (!order || typeof order !== "string") return [...items];
  const desc = order.startsWith("-");
  const key = desc ? order.slice(1) : order;
  return [...items].sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

function parseFilterArgs(orderOrOpts, limit) {
  let order = orderOrOpts;
  let lim = limit;
  if (orderOrOpts && typeof orderOrOpts === "object" && !Array.isArray(orderOrOpts)) {
    lim = orderOrOpts.limit ?? lim;
    order = orderOrOpts.order ?? orderOrOpts.sort ?? undefined;
  }
  return { order, lim };
}

function makeEntity(getList) {
  return {
    list: async (order, limit) => {
      const items = sortItems(getList(), order);
      return typeof limit === "number" ? items.slice(0, limit) : items;
    },
    filter: async (filter, orderOrOpts, limit) => {
      const { order, lim } = parseFilterArgs(orderOrOpts, limit);
      let items = matchFilter(getList(), filter);
      items = sortItems(items, order);
      return typeof lim === "number" ? items.slice(0, lim) : items;
    },
    get: async (id) => getList().find((x) => x.id === id) || null,
    create: async (payload) => ({
      id: `demo-${Date.now()}`,
      created_date: new Date().toISOString(),
      ...payload,
    }),
    update: async (id, payload) => {
      const existing = getList().find((x) => x.id === id) || { id };
      return { ...existing, ...payload };
    },
    delete: async () => true,
    subscribe: () => () => {},
  };
}

let activeUninstall = null;

export function installDemoEntityShim(fixtureData) {
  if (activeUninstall) activeUninstall();

  const data = fixtureData || {};
  const backups = new Map();

  for (const [entityName, fixtureKey] of Object.entries(ENTITY_FIXTURE_KEYS)) {
    backups.set(entityName, base44.entities[entityName]);
    base44.entities[entityName] = makeEntity(() => {
      const list = data[fixtureKey];
      if (Array.isArray(list)) return list;
      // PayrollSettings is often a single object in fixtures — wrap as list
      if (fixtureKey === "payrollSettingsList" && data.payrollSettings) {
        return [data.payrollSettings];
      }
      return [];
    });
  }

  const prevAuthMe = base44.auth?.me?.bind(base44.auth);
  if (base44.auth) {
    base44.auth.me = async () => ({
      id: "demo-admin",
      role: "admin",
      full_name: "Demo Admin",
      email: "demo@operapp.ae",
    });
  }

  const prevInvite = base44.users?.inviteUser?.bind(base44.users);
  if (base44.users) {
    base44.users.inviteUser = async () => ({ ok: true });
  }

  const prevIntegrations = base44.integrations;
  if (!base44.integrations) base44.integrations = {};
  if (!base44.integrations.Core) base44.integrations.Core = {};
  const core = base44.integrations.Core;
  const prevCore = {
    UploadFile: core.UploadFile,
    UploadPrivateFile: core.UploadPrivateFile,
    CreateFileSignedUrl: core.CreateFileSignedUrl,
    InvokeLLM: core.InvokeLLM,
  };
  core.UploadFile = async () => ({ file_url: "" });
  core.UploadPrivateFile = async ({ file } = {}) => ({
    file_uri: `demo://${file?.name || "file"}`,
  });
  core.CreateFileSignedUrl = async () => ({ signed_url: "" });
  core.InvokeLLM = async () => ({});

  const uninstall = () => {
    for (const [name, prev] of backups.entries()) {
      if (prev === undefined) delete base44.entities[name];
      else base44.entities[name] = prev;
    }
    if (base44.auth && prevAuthMe) base44.auth.me = prevAuthMe;
    if (base44.users && prevInvite) base44.users.inviteUser = prevInvite;
    if (prevCore.UploadFile) core.UploadFile = prevCore.UploadFile;
    if (prevCore.UploadPrivateFile) core.UploadPrivateFile = prevCore.UploadPrivateFile;
    if (prevCore.CreateFileSignedUrl) core.CreateFileSignedUrl = prevCore.CreateFileSignedUrl;
    if (prevCore.InvokeLLM) core.InvokeLLM = prevCore.InvokeLLM;
    if (activeUninstall === uninstall) activeUninstall = null;
  };

  activeUninstall = uninstall;
  return uninstall;
}

export function uninstallDemoEntityShim() {
  if (activeUninstall) activeUninstall();
}
