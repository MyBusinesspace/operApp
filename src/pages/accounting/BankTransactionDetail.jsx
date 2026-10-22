import { useState, useEffect, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { formatDateValue } from "@/lib/dateOnly";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, Copy, MoreVertical, HelpCircle, Trash2, RotateCcw, CheckCircle2, Printer, Send } from "lucide-react";
import { toast } from "sonner";
import { usePermissionsMatrix } from "@/hooks/usePermissionsMatrix";
import BankTransactionFiles from "@/components/banking/BankTransactionFiles";

const fmt = (n) =>
  n === 0 ? "0.00" :
  Math.abs(n).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d) => formatDateValue(d);

export default function BankTransactionDetail() {
  const { transactionId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissionsMatrix();
  const [txn, setTxn] = useState(null);
  const [bankAccount, setBankAccount] = useState(null);
  const [journalEntry, setJournalEntry] = useState(null);
  const [sourceDoc, setSourceDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showReconciledView, setShowReconciledView] = useState(false);
  const [runningBalance, setRunningBalance] = useState(null);

  const load = useCallback(async () => {
    if (!transactionId) return;
    setLoading(true);
    try {
      const t = await base44.entities.BankTransaction.get(transactionId);
      setTxn(t);
      if (t.bank_account_id) {
        try {
          const acct = await base44.entities.BankAccount.get(t.bank_account_id);
          setBankAccount(acct);
          // Compute running balance up to and including this transaction
          const txsPage = await base44.entities.BankTransaction.filter(
            { bank_account_id: t.bank_account_id },
            { sort: "date", limit: 5000 }
          );
          const allTx = txsPage.items || [];
          let bal = acct.opening_balance || 0;
          for (const tx of allTx) {
            if (tx.type === "Receive Money") bal += tx.amount;
            else if (tx.type === "Spend Money" || tx.type === "Transfer" || tx.type === "Batch Payment") bal -= tx.amount;
            if (tx.id === t.id) { setRunningBalance(bal); break; }
          }
        } catch {}
      }
      // Load linked journal entry (for reconciled payment details)
      if (t.journal_entry_id) {
        try { setJournalEntry(await base44.entities.JournalEntry.get(t.journal_entry_id)); } catch {}
      }
      // Load source document (invoice/bill) if linked
      if (t.source_type && t.source_id && (t.source_type === "Invoice" || t.source_type === "Bill")) {
        try {
          const entity = t.source_type === "Invoice" ? base44.entities.Invoice : base44.entities.Bill;
          setSourceDoc(await entity.get(t.source_id));
        } catch {}
      }
    } catch (err) {
      toast.error("Failed to load transaction");
    }
    setLoading(false);
  }, [transactionId]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!txn) return;
    if (!confirm("Delete this bank transaction?")) return;
    try {
      await base44.entities.BankTransaction.delete(txn.id);
      toast.success("Transaction deleted");
      navigate("/accounting/banks");
    } catch (err) {
      toast.error("Failed to delete transaction");
    }
  };

  if (loading) {
    return <div className="py-20 text-center text-muted-foreground text-xs">Loading…</div>;
  }

  if (!txn) {
    return <div className="py-20 text-center text-muted-foreground text-xs">Transaction not found.</div>;
  }

  const isSpend = txn.type === "Spend Money";
  const isReconciled = txn.status === "Reconciled";
  const accountName = bankAccount?.name || txn.bank_account_name || "—";
  const accountNumber = bankAccount?.account_number || "";

  const toLabel = txn.type === "Transfer"
    ? (txn.transfer_to_account_name || "—")
    : (txn.contact_name || txn.reference || txn.description || "—");
  const txLineItems = (txn.line_items && txn.line_items.length > 0)
    ? txn.line_items
    : [{
        item_code: "",
        description: txn.description || "",
        quantity: 1,
        unit_price: txn.amount,
        account_id: txn.account_id,
        account_code: txn.account_code,
        account_name: txn.account_name || "",
        tax_rate: 0,
        amount: txn.amount,
      }];
  const subtotal = txLineItems.reduce((sum, li) => sum + (li.amount || 0), 0);
  const isBatchPayment = txn.type === "Batch Payment";
  const batchTotal = (txn.batch_items || []).reduce((sum, item) => sum + (item.payment_amount || 0), 0);
  const isPaymentTxn = (txn.source_type === "Invoice" || txn.source_type === "Bill");
  const sourceLink = txn.source_type === "Invoice" && txn.source_id
    ? `/sales/invoices/${txn.source_id}/edit`
    : txn.source_type === "Bill" && txn.source_id
    ? `/purchasing/bills/${txn.source_id}/edit`
    : null;

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs">
        <Link to="/accounting/banks" className="text-primary hover:underline transition-colors">Bank Accounts</Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        <Link to="/accounting/banks" className="text-primary hover:underline transition-colors">{accountName}</Link>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-foreground font-medium truncate">{txn.source_number || txn.reference || txn.description || "Transaction"}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Transaction: {isBatchPayment ? "Batch Payment" : isPaymentTxn ? "Payment" : txn.type}</h1>
        </div>
        <div className="text-right space-y-0.5">
          <p className="text-xs font-medium text-foreground">{accountName}</p>
          {accountNumber && <p className="text-xs text-muted-foreground">{accountNumber}</p>}
          {runningBalance !== null && (
            <p className="text-xs text-muted-foreground">Balance after: <span className="font-semibold text-foreground tabular-nums">{fmt(runningBalance)} {txn.currency}</span></p>
          )}
        </div>
      </div>

      {showReconciledView ? (
        /* ── Reconciled split view (Image 2) ── */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">Reconciled transaction details</h2>
            <Button size="sm" variant="ghost" onClick={() => setShowReconciledView(false)}>← Back to transaction</Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: statement line */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">This statement line…</span>
                <div className="flex items-center gap-2">
                  {can("bank_transactions", "can_delete") && (
                    <Button size="sm" variant="outline" className="gap-1.5 text-destructive hover:text-destructive" onClick={handleDelete}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  )}
                  <Link to="/accounting/banks" className="text-xs text-primary hover:underline">View Statement</Link>
                </div>
              </div>
              <div className="p-4 bg-emerald-50 border-y border-emerald-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-foreground">{fmtDate(txn.date)}</span>
                  <span className="text-xs font-medium text-muted-foreground uppercase">{isSpend ? "debit" : "credit"}</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{fmt(txn.amount)}</span>
                </div>
                {txn.description && (
                  <p className="text-xs text-muted-foreground mt-2">{txn.description}</p>
                )}
              </div>
            </div>

            {/* Right: reconciled payments */}
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Has been reconciled with the following payments…</span>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { toast.info("Remove & redo reconciliation — coming soon"); }}>
                    <RotateCcw className="w-3.5 h-3.5" /> Remove & Redo
                  </Button>
                  <Link to="/accounting/banks" className="text-xs text-primary hover:underline">Reconciliation Report</Link>
                </div>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/20 border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Spent</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Received</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border hover:bg-muted/20">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs whitespace-nowrap">{fmtDate(txn.date)}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-primary hover:underline cursor-pointer">{txn.contact_name || txn.description || "Payment"}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs">
                      {isSpend ? <span className="text-foreground font-medium">{fmt(txn.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-mono text-xs">
                      {!isSpend ? <span className="text-success font-medium">{fmt(txn.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : isBatchPayment ? (
        /* ── Batch payment view ── */
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Status bar */}
          <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isReconciled ? (
                <span className="text-xs text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-success" /> Reconciled {fmtDate(txn.date)}
                </span>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">Unreconciled</Badge>
              )}
              {isReconciled && (
                <button onClick={() => setShowReconciledView(true)} className="text-xs text-primary hover:underline">
                  View Details ›
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy" onClick={() => { navigator.clipboard?.writeText(txn.id || ""); toast.success("Transaction ID copied"); }}>
                <Copy className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.info("Print Batch PDF — coming soon")}>
                <Printer className="w-3.5 h-3.5" /> Print Batch PDF
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.info("Send Remittance — coming soon")}>
                <Send className="w-3.5 h-3.5" /> Send Remittance
              </Button>
              <Button size="sm" variant="outline" className="gap-1" onClick={() => toast.info("Options — coming soon")}>
                Options <ChevronDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Metadata: Payment Date | Details */}
          <div className="px-4 py-3 border-b border-border grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Payment Date</p>
              <p className="text-xs text-foreground">{fmtDate(txn.date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Details</p>
              <p className="text-xs text-foreground">{txn.description || "—"}</p>
              <p className="text-xs text-muted-foreground mt-0.5">To appear on your bank statement</p>
            </div>
          </div>

          {/* Batch items table */}
          <div className="px-4 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Ref</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Details <span className="text-muted-foreground/60 normal-case font-normal">To appear on contact's bank statement</span>
                  </th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Due Date</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Total</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Payment Amount</th>
                </tr>
              </thead>
              <tbody>
                {(txn.batch_items || []).length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground text-xs">No batch items.</td></tr>
                ) : (txn.batch_items || []).map((item, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="px-3 py-2.5 text-foreground">{item.contact_name || "—"}</td>
                    <td className="px-3 py-2.5">
                      {item.bill_id ? (
                        <Link to={`/purchasing/bills/${item.bill_id}/edit`} className="text-primary hover:underline">
                          {item.bill_number || "—"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{item.bill_number || "—"}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{item.details || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{item.due_date ? fmtDate(item.due_date) : "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{fmt(item.total || 0)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground font-medium">{fmt(item.payment_amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total footer */}
          <div className="px-4 py-3 border-t-2 border-border bg-muted/20 flex justify-end items-center gap-8">
            <span className="text-xs font-bold text-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums text-foreground">{fmt(batchTotal)} <span className="text-xs text-muted-foreground font-normal">{txn.currency}</span></span>
          </div>

          {/* Cancel button */}
          <div className="px-4 py-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => navigate("/accounting/banks")}>Cancel</Button>
          </div>
        </div>
      ) : isPaymentTxn ? (
        /* ── Payment view (linked to invoice/bill) ── */
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Status bar */}
          <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isReconciled ? (
                <span className="text-xs text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-success" /> Reconciled {fmtDate(txn.date)}
                </span>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">Unreconciled</Badge>
              )}
              {isReconciled && (
                <button onClick={() => setShowReconciledView(true)} className="text-xs text-primary hover:underline">
                  View Details ›
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" title="What's this?">
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy" onClick={() => { navigator.clipboard?.writeText(txn.id || ""); toast.success("Transaction ID copied"); }}>
                <Copy className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Options">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Metadata: Payment Date | Reference */}
          <div className="px-4 py-3 border-b border-border grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Payment Date</p>
              <p className="text-xs text-foreground">{fmtDate(txn.date)}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reference</p>
              <p className="text-xs text-foreground">{txn.reference || "—"}</p>
            </div>
          </div>

          {/* Payment table */}
          <div className="px-4 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Contact</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Inv #</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Due Date</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Total</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Payment Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border">
                  <td className="px-3 py-2.5 text-foreground">
                    {sourceDoc?.contact_name || txn.contact_name || "—"}
                  </td>
                  <td className="px-3 py-2.5">
                    {sourceDoc && sourceLink ? (
                      <Link to={sourceLink} className="text-primary hover:underline">
                        {sourceDoc.number || txn.source_number || "—"}
                      </Link>
                    ) : (txn.source_number || txn.reference) ? (
                      <div>
                        <span className="text-muted-foreground">{txn.source_number || txn.reference}</span>
                        <p className="text-xs text-muted-foreground/60">No invoice available (import)</p>
                      </div>
                    ) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{fmtDate(sourceDoc?.issue_date || txn.date)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">{sourceDoc?.due_date ? fmtDate(sourceDoc.due_date) : "—"}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{fmt(sourceDoc?.total ?? txn.amount)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-foreground font-medium">{fmt(txn.amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Total footer */}
          <div className="px-4 py-3 border-t-2 border-border bg-muted/20 flex justify-end items-center gap-8">
            <span className="text-xs font-bold text-foreground">Total</span>
            <span className="text-lg font-bold tabular-nums text-foreground">{fmt(txn.amount)} <span className="text-xs text-muted-foreground font-normal">{txn.currency}</span></span>
          </div>

          {/* Cancel button */}
          <div className="px-4 py-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => navigate("/accounting/banks")}>Cancel</Button>
          </div>
        </div>
      ) : (
        /* ── Transaction details view (Image 1) ── */
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Status bar */}
          <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isReconciled ? (
                <span className="text-xs text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-success" /> Reconciled
                </span>
              ) : (
                <Badge variant="outline" className="text-xs text-muted-foreground">Unreconciled</Badge>
              )}
              {isReconciled && (
                <button onClick={() => setShowReconciledView(true)} className="text-xs text-primary hover:underline">
                  View Details ›
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" title="What's this?">
                <HelpCircle className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Copy" onClick={() => { navigator.clipboard?.writeText(txn.id || ""); toast.success("Transaction ID copied"); }}>
                <Copy className="w-4 h-4 text-muted-foreground" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Options">
                <MoreVertical className="w-4 h-4 text-muted-foreground" />
              </Button>
            </div>
          </div>

          {/* Metadata table: To | Date | Reference | Total */}
          <div className="px-4 py-3 border-b border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">To</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-40">Reference</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-32">Total</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2">
                    {txn.contact_id ? (
                      <Link to={`/contacts/${txn.contact_id}`} className="text-primary hover:underline">{toLabel}</Link>
                    ) : (
                      <span className="text-foreground">{toLabel}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-foreground">{fmtDate(txn.date)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{txn.reference || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-foreground">{fmt(txn.amount)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Tax note */}
          <div className="px-4 py-1.5 text-right">
            <span className="text-xs text-muted-foreground">Amounts are <span className="font-semibold">{txn.tax_type || "Tax Exclusive"}</span></span>
          </div>

          {/* Line items table */}
          <div className="px-4 py-3">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/20 border-b border-border">
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Item Code</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-20">Qty</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Unit Price</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Account</th>
                  <th className="px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-24">Tax Rate</th>
                  <th className="px-3 py-1.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Amount {txn.currency}</th>
                </tr>
              </thead>
              <tbody>
                {txLineItems.map((li, idx) => (
                  <tr key={idx} className="border-b border-border">
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{li.item_code || "—"}</td>
                    <td className="px-3 py-2.5 text-foreground">{li.description || "—"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{(li.quantity || 1).toFixed(2)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground">{fmt(li.unit_price || 0)}</td>
                    <td className="px-3 py-2.5 text-foreground">{li.account_name || txn.account_name || "—"}</td>
                    <td className="px-3 py-2.5 text-muted-foreground text-xs">{li.tax_rate ? `${li.tax_rate}%` : "Tax Exempt"}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-foreground font-medium">{fmt(li.amount || 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Subtotal + TOTAL footer */}
          <div className="px-4 py-3 border-t-2 border-border bg-muted/20 flex flex-col items-end gap-1">
            <div className="flex items-center gap-8">
              <span className="text-xs text-muted-foreground">Subtotal</span>
              <span className="text-xs tabular-nums text-foreground w-28 text-right">{fmt(subtotal)}</span>
            </div>
            <div className="border-t-2 border-foreground/40 pt-1 mt-1 flex items-center gap-8">
              <span className="text-lg font-bold text-foreground">TOTAL</span>
              <span className="text-lg font-bold tabular-nums text-foreground w-28 text-right">{fmt(txn.amount)} {txn.currency}</span>
            </div>
          </div>

          {/* Cancel button */}
          <div className="px-4 py-3 border-t border-border">
            <Button variant="outline" size="sm" onClick={() => navigate("/accounting/banks")}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Files */}
      <BankTransactionFiles transactionId={txn.id} txNumber={txn.reference || txn.source_number || ""} />

      {/* History & Notes */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 bg-muted/40 border-b border-border flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground">History & Notes</span>
          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="px-4 py-3 space-y-2">
          {isReconciled && (
            <p className="text-xs text-muted-foreground">Reconciled on {fmtDate(txn.date)}</p>
          )}
          <p className="text-xs font-medium text-foreground">
            {isSpend ? "Debit" : "Credit"} payment on {fmtDate(txn.date)} for {isSpend ? "−" : "+"}{fmt(txn.amount)}.
          </p>
          {txn.notes && (
            <p className="text-xs text-muted-foreground">{txn.notes}</p>
          )}
          <div className="flex items-center gap-2 pt-2">
            <Button size="sm" variant="outline" className="text-xs">Show History</Button>
            <Button size="sm" variant="outline" className="text-xs">Add Note</Button>
          </div>
        </div>
      </div>
    </div>
  );
}