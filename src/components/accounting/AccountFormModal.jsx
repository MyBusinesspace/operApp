import { useState, useEffect } from "react";
import { Lock } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const ACCOUNT_TYPES = ["Asset", "Liability", "Equity", "Revenue", "Expense", "Other Income", "Other Expense", "Cost of Sales"];

const SUBTYPES = {
  "Asset": ["Current Asset", "Fixed Asset", "Non-current Asset", "Prepayment", "Cash and Bank"],
  "Liability": ["Current Liability", "Non-current Liability", "Loan"],
  "Equity": ["Equity", "Retained Earnings", "Owner's Equity"],
  "Revenue": ["Revenue", "Sales", "Service Income"],
  "Expense": ["Operating Expense", "Administration", "Depreciation", "Wages", "Rent"],
  "Other Income": ["Other Income", "Interest Income", "Gain on Disposal"],
  "Other Expense": ["Other Expense", "Interest Expense", "Loss on Disposal"],
  "Cost of Sales": ["Cost of Goods Sold", "Direct Labor", "Direct Materials"],
};

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR"];

const DEFAULT_FORM = {
  code: "", name: "", type: "Asset", subtype: "", parent_id: "", description: "",
  currency: "AED", status: "Active", show_on_dashboard: false, enable_payments: false,
  tax_rate_id: "", tax_rate_name: "", tax_rate_value: 0,
  opening_balance: "", opening_balance_date: "", lock_date: "",
};

export default function AccountFormModal({ open, account, accounts = [], taxRates = [], onSave, onClose }) {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const isEdit = !!account?.id;
  const isSystem = !!account?.is_system;

  useEffect(() => {
    if (account) {
      setForm({
        ...DEFAULT_FORM,
        ...account,
        opening_balance: account.opening_balance ?? "",
      });
    } else {
      setForm(DEFAULT_FORM);
    }
  }, [account, open]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleTaxChange = (id) => {
    if (!id || id === "none") { set("tax_rate_id", ""); set("tax_rate_name", ""); set("tax_rate_value", 0); return; }
    const tax = taxRates.find(t => t.id === id);
    if (tax) { setForm(prev => ({ ...prev, tax_rate_id: id, tax_rate_name: tax.name, tax_rate_value: tax.rate ?? tax.percentage ?? 0 })); }
  };

  const handleParentChange = (id) => {
    if (!id || id === "none") { set("parent_id", ""); set("parent_code", ""); set("parent_name", ""); return; }
    const parent = accounts.find(a => a.id === id);
    if (parent) { setForm(prev => ({ ...prev, parent_id: id, parent_code: parent.code, parent_name: parent.name, type: parent.type })); }
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error("Account code is required"); return; }
    if (!form.name.trim()) { toast.error("Account name is required"); return; }
    setSaving(true);
    const payload = { ...form, opening_balance: form.opening_balance === "" ? 0 : Number(form.opening_balance) };
    if (isEdit) {
      await base44.entities.ChartOfAccount.update(account.id, payload);
      toast.success("Account updated");
    } else {
      await base44.entities.ChartOfAccount.create(payload);
      toast.success("Account created");
    }
    setSaving(false);
    onSave();
  };

  const parentOptions = accounts.filter(a => a.id !== account?.id && !a.parent_id);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEdit ? "Edit Account" : "New Account"}
            {isSystem && <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full"><Lock className="w-3 h-3" /> System Account</span>}
          </DialogTitle>
        </DialogHeader>
        {isSystem && (
          <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-lg px-3 py-2">
            This is a system account. The code and type are locked to protect accounting integrity. You can still edit the name, description, and settings.
          </div>
        )}

        <div className="space-y-5 pt-2">
          {/* Code + Name */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">Account Code <span className="text-destructive">*</span>{isSystem && <Lock className="w-3 h-3 text-muted-foreground" />}</Label>
              <Input placeholder="e.g. 1100" value={form.code} onChange={e => set("code", e.target.value)} disabled={isSystem} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Account Name <span className="text-destructive">*</span></Label>
              <Input placeholder="e.g. Trade Debtors" value={form.name} onChange={e => set("name", e.target.value)} />
            </div>
          </div>

          {/* Type + Subtype */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1">Account Type {isSystem && <Lock className="w-3 h-3 text-muted-foreground" />}</Label>
              <Select value={form.type} onValueChange={v => set("type", v)} disabled={isSystem}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Subtype</Label>
              <Select value={form.subtype || "none"} onValueChange={v => set("subtype", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Select subtype" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {(SUBTYPES[form.type] || []).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Parent Account */}
          <div className="space-y-1.5">
            <Label>Parent Account <span className="text-xs text-muted-foreground">(optional — for sub-accounts)</span></Label>
            <Select value={form.parent_id || "none"} onValueChange={handleParentChange}>
              <SelectTrigger><SelectValue placeholder="No parent (top-level)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— No parent (top-level) —</SelectItem>
                {parentOptions.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tax Rate + Currency */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Default Tax Rate</Label>
              <Select value={form.tax_rate_id || "none"} onValueChange={handleTaxChange}>
                <SelectTrigger><SelectValue placeholder="No tax" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No tax —</SelectItem>
                  {taxRates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name} ({t.rate ?? t.percentage ?? 0}%)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Opening Balance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Opening Balance</Label>
              <Input type="number" placeholder="0.00" value={form.opening_balance} onChange={e => set("opening_balance", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Opening Balance Date</Label>
              <Input type="date" value={form.opening_balance_date} onChange={e => set("opening_balance_date", e.target.value)} />
            </div>
          </div>

          {/* Lock Date */}
          <div className="space-y-1.5">
            <Label>Lock Date <span className="text-xs text-muted-foreground">(entries before this date cannot be edited)</span></Label>
            <Input type="date" value={form.lock_date} onChange={e => set("lock_date", e.target.value)} />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input placeholder="Optional usage notes" value={form.description} onChange={e => set("description", e.target.value)} />
          </div>

          {/* Toggles */}
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Show on Dashboard</p>
                <p className="text-xs text-muted-foreground">Display balance in accounting overview</p>
              </div>
              <Switch checked={!!form.show_on_dashboard} onCheckedChange={v => set("show_on_dashboard", v)} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">Enable Payments</p>
                <p className="text-xs text-muted-foreground">Use for bank / payment transactions</p>
              </div>
              <Switch checked={!!form.enable_payments} onCheckedChange={v => set("enable_payments", v)} />
            </div>
          </div>

          {/* Status */}
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : isEdit ? "Update Account" : "Create Account"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}