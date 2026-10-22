import { base44 } from "@/api/base44Client";
import { lineTaxPct } from "@/lib/docTaxSemantics";
import { todayLocalISO } from "@/lib/dateOnly";
import { withRetry } from "@/lib/sdkRetry";

/**
 * Journal posting helpers for the sales/purchasing ledger.
 *
 * Three kinds of entries are produced, distinguished by `entry_type`:
 *  - "document"  : auto-posted when an Invoice/Bill is approved (Awaiting Payment).
 *  - "payment"   : posted when a payment is recorded against an Invoice/Bill.
 *  - "reversal"  : an offsetting entry that voids a document or payment entry.
 *
 * Legacy entries created before `entry_type` existed have no field and are
 * treated as "document" for de-duplication and reversal purposes.
 */

// ── Shared context ──────────────────────────────────────────────────────────

function calcDiscount(sub, discount) {
  if (!discount && discount !== 0) return 0;
  const s = String(discount).trim();
  if (s.endsWith("%")) return sub * (parseFloat(s) / 100);
  return parseFloat(s) || 0;
}

async function loadAccountingContext() {
  // Fail loudly: a failed settings or COA read must abort posting rather than
  // continue with an empty list, which would look like "no settings" and let
  // the by-name / by-type fallback post to guessed accounts. An unposted
  // journal is far better than one posted to the wrong control account.
  const [settings, accounts] = await Promise.all([
    withRetry(() => base44.entities.AccountingSettings.list("-created_date", 10), { tries: 4, label: "autoPostJournal.AccountingSettings" }),
    withRetry(() => base44.entities.ChartOfAccount.list("name", 5000), { tries: 4, label: "autoPostJournal.ChartOfAccount" }),
  ]);
  // Only a successful read with no settings record may fall back by name/type.
  const cfg = settings?.[0] || {};
  const findAcc = (id, nameMatch, typeMatch) => {
    if (id) {
      const byId = accounts.find(a => a.id === id);
      if (byId) return byId;
    }
    if (nameMatch) {
      const byName = accounts.find(a => a.name?.toLowerCase().includes(nameMatch.toLowerCase()));
      if (byName) return byName;
    }
    if (typeMatch) {
      const byType = accounts.find(a => a.type === typeMatch);
      if (byType) return byType;
    }
    return null;
  };
  return { cfg, accounts, findAcc };
}

async function generateJnlNumber() {
  const res = await base44.functions.invoke("getNextSequenceNumber", { sequence_type: "JNL" });
  return res.data.number;
}

function resolveControlAccounts(cfg, accounts, findAcc) {
  const arAcc = findAcc(cfg.accounts_receivable_id, "accounts receivable", "Asset") || { id: "", code: "110", name: "Accounts Receivable" };
  const apAcc = findAcc(cfg.accounts_payable_id, "accounts payable", "Liability") || { id: "", code: "200", name: "Accounts Payable" };
  return { arAcc, apAcc };
}

// Resolve a BankAccount id to its linked Chart of Account (for the Bank side of a payment JE).
async function resolveBankChartAccount(bankAccountId, accounts) {
  if (!bankAccountId) {
    return accounts.find(a => a.type === "Bank") || { id: "", code: "120", name: "Bank" };
  }
  const bank = await base44.entities.BankAccount.get(bankAccountId).catch(() => null);
  if (bank?.chart_account_id) {
    const linked = accounts.find(a => a.id === bank.chart_account_id);
    if (linked) return linked;
    return { id: bank.chart_account_id, code: bank.chart_account_code || "", name: bank.chart_account_name || bank.name || "Bank" };
  }
  if (bank) {
    return accounts.find(a => a.type === "Bank") || { id: "", code: "120", name: bank.name || "Bank" };
  }
  return accounts.find(a => a.type === "Bank") || { id: "", code: "120", name: "Bank" };
}

// Create a reversal entry that mirrors an existing entry with swapped Dr/Cr,
// then voids the original. Keeps an audit trail (Xero-style).
async function createReversal(original, reason) {
  const number = await generateJnlNumber();
  const today = todayLocalISO();
  const reversedLines = (original.lines || []).map(l => ({
    account_id: l.account_id,
    account_code: l.account_code,
    account_name: l.account_name,
    description: `Reversal - ${l.description || ""}`,
    debit: l.credit || 0,
    credit: l.debit || 0,
  }));
  const totalDebit = reversedLines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = reversedLines.reduce((s, l) => s + (l.credit || 0), 0);
  await base44.entities.JournalEntry.create({
    number,
    date: today,
    narration: `Reversal of ${original.number} - ${reason}`,
    reference: original.number,
    source_type: original.source_type,
    source_id: original.source_id,
    source_number: original.source_number,
    entry_type: "reversal",
    status: "Posted",
    posted_date: today,
    currency: original.currency || "AED",
    contact_id: original.contact_id || "",
    contact_name: original.contact_name || "",
    lines: reversedLines,
    total_debit: totalDebit,
    total_credit: totalCredit,
  });
  await base44.entities.JournalEntry.update(original.id, { status: "Voided" });
}

// ── Document posting (approval) ──────────────────────────────────────────────

/**
 * Auto-post a Journal Entry from an approved Invoice or Bill.
 * Called when status changes to "Awaiting Payment" (approved).
 *
 * @param {"Invoice"|"Bill"} docType
 * @param {object} doc  - the invoice or bill object
 */
export async function autoPostJournal(docType, doc) {
  // Avoid duplicate document entries for the same source.
  // Legacy entries (no entry_type) count as document entries.
  const existing = await base44.entities.JournalEntry.filter({ source_id: doc.id }).catch(() => []);
  if (existing.some(j => j.entry_type !== "payment" && j.entry_type !== "reversal")) return;

  const { cfg, accounts, findAcc } = await loadAccountingContext();
  const { arAcc, apAcc } = resolveControlAccounts(cfg, accounts, findAcc);
  const salesTaxAcc = findAcc(cfg.sales_tax_account_id, "output vat") || findAcc(null, "vat payable") || findAcc(null, "sales tax") || findAcc(null, "vat on sales") || findAcc(null, null, "Liability") || { id: "", code: "210", name: "Output VAT" };
  const purchaseTaxAcc = findAcc(cfg.purchase_tax_account_id, "vat receivable") || findAcc(null, "input vat") || findAcc(null, "input tax") || findAcc(null, "vat on purchases") || findAcc(null, null, "Asset") || { id: "", code: "180", name: "Input Tax Credit" };
  const defaultRevenueAcc = accounts.find(a => a.type === "Revenue") || { id: "", code: "400", name: "Sales" };
  const defaultExpenseAcc = accounts.find(a => a.category === "Expenses") || { id: "", code: "600", name: "Expense" };

  const isInvoice = docType === "Invoice";
  const today = todayLocalISO();
  const number = await generateJnlNumber();

  const lines = [];

  if (isInvoice) {
    // DR Accounts Receivable for total
    lines.push({
      account_id: arAcc.id,
      account_code: arAcc.code,
      account_name: arAcc.name,
      description: `AR - ${doc.contact_name} - ${doc.number}`,
      debit: doc.total || 0,
      credit: 0,
    });

    // CR Revenue lines (net of discount)
    for (const item of (doc.line_items || [])) {
      if (!item.description && !item.unit_price) continue;
      const lineSubtotal = (item.quantity || 0) * (item.unit_price || 0);
      if (lineSubtotal === 0) continue;
      const disc = calcDiscount(lineSubtotal, item.discount);
      const netRevenue = lineSubtotal - disc;
      if (netRevenue === 0) continue;
      const revAcc = item.account_id
        ? (accounts.find(a => a.id === item.account_id) || { id: item.account_id, code: item.account_code || "", name: item.account_name || "Revenue" })
        : defaultRevenueAcc;
      lines.push({
        account_id: revAcc.id,
        account_code: revAcc.code,
        account_name: revAcc.name,
        description: item.description || "Revenue",
        debit: 0,
        credit: netRevenue,
      });
      // Tax portion (on discounted amount). The percentage comes from the shared tax
      // adapter: imported documents store the line tax AMOUNT in line.tax_rate, so it
      // must never be multiplied as a percent.
      const taxPct = lineTaxPct(item, doc);
      if (taxPct > 0) {
        const taxAmt = netRevenue * (taxPct / 100);
        lines.push({
          account_id: salesTaxAcc.id,
          account_code: salesTaxAcc.code,
          account_name: salesTaxAcc.name,
          description: `Tax ${taxPct}% - ${item.description}`,
          debit: 0,
          credit: taxAmt,
        });
      }
    }
  } else {
    // Bill: DR Expense lines (net of discount) + Tax, CR Accounts Payable
    for (const item of (doc.line_items || [])) {
      if (!item.description && !item.unit_price) continue;
      const lineSubtotal = (item.quantity || 0) * (item.unit_price || 0);
      if (lineSubtotal === 0) continue;
      const disc = calcDiscount(lineSubtotal, item.discount);
      const netExpense = lineSubtotal - disc;
      if (netExpense === 0) continue;
      const expAcc = item.account_id
        ? (accounts.find(a => a.id === item.account_id) || { id: item.account_id, code: item.account_code || "", name: item.account_name || "Expense" })
        : defaultExpenseAcc;
      lines.push({
        account_id: expAcc.id,
        account_code: expAcc.code,
        account_name: expAcc.name,
        description: item.description || "Expense",
        debit: netExpense,
        credit: 0,
      });
      // Tax portion (on discounted amount). The percentage comes from the shared tax
      // adapter: imported documents store the line tax AMOUNT in line.tax_rate.
      const taxPct = lineTaxPct(item, doc);
      if (taxPct > 0) {
        const taxAmt = netExpense * (taxPct / 100);
        lines.push({
          account_id: purchaseTaxAcc.id,
          account_code: purchaseTaxAcc.code,
          account_name: purchaseTaxAcc.name,
          description: `Tax ${taxPct}% - ${item.description}`,
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
    entry_type: "document",
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

// ── Credit note posting ──────────────────────────────────────────────────────

/**
 * Auto-post a Journal Entry from an approved Credit Note.
 * A credit note is the mirror of an invoice: it credits AR (reduces what the
 * customer owes) and debits revenue + tax.
 *
 *   DR Revenue (net of discount)
 *   DR Sales Tax (output VAT)
 *   CR Accounts Receivable (total)
 *
 * @param {object} cn - the credit note object
 */
export async function postCreditNoteJournal(cn) {
  if (!cn?.id) return;

  // Avoid duplicate document entries for the same source.
  const existing = await base44.entities.JournalEntry.filter({ source_id: cn.id, source_type: "CreditNote" }).catch(() => []);
  if (existing.some(j => j.entry_type !== "payment" && j.entry_type !== "reversal")) return;

  const { cfg, accounts, findAcc } = await loadAccountingContext();
  const { arAcc } = resolveControlAccounts(cfg, accounts, findAcc);
  const salesTaxAcc = findAcc(cfg.sales_tax_account_id, "output vat") || findAcc(null, "vat payable") || findAcc(null, "sales tax") || findAcc(null, "vat on sales") || findAcc(null, null, "Liability") || { id: "", code: "210", name: "Output VAT" };
  const defaultRevenueAcc = accounts.find(a => a.type === "Revenue") || { id: "", code: "400", name: "Sales" };

  const today = todayLocalISO();
  const number = await generateJnlNumber();
  const lines = [];

  // DR Revenue lines (net of discount) — reverses the invoice revenue
  for (const item of (cn.line_items || [])) {
    if (!item.description && !item.unit_price) continue;
    const lineSubtotal = (item.quantity || 0) * (item.unit_price || 0);
    if (lineSubtotal === 0) continue;
    const disc = calcDiscount(lineSubtotal, item.discount);
    const netRevenue = lineSubtotal - disc;
    if (netRevenue === 0) continue;
    const revAcc = item.account_id
      ? (accounts.find(a => a.id === item.account_id) || { id: item.account_id, code: item.account_code || "", name: item.account_name || "Revenue" })
      : defaultRevenueAcc;
    lines.push({
      account_id: revAcc.id,
      account_code: revAcc.code,
      account_name: revAcc.name,
      description: item.description || "Credit",
      debit: netRevenue,
      credit: 0,
    });
    // DR Tax (reverses the invoice tax). Percentages come from the shared tax adapter:
    // an imported credit note stores signed line tax AMOUNTS (-75), not rates.
    const taxPct = lineTaxPct(item, cn);
    if (taxPct > 0) {
      const taxAmt = netRevenue * (taxPct / 100);
      lines.push({
        account_id: salesTaxAcc.id,
        account_code: salesTaxAcc.code,
        account_name: salesTaxAcc.name,
        description: `Tax ${taxPct}% - ${item.description}`,
        debit: taxAmt,
        credit: 0,
      });
    }
  }

  // CR Accounts Receivable for total — reduces the customer's balance
  lines.push({
    account_id: arAcc.id,
    account_code: arAcc.code,
    account_name: arAcc.name,
    description: `AR - ${cn.contact_name} - ${cn.number}`,
    debit: 0,
    credit: cn.total || 0,
  });

  if (lines.length < 2) return;

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

  await base44.entities.JournalEntry.create({
    number,
    date: cn.issue_date || today,
    narration: `Credit Note ${cn.number} - ${cn.contact_name}`,
    reference: cn.reference || "",
    source_type: "CreditNote",
    source_id: cn.id,
    source_number: cn.number,
    entry_type: "document",
    status: "Posted",
    posted_date: today,
    currency: cn.currency || "AED",
    contact_id: cn.contact_id || "",
    contact_name: cn.contact_name || "",
    project_id: cn.project_id || "",
    project_name: cn.project_name || "",
    lines,
    total_debit: totalDebit,
    total_credit: totalCredit,
  });
}

// ── Payment posting ─────────────────────────────────────────────────────────

/**
 * Post a Journal Entry for a payment recorded against an Invoice or Bill.
 *  - Invoice: DR Bank, CR Accounts Receivable
 *  - Bill:    DR Accounts Payable, CR Bank
 *
 * @param {"Invoice"|"Bill"} docType
 * @param {object} doc          - the invoice or bill (must have id, number, contact_*, currency)
 * @param {object} payment      - the payment record ({ id, date, amount })
 * @param {string} bankAccountId - the BankAccount id used (may be a chart account id for non-bank)
 */
export async function postPaymentJournal(docType, doc, payment, bankAccountId) {
  const amount = Number(payment?.amount) || 0;
  if (amount <= 0 || !doc?.id) return;

  const { cfg, accounts, findAcc } = await loadAccountingContext();
  const { arAcc, apAcc } = resolveControlAccounts(cfg, accounts, findAcc);
  const bankAcc = await resolveBankChartAccount(bankAccountId, accounts);

  const isInvoice = docType === "Invoice";
  const today = todayLocalISO();
  const number = await generateJnlNumber();

  const lines = isInvoice
    ? [
        { account_id: bankAcc.id, account_code: bankAcc.code, account_name: bankAcc.name, description: `Bank - ${doc.number}`, debit: amount, credit: 0 },
        { account_id: arAcc.id, account_code: arAcc.code, account_name: arAcc.name, description: `AR - ${doc.contact_name} - ${doc.number}`, debit: 0, credit: amount },
      ]
    : [
        { account_id: apAcc.id, account_code: apAcc.code, account_name: apAcc.name, description: `AP - ${doc.contact_name} - ${doc.number}`, debit: amount, credit: 0 },
        { account_id: bankAcc.id, account_code: bankAcc.code, account_name: bankAcc.name, description: `Bank - ${doc.number}`, debit: 0, credit: amount },
      ];

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);

  await base44.entities.JournalEntry.create({
    number,
    date: payment.date || today,
    narration: `Payment - ${doc.number} - ${doc.contact_name}`,
    reference: payment.id,
    source_type: docType,
    source_id: doc.id,
    source_number: doc.number,
    entry_type: "payment",
    status: "Posted",
    posted_date: today,
    currency: doc.currency || "AED",
    contact_id: doc.contact_id || "",
    contact_name: doc.contact_name || "",
    lines,
    total_debit: totalDebit,
    total_credit: totalCredit,
  });
}

/**
 * Reverse the journal entry for a specific payment (when a payment is removed).
 * The linked bank transaction is deleted by the caller.
 *
 * @param {"Invoice"|"Bill"} docType
 * @param {object} doc
 * @param {object} payment  - the payment record ({ id })
 */
export async function reversePaymentJournal(docType, doc, payment) {
  if (!doc?.id || !payment?.id) return;
  const existing = await base44.entities.JournalEntry.filter({
    source_id: doc.id,
    source_type: docType,
    entry_type: "payment",
    reference: payment.id,
    status: "Posted",
  }).catch(() => []);
  if (existing.length === 0) return;
  await createReversal(existing[0], `Payment reversed - ${doc.number}`);
}

/**
 * Reverse ALL posted journal entries tied to a document (document + payment entries)
 * and delete its linked bank transactions. Called when an Invoice/Bill is deleted
 * so the ledger returns to the state before the document existed.
 *
 * @param {"Invoice"|"Bill"} docType
 * @param {string} docId
 * @param {string} reason
 */
export async function reverseDocumentJournal(docType, docId, reason = "document deleted") {
  if (!docId) return;
  const entries = await base44.entities.JournalEntry.filter({
    source_id: docId,
    source_type: docType,
    status: "Posted",
  }).catch(() => []);
  const toReverse = entries.filter(j => j.entry_type !== "reversal");
  for (const original of toReverse) {
    await createReversal(original, `${reason} - ${original.source_number || ""}`);
  }
  // Remove bank transactions created by the payment flow so bank balance stays consistent.
  const txs = await base44.entities.BankTransaction.filter({ source_id: docId }).catch(() => []);
  for (const tx of txs) {
    await base44.entities.BankTransaction.delete(tx.id).catch(err => console.error(err));
  }
}