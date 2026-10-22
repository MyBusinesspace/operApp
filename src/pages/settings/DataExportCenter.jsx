import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cloud, HardDrive, Info } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent } from "@/components/ui/card";
import MirrorStatusPanel from "@/components/settings/driveMirror/MirrorStatusPanel";
import MirrorErrorsCard from "@/components/settings/driveMirror/MirrorErrorsCard";
import MirrorStructure from "@/components/settings/driveMirror/MirrorStructure";

const PHASE_LABELS = {
  root: "Folder structure",
  org_files: "Company files",
  contact_files: "Customer & supplier files",
  shared_files: "Shared files",
  project_files: "Project files",
  task_photos: "Task photos",
  employee_docs: "Employee documents",
  asset_files: "Equipment files",
  wr: "Working report PDFs",
  verify: "Deletions & restores",
  done: "Completed",
};

const parseSession = (value) => {
  try {
    return JSON.parse(value || "");
  } catch {
    return null;
  }
};

export default function DataExportCenter({ embedded = false }) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [runId, setRunId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [actionError, setActionError] = useState("");

  const loadStatus = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("exportToGoogleDrive", { mode: "status" });
      setStatus(res.data || null);
      setActionError(res.data?.error || "");
    } catch (err) {
      setActionError(err?.response?.data?.error || err.message || "Could not read the mirror status");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const run = await base44.entities.GoogleDriveExportRun.get(runId);
        if (cancelled) return;
        const session = parseSession(run.current_item);
        setProgress({
          status: run.status,
          phaseLabel: PHASE_LABELS[run.current_stage] || run.current_stage,
          uploaded: run.files_uploaded || 0,
          skipped: run.files_skipped || 0,
          errors: session?.errors || [],
        });
        if (run.status !== "running") {
          setRunId(null);
          setSyncing(false);
          loadStatus();
        }
      } catch {
        // keep polling
      }
    };

    poll();
    const interval = setInterval(poll, 2500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [runId, loadStatus]);

  const handleSync = async () => {
    setActionError("");
    setSyncing(true);
    try {
      const res = await base44.functions.invoke("exportToGoogleDrive", { mode: "sync_now" });
      const data = res.data || {};
      if (data.error) throw new Error(data.error);
      setRunId(data.run_id);
      setProgress({
        status: "running",
        phaseLabel: PHASE_LABELS.root,
        uploaded: 0,
        skipped: 0,
        errors: [],
      });
      // An existing session is only chained by the workflow when it is created, so push
      // the first batch of an already running session from here.
      if (data.attached) {
        const nudge = await base44.functions.invoke("exportToGoogleDrive", { mode: "next_batch", run_id: data.run_id });
        const session = nudge.data || {};
        if (!session.hasMore && session.status && session.status !== "running") {
          setRunId(null);
          setSyncing(false);
          loadStatus();
        }
      }
    } catch (err) {
      setActionError(err?.response?.data?.error || err.message || "Sync could not be started");
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {!embedded && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Google Drive Mirror</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Keeps a live copy of your app files in Google Drive, including deletions
              </p>
            </div>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <MirrorStatusPanel
            status={status}
            syncing={syncing}
            progress={progress}
            actionError={actionError}
            onSync={handleSync}
          />
          <MirrorErrorsCard status={status} liveErrors={progress?.errors} />
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <Cloud className="w-4 h-4 text-primary" />
                <h3 className="text-xs font-semibold text-foreground">Mirror structure</h3>
              </div>
              <MirrorStructure />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>
                    The mirror is incremental: every hour it uploads what was created or changed since the last run
                    and removes what was deleted from the app. A file that is deleted or trashed in Drive is uploaded
                    again on the next pass.
                  </p>
                  <p>Read-only: app records are never modified, and no Drive folder is deleted.</p>
                </div>
              </div>
              {loading && <p className="mt-3 text-xs text-muted-foreground">Checking the mirror…</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}