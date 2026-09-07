import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AssetDepreciationModal({ open, asset, onClose, onSave }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [coaAccounts, setCoaAccounts] = useState([]);

  useEffect(() => {
    if (open) {
      base44.entities.ChartOfAccount.filter({ status: "Active" }).then(accs => {
        setCoaAccounts(accs || []);
      });
    }
  }, [open]);

  useEffect(() => {
    if (asset) {
      setForm({
        depreciation_method: asset.depreciation_method || "straight_line",
        useful_life_years: asset.useful_life_years || "",
        residual_value: asset.residual_value ?? 0,
        depreciation_rate: asset.depreciation_rate || "",
        depreciation_start_date: asset.depreciation_start_date || asset.purchase_date || "",
        depreciation_account_id: asset.depreciation_account_id || "",
        depreciation_account_name: asset.depreciation_account_name || "",
        accumulated_account_id: asset.accumulated_account_id || "",
        accumulated_account_name: asset.accumulated_account_name || "",
      });
    }
  }, [asset, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleAcctChange = (field, nameField, id) => {
    const acc = coaAccounts.find(a => a.id === id);
    setForm(f => ({ ...f, [field]: id, [nameField]: acc?.name || "" }));
  };

  // Calculate preview: annual depreciation
  const cost = asset?.purchase_price || 0;
  const residual = Number(form.residual_value) || 0;
  const life = Number(form.useful_life_years) || 0;
  const rate = Number(form.depreciation_rate) || 0;

  let annualDepr = 0;
  if (form.depreciation_method === "straight_line" && life > 0) {
    annualDepr = (cost - residual) / life;
  } else if (form.depreciation_method === "diminishing_value" && rate > 0) {
    annualDepr = (cost - residual) * (rate / 100);
  }

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      ...form,
      useful_life_years: form.useful_life_years !== "" ? Number(form.useful_life_years) : undefined,
      residual_value: Number(form.residual_value) || 0,
      depreciation_rate: form.depreciation_rate !== "" ? Number(form.depreciation_rate) : undefined,
    };
    await base44.entities.Asset.update(asset.id, payload);
    onSave();
    setSaving(false);
  };

  const expenseAccounts = coaAccounts.filter(a => ["Expense", "Cost of Sales"].includes(a.type));
  const assetAccounts = coaAccounts.filter(a => a.type === "Asset");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Depreciation Settings — {asset?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          {/* Method */}
          <div className="space-y-1">
            <Label>Depreciation Method</Label>
            <Select value={form.depreciation_method} onValueChange={v => set("depreciation_method", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="straight_line">Straight Line</SelectItem>
                <SelectItem value="diminishing_value">Diminishing Value</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Useful life */}
            <div className="space-y-1">
              <Label>Useful Life (years)</Label>
              <Input type="number" min="1" value={form.useful_life_years}
                onChange={e => set("useful_life_years", e.target.value)} placeholder="e.g. 5" />
            </div>
            {/* Residual value */}
            <div className="space-y-1">
              <Label>Residual Value</Label>
              <Input type="number" min="0" value={form.residual_value}
                onChange={e => set("residual_value", e.target.value)} placeholder="0" />
            </div>
            {/* Rate (for DV) */}
            {form.depreciation_method === "diminishing_value" && (
              <div className="space-y-1">
                <Label>Annual Rate (%)</Label>
                <Input type="number" min="0" max="100" value={form.depreciation_rate}
                  onChange={e => set("depreciation_rate", e.target.value)} placeholder="e.g. 20" />
              </div>
            )}
            {/* Start date */}
            <div className="space-y-1">
              <Label>Depreciation Start Date</Label>
              <Input type="date" value={form.depreciation_start_date}
                onChange={e => set("depreciation_start_date", e.target.value)} />
            </div>
          </div>

          {/* COA accounts */}
          <div className="space-y-1">
            <Label>Depreciation Expense Account</Label>
            <Select value={form.depreciation_account_id || "__none__"}
              onValueChange={v => handleAcctChange("depreciation_account_id", "depreciation_account_name", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select expense account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Not set —</SelectItem>
                {expenseAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ""}{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Accumulated Depreciation Account</Label>
            <Select value={form.accumulated_account_id || "__none__"}
              onValueChange={v => handleAcctChange("accumulated_account_id", "accumulated_account_name", v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Select asset account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Not set —</SelectItem>
                {assetAccounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ""}{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Preview */}
          {annualDepr > 0 && (
            <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
              <p className="text-xs font-semibold text-primary mb-1">Depreciation Preview</p>
              <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                <div>
                  <p className="font-medium text-foreground">{new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2 }).format(annualDepr)}</p>
                  <p>Annual</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">{new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2 }).format(annualDepr / 12)}</p>
                  <p>Monthly</p>
                </div>
                <div>
                  <p className="font-medium text-foreground">{life > 0 ? `${life} yrs` : "—"}</p>
                  <p>Total life</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}