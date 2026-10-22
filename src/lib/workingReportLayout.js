/**
 * Declarative layout for the Working Report.
 *
 * The report structure (sections, rows, and the data variables each row binds
 * to) is stored on the WorkingReportTemplate.layout field and rendered by both
 * the web (WorkingReportPreview) and the mobile app, so both produce identical
 * output. Identity/styling data (logo, accent color, company details, title)
 * remains on the template as before.
 *
 * Each row has a `type` and optional `bind` / `label` / `label2` / `bind2`.
 * `bind` values are resolved by `resolveBind` into entry/task/asset data.
 *
 * This DEFAULT_LAYOUT mirrors the previously-hardcoded report exactly, so
 * existing templates render identically once seeded.
 */

export const DEFAULT_LAYOUT = {
  version: 1,
  header: {
    showCompany: true,     // company name + contact line + logo
    showDocRefs: true,     // "Working order N" / "Report N"
    showTitleStatus: true, // report title + status badge
  },
  sections: [
    {
      id: "general",
      num: "1",
      label: "GENERAL INFORMATION",
      wrap: true,
      rows: [
        { type: "generalColumns" },
      ],
    },
    {
      id: "taskDetails",
      num: "2",
      label: "TASK DETAILS",
      wrap: false,
      rows: [
        { type: "taskTitle" },
        { type: "taskDescription" },
        { type: "taskNotes" },
        { type: "subtasks" },
      ],
    },
    {
      id: "siteReport",
      num: "3",
      label: "SITE REPORT",
      wrap: false,
      rows: [
        { type: "workDescription" },
        { type: "balanceWork" },
      ],
    },
    {
      id: "timeTracker",
      num: "4",
      label: "TIME TRACKER DATA",
      wrap: true,
      rows: [
        { type: "timeTracker" },
      ],
    },
    {
      id: "clientComments",
      num: "5",
      label: "CLIENT COMMENTS",
      wrap: false,
      rows: [
        { type: "comments" },
        { type: "signatureRow" },
      ],
    },
  ],
  footer: { show: true },
};

/**
 * Returns the effective layout for a template, falling back to DEFAULT_LAYOUT
 * when the stored layout is missing or malformed. Never mutates the template.
 */
export function resolveLayout(template) {
  const layout = template && typeof template === "object" ? template.layout : null;
  if (layout && Array.isArray(layout.sections) && layout.sections.length) {
    return layout;
  }
  return DEFAULT_LAYOUT;
}

/**
 * Resolves a `bind` variable key into a concrete value from the report data.
 * Both web and mobile use the same binding contract.
 */
export function resolveBind(bind, { entry, task, woContactLabel }) {
  const e = entry || {};
  const tk = task || {};
  switch (bind) {
    case "company":    return e.contact_name || tk.contact_name;
    case "project":    return e.project_name || tk.project_name;
    case "location":   return tk.location_address;
    case "workOrder":  return e.work_order_name || tk.work_order_name;
    case "woContact":  return woContactLabel;
    case "teamLeader": return e.report_leader_name || e.employee_name;
    case "reportBy":   return e.report_leader_name || e.employee_name;
    default:           return "";
  }
}