import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowLeft, TrendingDown, Plus, Pencil, Trash2, AlertTriangle, Search, ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// ── Searchable Account Picker ──────────────────────────────────────────────────
const ACC_TYPE_BADGE = {
  "Asset":        "bg-blue-100 text-blue-700",
  "Liability":    "bg-orange-100 text-orange-700",
  "Equity":       "bg-purple-100 text-purple-700",
  "Revenue":      "bg-green-100 text-green-700",
  "Other Income": "bg-teal-100 text-teal-700",
  "Expense":      "bg-red-100 text-red-700",
  "Cost of Sales":"bg-rose-100 text-rose-700",
};

function AccountPicker({ label, value, onChange, options, placeholder = "Select account" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState({});
  const triggerRef = useRef(null);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropdownStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        zIndex: 9999,
      });
    }
    setOpen(o => !o);
    setSearch("");
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return options.filter(a =>
      !q || a.name?.toLowerCase().includes(q) || a.code?.toLowerCase().includes(q)
    );
  }, [options, search]);

  const selected = options.find(a => a.id === value);
  const displayLabel = selected ? `${selected.code ? selected.code + " — " : ""}${selected.name}` : "";

  return (
    <div className="space-y-1" ref={ref}>
      {label && <Label>{label}</Label>}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          onClick={handleOpen}
          className="w-full flex items-center justify-between h-9 px-3 rounded-md border border-input bg-transparent text-sm hover:bg-accent/30 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {selected && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${ACC_TYPE_BADGE[selected.type] || "bg-muted text-muted-foreground"}`}>
                {selected.type}
              </span>
            )}
            <span className={`truncate ${displayLabel ? "text-foreground" : "text-muted-foreground"}`}>
              {displayLabel || placeholder}
            </span>
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 ml-2 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div style={dropdownStyle} className="bg-popover border border-border rounded-lg shadow-2xl overflow-hidden">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  autoFocus
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search accounts…"
                  className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/40 rounded-md focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>
            <div className="max-h-52 overflow-y-auto">
              <button
                type="button"
                onClick={() => { onChange(""); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground hover:bg-accent/60 transition-colors"
              >
                — Not set —
              </button>
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-muted-foreground">No accounts found</div>
              ) : filtered.map(a => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { onChange(a.id); setOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent/60 transition-colors text-left"
                >
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${ACC_TYPE_BADGE[a.type] || "bg-muted text-muted-foreground"}`}>
                    {a.type}
                  </span>
                  <span className="truncate flex-1">{a.code ? `${a.code} — ` : ""}{a.name}</span>
                  {value === a.id && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Asset Type Form Modal ──────────────────────────────────────────────────────
function AssetTypeModal({ open, item, coaAccounts, onClose, onSave }) {
  const EMPTY = {
    name: "", description: "", color: "#6366f1",
    depreciation_method: "straight_line", useful_life_years: "", residual_value_pct: 0,
    asset_account_id: "", asset_account_name: "",
    accumulated_account_id: "", accumulated_account_name: "",
    depreciation_account_id: "", depreciation_account_name: "",
  };
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(item ? { ...EMPTY, ...item } : EMPTY);
  }, [item, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setAccount = (idField, nameField, id) => {
    const acc = coaAccounts.find(a => a.id === id);
    setForm(f => ({ ...f, [idField]: id === "__none__" ? "" : id, [nameField]: acc?.name || "" }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = { ...form, useful_life_years: form.useful_life_years !== "" ? Number(form.useful_life_years) : undefined };
    await onSave(payload);
    setSaving(false);
  };

  const assetAccounts = coaAccounts.filter(a => a.type === "Asset");
  const expenseAccounts = coaAccounts.filter(a => ["Expense", "Cost of Sales"].includes(a.type));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Asset Type" : "New Asset Type"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Asset Type Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} required placeholder="e.g. Vehicles, Plant & Machinery" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Input value={form.description || ""} onChange={e => set("description", e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Accounts</p>

            <AccountPicker
              label="Asset Account"
              value={form.asset_account_id}
              onChange={id => setAccount("asset_account_id", "asset_account_name", id)}
              options={assetAccounts}
              placeholder="Select asset account"
            />

            <AccountPicker
              label="Accumulated Depreciation Account"
              value={form.accumulated_account_id}
              onChange={id => setAccount("accumulated_account_id", "accumulated_account_name", id)}
              options={assetAccounts}
              placeholder="Select accumulated depreciation account"
            />

            <AccountPicker
              label="Depreciation Expense Account"
              value={form.depreciation_account_id}
              onChange={id => setAccount("depreciation_account_id", "depreciation_account_name", id)}
              options={expenseAccounts}
              placeholder="Select depreciation expense account"
            />
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Default Depreciation Settings</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Method</Label>
                <Select value={form.depreciation_method} onValueChange={v => set("depreciation_method", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="straight_line">Straight Line</SelectItem>
                    <SelectItem value="diminishing_value">Diminishing Value</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Useful Life (years)</Label>
                <Input type="number" min="1" value={form.useful_life_years || ""} onChange={e => set("useful_life_years", e.target.value)} placeholder="e.g. 5" />
              </div>
              <div className="space-y-1">
                <Label>Residual Value (%)</Label>
                <Input type="number" min="0" max="100" value={form.residual_value_pct || 0} onChange={e => set("residual_value_pct", Number(e.target.value))} placeholder="0" />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : item ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Accounts Tab ───────────────────────────────────────────────────────────────
const ACCOUNT_TYPE_COLORS = {
  "Asset":       "bg-blue-50 text-blue-700",
  "Liability":   "bg-orange-50 text-orange-700",
  "Equity":      "bg-purple-50 text-purple-700",
  "Revenue":     "bg-green-50 text-green-700",
  "Other Income":"bg-teal-50 text-teal-700",
  "Expense":     "bg-red-50 text-red-700",
  "Cost of Sales":"bg-rose-50 text-rose-700",
};

function AccountsTab({ coaAccounts }) {
  const [settings, setSettings] = useState(null);
  const [settingsId, setSettingsId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.AccountingSettings.list("-created_date", 10).then(list => {
      if (list?.length > 0) { setSettingsId(list[0].id); setSettings(list[0]); }
      else setSettings({});
    });
  }, []);

  const setAcc = (idField, id) => {
    const acc = coaAccounts.find(a => a.id === id);
    setSettings(s => ({ ...s, [idField]: id || "", [idField.replace("_id", "_name")]: acc?.name || "" }));
  };

  const handleSave = async () => {
    setSaving(true);
    if (settingsId) await base44.entities.AccountingSettings.update(settingsId, settings);
    else { const c = await base44.entities.AccountingSettings.create(settings); setSettingsId(c.id); }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  if (!settings) return <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>;

  const assetAccounts = coaAccounts.filter(a => a.type === "Asset");
  const liabilityAccounts = coaAccounts.filter(a => a.type === "Liability");
  const revenueAccounts = coaAccounts.filter(a => ["Revenue", "Other Income"].includes(a.type));

  const rows = [
    { label: "Accounts Receivable", hint: "Current asset tracking money owed by customers", idField: "accounts_receivable_id", options: assetAccounts, expectedType: "Asset" },
    { label: "Accounts Payable", hint: "Liability tracking money owed to suppliers", idField: "accounts_payable_id", options: liabilityAccounts, expectedType: "Liability" },
    { label: "Sales Tax (Output)", hint: "Liability account for VAT collected on sales", idField: "sales_tax_account_id", options: liabilityAccounts, expectedType: "Liability" },
    { label: "Purchase Tax (Input)", hint: "Asset account for VAT paid on purchases", idField: "purchase_tax_account_id", options: assetAccounts, expectedType: "Asset" },
    { label: "Retained Earnings", hint: "Equity account for accumulated profits", idField: "retained_earnings_id", options: [...assetAccounts, ...liabilityAccounts, ...revenueAccounts], expectedType: "Equity" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <div className="px-4 py-3 bg-muted/30 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Default Accounting Accounts</p>
          <p className="text-xs text-muted-foreground mt-0.5">These accounts are used automatically when posting transactions.</p>
        </div>
        <div className="divide-y divide-border">
          {rows.map(row => {
            const selectedAcc = coaAccounts.find(a => a.id === settings[row.idField]);
            const typeColor = ACCOUNT_TYPE_COLORS[selectedAcc?.type] || "bg-muted text-muted-foreground";
            return (
              <div key={row.idField} className="grid grid-cols-2 gap-6 px-4 py-4 items-start">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{row.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACCOUNT_TYPE_COLORS[row.expectedType] || "bg-muted text-muted-foreground"}`}>
                      {row.expectedType}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{row.hint}</p>
                  {selectedAcc && (
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${typeColor}`}>{selectedAcc.type}</span>
                      <span className="text-xs text-muted-foreground">{selectedAcc.code ? `${selectedAcc.code} — ` : ""}{selectedAcc.name}</span>
                    </div>
                  )}
                </div>
                <AccountPicker
                  value={settings[row.idField] || ""}
                  onChange={id => setAcc(row.idField, id)}
                  options={row.options}
                  placeholder="— Not set —"
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function FixedAssetSettings() {
  const [tab, setTab] = useState("types");
  const [groups, setGroups] = useState([]);
  const [assets, setAssets] = useState([]);
  const [coaAccounts, setCoaAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | { item }

  const load = async () => {
    setLoading(true);
    const [grps, accs, assetList] = await Promise.all([
      base44.entities.AssetGroup.list("name", 200),
      base44.entities.ChartOfAccount.filter({ status: "Active" }),
      base44.entities.Asset.list("-created_date", 500),
    ]);
    setGroups(grps || []);
    setCoaAccounts(accs || []);
    setAssets(assetList || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Count assets per group
  const assetCountByGroup = useMemo(() => {
    const map = {};
    assets.forEach(a => { if (a.group_id) map[a.group_id] = (map[a.group_id] || 0) + 1; });
    return map;
  }, [assets]);

  const handleSave = async (form) => {
    if (modal?.item) await base44.entities.AssetGroup.update(modal.item.id, form);
    else await base44.entities.AssetGroup.create(form);
    setModal(null);
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this asset type?")) return;
    await base44.entities.AssetGroup.delete(id);
    load();
  };

  const hasAccountWarning = (g) => !g.asset_account_id || !g.accumulated_account_id || !g.depreciation_account_id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-50 text-violet-600">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Fixed Asset Settings</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Manage asset types and default depreciation methods</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/accounting/fixed-assets">
              <Button variant="outline" size="sm">Fixed Assets</Button>
            </Link>
            {tab === "types" && (
              <Button size="sm" className="gap-1.5" onClick={() => setModal({ item: null })}>
                <Plus className="w-4 h-4" /> New Asset Type
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-0 border-b border-border">
        {[{ key: "types", label: "Asset types" }, { key: "accounts", label: "Accounts" }].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-12">Loading…</div>
      ) : tab === "types" ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Table header */}
          <div className="px-4 py-2.5 bg-muted/40 border-b border-border">
            <p className="text-xs text-muted-foreground">{groups.length} item{groups.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-muted/20 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            <span className="col-span-3">Asset type</span>
            <span className="col-span-3">Asset account</span>
            <span className="col-span-3">Accumulated depreciation account</span>
            <span className="col-span-2">Depreciation expense account</span>
            <span className="col-span-1" />
          </div>

          {groups.length === 0 ? (
            <div className="py-16 text-center">
              <TrendingDown className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No asset types yet.</p>
              <Button size="sm" className="mt-3 gap-1.5" onClick={() => setModal({ item: null })}>
                <Plus className="w-4 h-4" /> Create first asset type
              </Button>
            </div>
          ) : (
            groups.map((g, i) => (
              <div key={g.id}
                className={`grid grid-cols-12 gap-3 px-4 py-3.5 border-b border-border/50 hover:bg-muted/20 transition-colors group items-start ${i % 2 === 0 ? "" : "bg-muted/5"}`}>
                {/* Name */}
                <div className="col-span-3 flex items-start gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setModal({ item: g })}
                        className="text-sm font-semibold text-primary hover:underline text-left"
                      >
                        {g.name}
                      </button>
                      {assetCountByGroup[g.id] > 0 && (
                        <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                          {assetCountByGroup[g.id]}
                        </span>
                      )}
                      {hasAccountWarning(g) && (
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title="Accounts not fully configured" />
                      )}
                    </div>
                    {g.description && <p className="text-xs text-muted-foreground mt-0.5">{g.description}</p>}
                    <p className="text-xs text-muted-foreground/60 mt-0.5">
                      {g.depreciation_method === "straight_line" ? "Straight Line" : "Diminishing Value"}
                      {g.useful_life_years ? ` · ${g.useful_life_years} yrs` : ""}
                    </p>
                  </div>
                </div>

                {/* Asset account */}
                <div className="col-span-3">
                  {g.asset_account_name
                    ? <span className="text-sm text-foreground">{g.asset_account_name}</span>
                    : <span className="text-xs text-muted-foreground/50 italic">Not set</span>}
                </div>

                {/* Accumulated */}
                <div className="col-span-3">
                  {g.accumulated_account_name
                    ? <span className="text-sm text-foreground">{g.accumulated_account_name}</span>
                    : <span className="text-xs text-muted-foreground/50 italic">Not set</span>}
                </div>

                {/* Depreciation expense */}
                <div className="col-span-2">
                  {g.depreciation_account_name
                    ? <span className="text-sm text-foreground">{g.depreciation_account_name}</span>
                    : <span className="text-xs text-muted-foreground/50 italic">Not set</span>}
                </div>

                {/* Actions */}
                <div className="col-span-1 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setModal({ item: g })}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(g.id)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <AccountsTab coaAccounts={coaAccounts} />
      )}

      <AssetTypeModal
        open={!!modal}
        item={modal?.item}
        coaAccounts={coaAccounts}
        onClose={() => setModal(null)}
        onSave={handleSave}
      />
    </div>
  );
}