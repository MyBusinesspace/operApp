import { useState, useEffect } from "react";
import { getSignedUrl } from "@/lib/privateFile";

/**
 * Resolves a private file URI (or public URL) to a usable URL.
 * Public URLs pass through unchanged; private URIs are resolved to a
 * time-limited signed URL (cached by getSignedUrl).
 * Returns null until resolved.
 */
export function useSignedUrl(url) {
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    let active = true;
    if (!url) { setResolved(null); return; }
    getSignedUrl(url)
      .then(u => { if (active) setResolved(u); })
      .catch(() => { if (active) setResolved(url); });
    return () => { active = false; };
  }, [url]);
  return resolved;
}