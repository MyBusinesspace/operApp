import React from "react";
import { useSignedUrl } from "@/hooks/useSignedUrl";

/**
 * Renders an <img> whose src may be a private file URI or a public URL.
 * Private URIs are resolved to signed URLs on mount; public URLs pass through.
 * Falls back to the original src if resolution fails.
 */
export default function SignedImage({ src, alt = "", className, style, ...rest }) {
  const resolved = useSignedUrl(src);
  return <img src={resolved || src} alt={alt} className={className} style={style} {...rest} />;
}