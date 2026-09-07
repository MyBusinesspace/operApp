import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import { ArrowLeft, Package, Plus, Pencil, Trash2, Hash, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import FileSettingsSection from "@/components/shared/FileSettingsSection";
import AssetFieldsSection from "@/components/settings/AssetFieldsSection";

function ColorDot({ color }) {
  return <span className="w-3 h-3 rounded-full shrink-0 inline-block" style={{ backgroundColor: color || "#6366f1" }} />;
}

function LabelItemList({ title, items, onAdd, onEdit, onDelete }) {
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <div className="p-8 text-center text-sm text-muted-foreground">No {title.toLowerCase()} yet.</div>
      ) : (
        <div className="divide-y divide-border">
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
              <ColorDot color={item.color} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.name}</p>
                {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => onEdit(item)}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => onDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemModal({ open, onClose, onSave, item, title }) {
  const [form, setForm] = useState({ name: "", color: "#6366f1", description: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(item
      ? { name: item.name || "", color: item.color || "#6366f1", description: item.description || "" }
      : { name: "", color: "#6366f1", description: "" });
  }, [item, open]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{item ? `Edit ${title}` : `Add ${title}`}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. HVAC" />
          </div>
          <div className="space-y-1">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-10 h-9 rounded border border-input cursor-pointer p-0.5" />
              <Input value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} placeholder="#6366f1" className="flex-1" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !form.name.trim()}>{saving ? "Saving..." : item ? "Update" : "Add"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReferenceNumberingSection() {
  const defaultForm = { prefix: "AST", number_padding: 4, include_year: false, next_number: 1 };
  const [form, setForm] = useState(defaultForm);
  const [recordId, setRecordId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.DocumentTemplate.list("name", 100).then(list => {
      const s = list.find(t => t.name === "__asset_numbering__");
      if (s) {
        setRecordId(s.id);
        try { setForm(f => ({ ...f, ...JSON.parse(s.footer_notes || "{}") })); } catch {}
      }
    });
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const preview = () => {
    const year = new Date().getFullYear();
    const padded = String(form.next_number || 1).padStart(form.number_padding || 4, "0");
    return form.include_year ? `${form.prefix}-${year}-${padded}` : `${form.prefix}-${padded}`;
  };

  const handleSave = async () => {
    setSaving(true);
    const data = { name: "__asset_numbering__", footer_notes: JSON.stringify(form) };
    if (recordId) await base44.entities.DocumentTemplate.update(recordId, data);
    else { const c = await base44.entities.DocumentTemplate.create(data); setRecordId(c.id); }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-border">
        <Hash className="w-4 h-4 text-primary" />
        <h3 className="text-sm font-semibold text-foreground">Asset Reference Numbering</h3>
        <span className="ml-auto text-xs text-muted-foreground">Preview: <span className="font-mono text-foreground">{preview()}</span></span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Prefix</Label>
          <Input className="h-8 text-sm" value={form.prefix || ""} onChange={e => set("prefix", e.target.value)} placeholder="AST" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Number padding</Label>
          <Input className="h-8 text-sm" type="number" min={1} max={8} value={form.number_padding || 4} onChange={e => set("number_padding", Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Next number</Label>
          <Input className="h-8 text-sm" type="number" min={1} value={form.next_number || 1} onChange={e => set("next_number", Number(e.target.value))} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Include year</Label>
          <div className="flex items-center gap-2 h-8">
            <input type="checkbox" checked={!!form.include_year} onChange={e => set("include_year", e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className="text-sm text-muted-foreground">e.g. AST-2026-0001</span>
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-7 text-xs">
          <Save className="w-3 h-3" /> {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </Button>
      </div>
    </div>
  );
}

const entityMap = {
  group: base44.entities.AssetGroup,
  category: base44.entities.AssetCategory,
  status: base44.entities.AssetStatus,
};

const modalTitles = {
  group: "Asset Group",
  category: "Asset Category",
  status: "Asset Status",
};

export default function AssetSettings() {
  const [data, setData] = useState({ groups: [], categories: [], statuses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { type, item }

  const load = async (retry = 0) => {
    setLoading(true);
    setError(null);
    try {
      const [groups, categories, statuses] = await Promise.all([
        base44.entities.AssetGroup.list("name", 200),
        base44.entities.AssetCategory.list("name", 100),
        base44.entities.AssetStatus.list("name", 100),
      ]);
      setData({ groups, categories, statuses });
    } catch (e) {
      if (retry < 2) {
        setTimeout(() => load(retry + 1), 1500 * (retry + 1));
        return;
      }
      setError(e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openAdd = (type) => setModal({ type, item: null });
  const openEdit = (type, item) => setModal({ type, item });
  const closeModal = () => setModal(null);

  const handleSave = async (form) => {
    const entity = entityMap[modal.type];
    if (modal.item) await entity.update(modal.item.id, form);
    else await entity.create(form);
    closeModal();
    load();
  };

  const handleDelete = async (type, id) => {
    if (!confirm("Delete this item?")) return;
    await entityMap[type].delete(id);
    load();
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4" /> Settings
        </Link>
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-teal-50 text-teal-600">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Asset Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">Manage asset groups, categories, statuses and reference numbering</p>
          </div>
        </div>
      </motion.div>

      {loading ? (
        <div className="text-center text-muted-foreground text-sm py-12">Loading...</div>
      ) : error ? (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground">Failed to load settings.</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{error}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => load()}>Retry</Button>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <ReferenceNumberingSection />
          <AssetFieldsSection />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <LabelItemList
              title="Groups"
              items={data.groups}
              onAdd={() => openAdd("group")}
              onEdit={item => openEdit("group", item)}
              onDelete={id => handleDelete("group", id)}
            />
            <LabelItemList
              title="Categories"
              items={data.categories}
              onAdd={() => openAdd("category")}
              onEdit={item => openEdit("category", item)}
              onDelete={id => handleDelete("category", id)}
            />
            <LabelItemList
              title="Statuses"
              items={data.statuses}
              onAdd={() => openAdd("status")}
              onEdit={item => openEdit("status", item)}
              onDelete={id => handleDelete("status", id)}
            />
          </div>
          <div className="mt-4">
            <FileSettingsSection storageKey="__asset_file_numbering__" defaultPrefix="FILE" label="Asset File" entityName="AssetFile" scope="Asset" />
          </div>
        </motion.div>
      )}

      <ItemModal
        open={!!modal}
        onClose={closeModal}
        onSave={handleSave}
        item={modal?.item}
        title={modalTitles[modal?.type] || ""}
      />
    </div>
  );
}