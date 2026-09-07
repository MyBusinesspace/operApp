import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Save, Plus, Trash2, Star, FileText, FileCheck } from "lucide-react";
import { DEFAULT_INCOTERMS } from "@/lib/incoterms";

export default function SalesIncotermsSettings() {
  const [items, setItems] = useState(DEFAULT_INCOTERMS);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const rec = list.find(t => t.name === "__incoterms__");
      if (rec) {
        setRecordId(rec.id);
        try {
          const parsed = JSON.parse(rec.footer_notes || "[]");
          if (Array.isArray(parsed) && parsed.length > 0) setItems(parsed);
        } catch {}
      }
    });
  }, []);

  const set = (i, key, value) => {
    setItems(prev => prev.map((r, idx) => idx === i ? { ...r, [key]: value } : r));
  };

  const setDefault = (i, type) => {
    setItems(prev => prev.map((r, idx) => ({ ...r, [type]: idx === i })));
  };

  const add = () => setItems(prev => [...prev, { code: "", description: "", explanation: "", is_default_quote: false, is_default_invoice: false }]);
  const remove = (i) => setItems(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setSaving(true);
    const data = { name: "__incoterms__", footer_notes: JSON.stringify(items) };
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
            <h3 className="text-sm font-semibold text-foreground">Incoterms</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Define available incoterms. Set a default for new Quotes and Invoices — it pre-fills new documents.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={add}>
            <Plus className="w-3 h-3" /> Add Incoterm
          </Button>
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-2 mt-4 mb-1 px-2.5">
          <div className="w-20 text-xs font-medium text-muted-foreground">Code</div>
          <div className="w-36 text-xs font-medium text-muted-foreground">Description</div>
          <div className="flex-1 text-xs font-medium text-muted-foreground">Explanation (shown on document)</div>
          <div className="w-20 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
            <FileText className="w-3 h-3" /> Quote
          </div>
          <div className="w-20 flex items-center justify-center gap-1 text-xs font-medium text-muted-foreground">
            <FileCheck className="w-3 h-3" /> Invoice
          </div>
          <div className="w-7" />
        </div>

        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-muted/30">
              <Input
                className="h-7 text-xs w-20 font-mono uppercase"
                placeholder="EXW"
                value={it.code}
                onChange={e => set(i, "code", e.target.value.toUpperCase())}
              />
              <Input
                className="h-7 text-xs w-36"
                placeholder="e.g. Ex Works"
                value={it.description}
                onChange={e => set(i, "description", e.target.value)}
              />
              <Input
                className="h-7 text-xs flex-1"
                placeholder="Brief explanation shown below the total on the document"
                value={it.explanation || ""}
                onChange={e => set(i, "explanation", e.target.value)}
              />
              <div className="w-20 flex justify-center">
                <button
                  type="button"
                  title="Set as default for Quotes"
                  onClick={() => setDefault(i, "is_default_quote")}
                  className={`p-1.5 rounded-md transition-colors ${it.is_default_quote ? "text-amber-500 bg-amber-50" : "text-muted-foreground hover:text-amber-400"}`}
                >
                  <Star className={`w-3.5 h-3.5 ${it.is_default_quote ? "fill-amber-500" : ""}`} />
                </button>
              </div>
              <div className="w-24 flex justify-center">
                <button
                  type="button"
                  title="Set as default for Invoices"
                  onClick={() => setDefault(i, "is_default_invoice")}
                  className={`p-1.5 rounded-md transition-colors ${it.is_default_invoice ? "text-blue-500 bg-blue-50" : "text-muted-foreground hover:text-blue-400"}`}
                >
                  <Star className={`w-3.5 h-3.5 ${it.is_default_invoice ? "fill-blue-500" : ""}`} />
                </button>
              </div>
              <button
                type="button"
                onClick={() => remove(i)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-6">No incoterms defined. Click "Add Incoterm" to create one.</p>
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
              {saving ? "Saving..." : saved ? "Saved!" : "Save Incoterms"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}