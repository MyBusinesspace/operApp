import { base44 } from "@/api/base44Client";

const DEFAULTS = { prefix: "FILE", number_padding: 4, include_year: true, next_number: 1 };

const STORAGE_KEYS = {
  ContactFile: "__contact_file_numbering__",
  ProjectFile: "__project_file_numbering__",
  AssetFile: "__asset_file_numbering__",
  WorkOrderFile: "__workorder_file_numbering__",
  OrganizationFile: "__file_numbering__",
  SharedFile: "__shared_file_numbering__",
};

export function getStorageKeyForEntity(entityName) {
  return STORAGE_KEYS[entityName] || "__file_numbering__";
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadFileNumberingSettings(entityName) {
  const storageKey = getStorageKeyForEntity(entityName);
  try {
    const list = await base44.entities.DocumentTemplate.list("name", 100);
    const s = list.find(t => t.name === storageKey);
    if (s) {
      return { ...DEFAULTS, ...JSON.parse(s.footer_notes || "{}") };
    }
  } catch {}
  return DEFAULTS;
}

/**
 * Generates the next file reference code for any *File entity.
 * Reads configurable settings (prefix, padding, include_year, next_number)
 * from DocumentTemplate stored under "__file_numbering__".
 *
 * @param {string} entityName  e.g. "ProjectFile", "ContactFile", "OrganizationFile"
 * @param {string} fallbackPrefix  fallback prefix if no settings configured (default "FILE")
 * @param {string} typePrefix  optional type-specific prefix (e.g. "TL", "CON") inserted between prefix and year
 */
export async function generateFileReference(entityName, fallbackPrefix = "FILE", typePrefix = "") {
  const settings = await loadFileNumberingSettings(entityName);
  const prefix = settings.prefix || fallbackPrefix;
  const padding = settings.number_padding || 4;
  const includeYear = settings.include_year !== false;
  const tp = (typePrefix || "").trim();

  const year = new Date().getFullYear();
  const yearStr = String(year);
  const suffix2 = yearStr.slice(-2);

  let regex;
  if (tp) {
    // Format: PREFIX-TYPE-YEAR-NUMBER  (TYPE can be any non-hyphen segment to count all types together)
    if (includeYear) {
      regex = new RegExp(`^${escapeRegex(prefix)}-[A-Z0-9]+-(?:${yearStr}|${suffix2})-(\\d+)$`);
    } else {
      regex = new RegExp(`^${escapeRegex(prefix)}-[A-Z0-9]+-(\\d+)$`);
    }
  } else {
    if (includeYear) {
      regex = new RegExp(`^${escapeRegex(prefix)}-(?:${yearStr}|${suffix2})-(\\d+)$`);
    } else {
      regex = new RegExp(`^${escapeRegex(prefix)}-(\\d+)$`);
    }
  }

  const all = await base44.entities[entityName].list("-created_date", 200);
  let max = 0;
  for (const f of all) {
    if (!f.reference) continue;
    const m = f.reference.match(regex);
    if (m) { const n = parseInt(m[1], 10); if (n > max) max = n; }
  }

  const next = Math.max(max + 1, settings.next_number || 1);
  const padded = String(next).padStart(padding, "0");

  if (tp) {
    return includeYear ? `${prefix}-${tp}-${yearStr}-${padded}` : `${prefix}-${tp}-${padded}`;
  }
  return includeYear ? `${prefix}-${yearStr}-${padded}` : `${prefix}-${padded}`;
}

/**
 * Swaps the type prefix in an existing file reference, keeping the same number.
 * - FILE-2026-0001 + "TL" → FILE-TL-2026-0001
 * - FILE-TL-2026-0001 + "CON" → FILE-CON-2026-0001
 * - FILE-TL-2026-0001 + "" → FILE-2026-0001
 *
 * @param {string} ref  the current reference
 * @param {string} typePrefix  the new type prefix (empty string to remove)
 * @returns {string} the updated reference
 */
export function updateFileReferencePrefix(ref, typePrefix = "") {
  if (!ref) return ref;
  const parts = ref.split("-");
  const tp = (typePrefix || "").trim();
  if (parts.length === 3) {
    const [prefix, year, number] = parts;
    return tp ? `${prefix}-${tp}-${year}-${number}` : ref;
  }
  if (parts.length === 4) {
    const [prefix, , year, number] = parts;
    return tp ? `${prefix}-${tp}-${year}-${number}` : `${prefix}-${year}-${number}`;
  }
  return ref;
}