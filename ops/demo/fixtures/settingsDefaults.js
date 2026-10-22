/** Shared master lists for demo Business / Operations settings pages. */

export const DEMO_CONTACT_CATEGORIES = [
  { id: "cc1", name: "Developer", color: "#6366f1", description: "Property developers" },
  { id: "cc2", name: "Contractor", color: "#0ea5e9", description: "Main & sub-contractors" },
  { id: "cc3", name: "Supplier", color: "#10b981", description: "Materials & services" },
];

export const DEMO_CONTACT_STATUSES = [
  { id: "cs1", name: "Active", color: "#22c55e" },
  { id: "cs2", name: "Inactive", color: "#f59e0b" },
  { id: "cs3", name: "Archived", color: "#71717a" },
];

export const DEMO_PROJECT_CATEGORIES = [
  { id: "pc1", name: "Construction", color: "#f97316" },
  { id: "pc2", name: "Fit-out", color: "#8b5cf6" },
  { id: "pc3", name: "Maintenance", color: "#06b6d4" },
];

export const DEMO_PROJECT_STATUSES = [
  { id: "ps1", name: "Active", color: "#22c55e" },
  { id: "ps2", name: "On Hold", color: "#f59e0b" },
  { id: "ps3", name: "Completed", color: "#6366f1" },
  { id: "ps4", name: "Archived", color: "#71717a" },
];

export const DEMO_ASSET_CATEGORIES = [
  { id: "ac1", name: "Crane", color: "#ef4444" },
  { id: "ac2", name: "Equipment", color: "#0ea5e9" },
  { id: "ac3", name: "Platform", color: "#8b5cf6" },
  { id: "ac4", name: "Tool", color: "#14b8a6" },
  { id: "ac5", name: "Other", color: "#71717a" },
];

export const DEMO_ASSET_STATUSES = [
  { id: "as1", name: "In Use", color: "#22c55e" },
  { id: "as2", name: "Available", color: "#0ea5e9" },
  { id: "as3", name: "Maintenance", color: "#f59e0b" },
  { id: "as4", name: "Retired", color: "#71717a" },
];

export const DEMO_ASSET_FIELDS = [
  { id: "af1", name: "Serial Number", field_type: "text" },
  { id: "af2", name: "Last Service Date", field_type: "date" },
  { id: "af3", name: "Insurance Expiry", field_type: "date" },
];

export const DEMO_WO_CATEGORIES = [
  { id: "wc1", name: "Corrective", color: "#ef4444", description: "Break-fix work" },
  { id: "wc2", name: "Preventive", color: "#22c55e", description: "Scheduled PPM" },
  { id: "wc3", name: "Inspection", color: "#0ea5e9" },
];

export const DEMO_WO_STATUSES = [
  { id: "ws1", name: "Active", color: "#22c55e" },
  { id: "ws2", name: "On Hold", color: "#f59e0b" },
  { id: "ws3", name: "Archived", color: "#71717a" },
];

export const DEMO_TASK_CATEGORIES = [
  { id: "tc1", name: "Site Work", color: "#f97316" },
  { id: "tc2", name: "Admin", color: "#6366f1" },
  { id: "tc3", name: "Safety", color: "#ef4444" },
];

export const DEMO_TASK_SHIFTS = [
  { id: "ts1", name: "Morning", color: "#f59e0b", time_in: "07:00", time_out: "15:00" },
  { id: "ts2", name: "Afternoon", color: "#0ea5e9", time_in: "15:00", time_out: "23:00" },
  { id: "ts3", name: "Night", color: "#6366f1", time_in: "23:00", time_out: "07:00" },
];

export const DEMO_OPS_SETTINGS = {
  track_gps_location: true,
  require_work_order: false,
  allow_manual_edit: true,
  enable_alarms: false,
  alarm_minutes_before: 5,
  gps_accuracy_threshold_m: 15,
  tracking_interval_min: 15,
  require_photo_clock_in: false,
  require_photo_clock_out: false,
  require_photo_task_switch: false,
  show_timesheet_photos_column: true,
  working_report_validation_hour: 20,
  working_report_validation_timezone: "Asia/Dubai",
};

export const DEMO_NUMBERING = {
  contact: { prefix: "CMP", next_number: 1008 },
  project: { prefix: "PRJ", next_number: 2405 },
  asset: { prefix: "AST", next_number: 112 },
  workOrder: { prefix: "WO", next_number: 2402 },
  task: { prefix: "TSK", next_number: 88 },
  contactFile: { prefix: "FILE", next_number: 42 },
  projectFile: { prefix: "FILE", next_number: 18 },
  assetFile: { prefix: "FILE", next_number: 27 },
};

/** File types keyed by FileSettingsSection `scope`. */
export const DEMO_FILE_TYPES = {
  Contact: [
    {
      id: "ft-c1",
      name: "Trade License",
      color: "#6366f1",
      reference_prefix: "TL",
      description: "Company trade license copy",
      entity_scope: "Contact",
    },
    {
      id: "ft-c2",
      name: "Contract",
      color: "#0ea5e9",
      reference_prefix: "CON",
      description: "Signed commercial agreement",
      entity_scope: "Contact",
    },
    {
      id: "ft-c3",
      name: "VAT Certificate",
      color: "#10b981",
      reference_prefix: "VAT",
      entity_scope: "Contact",
    },
  ],
  Project: [
    {
      id: "ft-p1",
      name: "Site Drawing",
      color: "#f97316",
      reference_prefix: "DWG",
      description: "Approved drawings & revisions",
      entity_scope: "Project",
    },
    {
      id: "ft-p2",
      name: "Method Statement",
      color: "#8b5cf6",
      reference_prefix: "MS",
      entity_scope: "Project",
    },
    {
      id: "ft-p3",
      name: "Handover Pack",
      color: "#06b6d4",
      reference_prefix: "HO",
      entity_scope: "Project",
    },
  ],
  Asset: [
    {
      id: "ft-a1",
      name: "Manual",
      color: "#0ea5e9",
      reference_prefix: "MAN",
      description: "Operating / service manual",
      entity_scope: "Asset",
    },
    {
      id: "ft-a2",
      name: "Inspection Cert",
      color: "#22c55e",
      reference_prefix: "CERT",
      entity_scope: "Asset",
    },
    {
      id: "ft-a3",
      name: "Warranty",
      color: "#f59e0b",
      reference_prefix: "WAR",
      entity_scope: "Asset",
    },
  ],
};
