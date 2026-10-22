/**
 * Enriches industry fixtures with the HR detail records the real
 * EmployeeDetail tabs expect (documents, payroll, audit logs, etc.).
 */

function monthsAgo(n, day = 12) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const DOC_TYPES = [
  { id: "dt-passport", name: "Passport", color: "#6366f1" },
  { id: "dt-visa", name: "Residence Visa", color: "#0ea5e9" },
  { id: "dt-labour", name: "Labour Card", color: "#22c55e" },
  { id: "dt-eid", name: "Emirates ID", color: "#f59e0b" },
  { id: "dt-cert", name: "Certificate", color: "#8b5cf6" },
  { id: "dt-license", name: "License", color: "#ec4899" },
];

const PAYROLL_COMPONENTS = [
  { id: "pc1", name: "Housing Allowance", code: "HRA", type: "earning", calculation_method: "fixed", default_value: 2000, is_active: true },
  { id: "pc2", name: "Transport Allowance", code: "TRA", type: "earning", calculation_method: "fixed", default_value: 500, is_active: true },
  { id: "pc3", name: "Phone Allowance", code: "PHN", type: "earning", calculation_method: "fixed", default_value: 200, is_active: true },
  { id: "pc4", name: "Loan Deduction", code: "LOAN", type: "deduction", calculation_method: "fixed", default_value: 300, is_active: true },
];

function ensureDocTypeId(doc) {
  if (doc.document_type_id) return doc;
  const name = (doc.document_type_name || "").toLowerCase();
  const match =
    DOC_TYPES.find((t) => name.includes(t.name.toLowerCase().split(" ")[0])) ||
    DOC_TYPES[0];
  return {
    ...doc,
    document_type_id: match.id,
    document_type_name: doc.document_type_name || match.name,
  };
}

function profileFor(emp, idx) {
  const basic = 8000 + idx * 1500;
  return {
    id: `pp-${emp.id}`,
    employee_id: emp.id,
    employee_name: emp.full_name,
    employment_type: "full_time",
    pay_type: "salary",
    basic_salary: basic,
    hourly_rate: 0,
    effective_date: emp.hire_date || monthsAgo(12),
    components: [
      { component_name: "Housing Allowance", component_code: "HRA", type: "earning", value: 2000, calculation_method: "fixed" },
      { component_name: "Transport Allowance", component_code: "TRA", type: "earning", value: 500, calculation_method: "fixed" },
      ...(idx % 2 === 0
        ? [{ component_name: "Loan Deduction", component_code: "LOAN", type: "deduction", value: 250, calculation_method: "fixed" }]
        : []),
    ],
    bank_name: "Emirates NBD",
    iban: emp.bank_account || "",
    bank_routing: "",
    wps_id: emp.employee_no || "",
    tax_id: "",
    tax_country: "AE",
    tax_status: "resident",
    annual_leave_days: 30,
    leave_used_override: null,
    yearly_leave_overrides: {},
    last_gratuity_year: null,
    gratuity_total_override: null,
    is_active: true,
    notes: "",
  };
}

export function enrichEmployeeDetailFixture(fixture) {
  if (!fixture || fixture.__employeeDetailEnriched) return fixture;

  const employees = fixture.employees || [];
  const existingDocs = (fixture.employeeDocuments || []).map(ensureDocTypeId);

  // Ensure every active employee has at least one document with expiry
  const docs = [...existingDocs];
  employees.forEach((emp, i) => {
    if (docs.some((d) => d.employee_id === emp.id)) return;
    if (emp.status === "Terminated") return;
    docs.push({
      id: `ed-auto-${emp.id}`,
      employee_id: emp.id,
      document_type_id: "dt-passport",
      document_type_name: "Passport",
      file_name: `passport-${(emp.full_name || "emp").split(" ")[0].toLowerCase()}.pdf`,
      file_url: "",
      expiry_date: monthsAgo(-8 - i, 1),
      document_number: `P${100000 + i}`,
      notes: `No. P${100000 + i}`,
    });
  });

  // Add expiry to docs missing it
  docs.forEach((d, i) => {
    if (!d.expiry_date) d.expiry_date = monthsAgo(-6 - (i % 5), 15);
  });

  const payrollProfiles =
    fixture.payrollProfiles ||
    employees
      .filter((e) => e.status !== "Terminated")
      .map((e, i) => profileFor(e, i));

  const payPeriods = (fixture.payPeriods || []).map((p, i) => {
    if (p.start_date && p.end_date) return p;
    const start = monthsAgo(i + 1, 1);
    const end = monthsAgo(i, 15);
    return { ...p, start_date: start, end_date: end };
  });

  // Ensure at least 2 periods with dates
  while (payPeriods.length < 2) {
    const i = payPeriods.length;
    payPeriods.push({
      id: `pp-auto-${i}`,
      name: `Period ${i + 1}`,
      status: i === 0 ? "paid" : "in_review",
      start_date: monthsAgo(i + 1, 1),
      end_date: monthsAgo(i, 15),
      employee_count: employees.length,
      total_net: 40000,
      created_date: daysAgo(10 + i),
    });
  }

  const primary = employees.find((e) => e.status === "Active") || employees[0];
  const payrollEntries =
    fixture.payrollEntries ||
    (primary
      ? payPeriods.slice(0, 2).map((period, i) => {
          const profile = payrollProfiles.find((p) => p.employee_id === primary.id);
          const basic = profile?.basic_salary || 10000;
          const extras = (profile?.components || [])
            .filter((c) => c.type === "earning")
            .reduce((s, c) => s + (c.value || 0), 0);
          const deds = (profile?.components || [])
            .filter((c) => c.type === "deduction")
            .reduce((s, c) => s + (c.value || 0), 0);
          const gross = basic + extras;
          const net = gross - deds;
          const line_items = [
            { component_code: "BASIC", component_name: "Basic Salary", amount: basic, type: "earning" },
            ...(profile?.components || []).map((c) => ({
              component_code: c.component_code,
              component_name: c.component_name,
              amount: c.value,
              type: c.type,
            })),
          ];
          if (i === 0) {
            line_items.push({
              component_code: "ALB",
              component_name: "Annual Leave Bonus",
              amount: 1500,
              notes: "Leave bonus",
              type: "earning",
            });
          }
          return {
            id: `pe-${primary.id}-${period.id}`,
            employee_id: primary.id,
            employee_name: primary.full_name,
            pay_period_id: period.id,
            pay_period_name: period.name,
            status: period.status === "paid" ? "paid" : "approved",
            gross_pay: gross + (i === 0 ? 1500 : 0),
            net_pay: net + (i === 0 ? 1500 : 0),
            line_items,
            created_date: period.created_date || daysAgo(8 + i),
          };
        })
      : []);

  // Add entries for a couple more employees on latest period
  if (payPeriods[0] && !fixture.payrollEntries) {
    employees
      .filter((e) => e.id !== primary?.id && e.status === "Active")
      .slice(0, 2)
      .forEach((emp) => {
        const profile = payrollProfiles.find((p) => p.employee_id === emp.id);
        const basic = profile?.basic_salary || 8000;
        const extras = (profile?.components || [])
          .filter((c) => c.type === "earning")
          .reduce((s, c) => s + (c.value || 0), 0);
        const deds = (profile?.components || [])
          .filter((c) => c.type === "deduction")
          .reduce((s, c) => s + (c.value || 0), 0);
        payrollEntries.push({
          id: `pe-${emp.id}-${payPeriods[0].id}`,
          employee_id: emp.id,
          employee_name: emp.full_name,
          pay_period_id: payPeriods[0].id,
          pay_period_name: payPeriods[0].name,
          status: "paid",
          gross_pay: basic + extras,
          net_pay: basic + extras - deds,
          line_items: [
            { component_code: "BASIC", component_name: "Basic Salary", amount: basic, type: "earning" },
          ],
          created_date: daysAgo(8),
        });
      });
  }

  const historicalPayments = fixture.historicalPayments || [
    ...(primary
      ? [
          {
            id: "hp1",
            employee_id: primary.id,
            payment_type: "leave_bonus",
            year: new Date().getFullYear() - 1,
            amount: 1200,
            notes: "Prior year leave bonus",
          },
          {
            id: "hp2",
            employee_id: primary.id,
            payment_type: "gratuity",
            year: new Date().getFullYear() - 1,
            amount: 3500,
            notes: "Partial gratuity settlement",
          },
        ]
      : []),
  ];

  const salaryAuditLogs =
    fixture.salaryAuditLogs ||
    (primary
      ? [
          {
            id: "sal1",
            employee_id: primary.id,
            action: "profile_created",
            timestamp: daysAgo(90),
            performed_by_name: "HR Admin",
            source: "manual",
            notes: "Initial payroll profile",
          },
          {
            id: "sal2",
            employee_id: primary.id,
            action: "salary_updated",
            field_changed: "basic_salary",
            old_value: 9000,
            new_value: payrollProfiles.find((p) => p.employee_id === primary.id)?.basic_salary || 10000,
            timestamp: daysAgo(40),
            performed_by_name: "HR Admin",
            source: "manual",
            notes: "Annual review",
          },
        ]
      : []);

  const payrollAuditLogs =
    fixture.payrollAuditLogs ||
    (primary && payPeriods[0]
      ? [
          {
            id: "pal1",
            employee_id: primary.id,
            action: "entry_approved",
            timestamp: daysAgo(7),
            performed_by_name: "HR Admin",
            pay_period_name: payPeriods[0].name,
            changes_summary: `Payroll approved — ${payPeriods[0].name}`,
          },
        ]
      : []);

  const employeeRoles = fixture.employeeRoles || [
    { id: "er1", key: "employee", name: "Employee", color: "#6366f1", description: "Field staff" },
    { id: "er2", key: "supervisor", name: "Supervisor", color: "#f97316", description: "Team leads" },
    { id: "er3", key: "administrator", name: "Administrator", color: "#ef4444", description: "Full access" },
  ];

  const employeeStatuses = fixture.employeeStatuses || [
    { id: "es1", name: "Active" },
    { id: "es2", name: "On Leave" },
    { id: "es3", name: "Inactive" },
    { id: "es4", name: "Terminated" },
  ];

  const rolePermissions = fixture.rolePermissions || [];

  const payrollSettings = fixture.payrollSettings || {
    id: "ps1",
    gratuity_enabled: true,
    gratuity_years_threshold: 1,
    gratuity_days_per_year: 21,
    working_days_per_month: 22,
    working_days_per_week: 5,
    overtime_threshold_daily_h: 8,
    overtime_multiplier: 1.5,
    overtime_multiplier_sunday: 2.0,
    overtime_multiplier_holiday: 2.0,
  };

  return {
    ...fixture,
    employeeDocuments: docs,
    employeeDocumentTypes: fixture.employeeDocumentTypes || DOC_TYPES,
    payrollProfiles,
    payPeriods,
    payrollEntries,
    historicalPayments,
    salaryAuditLogs,
    payrollAuditLogs,
    payrollComponents: fixture.payrollComponents || PAYROLL_COMPONENTS,
    payrollSettings,
    payrollSettingsList: [payrollSettings],
    employeeRoles,
    employeeStatuses,
    rolePermissions,
    demoUsers:
      fixture.demoUsers ||
      employees
        .filter((e) => e.email)
        .map((e) => ({
          id: e.user_id || `u-${e.id}`,
          full_name: e.full_name,
          email: e.email,
        })),
    __employeeDetailEnriched: true,
  };
}
