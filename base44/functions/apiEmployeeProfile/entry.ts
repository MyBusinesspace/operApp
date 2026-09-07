import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { Jimp } from "npm:jimp@1.6.0";

const AVATAR_OUTPUT_SIZE = 400;

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseFormBool(value, defaultValue = false) {
  if (value == null || value === "") return defaultValue;
  const s = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return defaultValue;
}

/** Comic Classic stylization — matches web AvatarCropperModal. */
function applyComicFilterPixels(data, width, height) {
  const gray = new Uint8ClampedArray(width * height);
  const edges = new Uint8ClampedArray(width * height);

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    gray[p] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
  }

  for (let py = 1; py < height - 1; py++) {
    for (let px = 1; px < width - 1; px++) {
      const i = py * width + px;
      const gx =
        -gray[i - width - 1] - 2 * gray[i - 1] - gray[i + width - 1] +
        gray[i - width + 1] + 2 * gray[i + 1] + gray[i + width + 1];
      const gy =
        -gray[i - width - 1] - 2 * gray[i - width] - gray[i - width + 1] +
        gray[i + width - 1] + 2 * gray[i + width] + gray[i + width + 1];
      edges[i] = Math.min(255, Math.sqrt(gx * gx + gy * gy));
    }
  }

  const levels = 5;
  const step = 255 / (levels - 1);
  const contrast = 1.35;
  const sat = 1.4;

  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    let r = (data[i] - 128) * contrast + 128;
    let g = (data[i + 1] - 128) * contrast + 128;
    let b = (data[i + 2] - 128) * contrast + 128;

    const lum = r * 0.3 + g * 0.59 + b * 0.11;
    r = lum + (r - lum) * sat;
    g = lum + (g - lum) * sat;
    b = lum + (b - lum) * sat;

    r = Math.round(Math.max(0, Math.min(255, r)) / step) * step;
    g = Math.round(Math.max(0, Math.min(255, g)) / step) * step;
    b = Math.round(Math.max(0, Math.min(255, b)) / step) * step;

    const e = edges[p];
    if (e > 60) {
      const blend = Math.min(1, e / 180);
      r = r * (1 - blend);
      g = g * (1 - blend);
      b = b * (1 - blend);
    }

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }
}

/**
 * Process avatar upload.
 * - preprocessed: client already cropped (skip center-crop)
 * - applyComicFilter: optional Comic Classic filter (default true for legacy clients)
 */
async function processAvatarFile(
  file,
  fileName = "avatar.jpg",
  { applyComicFilter = true, preprocessed = false } = {},
) {
  const input = await file.arrayBuffer();
  const image = await Jimp.read(input);

  if (!preprocessed) {
    const side = Math.min(image.bitmap.width, image.bitmap.height);
    const x = image.bitmap.width > image.bitmap.height
      ? Math.floor((image.bitmap.width - side) / 2)
      : 0;
    const y = image.bitmap.height > image.bitmap.width
      ? Math.floor((image.bitmap.height - side) / 2)
      : 0;
    image.crop({ x, y, w: side, h: side });
  }

  image.resize({ w: AVATAR_OUTPUT_SIZE, h: AVATAR_OUTPUT_SIZE });

  if (applyComicFilter) {
    const { width, height, data } = image.bitmap;
    applyComicFilterPixels(data, width, height);
  }

  const out = await image.getBuffer("image/jpeg", { quality: 92 });
  return new File([out], fileName, { type: "image/jpeg" });
}

function getEmployeeId(req) {
  return req.headers.get("x-employee-id") || null;
}

async function checkAppVersion(base44, req) {
  const clientVersion = req.headers.get("x-app-version") || null;
  try {
    const apps = await base44.asServiceRole.entities.MobileApp.list("-updated_date", 1);
    if (!apps || apps.length === 0) return null;
    const app = apps[0];
    if (clientVersion && clientVersion === app.app_version) return null;
    return { update_required: true, latest_version: app.app_version, version_description: app.version_description || "" };
  } catch { return null; }
}

function withVersion(data, va) {
  return va ? { ...data, ...va } : data;
}

/** Base44 functions are invoked at a fixed URL; sub-routes use ?path=documents etc. */
function getRoutePath(url) {
  const fromQuery = url.searchParams.get("path");
  if (fromQuery) return fromQuery.replace(/^\/+/, "");

  const parts = url.pathname.split("/").filter(Boolean);
  const fnIndex = parts.lastIndexOf("apiEmployeeProfile");
  if (fnIndex >= 0 && fnIndex < parts.length - 1) {
    return parts.slice(fnIndex + 1).join("/");
  }
  return "";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const employeeId = getEmployeeId(req);
    if (!employeeId) {
      return json({ error: "Missing x-employee-id header" }, 401);
    }

    const va = await checkAppVersion(base44, req);
    if (va) return json(va, 426);
    const url = new URL(req.url);
    const path = getRoutePath(url);
    const method = req.method.toUpperCase();

    // ─── Employee CRUD ───────────────────────────────────────────────────────

    // GET /profile — get own profile
    if (path === "profile" && method === "GET") {
      const employee = await base44.asServiceRole.entities.Employee.get(employeeId);
      if (!employee) return json({ error: "Employee not found" }, 404);
      return json(withVersion(employee, va));
    }

    // PUT /profile — update own profile
    if (path === "profile" && method === "PUT") {
      const body = await req.json();
      // Restrict which fields an employee can update on their own profile
      const allowed = ["phone", "notes", "avatar_url"];
      const update = {};
      for (const key of allowed) {
        if (key in body) update[key] = body[key];
      }
      if (Object.keys(update).length === 0) {
        return json({ error: "No updatable fields provided. Allowed: phone, notes, avatar_url" }, 400);
      }
      const updated = await base44.asServiceRole.entities.Employee.update(employeeId, update);
      return json(withVersion(updated, va));
    }

    // POST /avatar (or /profile/avatar) — upload avatar (optional Comic Classic filter)
    if ((path === "avatar" || path === "profile/avatar") && method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return json({ error: "Expected multipart/form-data" }, 400);
      }

      const formData = await req.formData();
      const file = formData.get("file");
      if (!file || typeof file === "string") {
        return json({ error: "Missing file in form data" }, 400);
      }

      // Legacy uploads omit these → center-crop + comic filter (previous behavior).
      // Mobile cropper sends preprocessed=1 and apply_comic_filter=0|1.
      const applyComicFilter = parseFormBool(
        formData.get("apply_comic_filter"),
        true,
      );
      const preprocessed = parseFormBool(formData.get("preprocessed"), false);

      const employee = await base44.asServiceRole.entities.Employee.get(employeeId);
      if (!employee) return json({ error: "Employee not found" }, 404);

      const processedFile = await processAvatarFile(
        file,
        `avatar_${employeeId}.jpg`,
        { applyComicFilter, preprocessed },
      );
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({
        file: processedFile,
      });
      const updated = await base44.asServiceRole.entities.Employee.update(
        employeeId,
        { avatar_url: uploadResult.file_url },
      );
      return json(withVersion(updated, va));
    }

    // ─── Payroll Profile ─────────────────────────────────────────────────────

    // GET /payroll-profile — get own payroll profile
    if (path === "payroll-profile" && method === "GET") {
      const profiles = await base44.asServiceRole.entities.EmployeePayrollProfile.filter({ employee_id: employeeId });
      if (!profiles || profiles.length === 0) return json({ error: "Payroll profile not found" }, 404);
      return json(profiles[0]);
    }

    // ─── Documents ───────────────────────────────────────────────────────────

    // GET /documents — list own documents
    if (path === "documents" && method === "GET") {
      const docs = await base44.asServiceRole.entities.EmployeeDocument.filter({ employee_id: employeeId }, "-created_date");
      return json(docs);
    }

    // GET /documents/:id — get a specific document
    const docMatch = path.match(/^documents\/([^/]+)$/);
    if (docMatch && method === "GET") {
      const docId = docMatch[1];
      const doc = await base44.asServiceRole.entities.EmployeeDocument.get(docId);
      if (!doc) return json({ error: "Document not found" }, 404);
      if (doc.employee_id !== employeeId) return json({ error: "Forbidden" }, 403);
      return json(doc);
    }

    // POST /documents/upload — upload a document file + create record
    // Expects multipart/form-data with:
    //   file          — the file binary
    //   document_type_id — required
    //   document_type_name — optional cached name
    //   file_name     — original filename
    //   expiry_date   — optional
    //   notes         — optional
    if (path === "documents/upload" && method === "POST") {
      const contentType = req.headers.get("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return json({ error: "Expected multipart/form-data" }, 400);
      }

      const formData = await req.formData();
      const file = formData.get("file");
      const documentTypeId = formData.get("document_type_id");
      const documentTypeName = formData.get("document_type_name") || "";
      const fileName = formData.get("file_name") || (file?.name) || "document";
      const expiryDate = formData.get("expiry_date") || null;
      const notes = formData.get("notes") || "";

      if (!file || typeof file === "string") {
        return json({ error: "Missing file in form data" }, 400);
      }
      if (!documentTypeId) {
        return json({ error: "Missing document_type_id" }, 400);
      }

      // Fetch employee to get the name
      const employee = await base44.asServiceRole.entities.Employee.get(employeeId);
      if (!employee) return json({ error: "Employee not found" }, 404);

      // Upload file via Base44 storage
      const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      const fileUrl = uploadResult.file_url;

      // Create document record
      const docData = {
        employee_id: employeeId,
        employee_name: employee.full_name || "",
        document_type_id: documentTypeId,
        document_type_name: documentTypeName,
        file_url: fileUrl,
        file_name: fileName,
        ...(expiryDate ? { expiry_date: expiryDate } : {}),
        ...(notes ? { notes } : {}),
      };
      const created = await base44.asServiceRole.entities.EmployeeDocument.create(docData);
      return json(created, 201);
    }

    // PUT /documents/:id — update document metadata
    if (docMatch && method === "PUT") {
      const docId = docMatch[1];
      const existing = await base44.asServiceRole.entities.EmployeeDocument.get(docId);
      if (!existing) return json({ error: "Document not found" }, 404);
      if (existing.employee_id !== employeeId) return json({ error: "Forbidden" }, 403);

      const body = await req.json();
      const allowed = ["document_type_id", "document_type_name", "file_name", "expiry_date", "notes"];
      const update = {};
      for (const key of allowed) {
        if (key in body) update[key] = body[key];
      }
      const updated = await base44.asServiceRole.entities.EmployeeDocument.update(docId, update);
      return json(updated);
    }

    // DELETE /documents/:id — delete own document
    if (docMatch && method === "DELETE") {
      const docId = docMatch[1];
      const existing = await base44.asServiceRole.entities.EmployeeDocument.get(docId);
      if (!existing) return json({ error: "Document not found" }, 404);
      if (existing.employee_id !== employeeId) return json({ error: "Forbidden" }, 403);
      await base44.asServiceRole.entities.EmployeeDocument.delete(docId);
      return json({ success: true });
    }

    // ─── Document Types (lookup) ─────────────────────────────────────────────

    // GET /document-types — list available document types
    if (path === "document-types" && method === "GET") {
      const types = await base44.asServiceRole.entities.EmployeeDocumentType.list();
      return json(types);
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});