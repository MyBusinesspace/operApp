import { createClientFromRequest } from "npm:@base44/sdk@0.8.56";
import { createGoogleDriveHelpers } from "../../shared/googleDriveHelpers.ts";
import {
  MIRROR_PHASES, PHASE_LABELS, newSession, parseSession, runPhaseBatch,
} from "../../shared/driveMirror.ts";

// Google Drive mirror — mode-based sync driven by the workflows.
//
//   status            read-only state for the settings page
//   sync_now          create (or attach to) a mirror session; the entity workflow chains it
//   start_incremental hourly entry point: create (or resume) a session
//   next_batch        process ONE batch of the session's current phase
//
// The session checkpoint (mode, watermark, phase cursor, counters, errors) lives in
// the GoogleDriveExportRun record, so a session can be resumed by any caller after
// a failure, a timeout, or a browser being closed.
//
// This function NEVER writes to app data: it only reads app records and writes to
// Google Drive plus the two mirror bookkeeping entities.

const STALE_SESSION_MS = 120000;
const MAX_CONSECUTIVE_FAILURES = 3;
const MAX_ERRORS = 12;
const MAX_CURSOR_IDS = 100;

export default async function (req: Request): Promise<Response> {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "status";

    if (mode === "status") return Response.json(await buildStatus(base44));

    // Opt-in: the mirror only runs when enabled in Settings (off by default).
    const enabled = await isMirrorEnabled(base44);
    if (!enabled && (mode === "sync_now" || mode === "next_batch")) {
      return Response.json({ error: "Google Drive mirror is disabled. Enable it in Settings > Google Drive Mirror." }, { status: 403 });
    }
    if (!enabled && mode === "start_incremental") {
      return Response.json({ skipped: "disabled", hasMore: false });
    }

    if (mode === "sync_now") {
      const running = await runningSession(base44);
      if (running) {
        const session = parseSession(running, "incremental", null);
        return Response.json({ run_id: running.id, mode: session.mode, attached: true, hasMore: true });
      }
      const watermark = await lastWatermark(base44);
      const sessionMode = watermark ? "incremental" : "full";
      const run = await createSession(base44, sessionMode, watermark, sessionMode);
      return Response.json({ run_id: run.id, mode: sessionMode, attached: false, hasMore: true });
    }

    if (mode === "start_incremental") {
      const running = await runningSession(base44);
      if (running) {
        const age = Date.now() - new Date(running.updated_date || running.created_date || 0).getTime();
        if (age < STALE_SESSION_MS) {
          return Response.json({ skipped: "session_active", run_id: running.id, hasMore: false });
        }
        return Response.json({ run_id: running.id, resumed: true, hasMore: true });
      }
      const watermark = await lastWatermark(base44);
      const run = await createSession(base44, watermark ? "incremental" : "full", watermark, "scheduled");
      return Response.json({ run_id: run.id, resumed: false, hasMore: true });
    }

    if (mode === "next_batch") {
      if (!body.run_id) return Response.json({ error: "run_id required" }, { status: 400 });
      return Response.json(await runBatch(base44, body.run_id, new URL(req.url).origin, body));
    }

    return Response.json({ error: `Unknown mode: ${mode}` }, { status: 400 });
  } catch (error: any) {
    return Response.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

// ── Session bookkeeping ─────────────────────────────────────────────────────

async function isMirrorEnabled(base44: any): Promise<boolean> {
  const rows = await base44.asServiceRole.entities.AccountingSettings
    .list("-created_date", 1)
    .catch(() => []);
  return rows?.[0]?.drive_mirror_enabled === true;
}

async function runningSession(base44: any) {
  const rows = await base44.asServiceRole.entities.GoogleDriveExportRun
    .filter({ status: "running" }, "-created_date", 1).catch(() => []);
  return rows?.[0] || null;
}

async function lastCompleted(base44: any) {
  const rows = await base44.asServiceRole.entities.GoogleDriveExportRun
    .filter({ status: "completed" }, "-updated_date", 1).catch(() => []);
  return rows?.[0] || null;
}

async function lastWatermark(base44: any) {
  const run = await lastCompleted(base44);
  if (!run) return null;
  const session = parseSession(run, "incremental", null);
  return session.watermark || run.updated_date || null;
}

async function createSession(base44: any, mode: string, watermark: string | null, stageMarker: string) {
  return await base44.asServiceRole.entities.GoogleDriveExportRun.create({
    status: "running",
    has_more: true,
    current_stage: stageMarker,
    current_offset: 0,
    current_item: JSON.stringify(newSession(mode, watermark)),
    files_uploaded: 0,
    files_skipped: 0,
  });
}

// ── One batch ───────────────────────────────────────────────────────────────

async function runBatch(base44: any, runId: string, appOrigin: string = "", body: any = {}) {
  const run = await base44.asServiceRole.entities.GoogleDriveExportRun.get(runId).catch(() => null);
  if (!run) return { hasMore: false, status: "missing", error: "Run not found" };
  if (run.status !== "running") {
    return {
      hasMore: false, status: run.status, phase: run.current_stage,
      uploaded: run.files_uploaded || 0, skipped: run.files_skipped || 0,
    };
  }

  // Serialize batch processing: only one batch may run at a time. The marker
  // write below bumps updated_date; any batch starting within its window is a
  // duplicate fire from the chaining workflow and steps aside. Self-chained
  // batches carry force=true and are exempt (they are the single live chain).
  const lastWrite = new Date(run.updated_date || 0).getTime();
  if (lastWrite && Date.now() - lastWrite < 8000 && !body.force) {
    return {
      hasMore: true, status: "running", phase: run.current_stage,
      phase_label: PHASE_LABELS[run.current_stage] || run.current_stage,
      processed: 0, uploaded: run.files_uploaded || 0, skipped: run.files_skipped || 0,
      restored: 0, deleted: 0, item: "", error: "",
    };
  }
  await base44.asServiceRole.entities.GoogleDriveExportRun
    .update(runId, { current_offset: (parseSession(run, "full", null).phase_processed || 0) })
    .catch(() => {});

  const watermark = await lastWatermark(base44);
  const fallbackMode = run.current_stage === "full" ? "full" : "incremental";
  const session = parseSession(run, fallbackMode, watermark);
  const startingFresh = !MIRROR_PHASES.includes(run.current_stage);
  let phase: string = startingFresh ? MIRROR_PHASES[0] : run.current_stage;
  if (startingFresh) {
    session.cursor = "";
    session.cursor_ids = [];
    session.phase_processed = 0;
  }

  const { accessToken } = await base44.asServiceRole.connectors.getConnection("googledrive");
  const helpers = createGoogleDriveHelpers(base44, accessToken, appOrigin);

  let result: any = { processed: 0, hasMore: false, item: "" };
  let failure: string | null = null;
  try {
    result = await runPhaseBatch(base44, helpers, phase, session);
  } catch (err: any) {
    failure = err?.message || String(err);
  }

  if (helpers.stats.errors?.length) {
    session.errors = [...(session.errors || []), ...helpers.stats.errors].slice(-MAX_ERRORS);
  }
  session.uploaded = (session.uploaded || 0) + helpers.stats.uploaded;
  session.skipped = (session.skipped || 0) + helpers.stats.skipped;
  session.restored = (session.restored || 0) + helpers.stats.restored;
  session.deleted = (session.deleted || 0) + helpers.stats.deleted;
  if (result.cursor !== undefined) session.cursor = result.cursor;
  if (result.cursorIds !== undefined) session.cursor_ids = (result.cursorIds || []).slice(-MAX_CURSOR_IDS);

  session.phase_processed = (session.phase_processed || 0) + (result.processed || 0);

  if (failure) {
    session.errors = [...(session.errors || []), `${PHASE_LABELS[phase] || phase}: ${failure}`].slice(-MAX_ERRORS);
    session.failures = (session.failures || 0) + 1;
  } else {
    session.failures = 0;
  }

  let nextPhase = phase;
  let hasMore = Boolean(result.hasMore);
  let status = "running";

  if (!failure && !result.hasMore) {
    const idx = MIRROR_PHASES.indexOf(phase as any);
    if (idx >= 0 && idx < MIRROR_PHASES.length - 1) {
      nextPhase = MIRROR_PHASES[idx + 1];
      session.cursor = "";
      session.cursor_ids = [];
      session.phase_processed = 0;
      hasMore = true;
    } else {
      nextPhase = "done";
      hasMore = false;
      status = "completed";
      session.done = true;
      // The next incremental run starts from this session's start, so changes made
      // while it was running are picked up.
      session.watermark = session.started_at;
    }
  }
  if (failure && session.failures >= MAX_CONSECUTIVE_FAILURES) status = "failed";

  session.errors = (session.errors || []).map((e: any) => String(e).slice(0, 240)).slice(-MAX_ERRORS);

  await base44.asServiceRole.entities.GoogleDriveExportRun.update(runId, {
    status,
    has_more: hasMore,
    current_stage: nextPhase,
    current_offset: session.phase_processed || 0,
    current_item: JSON.stringify(session),
    files_uploaded: session.uploaded || 0,
    files_skipped: session.skipped || 0,
    error: status === "failed" ? session.errors[session.errors.length - 1] || "Sync failed" : "",
  });

  // Keep the chain alive without depending on the create-only workflow: fire the
  // next batch ourselves (fire-and-forget). One live chain, exempt from the guard.
  if (hasMore) {
    try {
    await base44.asServiceRole.functions.invoke("exportToGoogleDrive", { mode: "next_batch", run_id: runId, force: true })
      .catch((e: any) => {
        session.errors = [...(session.errors || []), `self-chain invoke failed: ${e?.message || e}`].slice(-MAX_ERRORS);
      });
    } catch { /* SDK without functions.invoke: the hourly workflow resumes */ }
  }

  return {
    hasMore,
    status,
    phase: nextPhase,
    phase_label: PHASE_LABELS[nextPhase] || nextPhase,
    processed: result.processed || 0,
    uploaded: session.uploaded || 0,
    skipped: session.skipped || 0,
    restored: session.restored || 0,
    deleted: session.deleted || 0,
    item: result.item || "",
    error: failure || "",
  };
}

// ── Status ──────────────────────────────────────────────────────────────────

async function buildStatus(base44: any) {
  let connected = false;
  let connectionError = "";
  try {
    await base44.asServiceRole.connectors.getConnection("googledrive");
    connected = true;
  } catch (err: any) {
    connectionError = err?.message || "Google Drive is not connected";
  }

  const [runningRows, recent, filesMirrored, foldersMirrored, rootRows] = await Promise.all([
    base44.asServiceRole.entities.GoogleDriveExportRun.filter({ status: "running" }, "-created_date", 1).catch(() => []),
    base44.asServiceRole.entities.GoogleDriveExportRun.list("-updated_date", 8).catch(() => []),
    base44.asServiceRole.entities.GoogleDriveExportState.count({ entry_type: "file" }).catch(() => 0),
    base44.asServiceRole.entities.GoogleDriveExportState.count({ entry_type: "folder" }).catch(() => 0),
    base44.asServiceRole.entities.GoogleDriveExportState
      .filter({ entry_type: "folder", entity_type: "root_folder", entity_id: "root" }, "-created_date", 1).catch(() => []),
  ]);

  const active = runningRows?.[0] || null;
  const completed = (recent || []).find((r: any) => r.status === "completed") || null;
  const failed = (recent || []).find((r: any) => r.status === "failed") || null;
  const source = active || completed || null;
  const session = source ? parseSession(source, "incremental", null) : null;

  return {
    connected,
    enabled: await isMirrorEnabled(base44),
    connection_error: connectionError,
    root_folder_name: "Redcrane LLC",
    root_folder_id: rootRows?.[0]?.drive_folder_id || null,
    files_mirrored: filesMirrored || 0,
    folders_mirrored: foldersMirrored || 0,
    watermark: completed ? parseSession(completed, "incremental", null).watermark : null,
    active: active
      ? {
          id: active.id,
          mode: parseSession(active, "incremental", null).mode,
          phase: active.current_stage,
          phase_label: PHASE_LABELS[active.current_stage] || active.current_stage,
          uploaded: active.files_uploaded || 0,
          skipped: active.files_skipped || 0,
          since: active.updated_date,
        }
      : null,
    last: completed
      ? {
          date: completed.updated_date,
          mode: parseSession(completed, "incremental", null).mode,
          uploaded: completed.files_uploaded || 0,
          skipped: completed.files_skipped || 0,
          restored: parseSession(completed, "incremental", null).restored || 0,
          deleted: parseSession(completed, "incremental", null).deleted || 0,
        }
      : null,
    last_failed: failed
      ? {
          date: failed.updated_date,
          phase: failed.current_stage,
          error: failed.error || parseSession(failed, "incremental", null).errors?.[0] || "",
        }
      : null,
    errors: session?.errors || [],
  };
}