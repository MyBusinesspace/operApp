import React, { useState, useEffect, useRef } from "react";
import { downloadCsvTemplate } from "@/lib/readImportFile";
import { motion } from "framer-motion";
import {
  Upload, Check, Loader2, AlertCircle, FileSpreadsheet, RefreshCw,
  ChevronRight, Building2, Landmark, ArrowLeft, Info, Scale, ArrowLeftRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { addDaysISO } from "@/lib/dateOnly";
import {
  parseXeroAccountTransactions, loadExistingDedupCounts, loadExistingTxMap, loadConversionDate,
  loadDocMaps, enrichWithDoc, dedupKey, linkPaymentsToDocs, detectBankAccount,
} from "@/lib/bankTransactionImport";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });


// Conversion boundary = conversion_date + 1 day (inclusive import start)
const convBoundaryFrom = (conversionDate) => {
  if (!conversionDate) return null;
  return addDaysISO(conversionDate, 1);
};

export default function BankTransactionMigrationStep({ onDone, onBack }) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [detectedBank, setDetectedBank] = useState(false);
  const [loadingBanks, setLoadingBanks] = useState(true);
  const [bankError, setBankError] = useState("");
  const [selectedBank, setSelectedBank] = useState(null);
  const [conversionDate, setConversionDate] = useState(null);
  const [file, setFile] = useState(null);
  const [parseResult, setParseResult] = useState(null); // { txRows, closingBalance, headers }
  const [parsing, setParsing] = useState(false);
  const [phase, setPhase] = useState("upload"); // upload | select | preview | result
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  // Load bank accounts + conversion date on mount
  useEffect(() => {
    (async () => {
      try {
        const page = await base44.entities.BankAccount.filter({}, { sort: "-created_date", limit: 500 });
        const arr = page.items || (Array.isArray(page) ? page : []);
        setBankAccounts(arr.filter(a => a.status !== "Archived" && a.status !== "Inactive"));
      } catch (e) {
        setBankError(e.message || "Failed to load bank accounts.");
      }
      try { setConversionDate(await loadConversionDate()); } catch {}
      setLoadingBanks(false);
    })();
  }, []);

  // beforeunload guard during import
  useEffect(() => {
    if (!importing) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [importing]);

  const handleFile = async (f) => {
    setError("");
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
      setError("Please upload a CSV (.csv) or Excel (.xlsx) file"); return;
    }
    setFile(f); setParsing(true);
    try {
      const parsed = await parseXeroAccountTransactions(f);
      if (parsed.txRows.length === 0) {
        setError("No valid transaction rows found. Make sure the file has a 'Date' header row and Debit (AED)/Credit (AED) columns.");
        setFile(null); setParsing(false); return;
      }
      setParseResult(parsed);
      // Auto-detect bank account from the file's A1 title cell
      const { match } = detectBankAccount(parsed.detectedAccountName, bankAccounts);
      if (match) {
        setSelectedBank(match);
        setDetectedBank(true);
        setPhase("preview");
      } else {
        // None or several matches — fall back to the selector
        setSelectedBank(null);
        setDetectedBank(false);
        setPhase("select");
      }
    } catch (e) {
      setError(e.message || "Could not read the file. Make sure it's a valid CSV or Excel file.");
      setFile(null);
    }
    setParsing(false);
  };

  // ── Preview computations ──────────────────────────────────────────────────
  const preview = parseResult ? (() => {
    const { txRows, closingBalance, openingBalance } = parseResult;
    const convBoundary = convBoundaryFrom(conversionDate);
    let totalIn = 0, totalOut = 0, skippedPre = 0, skippedPreNet = 0, importableCount = 0;
    for (const tx of txRows) {
      const net = tx.type === "Receive Money" ? tx.amount : -tx.amount;
      if (convBoundary && tx.date < convBoundary) {
        skippedPre++; skippedPreNet += net; continue;
      }
      totalIn += net > 0 ? net : 0;
      totalOut += net < 0 ? -net : 0;
      importableCount++;
    }
    const net = totalIn - totalOut;
    const expectedClosing = (selectedBank?.opening_balance || 0) + net;
    const closingMatches = closingBalance !== null ? Math.abs(expectedClosing - closingBalance) < 0.01 : null;
    return { totalIn, totalOut, net, expectedClosing, fileClosing: closingBalance, fileOpening: openingBalance, skippedPre, skippedPreNet, importableCount, totalRows: txRows.length, closingMatches };
  })() : null;

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = async (test = false) => {
    if (!parseResult || !selectedBank) return;
    setImporting(true); setError(""); setResult(null); setProgress(0);
    try {
      const { txRows } = parseResult;
      const convBoundary = convBoundaryFrom(conversionDate);

      // 1. Filter pre-conversion rows
      const eligible = convBoundary ? txRows.filter(tx => tx.date >= convBoundary) : txRows;
      const skippedPre = txRows.length - eligible.length;

      // 2. Load doc maps + enrich with source_id/contact
      setProgress(5);
      const docMaps = await loadDocMaps();
      const enriched = eligible.map(tx => enrichWithDoc(tx, docMaps));

      // 3. Load existing dedup counts (multiset) + filter duplicates occurrence-aware.
      //    Repeated identical rows in the file are imported up to the number that
      //    do not already exist; the rest are counted as duplicates. Re-importing
      //    the same file imports 0 (existing counts now equal file counts).
      const existingCounts = await loadExistingDedupCounts(selectedBank.id);
      const buildRecord = (tx) => ({
        bank_account_id: selectedBank.id,
        bank_account_name: selectedBank.name,
        date: tx.date,
        description: tx.description,
        reference: tx.reference,
        type: tx.type,
        amount: tx.amount,
        currency: selectedBank.currency || "AED",
        status: "Reconciled",
        source_type: tx.sourceType,
        source_id: tx.source_id || null,
        source_number: tx.source_number || null,
        contact_id: tx.contact_id || null,
        contact_name: tx.contact_name || null,
        notes: tx.source ? `Xero source: ${tx.source}` : "",
      });
      const fileCounts = new Map();
      for (const tx of enriched) {
        const key = dedupKey(buildRecord(tx));
        fileCounts.set(key, (fileCounts.get(key) || 0) + 1);
      }
      const importCounts = new Map();
      for (const [key, fc] of fileCounts) {
        const ec = existingCounts.get(key) || 0;
        importCounts.set(key, Math.max(0, fc - ec));
      }
      let duplicates = 0;
      const unique = [];
      const duplicateRows = []; // kept for idempotent payment linking on re-import
      const seenInFile = new Map();
      for (const tx of enriched) {
        const record = buildRecord(tx);
        const key = dedupKey(record);
        const imported = seenInFile.get(key) || 0;
        const allowed = importCounts.get(key) || 0;
        if (imported < allowed) {
          seenInFile.set(key, imported + 1);
          unique.push(record);
        } else {
          duplicates++;
          duplicateRows.push(tx);
        }
      }

      // 4. Test mode: first 20 only
      const toCreate = test ? unique.slice(0, 20) : unique;
      const testSkipped = unique.length - toCreate.length;

      // 5. Create BankTransactions (status Reconciled) — NO journal entries
      setProgress(15);
      let created = [];
      const batchSize = 500;
      for (let i = 0; i < toCreate.length; i += batchSize) {
        const batch = toCreate.slice(i, i + batchSize);
        try {
          const res = await base44.entities.BankTransaction.bulkCreate(batch);
          const items = res.items || (Array.isArray(res) ? res : []);
          created = created.concat(items);
        } catch (err) {
          setError(`Batch ${Math.floor(i / batchSize) + 1} failed: ${err.message}`);
        }
        setProgress(15 + Math.round((Math.min(i + batchSize, toCreate.length) / Math.max(toCreate.length, 1)) * 70));
      }

      // 6. Payment linking (Import All only — test mode skips to keep it a pure bank-tx test)
      let linked = 0, unlinked = 0, ambiguous = 0;
      if (!test) {
        setProgress(88);
        try {
          // 6a. Link newly created transactions
          if (created.length > 0) {
            const linkRes = await linkPaymentsToDocs(created, docMaps, selectedBank);
            linked += linkRes.linked;
            unlinked += linkRes.unlinked;
            ambiguous += linkRes.ambiguous;
          }
          // 6b. Link duplicate rows (already-imported transactions) — idempotent re-link.
          //     loadExistingTxMap returns Map<key, record[]> (multiset); dedupe by id so
          //     each existing transaction is linked at most once.
          if (duplicateRows.length > 0) {
            const existingMap = await loadExistingTxMap(selectedBank.id);
            const dupTxs = [];
            const seenIds = new Set();
            for (const tx of duplicateRows) {
              const existing = existingMap.get(dedupKey({ ...tx, bank_account_id: selectedBank.id }));
              if (existing) {
                for (const rec of existing) {
                  if (!seenIds.has(rec.id)) { seenIds.add(rec.id); dupTxs.push(rec); }
                }
              }
            }
            if (dupTxs.length > 0) {
              const linkRes2 = await linkPaymentsToDocs(dupTxs, docMaps, selectedBank);
              linked += linkRes2.linked;
              unlinked += linkRes2.unlinked;
              ambiguous += linkRes2.ambiguous;
            }
          }
        } catch {}
      }

      setProgress(100);
      setResult({
        imported: created.length,
        duplicates,
        skippedPre,
        testSkipped,
        testMode: test,
        linked,
        unlinked,
        ambiguous,
        totalIn: preview.totalIn,
        totalOut: preview.totalOut,
        net: preview.net,
        expectedClosing: preview.expectedClosing,
        fileClosing: preview.fileClosing,
        fileOpening: preview.fileOpening,
        closingMatches: preview.closingMatches,
        bankName: selectedBank.name,
      });

      // Persist import history
      try {
        await base44.entities.ImportRecord.create({
          entity_type: "BankTransaction",
          imported_at: new Date().toISOString(),
          record_count: created.length,
          created_count: created.length,
          updated_count: 0,
          mode: "append",
          file_name: file?.name || "",
          bank_account_id: selectedBank.id,
          bank_account_name: selectedBank.name,
        });
      } catch {}
    } catch (err) {
      setError(err.message || "Import failed");
    }
    setImporting(false);
  };

  const resetToSelect = () => {
    setFile(null); setParseResult(null); setPhase("select"); setResult(null); setError(""); setProgress(0); setDetectedBank(false); setSelectedBank(null);
  };
  const resetToUpload = () => {
    setFile(null); setParseResult(null); setPhase("upload"); setResult(null); setError(""); setProgress(0); setDetectedBank(false); setSelectedBank(null);
  };

  // ── Result screen ──────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="mx-auto text-center">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-foreground">{result.testMode ? "Test Import Complete" : "Import Complete"}</h3>
          <p className="text-muted-foreground mt-1">
            {result.imported} transactions imported to <span className="font-semibold text-foreground">{result.bankName}</span> (Reconciled).
          </p>
          {!result.testMode && (
            <p className="text-xs text-muted-foreground mt-1">
              {result.linked} payments linked · {result.unlinked} unlinked · {result.ambiguous} ambiguous (multiple matches)
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-left max-w-md mx-auto">
            <div className="p-2 rounded bg-muted/40"><span className="text-muted-foreground">Duplicates skipped:</span> <span className="font-medium tabular-nums">{result.duplicates}</span></div>
            <div className="p-2 rounded bg-muted/40"><span className="text-muted-foreground">Pre-conversion skipped:</span> <span className="font-medium tabular-nums">{result.skippedPre}</span></div>
            <div className="p-2 rounded bg-emerald-50"><span className="text-emerald-700">Total in:</span> <span className="font-medium tabular-nums">{num(result.totalIn)}</span></div>
            <div className="p-2 rounded bg-red-50"><span className="text-red-700">Total out:</span> <span className="font-medium tabular-nums">{num(result.totalOut)}</span></div>
            <div className="p-2 rounded bg-blue-50"><span className="text-blue-700">Net:</span> <span className="font-medium tabular-nums">{num(result.net)}</span></div>
            <div className="p-2 rounded bg-muted/40"><span className="text-muted-foreground">Expected closing:</span> <span className="font-medium tabular-nums">{num(result.expectedClosing)}</span></div>
            {result.fileClosing !== null && (
              <div className={`p-2 rounded ${result.closingMatches ? "bg-emerald-50" : "bg-amber-50"}`}>
                <span className={result.closingMatches ? "text-emerald-700" : "text-amber-700"}>File closing:</span>
                <span className="font-medium tabular-nums"> {num(result.fileClosing)}</span>
              </div>
            )}
            {result.fileOpening !== null && result.fileOpening !== 0 && (
              <div className="p-2 rounded bg-cyan-50">
                <span className="text-cyan-700">File opening:</span>
                <span className="font-medium tabular-nums"> {num(result.fileOpening)}</span>
              </div>
            )}
          </div>
          {result.testMode && (
            <p className="text-xs text-amber-600 mt-3 font-medium">Test mode: only the first 20 transactions were imported. No payment linking in test mode. Click "Import Another Bank" to run the full import.</p>
          )}
          {result.fileClosing !== null && !result.closingMatches && (
            <p className="text-xs text-amber-600 mt-2">⚠ Closing balance mismatch: expected {num(result.expectedClosing)} vs file {num(result.fileClosing)}.</p>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <Button variant="outline" onClick={resetToSelect} className="gap-1.5"><RefreshCw className="w-4 h-4" /> Import Another Bank</Button>
            <Button onClick={onDone} className="gap-1.5">Continue <ChevronRight className="w-4 h-4" /></Button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Bank badge (shown in upload & preview) ─────────────────────────────────
  const BankBadge = () => {
    if (!selectedBank) return null;
    return (
    <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-cyan-50 border border-cyan-200">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1.5 rounded-lg bg-cyan-100 text-cyan-600 shrink-0"><Building2 className="w-4 h-4" /></div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{selectedBank.name}</p>
            {detectedBank && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">Detected</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {selectedBank.bank_name || "Bank"}{selectedBank.account_number ? ` · ${selectedBank.account_number}` : ""} · {selectedBank.currency || "AED"}
            {selectedBank.opening_balance ? ` · Opening ${num(selectedBank.opening_balance)}` : ""}
          </p>
        </div>
      </div>
      <button onClick={resetToSelect} className="text-xs text-primary hover:underline shrink-0 ml-2">{detectedBank ? "change" : "Change bank"}</button>
    </div>
    );
  };

  // ── Phase: Select bank ──────────────────────────────────────────────────────
  if (phase === "select") {
    return (
      <div className="mx-auto">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-5">
          <Landmark className="w-10 h-10 mx-auto text-primary mb-3" />
          <h3 className="text-lg font-bold text-foreground">Select a Bank Account</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Import one Xero Account Transactions file per bank. Choose the OPERAPP360 account this file belongs to.
          </p>
        </motion.div>
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
          <Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
          <p><span className="font-semibold">One file per bank.</span> Export each bank account's "Account Transactions" report from Xero (CSV or Excel), then select the matching account here. Only rows from {conversionDate || "the conversion date"} onwards are imported — earlier rows are already in the opening balance.</p>
        </div>
        {loadingBanks ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Loading bank accounts...</p>
          </div>
        ) : bankError ? (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" /> {bankError}
          </div>
        ) : bankAccounts.length === 0 ? (
          <div className="text-center py-10">
            <AlertCircle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No bank accounts found. Import bank accounts first.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
            {bankAccounts.map(ba => (
              <motion.button
                key={ba.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                onClick={() => { setSelectedBank(ba); setDetectedBank(false); setPhase(parseResult ? "preview" : "upload"); }}
                className="p-4 rounded-xl border-2 text-left transition-all hover:border-primary/40 hover:bg-accent/30"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-cyan-50 text-cyan-600 shrink-0"><Building2 className="w-4 h-4" /></div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{ba.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {ba.bank_name || "Bank"}{ba.account_number ? ` · ${ba.account_number}` : ""} · {ba.currency || "AED"}
                    </p>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        )}
        <div className="flex justify-start mt-6"><Button variant="outline" onClick={resetToUpload} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back to upload</Button></div>
      </div>
    );
  }

  // ── Phase: Upload ────────────────────────────────────────────────────────────
  if (phase === "upload") {
    return (
      <div className="mx-auto">
        <BankBadge />
        <div className="flex items-start gap-2.5 mb-5 p-3 rounded-lg bg-primary/5 border border-primary/20 text-xs">
          <FileSpreadsheet className="w-4 h-4 shrink-0 mt-0.5 text-primary" />
          <div>
            <p className="font-semibold text-foreground">Xero "Account Transactions" export</p>
            <p className="text-muted-foreground mt-0.5">Columns detected: Date, Source, Description, Reference, Debit (AED), Credit (AED), Running Balance. Title rows, "Opening Balance", "Total" and "Closing Balance" rows are skipped automatically. CSV or Excel (.xlsx).</p>
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
          <button type="button" onClick={(e) => { e.stopPropagation(); downloadCsvTemplate("bank_transactions_template.csv", ["Date", "Source", "Description", "Reference", "Debit (AED)", "Credit (AED)", "Running Balance"], ["2026-10-05", "Spend Money", "Office rent", "REF-1", "0", "3500.00", "11500.00"]); }} className="mt-3 text-xs font-medium text-primary hover:underline">Download template (CSV)</button>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />
          {parsing ? (
            <div className="flex flex-col items-center gap-3"><Loader2 className="w-8 h-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">Parsing Account Transactions...</p></div>
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
              <div><p className="font-medium text-foreground">Click to upload or drag & drop</p><p className="text-xs text-muted-foreground mt-0.5">Xero Account Transactions CSV or Excel</p></div>
            </div>
          )}
        </div>
        {error && <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}
        <div className="flex justify-start mt-6"><Button variant="outline" onClick={onBack} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button></div>
      </div>
    );
  }

  // ── Phase: Preview ───────────────────────────────────────────────────────────
  const { txRows } = parseResult;

  return (
    <div className="mx-auto">
      <BankBadge />
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-4">
        <Scale className="w-10 h-10 mx-auto text-primary mb-3" />
        <h3 className="text-xl font-bold text-foreground">Preview Account Transactions</h3>
        <p className="text-sm text-muted-foreground mt-1">{preview.totalRows} transaction rows found in <span className="font-medium">{file?.name}</span></p>
      </motion.div>

      {/* Totals summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200">
          <p className="text-xl font-bold text-emerald-600 tabular-nums">{num(preview.totalIn)}</p>
          <p className="text-xs text-muted-foreground">Total in (debits)</p>
        </div>
        <div className="p-3 rounded-lg bg-red-50 border border-red-200">
          <p className="text-xl font-bold text-red-600 tabular-nums">{num(preview.totalOut)}</p>
          <p className="text-xs text-muted-foreground">Total out (credits)</p>
        </div>
        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
          <p className="text-xl font-bold text-blue-600 tabular-nums">{num(preview.net)}</p>
          <p className="text-xs text-muted-foreground">Net movement</p>
        </div>
        <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
          <p className="text-xl font-bold text-primary tabular-nums">{num(preview.expectedClosing)}</p>
          <p className="text-xs text-muted-foreground">Expected closing (opening + net)</p>
        </div>
        <div className={`p-3 rounded-lg border ${preview.closingMatches === null ? "bg-muted/30 border-border" : preview.closingMatches ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"}`}>
          <p className={`text-xl font-bold tabular-nums ${preview.closingMatches === null ? "text-muted-foreground" : preview.closingMatches ? "text-emerald-600" : "text-amber-600"}`}>
            {preview.fileClosing !== null ? num(preview.fileClosing) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">File closing balance {preview.closingMatches === null ? "(not found)" : preview.closingMatches ? "✓ matches" : "⚠ mismatch"}</p>
        </div>
        {preview.fileOpening !== null && (
          <div className="p-3 rounded-lg bg-cyan-50 border border-cyan-200">
            <p className="text-xl font-bold text-cyan-600 tabular-nums">{num(preview.fileOpening)}</p>
            <p className="text-xs text-muted-foreground">File opening balance</p>
          </div>
        )}
        <div className="p-3 rounded-lg bg-orange-50 border border-orange-200">
          <p className="text-xl font-bold text-orange-600 tabular-nums">{preview.skippedPre}</p>
          <p className="text-xs text-muted-foreground">Pre-conversion rows (skipped)</p>
        </div>
      </div>

      {preview.skippedPre > 0 && (
        <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-orange-500" />
          <p><span className="font-semibold">{preview.skippedPre} rows dated before {conversionDate || "conversion date"} will be skipped.</span> Their net is {num(preview.skippedPreNet)} — already in the opening balance.</p>
        </div>
      )}

      {/* Sample rows */}
      <div className="rounded-xl border border-border overflow-hidden mb-6">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Source</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Description</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">Reference</th>
                <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">Amount</th>
                <th className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {txRows.slice(0, 15).map((r, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">{r.date}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate" title={r.source}>{r.source || "—"}</td>
                  <td className="px-3 py-2 text-xs text-foreground max-w-[180px] truncate" title={r.description}>{r.description || "—"}</td>
                  <td className="px-3 py-2 text-xs font-mono text-foreground">{r.reference || "—"}</td>
                  <td className="px-3 py-2 text-xs text-right tabular-nums font-medium">{num(r.amount)}</td>
                  <td className="px-3 py-2 text-center"><span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.type === "Receive Money" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{r.type === "Receive Money" ? "IN" : "OUT"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {txRows.length > 15 && <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground text-center border-t border-border">+ {txRows.length - 15} more rows</div>}
      </div>

      <div className="flex items-start gap-2.5 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-xs">
        <ArrowLeftRight className="w-4 h-4 shrink-0 mt-0.5 text-blue-500" />
        <div className="space-y-1.5">
          <p><span className="font-semibold">Payment linking rules (applied in order):</span></p>
          <ol className="list-decimal list-inside space-y-0.5 ml-1">
            <li><span className="font-medium">Direction</span> — invoices link only to Receive Money, bills only to Spend Money, transfers never link.</li>
            <li><span className="font-medium">Reference first</span> — match the invoice/bill number in the bank Reference field.</li>
            <li><span className="font-medium">Never reuse a claimed bank row</span> — a bank tx already linked to any document is off-limits.</li>
            <li><span className="font-medium">Fallback by contact + amount + date</span> — only among unclaimed candidates of the right direction.</li>
            <li><span className="font-medium">Ambiguous goes to review</span> — nothing is guessed.</li>
          </ol>
          <p className="pt-1">No new payments are created. No journal entries are posted.</p>
        </div>
      </div>

      {importing && (
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-muted-foreground">Importing transactions...</span>
            <span className="font-medium text-foreground">{progress}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <motion.div className="h-full rounded-full bg-primary" animate={{ width: `${progress}%` }} transition={{ duration: 0.3 }} />
          </div>
        </div>
      )}

      {error && <div className="flex items-center gap-2 mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"><AlertCircle className="w-4 h-4 shrink-0" /> {error}</div>}

      <div className="flex gap-3 justify-between">
        <Button variant="outline" onClick={resetToUpload} disabled={importing} className="gap-1.5"><ArrowLeft className="w-4 h-4" /> Back</Button>
        <div className="flex gap-2">
          <Button onClick={() => handleImport(true)} disabled={importing} variant="outline" className="gap-1.5"><Upload className="w-4 h-4" /> Test Import (20)</Button>
          <Button onClick={() => handleImport(false)} disabled={importing} className="gap-1.5 min-w-[200px]">
            {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : <><Upload className="w-4 h-4" /> Import All ({preview.importableCount})</>}
          </Button>
        </div>
      </div>

      {importing && (
        <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 p-6 rounded-xl bg-card border border-border shadow-xl max-w-sm">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm font-semibold text-foreground">Importing transactions...</p>
            <p className="text-xs text-muted-foreground text-center">Creating BankTransactions (Reconciled). No journal entries are posted.</p>
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