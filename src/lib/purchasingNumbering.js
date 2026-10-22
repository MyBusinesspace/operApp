/**
 * Purchasing numbering settings loader.
 *
 * Settings are stored as JSON in a DocumentTemplate record named
 * "__purchasing_numbering_settings__" (same pattern as sales numbering).
 *
 * Shape:
 * {
 *   bill_prefix:         "BILL",
 *   po_prefix:           "PO",
 *   include_year:        true,
 *   reset_yearly:        true,
 *   default_currency:    "AED",
 *   default_payment_terms:"Net 30",
 *   bill_due_days:       30,
 *   po_delivery_days:    7,
 *   bill_default_notes:  "",
 *   po_default_notes:    "",
 * }
 */

import { base44 } from "@/api/base44Client";

export const DEFAULT_PURCHASING_NUMBERING = {
  bill_prefix: "BILL",
  po_prefix: "PO",
  include_year: true,
  reset_yearly: true,
  default_currency: "AED",
  default_payment_terms: "Net 30",
  bill_due_days: 30,
  po_delivery_days: 7,
  bill_default_notes: "",
  po_default_notes: "",
};

let _cache = null;

/**
 * Load purchasing numbering settings from the DB.
 * Returns the merged settings object (defaults + stored overrides).
 */
export async function loadPurchasingNumberingSettings() {
  if (_cache) return _cache;
  try {
    const list = await base44.entities.DocumentTemplate.list("name", 100);
    const rec = list.find(t => t.name === "__purchasing_numbering_settings__");
    if (rec) {
      try {
        const parsed = JSON.parse(rec.footer_notes || "{}");
        _cache = { ...DEFAULT_PURCHASING_NUMBERING, ...parsed };
      } catch {
        _cache = { ...DEFAULT_PURCHASING_NUMBERING };
      }
    } else {
      _cache = { ...DEFAULT_PURCHASING_NUMBERING };
    }
  } catch {
    _cache = { ...DEFAULT_PURCHASING_NUMBERING };
  }
  return _cache;
}

/**
 * Save purchasing numbering settings to the DB.
 */
export async function savePurchasingNumberingSettings(settings, recordId = null) {
  const data = { name: "__purchasing_numbering_settings__", footer_notes: JSON.stringify(settings) };
  let id = recordId;
  if (id) {
    await base44.entities.DocumentTemplate.update(id, data);
  } else {
    const created = await base44.entities.DocumentTemplate.create(data);
    id = created.id;
  }
  _cache = { ...settings };
  return id;
}

/**
 * Build a preview number from a prefix and sequence.
 */
export function previewPurchasingNumber(prefix, num, settings = {}) {
  const year = new Date().getFullYear();
  return settings.include_year !== false ? `${prefix}-${year}-${num}` : `${prefix}-${num}`;
}