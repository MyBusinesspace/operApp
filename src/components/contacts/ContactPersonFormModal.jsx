import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default function ContactPersonFormModal({ open, onClose, onSave, person, context }) {
  const [form, setForm] = useState({ full_name: "", role: "", email: "", phone: "", notes: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (person) {
      setForm({
        full_name: person.full_name || "",
        role: person.role || "",
        email: person.email || "",
        phone: person.phone || "",
        notes: person.notes || "",
      });
    } else {
      setForm({ full_name: "", role: "", email: "", phone: "", notes: "" });
    }
  }, [person, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const data = {
      ...form,
      contact_id: context.contact_id || undefined,
      contact_name: context.contact_name || undefined,
      project_id: context.project_id || undefined,
      project_name: context.project_name || undefined,
      work_order_id: context.work_order_id || undefined,
      work_order_name: context.work_order_name || undefined,
    };
    await onSave(data);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{person ? "Edit Contact Person" : "New Contact Person"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label>Full Name *</Label>
            <Input value={form.full_name} onChange={e => set("full_name", e.target.value)} required placeholder="Full name" autoFocus />
          </div>
          <div className="space-y-1">
            <Label>Role / Position</Label>
            <Input value={form.role} onChange={e => set("role", e.target.value)} placeholder="e.g. CEO, Project Manager, Site Engineer..." />
          </div>
          <div className="space-y-1">
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="email@example.com" />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => set("phone", e.target.value)} placeholder="+1 555 000 000" />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Additional notes..." />
          </div>
          {(context.contact_name || context.project_name || context.work_order_name) && (
            <div className="text-xs text-muted-foreground space-y-0.5 pt-1 border-t border-border">
              {context.contact_name && <p>Company: {context.contact_name}</p>}
              {context.project_name && <p>Project: {context.project_name}</p>}
              {context.work_order_name && <p>Work Order: {context.work_order_name}</p>}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : person ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}