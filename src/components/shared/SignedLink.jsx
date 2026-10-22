import React, { useState } from "react";
import { getSignedUrl, isPrivateUri } from "@/lib/privateFile";

/**
 * An <a> that works with both public URLs and private file URIs.
 * Public URLs open instantly. Private URIs are resolved to a signed URL
 * on click (so list pages don't fire one API call per document on render).
 */
export default function SignedLink({ href, children, onClick, target = "_blank", ...props }) {
  const [resolvedUrl, setResolvedUrl] = useState(() => (isPrivateUri(href) ? null : href));
  const [loading, setLoading] = useState(false);

  const handleClick = async (e) => {
    if (resolvedUrl) { onClick?.(e); return; }
    if (href && isPrivateUri(href)) {
      e.preventDefault();
      if (loading) return;
      setLoading(true);
      try {
        const signed = await getSignedUrl(href);
        setResolvedUrl(signed);
        window.open(signed, target, "noopener,noreferrer");
      } catch {
        window.open(href, target, "noopener,noreferrer");
      }
      setLoading(false);
    }
    onClick?.(e);
  };

  return (
    <a href={resolvedUrl || "#"} onClick={handleClick} target={target} {...props}>
      {children}
    </a>
  );
}