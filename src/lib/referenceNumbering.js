import { base44 } from "@/api/base44Client";

/**
 * Load numbering settings from a DocumentTemplate record by storageKey.
 * Returns { prefix, number_padding, include_year, next_number }
 */
async function loadSettings(storageKey, defaultPrefix) {
  const list = await base44.entities.DocumentTemplate.list("name", 100);
  const rec = list.find(t => t.name === storageKey);
  if (rec) {
    try {
      const parsed = JSON.parse(rec.footer_notes || "{}");
      return {
        prefix: parsed.prefix || defaultPrefix,
        number_padding: parsed.number_padding || 4,
        include_year: !!parsed.include_year,
        next_number: parsed.next_number || 1,
        id: rec.id,
        raw: parsed,
      };
    } catch {}
  }
  return { prefix: defaultPrefix, number_padding: 4, include_year: false, next_number: 1, id: null, raw: {} };
}

function buildRef(prefix, number_padding, include_year, num) {
  const year = new Date().getFullYear();
  const padded = String(num).padStart(number_padding, "0");
  return include_year ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
}

/**
 * Generate the next reference for a given entity type.
 * Falls back to scanning existing records if needed.
 */
export async function generateReference(storageKey, defaultPrefix, entityList) {
  const settings = await loadSettings(storageKey, defaultPrefix);

  // Find the highest number in existing records
  let maxFound = 0;
  const pattern = new RegExp(`^${settings.prefix}-(?:\\d{4}-)?0*(\\d+)$`);
  for (const r of entityList) {
    if (!r.reference) continue;
    const m = r.reference.match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxFound) maxFound = n;
    }
  }

  // Always take the highest of: stored next_number OR (maxFound + 1)
  // This ensures deleted records don't cause reuse
  const storedNext = settings.next_number || 1;
  const nextNum = Math.max(storedNext, maxFound + 1);

  // Persist the next_number so future calls never go below this
  const newRaw = { ...settings.raw, next_number: nextNum + 1 };
  if (settings.id) {
    await base44.entities.DocumentTemplate.update(settings.id, { footer_notes: JSON.stringify(newRaw) });
  }

  return buildRef(settings.prefix, settings.number_padding, settings.include_year, nextNum);
}