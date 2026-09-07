import { base44 } from "@/api/base44Client";

/**
 * Auto-post a Journal Entry from an approved Invoice or Bill.
 * Called when status changes to "Awaiting Payment" (approved).
 *
 * @param {"Invoice"|"Bill"} docType
 * @param {object} doc  - the invoice or bill object
 */
export async function autoPostJournal(docType, doc) {
  // Avoid duplicate journal entries for the same source
  const existing = await base44.entities.JournalEntry.filter({ source_id: doc.id }).catch(() => []);
  if (existing.length > 0) return; // already posted

  // Load accounting settings for default accounts
  const settings = await base44.entities.AccountingSettings.list("-created_date", 10).catch(() => []);
  const cfg = settings[0] || {};

  const isInvoice = docType === "Invoice";
  const today = new Date().toISOString().slice(0, 10);

  // Build journal entry number
  const all = await base44.entities.JournalEntry.list("-date", 500).catch(() => []);
  const nums = all.map(j => j.number).filter(n => n && n.startsWith("JNL-"));
  const max = nums.length ? Math.max(...nums.map(n => parseInt(n.replace("JNL-", "")) || 0)) : 0;
  const number = `JNL-${String(max + 1).padStart(4, "0")}`;

  const lines = [];

  if (isInvoice) {
    // DR: Accounts Receivable, CR: Revenue lines + Tax
    const arAccountId = cfg.accounts_receivable_id || "";
    const arAccount = arAccountId ? await base44.entities.ChartOfAccount.filter({ id: arAccountId }).catch(() => []) : [];
    const arAcc = arAccount[0] || { id: arAccountId, code: "1100", name: "Accounts Receivable" };

    // DR Accounts Receivable for total
    lines.push({
      account_id: arAcc.id,
      account_code: arAcc.code,
      account_name: arAcc.name,
      description: `AR - ${doc.contact_name} - ${doc.number}`,
      debit: doc.total || 0,
      credit: 0,
    });

    // CR Revenue lines
    for (const item of (doc.line_items || [])) {
      if (!item.description && !item.unit_price) continue;
      const lineSubtotal = (item.quantity || 0) * (item.unit_price || 0);
      if (lineSubtotal === 0) continue;
      lines.push({
        account_id: item.account_id || "",
        account_code: item.account_code || "",
        account_name: item.account_name || "Revenue",
        description: item.description || "Revenue",
        debit: 0,
        credit: lineSubtotal,
      });
      // Tax portion
      if (item.tax_rate > 0) {
        const taxAmt = lineSubtotal * (item.tax_rate / 100);
        const taxAccId = cfg.sales_tax_account_id || "";
        lines.push({
          account_id: taxAccId,
          account_code: "",
          account_name: "Sales Tax",
          description: `Tax ${item.tax_rate}% - ${item.description}`,
          debit: 0,
          credit: taxAmt,
        });
      }
    }
  } else {
    // Bill: DR Expense lines + Tax, CR Accounts Payable
    const apAccountId = cfg.accounts_payable_id || "";
    const apAccount = apAccountId ? await base44.entities.ChartOfAccount.filter({ id: apAccountId }).catch(() => []) : [];
    const apAcc = apAccount[0] || { id: apAccountId, code: "0800", name: "Accounts Payable" };

    // DR Expense lines
    for (const item of (doc.line_items || [])) {
      if (!item.description && !item.unit_price) continue;
      const lineSubtotal = (item.quantity || 0) * (item.unit_price || 0);
      if (lineSubtotal === 0) continue;
      lines.push({
        account_id: item.account_id || "",
        account_code: item.account_code || "",
        account_name: item.account_name || "Expense",
        description: item.description || "Expense",
        debit: lineSubtotal,
        credit: 0,
      });
      // Tax portion
      if (item.tax_rate > 0) {
        const taxAmt = lineSubtotal * (item.tax_rate / 100);
        const taxAccId = cfg.purchase_tax_account_id || "";
        lines.push({
          account_id: taxAccId,
          account_code: "",
          account_name: "Purchase Tax",
          description: `Tax ${item.tax_rate}% - ${item.description}`,
          debit: taxAmt,
          credit: 0,
        });
      }
    }

    // CR Accounts Payable for total
    lines.push({
      account_id: apAcc.id,
      account_code: apAcc.code,
      account_name: apAcc.name,
      description: `AP - ${doc.contact_name} - ${doc.number}`,
      debit: 0,
      credit: doc.total || 0,
    });
  }

  if (lines.length < 2) return; // nothing to post

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

  await base44.entities.JournalEntry.create({
    number,
    date: doc.issue_date || today,
    narration: `${docType} ${doc.number} - ${doc.contact_name}`,
    reference: doc.reference || "",
    source_type: docType,
    source_id: doc.id,
    source_number: doc.number,
    status: "Posted",
    posted_date: today,
    currency: doc.currency || "AED",
    contact_id: doc.contact_id || "",
    contact_name: doc.contact_name || "",
    project_id: doc.project_id || "",
    project_name: doc.project_name || "",
    lines,
    total_debit: totalDebit,
    total_credit: totalCredit,
  });
}