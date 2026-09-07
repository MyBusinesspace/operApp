import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, DollarSign } from "lucide-react";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function MarkPaidModal({ open, onClose, period, onPaid }) {
  const [bankAccounts, setBankAccounts] = useState([]);
  const [expenseAccounts, setExpenseAccounts] = useState([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const [banks, coa] = await Promise.all([
        base44.entities.BankAccount.filter({ status: "Active" }),
        base44.entities.ChartOfAccount.filter({ type: "Expense", status: "Active" }),
      ]);
      setBankAccounts(Array.isArray(banks) ? banks : []);
      setExpenseAccounts(Array.isArray(coa) ? coa : []);

      // Try to pick the first available as defaults
      if (banks.length > 0) setBankAccountId(banks[0].id);
      if (coa.length > 0) setExpenseAccountId(coa[0].id);
      setLoading(false);
    };
    load();
  }, [open]);

  const handleSubmit = async () => {
    if (!bankAccountId || !expenseAccountId) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke("markPayrollPaid", {
        pay_period_id: period.id,
        bank_account_id: bankAccountId,
        salary_expense_account_id: expenseAccountId,
      });
      if (res.data?.success) {
        onPaid?.();
        onClose();
      } else {
        alert(res.data?.error || "Failed to mark payroll as paid.");
      }
    } catch (e) {
      alert("Error: " + e.message);
    }
    setSaving(false);
  };

  const selectedBank = bankAccounts.find(b => b.id === bankAccountId);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Mark Payroll as Paid
          </DialogTitle>
          <DialogDescription>
            This will create a journal entry and bank transaction for <strong>{period?.name}</strong>.
            <br />
            Total net pay: <strong className="text-emerald-600">AED {fmt(period?.total_net)}</strong>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading accounts…</div>
        ) : (
          <div className="space-y-4 py-2">
            {bankAccounts.length === 0 ? (
              <p className="text-sm text-destructive">No active bank accounts found. Set one up in Accounting → Banks.</p>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">Pay From (Bank Account)</Label>
                <select
                  value={bankAccountId}
                  onChange={e => setBankAccountId(e.target.value)}
                  className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background"
                >
                  {bankAccounts.map(b => (
                    <option key={b.id} value={b.id}>{b.name} ({b.bank_name || b.account_number}) — {b.currency}</option>
                  ))}
                </select>
                {selectedBank && (
                  <p className="text-xs text-muted-foreground">
                    Balance will be reduced by AED {fmt(period?.total_net)} in {selectedBank.name}
                  </p>
                )}
              </div>
            )}

            {expenseAccounts.length === 0 ? (
              <p className="text-sm text-destructive">No expense accounts found. Create a "Salary Expense" account in Chart of Accounts first.</p>
            ) : (
              <div className="space-y-2">
                <Label className="text-xs">Salary Expense Account</Label>
                <select
                  value={expenseAccountId}
                  onChange={e => setExpenseAccountId(e.target.value)}
                  className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background"
                >
                  {expenseAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={saving || loading || !bankAccountId || !expenseAccountId}
            onClick={handleSubmit}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><DollarSign className="w-4 h-4" /> Confirm Payment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}