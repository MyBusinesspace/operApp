import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import { toast } from "sonner";

const FIELDS = [
  { value: "description", label: "Description" },
  { value: "payee", label: "Payee" },
  { value: "reference", label: "Reference" },
  { value: "amount", label: "Amount" },
];

const OPERATORS = [
  { value: "equals", label: "equals" },
  { value: "contains", label: "contains" },
  { value: "starts_with", label: "starts with" },
  { value: "ends_with", label: "ends with" },
  { value: "is_blank", label: "is blank" },
  { value: "greater_than", label: "greater than" },
  { value: "less_than", label: "less than" },
];

const RULE_TYPES = [
  { value: "spend", label: "Spend Money" },
  { value: "receive", label: "Receive Money" },
  { value: "transfer", label: "Transfer Money" },
];

const EMPTY_CONDITION = { field: "description", operator: "contains", value: "" };

export default function BankRuleFormModal({ open, rule, defaultRuleType = "spend", bankAccounts = [], chartAccounts = [], contacts = [], onSave, onClose }) {
  const [form, setForm] = useState({
    name: "",
    rule_type: defaultRuleType,
    bank_account_id: "",
    match_type: "all",
    conditions: [{ ...EMPTY_CONDITION }],
    target_account_id: "",
    target_account_code: "",
    target_account_name: "",
    contact_id: "",
    contact_name: "",
    reference: "",
    tax_rate: 0,
    status: "Active",
  });

  useEffect(() => {
    if (rule) {
      setForm({
        name: rule.name || "",
        rule_type: rule.rule_type || defaultRuleType,
        bank_account_id: rule.bank_account_id || "",
        match_type: rule.match_type || "all",
        conditions: (rule.conditions && rule.conditions.length > 0) ? rule.conditions : [{ ...EMPTY_CONDITION }],
        target_account_id: rule.target_account_id || "",
        target_account_code: rule.target_account_code || "",
        target_account_name: rule.target_account_name || "",
        contact_id: rule.contact_id || "",
        contact_name: rule.contact_name || "",
        reference: rule.reference || "",
        tax_rate: rule.tax_rate || 0,
        status: rule.status || "Active",
      });
    } else {
      setForm({
        name: "",
        rule_type: defaultRuleType,
        bank_account_id: "",
        match_type: "all",
        conditions: [{ ...EMPTY_CONDITION }],
        target_account_id: "",
        target_account_code: "",
        target_account_name: "",
        contact_id: "",
        contact_name: "",
        reference: "",
        tax_rate: 0,
        status: "Active",
      });
    }
  }, [rule, defaultRuleType, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const setCondition = (i, k, v) => {
    setForm(f => {
      const conds = [...f.conditions];
      conds[i] = { ...conds[i], [k]: v };
      if (k === "operator" && v === "is_blank") conds[i].value = "";
      return { ...f, conditions: conds };
    });
  };

  const addCondition = () => setForm(f => ({ ...f, conditions: [...f.conditions, { ...EMPTY_CONDITION }] }));
  const removeCondition = (i) => setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));

  const setTargetAccount = (acc) => {
    setForm(f => ({
      ...f,
      target_account_id: acc?.id || "",
      target_account_code: acc?.code || "",
      target_account_name: acc?.name || "",
    }));
  };

  const setContact = (e) => {
    const id = e.target.value;
    const c = contacts.find(c => c.id === id);
    setForm(f => ({ ...f, contact_id: id, contact_name: c?.company || c?.full_name || "" }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (!form.target_account_id) {
      toast.error("Target account is required");
      return;
    }
    const payload = { ...form };
    // Clean empty conditions
    payload.conditions = (form.conditions || []).filter(c =>
      c.operator === "is_blank" || (c.value && c.value.trim() !== "")
    );
    onSave(payload);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit bank rule" : "Create bank rule"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Name */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Rule name <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Loan to Redline Steel" className="mt-1" autoFocus />
          </div>

          {/* Rule type + Bank account */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Rule type</Label>
              <Select value={form.rule_type} onValueChange={v => set("rule_type", v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RULE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">Bank account (optional)</Label>
              <Select value={form.bank_account_id || "__all__"} onValueChange={v => set("bank_account_id", v === "__all__" ? "" : v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All bank accounts</SelectItem>
                  {bankAccounts.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Conditions */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conditions</Label>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Match</span>
                <Select value={form.match_type} onValueChange={v => set("match_type", v)}>
                  <SelectTrigger className="h-7 w-20 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="any">Any</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-muted-foreground">of the following</span>
              </div>
            </div>
            {form.conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={c.field} onValueChange={v => setCondition(i, "field", v)}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FIELDS.map(f => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={c.operator} onValueChange={v => setCondition(i, "operator", v)}>
                  <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OPERATORS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {c.operator !== "is_blank" && (
                  <Input
                    value={c.value}
                    onChange={e => setCondition(i, "value", e.target.value)}
                    placeholder="Value…"
                    className="h-8 flex-1 text-xs"
                  />
                )}
                {form.conditions.length > 1 && (
                  <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeCondition(i)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addCondition}>
              <Plus className="w-3 h-3" /> Add condition
            </Button>
          </div>

          {/* Target allocation */}
          <div className="rounded-lg border border-border p-4 space-y-3">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Allocation</Label>
            <div>
              <Label className="text-xs font-medium text-muted-foreground">To account <span className="text-destructive">*</span></Label>
              <div className="mt-1">
                <AccountCombobox accounts={chartAccounts} value={form.target_account_id} onChange={setTargetAccount} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Contact (optional)</Label>
                <select value={form.contact_id} onChange={setContact} className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="">— None —</option>
                  {contacts.map(c => <option key={c.id} value={c.id}>{c.company || c.full_name}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Reference</Label>
                <Input value={form.reference} onChange={e => set("reference", e.target.value)} className="mt-1" placeholder="Auto ref" />
              </div>
              <div>
                <Label className="text-xs font-medium text-muted-foreground">Tax rate %</Label>
                <Input type="number" min="0" max="100" step="0.01" value={form.tax_rate} onChange={e => set("tax_rate", parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
            </div>
          </div>

          {/* Status */}
          <div>
            <Label className="text-xs font-medium text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={v => set("status", v)}>
              <SelectTrigger className="mt-1 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!form.name.trim() || !form.target_account_id}>{rule ? "Save changes" : "Create rule"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}