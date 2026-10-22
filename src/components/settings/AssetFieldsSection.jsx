import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, ListPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function AssetFieldsSection() {
  const [fields, setFields] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // { item } | null
  const [form, setForm] = useState({ name: "", field_type: "text" });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.AssetField.list("sort_order", 200);
      setFields(list || []);
    } catch {
      setFields([]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => { setForm({ name: "", field_type: "text" }); setModal({ item: null }); };
  const openEdit = (item) => { setForm({ name: item.name || "", field_type: item.field_type || "text" }); setModal({ item }); };
  const closeModal = () => setModal(null);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      field_type: form.field_type,
      sort_order: modal.item?.sort_order ?? fields.length,
    };
    if (modal.item) await base44.entities.AssetField.update(modal.item.id, payload);
    else await base44.entities.AssetField.create(payload);
    setSaving(false);
    closeModal();
    load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this field? Existing values on assets will be kept but no longer shown.")) return;
    await base44.entities.AssetField.delete(id);
    load();
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden mb-4">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <ListPlus className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Asset Custom Fields</h3>
        </div>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      <p className="px-4 py-2 text-xs text-muted-foreground bg-muted/10 border-b border-border">
        These fields replace the fixed Serial Number, Manufacturer, Model, Year and Location fields on the asset form. Each field can be text or numeric. The first two active fields (by order) also appear as <strong className="text-foreground">Field 1 / Field 2</strong> in the Working Report's Equipment row.
      </p>
      {loading ? (
        <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
      ) : fields.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No custom fields yet. Add fields like “Serial Number”, “Manufacturer”, etc.</div>
      ) : (
        <div className="divide-y divide-border">
          {(() => {
            const reportIds = new Set(fields.filter(f => f.is_active !== false).slice(0, 2).map(f => f.id));
            return fields.map(f => (
              <div key={f.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{f.name}</p>
                </div>
                {reportIds.has(f.id) && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">In Report</span>
                )}
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${f.field_type === "number" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                  {f.field_type === "number" ? "Number" : "Text"}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => openEdit(f)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => handleDelete(f.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ));
          })()}
        </div>
      )}

      <Dialog open={!!modal} onOpenChange={closeModal}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{modal?.item ? "Edit Custom Field" : "Add Custom Field"}</DialogTitle></DialogHeader>
          <form onSubmit={handleSave} className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Serial Number" autoFocus />
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={form.field_type} onValueChange={v => setForm(f => ({ ...f, field_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
              <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? "Saving..." : modal?.item ? "Update" : "Add"}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}