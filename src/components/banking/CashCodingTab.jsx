import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { CheckCheck, CheckCircle2 } from "lucide-react";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import { toast } from "sonner";

const num = (n) => (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * CashCodingTab — quickly assign an account code to multiple unreconciled transactions at once.
 * Each row has a checkbox + account picker. "Save & Reconcile" marks selected ones as Reconciled.
 */
export default function CashCodingTab({ transactions, chartAccounts, onRefresh }) {
  // { [txId]: { account_id, account_code, account_name } }
  const [codings, setCodings] = useState({});
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const toggleAll = () => {
    if (selected.size === transactions.length) setSelected(new Set());
    else setSelected(new Set(transactions.map(t => t.id)));
  };

  const toggleRow = (id) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const setCoding = (txId, account) => {
    setCodings(prev => ({
      ...prev,
      [txId]: account ? { account_id: account.id, account_code: account.code, account_name: account.name } : {},
    }));
  };

  const handleSave = async () => {
    const toSave = transactions.filter(t => selected.has(t.id));
    if (toSave.length === 0) { toast.error("Select at least one transaction"); return; }
    setSaving(true);
    try {
      await Promise.all(toSave.map(tx => {
        const coding = codings[tx.id] || {};
        return base44.entities.BankTransaction.update(tx.id, {
          ...(coding.account_id ? { account_id: coding.account_id, account_code: coding.account_code, account_name: coding.account_name } : {}),
          status: "Reconciled",
        });
      }));
      toast.success(`${toSave.length} transaction${toSave.length !== 1 ? "s" : ""} coded & reconciled`);
      setSelected(new Set());
      setCodings({});
      onRefresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-border bg-muted/20 flex items-center gap-4 flex-wrap">
        <p className="text-sm text-muted-foreground">
          {transactions.length} unreconciled transaction{transactions.length !== 1 ? "s" : ""} · assign accounts and reconcile in bulk
        </p>
        <div className="flex-1" />
        {selected.size > 0 && (
          <span className="text-xs text-primary font-medium">{selected.size} selected</span>
        )}
        <Button size="sm" onClick={handleSave} disabled={saving || selected.size === 0} className="gap-1.5">
          <CheckCheck className="w-4 h-4" />
          {saving ? "Saving…" : `Save & Reconcile${selected.size > 0 ? ` (${selected.size})` : ""}`}
        </Button>
      </div>

      {transactions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-10">
          <CheckCircle2 className="w-10 h-10 text-success" />
          <p className="text-base font-semibold text-foreground">All transactions coded!</p>
          <p className="text-sm text-muted-foreground">No unreconciled transactions remaining.</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted/60 border-b border-border">
                <th className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === transactions.length && transactions.length > 0}
                    onChange={toggleAll}
                    className="rounded border-border"
                  />
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell w-36">Reference</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Spent</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide w-28">Received</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide w-52">Account</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => {
                const isSelected = selected.has(tx.id);
                const coding = codings[tx.id];
                return (
                  <tr key={tx.id}
                    className={`border-b border-border transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-muted/20"}`}
                    onClick={() => toggleRow(tx.id)}
                  >
                    <td className="px-4 py-3 w-10" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleRow(tx.id)}
                        className="rounded border-border"
                      />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap w-28">{tx.date}</td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-foreground leading-snug">{tx.description}</p>
                      {tx.contact_name && <p className="text-xs text-muted-foreground">{tx.contact_name}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden md:table-cell w-36">{tx.reference || "—"}</td>
                    <td className="px-4 py-3 text-right w-28 tabular-nums text-xs">
                      {tx.type === "Spend Money" ? <span className="font-medium text-foreground">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right w-28 tabular-nums text-xs">
                      {tx.type === "Receive Money" ? <span className="font-medium text-success">{num(tx.amount)}</span> : <span className="text-muted-foreground/30">—</span>}
                    </td>
                    <td className="px-4 py-3 w-52" onClick={e => e.stopPropagation()}>
                      <AccountCombobox
                        accounts={chartAccounts}
                        value={coding?.account_id || tx.account_id || ""}
                        onChange={(acc) => setCoding(tx.id, acc)}
                        placeholder="— Select account —"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}