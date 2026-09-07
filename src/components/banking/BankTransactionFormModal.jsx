import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import { toast } from "sonner";

const DEFAULT = {
  date: new Date().toISOString().split("T")[0],
  description: "", reference: "", type: "Spend Money",
  amount: "", contact_id: "", contact_name: "",
  account_id: "", account_code: "", account_name: "",
  transfer_to_account_id: "", transfer_to_account_name: "",
  notes: "",
};

export default function BankTransactionFormModal({ open, transaction, bankAccountId, bankAccountName, bankAccounts = [], chartAccounts = [], onSave, onClose }) {
  const [form, setForm] = useState(DEFAULT);
  const [saving, setSaving] = useState(false);
  const isEdit = !!transaction?.id;

  useEffect(() => {
    if (transaction) setForm({ ...DEFAULT, ...transaction, amount: transaction.amount ?? "" });
    else setForm({ ...DEFAULT, date: new Date().toISOString().split("T")[0] });
  }, [transaction, open]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const handleAccountSelect = (acc) => {
    if (!acc) { set("account_id", ""); set("account_code", ""); set("account_name", ""); return; }
    setForm(p => ({ ...p, account_id: acc.id, account_code: acc.code, account_name: acc.name }));
  };

  const handleTransferAccountChange = (id) => {
    const acc = bankAccounts.find(a => a.id === id);
    setForm(p => ({ ...p, transfer_to_account_id: id, transfer_to_account_name: acc?.name || "" }));
  };

  const handleSave = async () => {
    if (!form.date) { toast.error("Date is required"); return; }
    if (!form.amount || Number(form.amount) <= 0) { toast.error("Amount must be greater than 0"); return; }
    if (!form.description.trim()) { toast.error("Description is required"); return; }
    setSaving(true);
    const payload = {
      ...form,
      amount: Number(form.amount),
      bank_account_id: bankAccountId,
      bank_account_name: bankAccountName,
      status: transaction?.status || "Unreconciled",
    };
    if (isEdit) {
      await base44.entities.BankTransaction.update(transaction.id, payload);
      toast.success("Transaction updated");
    } else {
      await base44.entities.BankTransaction.create(payload);
      toast.success("Transaction added");
    }
    setSaving(false);
    onSave();
  };

  const isTransfer = form.type === "Transfer";
  const otherBankAccounts = bankAccounts.filter(a => a.id !== bankAccountId);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Transaction" : "New Transaction"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Transaction Type</Label>
            <div className="flex gap-2">
              {["Spend Money", "Receive Money", "Transfer"].map(t => (
                <button key={t} onClick={() => set("type", t)}
                  className={`flex-1 py-2 text-sm rounded-lg border font-medium transition-colors ${form.type === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-muted-foreground hover:border-primary/50"}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Reference */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.date} onChange={e => set("date", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input placeholder="Cheque / ref number" value={form.reference} onChange={e => set("reference", e.target.value)} />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description <span className="text-destructive">*</span></Label>
            <Input placeholder="What is this transaction for?" value={form.description} onChange={e => set("description", e.target.value)} />
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label>Amount <span className="text-destructive">*</span></Label>
            <Input type="number" placeholder="0.00" value={form.amount} onChange={e => set("amount", e.target.value)} className="text-lg font-semibold" />
          </div>

          {/* Account (Chart of Accounts) or Transfer destination */}
          {isTransfer ? (
            <div className="space-y-1.5">
              <Label>Transfer To</Label>
              <Select value={form.transfer_to_account_id || "none"} onValueChange={handleTransferAccountChange}>
                <SelectTrigger><SelectValue placeholder="Select bank account…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Select account —</SelectItem>
                  {otherBankAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Account (Chart of Accounts)</Label>
              <AccountCombobox
                accounts={chartAccounts}
                value={form.account_id ? chartAccounts.find(a => a.id === form.account_id) : null}
                onChange={handleAccountSelect}
                placeholder="Select account…"
              />
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input placeholder="Optional notes" value={form.notes} onChange={e => set("notes", e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Update" : "Add Transaction"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}