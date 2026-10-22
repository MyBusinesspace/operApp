import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import {
  Upload, Loader2, AlertCircle, Check, FileSpreadsheet, Zap, Lock, Calendar, X,
  BookOpen, Users, Package, Percent, Building2, ArrowLeftRight, FileText, ShoppingCart,
  FileMinus, Box, Scale, HelpCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { analyzeFile, buildContext, TYPE_ORDER, TYPE_LABELS } from "@/lib/quickImport";
import { subscribeRetryState } from "@/lib/sdkRetry";
import { runQuickImport, findContactReviewCases } from "@/lib/quickImportRun";
import { classifyContactTypes } from "@/lib/contactTypeClassifier";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const TYPE_ICON = {
  ChartOfAccount: BookOpen, Contact: Users, Product: Package, TaxRate: Percent,
  BankAccount: Building2, BankTransaction: ArrowLeftRight, GeneralLedger: FileText,
  Invoice: FileText, Bill: ShoppingCart, CreditNote: FileMinus, PaymentsReport: FileText, FixedAsset: Box, TrialBalance: Scale,
};

const num = (n) => (n || 0).toLocaleString("en-AE");

export default function QuickImportDropzone() {
  const [plan, setPlan] = useState([]); // array of plan rows
  const [analyzing, setAnalyzing] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [conversionDate, setConversionDate] = useState(null);
  const [ctxError, setCtxError] = useState(null);
  const [status, setStatus] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importResults, setImportResults] = useState([]);
  const [importError, setImportError] = useState(null);
  const [reconciliation, setReconciliation] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [contactCases, setContactCases] = useState([]); // near-identical names needing a decision
  const [contactDecisions, setContactDecisions] = useState({}); // key -> "merge" | "separate"
  const inputRef = useRef(null);
  const ctxPromiseRef = useRef(null);
  const processingRef = useRef(0);
  const filesRef = useRef(new Map());

  useEffect(() => {
    ctxPromiseRef.current = buildContext();
    let mounted = true;
    ctxPromiseRef.current
      .then((c) => {
        if (!mounted) return;
        setConversionDate(c.conversionDate);
        setCtxError(Object.values(c.preloadErrors || {}).join("; ") || null);
      })
      .catch((e) => { if (mounted) setCtxError(e.message || "Failed to preload data"); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => subscribeRetryState(setRetrying), []);

  const handleFiles = async (fileList) => {
    // FileList is live: clearing the input (or ending a drop event) empties it.
    // Snapshot the File objects before awaiting the shared context.
    const files = Array.from(fileList || []);
    if (!files.length) return;
    processingRef.current++;
    setAnalyzing(true);
    setStatus(`Analysing ${files.length} file(s)...`);
    try {
      if (!ctxPromiseRef.current) ctxPromiseRef.current = buildContext();
      const ctx = await ctxPromiseRef.current;
      setCtxError(Object.values(ctx.preloadErrors || {}).join("; ") || null);
      for (const f of files) {
        filesRef.current.set(f.name, f);
        try {
          const rows = await analyzeFile(f, ctx);
          if (!Array.isArray(rows) || !rows.length) throw new Error("No analysis rows returned for this file.");
          setPlan((prev) => [...prev, ...rows]);
          if (rows.some((r) => r.type === "Contact")) {
            try {
              const cases = await findContactReviewCases(f);
              setContactCases((prev) => [...prev.filter((c) => !cases.some((n) => n.key === c.key)), ...cases]);
            } catch (e) { console.error(e); }
          }
          for (const r of rows) if (r.conversionDate) setConversionDate(r.conversionDate);
        } catch (e) {
          setPlan((prev) => [...prev, { file: f.name, type: null, rows: 0, target: "", counts: {}, hint: `Error: ${e.message || "File analysis failed"}` }]);
        }
      }
    } catch (e) {
      const message = e.message || "Failed to preload data";
      setCtxError(message);
      ctxPromiseRef.current = null;
      setPlan((prev) => [...prev, ...files.map((f) => ({ file: f.name, type: null, rows: 0, target: "", counts: {}, hint: `Error: ${message}` }))]);
    } finally {
      processingRef.current--;
      if (processingRef.current === 0) {
        setAnalyzing(false);
        setStatus(`${files.length} file(s) analysed`);
      }
    }
  };

  const removeFile = (fileName) => setPlan((prev) => prev.filter((r) => r.file !== fileName));
  const [classifyState, setClassifyState] = useState(null);
  const runClassify = async (apply) => {
    setClassifyState({ busy: true });
    try {
      const r = await classifyContactTypes({ apply });
      window.__lastContactTypeChanges = r.changes;
      setClassifyState({ done: true, applied: apply, summary: r.summary, total: r.changes.length });
    } catch (e) { setClassifyState({ error: e.message || "Failed" }); }
  };
  const clearAll = () => { setPlan([]); setContactCases([]); setContactDecisions({}); };

  const handleImportEverything = async () => {
    setShowConfirm(false);
    setImporting(true);
    setImportError(null);
    setImportResults([]);
    setReconciliation(null);
    setImportProgress({ step: 0, total: 0, label: "Starting...", percent: 0 });
    try {
      const { results, reconciliation: recon } = await runQuickImport(plan, filesRef.current, {
        contactDecisions,
        onProgress: (p) => setImportProgress(p),
        onFileResult: (r) => setImportResults((prev) => [...prev, r]),
      });
      setImportResults(results);
      setReconciliation(recon);
    } catch (e) {
      setImportError(e.message || "Import failed");
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  // sort plan by dependency order; unknowns last
  const sortedPlan = [...plan].sort((a, b) => {
    const oa = TYPE_ORDER.indexOf(a.type);
    const ob = TYPE_ORDER.indexOf(b.type);
    if (oa === -1 && ob === -1) return 0;
    if (oa === -1) return 1;
    if (ob === -1) return -1;
    return oa - ob;
  });

  const totalNew = plan.reduce((s, r) => s + (r.counts?.new || 0), 0);
  const totalUpd = plan.reduce((s, r) => s + (r.counts?.updated || 0), 0);
  const totalUnch = plan.reduce((s, r) => s + (r.counts?.unchanged || 0), 0);
  const hasUnknown = plan.some((r) => r.type === null);

  return (
    <Card className="mb-6 border-primary/30 shadow-sm">
      <CardContent className="p-5">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="p-2 rounded-lg bg-primary/10 text-primary"><Zap className="w-4 h-4" /></div>
          <div>
            <h3 className="text-sm font-bold text-foreground">Quick import: drop all your Xero files</h3>
            <p className="text-xs text-muted-foreground">Drop every CSV/XLSX export at once — we detect each file's type and build a read-only plan. Nothing is written yet.</p>
          </div>
        </div>

        {/* Drop zone — label wraps the input so click or programmatic set triggers onChange */}
        <label
          htmlFor="quick-import-input"
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mt-3 block ${
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-accent/30"
          }`}
        >
          <input id="quick-import-input" ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.txt" multiple className="hidden" aria-label="Quick import files" onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
          {analyzing ? (
            <div className="flex flex-col items-center gap-2"><Loader2 className="w-7 h-7 text-primary animate-spin" /><p className="text-xs text-muted-foreground">Detecting & parsing files...</p></div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center"><Upload className="w-5 h-5 text-primary" /></div>
              <div><p className="font-medium text-foreground text-sm">Drop all your Xero files here, or click to browse</p><p className="text-xs text-muted-foreground mt-0.5">CSV or Excel — multiple files at once</p></div>
            </div>
          )}
        </label>

        {/* Status line */}
        {status && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
            {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
            <span className={analyzing ? "" : "text-emerald-700 font-medium"}>{status}</span>
          </div>
        )}

        {/* Rate-limit retry indicator */}
        {retrying && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span className="font-medium">Waiting for the server rate limit, retrying...</span>
          </div>
        )}

        {/* Company types from usage */}
            <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
              <Button size="sm" variant="outline" disabled={classifyState?.busy} onClick={() => runClassify(false)}>Preview company types from usage</Button>
              <Button size="sm" variant="outline" disabled={classifyState?.busy} onClick={() => runClassify(true)}>Apply company types</Button>
              {classifyState?.busy && <span className="text-muted-foreground">Working...</span>}
              {classifyState?.error && <span className="text-destructive">{classifyState.error}</span>}
              {classifyState?.done && <span className="text-muted-foreground">{classifyState.applied ? "Applied" : "Preview"}: {classifyState.total} companies ({classifyState.summary.customers} customers, {classifyState.summary.providers} providers, {classifyState.summary.both} both). Defined types are never overridden.</span>}
            </div>


        {/* Conversion date */}
        {conversionDate && (
          <div className="flex items-center gap-1.5 mt-3 text-xs text-emerald-700">
            <Calendar className="w-3.5 h-3.5" /> Conversion date detected: <span className="font-mono font-medium">{conversionDate}</span>
          </div>
        )}

        {/* Preload error */}
        {ctxError && (
          <div className="flex items-start gap-2 mt-3 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>Could not preload data: {ctxError}. Bank-account detection may not work — try again or use the wizard step.</span>
          </div>
        )}

        {/* Plan table */}
        {plan.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Plan ({plan.length} {plan.length === 1 ? "item" : "items"})</p>
              <button onClick={clearAll} className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"><X className="w-3 h-3" /> Clear</button>
            </div>
            <div className="rounded-lg border border-border overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">File</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Detected type</th>
                    <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Rows</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Target</th>
                    <th className="px-3 py-2 text-center font-semibold text-muted-foreground">New / Upd / Unch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedPlan.map((r, i) => {
                    const Icon = r.type ? TYPE_ICON[r.type] : HelpCircle;
                    return (
                      <tr key={i} className="hover:bg-muted/20 align-top">
                        <td className="px-3 py-2 text-foreground">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate" title={r.file}>{r.file}</span>
                          </div>
                          {r.hint && <p className={`text-xs mt-0.5 ${r.hint.startsWith("Error:") ? "text-destructive" : "text-warning-foreground"}`}>{r.hint}</p>}
                        </td>
                        <td className="px-3 py-2">
                          {r.type ? (
                            <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
                              <Icon className="w-3.5 h-3.5 text-primary shrink-0" /> {TYPE_LABELS[r.type]}
                            </span>
                          ) : r.hint?.startsWith("Error:") ? (
                            <span className="inline-flex items-center gap-1.5 text-destructive font-medium">
                              <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Analysis failed
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-amber-600 font-medium">
                              <HelpCircle className="w-3.5 h-3.5 shrink-0" /> Not recognised
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-foreground">{num(r.rows)}</td>
                        <td className="px-3 py-2 text-muted-foreground">{r.target || "—"}</td>
                        <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">
                          {r.counts && r.type && !r.hint?.startsWith("Error:") ? (
                            <span className="text-[11px]">
                              <span className="text-emerald-600 font-medium">{num(r.counts.new)}</span>
                              {" / "}
                              <span className="text-blue-600 font-medium">{num(r.counts.updated)}</span>
                              {" / "}
                              <span className="text-muted-foreground font-medium">{num(r.counts.unchanged)}</span>
                              {r.counts.duplicates > 0 && <span className="text-amber-600"> · {num(r.counts.duplicates)} dup</span>}
                              {r.counts.preConversion > 0 && <span className="text-orange-600"> · {num(r.counts.preConversion)} pre-conv</span>}
                            </span>
                          ) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
              <span>Totals: <span className="text-emerald-600 font-medium">{num(totalNew)} new</span> · <span className="text-blue-600 font-medium">{num(totalUpd)} updated</span> · <span className="font-medium">{num(totalUnch)} unchanged</span></span>
              {hasUnknown && <span className="text-amber-600">· some files not recognised</span>}
            </div>

            {/* Near-identical company names: the user decides per case */}
            {contactCases.length > 0 && (
              <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50 text-xs">
                <p className="font-semibold text-amber-800 mb-1">Companies with a near-identical name ({contactCases.length})</p>
                <p className="text-amber-700 mb-2">Choose for each one: merge into the existing company (empty fields filled, existing Reference kept) or keep it as a separate company. Undecided ones are skipped.</p>
                <div className="space-y-1.5 max-h-64 overflow-auto">
                  {contactCases.map((c) => (
                    <div key={c.key} className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground">≈ existing:</span>
                      <span className="font-medium">{c.existing}</span>
                      <select
                        className="ml-auto h-7 rounded border bg-background px-2 text-xs"
                        value={contactDecisions[c.key] || ""}
                        onChange={(e) => setContactDecisions((prev) => ({ ...prev, [c.key]: e.target.value }))}
                      >
                        <option value="">Decide...</option>
                        <option value="merge">Merge into existing</option>
                        <option value="separate">Keep separate</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import button */}
            <div className="flex items-center gap-2 mt-3">
              <Button
                onClick={() => setShowConfirm(true)}
                disabled={importing || plan.length === 0 || hasUnknown}
                className="gap-1.5"
              >
                <Zap className="w-3.5 h-3.5" /> Import everything
              </Button>
              <span className="text-xs text-muted-foreground">
                {importing ? "Importing..." : "Runs all importers in dependency order. Mode: Add to existing."}
              </span>
            </div>

            {/* Import progress */}
            {importing && importProgress && (
              <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">
                    Step {importProgress.step}/{importProgress.total}: {importProgress.label}
                  </span>
                  <span className="font-medium text-foreground tabular-nums">{importProgress.percent}%</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${importProgress.percent}%` }} />
                </div>
              </div>
            )}

            {/* Import error */}
            {importError && (
              <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Import stopped:</p>
                  <p>{importError}</p>
                </div>
              </div>
            )}

            {/* Import results */}
            {importResults.length > 0 && !importing && (
              <div className="mt-3 rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Import Results ({importResults.length})
                </div>
                <div className="divide-y divide-border">
                  {importResults.map((r, i) => (
                    <div key={i} className="px-3 py-2 text-xs flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {r.error ? (
                          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        <span className="truncate text-foreground">{r.file}</span>
                        <span className="text-muted-foreground shrink-0">· {TYPE_LABELS[r.type] || r.type}</span>
                      </div>
                      <span className="text-muted-foreground shrink-0 tabular-nums whitespace-nowrap">
                        <span title={(r.rejected || []).join("\n")}>
                          {r.error ? r.error : `${r.new || 0} new / ${r.updated || 0} upd / ${r.unchanged || 0} unch${r.rejected?.length ? ` / ${r.rejected.length} rejected` : ""}`}
                        </span>
                        {r.exceptionsCsv && (
                          <button
                            type="button"
                            className="ml-2 underline text-primary"
                            onClick={() => {
                              const url = URL.createObjectURL(new Blob([r.exceptionsCsv], { type: "text/csv" }));
                              const a = document.createElement("a");
                              a.href = url; a.download = "payment_exceptions.csv"; a.click();
                              URL.revokeObjectURL(url);
                            }}
                          >
                            {r.exceptions || 0} exceptions (CSV)
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {importResults.some(r => r.rejected?.length) && (
                  <div className="px-3 py-2 bg-destructive/5 border-t border-border">
                    <p className="text-xs font-semibold text-destructive mb-1">Rejected documents — no line items</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {importResults.flatMap(r => (r.rejected || []).map((msg, k) => <li key={`${r.file}-${k}`}>· {msg}</li>))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Reconciliation summary */}
            {reconciliation && !importing && (
              <div className="mt-3 p-3 rounded-lg border border-border">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Reconciliation Summary</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className={`p-2 rounded ${reconciliation.tbDiffs?.length === 0 ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
                    GL vs TB: {reconciliation.tbDiffs?.length || 0} {reconciliation.tbDiffs?.length === 1 ? "diff" : "diffs"}
                  </div>
                  <div className={`p-2 rounded ${Math.abs(reconciliation.arDiff || 0) < 0.01 && Math.abs(reconciliation.apDiff || 0) < 0.01 ? "bg-emerald-50 text-emerald-700" : "bg-orange-50 text-orange-700"}`}>
                    AR/AP: {Math.abs(reconciliation.arDiff || 0) < 0.01 && Math.abs(reconciliation.apDiff || 0) < 0.01 ? "Match" : "Diffs"}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Confirm dialog */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Import everything?</AlertDialogTitle>
              <AlertDialogDescription>
                This will run all importers in dependency order (Chart of Accounts → Contacts → Items → Tax Rates → Bank Accounts → Trial Balance → GL → Invoices/Bills → Credit Notes → Bank Transactions → Journal Linker → Reconciliation). Mode is always "Add to existing". Locked records (before 2026-10-01) are skipped except the Opening Balance journal.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-border my-2">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/50 sticky top-0">
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">File</th>
                    <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-center font-semibold text-muted-foreground">New / Upd / Unch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedPlan.filter((r) => r.type && !r.hint?.startsWith("Error:")).map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-foreground truncate max-w-[200px]">{r.file}</td>
                      <td className="px-3 py-2 text-muted-foreground">{TYPE_LABELS[r.type]}</td>
                      <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">
                        <span className="text-emerald-600">{r.counts?.new || 0}</span> / <span className="text-blue-600">{r.counts?.updated || 0}</span> / <span className="text-muted-foreground">{r.counts?.unchanged || 0}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleImportEverything}>
                <Zap className="w-3.5 h-3.5" /> Import everything
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}