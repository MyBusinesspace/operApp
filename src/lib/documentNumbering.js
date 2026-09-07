/**
 * Document numbering logic
 *
 * Quotes:
 *   Draft     → QD-YYYY-NNNN   (own sequence per year)  [prefix configurable]
 *   Confirmed → Q-YYYY-NNNN    (own sequence per year)   [prefix configurable]
 *
 * Invoices:
 *   Draft     → ID-YYYY-NNNN   [prefix configurable]
 *   Confirmed → INV-YYYY-NNNN  [prefix configurable]
 *
 * "Confirmed" statuses:
 *   Quote:   Sent, Accepted, Declined, Invoiced, Cancelled
 *   Invoice: Sent, Paid, Overdue, Cancelled
 */

import { base44 } from "@/api/base44Client";

const DRAFT_STATUSES_QUOTE   = ["Draft"];
const DRAFT_STATUSES_INVOICE = ["Draft"];

function isDraft(docType, status) {
  if (docType === "quote")   return DRAFT_STATUSES_QUOTE.includes(status);
  if (docType === "invoice") return DRAFT_STATUSES_INVOICE.includes(status);
  return true;
}

/** Default prefixes (fallback if no settings loaded) */
const DEFAULT_PREFIXES = {
  quote_draft: "QD",
  quote_confirmed: "Q",
  invoice_draft: "ID",
  invoice_confirmed: "INV",
};

/** Returns the prefix for a given type + status, with optional custom settings */
export function getPrefix(docType, status, settings = {}) {
  if (docType === "quote") {
    return isDraft("quote", status)
      ? (settings.quote_draft_prefix || DEFAULT_PREFIXES.quote_draft)
      : (settings.quote_confirmed_prefix || DEFAULT_PREFIXES.quote_confirmed);
  }
  if (docType === "invoice") {
    return isDraft("invoice", status)
      ? (settings.invoice_draft_prefix || DEFAULT_PREFIXES.invoice_draft)
      : (settings.invoice_confirmed_prefix || DEFAULT_PREFIXES.invoice_confirmed);
  }
  return "X";
}

/**
 * Given all existing documents (quotes or invoices),
 * compute the next available number for the given type, status and year.
 *
 * @param {string}   docType   "quote" | "invoice"
 * @param {string}   status    current status (Draft or confirmed)
 * @param {number}   year      full year e.g. 2026
 * @param {Array}    allDocs   all existing documents of that type
 * @param {object}   settings  optional numbering settings from DB
 * @returns {string}           e.g. "QD-2026-0003"
 */
export function generateNextNumber(docType, status, year, allDocs, settings = {}) {
  const prefix = getPrefix(docType, status, settings);
  const yearStr = String(year);
  const suffix2 = String(year).slice(-2);
  const padding = settings.number_padding || 4;
  const includeYear = settings.include_year !== false;

  // Match numbers with this prefix AND this year
  // Patterns: PREFIX-YYYY-NNNN or PREFIX-YY-NNNN (with or without year)
  let regex;
  if (includeYear) {
    regex = new RegExp(`^${escapeRegex(prefix)}-(?:${yearStr}|${suffix2})-(\\d+)$`);
  } else {
    regex = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`);
  }

  let max = 0;
  for (const doc of allDocs) {
    if (!doc.number) continue;
    const m = doc.number.match(regex);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }

  const next = max + 1;
  const padded = String(next).padStart(padding, "0");

  if (includeYear) {
    return `${prefix}-${yearStr}-${padded}`;
  }
  return `${prefix}-${padded}`;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Fetch every record of an entity type in batches (skip/limit), so the
 * sequence-max calculation never misses older records that hold the highest
 * numbers. Returns an array of all records (only `number` is needed).
 */
async function fetchAllNumbers(entity, maxItems = 10000) {
  const all = [];
  let skip = 0;
  const batchSize = 500;
  while (skip < maxItems) {
    const batch = await entity.list("-created_date", batchSize, skip).catch(() => []);
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    if (batch.length < batchSize) break;
    skip += batchSize;
  }
  return all;
}

/**
 * Generate the next document number AND guarantee it doesn't collide with an
 * existing record. Fetches all docs of the type, computes the next candidate
 * from the max matching number, then increments until the candidate is not
 * already used by another document.
 *
 * @param {string} docType   "quote" | "invoice"
 * @param {string} status    current status (Draft or confirmed)
 * @param {number} year      full year e.g. 2026
 * @param {object} settings  numbering settings from DB
 * @param {string} [excludeId]  when editing, pass the current doc id so its own
 *                              number is not treated as a collision
 * @returns {Promise<string>} e.g. "QD-2026-0007"
 */
export async function fetchUniqueNextNumber(docType, status, year, settings = {}, excludeId = null) {
  const entity = docType === "quote" ? base44.entities.Quote : base44.entities.Invoice;
  const allDocs = await fetchAllNumbers(entity);
  const usedNumbers = new Set(
    allDocs.filter(d => d.id !== excludeId && d.number).map(d => d.number)
  );

  // Include retired numbers so deleted document numbers are never reused
  const retired = await fetchRetiredNumbers(docType, year);
  for (const r of retired) {
    usedNumbers.add(r);
  }

  // Start from the max-based candidate (considering retired numbers too)
  const retiredForMax = retired.map(n => ({ number: n }));
  let candidate = generateNextNumber(docType, status, year, [...allDocs.filter(d => d.id !== excludeId), ...retiredForMax], settings);

  // If it somehow collides (concurrent create, manual edit, etc.), keep incrementing
  let guard = 0;
  while (usedNumbers.has(candidate) && guard < 10000) {
    guard++;
    const m = candidate.match(/^(.*?-\d{4}-)(\d+)$/) || candidate.match(/^(.*?-)(\d+)$/);
    if (!m) break;
    const next = parseInt(m[2], 10) + 1;
    const padding = settings.number_padding || 4;
    candidate = `${m[1]}${String(next).padStart(padding, "0")}`;
  }
  return candidate;
}

/**
 * Fetch retired document numbers for a given type (optionally filtered by year).
 */
async function fetchRetiredNumbers(docType, year) {
  try {
    const filter = year ? { doc_type: docType, year } : { doc_type: docType };
    const records = await base44.entities.RetiredDocumentNumber.filter(filter, "-created_date", 1000).catch(() => []);
    return (records || []).map(r => r.number).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Retire a document number so it can never be reused after the document is deleted.
 */
export async function retireDocumentNumber(docType, number, docId = null, reason = "document deleted") {
  if (!docType || !number) return;
  const year = parseInt((number.match(/-(\d{4})-/) || [])[1] || new Date().getFullYear(), 10);
  const prefix = (number.split("-")[0] || "").trim();
  try {
    await base44.entities.RetiredDocumentNumber.create({
      doc_type: docType,
      number,
      year,
      prefix,
      doc_id: docId || null,
      reason,
    });
  } catch {
    // non-fatal: numbering still works, just may reuse if this fails
  }
}

/**
 * Call this when the status changes between Draft ↔ confirmed
 * to decide whether the number needs to be re-generated.
 *
 * Returns true if old number belongs to a different series than the new status.
 */
export function numberSeriesMismatch(docType, currentNumber, newStatus, settings = {}) {
  if (!currentNumber) return true; // no number yet → always generate
  const newPrefix = getPrefix(docType, newStatus, settings);
  return !currentNumber.startsWith(newPrefix + "-");
}