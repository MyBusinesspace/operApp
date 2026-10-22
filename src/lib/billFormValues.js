import { toBaseAmount } from '@/lib/currency';
import {
  computeTotals, lineDiscountAmount, lineGross, lineSignConvention,
  normalizeAmountLines, rescaleLineTax, stripAdapterFields,
} from '@/lib/docTaxSemantics';

export function calcDiscount(subtotal, discount) {
  const value = String(discount ?? '').trim();
  if (!value) return 0;
  return value.endsWith('%') ? subtotal * (parseFloat(value) / 100) : Number(value);
}

/**
 * One bill line.
 * mode "rate"   — native bill: line.tax_rate is a percentage (original behaviour).
 * mode "amount" — imported bill: line.tax_rate is the tax amount, so a financial
 *                 edit rescales the stored amount from the line's tracked percentage
 *                 instead of multiplying the amount as a percent.
 */
export function calcBillLine(line, mode = "rate") {
  if (mode === "amount") return rescaleLineTax(line);
  const quantity = Number(line.quantity ?? 0);
  const unit_price = Number(line.unit_price ?? 0);
  const tax_rate = Number(line.tax_rate ?? 0);
  const subtotal = quantity * unit_price;
  const taxable = subtotal - calcDiscount(subtotal, line.discount);
  return { ...line, description: line.description ?? '', quantity, unit_price, tax_rate, total: taxable + taxable * tax_rate / 100 };
}

export function recalcBillTotals(form) {
  const mode = form?._taxMode || "rate";
  const sourceLines = form?.line_items ?? [];
  const line_items = mode === "amount"
    ? normalizeAmountLines(sourceLines, lineSignConvention(form))
    : sourceLines.map(calcBillLine);
  return { ...form, line_items, ...computeTotals({ ...form, line_items }) };
}

export function hasBillLineContent(line) {
  return Boolean(String(line.description ?? '').trim() || line.account_id || line.account_code || line.account_name
    || Number(line.unit_price ?? 0) !== 0 || Number(line.total ?? 0) !== 0
    || Number(line.quantity ?? 1) !== 1 || String(line.discount ?? '').trim() || Number(line.tax_rate ?? 0) !== 0);
}

export function prepareBillSave(form) {
  // Exclude only the UI's empty entry row; copy all fields of every real line.
  const values = recalcBillTotals({ ...form, line_items: (form.line_items ?? []).filter(hasBillLineContent) });
  // Adapter fields (_taxMode, _srcFinancials, per-line _impliedPct / _taxSign) are
  // in-memory only and must never reach the record.
  const { id, created_date, updated_date, created_by_id, ...payload } = stripAdapterFields(values);
  return { ...payload, base_total: toBaseAmount(payload.total, payload.exchange_rate) };
}

export function verifyBillSave(saved, expected) {
  const fields = ['description', 'quantity', 'unit_price', 'total'];
  const mismatch = (saved.line_items ?? []).length !== expected.line_items.length
    || expected.line_items.some((line, index) => fields.some(field => saved.line_items?.[index]?.[field] !== line[field]))
    || ['subtotal', 'tax_amount', 'total'].some(field => saved[field] !== expected[field]);
  if (mismatch) throw new Error('The saved bill does not match the submitted descriptions or totals. Your edits remain open.');
}

export { lineGross, lineDiscountAmount };