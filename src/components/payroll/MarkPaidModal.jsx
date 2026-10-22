import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
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
  const [liabilityAccounts, setLiabilityAccounts] = useState([]);
  const [bankAccountId, setBankAccountId] = useState("");
  const [expenseAccountId, setExpenseAccountId] = useState("");
  const [taxLiabilityAccountId, setTaxLiabilityAccountId] = useState("");
  const [siLiabilityAccountId, setSiLiabilityAccountId] = useState("");
  const [loanLiabilityAccountId, setLoanLiabilityAccountId] = useState("");
  const [otherDeductionsAccountId, setOtherDeductionsAccountId] = useState("");
  const [deductionTotals, setDeductionTotals] = useState({ tax: 0, socialInsurance: 0, loan: 0, other: 0 });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const [banks, coa, liabilities, entries] = await Promise.all([
        base44.entities.BankAccount.filter({ status: "Active" }, { limit: 5000 }),
        base44.entities.ChartOfAccount.filter({ type: "Expense", status: "Active" }, { limit: 5000 }),
        base44.entities.ChartOfAccount.filter({ type: "Liability", status: "Active" }, { limit: 5000 }),
        period?.id ? base44.entities.PayrollEntry.filter({ pay_period_id: period.id }, { limit: 5000 }) : Promise.resolve({ items: [] }),
      ]);
      setBankAccounts(Array.isArray(banks) ? banks : (banks?.items || []));
      setExpenseAccounts(Array.isArray(coa) ? coa : (coa?.items || []));
      setLiabilityAccounts(Array.isArray(liabilities) ? liabilities : (liabilities?.items || []));

      const entryArr = Array.isArray(entries) ? entries : (entries?.items || []);
      setDeductionTotals({
        tax: entryArr.reduce((s, e) => s + (e.tax_amount || 0), 0),
        socialInsurance: entryArr.reduce((s, e) => s + (e.social_insurance_deduction || 0), 0),
        loan: entryArr.reduce((s, e) => s + (e.loan_deduction || 0), 0),
        other: entryArr.reduce((s, e) => s + (e.absence_deduction || 0) + (e.late_deduction || 0) + (e.other_deductions || 0), 0),
      });

      // Try to pick the first available as defaults
      if (banks.length > 0) setBankAccountId(banks[0].id);
      if (coa.length > 0) setExpenseAccountId(coa[0].id);
      if (liabilities.length > 0) {
        setTaxLiabilityAccountId(liabilities[0].id);
        setSiLiabilityAccountId(liabilities[0].id);
        setLoanLiabilityAccountId(liabilities[0].id);
        setOtherDeductionsAccountId(liabilities[0].id);
      }
      setLoading(false);
    };
    load();
  }, [open]);

  const handleSubmit = async () => {
    if (!bankAccountId || !expenseAccountId) return;
    if (deductionTotals.tax > 0 && !taxLiabilityAccountId) return;
    if (deductionTotals.socialInsurance > 0 && !siLiabilityAccountId) return;
    if (deductionTotals.loan > 0 && !loanLiabilityAccountId) return;
    if (deductionTotals.other > 0 && !otherDeductionsAccountId) return;
    setSaving(true);
    try {
      const res = await base44.functions.invoke("markPayrollPaid", {
        pay_period_id: period.id,
        bank_account_id: bankAccountId,
        salary_expense_account_id: expenseAccountId,
        tax_liability_account_id: deductionTotals.tax > 0 ? taxLiabilityAccountId : undefined,
        social_insurance_liability_account_id: deductionTotals.socialInsurance > 0 ? siLiabilityAccountId : undefined,
        loan_liability_account_id: deductionTotals.loan > 0 ? loanLiabilityAccountId : undefined,
        other_deductions_liability_account_id: deductionTotals.other > 0 ? otherDeductionsAccountId : undefined,
      });
      if (res.data?.success) {
        // Make sure every individual payslip of the period shows as paid.
        try {
          const ents = await base44.entities.PayrollEntry.filter({ pay_period_id: period.id }, "-created_date", 5000);
          for (const en of ents) {
            if (en.status !== "paid") await base44.entities.PayrollEntry.update(en.id, { status: "paid" });
          }
        } catch (e) { console.error(e); }
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
                <Label className="text-xs">Salary Expense Account (Gross)</Label>
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

            {liabilityAccounts.length === 0 && (deductionTotals.tax > 0 || deductionTotals.socialInsurance > 0 || deductionTotals.loan > 0 || deductionTotals.other > 0) ? (
              <p className="text-sm text-destructive">No liability accounts found. Create liability accounts in Chart of Accounts for payroll deductions (tax, social insurance, loans).</p>
            ) : (
              <>
                {deductionTotals.tax > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Tax Liability Account <span className="text-muted-foreground">— AED {fmt(deductionTotals.tax)}</span></Label>
                    <select value={taxLiabilityAccountId} onChange={e => setTaxLiabilityAccountId(e.target.value)}
                      className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background">
                      {liabilityAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </div>
                )}
                {deductionTotals.socialInsurance > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Social Insurance Liability <span className="text-muted-foreground">— AED {fmt(deductionTotals.socialInsurance)}</span></Label>
                    <select value={siLiabilityAccountId} onChange={e => setSiLiabilityAccountId(e.target.value)}
                      className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background">
                      {liabilityAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </div>
                )}
                {deductionTotals.loan > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Loan / Advance Liability <span className="text-muted-foreground">— AED {fmt(deductionTotals.loan)}</span></Label>
                    <select value={loanLiabilityAccountId} onChange={e => setLoanLiabilityAccountId(e.target.value)}
                      className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background">
                      {liabilityAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </div>
                )}
                {deductionTotals.other > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs">Other Deductions Liability <span className="text-muted-foreground">— AED {fmt(deductionTotals.other)}</span></Label>
                    <select value={otherDeductionsAccountId} onChange={e => setOtherDeductionsAccountId(e.target.value)}
                      className="w-full h-9 text-sm border border-input rounded-md px-3 bg-background">
                      {liabilityAccounts.map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
            disabled={saving || loading || !bankAccountId || !expenseAccountId
              || (deductionTotals.tax > 0 && !taxLiabilityAccountId)
              || (deductionTotals.socialInsurance > 0 && !siLiabilityAccountId)
              || (deductionTotals.loan > 0 && !loanLiabilityAccountId)
              || (deductionTotals.other > 0 && !otherDeductionsAccountId)}
            onClick={handleSubmit}
          >
            {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <><DollarSign className="w-4 h-4" /> Confirm Payment</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}