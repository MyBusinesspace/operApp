import { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ChevronLeft, CheckCircle2, Circle } from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function BankReconciliationReport() {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [banks, txs] = await Promise.all([
        base44.entities.BankAccount.filter({ status: "Active" }),
        base44.entities.BankTransaction.list("-date", 500),
      ]);
      setBankAccounts(banks);
      setTransactions(txs);
      setLoading(false);
    };
    load();
  }, []);

  const summary = useMemo(() => {
    const filtered = selectedAccountId === "all" ? transactions : transactions.filter(t => t.bank_account_id === selectedAccountId);
    const byAccount = {};
    filtered.forEach(tx => {
      const key = tx.bank_account_id;
      if (!byAccount[key]) byAccount[key] = { name: tx.bank_account_name || "Unknown", reconciled: 0, unreconciled: 0, reconciledAmt: 0, unreconciledAmt: 0 };
      if (tx.status === "Reconciled") {
        byAccount[key].reconciled++;
        byAccount[key].reconciledAmt += tx.amount || 0;
      } else {
        byAccount[key].unreconciled++;
        byAccount[key].unreconciledAmt += tx.amount || 0;
      }
    });
    return Object.values(byAccount);
  }, [transactions, selectedAccountId]);

  const filteredTxs = useMemo(() => (
    selectedAccountId === "all" ? transactions : transactions.filter(t => t.bank_account_id === selectedAccountId)
  ), [transactions, selectedAccountId]);

  const unreconciledTxs = filteredTxs.filter(t => t.status === "Unreconciled");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/reports"><Button variant="ghost" size="sm"><ChevronLeft className="w-4 h-4 mr-1" /> Reports</Button></Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-foreground">Bank Reconciliation Report</h1>
          <p className="text-xs text-muted-foreground">Reconciled vs unreconciled by bank account</p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <label className="text-xs font-medium text-muted-foreground">Account</label>
        <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)}
          className="h-8 text-sm border border-input rounded-md px-2 bg-background">
          <option value="all">All Accounts</option>
          {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {summary.map((s, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-3">
                <p className="text-sm font-semibold text-foreground">{s.name}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-success/10 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success" />
                      <span className="text-xs font-medium text-success">Reconciled</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{s.reconciled}</p>
                    <p className="text-xs text-muted-foreground font-mono">{num(s.reconciledAmt)}</p>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Circle className="w-3.5 h-3.5 text-orange-500" />
                      <span className="text-xs font-medium text-orange-600">Unreconciled</span>
                    </div>
                    <p className="text-lg font-bold text-foreground">{s.unreconciled}</p>
                    <p className="text-xs text-muted-foreground font-mono">{num(s.unreconciledAmt)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Unreconciled list */}
          {unreconciledTxs.length > 0 && (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 bg-orange-50 border-b border-border">
                <p className="text-sm font-semibold text-orange-700">{unreconciledTxs.length} Unreconciled Transactions</p>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b border-border">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-36">Account</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {unreconciledTxs.map(tx => (
                    <tr key={tx.id} className="border-b border-border hover:bg-muted/20">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{tx.date}</td>
                      <td className="px-4 py-2.5 text-sm text-foreground">{tx.description}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{tx.bank_account_name}</td>
                      <td className={`px-4 py-2.5 text-right text-sm font-mono tabular-nums font-medium ${tx.type === "Receive Money" ? "text-success" : "text-foreground"}`}>
                        {tx.type === "Receive Money" ? "+" : "−"}{num(tx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {unreconciledTxs.length === 0 && summary.length > 0 && (
            <div className="rounded-xl border border-success/30 bg-success/5 px-6 py-8 text-center">
              <CheckCircle2 className="w-8 h-8 text-success mx-auto mb-2" />
              <p className="text-sm font-semibold text-success">All transactions reconciled!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}