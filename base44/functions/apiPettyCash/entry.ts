import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function base64ToFile(imageBase64, fileName, mimeType) {
  const binary = atob(imageBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], fileName || 'receipt.jpg', { type: mimeType || 'image/jpeg' });
}

async function uploadBase64Image(base44, { image_base64, file_name, mime_type }) {
  if (!image_base64) throw new Error('image_base64 is required');
  const file = base64ToFile(image_base64, file_name, mime_type);
  const result = await base44.integrations.Core.UploadFile({ file });
  return result.file_url;
}

async function checkAppVersion(base44, req) {
  const clientVersion = req.headers.get('x-app-version') || null;
  try {
    const apps = await base44.asServiceRole.entities.MobileApp.list('-updated_date', 1);
    if (!apps || apps.length === 0) return null;
    const app = apps[0];
    if (clientVersion && clientVersion === app.app_version) return null;
    return { update_required: true, latest_version: app.app_version, version_description: app.version_description || '' };
  } catch { return null; }
}

function withVersion(data, va) {
  return va ? { ...data, ...va } : data;
}

async function findEmployeeById(base44, employeeId) {
  try {
    const employees = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    return employees[0] ?? null;
  } catch (err) {
    const message = String(err?.message || err);
    if (/not found|invalid id/i.test(message)) return null;
    throw err;
  }
}

function entryIdFromPath(pathname) {
  const pathParts = pathname.split('/').filter(Boolean);
  const fnIndex = pathParts.indexOf('apiPettyCash');
  if (fnIndex < 0 || pathParts.length <= fnIndex + 1) return null;
  return pathParts[fnIndex + 1];
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: employee_id from header instead of base44 user auth
    const employeeId = req.headers.get('x-employee-id');
    if (!employeeId) {
      return Response.json({ error: 'Missing x-employee-id header' }, { status: 401 });
    }

    // Verify employee exists
    const employee = await findEmployeeById(base44, employeeId);
    if (!employee) {
      return Response.json({ error: 'Employee not found' }, { status: 403 });
    }
    const va = await checkAppVersion(base44, req);
    if (va) return Response.json(va, { status: 426 });

    const url = new URL(req.url);
    const method = req.method.toUpperCase();

    // Optional entry ID segment after /apiPettyCash/{id}
    const entryId = entryIdFromPath(url.pathname);

    // ─── LIST ────────────────────────────────────────────────────────────────
    // GET /apiPettyCash
    if (method === 'GET' && !entryId) {
      const status = url.searchParams.get('status');
      const type = url.searchParams.get('type');
      const fromDate = url.searchParams.get('from');
      const toDate = url.searchParams.get('to');
      const projectId = url.searchParams.get('project_id');
      const workOrderId = url.searchParams.get('work_order_id');

      const filter = {
        employee_id: employeeId,
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
        ...(projectId ? { project_id: projectId } : {}),
        ...(workOrderId ? { work_order_id: workOrderId } : {}),
      };

      let entries = [];
      try {
        entries = await base44.asServiceRole.entities.PettyCashEntry.filter(filter, '-date', 100);
      } catch (err) {
        const message = String(err?.message || err);
        if (!/not found|invalid id/i.test(message)) throw err;
      }

      // Date range filtering (post-filter since SDK doesn't support range queries)
      if (fromDate) entries = entries.filter(e => e.date >= fromDate);
      if (toDate) entries = entries.filter(e => e.date <= toDate);

      return Response.json(withVersion({ success: true, entries, count: entries.length }, va));
    }

    // ─── GET BY ID ───────────────────────────────────────────────────────────
    // GET /apiPettyCash  with { id } in body — or pass id as query param ?id=xxx
    if (method === 'GET' && entryId) {
      const results = await base44.asServiceRole.entities.PettyCashEntry.filter({ id: entryId });
      const entry = results[0];
      if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });

      // Employees can only read their own entries
      if (entry.employee_id !== employeeId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }

      return Response.json(withVersion({ success: true, entry }, va));
    }

    // ─── CREATE / EXTRACT ─────────────────────────────────────────────────────
    // POST /apiPettyCash
    if (method === 'POST') {
      const body = await req.json();

      if (body.action === 'upload_receipt') {
        const { image_base64, file_name, mime_type } = body;
        const file_url = await uploadBase64Image(base44, { image_base64, file_name, mime_type });
        return Response.json({ success: true, file_url, url: file_url });
      }

      if (body.action === 'extract_receipt') {
        const { receipt_url } = body;
        if (!receipt_url) {
          return Response.json({ error: 'receipt_url is required' }, { status: 400 });
        }

        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `You are an expense receipt parser. Analyze this receipt image and extract the following information. Be precise with numbers.

Return a JSON object with these fields:
- provider: string (store/vendor name, or null)
- note_number: string (receipt/invoice number, or null)
- date: string in YYYY-MM-DD format (or null if not found)
- amount: number (total amount paid, numbers only)
- currency: string (3-letter code, default AED if not clear)
- note: string (brief description of what was purchased, max 100 chars)
- category: one of ["Fuel", "Food & Drinks", "Materials", "Transport", "Office Supplies", "Maintenance", "Utilities", "Entertainment", "Other"]

Return ONLY the JSON, no other text.`,
          file_urls: [receipt_url],
          response_json_schema: {
            type: 'object',
            properties: {
              provider: { type: 'string' },
              note_number: { type: 'string' },
              date: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string' },
              note: { type: 'string' },
              category: { type: 'string' },
            },
          },
        });

        return Response.json({ success: true, extracted: result });
      }

      const { date, amount, type, provider, note_number, note, currency, category,
              project_id, project_name, work_order_id, work_order_name, receipt_url, ai_extracted } = body;

      if (!date || amount === undefined || !type) {
        return Response.json({ error: 'date, amount and type are required' }, { status: 400 });
      }
      if (!['expense', 'income'].includes(type)) {
        return Response.json({ error: 'type must be "expense" or "income"' }, { status: 400 });
      }

      const entry = await base44.asServiceRole.entities.PettyCashEntry.create({
        employee_id: employeeId,
        employee_name: employee.full_name || '',
        date,
        amount: Number(amount),
        type,
        provider: provider || '',
        note_number: note_number || '',
        note: note || '',
        currency: currency || 'AED',
        category: category || '',
        project_id: project_id || '',
        project_name: project_name || '',
        work_order_id: work_order_id || '',
        work_order_name: work_order_name || '',
        receipt_url: receipt_url || '',
        ai_extracted: ai_extracted || false,
        status: 'pending',
      });

      return Response.json(withVersion({ success: true, entry }, va), { status: 201 });
    }

    // ─── UPDATE ──────────────────────────────────────────────────────────────
    // PUT /apiPettyCash  — body must include { id, ...fields }
    if (method === 'PUT') {
      const body = await req.json();
      const { id, ...rest } = body;
      if (!id) return Response.json({ error: 'id is required in request body' }, { status: 400 });

      const fields = { ...rest };

      const results = await base44.asServiceRole.entities.PettyCashEntry.filter({ id });
      const existing = results[0];
      if (!existing) return Response.json({ error: 'Entry not found' }, { status: 404 });

      // Employees can only edit their own entries; approved/rejected entries are locked
      if (existing.employee_id !== employeeId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (existing.status !== 'pending') {
        return Response.json({ error: `Cannot edit an entry with status "${existing.status}"` }, { status: 409 });
      }

      // Prevent overriding immutable fields
      delete fields.employee_id;
      delete fields.employee_name;
      delete fields.status;

      if (fields.amount !== undefined) fields.amount = Number(fields.amount);
      if (fields.type && !['expense', 'income'].includes(fields.type)) {
        return Response.json({ error: 'type must be "expense" or "income"' }, { status: 400 });
      }

      const updated = await base44.asServiceRole.entities.PettyCashEntry.update(id, fields);
      return Response.json(withVersion({ success: true, entry: updated }, va));
    }

    // ─── DELETE ──────────────────────────────────────────────────────────────
    // DELETE /apiPettyCash  — body must include { id }
    if (method === 'DELETE') {
      const body = await req.json();
      const { id } = body;
      if (!id) return Response.json({ error: 'id is required in request body' }, { status: 400 });

      const results = await base44.asServiceRole.entities.PettyCashEntry.filter({ id });
      const existing = results[0];
      if (!existing) return Response.json({ error: 'Entry not found' }, { status: 404 });

      if (existing.employee_id !== employeeId) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      if (existing.status === 'approved') {
        return Response.json({ error: 'Cannot delete an approved entry' }, { status: 409 });
      }

      await base44.asServiceRole.entities.PettyCashEntry.delete(id);
      return Response.json(withVersion({ success: true, deleted_id: id }, va));
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
});