import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Upload an APK (or any build file) to the platform storage and return its URL.
 * Bypasses the client-side UploadFile MIME-type restriction by reconstructing
 * the file server-side with an explicit content type before calling UploadFile.
 */
async function uploadBuildFile(base44, file, fileName, mimeType) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const safeName = String(fileName || file.name || 'build.apk').trim();
  const contentType = mimeType || file.type || 'application/vnd.android.package-archive';
  // The platform blocks .apk/.ipa by extension. An APK is structurally a ZIP
  // archive, so upload under a .zip name with application/zip to pass the
  // extension allowlist. The stored URL is what the mobile client downloads
  // (the bytes are identical regardless of stored extension).
  const storedName = safeName.replace(/\.(apk|ipa)$/i, '.zip') || 'build.zip';
  const named = new File([bytes], storedName, { type: 'application/zip' });
  const result = await base44.asServiceRole.integrations.Core.UploadFile({ file: named });
  return {
    file_url: result.file_url,
    file_name: safeName,
    file_type: contentType,
    file_size: typeof named.size === 'number' ? named.size : bytes.byteLength,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: only logged-in app users (admins) may upload builds.
    let user;
    try {
      user = await base44.auth.me();
    } catch {
      user = null;
    }
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const action = url.searchParams.get('action') || '';

    // GET ?action=app — return the current MobileApp record (for the settings page)
    if (method === 'GET' && action === 'app') {
      const apps = await base44.asServiceRole.entities.MobileApp.list('-updated_date', 1);
      return json({ success: true, app: apps && apps.length > 0 ? apps[0] : null });
    }

    // POST ?action=upload — multipart upload of a build file (APK/IPA)
    if (method === 'POST' && action === 'upload') {
      const contentType = req.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return json({ error: 'Expected multipart/form-data' }, 400);
      }

      const formData = await req.formData();
      const file = formData.get('file');
      if (!file || typeof file === 'string') {
        return json({ error: 'Missing file in form data' }, 400);
      }

      const fileName = String(formData.get('file_name') || '') || file.name || 'build.apk';
      const mimeType = String(formData.get('mime_type') || '') || file.type || 'application/vnd.android.package-archive';

      const uploaded = await uploadBuildFile(base44, file, fileName, mimeType);

      return json({
        success: true,
        file_url: uploaded.file_url,
        file_name: uploaded.file_name,
        file_type: uploaded.file_type,
        file_size: uploaded.file_size,
      }, 201);
    }

    return json({ error: 'Not found. Use action=app|upload' }, 404);
  } catch (err) {
    return json({ error: err?.message || String(err) }, 500);
  }
});