import React, { useState, useEffect, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Plus, Pencil, Trash2, Mail, Phone, Users, Briefcase, FolderKanban } from "lucide-react";
import ContactPersonFormModal from "./ContactPersonFormModal";

export default function ContactPersonPanel({ context }) {
  const [persons, setPersons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState(null);

  const filterKey = context.work_order_id
    ? "work_order_id"
    : context.project_id
      ? "project_id"
      : "contact_id";
  const filterValue = context.work_order_id || context.project_id || context.contact_id;

  const load = useCallback(async () => {
    if (!filterValue) { setPersons([]); setLoading(false); return; }
    setLoading(true);
    try {
      const result = await base44.entities.ContactPerson.filter({ [filterKey]: filterValue });
      setPersons(result || []);
    } catch { setPersons([]); }
    setLoading(false);
  }, [filterKey, filterValue]);

  useEffect(() => { load(); }, [load]);

  // At client level a person may have ascended from a work order or project;
  // at project level it may have ascended from a work order. Label its origin.
  const isClientLevel = !context.work_order_id && !context.project_id && !!context.contact_id;
  const isProjectLevel = !!context.project_id && !context.work_order_id;
  const personOrigin = (p) => {
    if (isClientLevel) {
      if (p.work_order_id && p.work_order_name) return { type: "wo", label: "Work Order", name: p.work_order_name };
      if (p.project_id && p.project_name) return { type: "project", label: "Project", name: p.project_name };
    } else if (isProjectLevel) {
      if (p.work_order_id && p.work_order_name) return { type: "wo", label: "Work Order", name: p.work_order_name };
    }
    return null;
  };

  const handleAdd = () => { setEditingPerson(null); setModalOpen(true); };
  const handleEdit = (p) => { setEditingPerson(p); setModalOpen(true); };

  const handleDelete = async (p) => {
    if (!window.confirm("Delete this contact person?")) return;
    await base44.entities.ContactPerson.delete(p.id);
    load();
  };

  const handleSave = async (data) => {
    if (editingPerson) {
      await base44.entities.ContactPerson.update(editingPerson.id, data);
    } else {
      await base44.entities.ContactPerson.create(data);
    }
    setModalOpen(false);
    load();
  };

  if (loading) {
    return <div className="py-8 text-center text-sm text-muted-foreground">Loading contact persons...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm text-muted-foreground">
          {persons.length} contact person{persons.length !== 1 ? "s" : ""}
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={handleAdd}>
          <Plus className="w-3.5 h-3.5" /> Add Person
        </Button>
      </div>

      {persons.length === 0 ? (
        <div className="py-12 text-center">
          <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No contact persons added yet.</p>
          <Button size="sm" variant="outline" className="gap-1.5 mt-3" onClick={handleAdd}>
            <Plus className="w-3.5 h-3.5" /> Add Contact Person
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {persons.map(p => (
            <div key={p.id} className="rounded-xl border border-border p-4 bg-muted/20 flex flex-col gap-2 group">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                    {(p.full_name || "?")[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm text-foreground leading-tight truncate">{p.full_name || "—"}</p>
                    {p.role && <p className="text-xs text-muted-foreground truncate">{p.role}</p>}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEdit(p)} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(p)} className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {p.email && (
                <a href={`mailto:${p.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Mail className="w-3 h-3 shrink-0" /> {p.email}
                </a>
              )}
              {p.phone && (
                <a href={`tel:${p.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors">
                  <Phone className="w-3 h-3 shrink-0" /> {p.phone}
                </a>
              )}
              {(() => {
                const origin = personOrigin(p);
                if (!origin) return null;
                return (
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground bg-primary/5 border border-primary/20 rounded-md px-1.5 py-1 mt-auto">
                    {origin.type === "wo"
                      ? <Briefcase className="w-3 h-3 shrink-0 text-primary" />
                      : <FolderKanban className="w-3 h-3 shrink-0 text-primary" />}
                    <span className="font-semibold text-primary">From {origin.label}:</span>
                    <span className="truncate">{origin.name}</span>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <ContactPersonFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          person={editingPerson}
          context={context}
        />
      )}
    </div>
  );
}