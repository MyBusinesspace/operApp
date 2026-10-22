// Reads an uploaded import file as CSV text. Excel files (.xlsx/.xls) are converted
// (first sheet) so every importer can use the same CSV pipeline.
export const isExcelName = (name) => /\.(xlsx|xls)$/i.test(name || "");
export const isCsvName = (name) => /\.csv$/i.test(name || "");

export async function readImportText(file) {
  if (isExcelName(file.name)) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new Error("The Excel file has no sheets.");
    return XLSX.utils.sheet_to_csv(sheet, { FS: ",", RS: "\n", blankrows: false, rawNumbers: true, dateNF: "yyyy-mm-dd" });
  }
  return file.text();
}

// Download a CSV template (headers + one sample row).
export function downloadCsvTemplate(filename, headers, sample = []) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = headers.map(q).join(",") + "\n" + (sample.length ? sample.map(q).join(",") + "\n" : "");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
