/**
 * Singleton settings helpers.
 *
 * AccountingSettings, OperationsSettings, Organization and PayrollSettings are
 * singletons — exactly one record is intended. The dangerous pattern is "read
 * the list, then create a record when the read came back empty" combined with
 * `.catch(() => [])`: a transient API error (e.g. HTTP 429) then looks like an
 * empty list and the app creates a duplicate empty settings row. That happened
 * in production — a duplicate empty AccountingSettings silently disabled the
 * accounting period lock.
 *
 * These helpers never turn a failed read into "no record exists": the error is
 * rethrown after retries so callers can surface it and abort instead of
 * creating a duplicate.
 */
import { withRetry } from "@/lib/sdkRetry";

const RETRY_OPTS = { tries: 4 };

/**
 * Read the canonical singleton record.
 * @param entityClient entity client (e.g. base44.entities.AccountingSettings)
 * @param entityName   entity name, used in retry labels and warnings
 * @returns the canonical record, or null when the read SUCCEEDED with no
 *          records. Throws when the read ultimately fails.
 */
export async function getSingleton(entityClient, entityName = "settings") {
  const list = await withRetry(() => entityClient.list("-created_date", 10), {
    ...RETRY_OPTS,
    label: `${entityName}.getSingleton`,
  });
  const records = Array.isArray(list) ? list : [];
  if (records.length > 1) {
    console.warn(
      `${entityName}: expected exactly 1 record, found ${records.length}. Using the OLDEST (${records[records.length - 1]?.id}) as the canonical record.`
    );
    return records[records.length - 1];
  }
  return records[0] || null;
}

/**
 * Save the singleton payload: update the canonical record when one exists, and
 * create only when the read SUCCEEDED with zero records.
 * @throws when the read fails — the caller must surface it and never create.
 */
export async function saveSingleton(entityClient, payload, entityName = "settings") {
  const existing = await getSingleton(entityClient, entityName);
  if (existing) {
    return withRetry(() => entityClient.update(existing.id, payload), {
      ...RETRY_OPTS,
      label: `${entityName}.update`,
    });
  }
  return withRetry(() => entityClient.create(payload), {
    ...RETRY_OPTS,
    label: `${entityName}.create`,
  });
}