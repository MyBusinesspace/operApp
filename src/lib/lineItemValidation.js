// One place for the "a document needs at least one useful line item" rule.
//
// A line counts as useful when it has a non-blank description OR a non-zero
// amount (its line total, or its unit price when no total was stored). Negative
// amounts count too — credit notes carry negative lines.
//
// Cancelled / voided documents are exempt: a voided import may legitimately have
// no line items. This rule never rewrites an existing saved document — it only
// guards the moment a document is written or moved to an active status.

const num = (v) => Number(v) || 0;

export const EMPTY_ITEMS_MESSAGE =
  "Add at least one line item with a description or an amount before saving.";

export function hasUsefulLineItem(lines) {
  return (Array.isArray(lines) ? lines : []).some(
    (l) =>
      String(l?.description ?? "").trim() !== "" ||
      num(l?.total) !== 0 ||
      num(l?.unit_price) !== 0,
  );
}

/** Message to show for a save / status change, or null when the document is fine. */
export function itemsError(lines, status) {
  if (String(status || "") === "Cancelled") return null;
  return hasUsefulLineItem(lines) ? null : EMPTY_ITEMS_MESSAGE;
}

/**
 * Import-side rule: an empty ACTIVE document is refused before creation.
 * Cancelled / voided documents are allowed empty (as imported today).
 */
export function importItemsRejection(record, label) {
  if (String(record?.status || "") === "Cancelled") return null;
  if (hasUsefulLineItem(record?.line_items)) return null;
  const ref = record?.number ? ` ${record.number}` : "";
  return `${label}${ref} has no line items — an empty ${String(label).toLowerCase()} is only accepted when it is cancelled/voided.`;
}

/** Same rule, thrown with a flag so import loops can report it and keep going. */
export function assertImportItems(record, label) {
  const reason = importItemsRejection(record, label);
  if (!reason) return;
  const err = new Error(reason);
  err.isRejection = true;
  throw err;
}

export const isRejection = (err) => !!err?.isRejection;