// Shared helper for shift-click range selection in list tables.
// prev      : current Set of selected ids
// ids       : ordered array of row ids in the current view (e.g. filtered.map(r => r.id))
// id        : the clicked row id
// shiftKey  : whether shift was held during the click
// anchorRef : a React ref (useRef) tracking the last non-shift selected index
export function applyRangeToggle(prev, ids, id, shiftKey, anchorRef) {
  const next = new Set(prev);
  const idx = ids.indexOf(id);
  if (shiftKey && anchorRef.current != null && idx >= 0) {
    const start = Math.min(anchorRef.current, idx);
    const end = Math.max(anchorRef.current, idx);
    const rangeIds = ids.slice(start, end + 1);
    const allSelected = rangeIds.length > 0 && rangeIds.every(rid => next.has(rid));
    rangeIds.forEach(rid => (allSelected ? next.delete(rid) : next.add(rid)));
    return next;
  }
  if (next.has(id)) next.delete(id);
  else next.add(id);
  anchorRef.current = idx >= 0 ? idx : null;
  return next;
}