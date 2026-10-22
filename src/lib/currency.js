/**
 * Currency constants and formatting helpers.
 * Base currency is sourced from Organization.currency (see useBaseCurrency hook).
 * Documents (invoices, bills, quotes, POs) keep their own currency + a manual
 * exchange_rate to the base currency, like Xero's multi-currency handling.
 */

// Currencies supported across the app (selector lists + validation).
export const CURRENCIES = [
  "AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR", "MXN", "BRL", "INR", "PKR", "EGP", "JOD",
];

// Fallback base currency when Organization has not been loaded / has no currency.
export const DEFAULT_BASE_CURRENCY = "AED";

/**
 * Format a monetary amount as a currency string.
 * @param {number} amount
 * @param {string} [currency] - ISO code; falls back to DEFAULT_BASE_CURRENCY.
 * @param {number} [maximumFractionDigits]
 */
export function formatCurrency(amount, currency = DEFAULT_BASE_CURRENCY, maximumFractionDigits = 2) {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits,
    }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(amount)}`;
  }
}

/**
 * Compact code-prefixed format e.g. "AED 1,234.50" — used in dense tables.
 */
export function formatMoney(amount, currency = DEFAULT_BASE_CURRENCY, fractionDigits = 2) {
  if (amount === null || amount === undefined || isNaN(amount)) return "—";
  const n = new Intl.NumberFormat("en-US", { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(amount);
  return `${currency} ${n}`;
}

/**
 * Convert an amount from a document currency to the base currency using a
 * manual exchange rate. exchange_rate is expressed as: 1 base unit = rate doc units
 * i.e. base_amount = doc_amount / exchange_rate. When rate is missing/0, no
 * conversion is applied (returns the original amount).
 */
export function toBaseAmount(docAmount, exchangeRate) {
  if (!docAmount) return 0;
  const rate = Number(exchangeRate);
  if (!rate || isNaN(rate) || rate === 0) return docAmount;
  return docAmount / rate;
}