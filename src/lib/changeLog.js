// Compute a human-readable summary of substantial field changes between two objects.
// trackedFields: array of [key, label] pairs to watch.
// Returns an array of strings like `Label: "old" → "new"`.
export function computeChanges(oldObj, newObj, trackedFields) {
  const norm = (v) => {
    if (v == null) return "";
    if (Array.isArray(v)) return v.length ? JSON.stringify(v) : "";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  return trackedFields
    .filter(([key]) => {
      const o = norm(oldObj?.[key]);
      const n = norm(newObj?.[key]);
      return o !== n && (o || n);
    })
    .map(([key, label]) => {
      const o = norm(oldObj?.[key]);
      const n = norm(newObj?.[key]);
      if (o && n) return `${label}: "${o}" → "${n}"`;
      if (n) return `${label}: "${n}"`;
      return `${label}: cleared`;
    });
}