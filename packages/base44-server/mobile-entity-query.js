/**
 * Vercel-only entityQuery handler.
 *
 * Base44's apiAuth entityQuery ignores `skip` on `operation=list` and caps
 * limit at 500. We answer the same URL/action here so the mobile app can page
 * when BACKEND=vercel — without editing base44/functions/**.
 */
import { authenticateMobileEmployee } from "./mobile-auth.js";

/** Same allowlist as apiAuth entityQuery. */
const ENTITY_QUERY_ALLOWLIST = new Set([
  "Asset",
  "AssetCategory",
  "AssetFile",
  "AssetGroup",
  "AssetNote",
  "AssetStatus",
  "Bill",
  "Contact",
  "ContactCategory",
  "ContactFile",
  "ContactGroup",
  "ContactNote",
  "ContactPerson",
  "ContactStatus",
  "DocumentFile",
  "Employee",
  "EmployeeDocument",
  "EmployeeDocumentType",
  "EmployeeGroup",
  "EmployeeRole",
  "EmployeeStatus",
  "FileType",
  "Invoice",
  "OperationsSettings",
  "Organization",
  "OrganizationFile",
  "Project",
  "ProjectCategory",
  "ProjectFile",
  "ProjectNote",
  "ProjectStatus",
  "RolePermission",
  "Task",
  "TaskSubtask",
  "Team",
  "TimeEntry",
  "TimeEntryPhoto",
  "WorkOrder",
  "WorkOrderFile",
  "WorkOrderStatus",
]);

function json(data, status = 200) {
  return Response.json(data, { status });
}

/**
 * @returns {Promise<Response|null>} null → fall through to the Base44 function
 */
export async function tryHandleEntityQuery(request, body) {
  if (body?.action !== "entityQuery") return null;

  const auth = await authenticateMobileEmployee(request, body);
  if (auth.error) return auth.error;

  const entity = body.entity;
  const operation = body.operation || "filter";
  if (!entity || !ENTITY_QUERY_ALLOWLIST.has(entity)) {
    return json({ error: "Entity not allowed." }, 403);
  }

  const entityApi = auth.base44.asServiceRole.entities[entity];
  const sort = body.sort || "-created_date";
  // Vercel path: honour the client's limit (capped high). Base44 capped at 500.
  const limit = Math.min(Math.max(1, Number(body.limit) || 100), 2000);
  const skip = Math.max(0, Number(body.skip) || 0);
  const filter = body.filter || body.query || {};

  let rows = [];
  if (operation === "list") {
    // Fetch one extra row so the client knows whether another page exists.
    const page = await entityApi.list(sort, limit + 1, skip);
    const hasMore = page.length > limit;
    rows = hasMore ? page.slice(0, limit) : page;
    return json({
      success: true,
      data: rows,
      skip,
      limit,
      has_more: hasMore,
      next_skip: hasMore ? skip + rows.length : null,
      acting_user_id: auth.actingUserId,
      employee_id: auth.employeeId,
    });
  }

  if (operation === "get") {
    const id = body.id;
    if (!id) return json({ error: "id is required for get" }, 400);
    const found = await entityApi.filter({ id }, undefined, 1, 0);
    rows = found?.length ? [found[0]] : [];
    return json({
      success: true,
      data: rows,
      acting_user_id: auth.actingUserId,
      employee_id: auth.employeeId,
    });
  }

  const page = await entityApi.filter(filter, sort, limit + 1, skip);
  const hasMore = page.length > limit;
  rows = hasMore ? page.slice(0, limit) : page;
  return json({
    success: true,
    data: rows,
    skip,
    limit,
    has_more: hasMore,
    next_skip: hasMore ? skip + rows.length : null,
    acting_user_id: auth.actingUserId,
    employee_id: auth.employeeId,
  });
}
