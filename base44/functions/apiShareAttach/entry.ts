import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const DESTINATIONS = [
  {
    key: 'Contact',
    label: 'Contacts',
    desc: 'Customers, suppliers & companies',
    color: 'blue',
    nameField: 'full_name',
    subtitleField: 'company',
    // Detail pages use SharedFile (not legacy ContactFile).
    fileEntity: 'SharedFile',
    linkField: 'contact_id',
    linkNameField: 'contact_name',
    supportsFileType: true,
    requiresDocType: false,
    shared: true,
  },
  {
    key: 'Project',
    label: 'Projects',
    desc: 'Projects with location & budget',
    color: 'sky',
    nameField: 'name',
    subtitleField: 'reference',
    fileEntity: 'SharedFile',
    linkField: 'project_id',
    linkNameField: 'project_name',
    supportsFileType: true,
    requiresDocType: false,
    shared: true,
  },
  {
    key: 'WorkOrder',
    label: 'Work Orders',
    desc: 'Work orders linked to projects',
    color: 'amber',
    nameField: 'title',
    subtitleField: 'reference',
    fileEntity: 'SharedFile',
    linkField: 'work_order_id',
    linkNameField: 'work_order_name',
    supportsFileType: true,
    requiresDocType: false,
    shared: true,
  },
  {
    key: 'Asset',
    label: 'Assets',
    desc: 'Equipment, vehicles & fixed assets',
    color: 'indigo',
    nameField: 'name',
    subtitleField: 'serial_number',
    fileEntity: 'SharedFile',
    linkField: 'asset_id',
    linkNameField: 'asset_name',
    supportsFileType: true,
    requiresDocType: false,
    shared: true,
  },
  {
    key: 'Organization',
    label: 'Organization',
    desc: 'Company-wide documents & records',
    color: 'violet',
    nameField: 'name',
    subtitleField: null,
    fileEntity: 'OrganizationFile',
    linkField: 'organization_id',
    linkNameField: null,
    supportsFileType: true,
    requiresDocType: false,
  },
  {
    key: 'Employee',
    label: 'Employees',
    desc: 'Staff profiles & HR records',
    color: 'teal',
    nameField: 'full_name',
    subtitleField: 'email',
    fileEntity: 'EmployeeDocument',
    linkField: 'employee_id',
    linkNameField: 'employee_name',
    supportsFileType: false,
    requiresDocType: true,
  },
  {
    key: 'Invoice',
    label: 'Invoices',
    desc: 'Customer invoices with line items',
    color: 'emerald',
    nameField: 'number',
    subtitleField: 'contact_name',
    fileEntity: 'DocumentFile',
    linkField: 'doc_id',
    linkNameField: 'doc_number',
    supportsFileType: false,
    requiresDocType: false,
    docType: 'invoice',
  },
  {
    key: 'Bill',
    label: 'Bills',
    desc: 'Supplier bills & payables',
    color: 'orange',
    nameField: 'number',
    subtitleField: 'contact_name',
    fileEntity: 'DocumentFile',
    linkField: 'doc_id',
    linkNameField: 'doc_number',
    supportsFileType: false,
    requiresDocType: false,
    docType: 'bill',
  },
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function checkAppVersion(base44, req) {
  const clientVersion = req.headers.get('x-app-version') || null;
  try {
    const apps = await base44.asServiceRole.entities.MobileApp.list('-updated_date', 1);
    if (!apps || apps.length === 0) return null;
    const app = apps[0];
    if (clientVersion && clientVersion === app.app_version) return null;
    return {
      update_required: true,
      latest_version: app.app_version,
      version_description: app.version_description || '',
    };
  } catch {
    return null;
  }
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

function getDestination(key) {
  return DESTINATIONS.find((d) => d.key === key) || null;
}

function recordTitle(rec, dest) {
  return String(rec?.[dest.nameField] || rec?.name || rec?.title || rec?.number || 'Untitled');
}

function recordSubtitle(rec, dest) {
  if (!dest.subtitleField) return '';
  return String(rec?.[dest.subtitleField] || '');
}

function extensionFromMime(mimeType) {
  if (!mimeType) return '';
  const mime = String(mimeType).split(';')[0].trim().toLowerCase();
  const map = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/zip': 'zip',
    'application/x-zip-compressed': 'zip',
    'application/json': 'json',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'video/mp4': 'mp4',
    'audio/mpeg': 'mp3',
  };
  if (map[mime]) return map[mime];
  if (mime.startsWith('image/') || mime.startsWith('video/') || mime.startsWith('audio/')) {
    const sub = mime.split('/')[1];
    if (sub && !sub.includes('+')) return sub;
  }
  return '';
}

function ensureFileName(rawName, mimeType) {
  let name = String(rawName || '').trim().replace(/\.+$/g, '');
  if (!name) name = 'shared-file';
  // Strip Android cache-style names only when we have a better mime-based extension
  // but keep basename if it already has a real extension.
  if (/\.[A-Za-z0-9]{1,8}$/.test(name)) return name;
  const ext = extensionFromMime(mimeType);
  return ext ? `${name}.${ext}` : name;
}

async function uploadNamedFile(base44, file, fileName, mimeType) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const safeName = ensureFileName(fileName || file.name || 'shared-file', mimeType || file.type);
  const contentType = mimeType || file.type || 'application/octet-stream';
  const named = new File([bytes], safeName, { type: contentType });
  const result = await base44.asServiceRole.integrations.Core.UploadFile({ file: named });
  return {
    file_url: result.file_url,
    file_name: safeName,
    file_type: contentType,
    file_size: typeof named.size === 'number' ? named.size : bytes.byteLength,
  };
}

async function generateSimpleReference(base44, fileEntity) {
  const year = new Date().getFullYear();
  const prefix = `FILE-${year}-`;
  try {
    const recent = await base44.asServiceRole.entities[fileEntity].list('-created_date', 100);
    let max = 0;
    for (const f of recent || []) {
      const ref = String(f.reference || '');
      if (!ref.startsWith(prefix)) continue;
      const n = parseInt(ref.slice(prefix.length), 10);
      if (!Number.isNaN(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1).padStart(4, '0')}`;
  } catch {
    return `${prefix}0001`;
  }
}

function matchesQuery(rec, dest, q) {
  if (!q) return true;
  const hay = [
    recordTitle(rec, dest),
    recordSubtitle(rec, dest),
    rec?.email,
    rec?.phone,
    rec?.reference,
    rec?.serial_number,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const employeeId = req.headers.get('x-employee-id');
    if (!employeeId) {
      return json({ error: 'Missing x-employee-id header' }, 401);
    }

    const employee = await findEmployeeById(base44, employeeId);
    if (!employee) {
      return json({ error: 'Employee not found' }, 403);
    }

    const va = await checkAppVersion(base44, req);
    if (va) return json(va, 426);

    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const action = url.searchParams.get('action') || '';

    // GET ?action=destinations
    if (method === 'GET' && action === 'destinations') {
      return json(
        withVersion(
          {
            success: true,
            destinations: DESTINATIONS.map((d) => ({
              key: d.key,
              label: d.label,
              desc: d.desc,
              color: d.color,
              requires_doc_type: d.requiresDocType,
              supports_file_type: d.supportsFileType,
            })),
          },
          va,
        ),
      );
    }

    // GET ?action=search&destination=Contact&q=...
    if (method === 'GET' && action === 'search') {
      const destinationKey = url.searchParams.get('destination') || '';
      const q = (url.searchParams.get('q') || '').trim().toLowerCase();
      const dest = getDestination(destinationKey);
      if (!dest) return json({ error: 'Unknown destination' }, 400);

      let records = [];
      try {
        records = await base44.asServiceRole.entities[destinationKey].list('-updated_date', 300);
      } catch (err) {
        const message = String(err?.message || err);
        if (!/not found/i.test(message)) throw err;
      }

      const results = (records || [])
        .filter((r) => matchesQuery(r, dest, q))
        .slice(0, 50)
        .map((r) => ({
          id: r.id,
          title: recordTitle(r, dest),
          subtitle: recordSubtitle(r, dest),
        }));

      return json(withVersion({ success: true, results, count: results.length }, va));
    }

    // GET ?action=meta&destination=Employee
    if (method === 'GET' && action === 'meta') {
      const destinationKey = url.searchParams.get('destination') || '';
      const dest = getDestination(destinationKey);
      if (!dest) return json({ error: 'Unknown destination' }, 400);

      let documentTypes = [];
      let fileTypes = [];

      if (dest.requiresDocType) {
        try {
          documentTypes = await base44.asServiceRole.entities.EmployeeDocumentType.list(
            'name',
            200,
          );
        } catch {
          documentTypes = [];
        }
      }
      if (dest.supportsFileType) {
        try {
          fileTypes = await base44.asServiceRole.entities.FileType.list('name', 200);
        } catch {
          fileTypes = [];
        }
      }

      return json(
        withVersion(
          {
            success: true,
            document_types: (documentTypes || []).map((t) => ({
              id: t.id,
              name: t.name,
              requires_expiry: !!t.requires_expiry,
            })),
            file_types: (fileTypes || []).map((t) => ({
              id: t.id,
              name: t.name,
              reference_prefix: t.reference_prefix || '',
            })),
          },
          va,
        ),
      );
    }

    // POST ?action=attach — multipart
    if (method === 'POST' && action === 'attach') {
      const contentType = req.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return json({ error: 'Expected multipart/form-data' }, 400);
      }

      const formData = await req.formData();
      const file = formData.get('file');
      const destinationKey = String(formData.get('destination') || '');
      const recordId = String(formData.get('record_id') || '');
      const fileTypeId = String(formData.get('file_type_id') || '');
      const documentTypeId = String(formData.get('document_type_id') || '');
      const description = String(formData.get('description') || '');
      const mimeFromForm = String(formData.get('mime_type') || '');
      const rawFileName =
        String(formData.get('file_name') || '') ||
        (file && typeof file !== 'string' ? file.name : '') ||
        'shared-file';

      if (!file || typeof file === 'string') {
        return json({ error: 'Missing file in form data' }, 400);
      }
      if (!recordId) return json({ error: 'Missing record_id' }, 400);

      const dest = getDestination(destinationKey);
      if (!dest) return json({ error: 'Unknown destination' }, 400);

      let parent;
      try {
        parent = await base44.asServiceRole.entities[destinationKey].get(recordId);
      } catch {
        parent = null;
      }
      if (!parent) return json({ error: 'Record not found' }, 404);

      const mimeType = mimeFromForm || file.type || 'application/octet-stream';
      const uploaded = await uploadNamedFile(base44, file, rawFileName, mimeType);
      const fileUrl = uploaded.file_url;
      const fileName = uploaded.file_name;
      const fileSize = uploaded.file_size;
      const linkName = recordTitle(parent, dest);

      let created;

      if (dest.key === 'Employee') {
        if (!documentTypeId) {
          return json({ error: 'document_type_id is required for Employee' }, 400);
        }
        let docTypeName = String(formData.get('document_type_name') || '');
        if (!docTypeName) {
          try {
            const dt = await base44.asServiceRole.entities.EmployeeDocumentType.get(documentTypeId);
            docTypeName = dt?.name || '';
          } catch {
            docTypeName = '';
          }
        }
        created = await base44.asServiceRole.entities.EmployeeDocument.create({
          employee_id: recordId,
          employee_name: linkName,
          document_type_id: documentTypeId,
          document_type_name: docTypeName,
          file_url: fileUrl,
          file_name: fileName,
          ...(description ? { notes: description } : {}),
        });
      } else if (dest.key === 'Invoice' || dest.key === 'Bill') {
        created = await base44.asServiceRole.entities.DocumentFile.create({
          doc_type: dest.docType,
          doc_id: recordId,
          doc_number: linkName,
          file_url: fileUrl,
          file_name: fileName,
          file_size: fileSize,
          file_type: uploaded.file_type,
          ...(description ? { description } : {}),
        });
      } else if (dest.shared) {
        // Unified SharedFile used by Contact / Project / WorkOrder / Asset detail pages.
        let ft = null;
        if (fileTypeId) {
          try {
            ft = await base44.asServiceRole.entities.FileType.get(fileTypeId);
          } catch {
            ft = null;
          }
        }
        const reference = await generateSimpleReference(base44, 'SharedFile');
        const links: Record<string, string | undefined> = {};
        const parentRec = parent as Record<string, unknown>;
        if (dest.key === 'Contact') {
          links.contact_id = recordId;
          links.contact_name = linkName;
        } else if (dest.key === 'Project') {
          links.project_id = recordId;
          links.project_name = linkName;
          if (parentRec.contact_id) {
            links.contact_id = String(parentRec.contact_id);
            links.contact_name = parentRec.contact_name
              ? String(parentRec.contact_name)
              : undefined;
          }
        } else if (dest.key === 'WorkOrder') {
          links.work_order_id = recordId;
          links.work_order_name = linkName;
          if (parentRec.project_id) {
            links.project_id = String(parentRec.project_id);
            links.project_name = parentRec.project_name
              ? String(parentRec.project_name)
              : undefined;
          }
          if (parentRec.contact_id) {
            links.contact_id = String(parentRec.contact_id);
            links.contact_name = parentRec.contact_name
              ? String(parentRec.contact_name)
              : undefined;
          }
          if (parentRec.asset_id) {
            links.asset_id = String(parentRec.asset_id);
            links.asset_name = parentRec.asset_name
              ? String(parentRec.asset_name)
              : undefined;
          }
        } else if (dest.key === 'Asset') {
          links.asset_id = recordId;
          links.asset_name = linkName;
        }

        created = await base44.asServiceRole.entities.SharedFile.create({
          reference,
          file_name: fileName,
          file_url: fileUrl,
          file_size: fileSize,
          file_type: uploaded.file_type,
          file_type_id: ft?.id || undefined,
          file_type_name: ft?.name || undefined,
          post_date: new Date().toISOString().slice(0, 10),
          ...(description ? { description } : {}),
          ...links,
        });
      } else if (dest.key === 'Organization') {
        let ft = null;
        if (fileTypeId) {
          try {
            ft = await base44.asServiceRole.entities.FileType.get(fileTypeId);
          } catch {
            ft = null;
          }
        }
        const reference = await generateSimpleReference(base44, 'OrganizationFile');
        created = await base44.asServiceRole.entities.OrganizationFile.create({
          organization_id: recordId,
          name: fileName,
          file_name: fileName,
          file_url: fileUrl,
          file_size: fileSize,
          file_type: uploaded.file_type,
          reference,
          file_type_id: ft?.id || undefined,
          file_type_name: ft?.name || undefined,
          ...(description ? { notes: description } : {}),
        });
      } else {
        let ft = null;
        if (fileTypeId) {
          try {
            ft = await base44.asServiceRole.entities.FileType.get(fileTypeId);
          } catch {
            ft = null;
          }
        }
        const reference = await generateSimpleReference(base44, dest.fileEntity);
        const payload = {
          reference,
          [dest.linkField]: recordId,
          ...(dest.linkNameField ? { [dest.linkNameField]: linkName } : {}),
          file_name: fileName,
          file_url: fileUrl,
          file_size: fileSize,
          file_type: uploaded.file_type,
          file_type_id: ft?.id || undefined,
          file_type_name: ft?.name || undefined,
          ...(description ? { description } : {}),
        };
        created = await base44.asServiceRole.entities[dest.fileEntity].create(payload);
      }

      return json(
        withVersion(
          {
            success: true,
            file: created,
            destination: dest.key,
            record_id: recordId,
            record_name: linkName,
          },
          va,
        ),
        201,
      );
    }

    return json({ error: 'Not found. Use action=destinations|search|meta|attach' }, 404);
  } catch (err) {
    return json({ error: err?.message || String(err) }, 500);
  }
});
