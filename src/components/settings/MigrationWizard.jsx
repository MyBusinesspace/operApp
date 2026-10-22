import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Users, Building2, FileText,
  Check, Download, ChevronDown, Sparkles, ArrowLeft, ArrowRight, RefreshCw, Wand2, SkipForward, Box, History, Scale, Package, Percent, FileMinus, GitCompare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepUpload, StepPreview, ENTITIES } from "@/pages/settings/ImportCenter";
import XeroGLImporter from "@/components/settings/XeroGLImporter";
import BankTransactionMigrationStep from "@/components/settings/BankTransactionMigrationStep";
import TrialBalanceImport from "@/components/settings/TrialBalanceImport";
import CreditNoteImporter from "@/components/settings/CreditNoteImporter";
import ReconciliationStep from "@/components/settings/ReconciliationStep";
import FixedAssetsImporter from "@/components/settings/FixedAssetsImporter";
import QuickImportDropzone from "@/components/settings/QuickImportDropzone";
import { base44 } from "@/api/base44Client";
import moment from "moment";

// ── Source apps ─────────────────────────────────────────────────────────────
const SOURCES = [
  {
    key: "xero",
    label: "Xero",
    desc: "CSV exports from Xero. Column headers are auto-detected (ContactName, AccountCode, InvoiceNumber…).",
    color: "#13B5EA",
    badge: "Recommended",
  },
  {
    key: "quickbooks",
    label: "QuickBooks",
    desc: "Export lists and reports as Excel, then save as CSV. Map your columns to our fields.",
    color: "#2CA01C",
    badge: "Coming soon",
    disabled: true,
  },
  {
    key: "csv",
    label: "Other / Generic CSV",
    desc: "Any spreadsheet software. Download our template to see the expected headers.",
    color: "#64748b",
  },
];

// ── Migration sequence (strict order to avoid broken references) ─────────────
const MIGRATION_STEPS = [
  {
    num: 1,
    label: "Chart of Accounts",
    entityKeys: ["ChartOfAccount"],
    icon: BookOpen,
    desc: "Import your Xero Chart of Accounts CSV (Code, Name, Type, Tax Code, Description). Account codes and types are auto-mapped. Everything else references these codes. Starting without a Xero file? Choose and download a ready-made chart (International is the default) in Settings > Chart of Accounts Templates.",
  },
  {
    num: 2,
    label: "Contacts",
    entityKeys: ["Contact"],
    icon: Users,
    desc: "Import your Xero Contacts CSV (ContactName, EmailAddress, PO/SA addresses, TaxNumber → tax_id, BankAccount details). Headers are auto-detected.",
  },
  {
    num: 3,
    label: "Items",
    entityKeys: ["Product"],
    icon: Package,
    desc: "Import Xero Items CSV: *ItemCode, ItemName, Quantity, PurchasesDescription, PurchasesUnitPrice, PurchasesAccount, PurchasesTaxRate, SalesDescription, SalesUnitPrice, SalesAccount, SalesTaxRate, InventoryAssetAccount, CostOfGoodsSoldAccount, Status and InventoryType. Thousands separators and quoted multiline descriptions are supported. Dedupe by item code.",
  },
  {
    num: 4,
    label: "Tax Rates",
    entityKeys: ["TaxRate"],
    icon: Percent,
    desc: "Import Xero Tax Rates CSV (Name, TaxRate, AccountsUsingThisRate). Name maps to the tax name and TaxRate to its percentage, including 0%. AccountsUsingThisRate is informational and skipped. Dedupe by name; validation and save errors are shown per row.",
  },
  {
    num: 5,
    label: "Bank Accounts & Transactions",
    entityKeys: ["BankAccount", "BankTransaction"],
    icon: Building2,
    desc: "Import Xero Bank Summary: Account, BankAccountType, Status and OpeningBalance_YYYY-MM-DD. The opening balance date comes from the header. Without a currency column, use AED, or USD when the account name contains USD. Cash movements and closing balances are not opening balances. Dedupe by name. Then import Bank Transactions (Xero Account Transactions CSV/XLSX) — one bank selector + file upload, auto-links to existing invoice/bill payments using ordered rules: direction (invoices↔Receive, bills↔Spend), reference first, never reuse a claimed bank row, fallback by contact+amount+date, ambiguous goes to review.",
  },
  {
    num: 6,
    label: "General Ledger",
    type: "xeroGL",
    icon: BookOpen,
    desc: "Import Xero Journal Report CSV (Date, JournalID, AccountCode, Account, Debit, Credit, PostedDate, PostedBy, Narration). Lines grouped by JournalID (fallback: Date + Narration). Debit must equal Credit. Also supports GL .txt export. Auto-posting is skipped for Invoices & Bills since the GL brings all historical journals.",
  },
  {
    num: 7,
    label: "Invoices, Bills & Payments",
    entityKeys: ["Invoice", "Bill"],
    icon: FileText,
    desc: "Import Xero Invoices & Bills CSV, grouped by InvoiceNumber with all line items. Type containing credit note, overpayment or prepayment (Sales credit note, Bill credit note, Sales overpayment, Bill overpayment, Bill prepayment) is routed to Credit Notes using the same InvoiceNumber. ContactName is resolved or created first. Voided/Deleted are skipped. No negative invoices or bills are created. Payroll bills are imported here too.",
  },
  {
    num: 8,
    label: "Credit Notes",
    type: "creditNote",
    icon: FileMinus,
    desc: "Import Sales credit note, Bill credit note, Sales overpayment, Bill overpayment and Bill prepayment rows. Filter Type containing credit note, overpayment or prepayment, then group by InvoiceNumber and keep it as the credit note number. ContactName is resolved or created. Existing numbers are updated, including notes imported in step 7. Voided/Deleted are skipped.",
  },
  {
    num: 9,
    label: "Fixed Assets & Depreciation",
    type: "fixedAssets",
    icon: Box,
    desc: "Import Xero Depreciation Schedule CSV: AssetGroup(CostAccount), Name, Cost, OpeningValue, Purchases, Disposals, Depreciation, ClosingValue. Maps category, purchase_price, net_book_value, accumulated_depreciation (Cost minus ClosingValue) and period depreciation. Dedupes by name — existing assets only update accounting fields, operational data is never modified.",
  },
  {
    num: 10,
    label: "Trial Balance",
    type: "trialBalance",
    icon: Scale,
    desc: "Import Xero Trial Balance CSV as verification and opening balances (AccountCode, AccountName, Debit, Credit). Verifies total debits = total credits. Updates opening_balance for matched accounts.",
  },
  {
    num: 11,
    label: "Reconciliation & Audit",
    type: "reconciliation",
    icon: GitCompare,
    desc: "Final verification step: compares the General Ledger balance per account with the Trial Balance, and outstanding Invoices/Bills totals with the GL receivable/payable accounts. Only shows differences — does not modify any data.",
  },
];

const ENTITY_LABELS = {
  Invoice: "Invoices",
  Bill: "Bills",
  Product: "Products & Services",
  TaxRate: "Tax Rates",
  BankAccount: "Bank Accounts",
  BankTransaction: "Bank Transactions",
};

const findEntity = (key) => ENTITIES.find((e) => e.key === key);

// ── Xero contextual tips ─────────────────────────────────────────────────────
const XERO_TIPS = [
  {
    title: "How to export from Xero",
    body: "Chart of Accounts: Accounting → Advanced → Chart of accounts → Export. Contacts: Contacts → All contacts → Export. Items: Inventory → Items → Export. Tax Rates: Accounting → Advanced → Tax rates → Export. Invoices/Bills: Sales or Purchases reports → export to CSV (line-by-line). Credit Notes: Sales → Credit Notes → Export. Journal Report: Accounting → Reports → Journal Report → Export to CSV. Depreciation Schedule: Fixed Assets → Depreciation Schedule → Export. Bank Summary: Banking → Bank Summary → Export. Trial Balance: Accounting → Reports → Trial Balance → Export to CSV.",
  },
  {
    title: "Recommended import order",
    body: "Follow the 11 steps in order: Chart of Accounts → Contacts → Items → Tax Rates → Bank Accounts → General Ledger → Invoices & Bills → Credit Notes → Fixed Assets → Trial Balance → Reconciliation. Import the GL before Invoices & Bills — auto-posting is skipped during migration since the GL brings all historical journals. The final Reconciliation step verifies everything matches.",
  },
  {
    title: "Auto-mapping of columns",
    body: "OPERAPP360 automatically detects standard Xero headers (ContactName, InvoiceNumber, AccountCode, Quantity, UnitAmount, JournalID, Debit, Credit, Code, Name, SalesPrice, PurchasePrice, Rate, etc.) and maps them to the right fields. InventoryItemCode is NOT mapped to AccountCode (item code ≠ account code). You can still adjust any mapping before importing.",
  },
];

function TipsAccordion({ tips }) {
  const [open, setOpen] = useState(0);
  return (
    <div className="space-y-2">
      {tips.map((t, i) => (
        <div key={i} className="rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setOpen(open === i ? -1 : i)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent/40 transition-colors"
          >
            <span className="text-sm font-medium text-foreground flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
              {t.title}
            </span>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open === i ? "rotate-180" : ""}`} />
          </button>
          <AnimatePresence>
            {open === i && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <p className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed">{t.body}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

// ── Migration guide download ─────────────────────────────────────────────────
function downloadXeroGuide() {
  const lines = [
    "OPERAPP360 — Migration Guide from Xero",
    "=========================================",
    "",
    "This guide walks you through migrating your accounting, contacts and operations",
    "from Xero to OPERAPP360. Follow the steps in strict order to avoid broken references.",
    "",
    "STEP 1 — Chart of Accounts",
    "  Export from Xero: Accounting > Advanced > Chart of accounts > Export.",
    "  Upload the CSV. Account codes and types are auto-mapped.",
    "",
    "STEP 2 — Contacts",
    "  Export from Xero: Contacts > All contacts > Export.",
    "  Headers like ContactName, EmailAddress, TaxNumber, PO/SA addresses are auto-detected.",
    "",
    "STEP 3 — Items (Products & Services)",
    "  Export from Xero: Inventory > Items > Export.",
    "  Columns: *ItemCode, ItemName, Quantity, PurchasesDescription, PurchasesUnitPrice, PurchasesAccount,",
    "  PurchasesTaxRate, SalesDescription, SalesUnitPrice, SalesAccount, SalesTaxRate,",
    "  InventoryAssetAccount, CostOfGoodsSoldAccount, Status, InventoryType.",
    "  Prices such as 54,000.00 and quoted multiline descriptions are supported.",
    "",
    "STEP 4 — Tax Rates",
    "  Export from Xero: Accounting > Advanced > Tax rates > Export.",
    "  Columns: Name, TaxRate, AccountsUsingThisRate. TaxRate strips %, including 0%. Usage count is skipped.",
    "",
    "STEP 5 — Bank Accounts (Bank Summary CSV)",
    "  Export from Xero: Banking > Bank Summary > Export.",
    "  Columns: Account, BankAccountType, Status, OpeningBalance_YYYY-MM-DD.",
    "  The opening date comes from the header. Currency defaults to AED, or USD when present in the account name.",
    "  Match existing bank accounts by name; closing balances and cash movements are not opening balances.",
    "",
    "  Bank Transactions (Account Transactions CSV/XLSX):",
    "  Export from Xero: Banking > Account Transactions > Export (one file per bank).",
    "  Only rows from the conversion date onwards are imported; earlier rows are in the opening balance.",
    "  Payment linking rules (applied in order):",
    "    1. Direction — invoices link only to Receive Money, bills only to Spend Money, transfers never link.",
    "    2. Reference first — match the invoice/bill number in the bank Reference field.",
    "    3. Never reuse a claimed bank row — a bank tx already linked to any document is off-limits.",
    "    4. Fallback by contact + amount + date — only among unclaimed candidates of the right direction.",
    "    5. Ambiguous goes to a review list — nothing is guessed.",
    "  No new payments are created. No journal entries are posted.",
    "",
    "STEP 6 — General Ledger (Journal Report CSV or GL .txt)",
    "  Export from Xero: Accounting > Reports > Journal Report > Export to CSV.",
    "  Columns: Date, JournalID, AccountCode, Account, Debit, Credit, PostedDate, PostedBy, Narration.",
    "  Lines grouped by JournalID (fallback: Date + Narration). Debit must equal Credit.",
    "  Also supports GL .txt export (NetAmount format).",
    "",
    "STEP 7 — Invoices & Bills (line-by-line CSV)",
    "  Export Xero Invoices and Bills as CSV (one row per line).",
    "  Grouped by InvoiceNumber into one record with line_items.",
    "  Bills without number: grouped by contact + date + reference + total.",
    "  Voided/Deleted are skipped. Paid amount imported as payments.",
    "  Type containing credit note, overpayment or prepayment is routed to Credit Notes.",
    "  ContactName is resolved or created first; InvoiceNumber is preserved. No negative invoices/bills.",
    "  InventoryItemCode is NOT mapped to AccountCode (item code ≠ account code).",
    "  Auto-posting is skipped during migration (GL brings all historical journals).",
    "  Payroll bills are imported here too (normal Bills step).",
    "",
    "STEP 8 — Credit Notes",
    "  Export from Xero: Sales > Credit Notes > Export (or include in Invoices export).",
    "  Type: Sales credit note, Bill credit note, Sales overpayment, Bill overpayment, Bill prepayment.",
    "  Filter credit note, overpayment or prepayment; group by InvoiceNumber with all line items.",
    "  InvoiceNumber is preserved; re-importing notes from step 7 updates them without duplicates.",
    "  Voided/Deleted are skipped. Contacts are created if they don't exist.",
    "",
    "STEP 9 — Fixed Assets (Depreciation Schedule CSV)",
    "  Export from Xero: Fixed Assets > Depreciation Schedule > Export.",
    "  Columns: AssetGroup(CostAccount), Name, Cost, OpeningValue_YYYY-MM-DD, Purchases, Disposals, Depreciation, ClosingValue_YYYY-MM-DD.",
    "  Maps category, purchase_price, net_book_value, accumulated_depreciation (Cost minus ClosingValue), period depreciation.",
    "  Dedupes by name — existing assets only update accounting fields, operational data is never modified.",
    "",
    "STEP 10 — Trial Balance (verification & opening balances)",
    "  Export from Xero: Accounting > Reports > Trial Balance > Export to CSV.",
    "  Verifies total debits = total credits. Updates opening_balance for matched accounts.",
    "",
    "STEP 11 — Reconciliation (read-only verification)",
    "  Compares the General Ledger balance per account with the Trial Balance.",
    "  Compares outstanding Invoices total with GL Accounts Receivable balance.",
    "  Compares outstanding Bills total with GL Accounts Payable balance.",
    "  Only shows differences — does not modify any data.",
    "",
    "Notes:",
    "  - Column auto-mapping recognises standard Xero headers. Unmapped columns are skipped.",
    "  - You can re-run any step at any time from the Migration tab.",
    "  - Use 'Add to existing' mode to append, or 'Replace all' to start clean per entity.",
    "",
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "OPERAPP360_Xero_Migration_Guide.txt";
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main wizard ──────────────────────────────────────────────────────────────
export default function MigrationWizard() {
  const [source, setSource] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [phase, setPhase] = useState("upload"); // upload | preview
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [completed, setCompleted] = useState({}); // `${stepIndex}-${subIndex}` -> true
  const [done, setDone] = useState(false);
  const [importRecords, setImportRecords] = useState({});

  // Load last import records per entity type (reloads when step changes)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const records = await base44.entities.ImportRecord.list("-imported_at", 500);
        const arr = Array.isArray(records) ? records : records.items || [];
        if (!mounted) return;
        const byType = {};
        arr.forEach(r => {
          if (!byType[r.entity_type]) byType[r.entity_type] = [];
          byType[r.entity_type].push(r);
        });
        setImportRecords(byType);
      } catch {}
    })();
    return () => { mounted = false; };
  }, [stepIndex, subIndex]);

  const getStepImports = (s) => {
    let records = [];
    if (s.type === "xeroGL") {
      records = importRecords["XeroGL"] || [];
    } else if (s.type === "creditNote") {
      records = importRecords["CreditNote"] || [];
    } else if (s.type === "fixedAssets") {
      records = importRecords["Asset"] || [];
    } else if (s.entityKeys) {
      for (const key of s.entityKeys) {
        records = records.concat(importRecords[key] || []);
      }
    }
    return records
      .sort((a, b) => new Date(b.imported_at) - new Date(a.imported_at))
      .slice(0, 1);
  };

  const resetFile = () => { setFile(null); setParseResult(null); };

  const advance = () => {
    const step = MIGRATION_STEPS[stepIndex];
    const keys = step.entityKeys || [];
    const subKey = `${stepIndex}-${subIndex}`;
    setCompleted((c) => ({ ...c, [subKey]: true }));
    resetFile();
    // More sub-entities in current step?
    if (subIndex < keys.length - 1) {
      setSubIndex(subIndex + 1);
      setPhase("upload");
      return;
    }
    // Move to next step
    if (stepIndex < MIGRATION_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      setSubIndex(0);
      setPhase("upload");
      return;
    }
    setDone(true);
  };

  const jumpToStep = (i) => {
    setStepIndex(i);
    setSubIndex(0);
    setPhase("upload");
    resetFile();
  };

  const goToPrevStep = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      setSubIndex(0);
      setPhase("upload");
      resetFile();
    }
  };

  const skipCurrent = () => {
    resetFile();
    if (stepIndex < MIGRATION_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      setSubIndex(0);
      setPhase("upload");
    } else {
      setDone(true);
    }
  };

  const restart = () => {
    setSource(null);
    setStepIndex(0);
    setSubIndex(0);
    setPhase("upload");
    resetFile();
    setCompleted({});
    setDone(false);
  };

  // ── Source selection ───────────────────────────────────────────────────────
  if (!source) {
    return (
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Wand2 className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Migrate from another app</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Bring your accounting, contacts and operations into OPERAPP360. We'll guide you step by step.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {SOURCES.map((s) => (
            <motion.button
              key={s.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { if (s.disabled) return; setSource(s); setStepIndex(0); setSubIndex(0); setPhase("upload"); }}
              disabled={!!s.disabled}
              className={`relative p-5 rounded-xl border-2 text-left transition-all duration-200 ${s.disabled ? "opacity-60 cursor-not-allowed" : "hover:shadow-md"}`}
              style={{ borderColor: `${s.color}55` }}
            >
              {s.badge && (
                <span
                  className="absolute top-3 right-3 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${s.color}1a`, color: s.color }}
                >
                  {s.badge}
                </span>
              )}
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-3 font-bold text-white text-sm"
                style={{ backgroundColor: s.color }}
              >
                {s.label.slice(0, 2)}
              </div>
              <p className="font-semibold text-foreground">{s.label}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
            </motion.button>
          ))}
        </div>

        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800 text-xs flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <p>
            <span className="font-semibold">Tip:</span> The wizard enforces a strict import order
            (Chart of Accounts → Contacts → Items → Tax Rates → Bank Accounts → General Ledger → Invoices & Bills → Credit Notes → Fixed Assets → Trial Balance → Reconciliation)
            to prevent broken cross-references and duplicate journals. You can skip a step and come back to it later.
          </p>
        </div>
      </div>
    );
  }

  // ── Completion screen ──────────────────────────────────────────────────────
  if (done) {
    const doneCount = Object.keys(completed).length;
    return (
      <div className="max-w-xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Migration Complete</h2>
          <p className="text-muted-foreground mt-1">
            You've completed the migration flow from {source.label}. {doneCount} import{doneCount !== 1 ? "s" : ""} finished.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            You can re-run any step from this tab, or use Data Import for individual entities.
          </p>
          <div className="flex gap-3 justify-center mt-6">
            <Button onClick={restart} variant="outline" className="gap-1.5">
              <RefreshCw className="w-4 h-4" /> Start Over
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Active step ────────────────────────────────────────────────────────────
  const step = MIGRATION_STEPS[stepIndex];
  const isXeroGL = step.type === "xeroGL";
  const isTrialBalance = step.type === "trialBalance";
  const isCreditNote = step.type === "creditNote";
  const isReconciliation = step.type === "reconciliation";
  const isFixedAssets = step.type === "fixedAssets";
  const isBankTransaction = step.entityKeys && step.entityKeys[subIndex] === "BankTransaction";
  const entityKey = step.entityKeys ? step.entityKeys[subIndex] : null;
  const entity = entityKey ? findEntity(entityKey) : null;
  const subKey = `${stepIndex}-${subIndex}`;
  const isLastSub = !step.entityKeys || subIndex === step.entityKeys.length - 1;
  const subLabel = step.entityKeys && step.entityKeys.length > 1 ? ENTITY_LABELS[entityKey] || entity?.label : null;
  const stepImports = getStepImports(step);
  const stepDesc = source.key === "xero" ? step.desc : step.desc.replace(/Xero/g, source.label);

  return (
    <div className="space-y-5">
      {/* Header: source + guide button */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span
            className="text-xs font-semibold px-2.5 py-1 rounded-full"
            style={{ backgroundColor: `${source.color}1a`, color: source.color }}
          >
            From {source.label}
          </span>
          <button
            onClick={() => { setSource(null); resetFile(); }}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3 h-3" /> Change source
          </button>
        </div>
        {source.key === "xero" && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={downloadXeroGuide}>
            <Download className="w-3.5 h-3.5" /> Download Xero Migration Guide
          </Button>
        )}
      </div>

      {/* Quick import — drop all Xero files at once: types are auto-detected and imported in dependency order */}
      {source.key === "xero" && <QuickImportDropzone />}

      {/* Step progress bar (11 steps) */}
      <div className="flex flex-wrap items-center gap-1 pb-1">
        {MIGRATION_STEPS.map((s, i) => {
          const stepDone = i < stepIndex || (i === stepIndex && isLastSub && completed[subKey]);
          const isCurrent = i === stepIndex;
          return (
            <React.Fragment key={s.num}>
              <div
                onClick={() => jumpToStep(i)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all shrink-0 cursor-pointer hover:border-primary/50 hover:bg-accent/30 ${
                  isCurrent ? "border-primary bg-primary/5" : stepDone ? "border-emerald-300 bg-emerald-50/50" : "border-border bg-card"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 ${
                    stepDone ? "bg-emerald-500 text-white" : isCurrent ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {stepDone ? <Check className="w-3.5 h-3.5" /> : s.num}
                </div>
                <span className={`text-xs font-medium whitespace-nowrap ${isCurrent ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {i < MIGRATION_STEPS.length - 1 && (
                <ArrowRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4">
        {/* Main column: upload / preview */}
        <div>
          <Card>
            <CardContent className="p-4">
              {/* Current step intro */}
              <div className="mb-5 pb-4 border-b border-border">
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <step.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground">
                      Step {step.num}: {step.label}
                      {subLabel && <span className="text-muted-foreground font-normal"> — {subLabel}</span>}
                    </h3>
                    <p className="text-xs text-muted-foreground">{stepDesc}</p>
                  </div>
                </div>
                {source.key === "xero" && (
                  <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-600 font-medium">
                    <Wand2 className="w-3 h-3" /> Auto-mapping active for standard {source.label} headers
                  </div>
                )}
                {stepImports.length > 0 && (
                  <div className="mt-3 rounded-lg bg-muted/30 border border-border p-3">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                      <History className="w-3 h-3" /> Import History ({stepImports.length})
                    </div>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto">
                      {stepImports.map((r, i) => (
                        <div key={r.id || i} className="flex items-center justify-between text-xs gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span className="text-foreground font-medium tabular-nums shrink-0">{r.record_count} records</span>
                            {r.created_count > 0 && r.updated_count > 0 && (
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                ({r.created_count} new, {r.updated_count} updated)
                              </span>
                            )}
                            {r.mode === "replace" && (
                              <span className="text-[10px] text-amber-600 font-medium shrink-0">replaced</span>
                            )}
                            {r.file_name && (
                              <span className="text-[10px] text-muted-foreground truncate" title={r.file_name}>{r.file_name}</span>
                            )}
                          </div>
                          <span className="text-muted-foreground whitespace-nowrap shrink-0">{moment(r.imported_at).format("MMM D, YYYY h:mm A")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <TipsAccordion tips={source.key === "xero" ? XERO_TIPS : GENERIC_TIPS(source)} />

              {/* Sub-entity toggle for steps with multiple entities (e.g. Invoices & Bills) */}
              {step.entityKeys && step.entityKeys.length > 1 && !isFixedAssets && (
                <div className="flex items-center justify-center gap-2 mb-5">
                  {step.entityKeys.map((key, idx) => {
                    const ent = findEntity(key);
                    return (
                      <button key={key} onClick={() => { setSubIndex(idx); setPhase("upload"); resetFile(); }}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          subIndex === idx ? "bg-primary text-primary-foreground shadow-sm" : "bg-card border border-border text-muted-foreground hover:border-primary/40"
                        }`}>
                        {ENTITY_LABELS[key] || ent?.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Mini sub-stepper (hidden for Xero GL & Bank Transactions — they have their own flow) */}
              {!isXeroGL && !isBankTransaction && !isTrialBalance && !isCreditNote && !isReconciliation && !isFixedAssets && (
                <div className="flex items-center justify-center gap-1 mb-6 text-xs">
                  {[
                    { n: 1, l: "Upload File" },
                    { n: 2, l: "Preview & Import" },
                  ].map((s, i) => (
                    <React.Fragment key={s.n}>
                      <div className={`flex items-center gap-1.5 ${phase === "upload" ? (i === 0 ? "text-primary" : "text-muted-foreground") : "text-emerald-600"}`}>
                        <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold ${
                          phase === "preview" ? "bg-emerald-500 text-white" : i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        }`}>
                          {phase === "preview" ? <Check className="w-3 h-3" /> : s.n}
                        </div>
                        <span className="font-medium">{s.l}</span>
                      </div>
                      {i === 0 && <ArrowRight className="w-3 h-3 text-muted-foreground/40 mx-1" />}
                    </React.Fragment>
                  ))}
                </div>
              )}

              <AnimatePresence mode="wait">
                {isXeroGL ? (
                  <XeroGLImporter
                    key="xero-gl"
                    onBack={() => skipCurrent()}
                    onReset={advance}
                  />
                ) : isTrialBalance ? (
                  <TrialBalanceImport
                    key="trial-balance"
                    onBack={() => skipCurrent()}
                    onReset={advance}
                  />
                ) : isCreditNote ? (
                  <CreditNoteImporter
                    key="credit-notes"
                    onBack={() => skipCurrent()}
                    onReset={advance}
                  />
                ) : isReconciliation ? (
                  <ReconciliationStep
                    key="reconciliation"
                    onBack={() => skipCurrent()}
                    onReset={advance}
                  />
                ) : isFixedAssets ? (
                  <FixedAssetsImporter
                    key="fixed-assets"
                    onBack={() => skipCurrent()}
                    onReset={advance}
                  />
                ) : isBankTransaction ? (
                  <BankTransactionMigrationStep
                    key="bank-tx"
                    onDone={advance}
                    onBack={skipCurrent}
                  />
                ) : (
                  <>
                    {phase === "upload" && entity && (
                      <StepUpload
                        key={`upload-${subKey}`}
                        entity={entity}
                        file={file}
                        setFile={setFile}
                        parseResult={parseResult}
                        setParseResult={setParseResult}
                        onNext={() => setPhase("preview")}
                      />
                    )}
                    {phase === "preview" && entity && parseResult && (
                      <StepPreview
                        key={`preview-${subKey}`}
                        entity={entity}
                        parseResult={parseResult}
                        file={file}
                        resetLabel={isLastSub && stepIndex === MIGRATION_STEPS.length - 1 ? "Finish" : "Continue"}
                        onBack={() => { setPhase("upload"); resetFile(); }}
                        onReset={advance}
                        skipAutoPost={source.key === "xero"}
                      />
                    )}
                  </>
                )}
              </AnimatePresence>

              <div className="flex justify-between mt-4 pt-4 border-t border-border">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={goToPrevStep} disabled={stepIndex === 0}>
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </Button>
                <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={skipCurrent}>
                  <SkipForward className="w-3.5 h-3.5" /> Skip this step
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function GENERIC_TIPS(source) {
  return [
    {
      title: `Export from ${source.label}`,
      body: source.key === "quickbooks"
        ? "In QuickBooks, export your lists (Chart of Accounts, Customer Center, Vendor Center) and reports (Invoices, Bills) to Excel, then save each as CSV."
        : "Export your data from any spreadsheet software as CSV. Download our template per entity to see the expected column headers.",
    },
    {
      title: "Recommended import order",
      body: "Follow the 11 steps in order: Chart of Accounts → Contacts → Items → Tax Rates → Bank Accounts → General Ledger → Invoices & Bills → Credit Notes → Fixed Assets → Trial Balance → Reconciliation. The General Ledger must come before Invoices & Bills to avoid duplicate journal entries.",
    },
    {
      title: "Column mapping",
      body: "After uploading, match each CSV column to the right field. Required fields are marked. Columns left as 'Not imported' are skipped.",
    },
  ];
}

