// Incremental Google Drive mirror — phase engine.
//
// One invocation processes exactly ONE batch of ONE phase (25 entities, 15 working
// report PDFs, or 25 file mappings) and reports whether more work is left; the
// workflow chains the batches while hasMore is true.
//
// Phases (in order):
//   root          resolve the mirror root + the module folders
//   org_files     OrganizationFile       → Empresa Redcrane/
//   contact_files ContactFile            → Clientes/<contact>/ or Proveedores/<contact>/
//   shared_files  SharedFile             → every folder it is linked to
//   project_files ProjectFile            → Proyectos/<Client - Project>/
//   task_photos   Task photos            → Proyectos/<Client - Project>/
//   employee_docs EmployeeDocument       → Empleados/<employee>/
//   asset_files   AssetFile              → Equipos/<asset>/
//   wr            WorkingReport PDFs     → Proyectos/<Client - Project>/
//   verify        delete mappings whose app file is gone, restore Drive files that
//                 were deleted or trashed in Drive
//
// Ordering is always ascending by created_date (full run) or updated_date
// (incremental run) with a timestamp cursor kept in the session, so a session can
// be resumed at any point without skipping or re-scanning from the start.

import { buildWorkingReportPdf, dayKey, loadActiveAssetFields } from "./workingReportPdf.ts";

export const ENTITY_BATCH = 25;
export const WR_BATCH = 15;

export const MIRROR_PHASES = [
  "root",
  "org_files",
  "contact_files",
  "shared_files",
  "project_files",
  "task_photos",
  "employee_docs",
  "asset_files",
  "wr",
  "verify",
] as const;

export const PHASE_LABELS: Record<string, string> = {
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

const MODULE_FOLDERS: [string, string][] = [
  ["module_clientes", "Customers"],
  ["module_proveedores", "Suppliers"],
  ["module_proyectos", "Projects"],
  ["module_empleados", "Employees"],
  ["module_equipos", "Equipment"],
  ["module_empresa", "Company"],
];

export function newSession(mode: string, watermark: string | null) {
  return {
    mode,
    watermark: watermark || null,
    started_at: new Date().toISOString(),
    cursor: "",
    cursor_ids: [],
    uploaded: 0,
    skipped: 0,
    restored: 0,
    deleted: 0,
    errors: [] as string[],
    done: false,
  };
}

export function parseSession(run: any, fallbackMode: string, watermark: string | null) {
  try {
    const parsed = JSON.parse(run?.current_item || "");
    if (parsed && typeof parsed === "object" && parsed.mode) return { ...newSession(parsed.mode, parsed.watermark), ...parsed };
  } catch {
    // no session stored yet
  }
  return newSession(fallbackMode, watermark);
}

const tsOf = (row: any, field: string) => String(row?.[field] || "");

/**
 * Read one page of a windowed list.
 * - full mode: ascending created_date, no lower bound.
 * - incremental mode: ascending updated_date, starting at the session watermark.
 * The cursor is stored per phase, so switching phase resets the window.
 */
async function takePage(
  ctx: any,
  entityName: string,
  base: Record<string, any>,
  n: number,
  opts: { fetch?: number; keep?: (row: any) => boolean } = {}
) {
  const { base44, session } = ctx;
  const field = session.mode === "full" ? "created_date" : "updated_date";
  const limit = opts.fetch || n + 25;
  const query: Record<string, any> = { ...base };
  if (session.cursor) query[field] = { $gte: session.cursor };
  else if (session.mode !== "full" && session.watermark) query[field] = { $gt: session.watermark };

  const rows: any[] = (await base44.asServiceRole.entities[entityName].filter(query, field, limit).catch(() => [])) || [];
  const seen = new Set<string>(session.cursor_ids || []);
  let candidates = rows.filter((r) => !(tsOf(r, field) === session.cursor && seen.has(r.id)));
  if (opts.keep) candidates = candidates.filter(opts.keep);

  const items = candidates.slice(0, n);
  let cursor = session.cursor;
  let cursorIds = session.cursor_ids || [];

  if (items.length > 0) {
    const last = items[items.length - 1];
    cursor = tsOf(last, field);
    cursorIds = items.filter((r) => tsOf(r, field) === cursor).map((r) => r.id).slice(-200);
  } else if (rows.length > 0 && field) {
    // Nothing usable in this page (e.g. legacy rows we skip) — step the cursor past
    // the whole page so the sweep keeps moving.
    const last = rows[rows.length - 1];
    cursor = tsOf(last, field);
    cursorIds = [last.id];
  }

  const hasMore = candidates.length > n || rows.length >= limit;
  return { items, hasMore, cursor, cursorIds, scanned: rows.length };
}

// ── Folder resolution ───────────────────────────────────────────────────────

function isClientType(type: any) {
  const t = String(type || "").toLowerCase().trim();
  return t === "customer" || t === "both" || t === "contact" || t === "";
}

function isProviderType(type: any) {
  const t = String(type || "").toLowerCase().trim();
  return t === "provider" || t === "both";
}

// Module folders are created lazily: only when at least one file lands inside.
async function moduleFolder(ctx: any, key: string): Promise<string | null> {
  const name = MODULE_FOLDERS.find(([k]) => k === key)?.[1];
  if (!name) return null;
  const rootId = await ctx.helpers.resolveRootFolder();
  return ctx.helpers.ensureFolder(rootId, name, key, key);
}

async function contactFolders(ctx: any, contactId: string): Promise<{ folderId: string; link: string }[]> {
  if (!contactId) return [];
  const contact = await ctx.cache.get("Contact", contactId);
  if (!contact) return [];
  const name = ctx.helpers.sanitizeName(contact.full_name || contact.company || "Unnamed contact");
  const out: { folderId: string; link: string }[] = [];
  if (isClientType(contact.type)) {
    const parent = await moduleFolder(ctx, "module_clientes");
    if (parent) out.push({ folderId: await ctx.helpers.ensureFolder(parent, name, "contact_clientes", contact.id), link: `contact:${contact.id}` });
  }
  if (isProviderType(contact.type)) {
    const parent = await moduleFolder(ctx, "module_proveedores");
    if (parent) out.push({ folderId: await ctx.helpers.ensureFolder(parent, name, "contact_proveedores", contact.id), link: `contact:${contact.id}` });
  }
  return out;
}

async function projectFolder(ctx: any, projectId: string): Promise<{ folderId: string; link: string } | null> {
  if (!projectId) return null;
  const project = await ctx.cache.get("Project", projectId);
  if (!project) return null;
  const parent = await moduleFolder(ctx, "module_proyectos");
  if (!parent) return null;
  const client = ctx.helpers.sanitizeName(project.contact_name || "Unassigned");
  const name = `${client} - ${ctx.helpers.sanitizeName(project.name || "Unnamed project")}`;
  return { folderId: await ctx.helpers.ensureFolder(parent, name, "project", project.id), link: `project:${project.id}` };
}

async function employeeFolder(ctx: any, employeeId: string): Promise<{ folderId: string; link: string } | null> {
  if (!employeeId) return null;
  const employee = await ctx.cache.get("Employee", employeeId);
  if (!employee) return null;
  const parent = await moduleFolder(ctx, "module_empleados");
  if (!parent) return null;
  const name = ctx.helpers.sanitizeName(employee.full_name || "Unnamed employee");
  return { folderId: await ctx.helpers.ensureFolder(parent, name, "employee", employee.id), link: `employee:${employee.id}` };
}

async function assetFolder(ctx: any, assetId: string): Promise<{ folderId: string; link: string } | null> {
  if (!assetId) return null;
  const asset = await ctx.cache.get("Asset", assetId);
  if (!asset) return null;
  const parent = await moduleFolder(ctx, "module_equipos");
  if (!parent) return null;
  const name = ctx.helpers.sanitizeName(asset.name || "Unnamed equipment");
  return { folderId: await ctx.helpers.ensureFolder(parent, name, "asset", asset.id), link: `asset:${asset.id}` };
}

// Project files are nested: Projects/<Client - Project>/Documents | Task Photos | Working Reports
async function projectSubFolder(ctx: any, projectId: string, subKey: string, subName: string): Promise<{ folderId: string; link: string } | null> {
  const parent = await projectFolder(ctx, projectId);
  if (!parent) return null;
  return { folderId: await ctx.helpers.ensureFolder(parent.folderId, subName, subKey, projectId), link: parent.link };
}

const extFromUrl = (url: string) => {
  const match = String(url || "").match(/\.([a-z0-9]{2,5})(?:\?|#|$)/i);
  return match ? match[1].toLowerCase() : "";
};

// ── Phases ──────────────────────────────────────────────────────────────────

async function phaseRoot(ctx: any) {
  const rootId = await ctx.helpers.resolveRootFolder();
  // Module folders that already have a mapping adopt the current names in place
  // (same Drive id). Unmapped modules stay lazy: created only when a file lands.
  for (const [key, name] of MODULE_FOLDERS) {
    try {
      const mapped = await ctx.helpers.getFolderId(key, key);
      if (mapped) await ctx.helpers.ensureFolder(rootId, name, key, key);
    } catch (err: any) {
      ctx.session.errors.push(`module folder ${name}: ${err?.message || err}`);
    }
  }
  return { processed: 1, hasMore: false, item: "Root folder ready" };
}

async function phaseOrgFiles(ctx: any) {
  const page = await takePage(ctx, "OrganizationFile", {}, ENTITY_BATCH);
  for (const file of page.items) {
    if (!file.file_url) continue;
    const folderId = await moduleFolder(ctx, "module_empresa");
    if (!folderId) continue;
    await ctx.helpers.mirrorUrlFile({
      fileUrl: file.file_url,
      fileName: file.name || `file_${file.id}`,
      folderId,
      entityType: "org_file",
      entityId: file.id,
    });
  }
  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Company files" };
}

async function phaseContactFiles(ctx: any) {
  const page = await takePage(ctx, "ContactFile", {}, ENTITY_BATCH);
  for (const file of page.items) {
    if (!file.file_url) continue;
    const folders = await contactFolders(ctx, file.contact_id);
    for (const target of folders) {
      await ctx.helpers.mirrorUrlFile({
        fileUrl: file.file_url,
        fileName: file.file_name || `file_${file.id}`,
        folderId: target.folderId,
        entityType: "contact_file",
        entityId: file.id,
        context: target.link,
      });
    }
  }
  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Customer & supplier files" };
}

// A SharedFile can be linked to a contact, a project and an asset — it is mirrored
// into every folder it belongs to.
async function phaseSharedFiles(ctx: any) {
  const page = await takePage(ctx, "SharedFile", {}, ENTITY_BATCH);
  for (const file of page.items) {
    if (!file.file_url) continue;
    const fileName = file.file_name || `file_${file.id}`;
    const targets: { folderId: string; link: string }[] = [];
    const contactTargets = await contactFolders(ctx, file.contact_id);
    for (const t of contactTargets) targets.push(t);
    const project = await projectSubFolder(ctx, file.project_id, "project_documents", "Documents");
    if (project) targets.push(project);
    const asset = await assetFolder(ctx, file.asset_id);
    if (asset) targets.push(asset);

    for (const target of targets) {
      await ctx.helpers.mirrorUrlFile({
        fileUrl: file.file_url,
        fileName,
        folderId: target.folderId,
        entityType: "shared_file",
        entityId: file.id,
        context: target.link,
      });
    }
  }
  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Shared files" };
}

async function phaseProjectFiles(ctx: any) {
  const page = await takePage(ctx, "ProjectFile", {}, ENTITY_BATCH);
  for (const file of page.items) {
    if (!file.file_url) continue;
    const target = await projectSubFolder(ctx, file.project_id, "project_documents", "Documents");
    if (!target) continue;
    await ctx.helpers.mirrorUrlFile({
      fileUrl: file.file_url,
      fileName: file.file_name || `file_${file.id}`,
      folderId: target.folderId,
      entityType: "project_file",
      entityId: file.id,
      context: target.link,
    });
  }
  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Project files" };
}

// Task photos live on the task record; they are mirrored into the task's project folder.
async function phaseTaskPhotos(ctx: any) {
  const page = await takePage(ctx, "Task", {}, ENTITY_BATCH);
  for (const task of page.items) {
    const photos = Array.isArray(task.photos) ? task.photos.filter((p: any) => p?.url) : [];
    if (photos.length === 0) continue;
    const target = await projectSubFolder(ctx, task.project_id, "project_task_photos", "Task Photos");
    if (!target) continue;
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      const ext = extFromUrl(photo.url) || "jpg";
      const fileName = photo.caption ? `${photo.caption}.${ext}` : `photo_${i + 1}.${ext}`;
      await ctx.helpers.mirrorUrlFile({
        fileUrl: photo.url,
        fileName,
        folderId: target.folderId,
        entityType: "task_photo",
        entityId: task.id,
        context: target.link,
      });
    }
  }
  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Task photos" };
}

async function phaseEmployeeDocs(ctx: any) {
  const page = await takePage(ctx, "EmployeeDocument", {}, ENTITY_BATCH);
  for (const doc of page.items) {
    if (!doc.file_url) continue;
    const target = await employeeFolder(ctx, doc.employee_id);
    if (!target) continue;
    await ctx.helpers.mirrorUrlFile({
      fileUrl: doc.file_url,
      fileName: doc.file_name || `document_${doc.id}`,
      folderId: target.folderId,
      entityType: "employee_doc",
      entityId: doc.id,
      context: target.link,
    });
  }
  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Employee documents" };
}

async function phaseAssetFiles(ctx: any) {
  const page = await takePage(ctx, "AssetFile", {}, ENTITY_BATCH);
  for (const file of page.items) {
    if (!file.file_url) continue;
    const target = await assetFolder(ctx, file.asset_id);
    if (!target) continue;
    await ctx.helpers.mirrorUrlFile({
      fileUrl: file.file_url,
      fileName: file.file_name || `file_${file.id}`,
      folderId: target.folderId,
      entityType: "asset_file",
      entityId: file.id,
      context: target.link,
    });
  }
  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Equipment files" };
}

// Working report PDFs are generated from the report record itself; the mapping key
// carries the report's updated_date so an edited report is regenerated.
async function phaseWorkingReports(ctx: any) {
  const page = await takePage(ctx, "WorkingReport", {}, WR_BATCH, { fetch: WR_BATCH + 10 });
  if (page.items.length > 0 && !ctx.wrContext) {
    const templates = await ctx.base44.asServiceRole.entities.WorkingReportTemplate.list("name", 50).catch(() => []);
    ctx.wrContext = {
      template: (templates || []).find((t: any) => t.is_default) || (templates || [])[0] || null,
      assetFields: await loadActiveAssetFields(ctx.base44).catch(() => []),
    };
  }

  for (const report of page.items) {
    const task = await ctx.cache.get("Task", report.task_id);
    if (!task) continue;
    const target = await projectSubFolder(ctx, task.project_id, "project_working_reports", "Working Reports");
    if (!target) continue;
    try {
      const built = await buildWorkingReportFor(ctx, task, report);
      await ctx.helpers.mirrorGenerated({
        mappingKey: `wr:${report.id}:${report.updated_date || report.created_date || ""}`,
        fileName: `WR_${report.reference || report.id}.pdf`,
        folderId: target.folderId,
        entityType: "wr_pdf",
        entityId: report.id,
        context: target.link,
        build: async () => ({ bytes: built, contentType: "application/pdf" }),
      });
    } catch (err: any) {
      ctx.session.errors.push(`WR ${report.reference || report.id}: ${err?.message || err}`);
    }
  }
  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Working report PDFs" };
}

async function buildWorkingReportFor(ctx: any, task: any, report: any): Promise<ArrayBuffer> {
  const { base44 } = ctx;
  const subtasks = await ctx.cache.getList("TaskSubtask", { task_id: task.id }, "sort_order", 200);
  const asset = task.asset_id ? await ctx.cache.get("Asset", task.asset_id) : null;
  const taskForPdf = { ...task, subtasks };

  let woContactLabel = "";
  if (task.work_order_id) {
    const contacts = await ctx.cache.getList("ContactPerson", { work_order_id: task.work_order_id }, "full_name", 50);
    woContactLabel = (contacts || [])
      .map((cp: any) => (cp.phone ? `${cp.full_name} (${cp.phone})` : cp.full_name))
      .filter(Boolean)
      .join(" · ");
  }

  const reportDay = dayKey(report.clock_in_time);
  const entries = await ctx.cache.getList("TimeEntry", { task_id: task.id }, "clock_in_time", 200);
  const participants = (entries || [])
    .filter((te: any) => !reportDay || dayKey(te.clock_in_time) === reportDay)
    .map((te: any) => ({
      employee_id: te.employee_id,
      employee_name: te.employee_name,
      clock_in_time: te.clock_in_time,
      clock_out_time: te.clock_out_time,
    }));

  const pdf = await buildWorkingReportPdf({
    template: ctx.wrContext.template,
    entry: { ...report, participants, report_reference: report.reference },
    task: taskForPdf,
    asset,
    woContactLabel,
    assetFields: ctx.wrContext.assetFields,
  });
  return pdf.output("arraybuffer");
}

// ── Verify: mirror deletions and restores ───────────────────────────────────

const SOURCE_ENTITIES: Record<string, { entity: string; urlField: string }> = {
  org_file: { entity: "OrganizationFile", urlField: "file_url" },
  contact_file: { entity: "ContactFile", urlField: "file_url" },
  project_file: { entity: "ProjectFile", urlField: "file_url" },
  asset_file: { entity: "AssetFile", urlField: "file_url" },
  employee_doc: { entity: "EmployeeDocument", urlField: "file_url" },
  shared_file: { entity: "SharedFile", urlField: "file_url" },
};

async function sourceGone(ctx: any, row: any): Promise<boolean> {
  const kind = String(row.entity_type || "");

  if (kind === "task_photo") {
    const task = await ctx.cache.get("Task", row.entity_id, true);
    if (!task) return true;
    const photos = Array.isArray(task.photos) ? task.photos : [];
    return !photos.some((p: any) => p?.url === row.file_url);
  }

  if (kind === "wr_pdf") {
    const report = await ctx.cache.get("WorkingReport", row.entity_id, true);
    if (!report) return true;
    // key = wr:<id>:<updated_date> — an edited report has a new key, so the old row is obsolete
    return row.file_url !== `wr:${report.id}:${report.updated_date || report.created_date || ""}`;
  }

  const config = SOURCE_ENTITIES[kind];
  if (!config) return false; // unknown/legacy row — left untouched
  const record = await ctx.cache.get(config.entity, row.entity_id, true);
  if (!record) return true;
  if (row.file_url && record[config.urlField] !== row.file_url) return true;
  if (kind === "shared_file") {
    // the upload happened because of one specific link; drop it when that link is gone
    const [linkKind, linkId] = String(row.status || "").split(":");
    if (linkKind && linkId) {
      if (linkKind === "contact" && record.contact_id !== linkId) return true;
      if (linkKind === "project" && record.project_id !== linkId) return true;
      if (linkKind === "asset" && record.asset_id !== linkId) return true;
    }
  }
  return false;
}

async function phaseVerify(ctx: any) {
  // Legacy rows (no entity_id / no folder) are skipped without consuming the batch.
  const page = await takePage(
    ctx,
    "GoogleDriveExportState",
    { entry_type: "file" },
    ENTITY_BATCH,
    { fetch: 100, keep: (row: any) => Boolean(row.entity_id && row.drive_folder_id) }
  );

  for (const row of page.items) {
    try {
      if (await sourceGone(ctx, row)) {
        await ctx.helpers.dropMapping(row, true);
        continue;
      }
      if (row.drive_file_id && (await ctx.helpers.isFileHealthy(row.drive_file_id, row.drive_folder_id))) continue;

      if (String(row.file_url || "").startsWith("wr:")) {
        const report = await ctx.cache.get("WorkingReport", row.entity_id, true);
        const task = report ? await ctx.cache.get("Task", report.task_id) : null;
        if (report && task) {
          const target = await projectSubFolder(ctx, task.project_id, "project_working_reports", "Working Reports");
          if (target) {
            if (!ctx.wrContext) {
              const templates = await ctx.base44.asServiceRole.entities.WorkingReportTemplate.list("name", 50).catch(() => []);
              ctx.wrContext = {
                template: (templates || []).find((t: any) => t.is_default) || (templates || [])[0] || null,
                assetFields: await loadActiveAssetFields(ctx.base44).catch(() => []),
              };
            }
            const built = await buildWorkingReportFor(ctx, task, report);
            await ctx.helpers.mirrorGenerated({
              mappingKey: row.file_url,
              fileName: row.entity_name || `WR_${report.reference || report.id}.pdf`,
              folderId: target.folderId,
              entityType: "wr_pdf",
              entityId: report.id,
              context: target.link,
              build: async () => ({ bytes: built, contentType: "application/pdf" }),
            });
            continue;
          }
        }
        await ctx.helpers.dropMapping(row, false);
        continue;
      }

      // Regular app file — re-upload it into the folder its mapping points at.
      await ctx.helpers.mirrorUrlFile({
        fileUrl: row.file_url,
        fileName: row.entity_name || "file",
        folderId: row.drive_folder_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        context: row.status,
      });
    } catch (err: any) {
      ctx.session.errors.push(`${row.entity_type || "file"} ${row.entity_name || row.id}: ${err?.message || err}`);
    }
  }

  return { processed: page.items.length, hasMore: page.hasMore, cursor: page.cursor, cursorIds: page.cursorIds, item: "Deletions & restores" };
}

const PHASE_RUNNERS: Record<string, (ctx: any) => Promise<any>> = {
  root: phaseRoot,
  org_files: phaseOrgFiles,
  contact_files: phaseContactFiles,
  shared_files: phaseSharedFiles,
  project_files: phaseProjectFiles,
  task_photos: phaseTaskPhotos,
  employee_docs: phaseEmployeeDocs,
  asset_files: phaseAssetFiles,
  wr: phaseWorkingReports,
  verify: phaseVerify,
};

/** Run one batch of the given phase. */
export async function runPhaseBatch(base44: any, helpers: any, phase: string, session: any) {
  const recordCache = new Map<string, any>();
  const listCache = new Map<string, any[]>();
  const ctx = {
    base44,
    helpers,
    session,
    wrContext: null as any,
    cache: {
      async get(entityName: string, id: string, allowMissing = false) {
        if (!id) return null;
        const key = `${entityName}|${id}`;
        if (recordCache.has(key)) return recordCache.get(key);
        let record: any = null;
        try {
          const rows = await base44.asServiceRole.entities[entityName].filter({ id }, "-created_date", 1);
          record = (rows || [])[0] || null;
        } catch {
          record = null;
        }
        recordCache.set(key, record);
        return record;
      },
      async getList(entityName: string, query: Record<string, any>, sort: string, limit: number) {
        const key = `${entityName}|${JSON.stringify(query)}`;
        if (listCache.has(key)) return listCache.get(key);
        const rows = await base44.asServiceRole.entities[entityName].filter(query, sort, limit).catch(() => []);
        listCache.set(key, rows || []);
        return listCache.get(key)!;
      },
    },
  };

  const runner = PHASE_RUNNERS[phase];
  if (!runner) throw new Error(`Unknown mirror phase: ${phase}`);
  return await runner(ctx);
}