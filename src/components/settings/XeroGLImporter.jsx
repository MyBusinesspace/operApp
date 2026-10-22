import React, { useState, useRef, useMemo } from "react";
import { readImportText, isExcelName, isCsvName, downloadCsvTemplate } from "@/lib/readImportFile";
import { motion } from "framer-motion";
import {
  ArrowLeft, Upload, Check, Loader2, AlertCircle, FileText,
  RefreshCw, ChevronRight, Database, AlertTriangle, Link2,
} from "lucide-react";
import { Link } from "react-router-dom";
import UnmatchedAccountsModal from "@/components/settings/UnmatchedAccountsModal";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import moment from "moment";
import { parseImportCsv } from "@/lib/importCsv";
import loadGLAccountMatches from "@/lib/xeroGLAccounts";
import { linkJournalsToDocs } from "@/lib/journalDocLinker";

const parseGLFile = (text) => parseImportCsv(text, (text.split(/\r?\n/)[0] || "").includes("\t") ? "\t" : ",");

// Normalize Xero date "01-Jan-2025" → "2025-01-01"
const normalizeDate = (val) => {
  if (!val) return undefined;
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = moment(s, ["DD-MMM-YYYY", "D-MMM-YYYY", "DD/MM/YYYY", "D/M/YYYY", "YYYY-MM-DD"], true);
  if (m.isValid()) return m.format("YYYY-MM-DD");
  // Manual DD/MM/YYYY parser (accepts / - . separators, day first) — avoids
  // new Date() US-locale MM/DD bias and toISOString() UTC timezone day shift.
  const dmy = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  return s;
};

const parseNum = (val) => {
  if (!val) return 0;
  const n = parseFloat(String(val).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
};

// Group flat GL rows into journal entries keyed by JournalNumber
const groupJournals = (rows) => {
  const map = new Map();
  const order = [];
  for (const row of rows) {
    // Journal Report CSV uses JournalID; GL .txt uses JournalNumber
    let key = row.JournalID || row.journalid || row.JournalNumber || row.journalnumber || "";
    // Fallback: group by Date + Narration if no ID
    if (!key) {
      const date = normalizeDate(row.Date || row.JournalDate || row.date || "");
      const narration = String(row.Narration || row.Description || row.Reference || "").trim();
      key = date && narration ? `${date}||${narration}` : "";
    }
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    map.get(key).push(row);
  }
  return order.map((key) => ({
    journalNumber: key,
    lines: map.get(key),
  }));
};

// ── Component ────────────────────────────────────────────────────────────────
export default function XeroGLImporter({ onBack, onReset }) {
  const [step, setStep] = useState(1); // 1=upload, 2=preview
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null);
  const [journals, setJournals] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [coaByCode, setCoaByCode] = useState({});
  const [coaByName, setCoaByName] = useState({});
  const [existingRefs, setExistingRefs] = useState(new Set());
  const [coaList, setCoaList] = useState([]);
  const [accountMappings, setAccountMappings] = useState({});
  const [showMapper, setShowMapper] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [parsing, setParsing] = useState(false);
  const inputRef = useRef(null);
  const [linking, setLinking] = useState(false);
  const [linkProgress, setLinkProgress] = useState(0);

  // ── Step 1: Handle file upload ──
  const handleFile = async (f) => {
    setError("");
    if (!f) return;
    const name = f.name.toLowerCase();
    if (!name.endsWith(".txt") && !name.endsWith(".csv") && !isExcelName(name)) {
      setError("Please upload a Xero General Ledger .txt, .csv or Excel (.xlsx) file");
      return;
    }
    setFile(f);
    setParsing(true);
    try {
      const text = await readImportText(f);
      const parsed = parseGLFile(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError("The file appears to be empty or has no data rows.");
        setFile(null);
        setParsing(false);
        return;
      }
      // Validate required columns
      const hasJournalNumber = parsed.headers.some((h) => h.toLowerCase().includes("journalnumber") || h.toLowerCase() === "journalid");
      const hasNetAmount = parsed.headers.some((h) => h.toLowerCase().includes("netamount"));
      const hasDebitCredit = parsed.headers.some((h) => h.toLowerCase() === "debit") && parsed.headers.some((h) => h.toLowerCase() === "credit");
      if (!hasJournalNumber || (!hasNetAmount && !hasDebitCredit)) {
        setError("This doesn't look like a Xero General Ledger or Journal Report export. Required: JournalID (or JournalNumber) + NetAmount (or Debit/Credit).");
        setFile(null);
        setParsing(false);
        return;
      }
      setParseResult(parsed);
      const grouped = groupJournals(parsed.rows);
      setJournals(grouped);
      setParsing(false);
      setStep(2);
    } catch {
      setError("Could not read the file. Make sure it's a valid Xero GL .txt export.");
      setFile(null);
      setParsing(false);
    }
  };

  // ── Step 2: Load COA + existing refs for matching/dedup ──
  // Loaded on mount of step 2 via useEffect below
  // Warn user before leaving during import
  React.useEffect(() => {
    if (!importing) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [importing]);

  React.useEffect(() => {
    if (step !== 2) return;
    let mounted = true;
    (async () => {
      try {
        const accounts = await base44.entities.ChartOfAccount.list("code", 10000);
        const initial = Array.isArray(accounts) ? accounts : accounts.items || [];
        const matchedAccounts = await loadGLAccountMatches(journals);
        const arr = [...new Map([...initial, ...matchedAccounts].map(account => [account.id, account])).values()];
        const byCode = {};
        const byName = {};
        arr.forEach((a) => {
          const code = String(a.code || "").trim().toLowerCase();
          if (code) byCode[code] = a;
          const name = String(a.name || "").trim().toLowerCase();
          if (name) byName[name] = a;
        });
        if (mounted) {
          setCoaByCode(byCode);
          setCoaByName(byName);
          setCoaList(arr);
        }
      } catch {}
      // Load ALL existing journal entries imported from Xero (reference starts with XERO-)
      // Paginate through the full set so dedup works even with 29k+ entries
      try {
        const refs = new Set();
        let cursor = undefined;
        do {
          const page = await base44.entities.JournalEntry.filter(
            { reference: { $regex: "^XERO-" } },
            { sort: "-created_date", limit: 5000, fields: ["reference"], cursor }
          );
          const items = page.items || page;
          items.forEach((j) => { if (j.reference) refs.add(j.reference); });
          cursor = page.has_more ? page.next_cursor : undefined;
        } while (cursor && mounted);
        if (mounted) setExistingRefs(refs);
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, [step]);

  // ── COA by id lookup (for manual account mappings) ──
  const coaById = useMemo(() => {
    const m = {};
    coaList.forEach((a) => { m[a.id] = a; });
    return m;
  }, [coaList]);

  // ── Unique unmatched accounts (auto-match only, ignores manual mappings) ──
  // Includes both code-based and name-only accounts (Xero bank accounts often have no code)
  const unmatchedAccountsList = useMemo(() => {
    const seen = new Map();
    for (const jg of journals) {
      for (const row of jg.lines) {
        const code = String(row.AccountCode || row.accountcode || "").trim();
        const name = String(row.AccountName || row.Account || row.accountname || row.account || "").trim();
        if (!code && !name) continue;
        const autoMatched =
          (code && coaByCode[code.toLowerCase()]) ||
          (name && coaByName[name.toLowerCase()]);
        if (autoMatched) continue;
        // Use code as key, fall back to name for codeless accounts
        const key = code || name;
        if (!seen.has(key)) {
          seen.set(key, {
            key,
            code: code || "(no code)",
            name,
            type: String(row.AccountType || row.accounttype || "").trim(),
            lineCount: 0,
          });
        }
        seen.get(key).lineCount++;
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      (a.code || "").localeCompare(b.code || "")
    );
  }, [journals, coaByCode, coaByName]);

  // ── Build journal entry records from grouped data ──
  const builtJournals = useMemo(() => {
    return journals.map((jg) => {
      const firstRow = jg.lines[0] || {};
      const date = normalizeDate(firstRow.Date || firstRow.date || firstRow.JournalDate || firstRow.journaldate);
      const narration = String(
        jg.lines.find(r => String(r.Narration || r.narration || "").trim())?.Narration ||
        jg.lines.find(r => String(r.narration || "").trim())?.narration ||
        jg.lines.find(r => String(r.Description || "").trim())?.Description ||
        jg.lines.find(r => String(r.Reference || "").trim())?.Reference ||
        `Xero Journal ${jg.journalNumber}`
      ).trim();
      const reference = `XERO-${jg.journalNumber}`;

      const lines = jg.lines.map((row) => {
        const netAmount = parseNum(row.NetAmount || row.netamount);
        const debitAmount = parseNum(row.Debit || row.debit);
        const creditAmount = parseNum(row.Credit || row.credit);
        const gstAmount = parseNum(row.GSTAmount || row.gstamount);
        const accountCode = String(row.AccountCode || row.accountcode || "").trim();
        const accountName = String(row.AccountName || row.Account || row.accountname || row.account || "").trim();
        const description = String(row.Description || row.Narration || row.description || "").trim();
        const taxCode = String(row.TaxCode || row.taxcode || "").trim();

        // Match account by manual mapping first, then by code, then by name
        const mapKey = accountCode || accountName;
        const mappedId = mapKey ? accountMappings[mapKey] : null;
        const matchedAccount = mappedId
          ? coaById[mappedId]
          : (coaByCode[accountCode.toLowerCase()] ||
            (accountName ? coaByName[accountName.toLowerCase()] : null));

        // Use Debit/Credit columns if present (Journal Report CSV), else derive from NetAmount (GL .txt)
        const debit = debitAmount > 0 ? Math.round(debitAmount * 100) / 100 : (netAmount > 0 ? Math.round(netAmount * 100) / 100 : 0);
        const credit = creditAmount > 0 ? Math.round(creditAmount * 100) / 100 : (netAmount < 0 ? Math.round(Math.abs(netAmount) * 100) / 100 : 0);

        return {
          account_code: accountCode,
          account_name: accountName,
          account_id: matchedAccount?.id || undefined,
          description: description || undefined,
          debit,
          credit,
          tax_amount: gstAmount || undefined,
        };
      });

      const totalDebit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
      const totalCredit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
      const unmatchedCount = lines.filter((l) => !l.account_id).length;
      const alreadyImported = existingRefs.has(reference);

      return {
        journalNumber: jg.journalNumber,
        date,
        narration,
        reference,
        lines,
        total_debit: totalDebit,
        total_credit: totalCredit,
        unmatched_count: unmatchedCount,
        already_imported: alreadyImported,
        balanced: Math.abs(totalDebit - totalCredit) < 0.01,
      };
    });
  }, [journals, coaByCode, coaByName, existingRefs, accountMappings, coaById]);

  // ── Import handler ──
  const handleImport = async (test = false) => {
    setImporting(true);
    setError("");
    setResult(null);
    try {
      const selected = test ? builtJournals.slice(0, 20) : builtJournals;
      const allToImport = selected.filter((j) => !j.already_imported);
      const toImport = allToImport;
      let imported = 0;
      let skipped = 0;
      const failed = [];
      // Track refs created during this run to prevent duplicates within the same batch
      const seenInRun = new Set();
      const savedReferences = new Set();

      // ── Bulk import: 500 entries per batch ──
      // One reserveSequenceNumbers call + one bulkCreate per batch = ~2 API calls per 500 entries
      // vs 2 calls per 1 entry in the old loop → ~500x fewer API calls
      const batchSize = 500;
      const totalBatches = Math.ceil(toImport.length / batchSize);

      for (let bi = 0; bi < totalBatches; bi++) {
        const batchStart = bi * batchSize;
        const batchEnd = Math.min(batchStart + batchSize, toImport.length);
        const batch = toImport.slice(batchStart, batchEnd);

        // Filter out duplicates within the same run
        const uniqueBatch = [];
        for (const j of batch) {
          if (seenInRun.has(j.reference)) {
            skipped++;
          } else if (j.unmatched_count > 0) {
            failed.push(`Journal ${j.journalNumber}: review and map or create the missing accounts before importing. No unlinked journal was saved.`);
          } else {
            seenInRun.add(j.reference);
            uniqueBatch.push(j);
          }
        }

        if (uniqueBatch.length > 0) {
          try {
            // Reserve JNL numbers for the entire batch in one call
            const seqRes = await base44.functions.invoke("reserveSequenceNumbers", {
              sequence_type: "JNL",
              count: uniqueBatch.length,
            });
            const numbers = seqRes.data?.numbers || seqRes.numbers || [];

            // Build records for bulkCreate
            const records = uniqueBatch.map((j, idx) => ({
              number: numbers[idx] || `JNL-${String(Date.now())}-${idx}`,
              date: j.date,
              narration: j.narration,
              reference: j.reference,
              source_type: "Manual",
              status: "Posted",
              posted_date: j.date,
              lines: j.lines,
              total_debit: j.total_debit,
              total_credit: j.total_credit,
            }));

            await base44.entities.JournalEntry.bulkCreate(records);
            records.forEach((r) => savedReferences.add(r.reference));
            imported += records.length;
          } catch (err) {
            // Batch failed — log each entry so user knows which ones to retry
            uniqueBatch.forEach((j) => {
              failed.push(`Journal ${j.journalNumber}: ${err.message}`);
            });
          }
        }
        setProgress(Math.round((batchEnd / toImport.length) * 100));
      }

      skipped += selected.length - toImport.length;
      setExistingRefs(previous => new Set([...previous, ...savedReferences]));
      try {
        await base44.entities.ImportRecord.create({
          entity_type: "XeroGL",
          imported_at: new Date().toISOString(),
          record_count: imported,
          created_count: imported,
          updated_count: 0,
          mode: "append",
          file_name: file?.name || "",
        });
      } catch {}

      // Link journals to documents (idempotent — updates link fields only)
      let linkResult = null;
      setLinking(true);
      setLinkProgress(0);
      try {
        linkResult = await linkJournalsToDocs({ onProgress: setLinkProgress });
      } catch (e) {
        linkResult = { error: e.message || "Linking failed" };
      }
      setLinking(false);
      setResult({ imported, skipped, failed, total: selected.length, testMode: test, linkResult });
      // Rebuild stored account balances after GL import (non-fatal)
      try { await base44.functions.invoke("rebuildAccountBalances", {}); } catch {}
    } catch (err) {
      setError(err.message || "Import failed");
    }
    setImporting(false);
  };

  // ── Result screen ──
  if (result) {
    return (
    <div className="mx-auto text-center">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-xl font-bold text-foreground">{result.testMode ? "GL Test Import Complete" : "GL Import Complete"}</h2>
        <p className="text-muted-foreground mt-1">
          {result.imported} of {result.total} journal entries imported successfully.
        </p>
        {result.testMode && (
          <p className="text-xs text-amber-600 mt-1 font-medium">
            Test mode: only the first 20 entries were imported. Click "Import More" to import all entries.
          </p>
        )}
        {result.skipped > 0 && (
          <p className="text-sm text-amber-600 mt-1">
            {result.skipped} already imported (skipped to avoid duplicates).
          </p>
        )}
        {result.failed.length > 0 && (
          <div className="mt-4 p-4 rounded-lg bg-destructive/10 text-destructive text-sm text-left max-h-40 overflow-y-auto">
            <p className="font-medium mb-1">{result.failed.length} entries had errors:</p>
            {result.failed.map((f, i) => (
              <p key={i} className="text-xs opacity-80">{f}</p>
            ))}
          </div>
        )}
        {result.linkResult && !result.linkResult.error && (
          <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/20 text-left">
            <p className="font-medium text-sm text-foreground mb-1">Journal-to-Document Linking</p>
            <p className="text-xs text-muted-foreground">
              {result.linkResult.linked} linked · {result.linkResult.alreadyLinked} already linked · {result.linkResult.ambiguous} ambiguous · {result.linkResult.unmatched} unmatched
            </p>
            {result.linkResult.ambiguous > 0 && (
              <p className="text-xs text-amber-600 mt-1">{result.linkResult.ambiguous} journals had multiple matches — review them in Reconciliation (step 11).</p>
            )}
          </div>
        )}
        {result.linkResult?.error && (
          <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs text-left">
            Journal linking failed: {result.linkResult.error}. You can retry from Reconciliation (step 11).
          </div>
        )}
        <div className="flex gap-3 justify-center mt-6">
          <Button onClick={onReset} variant="outline" className="gap-1.5">
            <RefreshCw className="w-4 h-4" /> Import More
          </Button>
          <Link to="/accounting/journal-entries">
            <Button className="gap-1.5">
              View Journal Entries <ChevronRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
  }

  // ── Step 1: Upload ──
  if (step === 1) {
    return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-6">
        <Database className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Upload Xero General Ledger</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Export from Xero: <span className="font-medium">Accounting → Export accounting data → Xero General Ledger (.txt or Journal Report .csv)</span>
        </p>
      </motion.div>

      <div className="flex items-start gap-2.5 mb-6 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
        <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <div>
          <p className="font-semibold mb-1">How it works</p>
          <p>The GL file (Xero General Ledger .txt or Journal Report CSV) contains all journal lines grouped by JournalNumber. Each group becomes one journal entry with multiple debit/credit lines. Accounts are matched by code to your Chart of Accounts.</p>
          <p className="mt-1 font-medium">Tip: Import your Chart of Accounts first so account codes match.</p>
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
        <button type="button" onClick={(e) => { e.stopPropagation(); downloadCsvTemplate("general_ledger_template.csv", ["JournalID", "Date", "Reference", "Narration", "SourceType", "AccountCode", "AccountName", "Description", "Debit", "Credit"], ["1001", "2026-10-05", "REF-1", "Rent October", "Manual", "430", "Rent", "Rent October", "3500.00", "0"]); }} className="mt-3 text-xs font-medium text-primary hover:underline">Download template (CSV)</button>
                <input ref={inputRef} type="file" accept=".txt,.csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
        {parsing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Parsing GL file...</p>
          </div>
        ) : file ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
            <button
              onClick={(e) => { e.stopPropagation(); setFile(null); setParseResult(null); }}
              className="text-xs text-primary hover:underline mt-1"
            >
              Remove & choose another
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-foreground">Click to upload or drag & drop</p>
              <p className="text-xs text-muted-foreground mt-0.5">Xero GL .txt or Journal Report .csv</p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex justify-start mt-6">
        <Button variant="outline" onClick={onBack} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
      </div>
    </div>
  );
  }

  // ── Step 2: Preview & Import ──
  const newJournals = builtJournals.filter((j) => !j.already_imported);
  const skippedCount = builtJournals.length - newJournals.length;
  const unmatchedAccounts = newJournals.filter((j) => j.unmatched_count > 0).length;
  const unbalanced = newJournals.filter((j) => !j.balanced).length;

  // Import safety checks: export range, journal-number gaps, file totals
  const fileChecks = (() => {
    const today = moment().format("YYYY-MM-DD");
    const dates = builtJournals.map((j) => j.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const maxDate = dates[dates.length - 1] || "";
    const ids = builtJournals.map((j) => String(j.journalNumber)).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
    const have = new Set(ids);
    const gaps = [];
    if (ids.length > 1) {
      for (let k = ids[0]; k <= ids[ids.length - 1]; k++) {
        if (!have.has(k) && !existingRefs.has(`XERO-${k}`)) gaps.push(k);
      }
    }
    const debit = Math.round(builtJournals.reduce((s, j) => s + j.total_debit, 0) * 100) / 100;
    const credit = Math.round(builtJournals.reduce((s, j) => s + j.total_credit, 0) * 100) / 100;
    return { count: builtJournals.length, maxDate, endsBeforeFuture: !!maxDate && maxDate <= today, gapCount: gaps.length, gapSample: gaps.slice(0, 12), debit, credit };
  })();

  return (
    <div className="mx-auto">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
        <FileText className="w-10 h-10 mx-auto text-primary mb-3" />
        <h2 className="text-xl font-bold text-foreground">Preview General Ledger</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {builtJournals.length} journal entries found in <span className="font-medium">{file?.name}</span>
        </p>
      </motion.div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-2xl font-bold text-primary tabular-nums">{newJournals.length}</p>
          <p className="text-xs text-muted-foreground">New entries</p>
        </div>
        {skippedCount > 0 && (
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-2xl font-bold text-amber-600 tabular-nums">{skippedCount}</p>
            <p className="text-xs text-muted-foreground">Already imported</p>
          </div>
        )}
        {unmatchedAccounts > 0 && (
          <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
            <p className="text-2xl font-bold text-orange-600 tabular-nums">{unmatchedAccounts}</p>
            <p className="text-xs text-muted-foreground">Unmatched accounts</p>
          </div>
        )}
        {unbalanced > 0 && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200">
            <p className="text-2xl font-bold text-red-600 tabular-nums">{unbalanced}</p>
            <p className="text-xs text-muted-foreground">Unbalanced</p>
          </div>
        )}
      </div>

      {builtJournals.length > 0 && (
        <div className={`mb-4 p-3 rounded-lg border text-xs ${fileChecks.endsBeforeFuture || fileChecks.gapCount > 0 ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-muted/40 border-border text-muted-foreground"}`}>
          <p className="font-semibold mb-1">Import checks</p>
          <p>File: {fileChecks.count} journals, debits {fileChecks.debit.toLocaleString()} / credits {fileChecks.credit.toLocaleString()}. Compare these totals with the footer of the Xero Journal Report before importing.</p>
          <p>Latest journal date in file: {fileChecks.maxDate || "unknown"}.{fileChecks.endsBeforeFuture ? " This is on or before today. Xero journals dated in the future are cut off when the export range ends today. Re-export with an end date well in the future (e.g. 31 Dec 2030) so none are missing." : ""}</p>
          {fileChecks.gapCount > 0 && (
            <p>{fileChecks.gapCount} journal numbers between the first and last number in the file are in neither the file nor Operapp (e.g. {fileChecks.gapSample.join(", ")}). Some Xero numbers are never used for journals, but check that nothing was skipped.</p>
          )}
        </div>
      )}

      {unmatchedAccounts > 0 && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
          <p>
            <span className="font-semibold">{unmatchedAccounts} entries have account codes not found in your Chart of Accounts.</span>{" "}
            Accounts are matched by code first, then by the Account name, including Chart of Accounts records with no code. Use Review & Map to create any missing accounts or select an existing account. Journals with unresolved accounts will not be saved.
          </p>
        </div>
      )}

      {unmatchedAccountsList.length > 0 && (
        <button
          onClick={() => setShowMapper(true)}
          className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" /> Review & Map {unmatchedAccountsList.length} Unmatched Accounts
        </button>
      )}

      {/* Preview table — first 15 entries */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Xero JN</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Narration</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Lines</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Debit</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Credit</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {builtJournals.slice(0, 15).map((j, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs font-mono text-foreground">{j.journalNumber}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{j.date || "—"}</td>
                  <td className="px-3 py-2 text-xs text-foreground max-w-[280px] truncate" title={j.narration}>{j.narration}</td>
                  <td className="px-3 py-2 text-xs text-center tabular-nums">{j.lines.length}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{j.total_debit.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums">{j.total_credit.toLocaleString()}</td>
                  <td className="px-3 py-2 text-center">
                    {j.already_imported ? (
                      <span className="text-[10px] text-amber-600 font-medium">Skip (exists)</span>
                    ) : j.unmatched_count > 0 ? (
                      <span className="text-[10px] text-orange-600 font-medium">{j.unmatched_count} unmatched</span>
                    ) : !j.balanced ? (
                      <span className="text-[10px] text-red-600 font-medium">Unbalanced</span>
                    ) : (
                      <Check className="w-3.5 h-3.5 text-emerald-500 inline" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {builtJournals.length > 15 && (
          <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center border-t border-border">
            + {builtJournals.length - 15} more entries
          </div>
        )}
      </div>

      {importing && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">Importing journal entries...</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
        </div>
      )}

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={() => { setStep(1); setFile(null); setParseResult(null); }} disabled={importing} className="gap-1.5">
          <ArrowLeft className="w-4 h-4" /> Back
        </Button>
        <div className="flex gap-2">
          <Button onClick={() => handleImport(true)} disabled={importing || newJournals.length === 0}
            variant="outline" className="gap-1.5">
            <Upload className="w-4 h-4" /> Test Import (20)
          </Button>
          <Button onClick={() => handleImport(false)} disabled={importing || newJournals.length === 0}
            className="gap-1.5 min-w-[200px]">
            {importing ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</>
            ) : (
              <><Upload className="w-4 h-4" /> Import All {newJournals.length} Entries</>
            )}
          </Button>
        </div>
      </div>

      {/* Full-page overlay during import — prevents navigation away */}
      {importing && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card border border-border shadow-xl max-w-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-semibold text-foreground">{linking ? "Linking journals to documents..." : "Importing journal entries..."}</p>
            <p className="text-xs text-muted-foreground text-center">{linking ? "Matching journals to invoices, bills and credit notes." : "Please don't navigate away or close this page until the import is complete."}</p>
            <div className="w-48 h-2 rounded-full bg-muted overflow-hidden mt-1">
              <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${linking ? linkProgress : progress}%` }} />
            </div>
            <span className="text-xs font-medium text-foreground tabular-nums">{linking ? linkProgress : progress}%</span>
          </div>
        </div>
      )}

      {showMapper && unmatchedAccountsList.length > 0 && (
        <UnmatchedAccountsModal
          unmatchedAccounts={unmatchedAccountsList}
          coaList={coaList}
          mappings={accountMappings}
          onChangeMapping={(code, coaId) => setAccountMappings((prev) => ({ ...prev, [code]: coaId }))}
          onClose={() => setShowMapper(false)}
          onAccountsCreated={async () => {
            try {
              const accounts = await base44.entities.ChartOfAccount.list("code", 10000);
              const initial = Array.isArray(accounts) ? accounts : accounts.items || [];
        const matchedAccounts = await loadGLAccountMatches(journals);
        const arr = [...new Map([...initial, ...matchedAccounts].map(account => [account.id, account])).values()];
              const byCode = {}, byName = {};
              arr.forEach((a) => {
                const code = String(a.code || "").trim().toLowerCase();
                if (code) byCode[code] = a;
                const name = String(a.name || "").trim().toLowerCase();
                if (name) byName[name] = a;
              });
              setCoaByCode(byCode);
              setCoaByName(byName);
              setCoaList(arr);
            } catch {}
          }}
        />
      )}
    </div>
  );
}