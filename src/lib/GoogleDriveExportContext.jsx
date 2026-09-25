import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";

// Stage keys used by the polling logic to map run.current_stage → UI stage index
const STAGE_KEYS = ["init", "organization", "business", "operations"];

const GoogleDriveExportContext = createContext(null);

/**
 * Global export engine — lives in AppLayout, survives page navigation.
 * The actual upload work runs server-side via the workflow + backend function;
 * this context owns the client-side polling, per-stage refresh loop, and all
 * progress state so the UI can re-connect at any time without restarting.
 */
export function GoogleDriveExportProvider({ children }) {
  const [exporting, setExporting] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [stageData, setStageData] = useState({});
  const [error, setError] = useState("");
  const [lastRun, setLastRun] = useState(null);
  const [runHistory, setRunHistory] = useState([]);
  const [totalExported, setTotalExported] = useState(0);
  const [activeRunId, setActiveRunId] = useState(null);
  const [docCounts, setDocCounts] = useState({});
  const [totalUploaded, setTotalUploaded] = useState(0);
  const [totalSkipped, setTotalSkipped] = useState(0);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [currentOffset, setCurrentOffset] = useState(0);
  const [refreshingStage, setRefreshingStage] = useState(null);
  const [stageResults, setStageResults] = useState({});
  const [checkpoints, setCheckpoints] = useState({});
  const [, setTick] = useState(0);
  const [cleaningUp, setCleaningUp] = useState(false);
  const [cleanupResult, setCleanupResult] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [currentItem, setCurrentItem] = useState("");

  // Ref prevents concurrent refreshStage runs even across re-renders
  const refreshingRef = useRef(null);

  const fetchStatus = useCallback(async () => {
    try {
      const inProgress = await base44.entities.GoogleDriveExportRun.filter({ status: "running" }, "-created_date", 1);
      if (inProgress.length > 0 && !activeRunId) {
        setActiveRunId(inProgress[0].id);
        setExporting(true);
      }

      const res = await base44.functions.invoke("exportToGoogleDrive", { stage: "status" });
      const data = res.data || res;

      const countsRes = await base44.functions.invoke("exportToGoogleDrive", { stage: "counts" });
      const countsData = countsRes.data || countsRes;
      if (countsData.counts) setDocCounts(countsData.counts);

      const cpRes = await base44.functions.invoke("exportToGoogleDrive", { stage: "get_all_checkpoints" });
      const cpData = cpRes.data || cpRes;
      if (cpData.checkpoints) setCheckpoints(cpData.checkpoints);

      if (data.lastRuns) {
        setRunHistory(data.lastRuns);
        if (data.lastRuns[0]) setLastRun(data.lastRuns[0]);
      }
      if (data.totalFilesExported !== undefined) setTotalExported(data.totalFilesExported);
    } catch {}
  }, [activeRunId]);

  // Fetch status once on mount — picks up any in-progress run from a previous session
  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Tick interval for "last update Xs ago" display (only while exporting)
  useEffect(() => {
    if (!exporting) return;
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, [exporting]);

  // Poll the active run entity every 2s — this is what makes the UI re-connect
  // instantly when the user returns to the page
  useEffect(() => {
    if (!activeRunId) return;
    const poll = async () => {
      try {
        const run = await base44.entities.GoogleDriveExportRun.get(activeRunId);
        const uiStage = run.current_stage?.startsWith("business_") ? "business" : run.current_stage === "tasks" ? "operations" : run.current_stage;
        const stageIdx = STAGE_KEYS.indexOf(uiStage);
        setStageIndex(stageIdx >= 0 ? stageIdx : STAGE_KEYS.length);

        setTotalUploaded(run.files_uploaded || 0);
        setTotalSkipped(run.files_skipped || 0);
        setLastUpdate(run.updated_date);
        setCurrentOffset(run.current_offset || 0);
        setCurrentItem(run.current_item || "");

        if (run.current_stage === "init") {
          setPhase("initializing");
        } else if (run.status === "completed") {
          setPhase("completed");
        } else if (run.status === "failed") {
          setPhase("failed");
        } else {
          setPhase("uploading");
        }

        if (run.files_uploaded > 0 || run.files_skipped > 0) {
          setStageData(prev => ({
            ...prev,
            [uiStage]: { uploaded: run.files_uploaded, skipped: run.files_skipped, done: run.status !== "running" },
          }));
        }

        if (run.status === "completed") {
          setPhase("completed");
          setExporting(false);
          setActiveRunId(null);
          await fetchStatus();
        } else if (run.status === "failed") {
          setPhase("failed");
          setError(run.error || "Export failed");
          setExporting(false);
          setActiveRunId(null);
        }
      } catch {}
    };
    const interval = setInterval(poll, 2000);
    poll();
    return () => clearInterval(interval);
  }, [activeRunId, fetchStatus]);

  const cancelExport = async () => {
    if (!activeRunId) return;
    try {
      await base44.entities.GoogleDriveExportRun.update(activeRunId, {
        status: "failed",
        error: "Cancelled by user",
      });
    } catch {}
    setActiveRunId(null);
    setExporting(false);
    setStageIndex(0);
    await fetchStatus();
  };

  // Per-stage refresh — runs as a background loop in the context, not in the page.
  // Survives navigation because the context is mounted in AppLayout.
  const refreshStage = async (stageKey) => {
    if (refreshingRef.current) return;
    refreshingRef.current = stageKey;
    setRefreshingStage(stageKey);
    setStageResults(prev => ({ ...prev, [stageKey]: null }));
    try {
      const substages = stageKey === "business"
        ? ["business_companies", "business_projects", "business_assets"]
        : stageKey === "operations"
        ? ["tasks"]
        : [stageKey];

      let upl = 0;
      let skp = 0;
      let resumed = false;
      let item = null;

      const cacheEntityMap = {
        organization: "organization",
        business_companies: "contact",
        business_projects: "project",
        business_assets: "asset",
        tasks: "task",
      };
      for (const substage of substages) {
        const cacheType = cacheEntityMap[substage];
        if (cacheType) {
          await base44.functions.invoke("exportToGoogleDrive", {
            stage: "sync_deletions", entity_type: cacheType,
          }).catch(() => {});
          await base44.functions.invoke("exportToGoogleDrive", {
            stage: "clear_file_cache", entity_type: cacheType,
          }).catch(() => {});
        }

        const cpRes = await base44.functions.invoke("exportToGoogleDrive", {
          stage: "get_checkpoint", checkpoint_stage: substage,
        });
        const cpData = cpRes.data || cpRes;
        const startOffset = cpData.checkpoint ? parseInt(cpData.checkpoint.entity_id) || 0 : 0;
        if (cpData.checkpoint) resumed = true;

        let offset = startOffset;
        const batchSize = 5;
        let hasMore = true;

        while (hasMore) {
          const res = await base44.functions.invoke("exportToGoogleDrive", {
            stage: substage,
            offset,
            limit: batchSize,
          });
          const data = res.data || res;
          if (data.error) throw new Error(data.error);
          upl += data.filesUploaded || 0;
          skp += data.filesSkipped || 0;
          hasMore = data.hasMore || false;
          offset += data.processed || batchSize;
          item = data.currentItem || item;

          const isLastSubstage = substages.indexOf(substage) === substages.length - 1;
          setStageResults(prev => ({
            ...prev,
            [stageKey]: {
              uploaded: upl,
              skipped: skp,
              error: null,
              inProgress: hasMore || !isLastSubstage,
              resumed,
              currentItem: item,
            },
          }));
        }
      }

      setStageResults(prev => ({
        ...prev,
        [stageKey]: { uploaded: upl, skipped: skp, error: null, resumed, currentItem: null },
      }));
      await fetchStatus();
    } catch (err) {
      setStageResults(prev => ({
        ...prev,
        [stageKey]: { uploaded: 0, skipped: 0, error: err.message || "Failed" },
      }));
    } finally {
      refreshingRef.current = null;
      setRefreshingStage(null);
    }
  };

  const restartStage = async (stageKey) => {
    try {
      const substages = stageKey === "business"
        ? ["business_companies", "business_projects", "business_assets"]
        : stageKey === "operations"
        ? ["tasks"]
        : [stageKey];
      for (const sub of substages) {
        await base44.functions.invoke("exportToGoogleDrive", {
          stage: "clear_checkpoint", checkpoint_stage: sub,
        });
      }
    } catch {}
    refreshStage(stageKey);
  };

  const cleanupOldFolders = async () => {
    setCleaningUp(true);
    setCleanupResult(null);
    try {
      const res = await base44.functions.invoke("exportToGoogleDrive", { stage: "cleanup" });
      const data = res.data || res;
      if (data.error) throw new Error(data.error);
      const deleted = data.deletedFolders || [];
      setCleanupResult({
        message: deleted.length > 0
          ? `Deleted ${deleted.length} old folders: ${deleted.join(", ")}. File cache cleared — re-run export to upload files to new structure.`
          : "No old folders found. Root is already clean.",
      });
      await fetchStatus();
    } catch (err) {
      setCleanupResult({ error: err.message || "Cleanup failed" });
    } finally {
      setCleaningUp(false);
    }
  };

  const runExport = async () => {
    setExporting(true);
    setError("");
    setStageData({});
    setStageIndex(0);
    setPhase("initializing");
    setCurrentItem("");
    setTotalUploaded(0);
    setTotalSkipped(0);

    try {
      const run = await base44.entities.GoogleDriveExportRun.create({
        status: "running",
        current_stage: "init",
        current_offset: 0,
        files_uploaded: 0,
        files_skipped: 0,
      });
      setActiveRunId(run.id);
    } catch (err) {
      setError(err.message || "Failed to start export");
      setExporting(false);
    }
  };

  const value = {
    exporting, stageIndex, stageData, error, lastRun, runHistory,
    totalExported, activeRunId, docCounts, totalUploaded, totalSkipped,
    lastUpdate, currentOffset, refreshingStage, stageResults, checkpoints,
    cleaningUp, cleanupResult, phase, currentItem,
    runExport, cancelExport, refreshStage, restartStage, cleanupOldFolders,
    fetchStatus,
  };

  return (
    <GoogleDriveExportContext.Provider value={value}>
      {children}
    </GoogleDriveExportContext.Provider>
  );
}

export function useGoogleDriveExport() {
  const ctx = useContext(GoogleDriveExportContext);
  if (!ctx) throw new Error("useGoogleDriveExport must be used within GoogleDriveExportProvider");
  return ctx;
}