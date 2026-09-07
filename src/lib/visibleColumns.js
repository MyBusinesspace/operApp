// Auto-hide empty columns: keep only columns where at least one row has real content.
// A value counts as empty when it's null, undefined, "" or the em-dash placeholder "—".
export function isEmptyValue(v) {
  return v === null || v === undefined || v === "" || v === "—";
}

/**
 * columns: [{ key, label, value?, render, muted? }]
 *   - value(row): raw value used for the emptiness check (defaults to row[key])
 *   - render(row): JSX cell content
 * Returns the subset of columns that have content in at least one row.
 * When there are no rows, all columns are returned (headers still shown for empty states handled by caller).
 */
export function getVisibleColumns(rows, columns) {
  if (!rows || rows.length === 0) return columns;
  return columns.filter(col => rows.some(r => !isEmptyValue(col.value ? col.value(r) : r[col.key])));
}

/**
 * Returns a Set of keys that have content in at least one row.
 * accessors: { key: (row) => rawValue }
 * Use `vis.has(key)` to guard both the <th> and matching <td>.
 */
export function visibleKeys(rows, accessors) {
  const set = new Set();
  if (!rows || rows.length === 0) return set;
  for (const key of Object.keys(accessors)) {
    const fn = accessors[key];
    if (rows.some(r => !isEmptyValue(fn(r)))) set.add(key);
  }
  return set;
}