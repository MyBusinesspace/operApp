import React from "react";
import { motion } from "framer-motion";
import {
  FolderTree, Folder, FileText, Users, FolderKanban, Wrench,
  ClipboardList, UserCheck, Cloud, CheckCircle2, Loader2, Upload,
  HardDrive, RefreshCw, AlertCircle, Clock, XCircle, RotateCcw,
  Building2, Package, Briefcase, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGoogleDriveExport } from "@/lib/GoogleDriveExportContext";

const STAGES = [
  { key: "init", label: "Initialize", icon: Cloud, desc: "Create modular folder structure" },
  { key: "organization", label: "Organization", icon: Building2, desc: "Organization files" },
  { key: "business", label: "Business", icon: Briefcase, desc: "Companies, Projects & Assets — files per entity" },
  { key: "operations", label: "Operations", icon: Wrench, desc: "Working Report PDFs & Task photos — per task, by year" },
];

const DISABLED_STAGES = [
  { label: "HR", icon: UserCheck, desc: "Employees, Time Sheets & Payroll — available after Phase 2" },
  { label: "Sales", icon: FileText, desc: "Quotes & Invoices — available after Phase 2" },
  { label: "Purchases", icon: Package, desc: "Purchase Orders, Bills & Petty Cash — available after Phase 2" },
];

function StructureTree() {
  const rows = [
    { icon: Folder, name: "OPERAPP_Files/", indent: 0, bold: true },
    { icon: Folder, name: "Organization/", indent: 1 },
    { icon: FileText, name: "└─ (org files)", indent: 2, muted: true },
    { icon: Folder, name: "Business/", indent: 1 },
    { icon: Folder, name: "├─ Companies/", indent: 2 },
    { icon: Folder, name: "│  └─ [Company Name]/", indent: 3 },
    { icon: FileText, name: "│     └─ (company files)", indent: 4, muted: true },
    { icon: Folder, name: "├─ Projects/", indent: 2 },
    { icon: Folder, name: "│  └─ [Project Name]/", indent: 3 },
    { icon: FileText, name: "│     └─ (project files)", indent: 4, muted: true },
    { icon: Folder, name: "└─ Assets/", indent: 2 },
    { icon: Folder, name: "   └─ [Asset Name]/", indent: 3 },
    { icon: FileText, name: "      └─ (asset files)", indent: 4, muted: true },
    { icon: Folder, name: "Operations/", indent: 1 },
    { icon: Folder, name: "└─ [YYYY]/", indent: 2 },
    { icon: Folder, name: "   └─ Tasks/", indent: 3 },
    { icon: Folder, name: "      └─ [Client - Ref - Title]/", indent: 4 },
    { icon: FileText, name: "         ├─ (task photos)", indent: 5, muted: true },
    { icon: FileText, name: "         └─ (WR PDFs)", indent: 5, muted: true },
    { icon: Folder, name: "HR/", indent: 1 },
    { icon: Folder, name: "├─ Time Sheets/", indent: 2 },
    { icon: Folder, name: "├─ Employees/", indent: 2 },
    { icon: Folder, name: "│  └─ [Employee Name]/", indent: 3 },
    { icon: FileText, name: "│     └─ (employee documents)", indent: 4, muted: true },
    { icon: Folder, name: "├─ Leaves/", indent: 2 },
    { icon: Folder, name: "└─ Payroll/", indent: 2 },
    { icon: Folder, name: "Sales/", indent: 1 },
    { icon: Folder, name: "├─ Quotes/", indent: 2 },
    { icon: Folder, name: "└─ Invoices/", indent: 2 },
    { icon: Folder, name: "Purchases/", indent: 1 },
    { icon: Folder, name: "├─ Purchase Orders/", indent: 2 },
    { icon: Folder, name: "├─ Bills/", indent: 2 },
    { icon: Folder, name: "└─ Petty Cash/", indent: 2 },
  ];

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4 font-mono text-xs space-y-0.5 max-h-[420px] overflow-y-auto">
      {rows.map((r, i) => (
        <div
          key={i}
          className={`flex items-center gap-1.5 ${r.bold ? "font-semibold text-foreground" : r.muted ? "text-muted-foreground" : "text-foreground"}`}
          style={{ paddingLeft: `${r.indent * 14}px` }}
        >
          <r.icon className={`w-3.5 h-3.5 shrink-0 ${r.muted ? "text-muted-foreground/60" : "text-primary"}`} />
          <span>{r.name}</span>
        </div>
      ))}
    </div>
  );
}

function StageProgress() {
  const {
    stageIndex, stageData, docCounts, refreshingStage, stageResults,
    checkpoints, phase, currentItem, totalUploaded, totalSkipped,
    refreshStage, restartStage,
  } = useGoogleDriveExport();

  return (
    <div className="space-y-2">
      {STAGES.map((stage, i) => {
        const isDone = stageIndex > i || (stageIndex === i && stageData[stage.key]?.done);
        const isActive = stageIndex === i && !stageData[stage.key]?.done;
        const isPending = stageIndex < i;
        const data = stageData[stage.key];
        const isRefreshing = refreshingStage === stage.key;
        const canRefresh = stage.key !== "init" && !isRefreshing;
        const result = stageResults[stage.key];

        return (
          <div
            key={stage.key}
            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all ${
              isRefreshing ? "border-primary bg-primary/10"
              : isActive ? "border-primary bg-primary/5"
              : isDone ? "border-emerald-200 bg-emerald-50/50"
              : "border-border bg-muted/20"
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
              isRefreshing ? "bg-primary/10 text-primary"
              : isDone ? "bg-emerald-100 text-emerald-600"
              : isActive ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
            }`}>
              {isRefreshing ? <Loader2 className="w-4 h-4 animate-spin" />
              : isDone ? <CheckCircle2 className="w-4 h-4" />
              : isActive ? <Loader2 className="w-4 h-4 animate-spin" />
              : <stage.icon className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${isPending ? "text-muted-foreground" : "text-foreground"}`}>
                {stage.label}
              </p>
              <p className="text-xs text-muted-foreground truncate">{stage.desc}</p>
            </div>
            <div className="text-right shrink-0 min-w-[180px] px-1">
              {data && (
                <>
                  <p className="text-sm font-bold text-emerald-600">{data.uploaded} uploaded</p>
                  {data.skipped > 0 && <p className="text-xs text-muted-foreground">{data.skipped} skipped</p>}
                </>
              )}
              {docCounts?.[stage.key] > 0 && (
                <p className="text-xs text-muted-foreground/70">{docCounts[stage.key]} docs in app</p>
              )}
              {result ? (
                <>
                  <p className={`text-lg font-bold leading-tight ${result.error ? "text-destructive" : result.inProgress ? "text-primary" : "text-emerald-600"}`}>
                    {result.error ? "Failed" : result.inProgress ? `Uploading… ${result.uploaded}${result.resumed ? " (resumed)" : ""}` : `+${result.uploaded} uploaded${result.resumed ? " (resumed)" : ""}`}
                  </p>
                  {result.inProgress && result.currentItem && (
                    <p className="text-xs text-muted-foreground truncate max-w-[180px] ml-auto" title={result.currentItem}>
                      → {result.currentItem}
                    </p>
                  )}
                </>
              ) : isActive && phase !== "idle" ? (
                <>
                  <p className={`text-lg font-bold leading-tight ${phase === "failed" ? "text-destructive" : phase === "completed" ? "text-emerald-600" : "text-primary"}`}>
                    {phase === "initializing" ? "Initializing folders..."
                    : phase === "uploading" ? `${totalUploaded + totalSkipped} / ${docCounts?.total || 0}`
                    : phase === "completed" ? `Done: ${totalUploaded + totalSkipped}/${docCounts?.total || 0}${(data?.skipped || 0) > 0 ? ` (${data.skipped} skipped)` : ""}`
                    : phase === "failed" ? "Failed"
                    : ""}
                  </p>
                  {phase === "uploading" && (
                    <p className="text-xs font-medium text-primary/80">Uploading…</p>
                  )}
                  {phase === "uploading" && currentItem && (
                    <p className="text-xs text-muted-foreground truncate max-w-[180px] ml-auto" title={currentItem}>
                      → {currentItem}
                    </p>
                  )}
                </>
              ) : null}
              {checkpoints?.[stage.key] && !result && (
                <p className="text-[10px] font-medium text-amber-600">Checkpoint at batch {Math.floor(checkpoints[stage.key] / 5) + 1}</p>
              )}
            </div>
            {canRefresh && (
              <div className="flex items-center gap-1 shrink-0">
                {checkpoints?.[stage.key] && !isRefreshing && (
                  <button
                    onClick={() => restartStage(stage.key)}
                    disabled={refreshingStage !== null}
                    title="Restart from beginning"
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  onClick={() => refreshStage(stage.key)}
                  disabled={refreshingStage !== null}
                  title={`Export only ${stage.label} to Google Drive`}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* Disabled stages — Phase 1 not yet active */}
      <div className="pt-2 mt-2 border-t border-border">
        <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide mb-1.5 px-1">Coming Soon</p>
        {DISABLED_STAGES.map((stage, i) => (
          <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg border border-dashed border-border bg-muted/10 opacity-50">
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 bg-muted text-muted-foreground">
              <stage.icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-muted-foreground">{stage.label}</p>
              <p className="text-xs text-muted-foreground/70 truncate">{stage.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DataExportCenter() {
  const {
    exporting, error, lastRun, runHistory, totalExported, docCounts,
    totalUploaded, totalSkipped, lastUpdate, currentOffset, phase,
    cleaningUp, cleanupResult, stageIndex,
    runExport, cancelExport, cleanupOldFolders,
  } = useGoogleDriveExport();

  const formatDate = (iso) => {
    if (!iso) return "—";
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
            <HardDrive className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Data Export Center</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Export your data to Google Drive with a flat, modular folder structure
            </p>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <Cloud className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Google Drive</p>
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Connected
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Total files exported</p>
                  <p className="text-lg font-bold text-foreground">{totalExported}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <FolderTree className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Folder Structure</h3>
              </div>
              <StructureTree />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  The export creates a flat modular folder structure in your Google Drive and uploads all documents.
                  Each module is independent — files already uploaded are skipped, so you can re-run anytime to sync new documents.
                </p>
              </div>
              {exporting && (() => {
                const secsAgo = lastUpdate ? Math.floor((Date.now() - new Date(lastUpdate).getTime()) / 1000) : null;
                const isStale = secsAgo !== null && secsAgo > 60;
                return (
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-muted-foreground">
                        {phase === "initializing" ? "Initializing folders..."
                        : phase === "uploading" ? "Uploading…"
                        : phase === "completed" ? "Completed"
                        : phase === "failed" ? "Failed"
                        : `${STAGES[stageIndex]?.label || "Finalizing"}… (batch ${currentOffset})`}
                      </span>
                      <span className="text-xl font-bold text-primary tabular-nums">
                        {totalUploaded + totalSkipped} / {docCounts.total || 0}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                        style={{ width: `${docCounts.total ? Math.min((totalUploaded / docCounts.total) * 100, 100) : Math.min(Math.round(((stageIndex + 1) / STAGES.length) * 100), 100)}%` }}
                      />
                    </div>
                    {secsAgo !== null && (
                      <p className={`text-[10px] mt-1.5 ${isStale ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>
                        {isStale
                          ? `⚠ No updates for ${secsAgo}s — process may be stuck. Cancel & restart.`
                          : `Last update: ${secsAgo}s ago`
                        }
                      </p>
                    )}
                  </div>
                );
              })()}
              <div className="flex gap-2">
                <Button
                  onClick={runExport}
                  disabled={exporting || cleaningUp}
                  className="flex-1 gap-2 h-11"
                  size="lg"
                >
                  {exporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Exporting...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Run Export to Google Drive</>
                  )}
                </Button>
                {exporting && (
                  <Button
                    onClick={cancelExport}
                    variant="outline"
                    className="gap-2 h-11 px-4"
                    size="lg"
                  >
                    <XCircle className="w-4 h-4" /> Cancel
                  </Button>
                )}
              </div>
              <Button
                onClick={cleanupOldFolders}
                disabled={exporting || cleaningUp}
                variant="outline"
                className="w-full gap-2 h-10 mt-2"
              >
                {cleaningUp ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Cleaning up old folders...</>
                ) : (
                  <><Trash2 className="w-4 h-4" /> Cleanup Old Folders</>
                )}
              </Button>
              {cleanupResult && (
                <div className={`flex items-start gap-2 mt-3 p-3 rounded-lg text-sm ${cleanupResult.error ? "bg-destructive/10 text-destructive" : "bg-emerald-50 text-emerald-700"}`}>
                  {cleanupResult.error ? (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <span>{cleanupResult.error || cleanupResult.message}</span>
                </div>
              )}
              {error && (
                <div className="flex items-center gap-2 mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />{error}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <RefreshCw className={`w-4 h-4 text-primary ${exporting ? "animate-spin" : ""}`} />
                <h3 className="text-sm font-semibold text-foreground">
                  {exporting ? "Export in Progress" : "Export Stages"}
                </h3>
              </div>
              <StageProgress />
            </CardContent>
          </Card>

          {lastRun && !exporting && (
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">Last Export</h3>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Date</p>
                    <p className="text-sm font-semibold text-foreground">{formatDate(lastRun.run_date)}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-emerald-50">
                    <p className="text-xs text-muted-foreground mb-1">Uploaded</p>
                    <p className="text-lg font-bold text-emerald-600">{lastRun.files_uploaded || 0}</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/30">
                    <p className="text-xs text-muted-foreground mb-1">Skipped</p>
                    <p className="text-lg font-bold text-muted-foreground">{lastRun.files_skipped || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {runHistory.length > 1 && (
            <Card>
              <CardContent className="p-5">
                <h3 className="text-sm font-semibold text-foreground mb-3">Export History</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {runHistory.map((run, i) => (
                    <div key={i} className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-muted/20">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <div>
                          <p className="text-xs font-medium text-foreground">{formatDate(run.run_date)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {run.files_uploaded || 0} uploaded · {run.files_skipped || 0} skipped
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-600 font-medium">{run.status}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}