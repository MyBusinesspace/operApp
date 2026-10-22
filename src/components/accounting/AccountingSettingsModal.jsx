import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { invalidatePeriodLockCache } from "@/lib/periodLock";
import { getSingleton, saveSingleton } from "@/lib/singletonSettings";
import { Lock, Unlock, AlertTriangle, Database, Loader2 } from "lucide-react";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

const CURRENCIES = ["AED", "USD", "EUR", "GBP", "SAR", "QAR", "KWD", "BHD", "OMR"];

// Shown when no settings record exists yet — and, with loadError set, when the
// read failed so the Save button stays disabled.
const BLANK_SETTINGS = {
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
};

export default function AccountingSettingsModal({ open, accounts = [], onClose }) {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildResult, setRebuildResult] = useState(null);

  const load = async () => {
    try {
      const record = await getSingleton(base44.entities.AccountingSettings, "AccountingSettings");
      setSettings(record || { ...BLANK_SETTINGS });
      setLoadError(false);
    } catch (e) {
      console.error("Could not read AccountingSettings:", e);
      setSettings({ ...BLANK_SETTINGS });
      setLoadError(true);
      toast.error("Could not load settings, nothing was saved");
    }
  };

  useEffect(() => { if (open) load(); }, [open]);

  const set = (field, value) => setSettings(prev => ({ ...prev, [field]: value }));

  const handleRebuild = async () => {
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const res = await base44.functions.invoke("rebuildAccountBalances", {});
      setRebuildResult(res.data || res);
    } catch (e) {
      setRebuildResult({ error: e.message || "Rebuild failed" });
    } finally {
      setRebuilding(false);
    }
  };

  const handleSave = async () => {
    if (loadError) { toast.error("Could not load settings, nothing was saved"); return; }
    setSaving(true);
    try {
      // Re-reads first: updates the canonical record, creates only when the
      // read succeeded with no record at all.
      await saveSingleton(base44.entities.AccountingSettings, settings, "AccountingSettings");
    } catch (e) {
      console.error("Could not save AccountingSettings:", e);
      toast.error("Could not load settings, nothing was saved");
      setSaving(false);
      return;
    }
    invalidatePeriodLockCache();
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

          {/* Period Locking */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-border pb-2">
              <Lock className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Period Locking</h3>
              {settings.lock_date ? (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  <Lock className="w-3 h-3" />
                  Locked until {settings.lock_date}
                </span>
              ) : (
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  <Unlock className="w-3 h-3" />
                  No lock active
                </span>
              )}
            </div>
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Prevents creating or editing invoices, bills, credit notes, and journal entries dated on or before the lock date. Use this to close off a past period and protect historical ledger data from changes.
              </p>
              <div className="grid grid-cols-2 gap-3 items-end">
                <div className="space-y-1.5">
                  <Label>Lock Date</Label>
                  <Input
                    type="date"
                    value={settings.lock_date || ""}
                    onChange={e => set("lock_date", e.target.value)}
                  />
                </div>
                {settings.lock_date && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={() => set("lock_date", "")}
                  >
                    Remove Lock
                  </Button>
                )}
              </div>
              {settings.lock_date && (
                <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50/50 border border-amber-200/50 rounded-md px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>All transactions dated on or before <strong>{settings.lock_date}</strong> are now locked and cannot be created or edited.</span>
                </div>
              )}
            </div>
          </div>

          {/* Stored Balances */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-foreground border-b border-border pb-2">Stored Balances</h3>
            <div className="p-4 bg-muted/30 rounded-lg space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Pre-computes monthly account balances from posted journals to speed up the Balance Sheet, Trial Balance and other cumulative reports. Rebuilds automatically after Quick Import, GL Import and the Reconciliation step.
              </p>
              <Button type="button" variant="outline" size="sm" className="h-9" disabled={rebuilding} onClick={handleRebuild}>
                {rebuilding ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Database className="w-3.5 h-3.5 mr-1.5" />}
                {rebuilding ? "Rebuilding…" : "Rebuild stored balances"}
              </Button>
              {rebuildResult && (
                <p className={`text-xs ${rebuildResult.error ? "text-destructive" : "text-emerald-600"}`}>
                  {rebuildResult.error ? rebuildResult.error : `Rebuilt ${rebuildResult.records || 0} month-balance rows from ${rebuildResult.journal_count || 0} posted journals.`}
                </p>
              )}
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
          <Button onClick={handleSave} disabled={saving || loadError}>{saving ? "Saving…" : "Save Settings"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}