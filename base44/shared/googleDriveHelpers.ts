// Shared Google Drive helpers for the Data Export Center.
// Flat, modular folder architecture — each module is independent.
// Used by the exportToGoogleDrive backend function.

export function sanitizeName(name: string): string {
  return (name || "Unnamed")
    .replace(/\//g, "-")
    .replace(/[<>:"\\|?*]/g, "")
    .trim() || "Unnamed";
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Retry wrapper — retries on Google Drive rate-limit (429) and server errors (5xx)
const withRetry = async (fn: () => Promise<Response>, maxRetries = 5): Promise<Response> => {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fn();
      if (res.status === 429 || res.status === 403 || res.status >= 500) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const body = await res.clone().json();
          if (body?.error?.message) errMsg = body.error.message;
        } catch {}
        lastError = new Error(errMsg);
        const backoff = Math.min(1000 * Math.pow(2, attempt), 30000);
        const jitter = Math.floor(Math.random() * 1000);
        await sleep(backoff + jitter);
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      await sleep(2000 * Math.pow(2, attempt));
    }
  }
  throw lastError || new Error("Rate limit exceeded after max retries");
};

export function createGoogleDriveHelpers(base44: any, accessToken: string) {
  const authHeader: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  // In-memory caches — loaded once per function invocation
  let folderCache: Map<string, string> | null = null;
  let fileUrlCache: Set<string> | null = null;
  // Per-folder file name cache — populated on first check, avoids per-file API calls
  let folderFilesCache: Map<string, Set<string>> = new Map();

  const loadCaches = async () => {
    if (!folderCache) {
      folderCache = new Map();
      const folders = await base44.asServiceRole.entities.GoogleDriveExportState.filter(
        { entry_type: "folder" }, "-created_date", 10000
      );
      for (const f of folders) {
        if (f.entity_type && f.entity_id) {
          folderCache.set(`${f.entity_type}:${f.entity_id}`, f.drive_folder_id);
        }
      }
    }
    if (!fileUrlCache) {
      fileUrlCache = new Set();
      const files = await base44.asServiceRole.entities.GoogleDriveExportState.filter(
        { entry_type: "file" }, "-created_date", 10000
      );
      for (const f of files) {
        if (f.file_url) fileUrlCache.add(f.file_url);
      }
    }
  };

  const createFolder = async (name: string, parentId: string): Promise<string> => {
    const res = await withRetry(() =>
      fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
        method: "POST",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId === "root" ? "root" : parentId],
        }),
      })
    );
    const data = await res.json();
    return data.id;
  };

  // Check if a Drive folder has been trashed (e.g. user emptied it in Drive).
  // Google Drive does NOT cascade trash status to files inside a trashed folder,
  // so listFilesInFolder would still find them and skip re-upload.
  const isFolderTrashed = async (folderId: string): Promise<boolean> => {
    try {
      const res = await withRetry(() =>
        fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=trashed`, { headers: authHeader })
      );
      const data = await res.json();
      return data.trashed === true;
    } catch {
      return false;
    }
  };

  // Cache-first folder lookup. Returns the Drive folder ID, creating the folder if needed.
  // If the cached folder was trashed in Drive (user emptied it), a new folder is created
  // and the mapping updated — so files re-upload to a visible, non-trashed folder.
  const ensureFolder = async (
    parentId: string,
    folderName: string,
    entityType: string,
    entityId: string
  ): Promise<string> => {
    const cached = await getFolderMapping(entityType, entityId);
    if (cached) {
      if (await isFolderTrashed(cached)) {
        // Folder was trashed — create a fresh one and update the mapping
        await sleep(400);
        const newFolderId = await createFolder(folderName, parentId);
        folderCache!.set(`${entityType}:${entityId}`, newFolderId);
        await base44.asServiceRole.entities.GoogleDriveExportState.updateMany(
          { entry_type: "folder", entity_type: entityType, entity_id: entityId },
          { $set: { drive_folder_id: newFolderId } }
        ).catch(() => {});
        return newFolderId;
      }
      return cached;
    }

    await sleep(400);
    const folderId = await createFolder(folderName, parentId);

    folderCache!.set(`${entityType}:${entityId}`, folderId);
    await base44.asServiceRole.entities.GoogleDriveExportState.create({
      entry_type: "folder",
      entity_type: entityType,
      entity_id: entityId,
      entity_name: folderName,
      drive_folder_id: folderId,
    });
    return folderId;
  };

  const getFolderMapping = async (entityType: string, entityId: string): Promise<string | null> => {
    await loadCaches();
    return folderCache!.get(`${entityType}:${entityId}`) || null;
  };

  const isFileUploaded = async (fileUrl: string): Promise<boolean> => {
    await loadCaches();
    return fileUrlCache!.has(fileUrl);
  };

  // List all file names in a Drive folder (non-folder files only), cached per folder.
  // One API call per folder instead of one per file — avoids rate-limiting.
  const listFilesInFolder = async (folderId: string): Promise<Set<string>> => {
    if (folderFilesCache.has(folderId)) return folderFilesCache.get(folderId)!;
    const names = new Set<string>();
    const query = `'${folderId}' in parents and mimeType!='application/vnd.google-apps.folder' and trashed=false`;
    const res = await withRetry(() =>
      fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=1000`,
        { headers: authHeader }
      )
    );
    const data = await res.json();
    for (const f of data.files || []) {
      if (f.name) names.add(f.name);
    }
    folderFilesCache.set(folderId, names);
    return names;
  };

  const uploadFile = async (
    fileUrl: string,
    fileName: string,
    folderId: string,
    entityType: string,
    entityName: string
  ): Promise<boolean> => {
    // Deduplicate per-folder: only skip if the file already exists in THIS Drive folder.
    // A SharedFile linked to multiple entities (contact + project + asset) must be
    // uploaded to each entity's folder, so we do NOT use a global URL cache here.
    const existingNames = await listFilesInFolder(folderId);
    if (existingNames.has(fileName)) {
      return false;
    }

    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) return false;
    const fileBuffer = await fileRes.arrayBuffer();
    const contentType = fileRes.headers.get("content-type") || "application/octet-stream";

    const boundary = "-------gdexport" + Math.random().toString(36).substring(2);
    const encoder = new TextEncoder();
    const metadata = { name: fileName, parents: [folderId] };

    const part1 = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
    );
    const fileData = new Uint8Array(fileBuffer);
    const part3 = encoder.encode(`\r\n--${boundary}--\r\n`);

    const multipartBody = new Uint8Array(part1.length + fileData.length + part3.length);
    multipartBody.set(part1, 0);
    multipartBody.set(fileData, part1.length);
    multipartBody.set(part3, part1.length + fileData.length);

    const res = await withRetry(() =>
      fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
        {
          method: "POST",
          headers: { ...authHeader, "Content-Type": `multipart/related; boundary=${boundary}` },
          body: multipartBody,
        }
      )
    );

    const data = await res.json();
    if (data.id) {
      fileUrlCache!.add(fileUrl);
      // Also add to folder file-name cache so subsequent files with same name are skipped
      const names = await listFilesInFolder(folderId);
      names.add(fileName);
      await base44.asServiceRole.entities.GoogleDriveExportState.create({
        entry_type: "file",
        file_url: fileUrl,
        drive_file_id: data.id,
        entity_type: entityType,
        entity_name: entityName,
      });
      return true;
      }
      return false;
      };

      // Upload raw bytes (e.g. generated PDFs) to Drive — same dedup & caching as uploadFile
      const uploadFileBytes = async (
      fileBytes: ArrayBuffer,
      fileName: string,
      contentType: string,
      folderId: string,
      entityType: string,
      entityName: string,
      fileUrlKey?: string
      ): Promise<boolean> => {
      const existingNames = await listFilesInFolder(folderId);
      if (existingNames.has(fileName)) return false;

      const boundary = "-------gdexport" + Math.random().toString(36).substring(2);
      const encoder = new TextEncoder();
      const metadata = { name: fileName, parents: [folderId] };

      const part1 = encoder.encode(
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`
      );
      const fileData = new Uint8Array(fileBytes);
      const part3 = encoder.encode(`\r\n--${boundary}--\r\n`);

      const multipartBody = new Uint8Array(part1.length + fileData.length + part3.length);
      multipartBody.set(part1, 0);
      multipartBody.set(fileData, part1.length);
      multipartBody.set(part3, part1.length + fileData.length);

      const res = await withRetry(() =>
        fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
          {
            method: "POST",
            headers: { ...authHeader, "Content-Type": `multipart/related; boundary=${boundary}` },
            body: multipartBody,
          }
        )
      );

      const data = await res.json();
      if (data.id) {
        const cacheKey = fileUrlKey || `bytes:${fileName}:${folderId}`;
        fileUrlCache!.add(cacheKey);
        const names = await listFilesInFolder(folderId);
        names.add(fileName);
        await base44.asServiceRole.entities.GoogleDriveExportState.create({
          entry_type: "file",
          file_url: cacheKey,
          drive_file_id: data.id,
          entity_type: entityType,
          entity_name: entityName,
        });
        return true;
      }
      return false;
      };

      const listChildren = async (folderId: string): Promise<{ id: string; name: string }[]> => {
    const res = await withRetry(() =>
      fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${folderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`)}&fields=files(id,name)&pageSize=1000`,
        { headers: authHeader }
      )
    );
    const data = await res.json();
    return data.files || [];
  };

  const deleteFile = async (fileId: string): Promise<void> => {
    await withRetry(() =>
      fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: "DELETE",
        headers: authHeader,
      })
    );
  };

  const cleanupOldFolders = async (
    rootFolderId: string,
    validModuleNames: string[]
  ): Promise<string[]> => {
    const children = await listChildren(rootFolderId);
    const deleted: string[] = [];
    for (const child of children) {
      if (!validModuleNames.includes(child.name)) {
        try {
          await sleep(400);
          await deleteFile(child.id);
          deleted.push(child.name);
        } catch (e: any) {
          // Continue even if one fails
        }
      }
    }
    return deleted;
  };

  // Sync deletions: delete Drive folders for entities that no longer exist in the app.
  // Compares cached folder mappings against current entity IDs and removes orphans.
  const syncDeletions = async (
    entityType: string,
    currentEntityIds: Set<string>
  ): Promise<{ deleted: string[]; checked: number }> => {
    await loadCaches();
    const mappings = await base44.asServiceRole.entities.GoogleDriveExportState.filter(
      { entry_type: "folder", entity_type: entityType }, "-created_date", 10000
    );

    const deleted: string[] = [];
    for (const mapping of mappings) {
      if (mapping.entity_id && !currentEntityIds.has(mapping.entity_id)) {
        try {
          await sleep(300);
          await deleteFile(mapping.drive_folder_id);
        } catch (e: any) {
          // Folder may already be gone — continue
        }
        // Remove the folder mapping from DB and cache
        await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
          { entry_type: "folder", entity_type: entityType, entity_id: mapping.entity_id }
        ).catch(() => {});
        folderCache!.delete(`${entityType}:${mapping.entity_id}`);
        // Also remove file mappings for this entity (orphaned)
        await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
          { entry_type: "file", entity_type: entityType, entity_name: mapping.entity_name }
        ).catch(() => {});
        deleted.push(mapping.entity_name || mapping.entity_id);
      }
    }
    return { deleted, checked: mappings.length };
  };

  // Scan the actual Drive folder and remove orphaned subfolders (e.g., "C (Copy)")
  // that don't match any current entity name. This catches folders created by
  // Google Drive's copy operation or stale folders from renamed entities that
  // syncDeletions misses (because those folders have no DB mapping).
  const cleanupOrphanedFolders = async (
    parentFolderId: string,
    validFolderNames: Set<string>,
    entityType: string
  ): Promise<{ deleted: string[]; checked: number }> => {
    // List ALL children INCLUDING trashed — trashed orphan folders still show
    // in some Google Drive views and confuse users. We must permanently
    // delete them, not just skip them.
    const query = `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder'`;
    const res = await withRetry(() =>
      fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,trashed)&pageSize=1000`,
        { headers: authHeader }
      )
    );
    const data = await res.json();
    const children: { id: string; name: string; trashed?: boolean }[] = data.files || [];

    const deleted: string[] = [];
    for (const child of children) {
      if (!validFolderNames.has(child.name)) {
        try {
          await sleep(300);
          await deleteFile(child.id);
          deleted.push(child.name);
          // Remove DB folder mapping so ensureFolder creates a fresh one on next export
          await base44.asServiceRole.entities.GoogleDriveExportState.deleteMany(
            { entry_type: "folder", entity_type: entityType, entity_name: child.name }
          ).catch(() => {});
        } catch (e: any) {}
      }
    }
    return { deleted, checked: children.length };
  };

  return {
    sanitizeName,
    ensureFolder,
    getFolderMapping,
    isFileUploaded,
    uploadFile,
    uploadFileBytes,
    cleanupOldFolders,
    syncDeletions,
    cleanupOrphanedFolders,
    listChildren,
  };
}