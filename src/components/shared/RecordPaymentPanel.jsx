import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, CreditCard, CheckCircle2, X } from "lucide-react";
import { toast } from "sonner";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";
import { postPaymentJournal, reversePaymentJournal } from "@/lib/autoPostJournal";
import { recordPayment } from "@/lib/recordPayment";
import { formatDateOnly, todayLocalISO } from "@/lib/dateOnly";

const JE_DOC_TYPE = { invoice: "Invoice", bill: "Bill" };

const num = (n, currency = "") =>
  `${(n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${currency ? " " + currency : ""}`;

/**
 * RecordPaymentPanel
 * Props:
 *   docType: "invoice" | "bill"
 *   doc: the full invoice/bill object (must be saved, with id)
 *   currency: string
 *   onPaymentSaved: () => void  — called after a payment is added/removed so parent can refresh
 */
export default function RecordPaymentPanel({ docType, doc, currency, onPaymentSaved }) {
  const navigate = useNavigate();
  const chartAccounts = useChartOfAccounts();
  const [bankAccounts, setBankAccounts] = useState([]);

  useEffect(() => {
    base44.entities.BankAccount.filter({ status: "Active" }).then(setBankAccounts).catch(err => console.error(err));
  }, []);

  // Combine: bank accounts first (type="Bank"), then chart accounts
  const allAccounts = [
    ...bankAccounts.map(b => ({ id: b.id, code: b.account_number || "", name: b.name, type: "Bank" })),
    ...chartAccounts,
  ];

  const [form, setForm] = useState({
    date: todayLocalISO(),
    bank_account_id: "",
    bank_account_name: "",
    amount: "",
    reference: "",
  });
  const [saving, setSaving] = useState(false);
  const [successBanner, setSuccessBanner] = useState(null); // { amount, docNumber, contact, dueDate, paidDate, total }

  const payments = doc?.payments || [];
  const amountPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
  const amountDue = (doc?.total || 0) - amountPaid;

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleAccountSelect = (acc) => {
    setForm(p => ({ ...p, bank_account_id: acc?.id || "", bank_account_name: acc?.name || "" }));
  };

  const handleRecord = async () => {
    if (!form.date) { toast.error("Date is required"); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Amount must be greater than 0"); return; }
    if (!form.bank_account_id) { toast.error("Please select an account"); return; }

    setSaving(true);
    try {
      const paymentAmount = Number(form.amount);

      // Check if selected account is a real BankAccount (type="Bank") or a chart account
      const selectedAccount = allAccounts.find(a => a.id === form.bank_account_id);
      const isBankAccount = selectedAccount?.type === "Bank";

      await recordPayment(docType, doc, { ...form, amount: paymentAmount }, isBankAccount, currency);

      setSuccessBanner({
        amount: paymentAmount,
        docNumber: doc.number,
        contact: doc.contact_name,
        dueDate: doc.due_date,
        paidDate: form.date,
        total: doc.total,
      });
      setForm({ date: todayLocalISO(), bank_account_id: form.bank_account_id, bank_account_name: form.bank_account_name, amount: "", reference: "" });
      onPaymentSaved();
    } catch (err) {
      toast.error("Failed to record payment: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (payment) => {
    if (!confirm("Remove this payment? The linked bank transaction will also be deleted.")) return;

    setSaving(true);
    try {
      // Delete bank transaction
      if (payment.bank_transaction_id) {
        await base44.entities.BankTransaction.delete(payment.bank_transaction_id).catch(err => console.error(err));
      }
      // Reverse the payment journal entry
      await reversePaymentJournal(JE_DOC_TYPE[docType], doc, payment).catch((e) => console.error("reversePaymentJournal failed", e));

      const updatedPayments = payments.filter(p => p.id !== payment.id);
      const newAmountPaid = updatedPayments.reduce((s, p) => s + (p.amount || 0), 0);
      const newAmountDue = Math.max(0, (doc.total || 0) - newAmountPaid);
      const entityName = docType === "invoice" ? "Invoice" : "Bill";
      await base44.entities[entityName].update(doc.id, {
        payments: updatedPayments,
        amount_paid: newAmountPaid,
        status: newAmountPaid < (doc.total || 0) ? "Awaiting Payment" : "Paid",
      });

      toast.success("Payment removed");
      onPaymentSaved();
    } catch (err) {
      toast.error("Failed to remove payment: " + (err?.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  if (!doc?.id) return null;

  const fmtDate = (d) => d ? formatDateOnly(d, "day") : "";

  return (
    <div className="space-y-4">
      {/* Success banner */}
      {successBanner && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-green-800 font-medium">
                {docType === "invoice" ? "Payment Received" : "Payment Made"} - {num(successBanner.amount, currency)} - {successBanner.docNumber}
                {successBanner.contact ? ` - ${successBanner.contact}` : ""}
                {successBanner.dueDate ? ` - Due ${fmtDate(successBanner.dueDate)}` : ""}
                {successBanner.paidDate ? ` - Paid On ${fmtDate(successBanner.paidDate)}` : ""}
                {successBanner.total ? ` - Total ${num(successBanner.total, currency)}` : ""}
              </p>
            </div>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="text-green-600 hover:text-green-800 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {/* Payment summary */}
      <div className="flex justify-end">
        <div className="space-y-1 text-sm min-w-[220px]">
          <div className="flex justify-between text-muted-foreground">
            <span>{docType === "invoice" ? "Invoice Total" : "Bill Total"}</span>
            <span className="tabular-nums font-medium">{num(doc.total, currency)}</span>
          </div>
          {amountPaid > 0 && (
            <div className="flex justify-between text-success">
              <span>Amount Paid</span>
              <span className="tabular-nums font-medium">−{num(amountPaid, currency)}</span>
            </div>
          )}
          <div className={`flex justify-between font-bold border-t border-border pt-1 ${amountDue <= 0 ? "text-success" : "text-foreground"}`}>
            <span>Amount Due</span>
            <span className="tabular-nums">{num(Math.max(0, amountDue), currency)}</span>
          </div>
        </div>
      </div>

      {/* Existing payments */}
      {payments.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-2 bg-slate-100 border-b border-slate-300">
            <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{docType === "invoice" ? "Payments Received" : "Payments Made"}</p>
          </div>
          {payments.map(p => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 text-sm">
              <div className="flex items-center gap-3">
                <CreditCard className="w-4 h-4 text-success" />
                <div>
                  {p.bank_transaction_id ? (
                    <button
                      onClick={() => navigate(`/accounting/banks?txId=${p.bank_transaction_id}`)}
                      className="font-medium text-primary hover:underline"
                      title="View bank transaction"
                    >
                      {num(p.amount, currency)}
                    </button>
                  ) : (
                    <p className="font-medium text-foreground">{num(p.amount, currency)}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{fmtDate(p.date)}{p.bank_account_name ? ` · ${p.bank_account_name}` : ""}{p.reference ? ` · ${p.reference}` : ""}</p>
                </div>
              </div>
              <button onClick={() => handleRemove(p)} className="text-muted-foreground hover:text-destructive transition-colors ml-3">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Record payment form — only show if not fully paid */}
      {amountDue > 0 && (
        <div className="rounded-xl border border-slate-300 bg-white p-4">
          <p className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3">Record Payment</p>
          <div className="grid grid-cols-4 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Date paid</label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} className="h-8 text-sm" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Account</label>
              <AccountCombobox
                accounts={allAccounts}
                value={form.bank_account_id}
                onChange={handleAccountSelect}
                placeholder="Select account…"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Amount paid</label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder={num(amountDue)}
                  value={form.amount}
                  onChange={e => set("amount", e.target.value)}
                  className="h-8 text-sm pr-14"
                />
                <button
                  type="button"
                  onClick={() => set("amount", amountDue.toFixed(2))}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-primary hover:text-primary/80 bg-primary/10 hover:bg-primary/20 rounded px-1.5 py-0.5 transition-colors whitespace-nowrap"
                  title="Fill full amount due"
                >
                  Full
                </button>
              </div>
              {form.amount && Number(form.amount) < amountDue && Number(form.amount) > 0 && (
                <button
                  type="button"
                  onClick={() => set("amount", (amountDue - Number(form.amount)).toFixed(2))}
                  className="mt-1 text-[10px] text-primary hover:underline"
                >
                  Remaining: {num(amountDue - Number(form.amount), currency)}
                </button>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Reference <span className="text-muted-foreground/50">(optional)</span></label>
              <Input placeholder="Cheque / ref" value={form.reference} onChange={e => set("reference", e.target.value)} className="h-8 text-sm" />
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <Button size="sm" onClick={handleRecord} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
              {saving ? "Recording…" : "Record payment"}
            </Button>
          </div>
        </div>
      )}

      {amountDue <= 0 && payments.length > 0 && (
        <div className="flex items-center gap-2 text-success text-sm font-medium py-2">
          <CreditCard className="w-4 h-4" />
          Fully paid — no outstanding amount
        </div>
      )}
    </div>
  );
}