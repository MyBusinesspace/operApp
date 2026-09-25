import { createClientFromRequest } from "npm:@base44/sdk@0.8.44";
import { createGoogleDriveHelpers } from "../../shared/googleDriveHelpers.ts";
import { buildWorkingReportPdf, dayKey, loadActiveAssetFields } from "../../shared/workingReportPdf.ts";

// Flat modular structure — each stage is independent.
// Init creates all fixed folders; data stages just look up their parent from cache
// and create a single entity folder inside it. No dynamic parent-chain resolution.
const STAGE_ORDER = ["init", "organization", "business_companies", "business_projects", "business_assets", "tasks"];
const WORKFLOW_BATCH_SIZE = 20;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Module definitions — created flat in init, each in its own try/catch.
const MODULES = [
  { type: "module_organization", name: "Organization", subfolders: [] as { type: string; name: string }[] },
  { type: "module_business", name: "Business", subfolders: [
    { type: "sub_companies", name: "Companies" },
    { type: "sub_projects", name: "Projects" },
    { type: "sub_assets", name: "Assets" },
  ]},
  { type: "module_operations", name: "Operations", subfolders: [
    { type: "sub_workorders", name: "Work Orders" },
    { type: "sub_tasks", name: "Tasks" },
  ]},
  { type: "module_hr", name: "HR", subfolders: [
    { type: "sub_timesheets", name: "Time Sheets" },
    { type: "sub_employees", name: "Employees" },
    { type: "sub_leaves", name: "Leaves" },
    { type: "sub_payroll", name: "Payroll" },
  ]},
  { type: "module_sales", name: "Sales", subfolders: [
    { type: "sub_quotes", name: "Quotes" },
    { type: "sub_invoices", name: "Invoices" },
  ]},
  { type: "module_purchases", name: "Purchases", subfolders: [
    { type: "sub_purchase_orders", name: "Purchase Orders" },
    { type: "sub_bills", name: "Bills" },
    { type: "sub_petty_cash", name: "Petty Cash" },
  ]},
];

export default async function (req: Request): Promise<Response> {
  let body: any = {};
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    body = await req.json().catch(() => ({}));
    const stage = body.stage || "init";
    const offset = body.offset || 0;
    const limit = body.limit || 50;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("googledrive");
    const helpers = createGoogleDriveHelpers(base44, accessToken);
    const { ensureFolder, getFolderMapping, uploadFile, uploadFileBytes, sanitizeName: sName, syncDeletions, cleanupOrphanedFolders } = helpers;

    // ── processStage: handles all data-processing stages ──
    const processStage = async (stageName: string, off: number, lim: number): Promise<any> => {
      let result: any = { stage: stageName, filesUploaded: 0, filesSkipped: 0, hasMore: false, processed: 0, errors: [] };

      // ── Init: create root + all modules + subfolders (flat, independent) ──
      if (stageName === "init") {
        // Clear file cache so files always re-upload to the correct folders on a fresh run.
        // Without this, files uploaded to wrong folders in previous runs would be skipped.
        await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
          { entry_type: "file" }
        ).catch(() => {});

        const orgs = await base44.asServiceRole.entities.Organization.list();
        const companyName = sName(orgs[0]?.name || "OPERAPP_Files");

        result.currentItem = `Creating root folder: ${companyName}`;
        const rootId = await ensureFolder("root", companyName, "root_folder", "root");

        for (const mod of MODULES) {
          try {
            result.currentItem = `Creating folder: ${mod.name}`;
            const modId = await ensureFolder(rootId, mod.name, mod.type, mod.type);
            for (const sub of mod.subfolders) {
              try {
                result.currentItem = `Creating folder: ${mod.name}/${sub.name}`;
                await ensureFolder(modId, sub.name, sub.type, sub.type);
              } catch (e: any) {
                result.errors.push(`Subfolder ${mod.name}/${sub.name}: ${e.message}`);
              }
            }
          } catch (e: any) {
            result.errors.push(`Module ${mod.name}: ${e.message}`);
          }
        }

        result.message = "Modular folder structure ready";
        result.rootFolderId = rootId;
        result.currentItem = "";
      }

      // ── Organization: org files directly in Organization/ ──
      else if (stageName === "organization") {
        const orgFolderId = await getFolderMapping("module_organization", "module_organization");
        if (!orgFolderId) throw new Error("Organization module not found — run init first");

        const files = await base44.asServiceRole.entities.OrganizationFile.list("-created_date", lim, off);
        for (const file of files) {
          result.currentItem = `Org file: ${file.name || file.id}`;
          try {
            if (file.file_url) {
              const uploaded = await uploadFile(file.file_url, file.name || "file", orgFolderId, "organization", "Organization");
              if (uploaded) result.filesUploaded++; else result.filesSkipped++;
            }
          } catch (e: any) {
            result.errors.push(`Org file ${file.name || file.id}: ${e.message}`);
          }
        }
        result.hasMore = files.length === lim;
        result.processed = files.length;
      }

      // ── Contacts → Business/Companies/[Contact_Name]/ ──
      else if (stageName === "business_companies") {
        const parentFolderId = await getFolderMapping("sub_companies", "sub_companies");
        if (!parentFolderId) throw new Error("Companies subfolder not found — run init first");

        const contacts = await base44.asServiceRole.entities.Contact.list("-created_date", lim, off);
        for (const contact of contacts) {
          result.currentItem = `Company: ${contact.full_name || contact.id}`;
          try {
            const contactName = sName(contact.full_name || "Unnamed Contact");
            const contactFolderId = await ensureFolder(parentFolderId, contactName, "contact", contact.id);

            const files = await base44.asServiceRole.entities.ContactFile.filter(
              { contact_id: contact.id }, "-created_date", 500
            );
            for (const file of files) {
              if (file.file_url) {
                const uploaded = await uploadFile(file.file_url, file.file_name || "file", contactFolderId, "contact", contactName);
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              }
            }

            // Also upload SharedFile records linked to this contact
            const sharedFiles = await base44.asServiceRole.entities.SharedFile.filter(
              { contact_id: contact.id }, "-created_date", 500
            );
            for (const sf of sharedFiles) {
              if (sf.file_url) {
                const uploaded = await uploadFile(sf.file_url, sf.file_name || "file", contactFolderId, "contact", contactName);
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              }
            }
          } catch (e: any) {
            result.errors.push(`Contact ${contact.full_name || contact.id}: ${e.message}`);
          }
        }
        result.hasMore = contacts.length === lim;
        result.processed = contacts.length;
      }

      // ── Projects → Business/Projects/[Project_Name]/ ──
      else if (stageName === "business_projects") {
        const parentFolderId = await getFolderMapping("sub_projects", "sub_projects");
        if (!parentFolderId) throw new Error("Projects subfolder not found — run init first");

        const projects = await base44.asServiceRole.entities.Project.list("-created_date", lim, off);
        for (const project of projects) {
          result.currentItem = `Project: ${project.name || project.id}`;
          try {
            const projectName = sName(project.name || "Unnamed Project");
            const projectFolderId = await ensureFolder(parentFolderId, projectName, "project", project.id);

            const files = await base44.asServiceRole.entities.ProjectFile.filter(
              { project_id: project.id }, "-created_date", 500
            );
            for (const file of files) {
              if (file.file_url) {
                const uploaded = await uploadFile(file.file_url, file.file_name || "file", projectFolderId, "project", projectName);
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              }
            }

            // Also upload SharedFile records linked to this project
            const sharedFiles = await base44.asServiceRole.entities.SharedFile.filter(
              { project_id: project.id }, "-created_date", 500
            );
            for (const sf of sharedFiles) {
              if (sf.file_url) {
                const uploaded = await uploadFile(sf.file_url, sf.file_name || "file", projectFolderId, "project", projectName);
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              }
            }
          } catch (e: any) {
            result.errors.push(`Project ${project.name || project.id}: ${e.message}`);
          }
        }
        result.hasMore = projects.length === lim;
        result.processed = projects.length;
      }

      // ── Assets → Business/Assets/[Asset_Name]/ ──
      else if (stageName === "business_assets") {
        const parentFolderId = await getFolderMapping("sub_assets", "sub_assets");
        if (!parentFolderId) throw new Error("Assets subfolder not found — run init first");

        const assets = await base44.asServiceRole.entities.Asset.list("-created_date", lim, off);
        for (const asset of assets) {
          result.currentItem = `Asset: ${asset.name || asset.id}`;
          try {
            const assetName = sName(asset.name || "Unnamed Asset");
            const assetFolderId = await ensureFolder(parentFolderId, assetName, "asset", asset.id);

            const files = await base44.asServiceRole.entities.AssetFile.filter(
              { asset_id: asset.id }, "-created_date", 500
            );
            for (const file of files) {
              if (file.file_url) {
                const uploaded = await uploadFile(file.file_url, file.file_name || "file", assetFolderId, "asset", assetName);
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              }
            }

            // Also upload SharedFile records linked to this asset
            const sharedFiles = await base44.asServiceRole.entities.SharedFile.filter(
              { asset_id: asset.id }, "-created_date", 500
            );
            for (const sf of sharedFiles) {
              if (sf.file_url) {
                const uploaded = await uploadFile(sf.file_url, sf.file_name || "file", assetFolderId, "asset", assetName);
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              }
            }
          } catch (e: any) {
            result.errors.push(`Asset ${asset.name || asset.id}: ${e.message}`);
          }
        }
        result.hasMore = assets.length === lim;
        result.processed = assets.length;
      }

      // ── Work Orders → Operations/Work Orders/[WO_Name]/ ──
      else if (stageName === "workorders") {
        const parentFolderId = await getFolderMapping("sub_workorders", "sub_workorders");
        if (!parentFolderId) throw new Error("Work Orders subfolder not found — run init first");

        const workOrders = await base44.asServiceRole.entities.WorkOrder.list("-created_date", lim, off);
        for (const wo of workOrders) {
          result.currentItem = `Work Order: ${wo.title || wo.id}`;
          try {
            const woName = sName(wo.title || "Unnamed WO");
            const woFolderId = await ensureFolder(parentFolderId, woName, "work_order", wo.id);

            const files = await base44.asServiceRole.entities.WorkOrderFile.filter(
              { work_order_id: wo.id }, "-created_date", 500
            );
            for (const file of files) {
              if (file.file_url) {
                const uploaded = await uploadFile(file.file_url, file.file_name || "file", woFolderId, "work_order", woName);
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              }
            }
          } catch (e: any) {
            result.errors.push(`WO ${wo.title || wo.id}: ${e.message}`);
          }
        }
        result.hasMore = workOrders.length === lim;
        result.processed = workOrders.length;
      }

      // ── Tasks → Operations/[YYYY]/Tasks/[Client - Ref - Title]/ (photos + WR PDFs) ──
      else if (stageName === "tasks") {
        const operationsFolderId = await getFolderMapping("module_operations", "module_operations");
        if (!operationsFolderId) throw new Error("Operations module not found — run init first");

        // Load default WR template + asset fields (cached for entire stage)
        const templates = await base44.asServiceRole.entities.WorkingReportTemplate.list("name", 50);
        const template = (templates || []).find((t: any) => t.is_default) || (templates || [])[0] || null;
        const assetFields = await loadActiveAssetFields(base44);

        const tasks = await base44.asServiceRole.entities.Task.list("-created_date", lim, off);
        for (const task of tasks) {
          result.currentItem = `Task: ${task.reference || task.title || task.id}`;
          try {
            // ── Folder path: Operations/[YYYY]/Tasks/[Client - Ref - Title]/ ──
            const taskDate = task.planning_date || task.created_date || new Date().toISOString();
            const year = String(new Date(taskDate).getFullYear() || new Date().getFullYear());
            const yearFolderId = await ensureFolder(operationsFolderId, year, "ops_year", year);
            const yearTasksFolderId = await ensureFolder(yearFolderId, "Tasks", "ops_year_tasks", `${year}_tasks`);

            const clientName = sName(task.contact_name || "Unassigned");
            const taskRef = sName(task.reference || task.id);
            const taskTitle = sName(task.title || "Untitled");
            const taskFolderName = `${clientName} - ${taskRef} - ${taskTitle}`;
            const taskFolderId = await ensureFolder(yearTasksFolderId, taskFolderName, "task", task.id);

            // ── Upload task photos ──
            if (task.photos && task.photos.length > 0) {
              for (let i = 0; i < task.photos.length; i++) {
                const photo = task.photos[i];
                if (photo.url) {
                  try {
                    await sleep(300);
                    const photoName = photo.caption || `photo_${i + 1}.jpg`;
                    const uploaded = await uploadFile(photo.url, photoName, taskFolderId, "task", taskFolderName);
                    if (uploaded) result.filesUploaded++; else result.filesSkipped++;
                  } catch (e: any) {
                    result.errors.push(`Task ${task.reference || task.id} photo ${i + 1}: ${e.message}`);
                    result.filesSkipped++;
                  }
                }
              }
            }

            // ── Generate & upload WR PDFs ──
            const workingReports = await base44.asServiceRole.entities.WorkingReport.filter(
              { task_id: task.id }, "-created_date", 500
            );
            if (workingReports.length === 0) continue;

            // Shared data for all WRs of this task
            let subtasks: any[] = [];
            try {
              subtasks = await base44.asServiceRole.entities.TaskSubtask.filter(
                { task_id: task.id }, "sort_order", 200
              );
            } catch {}
            const taskForPdf = { ...task, subtasks };

            let asset: any = null;
            if (task.asset_id) {
              try {
                const a = await base44.asServiceRole.entities.Asset.filter({ id: task.asset_id });
                asset = a[0] || null;
              } catch {}
            }

            let woContactLabel = "";
            if (task.work_order_id) {
              try {
                const cps = await base44.asServiceRole.entities.ContactPerson.filter(
                  { work_order_id: task.work_order_id }, "full_name", 50
                );
                woContactLabel = (cps || [])
                  .map((cp: any) => cp.phone ? `${cp.full_name} (${cp.phone})` : cp.full_name)
                  .filter(Boolean)
                  .join(" · ");
              } catch {}
            }

            for (const wr of workingReports) {
              try {
                let participants: any[] = [];
                try {
                  const reportDay = dayKey(wr.clock_in_time);
                  const taskEntries = await base44.asServiceRole.entities.TimeEntry.filter(
                    { task_id: task.id }, "clock_in_time", 200
                  );
                  participants = (taskEntries || [])
                    .filter((te: any) => !reportDay || dayKey(te.clock_in_time) === reportDay)
                    .map((te: any) => ({
                      employee_id: te.employee_id,
                      employee_name: te.employee_name,
                      clock_in_time: te.clock_in_time,
                      clock_out_time: te.clock_out_time,
                    }));
                } catch {}

                const entryForPdf = {
                  ...wr,
                  participants,
                  report_reference: wr.reference,
                };

                const pdf = await buildWorkingReportPdf({
                  template,
                  entry: entryForPdf,
                  task: taskForPdf,
                  asset,
                  woContactLabel,
                  assetFields,
                });

                const pdfBytes = pdf.output("arraybuffer");
                const pdfFileName = `WR_${wr.reference || wr.id}.pdf`;

                await sleep(300);
                const uploaded = await uploadFileBytes(
                  pdfBytes, pdfFileName, "application/pdf",
                  taskFolderId, "task_wr", taskFolderName,
                  `wr_pdf:${wr.id}`
                );
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              } catch (e: any) {
                result.errors.push(`Task ${task.reference || task.id} WR ${wr.reference || wr.id}: ${e.message}`);
                result.filesSkipped++;
              }
            }
          } catch (e: any) {
            result.errors.push(`Task ${task.title || task.id}: ${e.message}`);
          }
        }
        result.hasMore = tasks.length === lim;
        result.processed = tasks.length;
      }

      // ── Employees → HR/Employees/[Employee_Name]/ ──
      else if (stageName === "employees") {
        const parentFolderId = await getFolderMapping("sub_employees", "sub_employees");
        if (!parentFolderId) throw new Error("Employees subfolder not found — run init first");

        const employees = await base44.asServiceRole.entities.Employee.list("-created_date", lim, off);
        for (const emp of employees) {
          result.currentItem = `Employee: ${emp.full_name || emp.id}`;
          try {
            const empName = sName(emp.full_name || "Unnamed Employee");
            const empFolderId = await ensureFolder(parentFolderId, empName, "employee", emp.id);

            const docs = await base44.asServiceRole.entities.EmployeeDocument.filter(
              { employee_id: emp.id }, "-created_date", 500
            );
            for (const doc of docs) {
              if (doc.file_url) {
                const uploaded = await uploadFile(doc.file_url, doc.file_name || "document", empFolderId, "employee", empName);
                if (uploaded) result.filesUploaded++; else result.filesSkipped++;
              }
            }
          } catch (e: any) {
            result.errors.push(`Employee ${emp.full_name || emp.id}: ${e.message}`);
          }
        }
        result.hasMore = employees.length === lim;
        result.processed = employees.length;
      }

      return result;
    };

    let result: any = { stage, filesUploaded: 0, filesSkipped: 0, hasMore: false, processed: 0 };

    // ── Direct stage calls (frontend per-stage refresh) ──
    if (STAGE_ORDER.includes(stage)) {
      const batchSz = stage === "tasks" ? Math.min(limit, 3) : Math.min(limit, 5);
      if (offset > 0) {
        await new Promise(resolve => setTimeout(resolve, 4000));
      }
      result = await processStage(stage, offset, batchSz);

      // Save checkpoint so we can resume after a rate-limit failure
      if (result.hasMore) {
        const nextOffset = offset + batchSz;
        await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
          { entry_type: "checkpoint", entity_type: stage }
        ).catch(() => {});
        await base44.asServiceRole.entities.GoogleDriveExportState.create({
          entry_type: "checkpoint",
          entity_type: stage,
          entity_id: String(nextOffset),
          run_date: new Date().toISOString(),
        }).catch(() => {});
      } else {
        await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
          { entry_type: "checkpoint", entity_type: stage }
        ).catch(() => {});
      }
    }

    // ── next_batch: workflow-driven, processes one batch and updates the run record ──
    else if (stage === "next_batch") {
      const runId = body.run_id;
      if (!runId) return Response.json({ error: "run_id required" }, { status: 400 });

      await new Promise(resolve => setTimeout(resolve, 5000));

      const run = await base44.asServiceRole.entities.GoogleDriveExportRun.get(runId);

      if (run.status !== "running") {
        return Response.json({
          hasMore: false,
          stage: "cancelled",
          filesUploaded: run.files_uploaded || 0,
          filesSkipped: run.files_skipped || 0,
        });
      }

      let currentStage = run.current_stage || "init";
      let currentOffset = run.current_offset || 0;
      let totalUploaded = run.files_uploaded || 0;
      let totalSkipped = run.files_skipped || 0;

      const stageBatchSize = currentStage === "tasks" ? 3 : WORKFLOW_BATCH_SIZE;
      let batchResult: any;
      try {
        batchResult = await processStage(currentStage, currentOffset, stageBatchSize);
      } catch (batchErr) {
        batchResult = { filesUploaded: 0, filesSkipped: 0, hasMore: true, errors: [batchErr.message] };
      }
      totalUploaded += batchResult.filesUploaded || 0;
      totalSkipped += batchResult.filesSkipped || 0;

      let nextStage = currentStage;
      let nextOffset = currentOffset + stageBatchSize;
      let hasMore = batchResult.hasMore;

      if (!hasMore) {
        const stageIndex = STAGE_ORDER.indexOf(currentStage);
        if (stageIndex < STAGE_ORDER.length - 1) {
          nextStage = STAGE_ORDER[stageIndex + 1];
          nextOffset = 0;
          hasMore = true;
        } else {
          await base44.asServiceRole.entities.GoogleDriveExportRun.update(runId, {
            status: "completed",
            current_stage: "done",
            current_offset: 0,
            files_uploaded: totalUploaded,
            files_skipped: totalSkipped,
            current_item: "",
          });
          result = { hasMore: false, stage: "done", filesUploaded: totalUploaded, filesSkipped: totalSkipped };
          return Response.json(result);
        }
      }

      await base44.asServiceRole.entities.GoogleDriveExportRun.update(runId, {
        current_stage: nextStage,
        current_offset: nextOffset,
        files_uploaded: totalUploaded,
        files_skipped: totalSkipped,
        current_item: batchResult.currentItem || "",
      });

      result = { hasMore, stage: nextStage, offset: nextOffset, filesUploaded: totalUploaded, filesSkipped: totalSkipped };
    }

    // ── Get checkpoint (for resume) ──
    else if (stage === "get_checkpoint") {
      const checkpoints = await base44.asServiceRole.entities.GoogleDriveExportState.filter(
        { entry_type: "checkpoint", entity_type: body.checkpoint_stage }
      ).catch(() => []);
      result.checkpoint = checkpoints[0] || null;
    }

    // ── Get all checkpoints ──
    else if (stage === "get_all_checkpoints") {
      const allCps = await base44.asServiceRole.entities.GoogleDriveExportState.filter(
        { entry_type: "checkpoint" }
      ).catch(() => []);
      const cpMap = {};
      for (const cp of allCps) {
        cpMap[cp.entity_type] = parseInt(cp.entity_id) || 0;
      }
      result.checkpoints = cpMap;
    }

    // ── Clear file cache (so deleted-from-Drive files get re-uploaded) ──
    else if (stage === "clear_file_cache") {
      // If entity_type is provided, only clear that stage's files; otherwise clear all
      if (body.entity_type) {
        await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
          { entry_type: "file", entity_type: body.entity_type }
        ).catch(() => {});
      } else {
        await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
          { entry_type: "file" }
        ).catch(() => {});
      }
      result.fileCacheCleared = true;
    }

    // ── Sync deletions: remove Drive folders for entities deleted from the app ──
    else if (stage === "sync_deletions") {
      // Tasks use a nested year-based structure: Operations/[YYYY]/Tasks/[task folder]/
      if (body.entity_type === "task") {
        const currentIds = new Set<string>();
        const currentNames = new Set<string>();
        let skip = 0;
        const batch = 200;
        while (true) {
          const items = await base44.asServiceRole.entities.Task.list("-created_date", batch, skip);
          if (!items || items.length === 0) break;
          for (const item of items) {
            currentIds.add(item.id);
            const cn = sName(item.contact_name || "Unassigned");
            const tr = sName(item.reference || item.id);
            const tt = sName(item.title || "Untitled");
            currentNames.add(`${cn} - ${tr} - ${tt}`);
          }
          if (items.length < batch) break;
          skip += batch;
        }

        const syncResult = await syncDeletions("task", currentIds);

        let orphanDeleted: string[] = [];
        let orphanChecked = 0;
        const operationsFolderId = await getFolderMapping("module_operations", "module_operations");
        if (operationsFolderId) {
          const yearFolders = await helpers.listChildren(operationsFolderId);
          for (const yf of yearFolders) {
            const tasksFolders = await helpers.listChildren(yf.id);
            for (const tf of tasksFolders) {
              if (tf.name === "Tasks") {
                const orphanResult = await cleanupOrphanedFolders(tf.id, currentNames, "task");
                orphanDeleted.push(...orphanResult.deleted);
                orphanChecked += orphanResult.checked;
              }
            }
          }
        }

        result.deletedFolders = [...syncResult.deleted, ...orphanDeleted];
        result.checked = syncResult.checked;
        result.orphanChecked = orphanChecked;
        result.synced = true;
        return Response.json(result);
      }

      const entityTypeMap: Record<string, { entity: string; subfolder: string; nameField: string }> = {
        contact: { entity: "Contact", subfolder: "sub_companies", nameField: "full_name" },
        project: { entity: "Project", subfolder: "sub_projects", nameField: "name" },
        asset: { entity: "Asset", subfolder: "sub_assets", nameField: "name" },
      };
      const config = entityTypeMap[body.entity_type];
      if (!config) return Response.json({ error: "Invalid entity_type" }, { status: 400 });

      // Fetch all current entity IDs and names (paginated to bypass API caps)
      const currentIds = new Set<string>();
      const currentNames = new Set<string>();
      let skip = 0;
      const batch = 200;
      while (true) {
        const items = await base44.asServiceRole.entities[config.entity].list("-created_date", batch, skip);
        if (!items || items.length === 0) break;
        for (const item of items) {
          currentIds.add(item.id);
          currentNames.add(sName(item[config.nameField] || item.name || ""));
        }
        if (items.length < batch) break;
        skip += batch;
      }

      // DB-based sync: remove Drive folders for entities deleted from the app
      const syncResult = await syncDeletions(body.entity_type, currentIds);

      // Drive-based sync: remove orphaned folders (e.g., "C (Copy)") that don't
      // match any current entity name — catches folders created by Google Drive's
      // copy operation or stale folders from renamed entities
      let orphanDeleted: string[] = [];
      let orphanChecked = 0;
      const parentFolderId = await getFolderMapping(config.subfolder, config.subfolder);
      if (parentFolderId) {
        const orphanResult = await cleanupOrphanedFolders(parentFolderId, currentNames, body.entity_type);
        orphanDeleted = orphanResult.deleted;
        orphanChecked = orphanResult.checked;
      }

      result.deletedFolders = [...syncResult.deleted, ...orphanDeleted];
      result.checked = syncResult.checked;
      result.orphanChecked = orphanChecked;
      result.synced = true;
    }

    // ── Clear checkpoint (restart from beginning) ──
    else if (stage === "clear_checkpoint") {
      await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
        { entry_type: "checkpoint", entity_type: body.checkpoint_stage }
      ).catch(() => {});
      result.checkpointCleared = true;
    }

    // ── Status ──
    else if (stage === "status") {
      const runs = await base44.asServiceRole.entities.GoogleDriveExportState.filter(
        { entry_type: "run" }, "-run_date", 10
      );
      const fileMappings = await base44.asServiceRole.entities.GoogleDriveExportState.filter(
        { entry_type: "file" }, "-created_date", 1
      );
      result.lastRuns = runs;
      result.totalFilesExported = fileMappings.length;
    }

    // ── Counts: total documents in the app per stage ──
    else if (stage === "counts") {
      // Paginated count — list() is API-capped per request, so we batch-count
      const countAll = async (entityName: string): Promise<number> => {
        let total = 0;
        let skip = 0;
        const batch = 200;
        while (true) {
          const items = await base44.asServiceRole.entities[entityName].list("-created_date", batch, skip);
          if (!items || items.length === 0) break;
          total += items.length;
          if (items.length < batch) break;
          skip += batch;
        }
        return total;
      };

      const [orgCount, contactCount, projectCount, assetCount, sharedCount, wrCount] = await Promise.all([
        countAll("OrganizationFile"),
        countAll("ContactFile"),
        countAll("ProjectFile"),
        countAll("AssetFile"),
        countAll("SharedFile"),
        countAll("WorkingReport"),
      ]);

      const counts = {
        organization: orgCount,
        business: contactCount + projectCount + assetCount + sharedCount,
        operations: wrCount,
      };
      counts.total = counts.organization + counts.business + counts.operations;
      result.counts = counts;
    }

    // ── Cleanup: delete old non-module folders from root and clear file cache ──
    else if (stage === "cleanup") {
      const rootFolderId = await getFolderMapping("root_folder", "root");
      if (!rootFolderId) throw new Error("Root folder not found — run init first");

      const validModuleNames = MODULES.map(m => m.name);
      const deletedFolders = await helpers.cleanupOldFolders(rootFolderId, validModuleNames);

      // Clear file cache so files get re-uploaded to new structure
      await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
        { entry_type: "file" }
      ).catch(() => {});

      // Clear checkpoints
      await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
        { entry_type: "checkpoint" }
      ).catch(() => {});

      // Clear entity-level folder mappings (keep module/subfolder mappings)
      const entityTypesToDelete = ["contact", "project", "asset", "work_order", "task", "employee", "contact_projects", "project_workorders", "wo_tasks", "contacts_root", "workers_root", "unlinked", "task_wr", "ops_year", "ops_year_tasks"];
      for (const type of entityTypesToDelete) {
        await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
          { entry_type: "folder", entity_type: type }
        ).catch(() => {});
      }

      result.deletedFolders = deletedFolders;
      result.fileCacheCleared = true;
      result.message = `Deleted ${deletedFolders.length} old folders and cleared file cache`;
    }

    // ── Complete: log the run ──
    else if (stage === "complete") {
      let filesUploaded = body.filesUploaded || 0;
      let filesSkipped = body.filesSkipped || 0;
      if (body.run_id) {
        const run = await base44.asServiceRole.entities.GoogleDriveExportRun.get(body.run_id).catch(() => null);
        if (run) {
          filesUploaded = run.files_uploaded || 0;
          filesSkipped = run.files_skipped || 0;
        }
      }
      const runRecord = await base44.asServiceRole.entities.GoogleDriveExportState.create({
        entry_type: "run",
        run_date: new Date().toISOString(),
        files_uploaded: filesUploaded,
        files_skipped: filesSkipped,
        status: "completed",
      });
      result.run = runRecord;
    }

    return Response.json(result);
  } catch (error) {
    if (body?.stage === "next_batch" && body?.run_id) {
      try {
        const base44 = createClientFromRequest(req);
        await base44.asServiceRole.entities.GoogleDriveExportRun.update(body.run_id, {
          status: "failed",
          error: error.message,
        });
      } catch {}
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
}