/**
 * Shared in-memory tax-semantics adapter for Invoice / Quote / CreditNote / Bill.
 *
 * Native documents store the tax RATE (%) in `line.tax_rate`, and the line total is
 * the net amount plus tax.
 * Imported (Xero) documents store the line tax AMOUNT in `line.tax_rate`
 * (see buildImportRecord / quickImportRun: `tax_rate` receives `_li_tax_amount`).
 * Their line total is the net amount, and the document-level subtotal / tax_amount /
 * total are the imported figures. Credit-note lines arrive signed (-75) while the
 * credit note itself stores positive totals, so every comparison here is sign aware.
 *
 * Nothing in this module touches the database, and no record is ever rewritten:
 * the adapter fields (`_taxMode`, `_srcFinancials`, per-line `_impliedPct` / `_taxSign`)
 * live on the form state in memory only and are removed by stripAdapterFields()
 * before a save. When the stored figures match neither convention the document is
 * reported as "ambiguous" and recalculation is refused instead of guessed.
 */

const RATE_TOLERANCE = 0.05;
export const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const near = (a, b) => Math.abs(a - b) <= Math.max(RATE_TOLERANCE, Math.abs(b) * 0.002);
const plausibleRate = (r) => r >= 0 && r <= 100;

export function isBlankLine(line) {
  const l = line || {};
  // A row is blank when it carries no identity and no money. Its tax rate is ignored
  // on purpose: the forms append a trailing UI row pre-filled with the default rate
  // (and a cleared row keeps whatever rate it had), which is a form default, not
  // content — counting it as a real line would break mode detection on imported docs.
  return !String(l.description || l.item_code || l.account_id || l.account_code || "").trim()
    && (num(l.quantity) * num(l.unit_price)) === 0
    && !num(l.total)
    && !String(l.discount || "").trim();
}

export function docLines(doc) {
  return (doc?.line_items || []).filter(l => !isBlankLine(l));
}

export function lineGross(line) {
  return num(line?.quantity) * num(line?.unit_price);
}

export function lineDiscountAmount(line) {
  const gross = lineGross(line);
  const raw = String(line?.discount ?? "").trim();
  if (!raw || !gross) return 0;
  return raw.endsWith("%") ? gross * (parseFloat(raw) / 100) : (parseFloat(raw) || 0);
}

// Taxable base used for amount <-> rate conversion.
export function taxableBase(line) {
  const gross = lineGross(line);
  if (gross) return gross - lineDiscountAmount(line);
  return Math.abs(num(line?.total));
}

// Detection base: a native line without quantity/price stores a tax-inclusive total,
// so the tax is removed before comparing the line value against the document tax.
function detectionBase(line) {
  const gross = lineGross(line);
  if (gross) return gross - lineDiscountAmount(line);
  const total = Math.abs(num(line?.total));
  const rate = num(line?.tax_rate);
  return total && plausibleRate(rate) ? total / (1 + rate / 100) : total;
}

/**
 * Which convention this document's line.tax_rate values follow:
 *   "rate"      — native: the value is a percentage
 *   "amount"    — imported: the value is the line tax amount
 *   "ambiguous" — grounded totals match neither; recalculation must not guess
 */
export function resolveTaxMode(doc) {
  const lines = docLines(doc);
  if (!lines.length) return "rate";
  const rates = lines.map(l => num(l.tax_rate));
  const anyNegative = rates.some(r => r < 0);
  const docTax = Math.abs(num(doc?.tax_amount));
  // No grounded document tax: the only marker is an impossible (negative) rate.
  if (!docTax) return anyNegative ? "amount" : "rate";
  const amountSum = Math.abs(lines.reduce((s, l) => s + num(l.tax_rate), 0));
  const rateSum = lines.reduce((s, l) => s + detectionBase(l) * num(l.tax_rate) / 100, 0);
  const amountMatch = near(amountSum, docTax);
  const rateMatch = near(Math.abs(rateSum), docTax);
  if (amountMatch && !rateMatch) return "amount";
  if (rateMatch && !amountMatch) return "rate";
  // Both readings reproduce the document tax: imported documents keep their stored
  // convention (external_id marker or a signed amount), otherwise the native rate wins.
  if (amountMatch && rateMatch) return (anyNegative || doc?.external_id) ? "amount" : "rate";
  if (!rates.every(plausibleRate)) return "amount";
  return "ambiguous";
}

const modeCache = new WeakMap();
export function docTaxMode(doc) {
  if (!doc || typeof doc !== "object") return "rate";
  const cached = modeCache.get(doc);
  if (cached) return cached;
  const mode = resolveTaxMode(doc);
  modeCache.set(doc, mode);
  return mode;
}

export function docTaxSign(doc) {
  const tax = num(doc?.tax_amount);
  if (tax) return tax < 0 ? -1 : 1;
  return num(doc?.total) < 0 ? -1 : 1;
}

// Sign of a stored imported amount (credit-note lines arrive negative).
export function lineAmountSign(line) {
  return num(line?.tax_rate) < 0 ? -1 : 1;
}

// Sign convention shared by the document's existing imported amounts.
export function lineSignConvention(doc) {
  const amounts = docLines(doc).map(l => num(l.tax_rate)).filter(a => a !== 0);
  if (!amounts.length) return 1;
  return amounts.filter(a => a < 0).length > amounts.length / 2 ? -1 : 1;
}

// Full-precision percentage implied by an imported amount (kept exact so that
// deriving the amount back from it reproduces the imported figure).
export function impliedPct(line) {
  const amount = Math.abs(num(line?.tax_rate));
  const base = taxableBase(line);
  return base ? (amount / base) * 100 : 0;
}

export function isAmountLine(line) {
  return line?._impliedPct !== undefined && line?._impliedPct !== null;
}

// Display percent for one line — shared by the forms, the preview and the PDF.
export function lineTaxPct(line, doc) {
  return docTaxMode(doc) === "amount" ? round2(impliedPct(line)) : round2(num(line?.tax_rate));
}

// Stored value for a percent the user entered or picked.
export function amountForPct(line, pct, sign) {
  const s = sign === undefined || sign === null ? lineAmountSign(line) : sign;
  return round2(s * taxableBase(line) * (num(pct) / 100));
}

// Deliberate edit: the user changed the percentage shown on an imported line.
export function setLineTaxPct(line, pct) {
  const sign = num(line?._taxSign) || lineAmountSign(line) || 1;
  return { ...line, tax_rate: amountForPct(line, pct, sign), _impliedPct: num(pct), _taxSign: sign };
}

// Deliberate edit: quantity / price / discount moved, so the stored amount follows
// the line's tracked percentage and the line total becomes the new net amount.
export function rescaleLineTax(line) {
  if (!isAmountLine(line)) return line;
  const sign = num(line?._taxSign) || lineAmountSign(line) || 1;
  return { ...line, tax_rate: amountForPct(line, line._impliedPct, sign), total: round2(taxableBase(line)) };
}

// A line added while the document stores amounts (product picker / new row).
export function amountModeLine(line, pct, sign) {
  const s = sign === undefined || sign === null ? 1 : sign;
  return { ...line, tax_rate: amountForPct(line, pct, s), _impliedPct: num(pct), _taxSign: s, total: round2(taxableBase(line)) };
}

// Lines created in the UI carry a native rate; in an amount document that rate is
// understood as a percentage once and tracked from then on.
export function normalizeAmountLines(lines, sign) {
  return (lines || []).map(l => {
    if (isAmountLine(l)) return l;
    const pct = plausibleRate(num(l?.tax_rate)) ? num(l.tax_rate) : 0;
    const s = num(l?._taxSign) || sign || 1;
    return { ...l, tax_rate: amountForPct(l, pct, s), total: round2(taxableBase(l)), _impliedPct: pct, _taxSign: s };
  });
}

const FIN_FIELDS = ["quantity", "unit_price", "discount", "tax_rate", "total"];

export function lineFinancials(line) {
  return FIN_FIELDS.map(f => (f === "discount" ? String(line?.[f] ?? "").trim() : num(line?.[f])));
}

export function sameFinancials(a, b) {
  const rowsA = (a || []).filter(l => !isBlankLine(l)).map(lineFinancials);
  const rowsB = (b || []).filter(l => !isBlankLine(l)).map(lineFinancials);
  if (rowsA.length !== rowsB.length) return false;
  return rowsA.every((row, i) => row.every((v, j) => (typeof v === "number" ? Math.abs(v - rowsB[i][j]) < 0.0001 : v === rowsB[i][j])));
}

// Document tax implied by the stored line amounts, keeping the document's own sign
// convention (credit-note lines are negative while the credit note totals positive).
export function impliedDocTax(form) {
  const sum = (form?.line_items || []).filter(l => !isBlankLine(l)).reduce((s, l) => s + num(l.tax_rate), 0);
  return round2(docTaxSign(form) * Math.abs(sum));
}

/**
 * Document totals for the current form state.
 * rate      — original native math (unchanged).
 * amount    — the imported line tax amounts are authoritative. With the imported
 *             lines untouched the stored figures are returned exactly, so a
 *             no-change save writes back what was loaded; once a line changed, the
 *             totals follow the line amounts (signed sum, document sign kept).
 * ambiguous — nothing is recalculated; the stored figures are returned.
 */
export function computeTotals(form) {
  const mode = form?._taxMode || "rate";
  const items = form?.line_items || [];
  const subtotal = items.reduce((s, l) => s + lineGross(l), 0);
  const discount_total = items.reduce((s, l) => s + lineDiscountAmount(l), 0);
  const src = form?._srcFinancials;

  if (mode === "rate") {
    const tax_amount = items.reduce((s, l) => {
      const gross = lineGross(l);
      return s + (gross - lineDiscountAmount(l)) * num(l.tax_rate) / 100;
    }, 0);
    return { subtotal, discount_total, tax_amount, total: subtotal - discount_total + tax_amount };
  }
  if (src && sameFinancials(items, src.line_items)) {
    return { subtotal: src.subtotal, discount_total: src.discount_total, tax_amount: src.tax_amount, total: src.total };
  }
  if (mode === "ambiguous") {
    return { subtotal, discount_total, tax_amount: num(form?.tax_amount), total: num(form?.total) };
  }
  const tax_amount = impliedDocTax(form);
  return { subtotal, discount_total, tax_amount, total: subtotal - discount_total + tax_amount };
}

// Line amount shown in the editor / preview: imported lines store the net amount.
export function lineDisplayTotal(line, doc) {
  if (docTaxMode(doc) === "amount") return round2(num(line?.total));
  return round2(taxableBase(line) + taxableBase(line) * num(line?.tax_rate) / 100);
}

/**
 * Decorate a document loaded into a form with the adapter fields.
 * Always returns a new object; the stored record is never mutated.
 */
export function attachTaxAdapter(doc) {
  const safe = doc || {};
  const mode = resolveTaxMode(safe);
  const sign = lineSignConvention(safe);
  const line_items = (safe.line_items || []).map(l => (mode === "amount"
    ? { ...l, _impliedPct: impliedPct(l), _taxSign: lineAmountSign(l) || sign }
    : { ...l }));
  return {
    ...safe,
    _taxMode: mode,
    _srcFinancials: {
      line_items: (safe.line_items || []).map(l => ({ ...l })),
      subtotal: num(safe.subtotal),
      discount_total: num(safe.discount_total),
      tax_amount: num(safe.tax_amount),
      total: num(safe.total),
    },
    line_items,
  };
}

// Reason a save must be refused, or "" when it may proceed.
export function taxBlockReason(form) {
  if ((form?._taxMode || "rate") !== "ambiguous") return "";
  const src = form?._srcFinancials;
  if (src && sameFinancials(form?.line_items || [], src.line_items)) return "";
  return "This document's stored tax figures match neither a tax rate nor an imported tax amount, so its totals cannot be recalculated automatically. Correct or re-import the tax figures first.";
}

// Remove every UI-only adapter field (document level and line level) before saving.
export function stripAdapterFields(doc) {
  if (!doc || typeof doc !== "object") return doc;
  const out = {};
  Object.keys(doc).forEach(k => {
    if (k.startsWith("_")) return;
    out[k] = k === "line_items" && Array.isArray(doc[k]) ? doc[k].map(stripLine) : doc[k];
  });
  return out;
}

function stripLine(line) {
  const out = {};
  Object.keys(line || {}).forEach(k => { if (!k.startsWith("_")) out[k] = line[k]; });
  return out;
}