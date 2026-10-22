import { base44 } from "@/api/base44Client";

// Map a BankTransaction type to the corresponding BankRule rule_type
const txTypeToRuleType = (txType) => {
  if (txType === "Spend Money") return "spend";
  if (txType === "Receive Money") return "receive";
  if (txType === "Transfer") return "transfer";
  return null;
};

// Evaluate a single condition against a bank transaction
const evaluateCondition = (condition, tx) => {
  if (!condition || !condition.field) return false;
  const fieldValue = String(tx[condition.field] ?? "").trim();
  const conditionValue = String(condition.value ?? "").trim();
  const fieldLower = fieldValue.toLowerCase();
  const valueLower = conditionValue.toLowerCase();

  switch (condition.operator) {
    case "equals":
      return fieldLower === valueLower;
    case "contains":
      return fieldLower.includes(valueLower);
    case "starts_with":
      return fieldLower.startsWith(valueLower);
    case "ends_with":
      return fieldLower.endsWith(valueLower);
    case "is_blank":
      return fieldValue === "";
    case "greater_than":
      return Number(fieldValue) > Number(conditionValue);
    case "less_than":
      return Number(fieldValue) < Number(conditionValue);
    default:
      return false;
  }
};

// Evaluate all conditions of a rule (match_type all/any)
const evaluateRule = (rule, tx) => {
  const conditions = (rule.conditions || []).filter(c =>
    c.operator === "is_blank" || (c.value && c.value.trim() !== "")
  );
  if (conditions.length === 0) return false;
  if (rule.match_type === "any") {
    return conditions.some(c => evaluateCondition(c, tx));
  }
  return conditions.every(c => evaluateCondition(c, tx));
};

// Find the first matching rule for a transaction (first matching rule wins)
export const findMatchingRule = (rules, tx) => {
  const txRuleType = txTypeToRuleType(tx.type);
  if (!txRuleType) return null;
  for (const rule of rules) {
    if (rule.rule_type !== txRuleType) continue;
    if (rule.bank_account_id && rule.bank_account_id !== tx.bank_account_id) continue;
    if (evaluateRule(rule, tx)) return rule;
  }
  return null;
};

// Load active bank rules ordered by sort_order, optionally filtered by rule_type
export const loadBankRules = async (ruleType = null) => {
  const query = { status: "Active" };
  if (ruleType) query.rule_type = ruleType;
  const page = await base44.entities.BankRule.filter(query, { sort: "sort_order", limit: 500 });
  return page.items || [];
};

// Apply a matching rule to a transaction — returns { rule, updates } or null
export const applyRulesToTransaction = (rules, tx) => {
  const rule = findMatchingRule(rules, tx);
  if (!rule) return null;
  const updates = {};
  if (rule.target_account_id) {
    updates.account_id = rule.target_account_id;
    updates.account_code = rule.target_account_code || "";
    updates.account_name = rule.target_account_name || "";
  }
  if (rule.contact_id) {
    updates.contact_id = rule.contact_id;
    updates.contact_name = rule.contact_name || "";
  }
  if (rule.tax_rate != null) {
    updates.tax_rate = rule.tax_rate;
  }
  if (rule.reference) {
    updates.reference = rule.reference;
  }
  return { rule, updates };
};

// Run rules on multiple transactions — returns { matched, updated, failed }
// Never touches Reconciled transactions
export const runRulesOnTransactions = async (transactions, rules = null) => {
  if (!rules) rules = await loadBankRules();
  let matched = 0, updated = 0;
  const failed = [];
  for (const tx of transactions) {
    if (tx.status === "Reconciled") continue;
    const result = applyRulesToTransaction(rules, tx);
    if (!result) continue;
    matched++;
    try {
      await base44.entities.BankTransaction.update(tx.id, result.updates);
      updated++;
    } catch (err) {
      failed.push({ txId: tx.id, error: err.message });
    }
  }
  return { matched, updated, failed };
};