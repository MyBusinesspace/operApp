import React, { useState, useRef, useEffect, useMemo } from "react";
import { readImportText, isExcelName, isCsvName } from "@/lib/readImportFile";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, Download, Check, Loader2, AlertCircle,
  FileText, ShoppingCart, BookOpen, Users, ChevronRight,
  FileSpreadsheet, RefreshCw, Database, FolderKanban, Wrench, ClipboardList, UserCheck, Box,
  Building2, ArrowLeftRight, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import { parseImportCsv as parseCSV } from "@/lib/importCsv";
import { resolveImportField as resolveField, DEDUPE_KEYS, getDedupeKey, saveMappedImportRecord } from "@/lib/importMatching";
import buildImportRecord from "@/lib/buildImportRecord";
import { saveXeroCreditNote } from "@/lib/xeroCreditImport";
import { loadExistingDocs, upsertDoc } from "@/lib/docReimportUpdate";
import { findOverlappingEntries } from "@/lib/timeEntryOverlap";
import { autoPostJournal } from "@/lib/autoPostJournal";
import ImportFieldMapping from "@/components/settings/ImportFieldMapping";
import ImportFilesSection from "@/components/settings/ImportFilesSection";
import MigrationWizard from "@/components/settings/MigrationWizard";
import DataExportSection from "@/components/settings/DataExportSection";
import DataExportCenter from "@/pages/settings/DataExportCenter";
import { ENTITY_KNOWN_FIELDS, ENTITY_APP_FIELDS, ENTITY_REQUIRED_FIELDS, FIELD_LABELS } from "@/lib/importCenterConfig";

// ── Entity definitions ──────────────────────────────────────────────────────
export const ENTITIES = [
  {
    key: "Contact",
    label: "Contacts",
    icon: Users,
    desc: "Customers, suppliers & companies",
    color: "bg-blue-50 text-blue-600",
    templateHeaders: ["ContactName", "CompanyName", "EmailAddress", "PhoneNumber", "AccountNumber", "Website", "TaxNumber",
      "PostalAddressLine1", "PostalCity", "PostalCountry", "BankAccountName", "BankAccountNumber", "FirstName", "LastName"],
    templateSample: ["Acme Corp", "Acme", "info@acme.com", "+971501234567", "ACC-001", "https://acme.com", "100123456700003",
      "123 Sheikh Zayed Rd", "Dubai", "UAE", "Emirates NBD", "AE070331234567890123456", "John", "Smith"],
  },
  {
    key: "ChartOfAccount",
    label: "Chart of Accounts",
    icon: BookOpen,
    desc: "Account codes & structure",
    color: "bg-violet-50 text-violet-600",
    templateHeaders: ["Code", "Name", "Type", "Tax Code", "Description", "Dashboard", "Enable Payments", "Balance"],
    templateSample: ["1000", "Cash on Hand", "Asset", "Tax Exempt (0%)", "Petty cash account", "No", "No", "0"],
  },
  {
    key: "Invoice",
    label: "Invoices",
    icon: FileText,
    desc: "Customer invoices with line items",
    color: "bg-emerald-50 text-emerald-600",
    templateHeaders: ["InvoiceNumber", "Reference", "ContactName", "EmailAddress", "InvoiceDate", "DueDate", "Total", "TaxTotal", "Currency", "Status", "Description", "AccountCode", "Quantity", "UnitAmount", "Discount", "TaxType", "TaxAmount", "LineAmount"],
    templateSample: ["INV-0001", "REF-001", "Acme Corp", "info@acme.com", "2026-06-01", "2026-06-30", "13125.00", "625.00", "AED", "AUTHORISED", "Monthly crane rental", "430", "1", "12500.00", "0", "OUTPUT2", "625.00", "13125.00"],
  },
  {
    key: "Bill",
    label: "Bills",
    icon: ShoppingCart,
    desc: "Supplier bills & payables",
    color: "bg-orange-50 text-orange-600",
    templateHeaders: ["InvoiceNumber", "Reference", "ContactName", "EmailAddress", "InvoiceDate", "DueDate", "Total", "TaxTotal", "Currency", "Status", "Description", "AccountCode", "Quantity", "UnitAmount", "Discount", "TaxType", "TaxAmount", "LineAmount"],
    templateSample: ["BILL-0001", "", "Office Supplies Co", "info@supplier.com", "2026-06-01", "2026-06-15", "3360.00", "160.00", "AED", "AUTHORISED", "Office supplies Q2", "609", "1", "3200.00", "0", "INPUT2", "160.00", "3360.00"],
  },
  {
    key: "Project",
    label: "Projects",
    icon: FolderKanban,
    desc: "Projects with location & budget",
    color: "bg-sky-50 text-sky-600",
    templateHeaders: ["ProjectName", "ProjectCode", "Type", "Status", "ClientName", "StartDate", "EndDate", "Budget", "Currency", "Location", "MapsLink", "Description", "Notes", "Tags"],
    templateSample: ["Tower Crane Rental", "PRJ-001", "Rental", "Active", "Acme Corp", "2026-01-01", "2026-12-31", "150000", "AED", "Dubai Marina", "", "Main crane project", "", ""],
  },
  {
    key: "WorkOrder",
    label: "Work Orders",
    icon: Wrench,
    desc: "Work orders linked to projects",
    color: "bg-amber-50 text-amber-600",
    templateHeaders: ["Title", "Reference", "Status", "Priority", "Type", "ProjectName", "ClientName", "AssetName", "ScheduledDate", "DueDate", "Location", "Description", "Notes"],
    templateSample: ["Monthly Maintenance WO", "WO-001", "Active", "Medium", "Maintenance", "Tower Crane Rental", "Acme Corp", "", "2026-06-01", "2026-06-30", "Dubai Marina", "Monthly inspection", ""],
  },
  {
    key: "Task",
    label: "Tasks",
    icon: ClipboardList,
    desc: "Tasks linked to work orders & projects",
    color: "bg-rose-50 text-rose-600",
    templateHeaders: ["title", "description", "status", "category", "work_order_name", "project_name", "contact_name", "asset_name", "assigned_employee_names", "planning_date", "planning_time_in", "planning_time_out", "priority", "location_address", "notes", "_subtasks"],
    templateSample: ["Inspect hoist mechanism", "Quarterly preventive maintenance of HVAC units", "Queued", "Inspection", "Monthly Maintenance WO", "Tower Crane Rental", "Acme Corp", "Unit #A42", "John Smith; Jane Doe", "2026-06-15", "08:00", "12:00", "High", "Dubai Marina Site A", "Client requests extra attention to Unit #A42", "[ ] Check filters | [ ] Clean coils | [x] Test thermostat"],
  },
  {
    key: "TimeEntry",
    label: "Timesheets",
    icon: ClipboardList,
    desc: "Time entries & timesheet records",
    color: "bg-rose-50 text-rose-600",
    templateHeaders: ["EmployeeName", "TaskTitle", "WorkOrderName", "ProjectName", "ContactName", "ClockInTime", "ClockOutTime", "DurationMinutes", "Notes"],
    templateSample: ["John Smith", "Inspect hoist mechanism", "Monthly Maintenance WO", "Tower Crane Rental", "Acme Corp", "2026-06-15 08:00", "2026-06-15 12:00", "240", "Routine inspection completed"],
  },
  {
    key: "Employee",
    label: "Employees",
    icon: UserCheck,
    desc: "Staff profiles & HR records",
    color: "bg-teal-50 text-teal-600",
    templateHeaders: ["FullName", "Email", "Phone", "Role", "Department", "Status", "HireDate", "Notes"],
    templateSample: ["John Smith", "john@company.com", "+971501234567", "Technician", "Field Services", "Active", "2025-01-15", ""],
  },
  {
    key: "Asset",
    label: "Assets",
    icon: Box,
    desc: "Equipment, vehicles & fixed assets",
    color: "bg-indigo-50 text-indigo-600",
    templateHeaders: ["Name", "SerialNumber", "Reference", "Category", "Status", "Manufacturer", "Model", "Year", "PurchaseDate", "PurchasePrice", "Currency", "Location", "Notes"],
    templateSample: ["Tower Crane TC-500", "SN-123456", "AST-001", "Crane", "Available", "Liebherr", "TC-500", "2020", "2020-03-15", "850000", "AED", "Dubai Marina", ""],
  },
  {
    key: "BankAccount",
    label: "Bank Accounts",
    icon: Building2,
    desc: "Bank accounts from Xero Chart of Accounts",
    color: "bg-cyan-50 text-cyan-600",
    templateHeaders: ["AccountName", "BankAccountName", "AccountNumber", "AccountType", "Currency", "Balance", "Code", "Status", "Dashboard", "Enable Payments"],
    templateSample: ["Main Current Account", "Emirates NBD", "012345678901", "Bank", "AED", "150000", "1000", "Active", "Yes", "Yes"],
  },
  {
    key: "BankTransaction",
    label: "Bank Transactions",
    icon: ArrowLeftRight,
    desc: "Bank statement transactions from Xero",
    color: "bg-lime-50 text-lime-600",
    templateHeaders: ["BankAccountName", "Date", "Amount", "Payee", "Description", "Particulars", "Reference", "Code", "TransactionType", "Reconciled", "Currency"],
    templateSample: ["Main Current Account", "2026-06-01", "-5500.00", "Acme Corp", "Office rent June", "", "REF-001", "4000", "SPEND", "Yes", "AED"],
  },
  {
    key: "Product",
    label: "Products & Services",
    icon: ShoppingCart,
    desc: "Items from Xero (products, services, prices)",
    color: "bg-fuchsia-50 text-fuchsia-600",
    templateHeaders: ["Code", "Name", "Description", "PurchaseDescription", "SalesPrice", "PurchasePrice", "IsSold", "IsPurchased", "IsTrackedAsInventory", "Unit"],
    templateSample: ["CRANE-001", "Tower Crane Rental", "Monthly rental of tower crane", "Rental cost", "12500", "8000", "Yes", "Yes", "No", "month"],
  },
  {
    key: "TaxRate",
    label: "Tax Rates",
    icon: BookOpen,
    desc: "Tax rates from Xero",
    color: "bg-violet-50 text-violet-600",
    templateHeaders: ["Name", "Rate"],
    templateSample: ["VAT 5%", "5"],
  },
];

const STEPS = [
  { num: 1, label: "Select Entity" },
  { num: 2, label: "Upload File" },
  { num: 3, label: "Preview & Import" },
];

const downloadCSV = (entity) => {
  const headers = entity.templateHeaders.join(",");
  const row = entity.templateSample.map(v => `"${v}"`).join(",");
  const blob = new Blob([`${headers}\n${row}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `${entity.key}_template.csv`; a.click();
  URL.revokeObjectURL(url);
};

const humanizeField = (f) => f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

// ── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, i) => (
        <React.Fragment key={step.num}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-300 ${
              currentStep > step.num ? "bg-primary text-primary-foreground"
              : currentStep === step.num ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
              : "bg-muted text-muted-foreground"}`}>
              {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
            </div>
            <span className={`text-xs font-medium hidden sm:inline ${currentStep >= step.num ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-10 sm:w-16 h-0.5 mx-1 rounded-full transition-colors duration-300 ${currentStep > step.num ? "bg-primary" : "bg-muted"}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Step 1: Select Entity ────────────────────────────────────────────────────
function StepSelectEntity({ onSelect, selected }) {
  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <Database className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">What would you like to import?</h2>
        <p className="text-xs text-muted-foreground mt-1">Select the type of data you want to bring into OPERAPP</p>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ENTITIES.map((entity) => (
          <motion.button key={entity.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => onSelect(entity)}
            className={`p-5 rounded-xl border-2 text-left transition-all duration-200 relative ${
              selected?.key === entity.key ? "border-primary bg-primary/5 shadow-md" : "border-border hover:border-primary/40 hover:bg-accent/50"}`}>
            <div className="flex items-start gap-3">
              <div className={`p-2.5 rounded-lg ${entity.color} shrink-0`}><entity.icon className="w-5 h-5" /></div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">{entity.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{entity.desc}</p>
              </div>
              {selected?.key === entity.key && <Check className="w-5 h-5 text-primary shrink-0" />}
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ── Step 2: Upload File ──────────────────────────────────────────────────────
export function StepUpload({ entity, file, setFile, parseResult, setParseResult, onNext }) {
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleFile = async (f) => {
    setError("");
    if (!f) return;
    if (!isCsvName(f.name) && !isExcelName(f.name)) { setError("Please upload a CSV (.csv) or Excel (.xlsx) file"); return; }
    setFile(f); setParsing(true);
    try {
      const text = await readImportText(f);
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("The file appears to be empty or has no data rows."); setFile(null); setParseResult(null);
      } else { setParseResult(parsed); onNext(); }
    } catch { setError("Could not read the file. Make sure it's a valid CSV."); setFile(null); setParseResult(null); }
    setParsing(false);
  };

  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <Upload className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Upload your {entity.label} data</h2>
        <p className="text-xs text-muted-foreground mt-1">Upload a CSV or Excel file exported from your previous system</p>
      </motion.div>
      <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <div>
            <p className="text-xs font-medium text-foreground">Need a template?</p>
            <p className="text-xs text-muted-foreground">Download a CSV with the correct column headers</p>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => downloadCSV(entity)}>
          <Download className="w-3.5 h-3.5" /> Template
        </Button>
      </div>
      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
          dragOver ? "border-primary bg-primary/5" : file ? "border-emerald-300 bg-emerald-50/50" : "border-border hover:border-primary/40 hover:bg-accent/30"}`}>
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
        {parsing ? (
          <div className="flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 text-primary animate-spin" /><p className="text-xs text-muted-foreground">Reading file...</p></div>
        ) : file ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="w-5 h-5 text-emerald-600" /></div>
            <p className="font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            <button onClick={(e) => { e.stopPropagation(); setFile(null); setParseResult(null); }} className="text-xs text-primary hover:underline mt-1">Remove & choose another</button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Upload className="w-5 h-5 text-primary" /></div>
            <div><p className="font-medium text-foreground">Click to upload or drag & drop</p><p className="text-xs text-muted-foreground mt-0.5">CSV or Excel files</p></div>
          </div>
        )}
      </div>
      {error && <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-xs"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
    </div>
  );
}

// ── Step 3: Preview & Import ─────────────────────────────────────────────────
export function StepPreview({ entity, parseResult, file, onBack, onReset, resetLabel = "Import More", skipAutoPost = false }) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [importMode, setImportMode] = useState("append");
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 });
  const [columnOverrides, setColumnOverrides] = useState({});
  const [schemaFields, setSchemaFields] = useState(null);
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

  const { headers, rows } = parseResult;
  const knownFields = ENTITY_KNOWN_FIELDS[entity.key] || [];

  // Dynamically load the entity's real schema fields so users can map ANY csv
  // column to ANY field of the entity (not just a hardcoded subset).
  useEffect(() => {
    let mounted = true;
    const client = base44.entities[entity.key];
    if (client?.schema) {
      client.schema()
        .then(s => {
          if (!mounted) return;
          const builtins = new Set(["id", "created_date", "updated_date", "created_by_id"]);
          const fields = s?.properties ? Object.keys(s.properties).filter(f => !builtins.has(f)) : null;
          setSchemaFields(fields && fields.length > 0 ? fields : null);
        })
        .catch(() => setSchemaFields(null));
    } else {
      setSchemaFields(null);
    }
    return () => { mounted = false; };
  }, [entity.key]);

  // Warn user before leaving during import
  useEffect(() => {
    if (!importing) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [importing]);

  const appFields = useMemo(() => {
    const virtualFields = (ENTITY_APP_FIELDS[entity.key] || []).filter(f => f.startsWith("_"));
    if (schemaFields && schemaFields.length > 0) {
      // ChartOfAccount: category is auto-computed from type, subtype was removed — hide both from mapping
      const exclude = entity.key === "ChartOfAccount" ? new Set(["category", "subtype"]) : new Set();
      return [...schemaFields.filter(f => !exclude.has(f)), ...virtualFields];
    }
    return ENTITY_APP_FIELDS[entity.key] || [];
  }, [schemaFields, entity.key]);

  const resolvedField = (h) => resolveField(entity.key, h, columnOverrides, knownFields);
  // Select / reference fields whose allowed values are configured in Settings and rarely
  // match arbitrary CSV text — shown but locked: users set them per-record instead.
  const lockedFields = useMemo(() => {
    const locked = new Set();
    const exists = (f) => appFields.includes(f);
    if (exists("status") && !["Invoice", "Bill", "BankTransaction", "BankAccount", "Product"].includes(entity.key)) locked.add("status");
    if (exists("category")) locked.add("category");
    if (exists("group_id")) locked.add("group_id");
    return locked;
  }, [appFields, entity.key]);
  const isLockedField = (f) => lockedFields.has(f);
  // Effective mapped field, blanking locked fields (not importable from CSV).
  const effectiveField = (h) => { const f = resolvedField(h); return f && !isLockedField(f) ? f : null; };

  // Detect duplicate dedupe keys within the file — warns when rows will be merged into one record
  const duplicateKeyWarning = useMemo(() => {
    if (!parseResult) return null;
    // Skip for Invoice/Bill where multiple rows per document is expected (line items grouped by key)
    if (entity.key === "Invoice" || entity.key === "Bill") return null;
    const dedupeKeys = DEDUPE_KEYS[entity.key];
    if (!dedupeKeys?.length) return null;
    const buildFn = (row) => buildImportRecord(row, { entityKey: entity.key, headers, effectiveField });
    const counts = new Map();
    const firstByKey = new Map();
    for (const row of rows) {
      let rec;
      try { rec = buildFn(row); } catch { continue; }
      if (rec._skip) continue;
      const key = getDedupeKey(rec, entity.key);
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
      if (!firstByKey.has(key)) firstByKey.set(key, rec);
    }
    const dups = [];
    for (const [key, count] of counts) {
      if (count > 1) {
        const rec = firstByKey.get(key);
        dups.push({ key, count, label: rec.number || rec.full_name || rec.name || rec.code || key.split("||")[0] || "(unknown)" });
      }
    }
    if (dups.length === 0) return null;
    dups.sort((a, b) => b.count - a.count);
    const totalMerged = dups.reduce((s, d) => s + (d.count - 1), 0);
    return { totalMerged, duplicateGroups: dups.length, examples: dups.slice(0, 5) };
  }, [parseResult, entity.key, columnOverrides]);
  const isColMapped = (h) => effectiveField(h) !== null;
  const fieldToSource = {};
  headers.forEach(h => { const f = effectiveField(h); if (f && !fieldToSource[f]) fieldToSource[f] = h; });
  const usedSources = new Set(headers.filter(h => effectiveField(h) !== null));

  const assignSource = (field, sourceHeader) => {
    setColumnOverrides(prev => {
      const next = { ...prev };
      headers.forEach(h => { if (resolveField(entity.key, h, next, knownFields) === field) next[h] = "__skip__"; });
      if (sourceHeader) next[sourceHeader] = field;
      return next;
    });
  };

  const labelFor = (f) => FIELD_LABELS[entity.key]?.[f] || humanizeField(f);

  const getAutoTarget = (h) => resolveField(entity.key, h, {}, knownFields);

  const handleImport = async (test = false) => {
    setImporting(true); setError(""); setResult(null);
    const effectiveMode = test ? "append" : importMode;
    try {
      const entityClient = base44.entities[entity.key];
      if (importMode === "replace" && !test) {
        setDeleting(true);
        try {
          let totalDeleted = 0;
          while (true) {
            const page = await entityClient.filter({}, "-created_date", 500);
            const items = page.items || page;
            if (!items || items.length === 0) break;
            await entityClient.deleteMany({ id: { $in: items.map(r => r.id) } });
            totalDeleted += items.length;
            setDeleteProgress({ current: totalDeleted, total: totalDeleted });
            if (items.length < 500) break;
          }
        } catch (delErr) {
          setError("Failed to clear existing records: " + delErr.message);
          setImporting(false); setDeleting(false); setDeleteProgress({ current: 0, total: 0 }); return;
        }
        setDeleting(false);
      }

      // Pre-load contacts for name→id lookup (used by Project, WorkOrder, Invoice, Bill & BankTransaction)
      let contactsByName = {}; // normalized name → { id, full_name }
      if (entity.key === "Project" || entity.key === "WorkOrder" || entity.key === "Task" || entity.key === "Invoice" || entity.key === "Bill" || entity.key === "BankTransaction" || entity.key === "CreditNote") {
        try {
          const allContacts = await base44.entities.Contact.list("-created_date", 100000);
          allContacts.forEach(c => {
            const key = (c.full_name || "").trim().toLowerCase();
            if (key) contactsByName[key] = c;
          });
        } catch {}
      }
      // Pre-load projects for name→id lookup (used by WorkOrder)
      let projectsByName = {};
      if (entity.key === "WorkOrder" || entity.key === "Task") {
        try {
          const allProjects = await base44.entities.Project.list("-created_date", 100000);
          allProjects.forEach(p => {
            const key = (p.name || "").trim().toLowerCase();
            if (key) projectsByName[key] = p;
          });
        } catch {}
      }
      // Pre-load bank accounts for name→id lookup (used by BankTransaction)
      let bankAccountsByName = {};
      if (entity.key === "BankTransaction") {
        try {
          const allBanks = await base44.entities.BankAccount.list("-created_date", 100000);
          allBanks.forEach(b => {
            const nameKey = (b.name || "").trim().toLowerCase();
            if (nameKey) bankAccountsByName[nameKey] = b;
            const bankNameKey = (b.bank_name || "").trim().toLowerCase();
            if (bankNameKey && !bankAccountsByName[bankNameKey]) bankAccountsByName[bankNameKey] = b;
            const acctKey = (b.account_number || "").trim().toLowerCase();
            if (acctKey && !bankAccountsByName[acctKey]) bankAccountsByName[acctKey] = b;
          });
        } catch {}
      }
      // Pre-load chart of accounts for code→id lookup (used by BankAccount, Invoice & Bill line items)
      let coaByCode = {};
      let coaByName = {};
      if (entity.key === "BankAccount" || entity.key === "Invoice" || entity.key === "Bill" || entity.key === "CreditNote") {
        try {
          const allCOA = await base44.entities.ChartOfAccount.list("-created_date", 100000);
          allCOA.forEach(a => {
            const codeKey = (a.code || "").trim().toLowerCase();
            if (codeKey) coaByCode[codeKey] = a;
            const nameKey = (a.name || "").trim().toLowerCase();
            if (nameKey) coaByName[nameKey] = a;
          });
        } catch {}
      }
      // Pre-load employees for name→id lookup (used by TimeEntry)
      let employeesByName = {};
      if (entity.key === "TimeEntry" || entity.key === "Task") {
        try {
          const allEmployees = await base44.entities.Employee.list("-created_date", 100000);
          allEmployees.forEach(e => {
            const key = (e.full_name || "").trim().toLowerCase();
            if (key) employeesByName[key] = e;
          });
        } catch {}
      }
      // Pre-load work orders for name→id lookup (used by Task)
      let workOrdersByName = {};
      if (entity.key === "Task") {
        try {
          const allWOs = await base44.entities.WorkOrder.list("-created_date", 100000);
          allWOs.forEach(w => {
            const key = (w.title || "").trim().toLowerCase();
            if (key) workOrdersByName[key] = w;
          });
        } catch {}
      }
      // Pre-load assets for name→id lookup (used by Task)
      let assetsByName = {};
      if (entity.key === "Task") {
        try {
          const allAssets = await base44.entities.Asset.list("-created_date", 100000);
          allAssets.forEach(a => {
            const key = (a.name || "").trim().toLowerCase();
            if (key) assetsByName[key] = a;
          });
        } catch {}
      }
      // Pre-load tasks for title→id lookup (used by TimeEntry)
      let tasksByTitle = {};
      if (entity.key === "TimeEntry") {
        try {
          const allTasks = await base44.entities.Task.list("-created_date", 100000);
          allTasks.forEach(t => {
            const key = (t.title || "").trim().toLowerCase();
            if (key) tasksByTitle[key] = t;
          });
        } catch {}
      }

      // Pre-load existing records by dedupe key for "Add to existing" upsert
      let existingByDedupeKey = {}; // normalized key -> record
      const dedupeKeys = DEDUPE_KEYS[entity.key];
      if (effectiveMode === "append" && dedupeKeys?.length && !["Product", "TaxRate", "BankAccount"].includes(entity.key)) {
        try {
          if (["Invoice", "Bill", "CreditNote"].includes(entity.key)) {
            // Cursor-paginated read so large ledgers are fully covered (list() caps at 100k).
            existingByDedupeKey = await loadExistingDocs(entity.key);
          } else {
            const all = await entityClient.list("-created_date", 100000);
            (all.items || all).forEach(r => {
              const key = getDedupeKey(r, entity.key);
              if (key) existingByDedupeKey[key] = r;
            });
          }
        } catch {}
      }

      // Helper: find or create a contact by name, returns { id, full_name }
      const resolveContact = async (name) => {
        if (!name || !name.trim()) return null;
        const key = name.trim().toLowerCase();
        if (contactsByName[key]) return contactsByName[key];
        // Create new contact
        try {
          const created = await base44.entities.Contact.create({ full_name: name.trim() });
          contactsByName[key] = created;
          return created;
        } catch { return null; }
      };

      // Build a flat record from a CSV row
      const buildRecord = (row) => buildImportRecord(row, { entityKey: entity.key, headers, effectiveField });

      const passesRequired = (rec) => {
        if (entity.key === "ChartOfAccount") {
          if (!rec.name || rec.name.trim() === "") return false;
          const isBank = (rec.type || "").trim().toLowerCase() === "bank";
          if (!isBank && (!rec.code || rec.code.trim() === "")) return false;
        }
        const required = ENTITY_REQUIRED_FIELDS[entity.key] || [];
        return required.every(f => rec[f] !== undefined && rec[f] !== null && String(rec[f]).trim() !== "");
      };

      let imported = 0, updated = 0, unchanged = 0, failed = [];
      const updatedChanges = []; // first 10 updated docs with what changed (Invoice/Bill/CreditNote)

      // Invoice / Bill: Xero exports one row per line item with the same InvoiceNumber.
      // Group rows by number so each invoice gets all its line items in a single record.
      let processedRows = rows;
      if (entity.key === "Invoice" || entity.key === "Bill") {
        let numberHeader = null;
        headers.forEach(h => { if (effectiveField(h) === "number") numberHeader = h; });
        const contactHeader = headers.find(h => effectiveField(h) === "contact_name");
        const dateHeader = headers.find(h => effectiveField(h) === "issue_date");
        const refHeader = headers.find(h => effectiveField(h) === "reference");
        const totalHeader = headers.find(h => effectiveField(h) === "total");
        const groups = new Map();
        const ordered = [];
        for (const row of rows) {
          const num = numberHeader ? String(row[numberHeader] || "").trim() : "";
          if (!num) {
            // No invoice number: group by contact + date + total (matches dedup key minus line-items hash)
            const fbKey = [
              contactHeader ? String(row[contactHeader] || "").trim().toLowerCase() : "",
              dateHeader ? String(row[dateHeader] || "").trim() : "",
              totalHeader ? String(row[totalHeader] || "").trim() : "",
            ].join("||");
            if (!groups.has(fbKey)) { groups.set(fbKey, []); ordered.push({ _groupKey: fbKey }); }
            groups.get(fbKey).push(row);
            continue;
          }
          // Group by number + contact + date + total (case-insensitive): same number with different dates/totals are separate documents
          const groupKey = [
            num.toLowerCase(),
            contactHeader ? String(row[contactHeader] || "").trim().toLowerCase() : "",
            dateHeader ? String(row[dateHeader] || "").trim() : "",
            totalHeader ? String(row[totalHeader] || "").trim() : "",
          ].join("||");
          if (!groups.has(groupKey)) { groups.set(groupKey, []); ordered.push({ _groupKey: groupKey }); }
          groups.get(groupKey).push(row);
        }
        processedRows = ordered.map(item => {
          if (!item._groupKey) return item;
          const groupRows = groups.get(item._groupKey);
          const first = groupRows[0];
          const combined = { ...first };
          combined._grouped_lines = groupRows.map(r => {
            const li = {};
            headers.forEach(h => {
              const f = effectiveField(h);
              if (!f) return;
              const val = r[h];
              if (val === undefined || val === "") return;
              if (f === "_li_description") li.description = val;
              else if (f === "_li_account_code") li.account_code = val;
              else if (f === "_li_quantity") li.quantity = val;
              else if (f === "_li_unit_price") li.unit_price = val;
              else if (f === "_li_discount") li.discount = val;
              else if (f === "_li_tax_amount") li.tax_amount = val;
              else if (f === "_li_total") li.total = val;
            });
            return li;
          });
          return combined;
        });
      }

      // Test mode: limit to first 20 records
      if (test) processedRows = processedRows.slice(0, 20);

      // Check if Xero GL has been imported — if so, skip auto-posting journal entries
      // Also skip if skipAutoPost prop is set (migration wizard — GL will be imported separately)
      let glImported = skipAutoPost;
      let postedCount = 0;
      if (!glImported && (entity.key === "Invoice" || entity.key === "Bill")) {
        try {
          const glCheck = await base44.entities.JournalEntry.filter(
            { reference: { $regex: "^XERO-" } },
            { limit: 1, fields: ["id"] }
          );
          glImported = (glCheck.items || glCheck).length > 0;
        } catch {}
      }

      // Projects, WorkOrders, BankAccounts, BankTransactions, Invoices, Bills & TimeEntries: one-by-one to resolve links
      if (entity.key === "Project" || entity.key === "WorkOrder" || entity.key === "Task" || entity.key === "BankAccount" || entity.key === "BankTransaction" || entity.key === "Invoice" || entity.key === "Bill" || entity.key === "TimeEntry" || entity.key === "CreditNote") {
        for (let i = 0; i < processedRows.length; i++) {
          const record = buildRecord(processedRows[i]);
          if (!passesRequired(record)) { setProgress(Math.round(((i + 1) / processedRows.length) * 100)); continue; }
          if (record._skip) { setProgress(Math.round(((i + 1) / processedRows.length) * 100)); continue; }
          if (record._is_credit_note) {
            try {
              for (const line of record.line_items || []) {
                const account = coaByCode[String(line.account_code || "").trim().toLowerCase()];
                if (account) { line.account_id = account.id; line.account_name = account.name; }
              }
              const saved = await saveXeroCreditNote(record);
              if (saved.action === "created") { imported++; }
              else if (saved.action === "updated") { imported++; updated++; if (updatedChanges.length < 10) updatedChanges.push({ number: record.number, contact: record.contact_name, changes: saved.changeList || [] }); }
              else { unchanged++; }
            } catch (err) { failed.push(`Row ${i + 1} (${record.number || "credit note"}): ${err.message}`); }
            setProgress(Math.round(((i + 1) / processedRows.length) * 100));
            continue;
          }
          if (["Invoice", "Bill"].includes(entity.key) && Number(record.total) < 0) {
            failed.push(`Row ${i + 1} (${record.number || "no number"}): negative total without a recognised credit note, overpayment or prepayment Type.`);
            continue;
          }
          if (entity.key === "BankAccount") {
            try {
              if (!record.chart_account_id) {
                const account = coaByCode[String(record.chart_account_code || "").trim().toLowerCase()];
                if (account) { record.chart_account_id = account.id; record.chart_account_name = account.name; }
              }
              if (!record.chart_account_id && record.name) {
                const byName = coaByName[String(record.name).trim().toLowerCase()];
                if (byName) { record.chart_account_id = byName.id; record.chart_account_code = byName.code; record.chart_account_name = byName.name; }
              }
              const saved = await saveMappedImportRecord("BankAccount", record, "name", effectiveMode === "append");
              imported++; if (saved.updated) updated++;
            } catch (err) { failed.push(`Row ${i + 1} (${record.name}): ${err.message}`); }
            setProgress(Math.round(((i + 1) / processedRows.length) * 100));
            continue;
          }
          // BankTransaction: resolve bank account by name (required)
          if (entity.key === "BankTransaction" && record.bank_account_name) {
            const bank = bankAccountsByName[record.bank_account_name.trim().toLowerCase()];
            if (bank) { record.bank_account_id = bank.id; record.bank_account_name = bank.name; }
            else { failed.push(`Row ${i + 1}: Bank account "${record.bank_account_name}" not found`); setProgress(Math.round(((i + 1) / processedRows.length) * 100)); continue; }
          }
          // CreditNote: build line_items from _li_* virtual fields
          if (entity.key === "CreditNote") {
            const liDesc = record._li_description || "";
            const liCode = record._li_account_code || "";
            if (liDesc || liCode) {
              const li = {};
              if (liCode) li.account_code = liCode;
              if (liDesc) li.description = liDesc;
              if (record._li_quantity !== undefined) li.quantity = Number(record._li_quantity) || 1;
              if (record._li_unit_price !== undefined) li.unit_price = Number(record._li_unit_price) || 0;
              if (record._li_discount !== undefined && record._li_discount !== "") li.discount = String(record._li_discount);
              if (record._li_tax_amount !== undefined) li.tax_rate = Number(record._li_tax_amount) || 0;
              if (record._li_total !== undefined) li.total = Number(record._li_total) || 0;
              record.line_items = [li];
            }
            ["_li_description", "_li_account_code", "_li_quantity", "_li_unit_price", "_li_discount", "_li_tax_rate", "_li_tax_amount", "_li_total"].forEach(k => delete record[k]);
            // Map Xero status
            if (record.status) {
              const s = String(record.status).trim().toUpperCase();
              if (s === "VOIDED" || s === "DELETED") { record._skip = true; }
              else record.status = ({ DRAFT: "Draft", AUTHORISED: "Awaiting Application", SUBMITTED: "Awaiting Approval", PAID: "Applied" })[s] || record.status;
            }
            if (!record.status && !record._skip) record.status = "Draft";
            // Compute document totals from lines when Total/TaxTotal not provided
            if (!record.total && record.line_items?.length) {
              record.subtotal = record.line_items.reduce((s, l) => s + (Number(l.total) || 0), 0);
              record.tax_amount = record.line_items.reduce((s, l) => s + (Number(l.tax_rate) || 0), 0);
              record.total = record.subtotal + record.tax_amount;
            }
            // Compute subtotal from total - tax_amount when subtotal is missing
            if (!record.subtotal && record.total) {
              record.subtotal = record.total - (record.tax_amount || 0);
            }
          }
          // WorkOrder: resolve project by name
          if (entity.key === "WorkOrder" && record.project_name) {
            const proj = projectsByName[record.project_name.trim().toLowerCase()];
            if (proj) { record.project_id = proj.id; record.project_name = proj.name; }
          }
          // Task: resolve work order by name
          if (entity.key === "Task" && record.work_order_name) {
            const wo = workOrdersByName[record.work_order_name.trim().toLowerCase()];
            if (wo) { record.work_order_id = wo.id; record.work_order_name = wo.title; }
          }
          // Task: resolve project by name
          if (entity.key === "Task" && record.project_name) {
            const proj = projectsByName[record.project_name.trim().toLowerCase()];
            if (proj) { record.project_id = proj.id; record.project_name = proj.name; }
          }
          // Task: resolve asset by name
          if (entity.key === "Task" && record.asset_name) {
            const asset = assetsByName[record.asset_name.trim().toLowerCase()];
            if (asset) { record.asset_id = asset.id; record.asset_name = asset.name; }
          }
          // Task: resolve assigned employees by name (semicolon-separated)
          if (entity.key === "Task" && record.assigned_employee_names) {
            const names = String(record.assigned_employee_names).split(/[;|]/).map(s => s.trim()).filter(Boolean);
            const ids = []; const resolvedNames = [];
            for (const n of names) {
              const emp = employeesByName[n.trim().toLowerCase()];
              if (emp) { ids.push(emp.id); resolvedNames.push(emp.full_name); }
            }
            if (ids.length > 0) { record.assigned_employees = ids; record.assigned_employee_names = resolvedNames; }
            else { delete record.assigned_employee_names; }
          }
          // Task: extract subtasks for post-create
          let taskSubtaskText = null;
          if (entity.key === "Task" && record._subtasks) {
            taskSubtaskText = record._subtasks;
            delete record._subtasks;
          }
          // TimeEntry: resolve employee by name (required)
          if (entity.key === "TimeEntry" && record.employee_name) {
            const emp = employeesByName[record.employee_name.trim().toLowerCase()];
            if (emp) { record.employee_id = emp.id; record.employee_name = emp.full_name; }
            else { failed.push(`Row ${i + 1}: Employee "${record.employee_name}" not found`); setProgress(Math.round(((i + 1) / processedRows.length) * 100)); continue; }
          }
          // TimeEntry: resolve task by title (required)
          if (entity.key === "TimeEntry" && record.task_title) {
            const task = tasksByTitle[record.task_title.trim().toLowerCase()];
            if (task) {
              record.task_id = task.id;
              record.task_title = task.title;
              if (!record.work_order_name && task.work_order_name) record.work_order_name = task.work_order_name;
              if (!record.project_name && task.project_name) record.project_name = task.project_name;
              if (!record.contact_name && task.contact_name) record.contact_name = task.contact_name;
              if (!record.asset_name && task.asset_name) record.asset_name = task.asset_name;
            } else { failed.push(`Row ${i + 1}: Task "${record.task_title}" not found`); setProgress(Math.round(((i + 1) / processedRows.length) * 100)); continue; }
          }
          // Resolve contact by name — create if not found (never leave contact_id empty)
          if (record.contact_name) {
            const contact = await resolveContact(record.contact_name);
            if (contact) { record.contact_id = contact.id; record.contact_name = contact.full_name; }
            else if (entity.key !== "BankTransaction") {
              // For BankTransaction, contact is optional (bank fees may not have a contact)
              failed.push(`Row ${i + 1}: Contact "${record.contact_name}" not found and could not be created`);
              setProgress(Math.round(((i + 1) / processedRows.length) * 100));
              continue;
            }
          }
          // Invoice / Bill / CreditNote: resolve line item account_code → account_id + account_name
          if ((entity.key === "Invoice" || entity.key === "Bill" || entity.key === "CreditNote") && record.line_items) {
            for (const li of record.line_items) {
              if (li.account_code) {
                const coa = coaByCode[String(li.account_code).trim().toLowerCase()];
                if (coa) { li.account_id = coa.id; li.account_name = coa.name; }
              }
            }
          }
          // TimeEntry: reject overlaps before creating
          if (entity.key === "TimeEntry" && record.employee_id && record.clock_in_time && record.clock_out_time) {
            const overlaps = await findOverlappingEntries(record.employee_id, record.clock_in_time, record.clock_out_time, null);
            if (overlaps.length > 0) {
              failed.push(`Row ${i + 1}: Time range overlaps with ${overlaps.length} existing ${overlaps.length === 1 ? "entry" : "entries"}`);
              setProgress(Math.round(((i + 1) / processedRows.length) * 100));
              continue;
            }
          }
          try {
            if (entity.key === "Invoice" || entity.key === "Bill") {
              // Surgical upsert: create new docs, update only changed fields on existing,
              // and never post journals on update (GL brings historical journals).
              const res = await upsertDoc(entity.key, record, existingByDedupeKey);
              if (res.action === "created") {
                imported++;
                // Auto-post only for newly created approved docs (never on update)
                if (!glImported) {
                  const docStatus = String(res.record?.status || record.status || "");
                  if (docStatus === "Awaiting Payment" || docStatus === "Paid") {
                    try { await autoPostJournal(entity.key, res.record); postedCount++; } catch {}
                  }
                }
              } else if (res.action === "updated") {
                imported++; updated++;
                if (updatedChanges.length < 10) updatedChanges.push({ number: record.number, contact: record.contact_name, changes: res.changeList || [] });
              } else {
                unchanged++;
              }
            } else {
              // Other entities: blunt upsert (unchanged behaviour)
              const dedupeKey = getDedupeKey(record, entity.key);
              const existing = dedupeKey ? existingByDedupeKey[dedupeKey] : null;
              let newTaskId = null;
              let fullDoc = null;
              if (existing) {
                await entityClient.update(existing.id, record);
                newTaskId = existing.id;
                fullDoc = { ...existing, ...record, id: existing.id };
                imported++; updated++;
              } else {
                const created = await entityClient.create(record);
                if (dedupeKey) existingByDedupeKey[dedupeKey] = created;
                newTaskId = created?.id;
                fullDoc = created;
                imported++;
              }
              // Auto-post journal entry for approved Invoices/Bills (skip if GL already imported)
              if ((entity.key === "Invoice" || entity.key === "Bill") && !glImported && fullDoc) {
                const docStatus = String(fullDoc.status || "");
                if (docStatus === "Awaiting Payment" || docStatus === "Paid") {
                  try {
                    await autoPostJournal(entity.key, fullDoc);
                    postedCount++;
                  } catch {}
                }
              }
              // Task: create subtasks linked to the new/updated task
              if (entity.key === "Task" && taskSubtaskText && newTaskId) {
                const subs = String(taskSubtaskText).split("|").map(s => s.trim()).filter(Boolean);
                for (let si = 0; si < subs.length; si++) {
                  let done = false; let subTitle = subs[si];
                  const m = subTitle.match(/^\[(x| )\]\s*(.*)$/i);
                  if (m) { done = m[1].toLowerCase() === "x"; subTitle = m[2].trim(); }
                  if (subTitle) {
                    try {
                      await base44.entities.TaskSubtask.create({ task_id: newTaskId, title: subTitle, done, sort_order: si });
                    } catch {}
                  }
                }
              }
            }
          } catch (err) {
            failed.push(`Row ${i + 1}: ${err.message}`);
          }
          setProgress(Math.round(((i + 1) / processedRows.length) * 100));
        }
      } else if (["Product", "TaxRate"].includes(entity.key)) {
        for (let i = 0; i < processedRows.length; i++) {
          try {
            const record = buildRecord(processedRows[i]);
            const missing = (ENTITY_REQUIRED_FIELDS[entity.key] || []).filter(field => record[field] === undefined || record[field] === null || String(record[field]).trim() === "");
            if (missing.length) throw new Error(`Missing required field(s): ${missing.join(", ")}`);
            const saved = await saveMappedImportRecord(entity.key, record, entity.key === "Product" ? "code" : "name", effectiveMode === "append");
            imported++; if (saved.updated) updated++;
          } catch (err) {
            const detail = err.response?.data?.message || err.response?.data?.detail || err.message;
            failed.push(`Row ${i + 1}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
          }
          setProgress(Math.round(((i + 1) / processedRows.length) * 100));
        }
      } else {
        // All other entities: batch create (faster), with upsert in append mode
        const batchRows = test ? rows.slice(0, 20) : rows;
        for (let i = 0; i < batchRows.length; i += 100) {
          const batch = batchRows.slice(i, i + 100).map(buildRecord).filter(passesRequired);
          // Split into updates vs creates based on dedupe key
          const toCreate = []; const toUpdate = [];
          for (const rec of batch) {
            const dedupeKey = getDedupeKey(rec, entity.key);
            const existing = dedupeKey ? existingByDedupeKey[dedupeKey] : null;
            if (existing) toUpdate.push({ id: existing.id, ...rec });
            else toCreate.push(rec);
          }
          try {
            if (toCreate.length) {
              const created = await entityClient.bulkCreate(toCreate);
              imported += created.length;
              if (dedupeKeys) created.forEach(r => {
                const key = getDedupeKey(r, entity.key);
                if (key) existingByDedupeKey[key] = r;
              });
            }
            if (toUpdate.length) {
              await entityClient.bulkUpdate(toUpdate);
              imported += toUpdate.length; updated += toUpdate.length;
            }
          } catch (batchErr) {
            failed.push(`Batch ${Math.floor(i / 100) + 1}: ${batchErr.message}`);
          }
          setProgress(Math.round(((i + batch.length) / batchRows.length) * 100));
        }
      }
      const newContactsCreated = Object.keys(contactsByName).length > 0 && (entity.key === "Project" || entity.key === "WorkOrder")
        ? Object.values(contactsByName).filter(c => !c.created_date || (new Date() - new Date(c.created_date)) < 120000).length
        : 0;
      setResult({ imported, updated, unchanged, updatedChanges, failed, total: test ? Math.min(20, rows.length) : rows.length, mode: effectiveMode, testMode: test, newContactsCreated, postedCount, glImported });
      try {
        await base44.entities.ImportRecord.create({
          entity_type: entity.key,
          imported_at: new Date().toISOString(),
          record_count: imported,
          created_count: imported - updated,
          updated_count: updated,
          mode: effectiveMode,
          file_name: file?.name || "",
        });
      } catch {}
    } catch (err) { setError(err.message || "Import failed"); }
    setImporting(false);
  };

  const NAV_PATHS = {
    ChartOfAccount: "accounting/chart-of-accounts",
    Contact: "contacts", Invoice: "sales/invoices", Bill: "purchasing/bills",
    Project: "projects", WorkOrder: "work-orders", Task: "tasks", TimeEntry: "timesheets", Employee: "employees", Asset: "assets",
    BankAccount: "accounting/banks", BankTransaction: "accounting/banks",
    Product: "sales/products", TaxRate: "settings/coa-templates", CreditNote: "sales/credit-notes",
  };

  if (result) {
    return (
      <div className="mx-auto text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{result.testMode ? "Test Import Complete" : "Import Complete"}</h2>
          <p className="text-muted-foreground mt-1">
            {result.mode === "replace"
              ? `Existing records cleared. ${result.imported} of ${result.total} records imported successfully.`
              : `${result.imported} of ${result.total} records imported successfully.`}
          </p>
          {result.testMode && (
            <p className="text-xs text-amber-600 mt-1 font-medium">
              Test mode: only the first 20 records were imported. Click "{resetLabel}" to import all records.
            </p>
          )}
          {result.mode === "append" && ["Invoice", "Bill", "CreditNote"].includes(entity.key) && (
            <p className="text-xs mt-1">
              <span className="text-emerald-600 font-medium">{result.imported - result.updated} new</span>
              {" / "}
              <span className="text-blue-600 font-medium">{result.updated} updated</span>
              {result.unchanged > 0 && (
                <>
                  {" / "}
                  <span className="text-muted-foreground font-medium">{result.unchanged} unchanged</span>
                </>
              )}
            </p>
          )}
          {result.mode === "append" && !["Invoice", "Bill", "CreditNote"].includes(entity.key) && result.updated > 0 && (
            <p className="text-xs text-emerald-600 mt-1">
              {result.updated} existing record{result.updated > 1 ? "s" : ""} updated (matched by key), {result.imported - result.updated} new.
            </p>
          )}
          {result.updatedChanges?.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-blue-50 border border-blue-200 text-left max-h-48 overflow-y-auto">
              <p className="text-xs font-semibold text-blue-800 mb-2">Updated documents (first {result.updatedChanges.length}):</p>
              <ul className="space-y-1.5">
                {result.updatedChanges.map((c, i) => (
                  <li key={i} className="text-xs text-blue-700">
                    <span className="font-mono font-medium">{c.number || "(no number)"}</span>
                    {c.contact ? <span className="text-muted-foreground"> · {c.contact}</span> : null}
                    <span className="text-muted-foreground"> — </span>
                    <span className="text-blue-600">{(c.changes || []).map((ch) => `${ch.label}: ${String(ch.from ?? "—")} → ${String(ch.to ?? "—")}`).join(", ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.newContactsCreated > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              {result.newContactsCreated} new contact{result.newContactsCreated > 1 ? "s" : ""} were created automatically from unrecognized client names.
            </p>
          )}
          {result.glImported !== undefined && (entity.key === "Invoice" || entity.key === "Bill") && (
            <p className="text-xs text-emerald-600 mt-1">
              {result.glImported
                ? "Journal entries skipped — Xero General Ledger already imported (posting would duplicate)."
                : `${result.postedCount} journal entr${result.postedCount === 1 ? "y was" : "ies were"} auto-posted for approved documents.`}
            </p>
          )}
          {result.failed.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-xs text-left">
              <p className="font-medium mb-1">{result.failed.length} batches had errors:</p>
              {result.failed.map((f, i) => <p key={i} className="text-xs opacity-80">{f}</p>)}
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={onReset} variant="outline" className="gap-1.5"><RefreshCw className="w-4 h-4" /> {resetLabel}</Button>
            <Link to={`/${NAV_PATHS[entity.key] || ""}`}>
              <Button className="gap-1.5">View {entity.label} <ChevronRight className="w-4 h-4" /></Button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  const mappedCount = headers.filter(h => isColMapped(h)).length;
  const ignoredCount = headers.length - mappedCount;

  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
        <FileSpreadsheet className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Preview Your Data</h2>
        <p className="text-xs text-muted-foreground mt-1">{rows.length} records found in <span className="font-medium">{file?.name}</span></p>
      </motion.div>

      <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <p>
          <span className="font-semibold">Map your columns to our fields.</span> You can import any CSV.
          Below, match each of your file's columns to the corresponding {entity.label} field (or leave it as
          <span className="font-medium"> "Not imported"</span>). Columns that don't match any field are skipped.
          Required fields are marked with <span className="text-destructive font-medium">*</span>.
        </p>
      </div>

      {/* Your file's columns — clean one-row-per-column mapping */}
      <div className="rounded-lg border border-border mb-4 overflow-hidden">
        <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/50 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Import File Columns</span>
          <span className="text-xs text-emerald-600 font-medium">{mappedCount} mapped</span>
          {ignoredCount > 0 && <span className="text-xs text-amber-600 font-medium">{ignoredCount} to map</span>}
        </div>
        <div className="grid grid-cols-[1.1fr_1fr_auto_1.4fr] gap-2 px-4 py-2 bg-muted/20 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Import file column</span>
          <span>Sample from import file</span>
          <span className="w-5" />
          <span>App field</span>
        </div>
        <div className="divide-y divide-border max-h-72 overflow-y-auto">
          {headers.map((h, i) => {
            const target = columnOverrides[h] === "__skip__" ? "__skip__" : (effectiveField(h) || "");
            const isSkip = target === "__skip__";
            const isMapped = target && !isSkip;
            const autoTarget = getAutoTarget(h);
            const isAuto = !columnOverrides[h] && isMapped && autoTarget === target && !isLockedField(target);
            const sample = rows[0]?.[h] ?? "";
            const requiredList = ENTITY_REQUIRED_FIELDS[entity.key] || [];
            return (
              <div key={h} className={`grid grid-cols-[1.1fr_1fr_auto_1.4fr] gap-2 px-4 py-2 items-center ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
                <p className="text-xs font-mono font-medium text-foreground truncate">{h}</p>
                <p className="text-xs text-muted-foreground truncate" title={String(sample)}>{String(sample) || "—"}</p>
                <ArrowRight className={`w-4 h-4 ${isMapped ? "text-emerald-500" : isSkip ? "text-muted-foreground/40" : "text-amber-500"}`} />
                <div className="min-w-0 flex items-center gap-2">
                  <select
                    value={target}
                    onChange={(e) => {
                      const val = e.target.value;
                      setColumnOverrides(prev => {
                        const next = { ...prev };
                        // If the chosen field is already mapped to another column, release it there.
                        if (val && val !== "__skip__") {
                          headers.forEach(other => {
                            if (other !== h && resolveField(entity.key, other, next, knownFields) === val) {
                              next[other] = "__skip__";
                            }
                          });
                        }
                        next[h] = val;
                        return next;
                      });
                    }}
                    className={`h-8 rounded-md border px-2 text-xs font-mono transition-colors ${
                      isSkip ? "border-muted bg-muted/30 text-muted-foreground line-through"
                      : isMapped ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-300 bg-amber-50 text-amber-700"
                    }`}
                  >
                    <option value="">— Select a field —</option>
                    <option value="__skip__">— Skip this column —</option>
                    {appFields.map(f => {
                      const locked = isLockedField(f);
                      return (
                        <option key={f} value={f} disabled={locked}>
                          {labelFor(f)}{requiredList.includes(f) ? " *" : ""}  ({f}){locked ? " — managed in settings" : ""}
                        </option>
                      );
                    })}
                  </select>
                  {isAuto && <span className="text-[10px] font-medium text-emerald-500 shrink-0">auto</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Field mapping table */}
      <ImportFieldMapping entityLabel={entity.label} appFields={appFields} labelFor={labelFor}
        requiredFields={ENTITY_REQUIRED_FIELDS[entity.key] || []} headers={headers}
        fieldToSource={fieldToSource} usedSources={usedSources} onAssign={assignSource} sampleRow={rows[0] || {}}
        lockedFields={lockedFields} />

      {/* Data preview table */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-10">#</th>
              {headers.map(h => {
                const isSortable = h === "Type" || h === "type";
                const isSorted = sortField === h;
                return (
                  <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                    {isSortable ? (
                      <button onClick={() => {
                        if (isSorted) {
                          if (sortDir === "asc") setSortDir("desc");
                          else { setSortField(null); setSortDir("asc"); }
                        } else { setSortField(h); setSortDir("asc"); }
                      }} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
                        {h}
                        {isSorted ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                      </button>
                    ) : h}
                  </th>
                );
              })}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {(() => {
                let displayRows = rows;
                if (sortField) {
                  displayRows = [...rows].sort((a, b) => {
                    const va = String(a[sortField] ?? "");
                    const vb = String(b[sortField] ?? "");
                    const cmp = va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" });
                    return sortDir === "asc" ? cmp : -cmp;
                  });
                }
                return displayRows.slice(0, 20).map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                    {headers.map(h => <td key={h} className="px-3 py-2 text-xs text-foreground max-w-[200px] truncate">{row[h] ?? ""}</td>)}
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        {rows.length > 20 && <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center border-t border-border">+ {rows.length - 20} more rows</div>}
      </div>

      {/* Duplicate key warning — rows within the file that share the same dedupe key */}
      {duplicateKeyWarning && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <div>
            <p className="font-semibold">{duplicateKeyWarning.totalMerged} CSV row{duplicateKeyWarning.totalMerged > 1 ? "s" : ""} will be merged ({duplicateKeyWarning.duplicateGroups} group{duplicateKeyWarning.duplicateGroups > 1 ? "s" : ""} with duplicate keys)</p>
            <p className="mt-1">Rows with the same key are combined into one record. Verify these are the same document, not distinct records that share a key:</p>
            <ul className="mt-1 space-y-0.5">
              {duplicateKeyWarning.examples.map((ex, i) => (
                <li key={i} className="font-mono">• {ex.label} — {ex.count} rows</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Journal posting info for Invoice/Bill */}
      {(entity.key === "Invoice" || entity.key === "Bill") && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs">
          <Check className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
          <p>
            <span className="font-semibold">Journal entries are auto-posted.</span> Approved {entity.label.toLowerCase()} (Awaiting Payment / Paid) will have their journal entries posted automatically. If the Xero General Ledger has already been imported, posting is skipped to avoid duplicates.
          </p>
        </div>
      )}

      {/* Contact resolution info for Project/WorkOrder */}
      {(entity.key === "Project" || entity.key === "WorkOrder") && fieldToSource["contact_name"] && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <p>
            <span className="font-semibold">Client / Contact linking:</span> Each client name will be looked up in your Contacts.
            If a match is found (exact name), the project will be linked to that contact.
            If the name is new, a new Contact record will be created automatically.
          </p>
        </div>
      )}

      {/* Import mode */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-muted/30 border border-border">
        <span className="text-xs font-medium text-muted-foreground">Import mode:</span>
        <button onClick={() => setImportMode("append")} disabled={importing}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${importMode === "append" ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"}`}>
          Add to existing
        </button>
        <button onClick={() => setImportMode("replace")} disabled={importing}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${importMode === "replace" ? "bg-destructive text-destructive-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-destructive/40"}`}>
          Replace all existing
        </button>
        {importMode === "replace" && <span className="text-xs text-destructive ml-1">⚠ All current {entity.label.toLowerCase()} will be deleted</span>}
        {importMode === "append" && DEDUPE_KEYS[entity.key] && (
          <span className="text-xs text-muted-foreground ml-1">
            Matching records (same {DEDUPE_KEYS[entity.key].join(" + ")}) will be updated in place — no duplicates created.
          </span>
        )}
      </div>

      {importing && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-muted-foreground">{deleting ? `Clearing existing records (${deleteProgress.current}/${deleteProgress.total})...` : "Importing..."}</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
      )}

      {error && <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-xs"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={onBack} disabled={importing} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <div className="flex gap-2">
          <Button onClick={() => handleImport(true)} disabled={importing}
            variant="outline" className="gap-1.5">
            <Upload className="w-4 h-4" /> Test Import (20)
          </Button>
          <Button onClick={() => handleImport(false)} disabled={importing}
            className={`gap-1.5 min-w-[160px] ${importMode === "replace" ? "bg-destructive hover:bg-destructive/90" : ""}`}>
            {importing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> {deleting ? `Clearing ${deleteProgress.current}/${deleteProgress.total}...` : "Importing..."}</>
            ) : importMode === "replace" ? (
              <><RefreshCw className="w-4 h-4" /> Replace & Import All {rows.length}</>
            ) : (
              <><Upload className="w-4 h-4" /> Import All {rows.length}</>
            )}
          </Button>
        </div>
      </div>

      {/* Full-page overlay during import — prevents navigation away */}
      {importing && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card border border-border shadow-xl max-w-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-xs font-semibold text-foreground">Importing data...</p>
            <p className="text-xs text-muted-foreground text-center">Please don't navigate away or close this page until the import is complete.</p>
            <div className="w-48 h-2 rounded-full bg-muted overflow-hidden mt-1">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-foreground tabular-nums">{progress}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Import Center Page ──────────────────────────────────────────────────
export default function ImportCenter() {
  const [step, setStep] = useState(1);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [mode, setMode] = useState("data"); // "data" | "files" | "migration"
  const [dataSubMode, setDataSubMode] = useState("import"); // "import" | "export"
  const [filesSubMode, setFilesSubMode] = useState("import"); // "import" | "export"

  // Allow deep-linking with ?entity=Asset to pre-select an entity.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("entity");
    if (key) {
      const found = ENTITIES.find(e => e.key === key);
      if (found) { setSelectedEntity(found); setStep(2); window.history.replaceState({}, "", "/settings/import-center"); }
    }
  }, []);

  const handleReset = () => { setStep(1); setSelectedEntity(null); setFile(null); setParseResult(null); };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600"><Upload className="w-5 h-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Import / Export Center</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Import, export, and migrate your data</p>
          </div>
        </div>
      </motion.div>

      {/* Main mode toggle */}
      <div className="inline-flex p-1 rounded-lg bg-muted border border-border">
        <button onClick={() => setMode("data")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${mode === "data" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Data Import / Export
        </button>
        <button onClick={() => setMode("migration")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${mode === "migration" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Migration from other app
        </button>
        <button onClick={() => setMode("files")}
          className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${mode === "files" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Files Import / Export
        </button>
      </div>

      {mode === "migration" ? (
        <Card>
          <CardContent className="p-6">
            <MigrationWizard />
          </CardContent>
        </Card>
      ) : mode === "files" ? (
        <>
          {/* Files sub-toggle */}
          <div className="inline-flex p-1 rounded-lg bg-muted border border-border">
            <button onClick={() => setFilesSubMode("import")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${filesSubMode === "import" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Import Files
            </button>
            <button onClick={() => setFilesSubMode("export")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${filesSubMode === "export" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Export Files
            </button>
          </div>
          {filesSubMode === "export" ? (
            <DataExportCenter embedded />
          ) : (
            <Card>
              <CardContent className="p-6">
                <ImportFilesSection />
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          {/* Data sub-toggle */}
          <div className="inline-flex p-1 rounded-lg bg-muted border border-border">
            <button onClick={() => setDataSubMode("import")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${dataSubMode === "import" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Import Data
            </button>
            <button onClick={() => setDataSubMode("export")}
              className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${dataSubMode === "export" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
              Export Data
            </button>
          </div>
          {dataSubMode === "export" ? (
            <Card>
              <CardContent className="p-6">
                <DataExportSection />
              </CardContent>
            </Card>
          ) : (
            <>
              <Stepper currentStep={step} />

              <Card>
                <CardContent className="p-6">
                  <AnimatePresence mode="wait">
                    {step === 1 && <StepSelectEntity key="step1" selected={selectedEntity} onSelect={(e) => { setSelectedEntity(e); setStep(2); }} />}
                    {step === 2 && selectedEntity && <StepUpload key="step2" entity={selectedEntity} file={file} setFile={setFile} parseResult={parseResult} setParseResult={setParseResult} onNext={() => setStep(3)} />}
                    {step === 3 && selectedEntity && parseResult && <StepPreview key="step3" entity={selectedEntity} parseResult={parseResult} file={file} onBack={() => { setStep(2); setFile(null); setParseResult(null); }} onReset={handleReset} />}
                  </AnimatePresence>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}