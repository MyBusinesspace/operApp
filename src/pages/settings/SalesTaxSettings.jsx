import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Plus, Trash2, Star, FileText, FileCheck } from "lucide-react";

const DEFAULT_RATES = [
  { label: "Standard VAT", rate: 5, is_default_quote: true, is_default_invoice: true },
  { label: "Zero Rated", rate: 0, is_default_quote: false, is_default_invoice: false },
];

export default function SalesTaxSettings() {
  const [rates, setRates] = useState(DEFAULT_RATES);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const s = list.find(t => t.name === "__tax_rates__");
      if (s) {
        setRecordId(s.id);
        try {
          const parsed = JSON.parse(s.footer_notes || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) setRates(parsed);
        } catch {}
      } else {
        // fallback: migrate from old __numbering_settings__ if present
        const old = list.find(t => t.name === "__numbering_settings__");
        if (old) {
          try {
            const parsed = JSON.parse(old.footer_notes || "{}");
            if (parsed.tax_rates?.length > 0) {
              // migrate: add is_default_quote / is_default_invoice from is_default
              setRates(parsed.tax_rates.map(r => ({
                label: r.label,
                rate: r.rate,
                is_default_quote: !!r.is_default,
                is_default_invoice: !!r.is_default,
              })));
            }
          } catch {}
        }
      }
    });
  }, []);

  const set = (i, key, value) => {
    setRates(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  };

  const setDefault = (i, type) => {
    // only one default per type at a time
    setRates(prev => prev.map((r, idx) => ({ ...r, [type]: idx === i })));
  };

  const addRate = () => setRates(prev => [...prev, { label: "", rate: 0, is_default_quote: false, is_default_invoice: false }]);
  const removeRate = (i) => setRates(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    const data = { name: "__tax_rates__", footer_notes: JSON.stringify(rates) };
    if (recordId) {
      await base44.entities.DocumentTemplate.update(recordId, data);
    } else {
      const created = await base44.entities.DocumentTemplate.create(data);
      setRecordId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Tax Rates</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define available rates. Set a default separately for Quotes and Invoices — it pre-fills new line items.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={addRate}>
            <Plus className="w-3 h-3" /> Add Rate
          </Button>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 mt-4 mb-1 px-2.5">
          <div className="flex-1 text-xs font-medium text-muted-foreground">Label</div>
          <div className="w-20 text-xs font-medium text-muted-foreground text-right">Rate</div>
          <div className="w-24 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
            <FileText className="w-3 h-3" /> Quote
          </div>
          <div className="w-24 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
            <FileCheck className="w-3 h-3" /> Invoice
          </div>
          <div className="w-7" />
        </div>

        <div className="space-y-2">
          {rates.map((tr, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30">
              <Input
                className="h-7 text-xs flex-1"
                placeholder="e.g. Standard VAT"
                value={tr.label}
                onChange={e => set(i, "label", e.target.value)}
              />
              <div className="flex items-center gap-1 w-20 shrink-0">
                <Input
                  className="h-7 text-xs w-14 text-right"
                  type="number" min={0} max={100} step={0.5}
                  value={tr.rate}
                  onChange={e => set(i, "rate", Number(e.target.value))}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
              {/* Default for Quote */}
              <div className="w-24 flex justify-center">
                <button
                  type="button"
                  title="Set as default for Quotes"
                  onClick={() => setDefault(i, "is_default_quote")}
                  className={`p-1.5 rounded-md transition-colors ${tr.is_default_quote ? "text-amber-500 bg-amber-50" : "text-muted-foreground hover:text-amber-400"}`}
                >
                  <Star className={`w-3.5 h-3.5 ${tr.is_default_quote ? "fill-amber-500" : ""}`} />
                </button>
              </div>
              {/* Default for Invoice */}
              <div className="w-24 flex justify-center">
                <button
                  type="button"
                  title="Set as default for Invoices"
                  onClick={() => setDefault(i, "is_default_invoice")}
                  className={`p-1.5 rounded-md transition-colors ${tr.is_default_invoice ? "text-blue-500 bg-blue-50" : "text-muted-foreground hover:text-blue-400"}`}
                >
                  <Star className={`w-3.5 h-3.5 ${tr.is_default_invoice ? "fill-blue-500" : ""}`} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => removeRate(i)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {rates.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No tax rates defined. Click "Add Rate" to create one.</p>
          )}
        </div>

        <div className="flex items-center gap-4 mt-4 pt-3 border-t border-border">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-amber-500 text-amber-500" /> = Quote default</span>
            <span className="flex items-center gap-1"><Star className="w-3 h-3 fill-blue-500 text-blue-500" /> = Invoice default</span>
          </div>
          <div className="ml-auto">
            <Button onClick={handleSave} disabled={saving} className="gap-2" size="sm">
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : saved ? "Saved!" : "Save Tax Rates"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}