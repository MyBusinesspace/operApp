import React, { useState, useRef, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Upload, Download, Check, Loader2, AlertCircle,
  FileText, ShoppingCart, BookOpen, Users, ChevronRight,
  FileSpreadsheet, RefreshCw, X, Database, FolderKanban, Wrench, ClipboardList, ChevronDown, UserCheck, Box,
  Building2, ArrowLeftRight, ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { base44 } from "@/api/base44Client";
import ImportFieldMapping from "@/components/settings/ImportFieldMapping";
import ImportFilesSection from "@/components/settings/ImportFilesSection";
import {
  ENTITY_KNOWN_FIELDS, ENTITY_APP_FIELDS, ENTITY_REQUIRED_FIELDS, FIELD_LABELS,
  XERO_CONTACT_FIELD_MAP, XERO_COA_FIELD_MAP, XERO_INVOICE_FIELD_MAP,
  COMMON_PROJECT_FIELD_MAP, COMMON_WORKORDER_FIELD_MAP, COMMON_EMPLOYEE_FIELD_MAP, COMMON_ASSET_FIELD_MAP,
  XERO_BANK_ACCOUNT_FIELD_MAP, XERO_BANK_TRANSACTION_FIELD_MAP, NUMERIC_FIELDS,
} from "@/lib/importCenterConfig";

// ── Entity definitions ──────────────────────────────────────────────────────
const ENTITIES = [
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
    templateHeaders: ["title", "status", "category", "work_order_name", "project_name", "contact_name", "planning_date", "planning_time_in", "planning_time_out", "priority", "notes"],
    templateSample: ["Inspect hoist mechanism", "Queued", "Inspection", "Monthly Maintenance WO", "Tower Crane Rental", "Acme Corp", "2026-06-15", "08:00", "12:00", "High", ""],
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

const parseCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parseLine = (line) => {
    const result = []; let current = ""; let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') { if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; } else inQuotes = false; }
        else current += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ",") { result.push(current.trim()); current = ""; }
        else current += ch;
      }
    }
    result.push(current.trim()); return result;
  };
  const headers = parseLine(lines[0]).map(h => h.replace(/^\*+/, "").trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.every(v => v === "")) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = values[idx] ?? ""; });
    rows.push(obj);
  }
  return { headers, rows };
};

const humanizeField = (f) => f.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

// Resolve which app field a CSV column maps to (null = skip)
const resolveField = (entityKey, h, overrides, knownFields) => {
  const o = overrides[h];
  if (o === "__skip__") return null;
  if (o) return o;
  if (entityKey === "ChartOfAccount" && XERO_COA_FIELD_MAP[h] !== undefined) return XERO_COA_FIELD_MAP[h];
  if (entityKey === "Contact" && XERO_CONTACT_FIELD_MAP[h] !== undefined) return XERO_CONTACT_FIELD_MAP[h];
  if ((entityKey === "Invoice" || entityKey === "Bill") && XERO_INVOICE_FIELD_MAP[h] !== undefined) return XERO_INVOICE_FIELD_MAP[h];
  if (entityKey === "Project" && COMMON_PROJECT_FIELD_MAP[h] !== undefined) return COMMON_PROJECT_FIELD_MAP[h];
  if (entityKey === "WorkOrder" && COMMON_WORKORDER_FIELD_MAP[h] !== undefined) return COMMON_WORKORDER_FIELD_MAP[h];
  if (entityKey === "Employee" && COMMON_EMPLOYEE_FIELD_MAP[h] !== undefined) return COMMON_EMPLOYEE_FIELD_MAP[h];
  if (entityKey === "Asset" && COMMON_ASSET_FIELD_MAP[h] !== undefined) return COMMON_ASSET_FIELD_MAP[h];
  if (entityKey === "BankAccount" && XERO_BANK_ACCOUNT_FIELD_MAP[h] !== undefined) return XERO_BANK_ACCOUNT_FIELD_MAP[h];
  if (entityKey === "BankTransaction" && XERO_BANK_TRANSACTION_FIELD_MAP[h] !== undefined) return XERO_BANK_TRANSACTION_FIELD_MAP[h];
  if (knownFields.includes(h)) return h;
  return null;
};

const ACCOUNT_TYPE_MAP = {
  "current asset": "Asset", "fixed asset": "Asset", "non-current asset": "Asset", "noncurrent asset": "Asset",
  "prepayment": "Asset", "inventory": "Asset", "bank": "Asset", "accounts receivable": "Asset",
  "other current asset": "Asset", "other asset": "Asset", "intangible asset": "Asset",
  "current liability": "Liability", "non-current liability": "Liability", "noncurrent liability": "Liability",
  "accounts payable": "Liability", "credit card": "Liability", "loan": "Liability",
  "other current liability": "Liability", "other liability": "Liability",
  "equity": "Equity", "retained earnings": "Equity", "share capital": "Equity", "capital": "Equity",
  "revenue": "Revenue", "income": "Revenue", "other revenue": "Revenue", "sales": "Revenue",
  "other income": "Other Income", "service income": "Revenue", "interest income": "Other Income", "dividend income": "Other Income",
  "expense": "Expense", "cost of sales": "Cost of Sales", "cost of goods sold": "Cost of Sales",
  "cost of goods": "Cost of Sales", "cogs": "Cost of Sales", "direct costs": "Cost of Sales",
  "operating expense": "Expense", "administrative expense": "Expense", "selling expense": "Expense",
  "other expense": "Other Expense", "interest expense": "Other Expense",
  "depreciation": "Expense", "amortisation": "Expense", "amortization": "Expense", "tax expense": "Expense",
  "salary": "Expense", "wages": "Expense", "rent": "Expense", "utilities": "Expense",
  "travel": "Expense", "marketing": "Expense", "insurance": "Expense",
};
const normalizeAccountType = (rawType) => {
  if (!rawType) return "Expense";
  const key = rawType.trim().toLowerCase();
  if (ACCOUNT_TYPE_MAP[key]) return ACCOUNT_TYPE_MAP[key];
  for (const [p, m] of Object.entries(ACCOUNT_TYPE_MAP)) { if (key.includes(p)) return m; }
  return rawType.trim();
};

// ── Stepper ──────────────────────────────────────────────────────────────────
function Stepper({ currentStep }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {STEPS.map((step, i) => (
        <React.Fragment key={step.num}>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${
              currentStep > step.num ? "bg-primary text-primary-foreground"
              : currentStep === step.num ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
              : "bg-muted text-muted-foreground"}`}>
              {currentStep > step.num ? <Check className="w-4 h-4" /> : step.num}
            </div>
            <span className={`text-sm font-medium hidden sm:inline ${currentStep >= step.num ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</span>
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
    <div className="max-w-2xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
        <Database className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">What would you like to import?</h2>
        <p className="text-sm text-muted-foreground mt-1">Select the type of data you want to bring into OPERAPP</p>
      </motion.div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {ENTITIES.map((entity) => (
          <motion.button key={entity.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => onSelect(entity)}
            className={`p-5 rounded-xl border-2 text-left transition-all duration-200 ${
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
function StepUpload({ entity, file, setFile, parseResult, setParseResult, onNext }) {
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);

  const handleFile = async (f) => {
    setError("");
    if (!f) return;
    if (!f.name.endsWith(".csv")) { setError("Please upload a CSV file (.csv)"); return; }
    setFile(f); setParsing(true);
    try {
      const text = await f.text();
      const parsed = parseCSV(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("The file appears to be empty or has no data rows."); setFile(null); setParseResult(null);
      } else { setParseResult(parsed); onNext(); }
    } catch { setError("Could not read the file. Make sure it's a valid CSV."); setFile(null); setParseResult(null); }
    setParsing(false);
  };

  return (
    <div className="max-w-xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <Upload className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Upload your {entity.label} data</h2>
        <p className="text-sm text-muted-foreground mt-1">Upload a CSV file exported from your previous system</p>
      </motion.div>
      <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20 mb-6">
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet className="w-5 h-5 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Need a template?</p>
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
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
        {parsing ? (
          <div className="flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">Reading file...</p></div>
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
            <div><p className="font-medium text-foreground">Click to upload or drag & drop</p><p className="text-xs text-muted-foreground mt-0.5">CSV files only</p></div>
          </div>
        )}
      </div>
      {error && <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}
    </div>
  );
}

// ── Step 3: Preview & Import ─────────────────────────────────────────────────
function StepPreview({ entity, parseResult, file, onBack, onReset }) {
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [importMode, setImportMode] = useState("append");
  const [deleting, setDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0 });
  const [columnOverrides, setColumnOverrides] = useState({});
  const [schemaFields, setSchemaFields] = useState(null);

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

  const appFields = useMemo(() => {
    const virtualFields = (ENTITY_APP_FIELDS[entity.key] || []).filter(f => f.startsWith("_"));
    if (schemaFields && schemaFields.length > 0) {
      return [...schemaFields, ...virtualFields];
    }
    return ENTITY_APP_FIELDS[entity.key] || [];
  }, [schemaFields, entity.key]);

  const resolvedField = (h) => resolveField(entity.key, h, columnOverrides, knownFields);
  // Select / reference fields whose allowed values are configured in Settings and rarely
  // match arbitrary CSV text — shown but locked: users set them per-record instead.
  const lockedFields = useMemo(() => {
    const locked = new Set();
    const exists = (f) => appFields.includes(f);
    if (entity.key !== "BankTransaction" && exists("status")) locked.add("status");
    if (exists("category")) locked.add("category");
    if (exists("group_id")) locked.add("group_id");
    return locked;
  }, [appFields, entity.key]);
  const isLockedField = (f) => lockedFields.has(f);
  // Effective mapped field, blanking locked fields (not importable from CSV).
  const effectiveField = (h) => { const f = resolvedField(h); return f && !isLockedField(f) ? f : null; };
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

  const getAutoTarget = (h) => {
    if (entity.key === "Contact" && XERO_CONTACT_FIELD_MAP[h] !== undefined) return XERO_CONTACT_FIELD_MAP[h];
    if (entity.key === "ChartOfAccount" && XERO_COA_FIELD_MAP[h] !== undefined) return XERO_COA_FIELD_MAP[h];
    if ((entity.key === "Invoice" || entity.key === "Bill") && XERO_INVOICE_FIELD_MAP[h] !== undefined) return XERO_INVOICE_FIELD_MAP[h];
    if (entity.key === "Project" && COMMON_PROJECT_FIELD_MAP[h] !== undefined) return COMMON_PROJECT_FIELD_MAP[h];
    if (entity.key === "WorkOrder" && COMMON_WORKORDER_FIELD_MAP[h] !== undefined) return COMMON_WORKORDER_FIELD_MAP[h];
    if (entity.key === "Employee" && COMMON_EMPLOYEE_FIELD_MAP[h] !== undefined) return COMMON_EMPLOYEE_FIELD_MAP[h];
    if (entity.key === "Asset" && COMMON_ASSET_FIELD_MAP[h] !== undefined) return COMMON_ASSET_FIELD_MAP[h];
    if (entity.key === "BankAccount" && XERO_BANK_ACCOUNT_FIELD_MAP[h] !== undefined) return XERO_BANK_ACCOUNT_FIELD_MAP[h];
    if (entity.key === "BankTransaction" && XERO_BANK_TRANSACTION_FIELD_MAP[h] !== undefined) return XERO_BANK_TRANSACTION_FIELD_MAP[h];
    return knownFields.includes(h) ? h : null;
  };

  const handleImport = async () => {
    setImporting(true); setError(""); setResult(null);
    try {
      const entityClient = base44.entities[entity.key];
      if (importMode === "replace") {
        setDeleting(true);
        try {
          let allExisting = [], page = 0;
          while (true) {
            const batch = await entityClient.list("-created_date", 200, page * 200);
            if (!batch || batch.length === 0) break;
            allExisting = allExisting.concat(batch);
            if (batch.length < 200) break;
            page++;
          }
          if (allExisting.length > 0) {
            setDeleteProgress({ current: 0, total: allExisting.length });
            for (let i = 0; i < allExisting.length; i++) {
              try { await entityClient.delete(allExisting[i].id); } catch {}
              setDeleteProgress({ current: i + 1, total: allExisting.length });
              if (i < allExisting.length - 1) await new Promise(r => setTimeout(r, 120));
            }
          }
        } catch (delErr) {
          setError("Failed to clear existing records: " + delErr.message);
          setImporting(false); setDeleting(false); setDeleteProgress({ current: 0, total: 0 }); return;
        }
        setDeleting(false);
      }

      // Pre-load contacts for name→id lookup (used by Project, WorkOrder & BankTransaction)
      let contactsByName = {}; // normalized name → { id, full_name }
      if (entity.key === "Project" || entity.key === "WorkOrder" || entity.key === "BankTransaction") {
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
      if (entity.key === "WorkOrder") {
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
            const key = (b.name || "").trim().toLowerCase();
            if (key) bankAccountsByName[key] = b;
          });
        } catch {}
      }
      // Pre-load chart of accounts for code→id lookup (used by BankAccount)
      let coaByCode = {};
      if (entity.key === "BankAccount") {
        try {
          const allCOA = await base44.entities.ChartOfAccount.list("-created_date", 100000);
          allCOA.forEach(a => {
            const key = (a.code || "").trim().toLowerCase();
            if (key) coaByCode[key] = a;
          });
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
      const buildRecord = (row) => {
        const record = {};
        headers.forEach(h => {
          const val = row[h];
          if (columnOverrides[h] === "__skip__") return;
          let fieldName = columnOverrides[h]
            || (entity.key === "ChartOfAccount" && XERO_COA_FIELD_MAP[h] !== undefined ? XERO_COA_FIELD_MAP[h] : undefined)
            || (entity.key === "Contact" && XERO_CONTACT_FIELD_MAP[h] !== undefined ? XERO_CONTACT_FIELD_MAP[h] : undefined)
            || ((entity.key === "Invoice" || entity.key === "Bill") && XERO_INVOICE_FIELD_MAP[h] !== undefined ? XERO_INVOICE_FIELD_MAP[h] : undefined)
            || (entity.key === "Project" && COMMON_PROJECT_FIELD_MAP[h] !== undefined ? COMMON_PROJECT_FIELD_MAP[h] : undefined)
            || (entity.key === "WorkOrder" && COMMON_WORKORDER_FIELD_MAP[h] !== undefined ? COMMON_WORKORDER_FIELD_MAP[h] : undefined)
            || (entity.key === "Employee" && COMMON_EMPLOYEE_FIELD_MAP[h] !== undefined ? COMMON_EMPLOYEE_FIELD_MAP[h] : undefined)
            || (entity.key === "Asset" && COMMON_ASSET_FIELD_MAP[h] !== undefined ? COMMON_ASSET_FIELD_MAP[h] : undefined)
            || (entity.key === "BankAccount" && XERO_BANK_ACCOUNT_FIELD_MAP[h] !== undefined ? XERO_BANK_ACCOUNT_FIELD_MAP[h] : undefined)
            || (entity.key === "BankTransaction" && XERO_BANK_TRANSACTION_FIELD_MAP[h] !== undefined ? XERO_BANK_TRANSACTION_FIELD_MAP[h] : undefined)
            || h;
          if (fieldName === null || fieldName === undefined) return;
          if (isLockedField(fieldName)) return;
          if (val === undefined || val === "") return;
          if ((entity.key === "ChartOfAccount" || entity.key === "BankAccount") && (h === "Dashboard" || h === "Enable Payments" || h === "ShowOnDashboard" || h === "EnablePayments")) {
            record[fieldName] = val.toLowerCase() === "yes"; return;
          }
          if (NUMERIC_FIELDS.includes(fieldName) && !isNaN(Number(val)) && val.trim() !== "") {
            record[fieldName] = Number(val); return;
          }
          record[fieldName] = String(val);
        });

        // Contact: build contact_persons from _cp_* virtual fields
        if (entity.key === "Contact") {
          const cpName = [record._cp_first_name, record._cp_last_name].filter(Boolean).join(" ");
          if (cpName) {
            record.contact_persons = [{ name: cpName, role: record._cp_role || "", email: record._cp_email || "", phone: record._cp_phone || "" }];
          }
          ["_cp_first_name", "_cp_last_name", "_cp_email", "_cp_phone", "_cp_role"].forEach(k => delete record[k]);
        }

        // Invoice / Bill: build line_items from _li_* virtual fields
        if (entity.key === "Invoice" || entity.key === "Bill") {
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
          delete record.email_address;
        }

        // ChartOfAccount: normalize type, force strings
        if (entity.key === "ChartOfAccount") {
          record.code = String(record.code || "");
          record.name = String(record.name || "");
          const rawTypeLower = (record.type || "").trim().toLowerCase();
          record._isBank = rawTypeLower === "bank";
          if (record.type) record.type = normalizeAccountType(record.type);
        }
        // BankAccount: normalize account_type, set defaults
        if (entity.key === "BankAccount") {
          const bankTypeMap = { "bank": "Current", "current": "Current", "creditcard": "Credit Card", "credit card": "Credit Card", "paypal": "Current", "savings": "Savings", "loan": "Loan", "petty cash": "Petty Cash" };
          if (record.account_type) {
            const t = bankTypeMap[String(record.account_type).trim().toLowerCase()];
            if (t) record.account_type = t;
          }
          if (!record.account_type) record.account_type = "Current";
          if (!record.currency) record.currency = "AED";
          if (record.show_on_dashboard === undefined) record.show_on_dashboard = true;
        }
        // BankTransaction: map Xero type & status, handle amount sign
        if (entity.key === "BankTransaction") {
          const typeMap = { "SPEND": "Spend Money", "SPEND MONEY": "Spend Money", "RECEIVE": "Receive Money", "RECEIVE MONEY": "Receive Money", "TRANSFER": "Transfer", "TRANSFER MONEY": "Transfer" };
          if (record.type) {
            const t = typeMap[String(record.type).trim().toUpperCase()];
            if (t) record.type = t;
          }
          if (record.amount !== undefined) {
            const amt = Number(record.amount);
            if (amt < 0 && !record.type) record.type = "Spend Money";
            else if (amt > 0 && !record.type) record.type = "Receive Money";
            record.amount = Math.abs(amt) || 0;
          }
          if (record.status) {
            const s = String(record.status).trim().toLowerCase();
            record.status = (s === "yes" || s === "true" || s === "reconciled") ? "Reconciled" : "Unreconciled";
          }
        }
        return record;
      };

      const passesRequired = (rec) => {
        if (entity.key === "ChartOfAccount") {
          if (!rec.name || rec.name.trim() === "") return false;
          if (!rec._isBank && (!rec.code || rec.code.trim() === "")) return false;
        }
        const required = ENTITY_REQUIRED_FIELDS[entity.key] || [];
        return required.every(f => rec[f] && String(rec[f]).trim() !== "");
      };

      let imported = 0, failed = [];

      // Projects, WorkOrders, BankAccounts & BankTransactions: one-by-one to resolve links
      if (entity.key === "Project" || entity.key === "WorkOrder" || entity.key === "BankAccount" || entity.key === "BankTransaction") {
        for (let i = 0; i < rows.length; i++) {
          const record = buildRecord(rows[i]);
          if (!passesRequired(record)) { setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }
          // BankAccount: resolve COA by code
          if (entity.key === "BankAccount" && record.chart_account_code) {
            const coa = coaByCode[record.chart_account_code.trim().toLowerCase()];
            if (coa) { record.chart_account_id = coa.id; record.chart_account_name = coa.name; }
          }
          // BankTransaction: resolve bank account by name (required)
          if (entity.key === "BankTransaction" && record.bank_account_name) {
            const bank = bankAccountsByName[record.bank_account_name.trim().toLowerCase()];
            if (bank) { record.bank_account_id = bank.id; record.bank_account_name = bank.name; }
            else { failed.push(`Row ${i + 1}: Bank account "${record.bank_account_name}" not found`); setProgress(Math.round(((i + 1) / rows.length) * 100)); continue; }
          }
          // WorkOrder: resolve project by name
          if (entity.key === "WorkOrder" && record.project_name) {
            const proj = projectsByName[record.project_name.trim().toLowerCase()];
            if (proj) { record.project_id = proj.id; record.project_name = proj.name; }
          }
          // Resolve contact by name
          if (record.contact_name) {
            if (entity.key === "BankTransaction") {
              const contact = contactsByName[record.contact_name.trim().toLowerCase()];
              if (contact) { record.contact_id = contact.id; record.contact_name = contact.full_name; }
            } else {
              const contact = await resolveContact(record.contact_name);
              if (contact) { record.contact_id = contact.id; record.contact_name = contact.full_name; }
            }
          }
          try {
            await entityClient.create(record);
            imported++;
          } catch (err) {
            failed.push(`Row ${i + 1}: ${err.message}`);
          }
          setProgress(Math.round(((i + 1) / rows.length) * 100));
        }
      } else {
        // All other entities: batch create (faster)
        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100).map(buildRecord).filter(passesRequired);
          try {
            const created = await entityClient.bulkCreate(batch);
            imported += created.length;
          } catch (batchErr) {
            failed.push(`Batch ${Math.floor(i / 100) + 1}: ${batchErr.message}`);
          }
          setProgress(Math.round(((i + batch.length) / rows.length) * 100));
        }
      }
      const newContactsCreated = Object.keys(contactsByName).length > 0 && (entity.key === "Project" || entity.key === "WorkOrder")
        ? Object.values(contactsByName).filter(c => !c.created_date || (new Date() - new Date(c.created_date)) < 120000).length
        : 0;
      setResult({ imported, failed, total: rows.length, mode: importMode, newContactsCreated });
    } catch (err) { setError(err.message || "Import failed"); }
    setImporting(false);
  };

  const NAV_PATHS = {
    ChartOfAccount: "accounting/chart-of-accounts",
    Contact: "contacts", Invoice: "sales/invoices", Bill: "purchasing/bills",
    Project: "projects", WorkOrder: "work-orders", Task: "tasks", Employee: "employees", Asset: "assets",
    BankAccount: "accounting/banks", BankTransaction: "accounting/banks",
  };

  if (result) {
    return (
      <div className="max-w-xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Import Complete</h2>
          <p className="text-muted-foreground mt-1">
            {result.mode === "replace"
              ? `Existing records cleared. ${result.imported} of ${result.total} records imported successfully.`
              : `${result.imported} of ${result.total} records imported successfully.`}
          </p>
          {result.newContactsCreated > 0 && (
            <p className="text-sm text-blue-600 mt-1">
              {result.newContactsCreated} new contact{result.newContactsCreated > 1 ? "s" : ""} were created automatically from unrecognized client names.
            </p>
          )}
          {result.failed.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm text-left">
              <p className="font-medium mb-1">{result.failed.length} batches had errors:</p>
              {result.failed.map((f, i) => <p key={i} className="text-xs opacity-80">{f}</p>)}
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={onReset} variant="outline" className="gap-1.5"><RefreshCw className="w-4 h-4" /> Import More</Button>
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
    <div className="max-w-3xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
        <FileSpreadsheet className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Preview Your Data</h2>
        <p className="text-sm text-muted-foreground mt-1">{rows.length} records found in <span className="font-medium">{file?.name}</span></p>
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
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Your File's Columns</span>
          <span className="text-xs text-emerald-600 font-medium">{mappedCount} mapped</span>
          {ignoredCount > 0 && <span className="text-xs text-amber-600 font-medium">{ignoredCount} to map</span>}
        </div>
        <div className="grid grid-cols-[1.1fr_1fr_auto_1.4fr] gap-2 px-4 py-2 bg-muted/20 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Column in your file</span>
          <span>Sample value</span>
          <span className="w-5" />
          <span>Maps to field</span>
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
                <p className="text-sm font-mono font-medium text-foreground truncate">{h}</p>
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
          <table className="w-full text-sm">
            <thead><tr className="bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground w-10">#</th>
              {headers.map(h => <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-border">
              {rows.slice(0, 20).map((row, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  {headers.map(h => <td key={h} className="px-3 py-2 text-xs text-foreground max-w-[200px] truncate">{row[h] ?? ""}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > 20 && <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center border-t border-border">+ {rows.length - 20} more rows</div>}
      </div>

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
      </div>

      {importing && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">{deleting ? `Clearing existing records (${deleteProgress.current}/${deleteProgress.total})...` : "Importing..."}</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
      )}

      {error && <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={onBack} disabled={importing} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <Button onClick={handleImport} disabled={importing}
          className={`gap-1.5 min-w-[160px] ${importMode === "replace" ? "bg-destructive hover:bg-destructive/90" : ""}`}>
          {importing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {deleting ? `Clearing ${deleteProgress.current}/${deleteProgress.total}...` : "Importing..."}</>
          ) : importMode === "replace" ? (
            <><RefreshCw className="w-4 h-4" /> Replace & Import {rows.length} Records</>
          ) : (
            <><Upload className="w-4 h-4" /> Import {rows.length} Records</>
          )}
        </Button>
      </div>
    </div>
  );
}

// ── Main Import Center Page ──────────────────────────────────────────────────
export default function ImportCenter() {
  const [step, setStep] = useState(1);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [mode, setMode] = useState("data"); // "data" | "files"

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
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600"><Upload className="w-5 h-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Import Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Migrate data from Xero, QuickBooks, or CSV files</p>
          </div>
        </div>
      </motion.div>

      {/* Data / Files mode toggle */}
      <div className="inline-flex p-1 rounded-lg bg-muted border border-border">
        <button onClick={() => setMode("data")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === "data" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Data Import
        </button>
        <button onClick={() => setMode("files")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${mode === "files" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
          Files
        </button>
      </div>

      {mode === "files" ? (
        <Card>
          <CardContent className="p-6">
            <ImportFilesSection />
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

          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { title: "From Xero", desc: "Export as CSV from Xero. Column names are auto-detected. For a full migration, import in this order: 1) Chart of Accounts, 2) Contacts, 3) Bank Accounts, 4) Invoices & Bills, 5) Bank Transactions." },
                { title: "From QuickBooks", desc: "Export lists and reports as Excel, then save as CSV. Map your columns to our template headers." },
                { title: "From CSV", desc: "Any spreadsheet software can export CSV. Download our template to see the expected column names." },
              ].map((tip) => (
                <div key={tip.title} className="p-4 rounded-xl bg-card border border-border">
                  <p className="text-sm font-semibold text-foreground">{tip.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{tip.desc}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}