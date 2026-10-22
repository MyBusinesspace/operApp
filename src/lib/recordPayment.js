import { base44 } from "@/api/base44Client";
import { postPaymentJournal } from "@/lib/autoPostJournal";

const JE_DOC_TYPE = { invoice: "Invoice", bill: "Bill" };

/**
 * Record a payment against an invoice or bill.
 *
 * Reuses the exact same logic as RecordPaymentPanel: creates a bank transaction
 * (if the account is a real BankAccount), appends to the document's payments
 * array, updates amount_paid and status, and posts the payment journal.
 *
 * @param {string} docType — "invoice" | "bill"
 * @param {object} doc — full invoice/bill object (must be saved, with id)
 * @param {object} payment — { date, amount, bank_account_id, bank_account_name, reference }
 * @param {boolean} isBankAccount — whether the selected account is a real BankAccount
 * @param {string} currency — document currency
 * @returns {object} — { newPayment, newAmountPaid, newStatus }
 */
export async function recordPayment(docType, doc, payment, isBankAccount, currency) {
  const paymentId = crypto.randomUUID();
  const paymentAmount = Number(payment.amount);

  let txId = null;
  if (isBankAccount) {
    const txType = docType === "invoice" ? "Receive Money" : "Spend Money";
    const tx = await base44.entities.BankTransaction.create({
      bank_account_id: payment.bank_account_id,
      bank_account_name: payment.bank_account_name,
      date: payment.date,
      description: `Payment - ${doc.number} (${doc.contact_name})`,
      reference: payment.reference,
      type: txType,
      amount: paymentAmount,
      currency: currency || "AED",
      contact_id: doc.contact_id,
      contact_name: doc.contact_name,
      source_type: docType === "invoice" ? "Invoice" : "Bill",
      source_id: doc.id,
      source_number: doc.number,
      status: "Unreconciled",
    });
    txId = tx.id;
  }

  const newPayment = {
    id: paymentId,
    date: payment.date,
    amount: paymentAmount,
    bank_account_id: payment.bank_account_id,
    bank_account_name: payment.bank_account_name,
    reference: payment.reference,
    bank_transaction_id: txId,
  };

  const updatedPayments = [...(doc.payments || []), newPayment];
  const newAmountPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
  const newStatus = newAmountPaid >= (doc.total || 0) ? "Paid" : doc.status;

  const entityName = docType === "invoice" ? "Invoice" : "Bill";
  await base44.entities[entityName].update(doc.id, {
    payments: updatedPayments,
    amount_paid: newAmountPaid,
    status: newStatus,
  });

  await postPaymentJournal(JE_DOC_TYPE[docType], doc, newPayment, payment.bank_account_id).catch((e) => console.error("postPaymentJournal failed", e));

  return { newPayment, newAmountPaid, newStatus };
}