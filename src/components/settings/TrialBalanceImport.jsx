import React, { useState, useRef, useEffect, useMemo } from "react";
import { downloadCsvTemplate } from "@/lib/readImportFile";
import { motion } from "framer-motion";
import { ArrowLeft, Upload, Check, Loader2, AlertCircle, FileText, RefreshCw, ChevronRight, Scale, RotateCcw } from "lucide-react";

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from "@/api/base44Client";
import { parseImportCsv } from "@/lib/importCsv";
import { getSingleton } from "@/lib/singletonSettings";
import moment from "moment";
import OpeningBalanceGenerateDialog from "@/components/settings/OpeningBalanceGenerateDialog";

// ── Account type classification ──────────────────────────────────────────
// Balance-sheet types: opening balance carried forward as Debit - Credit.
const BS_TYPES = new Set([
  "Bank", "Current Asset", "Fixed Asset", "Non-current Asset",
  "Current Liability", "Liability", "Non-current Liability", "Equity",
]);
// P&L types: net YTD movement (Debit - Credit) added to Retained Earnings.
const PL_TYPES = new Set(["Revenue", "Other Income", "Direct Costs", "Expense"]);

const TYPE_MAP = {
  "bank": "Bank",
  "current asset": "Current Asset",
  "fixed asset": "Fixed Asset",
  "non-current asset": "Non-current Asset",
  "noncurrent asset": "Non-current Asset",
  "current liability": "Current Liability",
  "liability": "Liability",
  "non-current liability": "Non-current Liability",
  "noncurrent liability": "Non-current Liability",
  "equity": "Equity",
  "revenue": "Revenue",
  "sales": "Revenue",
  "other income": "Other Income",
  "other revenue": "Other Income",
  "direct costs": "Direct Costs",
  "direct cost": "Direct Costs",
  "cost of sales": "Direct Costs",
  "expense": "Expense",
  "expenses": "Expense",
  "overhead": "Expense",
  "depreciation": "Expense",
  "prepayment": "Current Asset",
  "inventory": "Current Asset",
};

const normalizeType = (raw) => {
  const t = String(raw || "").trim().toLowerCase();
  if (TYPE_MAP[t]) return TYPE_MAP[t];
  for (const [k, v] of Object.entries(TYPE_MAP)) {
    if (t.includes(k)) return v;
  }
  return "";
};

const parseNum = (val) => {
  if (!val && val !== 0) return 0;
  const s = String(val).trim();
  if (!s) return 0;
  const isNegative = s.startsWith("(") && s.endsWith(")");
  const clean = s.replace(/[(),]/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : (isNegative ? -Math.abs(n) : n);
};

const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
// Zero-padding-safe code compare: "0800" and "800" match
const normCode = (s) => {
  const c = String(s || "").trim().toLowerCase();
  return c.replace(/^0+/, "") || "0";
};

// ── File parsing helpers ──────────────────────────────────────────────────
const findHeaderLine = (text) => {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    if (lines[i].toLowerCase().includes("account code")) return i;
  }
  return 0;
};

// Parse "As at 31 December 2021" from title rows
const parseConversionDate = (text) => {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const m = lines[i].match(/as\s*at\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
    if (m) {
      const d = moment(`${m[1]} ${m[2]} ${m[3]}`, ["DD MMM YYYY", "DD MMMM YYYY", "D MMM YYYY", "D MMMM YYYY"], true);
      if (d.isValid()) return d.format("YYYY-MM-DD");
    }
  }
  return null;
};

const parseTrialBalanceText = (text) => {
  const headerIdx = findHeaderLine(text);
  const lines = text.split(/\r?\n/);
  const sliced = lines.slice(headerIdx).join("\n");
  const result = parseImportCsv(sliced);
  const conversionDate = parseConversionDate(text);
  return { ...result, conversionDate };
};

const findCol = (headers, names) => {
  for (const name of names) {
    const found = headers.find(h => h.toLowerCase() === name.toLowerCase());
    if (found) return found;
  }
  return null;
};

export default function TrialBalanceImport({ onBack, onReset }) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [coaAccounts, setCoaAccounts] = useState([]);
  const [coaLoading, setCoaLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [showOpeningDialog, setShowOpeningDialog] = useState(false);
  const [openingGenerated, setOpeningGenerated] = useState(false);
  const [conversionDate, setConversionDate] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const page = await base44.entities.ChartOfAccount.filter({}, { sort: "code", limit: 10000 });
        const arr = page.items || (Array.isArray(page) ? page : []);
        setCoaAccounts(arr);
      } catch (e) {
        console.error("Failed to load Chart of Accounts:", e);
      }
      setCoaLoading(false);
    })();
  }, []);

  // COA lookups: by code first, then exact trimmed name (case-insensitive)
  const coaByCode = useMemo(() => {
    const m = {};
    coaAccounts.forEach(a => { const c = normCode(a.code); if (c) m[c] = a; });
    return m;
  }, [coaAccounts]);

  const coaByName = useMemo(() => {
    const m = {};
    coaAccounts.forEach(a => { const n = norm(a.name); if (n) m[n] = a; });
    return m;
  }, [coaAccounts]);

  // Retained Earnings: code 960, or Equity type named "Retained Earnings"
  const reAccount = useMemo(() => {
    return coaAccounts.find(a => normCode(a.code) === "960") ||
      coaAccounts.find(a => normalizeType(a.type) === "Equity" && norm(a.name) === "retained earnings") ||
      null;
  }, [coaAccounts]);

  const handleFile = async (f) => {
    setError("");
    if (!f) return;
    const isCsv = f.name.endsWith(".csv");
    const isXlsx = f.name.endsWith(".xlsx") || f.name.endsWith(".xls");
    if (!isCsv && !isXlsx) { setError("Please upload a CSV (.csv) or Excel (.xlsx) file"); return; }
    setFile(f); setParsing(true);
    try {
      let parsed;
      if (isCsv) {
        const text = await f.text();
        parsed = parseTrialBalanceText(text);
      } else {
        let XLSX;
        try {
          XLSX = await import("xlsx");
        } catch {
          setError("Excel parsing requires the xlsx package. Please save as CSV from Xero instead.");
          setFile(null); setParsing(false); return;
        }
        const data = await f.arrayBuffer();
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        // Use sheet_to_json (2D array) — preserves title rows and cell values reliably
        const jsonRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: "" });
        // Parse conversion date from title rows (e.g. A3 "As at 31 December 2021")
        let xlsxDate = null;
        for (let i = 0; i < Math.min(jsonRows.length, 15); i++) {
          const cellVal = String(jsonRows[i]?.[0] || "");
          const m = cellVal.match(/as\s*at\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
          if (m) {
            const d = moment(`${m[1]} ${m[2]} ${m[3]}`, ["DD MMMM YYYY", "DD MMM YYYY", "D MMMM YYYY", "D MMM YYYY"], true);
            if (d.isValid()) { xlsxDate = d.format("YYYY-MM-DD"); break; }
          }
        }
        // Find header row (containing "Account Code")
        let headerIdx = 0;
        for (let i = 0; i < Math.min(jsonRows.length, 15); i++) {
          if (String(jsonRows[i]?.[0] || "").toLowerCase().includes("account code")) { headerIdx = i; break; }
        }
        const headerRow = jsonRows[headerIdx] || [];
        const xlsxHeaders = headerRow.map(h => String(h || "").trim());
        // Stop at Total row
        let endIdx = jsonRows.length;
        for (let i = headerIdx + 1; i < jsonRows.length; i++) {
          const c0 = String(jsonRows[i]?.[0] || "").trim().toLowerCase();
          const c1 = String(jsonRows[i]?.[1] || "").trim().toLowerCase();
          if (c0 === "total" || c1 === "total" || c1.startsWith("grand total")) { endIdx = i; break; }
        }
        const xlsxRows = [];
        for (let i = headerIdx + 1; i < endIdx; i++) {
          const row = jsonRows[i] || [];
          const obj = {};
          xlsxHeaders.forEach((h, idx) => { if (h) obj[h] = row[idx] !== undefined ? row[idx] : ""; });
          xlsxRows.push(obj);
        }
        parsed = { headers: xlsxHeaders, rows: xlsxRows, conversionDate: xlsxDate };
      }
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("The file appears to be empty or has no data rows.");
        setFile(null); setParsing(false); return;
      }
      const hasAccountCode = parsed.headers.some(h =>
        h.toLowerCase().includes("account code") || h.toLowerCase() === "accountcode" ||
        h.toLowerCase() === "account" || h.toLowerCase() === "code"
      );
      if (!hasAccountCode) {
        setError("This doesn't look like a Trial Balance export. Required: Account Code column.");
        setFile(null); setParsing(false); return;
      }
      setParseResult(parsed);
      setConversionDate(parsed.conversionDate || "");
      setParsing(false);
      setStep(2);
    } catch {
      setError("Could not read the file. Make sure it's a valid CSV or Excel file.");
      setFile(null); setParsing(false);
    }
  };

  // ── Core processing: classify, match, compute RE, build update/reset lists ──
  const processed = useMemo(() => {
    if (!parseResult) return null;
    const { headers, rows } = parseResult;
    const codeCol = headers.find(h => h.toLowerCase() === "account code") || findCol(headers, ["AccountCode", "Code", "Account"]);
    const nameCol = headers.find(h => h.toLowerCase() === "account") || findCol(headers, ["AccountName", "Name"]);
    const typeCol = headers.find(h => h.toLowerCase() === "account type") || findCol(headers, ["AccountType", "Type"]);
    const debitCol = headers.find(h => h.toLowerCase().includes("debit") && h.toLowerCase().includes("year to date")) || findCol(headers, ["Debit", "Debits", "YTD Debit"]);
    const creditCol = headers.find(h => h.toLowerCase().includes("credit") && h.toLowerCase().includes("year to date")) || findCol(headers, ["Credit", "Credits", "YTD Credit"]);

    // Stop at Total row
    const totalIdx = rows.findIndex(row => {
      const c = norm(row[codeCol]); const n = norm(row[nameCol]);
      return c === "total" || n === "total" || n === "totales" || n.startsWith("grand total");
    });
    const dataRows = totalIdx >= 0 ? rows.slice(0, totalIdx) : rows;

    const tbRows = dataRows.map(row => {
      const code = String(row[codeCol] || "").trim();
      const name = String(row[nameCol] || "").trim();
      const typeRaw = String(row[typeCol] || "").trim();
      const debit = parseNum(row[debitCol]);
      const credit = parseNum(row[creditCol]);
      const net = debit - credit;
      const typeNorm = normalizeType(typeRaw);
      const isBs = BS_TYPES.has(typeNorm);
      const isPl = PL_TYPES.has(typeNorm);
      // Match by code first (zero-padding-safe), then exact trimmed name (case-insensitive)
      const matched = (code && coaByCode[normCode(code)]) || (name && coaByName[norm(name)]) || null;
      return { code, name, typeRaw, typeNorm, isBs, isPl, debit, credit, net, matchedId: matched?.id, matchedName: matched?.name };
    }).filter(r => r.code || r.name);

    const bsRows = tbRows.filter(r => r.isBs);
    const plRows = tbRows.filter(r => r.isPl);
    const plNet = plRows.reduce((s, r) => s + r.net, 0);

    // RE opening = RE balance from TB + P&L net
    const reInTb = bsRows.find(r => r.matchedId && r.matchedId === reAccount?.id);
    const reTbBalance = reInTb ? reInTb.net : 0;
    const reOpening = reTbBalance + plNet;

    // Update list: BS accounts with opening_balance = net; RE overridden with reOpening
    const matchedBsIds = new Set(bsRows.filter(r => r.matchedId).map(r => r.matchedId));
    const updateList = bsRows.filter(r => r.matchedId).map(r => {
      if (r.matchedId === reAccount?.id) {
        return { id: r.matchedId, code: r.code, name: r.name || r.matchedName, opening_balance: reOpening, isRE: true };
      }
      return { id: r.matchedId, code: r.code, name: r.name || r.matchedName, opening_balance: r.net, isRE: false };
    });

    // If RE exists in COA but not in TB, add it with plNet
    if (reAccount && !matchedBsIds.has(reAccount.id)) {
      updateList.push({ id: reAccount.id, code: reAccount.code, name: reAccount.name, opening_balance: reOpening, isRE: true });
    }

    // Reset list: every COA account NOT in the update list → opening_balance = 0
    const updateIds = new Set(updateList.map(u => u.id));
    const resetList = coaAccounts.filter(a => !updateIds.has(a.id)).map(a => ({ id: a.id, code: a.code, name: a.name }));

    const totalDebit = tbRows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = tbRows.reduce((s, r) => s + r.credit, 0);
    const matchedCount = tbRows.filter(r => r.matchedId).length;
    const hasTypeCol = !!typeCol;

    return { tbRows, bsRows, plRows, plNet, reAccount, reInTb, reTbBalance, reOpening, updateList, resetList, totalDebit, totalCredit, matchedCount, hasTypeCol };
  }, [parseResult, coaByCode, coaByName, coaAccounts, reAccount]);

  const balanced = processed ? Math.abs(processed.totalDebit - processed.totalCredit) < 0.01 : false;

  const handleImport = async (test = false) => {
    if (!processed) return;
    if (!conversionDate) { setError("Conversion date is required."); return; }
    setImporting(true); setError(""); setResult(null); setProgress(0);
    try {
      const updateList = processed.updateList;
      const limited = test ? updateList.slice(0, 20) : updateList;
      let updated = 0; const failed = [];
      let conversionSaveError = null;

      // Update BS + RE opening balances (batch)
      const updateItems = limited.map(u => ({ id: u.id, opening_balance: u.opening_balance, opening_balance_date: conversionDate }));
      for (let i = 0; i < updateItems.length; i += 500) {
        const batch = updateItems.slice(i, i + 500);
        try {
          await base44.entities.ChartOfAccount.bulkUpdate(batch);
          updated += batch.length;
        } catch {
          for (const item of batch) {
            try { await base44.entities.ChartOfAccount.update(item.id, { opening_balance: item.opening_balance, opening_balance_date: conversionDate }); updated++; }
            catch (e) { failed.push(`${item.id}: ${e.message}`); }
          }
        }
        setProgress(Math.round((Math.min(i + 500, updateItems.length) / Math.max(updateItems.length, 1)) * 50));
      }

      let resetCount = 0;
      if (!test) {
        // Reset all non-TB COA accounts to 0 (stale values from earlier imports)
        const resetItems = processed.resetList.map(r => ({ id: r.id, opening_balance: 0, opening_balance_date: conversionDate }));
        for (let i = 0; i < resetItems.length; i += 500) {
          const batch = resetItems.slice(i, i + 500);
          try {
            await base44.entities.ChartOfAccount.bulkUpdate(batch);
            resetCount += batch.length;
          } catch {
            for (const item of batch) {
              try { await base44.entities.ChartOfAccount.update(item.id, { opening_balance: 0, opening_balance_date: conversionDate }); resetCount++; }
              catch (e) { failed.push(`${item.id}: ${e.message}`); }
            }
          }
          setProgress(50 + Math.round((Math.min(i + 500, resetItems.length) / Math.max(resetItems.length, 1)) * 50));
        }

        // Store conversion_date in AccountingSettings (get-or-create) — a
        // failure is surfaced in the import result instead of being swallowed.
        try {
          const settingsRec = await getSingleton(base44.entities.AccountingSettings, "AccountingSettings");
          if (settingsRec) {
            await base44.entities.AccountingSettings.update(settingsRec.id, { conversion_date: conversionDate });
          } else {
            await base44.entities.AccountingSettings.create({ conversion_date: conversionDate });
          }
        } catch (e) {
          console.error("Could not store the conversion date in AccountingSettings:", e);
          conversionSaveError = e?.message || "Unknown error";
        }
      }

      setResult({
        updated, resetCount, failed, total: limited.length, testMode: test,
        matched: processed.matchedCount, totalRows: processed.tbRows.length,
        openingDate: conversionDate, plNet: processed.plNet, reOpening: processed.reOpening,
        resetTotal: processed.resetList.length, conversionSaveError,
      });

      try {
        await base44.entities.ImportRecord.create({
          entity_type: "TrialBalance",
          imported_at: new Date().toISOString(),
          record_count: updated + (test ? 0 : resetCount),
          created_count: 0,
          updated_count: updated + (test ? 0 : resetCount),
          mode: "append",
          file_name: file?.name || "",
        });
      } catch {}

      // Auto-open opening-balance dialog after a full (non-test) import
      if (!test) {
        setShowOpeningDialog(true);
      }
    } catch (err) {
      setError(err.message || "Import failed");
    }
    setImporting(false);
  };

  // ── Result screen ─────────────────────────────────────────────────────
  if (result) {
    return (
      <>
      <div className="mx-auto text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-foreground">{result.testMode ? "Trial Balance Test Import Complete" : "Trial Balance Import Complete"}</h2>
          <p className="text-muted-foreground mt-1">{result.updated} account opening balances updated.</p>
          {!result.testMode && result.resetCount > 0 && (
            <p className="text-xs text-muted-foreground mt-1">{result.resetCount} accounts reset to 0 (not in TB).</p>
          )}
          {result.openingDate && (
            <p className="text-xs text-muted-foreground mt-1">Conversion date: {result.openingDate}</p>
          )}
          {result.conversionSaveError && (
            <p className="text-xs text-destructive mt-1 font-medium">
              The conversion date could not be saved to Accounting Settings ({result.conversionSaveError}). Nothing else was affected — set it manually in Accounting Settings.
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            P&L net added to Retained Earnings: {result.plNet.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            RE opening balance: {result.reOpening.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
          {result.testMode && (
            <p className="text-xs text-amber-600 mt-1 font-medium">Test mode: only the first 20 accounts were updated. Click "Import More" to run the full import.</p>
          )}
          {result.failed.length > 0 && (
            <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm text-left max-h-40 overflow-y-auto">
              <p className="font-medium mb-1">{result.failed.length} accounts had errors:</p>
              {result.failed.map((f, i) => <p key={i} className="text-xs opacity-80">{f}</p>)}
            </div>
          )}
          <div className="flex gap-3 justify-center mt-6 flex-wrap">
            <Button onClick={onReset} variant="outline" className="gap-1.5"><RefreshCw className="w-4 h-4" /> Import More</Button>
            {!openingGenerated && !result.testMode && (
              <Button onClick={() => setShowOpeningDialog(true)} className="gap-1.5">
                <Scale className="w-4 h-4" /> Generate Opening Balance
              </Button>
            )}
            {openingGenerated && (
              <div className="flex items-center gap-1.5 text-emerald-600 text-sm font-medium px-3">
                <Check className="w-4 h-4" /> Opening balance journal created
              </div>
            )}
            <Link to="/accounting/chart-of-accounts"><Button variant="outline" className="gap-1.5">View Chart of Accounts <ChevronRight className="w-4 h-4" /></Button></Link>
          </div>
        </motion.div>
      </div>
      <OpeningBalanceGenerateDialog
        open={showOpeningDialog}
        onClose={() => setShowOpeningDialog(false)}
        onDone={() => { setOpeningGenerated(true); setShowOpeningDialog(false); }}
      />
      </>
    );
  }

  // ── Step 1: Upload ─────────────────────────────────────────────────────
  if (step === 1) {
    return (
      <div className="mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
          <Scale className="w-10 h-10 mx-auto text-primary mb-3" />
          <h2 className="text-xl font-bold text-foreground">Upload Xero Trial Balance</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Export from Xero: <span className="font-medium">Accounting → Reports → Trial Balance → Export to CSV or Excel</span>
          </p>
        </motion.div>
        <div className="flex items-start gap-2.5 mb-6 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <div>
            <p className="font-semibold mb-1">How it works</p>
            <p>Upload a Xero Trial Balance export (columns: Account Code, Account, Account Type, Debit, Credit). Balance-sheet accounts get their opening balance set (Debit - Credit). P&L accounts are ignored but their net YTD movement is added to Retained Earnings (960) so the books balance. Every chart account NOT in the TB is reset to 0. The conversion date is read from the "As at" title or entered below. Nothing is written until you confirm.</p>
          </div>
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
            dragOver ? "border-primary bg-primary/5" : file ? "border-emerald-300 bg-emerald-50/50" : "border-border hover:border-primary/40 hover:bg-accent/30"
          }`}
        >
          <button type="button" onClick={(e) => { e.stopPropagation(); downloadCsvTemplate("trial_balance_template.csv", ["Account Code", "Account", "Account Type", "Debit", "Credit"], ["1000", "Cash on Hand", "Current Asset", "15000.00", "0"]); }} className="mt-3 text-xs font-medium text-primary hover:underline">Download template (CSV)</button>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          {parsing ? (
            <div className="flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">Parsing Trial Balance...</p></div>
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
              <div><p className="font-medium text-foreground">Click to upload or drag & drop</p><p className="text-xs text-muted-foreground mt-0.5">Xero Trial Balance CSV or Excel</p></div>
            </div>
          )}
        </div>
        {error && <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
        <div className="flex justify-start mt-6"><Button variant="outline" onClick={onBack} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button></div>
      </div>
    );
  }

  // ── Step 2: Preview ────────────────────────────────────────────────────
  const fmt = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
        <FileText className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Preview Trial Balance</h2>
        <p className="text-sm text-muted-foreground mt-1">{processed.tbRows.length} accounts found in <span className="font-medium">{file?.name}</span></p>
      </motion.div>

      {coaLoading && (
        <div className="mb-4 flex items-center justify-center gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading Chart of Accounts ({coaAccounts.length} loaded)…
        </div>
      )}

      {/* Conversion date input */}
      <div className="mb-4 p-3 rounded-lg bg-muted/30 border border-border flex items-center gap-3">
        <Label className="text-xs font-semibold text-muted-foreground whitespace-nowrap">Conversion date</Label>
        <Input type="date" value={conversionDate} onChange={(e) => setConversionDate(e.target.value)} className="h-8 w-auto text-sm" />
        {!conversionDate && <span className="text-xs text-amber-600 font-medium">Required — enter the TB "as at" date</span>}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-2xl font-bold text-primary tabular-nums">{processed.updateList.length}</p>
          <p className="text-xs text-muted-foreground">Accounts to update (BS)</p>
        </div>
        <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
          <p className="text-2xl font-bold text-orange-600 tabular-nums">{processed.resetList.length}</p>
          <p className="text-xs text-muted-foreground">Reset to 0</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-2xl font-bold text-blue-600 tabular-nums">{fmt(processed.totalDebit)}</p>
          <p className="text-xs text-muted-foreground">Total debits</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-2xl font-bold text-blue-600 tabular-nums">{fmt(processed.totalCredit)}</p>
          <p className="text-xs text-muted-foreground">Total credits</p>
        </div>
      </div>

      {/* P&L → RE summary */}
      <div className="mb-4 p-3 rounded-lg bg-purple-50 border border-purple-200 text-purple-800 text-xs flex items-start gap-2.5">
        <Scale className="w-4 h-4 shrink-0 mt-0.5 text-purple-500" />
        <div>
          <p><span className="font-semibold">P&L net (Debit - Credit):</span> {fmt(processed.plNet)}</p>
          <p><span className="font-semibold">Retained Earnings ({reAccount?.code || "960"}):</span> TB balance {fmt(processed.reTbBalance)} + P&L net {fmt(processed.plNet)} = <span className="font-bold">opening {fmt(processed.reOpening)}</span></p>
        </div>
      </div>

      {/* Warnings */}
      {!balanced && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
          <p><span className="font-semibold">Trial balance is not balanced.</span> Difference: {fmt(processed.totalDebit - processed.totalCredit)}. Check your Xero export for missing rows.</p>
        </div>
      )}
      {!processed.hasTypeCol && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-500" />
          <p><span className="font-semibold">No "Account Type" column detected.</span> All rows will be treated as balance-sheet accounts. Re-export from Xero with the Account Type column included.</p>
        </div>
      )}
      {processed.matchedCount < processed.tbRows.length && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
          <p><span className="font-semibold">{processed.tbRows.length - processed.matchedCount} accounts not matched.</span> Import your Chart of Accounts first or create the missing accounts manually.</p>
        </div>
      )}

      {/* Per-line table */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Code</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Account</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Type</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Debit</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Credit</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Opening (D-C)</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Match</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {processed.tbRows.slice(0, 25).map((r, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs font-mono text-foreground">{r.code}</td>
                  <td className="px-3 py-2 text-xs text-foreground max-w-[200px] truncate" title={r.name}>{r.name || r.matchedName || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.typeNorm ? (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.isBs ? "bg-blue-100 text-blue-700" : r.isPl ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {r.typeNorm}{r.isBs ? " (BS)" : r.isPl ? " (P&L)" : ""}
                      </span>
                    ) : <span className="text-[10px] text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{fmt(r.debit)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{fmt(r.credit)}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums font-medium">{fmt(r.net)}</td>
                  <td className="px-3 py-2 text-center">{r.matchedId ? <Check className="w-3.5 h-3.5 text-emerald-500 inline" /> : <span className="text-[10px] text-orange-600 font-medium">No match</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {processed.tbRows.length > 25 && <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center border-t border-border">+ {processed.tbRows.length - 25} more accounts</div>}
      </div>

      {/* Reset-to-0 preview */}
      {processed.resetList.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs">
          <p className="font-semibold mb-1 flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> {processed.resetList.length} accounts will be reset to 0</p>
          <p className="opacity-80">These chart accounts are not in the TB and will have any stale opening balance cleared.</p>
        </div>
      )}

      {importing && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">Updating opening balances...</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
      )}

      {error && <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={() => { setStep(1); setFile(null); setParseResult(null); }} disabled={importing} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <div className="flex gap-2">
          <Button onClick={() => handleImport(true)} disabled={importing || !conversionDate || processed.matchedCount === 0 || coaLoading} variant="outline" className="gap-1.5"><Upload className="w-4 h-4" /> Test Import (20)</Button>
          <Button onClick={() => handleImport(false)} disabled={importing || !conversionDate || processed.matchedCount === 0 || coaLoading} className="gap-1.5 min-w-[200px]">
            {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Upload className="w-4 h-4" /> Import All ({processed.updateList.length + processed.resetList.length})</>}
          </Button>
        </div>
      </div>

      {importing && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card border border-border shadow-xl max-w-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-semibold text-foreground">Updating opening balances...</p>
            <p className="text-xs text-muted-foreground text-center">Please don't navigate away until the import is complete.</p>
            <div className="w-48 h-2 rounded-full bg-muted overflow-hidden mt-1">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
            <span className="text-xs font-medium text-foreground tabular-nums">{progress}%</span>
          </div>
        </div>
      )}

      <OpeningBalanceGenerateDialog
        open={showOpeningDialog}
        onClose={() => setShowOpeningDialog(false)}
        onDone={() => { setOpeningGenerated(true); setShowOpeningDialog(false); }}
      />
    </div>
  );
}