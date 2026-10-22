// Google Drive mirror helpers — Drive REST access + the file/folder mapping table
// (entity GoogleDriveExportState). Used by the exportToGoogleDrive backend function.
//
// Design rules:
// - No fixed sleeps. The ONLY retry is HTTP 429, with bounded backoff.
// - Any other failure (403, 404, 5xx, network) fails fast with Drive's real message.
// - Mapping table:
//     entry_type=folder → one row per Drive folder, keyed by entity_type + entity_id
//     entry_type=file   → one row per mirrored app file, keyed by entity_type +
//                         entity_id + the Drive folder it lives in
//   A file row stores: file_url (the app file URL, or a generated key such as
//   wr:<id>:<updated_date>), drive_file_id, drive_folder_id, entity_name (the file
//   name used in Drive) and status (the link the upload came from, when relevant).
// - The per-folder file listing is cached for the whole invocation, so checking
//   whether a mapped file is still present costs no extra API call.

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const MAX_429_RETRIES = 4;
const FOLDER_MIME = "application/vnd.google-apps.folder";

// Root folder of the mirror in the user's Drive (created only if it does not exist).
export const MIRROR_ROOT_NAME = "Redcrane LLC";

export function sanitizeName(name: string): string {
  return String(name || "Unnamed")
    .replace(/\//g, "-")
    .replace(/[<>:"\\|?*]/g, "")
    .trim() || "Unnamed";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createGoogleDriveHelpers(base44: any, accessToken: string, appOrigin: string = "") {
  const authHeader: Record<string, string> = { Authorization: `Bearer ${accessToken}` };

  const folderByKey = new Map<string, any>();
  const fileRowsByKey = new Map<string, any[]>();
  const listingCache = new Map<string, { names: Set<string>; ids: Set<string> }>();
  const stats = { uploaded: 0, restored: 0, skipped: 0, deleted: 0, errors: [] as string[] };

  let foldersLoaded = false;
  let rootSearchDone = false;
  let rootSearchResult: string | null = null;

  const driveError = async (res: Response): Promise<Error> => {
    let msg = `Google Drive HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg = `${body.error.message} (HTTP ${res.status})`;
    } catch {
      // keep the status-only message
    }
    return new Error(msg);
  };

  // Single choke point for every Drive call: 429 → bounded backoff, everything else
  // (403 forbidden, 404 not found, 5xx, network) throws immediately.
  const request = async (url: string, init: RequestInit = {}): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: { ...authHeader, ...((init.headers as Record<string, string>) || {}) },
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429) {
        if (attempt >= MAX_429_RETRIES) throw new Error("Google Drive rate limit (429) — retries exhausted");
        await sleep(Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 250));
        continue;
      }
      if (!res.ok) throw await driveError(res);
      return res;
    }
  };

  // ── Folder mappings ────────────────────────────────────────────────────────

  const loadFolders = async () => {
    if (foldersLoaded) return;
    foldersLoaded = true;
    let skip = 0;
    for (;;) {
      const page = await base44.asServiceRole.entities.GoogleDriveExportState
        .filter({ entry_type: "folder" }, "-created_date", 500, skip)
        .catch(() => []);
      for (const row of page || []) {
        if (row.entity_type && row.entity_id) folderByKey.set(`${row.entity_type}:${row.entity_id}`, row);
      }
      if (!page || page.length < 500) break;
      skip += 500;
    }
  };

  const getFolderId = async (entityType: string, entityId: string): Promise<string | null> => {
    await loadFolders();
    const row = folderByKey.get(`${entityType}:${entityId}`);
    return row?.drive_folder_id || null;
  };

  const createFolder = async (name: string, parentId: string): Promise<string> => {
    const res = await request(`${DRIVE_API}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId === "root" ? "root" : parentId],
      }),
    });
    const data = await res.json();
    return data.id;
  };

  const isAlive = async (driveId: string): Promise<boolean> => {
    try {
      const res = await request(`${DRIVE_API}/files/${driveId}?fields=id,trashed`);
      const data = await res.json();
      return data.trashed !== true;
    } catch (err: any) {
      if (/HTTP 404/.test(err?.message || "")) return false;
      throw err;
    }
  };

  const folderMeta = async (driveId: string): Promise<{ alive: boolean; name: string }> => {
    try {
      const res = await request(`${DRIVE_API}/files/${driveId}?fields=id,name,trashed`);
      const data = await res.json();
      return { alive: data.trashed !== true, name: String(data.name || "") };
    } catch (err: any) {
      if (/HTTP 404/.test(err?.message || "")) return { alive: false, name: "" };
      throw err;
    }
  };

  // Rename a Drive folder in place (same id — mappings keep working).
  const renameFolder = async (driveId: string, name: string): Promise<void> => {
    await request(`${DRIVE_API}/files/${driveId}?fields=id,name`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  };

  const saveFolderRow = async (
    entityType: string, entityId: string, name: string, driveFolderId: string
  ) => {
    await loadFolders();
    const key = `${entityType}:${entityId}`;
    const existing = folderByKey.get(key);
    if (existing) {
      await base44.asServiceRole.entities.GoogleDriveExportState.update(existing.id, {
        drive_folder_id: driveFolderId,
        entity_name: name,
      }).catch(() => {});
      folderByKey.set(key, { ...existing, drive_folder_id: driveFolderId, entity_name: name });
    } else {
      await base44.asServiceRole.entities.GoogleDriveExportState.create({
        entry_type: "folder",
        entity_type: entityType,
        entity_id: entityId,
        entity_name: name,
        drive_folder_id: driveFolderId,
      }).catch(() => {});
      folderByKey.set(key, { entity_type: entityType, entity_id: entityId, entity_name: name, drive_folder_id: driveFolderId });
    }
    listingCache.delete(driveFolderId);
  };

  // Cache-first: returns the mapped folder, or creates one. A folder that the user
  // trashed in Drive is replaced by a fresh folder and the mapping updated.
  const ensureFolder = async (
    parentId: string, name: string, entityType: string, entityId: string
  ): Promise<string> => {
    const safeName = sanitizeName(name);
    const cached = await getFolderId(entityType, entityId);
    if (cached) {
      const meta = await folderMeta(cached);
      if (meta.alive) {
        // Keep the Drive name in sync with the app (rename in place, never duplicate).
        if (meta.name && meta.name !== safeName) {
          await renameFolder(cached, safeName);
          await saveFolderRow(entityType, entityId, safeName, cached);
        }
        return cached;
      }
    }
    const folderId = await createFolder(safeName, parentId);
    await saveFolderRow(entityType, entityId, safeName, folderId);
    return folderId;
  };

  // The existing mirror root: reuse the folder actually named MIRROR_ROOT_NAME in
  // the Drive root when it exists, otherwise the stored mapping, otherwise create it.
  const resolveRootFolder = async (): Promise<string> => {
    if (!rootSearchDone) {
      rootSearchDone = true;
      const q = `name = '${MIRROR_ROOT_NAME.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and 'root' in parents and trashed = false`;
      const res = await request(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=10`);
      const data = await res.json();
      rootSearchResult = data.files?.[0]?.id || null;
    }
    if (rootSearchResult) {
      const mapped = await getFolderId("root_folder", "root");
      if (mapped !== rootSearchResult) await saveFolderRow("root_folder", "root", MIRROR_ROOT_NAME, rootSearchResult);
      return rootSearchResult;
    }
    const cached = await getFolderId("root_folder", "root");
    if (cached && (await isAlive(cached))) return cached;
    const folderId = await createFolder(MIRROR_ROOT_NAME, "root");
    await saveFolderRow("root_folder", "root", MIRROR_ROOT_NAME, folderId);
    return folderId;
  };

  // ── Per-folder listing cache (used for health checks) ──────────────────────

  const listFiles = async (folderId: string) => {
    const cached = listingCache.get(folderId);
    if (cached) return cached;
    const names = new Set<string>();
    const ids = new Set<string>();
    const q = `'${folderId}' in parents and mimeType != '${FOLDER_MIME}' and trashed = false`;
    let pageToken = "";
    for (;;) {
      const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name)&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const data = await (await request(url)).json();
      for (const f of data.files || []) {
        if (f.name) names.add(f.name);
        if (f.id) ids.add(f.id);
      }
      pageToken = data.nextPageToken || "";
      if (!pageToken) break;
    }
    const entry = { names, ids };
    listingCache.set(folderId, entry);
    return entry;
  };

  const rememberUploaded = async (folderId: string, name: string, id: string) => {
    const entry = await listFiles(folderId).catch(() => null);
    if (entry) {
      entry.names.add(name);
      entry.ids.add(id);
    }
  };

  // Present in its folder (no API call) or alive in Drive (one API call).
  const isFileHealthy = async (driveFileId: string, folderId: string): Promise<boolean> => {
    if (!driveFileId) return false;
    const listing = await listFiles(folderId);
    if (listing.ids.has(driveFileId)) return true;
    return isAlive(driveFileId);
  };

  const deleteDriveFile = async (driveFileId: string): Promise<boolean> => {
    if (!driveFileId) return false;
    try {
      await request(`${DRIVE_API}/files/${driveFileId}`, { method: "DELETE" });
    } catch (err: any) {
      if (!/HTTP 404/.test(err?.message || "")) throw err;
    }
    for (const entry of listingCache.values()) entry.ids.delete(driveFileId);
    return true;
  };

  // ── Uploads ───────────────────────────────────────────────────────────────

  const uploadBytes = async (
    bytes: ArrayBuffer, fileName: string, contentType: string, folderId: string
  ): Promise<string> => {
    const boundary = `-------gdmirror${Math.random().toString(36).substring(2)}`;
    const encoder = new TextEncoder();
    const meta = JSON.stringify({ name: sanitizeName(fileName), parents: [folderId] });
    const part1 = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${meta}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const part3 = encoder.encode(`\r\n--${boundary}--\r\n`);
    const fileData = new Uint8Array(bytes);
    const body = new Uint8Array(part1.length + fileData.length + part3.length);
    body.set(part1, 0);
    body.set(fileData, part1.length);
    body.set(part3, part1.length + fileData.length);

    const res = await request(`${UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
    const data = await res.json();
    if (!data.id) throw new Error("Google Drive did not return a file id");
    await rememberUploaded(folderId, sanitizeName(fileName), data.id);
    return data.id;
  };

  const downloadAppFile = async (fileUrl: string): Promise<{ bytes: ArrayBuffer; contentType: string }> => {
    // Some records store a relative path (mp/private/...) instead of a full URL.
    const fullUrl = /^https?:\/\//i.test(fileUrl)
      ? fileUrl
      : new URL(fileUrl.startsWith("/") ? fileUrl : `/${fileUrl}`, appOrigin).toString();
    const res = await fetch(fullUrl, { signal: AbortSignal.timeout(90000) });
    if (!res.ok) throw new Error(`Could not read app file (HTTP ${res.status})`);
    const bytes = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    return { bytes, contentType };
  };

  // ── Mapping rows for mirrored files ───────────────────────────────────────

  const rowsFor = async (entityType: string, entityId: string): Promise<any[]> => {
    const key = `${entityType}|${entityId}`;
    const cached = fileRowsByKey.get(key);
    if (cached) return cached;
    const rows = await base44.asServiceRole.entities.GoogleDriveExportState
      .filter({ entry_type: "file", entity_type: entityType, entity_id: entityId }, "-created_date", 100)
      .catch(() => []);
    fileRowsByKey.set(key, rows || []);
    return fileRowsByKey.get(key)!;
  };

  const rememberRow = (row: any, entityType: string, entityId: string) => {
    const key = `${entityType}|${entityId}`;
    const list = fileRowsByKey.get(key);
    if (list) list.push(row);
    else fileRowsByKey.set(key, [row]);
  };

  const dropRow = (rowId: string) => {
    for (const list of fileRowsByKey.values()) {
      const i = list.findIndex((r) => r.id === rowId);
      if (i >= 0) list.splice(i, 1);
    }
  };

  /**
   * Mirror one app file (by URL) into a Drive folder.
   * Missing mapping → upload. Mapped but the Drive file is gone/trashed → re-upload
   * (restore). Mapped and healthy → skip.
   */
  const mirrorUrlFile = async ({
    fileUrl, fileName, folderId, entityType, entityId, context,
  }: {
    fileUrl: string; fileName: string; folderId: string;
    entityType: string; entityId: string; context?: string;
  }): Promise<string> => {
    if (!fileUrl || !folderId) return "skipped";
    const driveName = sanitizeName(fileName || "file");
    const rows = await rowsFor(entityType, entityId);
    const row = rows.find((r) => r.file_url === fileUrl && r.drive_folder_id === folderId)
      || rows.find((r) => r.file_url === fileUrl && !r.drive_folder_id);

    if (row) {
      if (row.drive_file_id && (await isFileHealthy(row.drive_file_id, folderId))) {
        stats.skipped++;
        return "skipped";
      }
      let downloaded: { bytes: ArrayBuffer; contentType: string };
      try {
        downloaded = await downloadAppFile(fileUrl);
      } catch (err: any) {
        stats.errors.push(`${entityType} ${driveName}: ${err?.message || err}`);
        return "error";
      }
      const { bytes, contentType } = downloaded;
      const id = await uploadBytes(bytes, driveName, contentType, folderId);
      await base44.asServiceRole.entities.GoogleDriveExportState.update(row.id, {
        drive_file_id: id,
        drive_folder_id: folderId,
        entity_name: driveName,
        status: context || "ok",
      }).catch(() => {});
      row.drive_file_id = id;
      row.drive_folder_id = folderId;
      row.entity_name = driveName;
      stats.restored++;
      return "restored";
    }

    let downloadedNew: { bytes: ArrayBuffer; contentType: string };
    try {
      downloadedNew = await downloadAppFile(fileUrl);
    } catch (err: any) {
      stats.errors.push(`${entityType} ${driveName}: ${err?.message || err}`);
      return "error";
    }
    const { bytes, contentType } = downloadedNew;
    const id = await uploadBytes(bytes, driveName, contentType, folderId);
    const created = await base44.asServiceRole.entities.GoogleDriveExportState.create({
      entry_type: "file",
      entity_type: entityType,
      entity_id: entityId,
      entity_name: driveName,
      file_url: fileUrl,
      drive_file_id: id,
      drive_folder_id: folderId,
      status: context || "ok",
      run_date: new Date().toISOString(),
    }).catch(() => null);
    rememberRow(created || { entity_type: entityType, entity_id: entityId, file_url: fileUrl, drive_folder_id: folderId, drive_file_id: id }, entityType, entityId);
    stats.uploaded++;
    return "uploaded";
  };

  /**
   * Mirror a generated document (e.g. a working-report PDF). Mapping keys are
   * versioned (wr:<id>:<updated_date>): any older key for the same source is
   * removed together with its Drive file, so a changed source regenerates.
   */
  const mirrorGenerated = async ({
    mappingKey, fileName, folderId, entityType, entityId, context, build,
  }: {
    mappingKey: string; fileName: string; folderId: string; entityType: string; entityId: string;
    context?: string; build: () => Promise<{ bytes: ArrayBuffer; contentType?: string }>;
  }): Promise<string> => {
    const driveName = sanitizeName(fileName);
    const rows = await rowsFor(entityType, entityId);

    for (const stale of rows) {
      if (stale.file_url === mappingKey) continue;
      if (stale.drive_file_id) await deleteDriveFile(stale.drive_file_id).catch(() => {});
      await base44.asServiceRole.entities.GoogleDriveExportState.delete(stale.id).catch(() => {});
      dropRow(stale.id);
      stats.deleted++;
    }

    const current = rows.find((r) => r.file_url === mappingKey);
    if (current?.drive_file_id && (await isFileHealthy(current.drive_file_id, folderId))) {
      stats.skipped++;
      return "skipped";
    }

    let built: { bytes: ArrayBuffer; contentType?: string };
    try {
      built = await build();
    } catch (err: any) {
      stats.errors.push(`${entityType} ${driveName}: ${err?.message || err}`);
      return "error";
    }
    const id = await uploadBytes(built.bytes, driveName, built.contentType || "application/pdf", folderId);

    if (current) {
      await base44.asServiceRole.entities.GoogleDriveExportState.update(current.id, {
        drive_file_id: id,
        drive_folder_id: folderId,
        entity_name: driveName,
        status: context || "ok",
      }).catch(() => {});
      current.drive_file_id = id;
      current.drive_folder_id = folderId;
      stats.restored++;
      return "restored";
    }

    const created = await base44.asServiceRole.entities.GoogleDriveExportState.create({
      entry_type: "file",
      entity_type: entityType,
      entity_id: entityId,
      entity_name: driveName,
      file_url: mappingKey,
      drive_file_id: id,
      drive_folder_id: folderId,
      status: context || "ok",
      run_date: new Date().toISOString(),
    }).catch(() => null);
    rememberRow(created || { entity_type: entityType, entity_id: entityId, file_url: mappingKey, drive_folder_id: folderId, drive_file_id: id }, entityType, entityId);
    stats.uploaded++;
    return "uploaded";
  };

  // Remove a mapping row and (when the Drive file exists) the file it points at.
  const dropMapping = async (row: any, deleteFile: boolean) => {
    if (deleteFile && row.drive_file_id) await deleteDriveFile(row.drive_file_id).catch(() => {});
    await base44.asServiceRole.entities.GoogleDriveExportState.delete(row.id).catch(() => {});
    dropRow(row.id);
    stats.deleted++;
  };

  return {
    sanitizeName,
    stats,
    resolveRootFolder,
    getFolderId,
    ensureFolder,
    listFiles,
    isFileHealthy,
    deleteDriveFile,
    uploadBytes,
    downloadAppFile,
    mirrorUrlFile,
    mirrorGenerated,
    dropMapping,
  };
}