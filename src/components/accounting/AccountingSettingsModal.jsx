import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR"];

export default function AccountingSettingsModal({ open, accounts = [], onClose }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const list = await base44.entities.AccountingSettings.list("-created_date", 10).catch(() => []);
    if (list.length > 0) {
      setSettings(list[0]);
    } else {
      setSettings({
        financial_year_start_month: 1,
        default_currency: "AED",
        lock_date: "",
        tax_basis: "Accrual",
        auto_post_invoices: true,
        auto_post_bills: true,
        accounts_receivable_id: "",
        accounts_payable_id: "",
        sales_tax_account_id: "",
        purchase_tax_account_id: "",
        retained_earnings_id: "",
      });
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const set = (field, value) => setSettings(prev => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    if (settings.id) {
      await base44.entities.AccountingSettings.update(settings.id, settings);
    } else {
      await base44.entities.AccountingSettings.create(settings);
    }
    toast.success("Accounting settings saved");
    setSaving(false);
    onClose();
  };

  if (!settings) return null;

  const paymentAccounts = accounts.filter(a => a.enable_payments || a.type === "Asset");
  const liabilityAccounts = accounts.filter(a => a.type === "Liability");
  const equityAccounts = accounts.filter(a => a.type === "Equity");
  const allAccounts = accounts;

  const AccountSelect = ({ label, field, options }) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={settings[field] || "none"} onValueChange={v => set(field, v === "none" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">— Not set —</SelectItem>
          {options.map(a => <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Accounting Settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* General */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">General</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Financial Year Start</Label>
                <Select value={String(settings.financial_year_start_month)} onValueChange={v => set("financial_year_start_month", Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Default Currency</Label>
                <Select value={settings.default_currency} onValueChange={v => set("default_currency", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tax Basis</Label>
                <Select value={settings.tax_basis} onValueChange={v => set("tax_basis", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Accrual">Accrual</SelectItem>
                    <SelectItem value="Cash">Cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Global Lock Date</Label>
                <Input type="date" value={settings.lock_date || ""} onChange={e => set("lock_date", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Auto-posting */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Auto-Posting</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Auto-post Invoices</p>
                  <p className="text-xs text-muted-foreground">Create journal entries when invoices are approved/sent</p>
                </div>
                <Switch checked={!!settings.auto_post_invoices} onCheckedChange={v => set("auto_post_invoices", v)} />
              </div>
              <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Auto-post Bills</p>
                  <p className="text-xs text-muted-foreground">Create journal entries when bills are approved for payment</p>
                </div>
                <Switch checked={!!settings.auto_post_bills} onCheckedChange={v => set("auto_post_bills", v)} />
              </div>
            </div>
          </div>

          {/* Default Accounts */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Default Accounts</h3>
            <div className="space-y-3">
              <AccountSelect label="Accounts Receivable" field="accounts_receivable_id" options={paymentAccounts} />
              <AccountSelect label="Accounts Payable" field="accounts_payable_id" options={liabilityAccounts} />
              <AccountSelect label="Sales Tax Liability" field="sales_tax_account_id" options={liabilityAccounts} />
              <AccountSelect label="Purchase Tax Asset" field="purchase_tax_account_id" options={paymentAccounts} />
              <AccountSelect label="Retained Earnings" field="retained_earnings_id" options={equityAccounts} />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}