import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Pencil, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReferenceNumberingSection from "@/components/settings/ReferenceNumberingSection";

function FileTypeModal({ open, onClose, onSave, item }) {
  const [form, setForm] = useState({ name: "", color: "#6366f1", description: "", reference_prefix: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(item
      ? { name: item.name || "", color: item.color || "#6366f1", description: item.description || "", reference_prefix: item.reference_prefix || "" }
      : { name: "", color: "#6366f1", description: "", reference_prefix: "" });
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
        <DialogHeader><DialogTitle>{item ? "Edit File Type" : "Add File Type"}</DialogTitle></DialogHeader>
        <form onSubmit={handleSave} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Name *</Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Trade License" />
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
            <Label>Reference Prefix</Label>
            <Input value={form.reference_prefix} onChange={e => setForm(f => ({ ...f, reference_prefix: e.target.value.toUpperCase() }))} placeholder="e.g. TL, CON, CERT" className="font-mono" />
            <p className="text-xs text-muted-foreground">Used when generating reference numbers for files of this type.</p>
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

function FileTypesSection({ onTypesChange, scope }) {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = async () => {
    setLoading(true);
    const all = await base44.entities.FileType.list("name", 200);
    const list = (all || []).filter(t => t.entity_scope === scope || (!t.entity_scope && scope === "Contact"));
    setTypes(list);
    if (onTypesChange) onTypesChange(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, [scope]);

  const handleSave = async (form) => {
    const data = { ...form, entity_scope: scope };
    if (editing) await base44.entities.FileType.update(editing.id, data);
    else await base44.entities.FileType.create(data);
    setModal(false); setEditing(null); load();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this file type?")) return;
    await base44.entities.FileType.delete(id);
    load();
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" /> File Types
        </h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary h-7"
          onClick={() => { setEditing(null); setModal(true); }}>
          <Plus className="w-3.5 h-3.5" /> Add
        </Button>
      </div>
      {loading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
      ) : types.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">
          No file types yet. Add the first one.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {types.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 group transition-colors">
              <span className="w-3 h-3 rounded-full shrink-0 inline-block" style={{ backgroundColor: item.color || "#6366f1" }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-foreground">{item.name}</p>
                  {item.reference_prefix && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{item.reference_prefix}</span>
                  )}
                </div>
                {item.description && <p className="text-xs text-muted-foreground truncate">{item.description}</p>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" onClick={() => { setEditing(item); setModal(true); }}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-destructive" onClick={() => handleDelete(item.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <FileTypeModal open={modal} onClose={() => { setModal(false); setEditing(null); }} onSave={handleSave} item={editing} />
    </div>
  );
}

/**
 * Reusable file settings section combining File Reference Numbering
 * and File Types management. Place in any entity's settings page.
 *
 * Props:
 * - storageKey: DocumentTemplate name for storing numbering settings
 * - defaultPrefix: fallback prefix (e.g. "FILE")
 * - label: display label (e.g. "Contact File")
 * - entityName: file entity name for renaming existing records (e.g. "ContactFile")
 */
export default function FileSettingsSection({ storageKey, defaultPrefix, label, entityName, scope }) {
  const [fileTypes, setFileTypes] = useState([]);

  return (
    <div className="space-y-4">
      <ReferenceNumberingSection
        storageKey={storageKey}
        defaultPrefix={defaultPrefix}
        label={label}
        entityName={entityName}
        extraTabLabel="Prefix Type"
        extraContent={fileTypes.length > 0 ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-xs font-medium text-foreground mb-2">Type Reference Prefixes</p>
            <div className="flex flex-wrap gap-2">
              {fileTypes.map(t => (
                <div key={t.id} className="flex items-center gap-1.5 bg-card border border-border rounded-md px-2 py-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color || "#6366f1" }} />
                  <span className="text-xs text-muted-foreground">{t.name}</span>
                  {t.reference_prefix
                    ? <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{t.reference_prefix}</span>
                    : <span className="text-xs text-muted-foreground/60 italic">no prefix</span>}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Each file type's prefix is included in the reference code: <span className="font-mono text-foreground">PREFIX-TYPE-YEAR-NUMBER</span></p>
          </div>
        ) : null}
      />
      <FileTypesSection onTypesChange={setFileTypes} scope={scope} />
    </div>
  );
}