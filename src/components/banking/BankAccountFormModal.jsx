import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ExternalLink, HelpCircle } from "lucide-react";
import { toast } from "sonner";

const ACCOUNT_TYPES = [
  { value: "Bank", label: "Bank" },
  { value: "Credit Card", label: "Credit Card" },
  { value: "Other", label: "Other" },
];
const CURRENCIES = [
  { value: "AED", label: "AED — United Arab Emirates Dirham" },
  { value: "USD", label: "USD — US Dollar" },
  { value: "EUR", label: "EUR — Euro" },
  { value: "GBP", label: "GBP — British Pound" },
  { value: "SAR", label: "SAR — Saudi Riyal" },
  { value: "QAR", label: "QAR — Qatari Riyal" },
  { value: "KWD", label: "KWD — Kuwaiti Dinar" },
  { value: "BHD", label: "BHD — Bahraini Dinar" },
  { value: "OMR", label: "OMR — Omani Rial" },
];
const COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const DEFAULT = {
  name: "", bank_name: "", account_number: "", account_type: "Bank",
  currency: "AED", chart_account_id: "", opening_balance: "", opening_balance_date: "",
  status: "Active", show_on_dashboard: true, color: "#6366f1",
};

export default function BankAccountFormModal({ open, account, chartAccounts = [], onSave, onClose }) {
  const [form, setForm] = useState(DEFAULT);
  const [saving, setSaving] = useState(false);
  const isEdit = !!account?.id;

  useEffect(() => {
    if (account) {
      // Normalize legacy types to the new simplified dropdown
      let type = account.account_type || "Bank";
      if (!["Bank", "Credit Card", "Other"].includes(type)) type = "Other";
      setForm({ ...DEFAULT, ...account, account_type: type, opening_balance: account.opening_balance ?? "" });
    } else {
      setForm(DEFAULT);
    }
  }, [account, open]);

  const set = (f, v) => setForm(p => ({ ...p, [f]: v }));

  const generateUniqueCode = async (baseCode) => {
    const existing = await base44.entities.ChartOfAccount.filter({ code: baseCode });
    if (!existing || existing.length === 0) return baseCode;
    for (let i = 1; i <= 99; i++) {
      const candidate = `${baseCode}-${i}`;
      const check = await base44.entities.ChartOfAccount.filter({ code: candidate });
      if (!check || check.length === 0) return candidate;
    }
    return `${baseCode}-${Date.now()}`;
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error("Account name is required"); return; }
    if (!form.bank_name.trim()) { toast.error("Bank name is required"); return; }
    setSaving(true);
    try {
      const payload = { ...form, opening_balance: form.opening_balance === "" ? 0 : Number(form.opening_balance) };

      // For new accounts: auto-create a COA entry with the bank's name
      if (!isEdit && !payload.chart_account_id) {
        const isCreditCard = payload.account_type === "Credit Card";
        const coaName = `${payload.bank_name} — ${payload.name}`;
        const baseCode = isCreditCard ? "CC" : "BNK";
        const code = await generateUniqueCode(baseCode);
        const coa = await base44.entities.ChartOfAccount.create({
          code,
          name: coaName,
          type: isCreditCard ? "Liability" : "Asset",
          subtype: isCreditCard ? "Current Liability" : "Current Asset",
          currency: payload.currency || "AED",
          status: "Active",
          show_on_dashboard: payload.show_on_dashboard ?? true,
          enable_payments: true,
          opening_balance: payload.opening_balance || 0,
          opening_balance_date: payload.opening_balance_date || null,
          description: `${payload.bank_name} — ${payload.name} (${payload.account_type})`,
        });
        payload.chart_account_id = coa.id;
        payload.chart_account_code = coa.code;
        payload.chart_account_name = coa.name;
      }

      if (isEdit) {
        await base44.entities.BankAccount.update(account.id, payload);
        toast.success("Bank account updated");
      } else {
        await base44.entities.BankAccount.create(payload);
        toast.success("Bank account added — a matching account was created in your Chart of Accounts");
      }
      onSave();
    } catch (err) {
      toast.error("Failed to save bank account");
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit account details" : "Add account details"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update your bank or credit card account information." : "Add a new bank or credit card account. A matching account is automatically created in your Chart of Accounts."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* Bank Name */}
          <div className="space-y-1.5">
            <Label>Bank name <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. ADCB, HSBC, RAKBank" value={form.bank_name} onChange={e => set("bank_name", e.target.value)} />
          </div>

          {/* Account Name */}
          <div className="space-y-1.5">
            <Label>Account name <span className="text-destructive">*</span></Label>
            <Input placeholder="e.g. Business Account" value={form.name} onChange={e => set("name", e.target.value)} />
            <p className="text-xs text-muted-foreground">A unique name for this account</p>
          </div>

          {/* Account Type */}
          <div className="space-y-1.5">
            <Label>Account type</Label>
            <Select value={form.account_type} onValueChange={v => set("account_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.account_type === "Other" && (
              <p className="text-xs text-muted-foreground">Bank feeds are not available for Other account types</p>
            )}
          </div>

          {/* Account Number */}
          <div className="space-y-1.5">
            <Label>Account number</Label>
            <Input placeholder="e.g. 12-1234-12345-01" value={form.account_number} onChange={e => set("account_number", e.target.value)} />
          </div>

          {/* Currency */}
          <div className="space-y-1.5">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={v => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CURRENCIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Opening Balance */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Opening balance</Label>
              <Input type="number" placeholder="0.00" value={form.opening_balance} onChange={e => set("opening_balance", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>As of date</Label>
              <Input type="date" value={form.opening_balance_date} onChange={e => set("opening_balance_date", e.target.value)} />
            </div>
          </div>

          {/* Color + Dashboard toggle */}
          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Color</span>
              <div className="flex gap-1.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => set("color", c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${form.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
            <div>
              <p className="text-sm font-medium">Show on Dashboard</p>
              <p className="text-xs text-muted-foreground">Display balance in accounting overview</p>
            </div>
            <Switch checked={!!form.show_on_dashboard} onCheckedChange={v => set("show_on_dashboard", v)} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
          <a href="#" className="text-xs text-primary hover:underline inline-flex items-center gap-1" onClick={e => e.preventDefault()}>
            <HelpCircle className="w-3 h-3" /> Learn about adding accounts <ExternalLink className="w-3 h-3" />
          </a>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Adding…" : isEdit ? "Update" : "Add"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}