/**
 * Fixed-asset depreciation calculation and account resolution.
 *
 * Supports straight-line and diminishing-value methods, prorated by days.
 * Uses the asset's existing accumulated_depreciation and net_book_value as
 * the starting point (imported from Xero), so nothing already depreciated
 * is counted twice.
 */

// Category → account code fallback (expense / accumulated depreciation)
// Match is case-insensitive on the asset's `category` field.
const CATEGORY_ACCOUNT_MAP = {
  "cranes": { expense: "0416", accumulated: "725" },
  "passenger hoist": { expense: "0416", accumulated: "727" },
  "cradle hanging platform": { expense: "0416", accumulated: "729" },
  "spare and metallic parts": { expense: "0416", accumulated: "711" },
  "vehicles": { expense: "0416", accumulated: "721" },
};

// Partial-match fallbacks (lowercase substring on category)
const CATEGORY_PARTIAL = [
  { test: /crane/i, codes: { expense: "0416", accumulated: "725" } },
  { test: /passenger hoist/i, codes: { expense: "0416", accumulated: "727" } },
  { test: /cradle.*platform|hanging.*platform/i, codes: { expense: "0416", accumulated: "729" } },
  { test: /spare.*metallic|metallic.*part/i, codes: { expense: "0416", accumulated: "711" } },
  { test: /vehicle/i, codes: { expense: "0416", accumulated: "721" } },
];

const DAY_MS = 86400000;

// ── Date helpers (local, no timezone drift) ──────────────────────────────────
function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Resolve depreciation accounts for an asset.
 *
 * Precedence:
 *   1. the asset's own depreciation_account_id / accumulated_account_id
 *   2. the asset's TYPE (AssetGroup via asset.group_id)
 *   3. the hardcoded category fallback (last resort)
 *
 * @param {object} asset
 * @param {Record<string, object>} coaById  — COA records keyed by id
 * @param {Record<string, object>} coaByCode — COA records keyed by lowercase code
 * @param {Record<string, object>} groupsById — AssetGroup records keyed by id
 * @returns {{ expense, accumulated, usedFallback, warned, source }}
 *   expense / accumulated are COA records or null.
 *   usedFallback = true when a category mapping supplied the account.
 *   warned = true when either account is still missing.
 *   source = where the accounts came from: "asset" | "type" | "category" | "none".
 */
export function resolveDepreciationAccounts(asset, coaById, coaByCode, groupsById = {}) {
  let expense = asset.depreciation_account_id ? coaById[asset.depreciation_account_id] : null;
  let accumulated = asset.accumulated_account_id ? coaById[asset.accumulated_account_id] : null;
  let source = expense || accumulated ? "asset" : "none";

  // 2. The asset's TYPE — AssetGroup record via asset.group_id
  if (!expense || !accumulated) {
    const type = asset.group_id ? groupsById[asset.group_id] : null;
    if (type) {
      if (!expense && type.depreciation_account_id) {
        expense = coaById[type.depreciation_account_id] || null;
        if (expense) source = "type";
      }
      if (!accumulated && type.accumulated_account_id) {
        accumulated = coaById[type.accumulated_account_id] || null;
        if (accumulated) source = "type";
      }
    }
  }

  // 3. Last resort: hardcoded category mapping
  let usedFallback = false;
  if (!expense || !accumulated) {
    const cat = String(asset.category || "").toLowerCase().trim();
    let codes = CATEGORY_ACCOUNT_MAP[cat];
    if (!codes) {
      const partial = CATEGORY_PARTIAL.find((p) => p.test.test(asset.category || ""));
      if (partial) codes = partial.codes;
    }
    if (codes) {
      if (!expense && codes.expense) {
        expense = coaByCode[codes.expense.toLowerCase()] || null;
        usedFallback = !!expense;
      }
      if (!accumulated && codes.accumulated) {
        accumulated = coaByCode[codes.accumulated.toLowerCase()] || null;
        usedFallback = usedFallback || !!accumulated;
      }
    }
  }

  if (usedFallback) source = "category";

  const warned = !expense || !accumulated;
  return { expense, accumulated, usedFallback, warned, source };
}

/**
 * Calculate depreciation for an asset from the day after its last depreciation
 * date (or depreciation_start_date / purchase_date) up to `toDate`.
 *
 * - straight_line: (cost - residual) / useful_life_years per year, prorated by days
 * - diminishing_value: depreciation_rate % of current net_book_value per year, prorated by days
 * - full_at_purchase: the whole (net book value - residual) in the first run, then nothing
 * - none: never depreciates
 * - Never depreciates below residual value.
 * - Never starts before purchase_date.
 *
 * @param {object} asset
 * @param {string} toDate  — ISO date (YYYY-MM-DD), typically a month end
 * @returns {{
 *   days, amount, newAccumulated, newBookValue, startDate,
 *   blocked, reason
 * }}
 */
export function calcDepreciation(asset, toDate) {
  const cost = Number(asset.purchase_price) || 0;
  const residual = Number(asset.residual_value) || 0;
  const accumulated = Number(asset.accumulated_depreciation) || 0;
  const method = asset.depreciation_method || "straight_line";
  const life = Number(asset.useful_life_years) || 0;
  const rate = Number(asset.depreciation_rate) || 0;
  const currentBookValue = cost - accumulated;

  // Start date: day after last_depreciation_date, else depreciation_start_date, else purchase_date
  let startDate;
  if (asset.last_depreciation_date) {
    const d = parseDate(asset.last_depreciation_date);
    if (d) {
      d.setDate(d.getDate() + 1);
      startDate = d;
    }
  }
  if (!startDate) {
    startDate = parseDate(asset.depreciation_start_date) || parseDate(asset.purchase_date);
  }
  if (!startDate) {
    return { days: 0, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: "", blocked: true, reason: "No purchase or start date" };
  }

  // Never go before purchase date
  const purchaseDate = parseDate(asset.purchase_date);
  if (purchaseDate) {
    const startStr = formatDate(startDate);
    if (startStr < formatDate(purchaseDate)) {
      startDate = purchaseDate;
    }
  }

  const startStr = formatDate(startDate);
  const endDate = parseDate(toDate);
  if (!endDate) {
    return { days: 0, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: "Invalid target date" };
  }

  // Guard: already depreciated to or past toDate
  if (asset.last_depreciation_date && asset.last_depreciation_date >= toDate) {
    return { days: 0, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: `Already depreciated to ${asset.last_depreciation_date}` };
  }

  const days = Math.max(0, Math.round((endDate - startDate) / DAY_MS) + 1);
  if (days <= 0) {
    return { days: 0, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: "No days in range" };
  }

  // Full depreciation at purchase: the first run writes the remaining book
  // value down to residual in one go, then nothing more.
  if (method === "full_at_purchase") {
    if (currentBookValue <= residual + 0.01) {
      return { days, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: "Fully depreciated" };
    }
    const amount = currentBookValue - residual;
    const newAccumulated = accumulated + amount;
    return { days, amount, newAccumulated, newBookValue: cost - newAccumulated, startDate: startStr, blocked: false, reason: null };
  }

  // Already at or below residual
  if (currentBookValue <= residual + 0.01) {
    return { days, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: "At residual value" };
  }

  // Xero "No depreciation": never depreciates
  if (method === "none") {
    return { days, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: "No depreciation (asset method)" };
  }
  // No depreciation config
  if (method === "straight_line" && life <= 0) {
    return { days, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: "No useful life set" };
  }
  if (method === "diminishing_value" && rate <= 0) {
    return { days, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: "No depreciation rate set" };
  }

  let annual = 0;
  if (method === "straight_line") {
    annual = (cost - residual) / life;
  } else {
    annual = currentBookValue * (rate / 100);
  }

  if (!annual || annual <= 0) {
    return { days, amount: 0, newAccumulated: accumulated, newBookValue: currentBookValue, startDate: startStr, blocked: true, reason: "Calculated annual depreciation is zero" };
  }

  const dailyRate = annual / 365;
  let amount = dailyRate * days;

  // Never below residual
  const maxAllowed = currentBookValue - residual;
  if (amount > maxAllowed) amount = maxAllowed;
  if (amount < 0) amount = 0;

  const newAccumulated = accumulated + amount;
  const newBookValue = cost - newAccumulated;

  return { days, amount, newAccumulated, newBookValue, startDate: startStr, blocked: false, reason: null };
}

/**
 * Journal reference for a depreciation run — used as the anti-duplicate key.
 * One journal per run, so all assets in the same run share this reference.
 */
export function depRunReference(toDate) {
  return `DEP-RUN-${toDate}`;
}

/**
 * Asset tag embedded in each journal line description so the anti-duplicate
 * guard can find which assets were included in a past run.
 */
export function assetTag(assetId) {
  return `ASSET:${assetId}`;
}