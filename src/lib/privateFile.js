import { base44 } from "@/api/base44Client";

// Cache signed URLs so repeated views of the same private file don't re-fetch.
const signedUrlCache = new Map();
const CACHE_TTL = 50 * 60 * 1000; // 50 min (signed URLs last 1 hour)

/** Returns true when the value is a private file URI (not an http(s) URL). */
export function isPrivateUri(url) {
  if (!url) return false;
  return !url.startsWith("http://") && !url.startsWith("https://");
}

/** Uploads a file to private storage and returns { file_uri, file_name, file_type, file_size }. */
export async function uploadPrivateFile(file) {
  const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
  return { file_uri, file_name: file.name, file_type: file.type, file_size: file.size };
}

/**
 * Returns a usable URL for a file_uri or public URL.
 * Public URLs pass through unchanged; private URIs are resolved to a
 * time-limited signed URL (cached for ~50 min).
 */
export async function getSignedUrl(fileUriOrUrl) {
  if (!fileUriOrUrl) return null;
  if (!isPrivateUri(fileUriOrUrl)) return fileUriOrUrl;
  const cached = signedUrlCache.get(fileUriOrUrl);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.url;
  const { signed_url } = await base44.integrations.Core.CreateFileSignedUrl({
    file_uri: fileUriOrUrl,
    expires_in: 3600,
  });
  signedUrlCache.set(fileUriOrUrl, { url: signed_url, ts: Date.now() });
  return signed_url;
}