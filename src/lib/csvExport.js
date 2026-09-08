// Shared CSV export utility — builds a CSV string from rows and triggers a download.
// Escapes values containing commas, quotes, or newlines per RFC 4180.

function escapeCell(value) {
  if (value == null) return "";
  let s = typeof value === "string" ? value : String(value);
  if (/[",\n\r]/.test(s)) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export function exportToCSV(filename, columns, rows) {
  // columns: [{ key, label }] — key is a property name or function(row)
  const header = columns.map(c => escapeCell(c.label)).join(",");
  const body = rows.map(row =>
    columns.map(c => {
      const val = typeof c.key === "function" ? c.key(row) : row[c.key];
      return escapeCell(val);
    }).join(",")
  ).join("\n");
  const csv = "\uFEFF" + header + "\n" + body; // BOM for Excel UTF-8
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}