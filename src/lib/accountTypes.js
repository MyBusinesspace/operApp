// Account type → category mapping (Xero-style).
// `type` is the detailed Xero account type (Bank, Current Asset, …).
// `category` is the auto-computed group (Assets, Liabilities, …).

export const ACCOUNT_TYPES = [
  "Bank", "Current Asset", "Fixed Asset", "Non-current Asset", "Prepayment",
  "Current Liability", "Liability", "Non-current Liability",
  "Equity",
  "Depreciation", "Direct Costs", "Expense", "Overhead",
  "Other Income", "Revenue", "Sales",
];

export const CATEGORIES = ["Assets", "Liabilities", "Equity", "Expenses", "Revenue"];

export const TYPE_CATEGORY_MAP = {
  "Bank": "Assets",
  "Current Asset": "Assets",
  "Fixed Asset": "Assets",
  "Non-current Asset": "Assets",
  "Prepayment": "Assets",
  "Current Liability": "Liabilities",
  "Liability": "Liabilities",
  "Non-current Liability": "Liabilities",
  "Equity": "Equity",
  "Depreciation": "Expenses",
  "Direct Costs": "Expenses",
  "Expense": "Expenses",
  "Overhead": "Expenses",
  "Other Income": "Revenue",
  "Revenue": "Revenue",
  "Sales": "Revenue",
};

export const CATEGORY_COLORS = {
  "Assets": "bg-blue-100 text-blue-700",
  "Liabilities": "bg-orange-100 text-orange-700",
  "Equity": "bg-purple-100 text-purple-700",
  "Revenue": "bg-green-100 text-green-700",
  "Expenses": "bg-red-100 text-red-700",
};

export const DEBIT_NORMAL_CATEGORIES = new Set(["Assets", "Expenses"]);

export const getCategoryForType = (type) => TYPE_CATEGORY_MAP[type] || "";

// Alias map: raw/Xero strings → canonical type
const TYPE_ALIASES = {
  "current asset": "Current Asset",
  "fixed asset": "Fixed Asset",
  "non-current asset": "Non-current Asset",
  "noncurrent asset": "Non-current Asset",
  "prepayment": "Prepayment",
  "bank": "Bank",
  "inventory": "Current Asset",
  "accounts receivable": "Current Asset",
  "other current asset": "Current Asset",
  "other asset": "Non-current Asset",
  "intangible asset": "Fixed Asset",
  "asset": "Current Asset",
  "current liability": "Current Liability",
  "non-current liability": "Non-current Liability",
  "noncurrent liability": "Non-current Liability",
  "liability": "Liability",
  "rounding": "Current Liability",
  "historical adjustment": "Current Liability",
  "tracking transfers": "Current Liability",
  "realised currency gains": "Expense",
  "realized currency gains": "Expense",
  "unrealised currency gains": "Expense",
  "unrealized currency gains": "Expense",
  "sales tax": "Current Liability",
  "wages payable": "Current Liability",
  "unpaid expense claims": "Current Liability",
  "accounts payable": "Current Liability",
  "credit card": "Current Liability",
  "loan": "Non-current Liability",
  "other current liability": "Current Liability",
  "other liability": "Non-current Liability",
  "equity": "Equity",
  "retained earnings": "Equity",
  "share capital": "Equity",
  "capital": "Equity",
  "revenue": "Revenue",
  "income": "Revenue",
  "sales": "Sales",
  "service income": "Revenue",
  "other income": "Other Income",
  "other revenue": "Other Income",
  "interest income": "Other Income",
  "dividend income": "Other Income",
  "expense": "Expense",
  "operating expense": "Expense",
  "operating expenses": "Expense",
  "administrative expense": "Overhead",
  "selling expense": "Overhead",
  "overhead": "Overhead",
  "depreciation": "Depreciation",
  "amortisation": "Depreciation",
  "amortization": "Depreciation",
  "cost of sales": "Direct Costs",
  "cost of goods sold": "Direct Costs",
  "cost of goods": "Direct Costs",
  "cogs": "Direct Costs",
  "direct costs": "Direct Costs",
  "tax expense": "Expense",
  "salary": "Expense",
  "wages": "Expense",
  "rent": "Expense",
  "utilities": "Expense",
  "travel": "Expense",
  "marketing": "Expense",
  "insurance": "Expense",
  "interest expense": "Expense",
  "other expense": "Expense",
};

// Normalize a raw type string → { type, category }
export const normalizeAccountType = (rawType) => {
  if (!rawType) return { type: "Expense", category: "Expenses" };
  const trimmed = rawType.trim();
  // Direct match on canonical type
  if (TYPE_CATEGORY_MAP[trimmed]) {
    return { type: trimmed, category: TYPE_CATEGORY_MAP[trimmed] };
  }
  const key = trimmed.toLowerCase();
  // Alias match
  if (TYPE_ALIASES[key]) {
    const t = TYPE_ALIASES[key];
    return { type: t, category: TYPE_CATEGORY_MAP[t] || "" };
  }
  // Partial match
  for (const [p, t] of Object.entries(TYPE_ALIASES)) {
    if (key.includes(p)) return { type: t, category: TYPE_CATEGORY_MAP[t] || "" };
  }
  return { type: trimmed, category: "" };
};

// Same mapping as normalizeAccountType, plus how sure the match is:
// exact | alias | partial | unknown | blank. Partial/unknown/blank need a human look.
export const classifyAccountType = (rawType) => {
  const base = normalizeAccountType(rawType);
  const trimmed = String(rawType || "").trim();
  if (!trimmed) return { ...base, confidence: "blank" };
  if (TYPE_CATEGORY_MAP[trimmed]) return { ...base, confidence: "exact" };
  const key = trimmed.toLowerCase();
  if (TYPE_ALIASES[key]) return { ...base, confidence: "alias" };
  if (base.category) return { ...base, confidence: "partial" };
  return { ...base, confidence: "unknown" };
};
