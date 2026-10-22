import { base44 } from "@/api/base44Client";
import { getSingleton } from "@/lib/singletonSettings";

/**
 * Period locking helper.
 *
 * The global lock date is stored in AccountingSettings.lock_date.
 * When set, no journal entries, invoices, bills, or credit notes dated
 * before the lock date can be created or edited — matching Xero's
 * "Lock Period" behaviour.
 *
 * Fail-closed: a failed settings read is NEVER cached as "no lock". The read
 * runs through withRetry (inside getSingleton) and, if it still fails, the
 * period is treated as LOCKED for the session so nothing can be posted into a
 * period the lock date might cover. invalidatePeriodLockCache() clears that
 * state (called after settings are saved) so the next read can succeed.
 */

let _cachedSettings = null;
let _cachePromise = null;

async function getLockDate() {
  // Simple in-memory cache; refreshed on each app load.
  if (_cachedSettings !== null) return { lockDate: _cachedSettings.lock_date || null, error: false };
  if (!_cachePromise) {
    _cachePromise = getSingleton(base44.entities.AccountingSettings, "AccountingSettings")
      .then((record) => {
        _cachedSettings = record || {};
        return { lockDate: _cachedSettings.lock_date || null, error: false };
      })
      .catch((err) => {
        console.error("Could not read the accounting lock date — treating the period as LOCKED:", err);
        return { lockDate: null, error: true };
      });
  }
  return _cachePromise;
}

// Allow manual cache invalidation after settings are saved.
export function invalidatePeriodLockCache() {
  _cachedSettings = null;
  _cachePromise = null;
}

/**
 * Check whether a given date falls before the accounting lock date.
 * OpeningBalance journal entries are always exempt — they predate the lock
 * by design (the conversion date is before the first GL transaction).
 * @param {string} date - ISO date string (YYYY-MM-DD)
 * @param {object} opts - { sourceType?: string } — pass sourceType to bypass lock
 * @returns {Promise<{ locked: boolean, lockDate: string|null, error: boolean }>}
 *   error: true means the lock date could not be read — the call is blocked
 *   (locked: true) rather than silently allowed.
 */
export async function checkPeriodLock(date, opts = {}) {
  if (!date) return { locked: false, lockDate: null, error: false };
  if (opts.sourceType === "OpeningBalance") return { locked: false, lockDate: null, error: false };
  const { lockDate, error } = await getLockDate();
  if (error) return { locked: true, lockDate: null, error: true };
  if (!lockDate) return { locked: false, lockDate: null, error: false };
  return { locked: date < lockDate, lockDate, error: false };
}