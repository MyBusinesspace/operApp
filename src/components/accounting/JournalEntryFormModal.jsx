import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import AccountCombobox from "@/components/accounting/AccountCombobox";
import { useChartOfAccounts } from "@/hooks/useChartOfAccounts";

const EMPTY_LINE = { account_id: "", account_code: "", account_name: "", description: "", debit: "", credit: "" };

const STATUS_STYLES = {
  Draft:  "bg-slate-100 text-slate-600",
  Posted: "bg-emerald-100 text-emerald-700",
  Voided: "bg-red-100 text-red-600",
};

async function generateJnlNumber() {
  const all = await base44.entities.JournalEntry.list("-created_date", 200).catch(() => []);
  const nums = all.map(j => j.number).filter(n => n && n.startsWith("JNL-"));
  if (!nums.length) return "JNL-0001";
  const max = Math.max(...nums.map(n => parseInt(n.replace("JNL-", "")) || 0));
  return `JNL-${String(max + 1).padStart(4, "0")}`;
}

export default function JournalEntryFormModal({ open, entry, onClose, onSave }) {
  const accounts = useChartOfAccounts();
  const [form, setForm] = useState({ number: "", date: "", narration: "", reference: "", currency: "AED", lines: [{ ...EMPTY_LINE }, { ...EMPTY_LINE }] });
  const [saving, setSaving] = useState(false);
  const isEdit = !!entry?.id;
  const isReadOnly = entry?.status === "Posted" || entry?.status === "Voided";

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setForm({
        number: entry.number || "",
        date: entry.date || "",
        narration: entry.narration || "",
        reference: entry.reference || "",
        currency: entry.currency || "AED",
        lines: (entry.lines || []).length ? entry.lines.map(l => ({ ...l, debit: l.debit || "", credit: l.credit || "" })) : [{ ...EMPTY_LINE }, { ...EMPTY_LINE }],
      });
    } else {
      const today = new Date().toISOString().slice(0, 10);
      setForm({ number: "", date: today, narration: "", reference: "", currency: "AED", lines: [{ ...EMPTY_LINE }, { ...EMPTY_LINE }] });
      generateJnlNumber().then(n => setForm(f => ({ ...f, number: n })));
    }
  }, [open, entry]);

  const totalDebit = form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
  const totalCredit = form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const updateLine = (i, key, value) => {
    setForm(f => ({ ...f, lines: f.lines.map((l, idx) => idx === i ? { ...l, [key]: value } : l) }));
  };

  const setLineAccount = (i, acc) => {
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, idx) => idx === i ? { ...l, account_id: acc?.id || "", account_code: acc?.code || "", account_name: acc?.name || "" } : l),
    }));
  };

  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { ...EMPTY_LINE }] }));
  const removeLine = (i) => {
    if (form.lines.length <= 2) { toast.error("At least 2 lines required"); return; }
    setForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }));
  };

  const handleSave = async (postAfter = false) => {
    if (!form.date) { toast.error("Date is required"); return; }
    if (!form.narration.trim()) { toast.error("Narration is required"); return; }
    if (!isBalanced && postAfter) { toast.error("Entry must be balanced to post (Debit = Credit)"); return; }

    const lines = form.lines
      .filter(l => l.account_id && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
      .map(l => ({ ...l, debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0 }));

    if (lines.length < 2) { toast.error("At least 2 lines with accounts and amounts are required"); return; }

    const totalD = lines.reduce((s, l) => s + l.debit, 0);
    const totalC = lines.reduce((s, l) => s + l.credit, 0);

    if (postAfter && Math.abs(totalD - totalC) > 0.01) { toast.error("Debits must equal Credits to post"); return; }

    setSaving(true);
    const payload = {
      ...form,
      source_type: form.source_type || "Manual",
      lines,
      total_debit: totalD,
      total_credit: totalC,
      status: postAfter ? "Posted" : (form.status || "Draft"),
      posted_date: postAfter ? new Date().toISOString().slice(0, 10) : (form.posted_date || null),
    };

    if (isEdit) {
      await base44.entities.JournalEntry.update(entry.id, payload);
      toast.success(postAfter ? "Journal entry posted" : "Journal entry updated");
    } else {
      await base44.entities.JournalEntry.create(payload);
      toast.success(postAfter ? "Journal entry created and posted" : "Journal entry saved as draft");
    }
    setSaving(false);
    onSave();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <DialogTitle>{isEdit ? `Journal Entry ${entry.number}` : "New Journal Entry"}</DialogTitle>
              {entry?.status && (
                <Badge className={`text-xs ${STATUS_STYLES[entry.status] || "bg-muted text-muted-foreground"}`}>{entry.status}</Badge>
              )}
            </div>
            {!isReadOnly && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleSave(false)} disabled={saving}>
                  {saving ? "Saving…" : "Save Draft"}
                </Button>
                <Button size="sm" onClick={() => handleSave(true)} disabled={saving || !isBalanced} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  {saving ? "Posting…" : "Post Entry"}
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {/* Header fields */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>Entry Number</Label>
              <Input value={form.number} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} placeholder="JNL-0001" disabled={isReadOnly} />
            </div>
            <div className="space-y-1.5">
              <Label>Date <span className="text-destructive">*</span></Label>
              <Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} disabled={isReadOnly} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Narration <span className="text-destructive">*</span></Label>
              <Input value={form.narration} onChange={e => setForm(f => ({ ...f, narration: e.target.value }))} placeholder="Description of this entry" disabled={isReadOnly} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Reference</Label>
              <Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} placeholder="Optional external reference" disabled={isReadOnly} />
            </div>
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Input value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))} placeholder="AED" disabled={isReadOnly} />
            </div>
          </div>

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Debit / Credit Lines</Label>
              {!isReadOnly && (
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addLine}>
                  <Plus className="w-3 h-3" /> Add Line
                </Button>
              )}
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-primary/10 border-b-2 border-primary/20">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-primary/80 uppercase tracking-wide w-52">Account</th>
                    <th className="px-3 py-2.5 text-left text-xs font-bold text-primary/80 uppercase tracking-wide">Description</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-blue-600 uppercase tracking-wide w-32">Debit</th>
                    <th className="px-3 py-2.5 text-right text-xs font-bold text-emerald-600 uppercase tracking-wide w-32">Credit</th>
                    {!isReadOnly && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-2 py-1.5 w-56">
                        {isReadOnly ? (
                          <span className="text-xs font-mono">{line.account_code} {line.account_name}</span>
                        ) : (
                          <AccountCombobox accounts={accounts} value={line.account_id} onChange={acc => setLineAccount(i, acc)} />
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-7 text-xs border-0 bg-transparent focus-visible:ring-0 px-1"
                          placeholder="Line description…"
                          value={line.description || ""}
                          onChange={e => updateLine(i, "description", e.target.value)}
                          disabled={isReadOnly} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1 tabular-nums"
                          type="number" min="0" step="0.01" placeholder="0.00"
                          value={line.debit}
                          onChange={e => updateLine(i, "debit", e.target.value)}
                          disabled={isReadOnly} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input className="h-7 text-xs text-right border-0 bg-transparent focus-visible:ring-0 px-1 tabular-nums"
                          type="number" min="0" step="0.01" placeholder="0.00"
                          value={line.credit}
                          onChange={e => updateLine(i, "credit", e.target.value)}
                          disabled={isReadOnly} />
                      </td>
                      {!isReadOnly && (
                        <td className="px-2 py-1.5">
                          <button type="button" onClick={() => removeLine(i)} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}

                  {/* Totals row */}
                  <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                    <td colSpan={2} className="px-3 py-2 text-xs text-right text-muted-foreground uppercase tracking-wide">Totals</td>
                    <td className={`px-3 py-2 text-right text-sm tabular-nums ${isBalanced ? "text-blue-600" : "text-destructive"}`}>
                      {totalDebit.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className={`px-3 py-2 text-right text-sm tabular-nums ${isBalanced ? "text-emerald-600" : "text-destructive"}`}>
                      {totalCredit.toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    {!isReadOnly && <td />}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Balance indicator */}
            <div className={`mt-2 text-xs text-right font-medium ${isBalanced ? "text-emerald-600" : "text-destructive"}`}>
              {totalDebit === 0 && totalCredit === 0 ? "" :
                isBalanced ? "✓ Entry is balanced" :
                `⚠ Out of balance by ${Math.abs(totalDebit - totalCredit).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
            </div>
          </div>

          {/* Source info (read-only) */}
          {entry?.source_type && entry.source_type !== "Manual" && (
            <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 text-xs text-muted-foreground">
              Auto-posted from <strong>{entry.source_type}</strong>
              {entry.source_number && <> · <strong>{entry.source_number}</strong></>}
            </div>
          )}
        </div>

        {isReadOnly && (
          <div className="flex justify-end pt-4 border-t border-border mt-2">
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}