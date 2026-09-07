import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, MessageSquare, Phone, Mail, Users, Calendar, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ACTION_ICONS = {
  Note:    MessageSquare,
  Call:    Phone,
  Email:   Mail,
  Meeting: Users,
  Update:  Calendar,
};

const ACTION_COLORS = {
  Note:    "bg-slate-100 text-slate-600",
  Call:    "bg-blue-100 text-blue-600",
  Email:   "bg-violet-100 text-violet-600",
  Meeting: "bg-emerald-100 text-emerald-600",
  Update:  "bg-amber-100 text-amber-600",
};

function fmtDatetime(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });
}

export default function ContactHistory({ contactId, notes, onRefresh, currentUser }) {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ action: "Note", note: "" });
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEditing(null); setForm({ action: "Note", note: "" }); setShowModal(true); };
  const openEdit = (n) => { setEditing(n); setForm({ action: n.action || "Note", note: n.note || "" }); setShowModal(true); };

  const handleSave = async () => {
    if (!form.note.trim()) return;
    setSaving(true);
    if (editing) {
      await base44.entities.ContactNote.update(editing.id, form);
    } else {
      await base44.entities.ContactNote.create({ contact_id: contactId, ...form });
    }
    setSaving(false);
    setShowModal(false);
    onRefresh();
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this note?")) return;
    await base44.entities.ContactNote.delete(id);
    onRefresh();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <span className="w-1 h-4 bg-primary rounded-full inline-block" />
          History and notes
        </h3>
        <Button size="sm" variant="ghost" className="gap-1.5 text-primary hover:text-primary" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5" /> Add note
        </Button>
      </div>

      {/* Table */}
      {notes.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No history yet. Add the first note.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-44">Date</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-24">Action</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Detail</th>
                <th className="px-4 py-2.5 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {[...notes].sort((a, b) => new Date(b.created_date) - new Date(a.created_date)).map((n, i) => {
                const ActionIcon = ACTION_ICONS[n.action] || MessageSquare;
                return (
                  <tr key={n.id || i} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {fmtDatetime(n.created_date)}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${ACTION_COLORS[n.action] || ACTION_COLORS.Note}`}>
                        <ActionIcon className="w-3 h-3" />
                        {n.action || "Note"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{n.note}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground" onClick={() => openEdit(n)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-destructive" onClick={() => handleDelete(n.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Note" : "Add Note"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <Select value={form.action} onValueChange={v => setForm(f => ({ ...f, action: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Note","Call","Email","Meeting","Update"].map(a =>
                  <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="Write your note here..."
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.note.trim()}>
                {saving ? "Saving..." : editing ? "Update" : "Add Note"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}