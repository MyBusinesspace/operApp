export const normalizeImportHeader = (value) => String(value ?? "").replace(/^\uFEFF/, "").trim().replace(/^\*+\s*/, "");

// Read logical records, not physical lines: quoted descriptions may contain newlines.
export function parseImportCsv(text, delimiter = ",") {
  const records = [];
  let row = [], value = "", quoted = false;
  const finishRow = () => {
    row.push(value.trim());
    if (row.some(cell => cell !== "")) records.push(row);
    row = []; value = "";
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(value.trim()); value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      finishRow();
      if (char === "\r" && text[i + 1] === "\n") i++;
    } else value += char;
  }
  if (quoted) throw new Error("Invalid CSV: an opening quote has no closing quote.");
  if (value || row.length) finishRow();
  const headers = (records.shift() || []).map(normalizeImportHeader);
  const rows = records.map((cells, index) => {
    if (cells.length > headers.length) throw new Error(`CSV row ${index + 2}: too many columns. Quote values containing commas.`);
    return Object.fromEntries(headers.map((header, i) => [header, cells[i] ?? ""]));
  });
  return { headers, rows };
}

export function parseImportNumber(value) {
  const cleaned = String(value).trim().replace(/[,\s%]/g, "");
  const number = Number(cleaned.replace(/^\((.*)\)$/, "-$1"));
  if (!cleaned || !Number.isFinite(number)) throw new Error(`Invalid number: "${value}"`);
  return number;
}

export function getXeroCreditReason(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type.includes("overpayment")) return "Overpayment";
  if (type.includes("prepayment")) return "Prepayment";
  if (type.includes("credit note") || type.includes("accrec-credit") || type.includes("accpay-credit")) return "Credit note";
  return "";
}