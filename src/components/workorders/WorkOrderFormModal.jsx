import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, FolderKanban, Package, Building2, UserCircle, Plus } from "lucide-react";
import DateQuickButtons from "@/components/shared/DateQuickButtons";
import { generateReference } from "@/lib/referenceNumbering";

const EMPTY = {
  title: "", reference: "", status: "", priority: "Medium", type: "",
  project_id: "", project_name: "", contact_id: "", contact_name: "",
  asset_id: "", asset_name: "",
  assigned_to: "", scheduled_date: "", due_date: "", location: "", maps_link: "", location_lat: null, location_lng: null, description: "", notes: ""
};

const DEFAULT_CATEGORIES = ["Maintenance","Repair","Inspection","Installation","Other"];
const DEFAULT_STATUSES = ["Active","On Hold","Archived"];

export default function WorkOrderFormModal({ open, onClose, onSave, workOrder, projects = [], assets = [] }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectDropdown, setProjectDropdown] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetDropdown, setAssetDropdown] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactDropdown, setContactDropdown] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [contactPersonSearch, setContactPersonSearch] = useState("");
  const [contactPersonDropdown, setContactPersonDropdown] = useState(false);
  const [creatingContactPerson, setCreatingContactPerson] = useState(false);
  const [newCpName, setNewCpName] = useState("");
  const [newCpRole, setNewCpRole] = useState("");
  const [newCpPhone, setNewCpPhone] = useState("");
  // Pending contact person staged in the form — created (with full WO/project/client links) on save
  const [pendingCp, setPendingCp] = useState(null);

  useEffect(() => {
    if (open) {
      Promise.all([
        base44.entities.WorkOrderCategory.list("name", 100),
        base44.entities.WorkOrderStatus.list("name", 100),
        base44.entities.Contact.list("full_name", 200),
        base44.entities.ContactPerson.list("full_name", 500),
      ]).then(([cats, stats, ctcs, cps]) => {
        setCategories(cats);
        setStatuses(stats);
        setContacts(ctcs);
        setContactPersons(cps);
      });
    }
  }, [open]);

  // Auto-generate reference for new work orders
  useEffect(() => {
    if (open && !workOrder) {
      base44.entities.WorkOrder.list("-created_date", 200).then(allWOs => {
        generateReference("__wo_numbering__", "WO", allWOs).then(ref => {
          setForm(f => ({ ...f, reference: ref }));
        });
      });
    }
  }, [open, workOrder]);

  useEffect(() => {
    if (workOrder) {
      const p = projects.find(x => x.id === workOrder.project_id);
      setForm({
        ...EMPTY, ...workOrder,
        location: p?.location || workOrder.location || "",
        maps_link: p?.maps_link || workOrder.maps_link || "",
        location_lat: p?.location_lat ?? workOrder.location_lat ?? null,
        location_lng: p?.location_lng ?? workOrder.location_lng ?? null,
      });
    } else {
      setForm(EMPTY);
    }
    setProjectSearch(""); setProjectDropdown(false);
    setAssetSearch(""); setAssetDropdown(false);
    setContactSearch(""); setContactDropdown(false);
    setContactPersonSearch(workOrder?.assigned_to || ""); setContactPersonDropdown(false);
    setPendingCp(null); setNewCpName(""); setNewCpRole(""); setNewCpPhone("");
  }, [workOrder, open]);

  const categoryOptions = categories.length > 0 ? categories.map(c => c.name) : DEFAULT_CATEGORIES;
  const statusOptions = statuses.length > 0 ? statuses.map(s => s.name) : DEFAULT_STATUSES;

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleProjectChange = (pid) => {
    const p = projects.find(x => x.id === pid);
    set("project_id", pid === "__none__" ? "" : pid);
    set("project_name", p ? p.name : "");
    set("contact_id", p ? (p.contact_id || "") : "");
    // contact_name on the project is already stored as company name (set by ProjectFormModal)
    set("contact_name", p ? (p.contact_name || "") : "");
    set("location", p ? (p.location || "") : "");
    set("maps_link", p ? (p.maps_link || "") : "");
    set("location_lat", p ? (p.location_lat ?? null) : null);
    set("location_lng", p ? (p.location_lng ?? null) : null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    // Pass the pending contact person through so the parent can create it with the saved WO id
    await onSave({ ...form, _pending_contact_person: pendingCp });
    setSaving(false);
  };

  const handleContactChange = (cid) => {
    if (cid === "__none__") {
      set("contact_id", ""); set("contact_name", "");
    } else {
      const c = contacts.find(x => x.id === cid);
      set("contact_id", cid);
      set("contact_name", c ? (c.company || c.full_name) : "");
    }
  };

  // Filtered contacts: restrict by selected project's contact, or by search
  const filteredContacts = contacts.filter(c => {
    if (form.project_id) {
      const p = projects.find(x => x.id === form.project_id);
      if (p?.contact_id && c.id !== p.contact_id) return false;
    }
    const q = contactSearch.toLowerCase();
    return !q || c.company?.toLowerCase().includes(q) || c.full_name?.toLowerCase().includes(q);
  });

  // Cross-filtering: if an asset is selected, only show its project; if a project is selected, only show assets of that project
  const filteredProjects = projects.filter(p => {
    if (form.contact_id && p.contact_id && p.contact_id !== form.contact_id) return false;
    if (form.asset_id) {
      const linkedAsset = assets.find(a => a.id === form.asset_id);
      if (linkedAsset?.project_id && p.id !== linkedAsset.project_id) return false;
    }
    const q = projectSearch.toLowerCase();
    return !q || p.name?.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q);
  });

  const filteredAssets = assets.filter(a => {
    if (form.project_id) {
      if (a.project_id && a.project_id !== form.project_id) return false;
    }
    const q = assetSearch.toLowerCase();
    return !q || a.name?.toLowerCase().includes(q) || a.reference?.toLowerCase().includes(q) || a.serial_number?.toLowerCase().includes(q);
  });

  const handleAssetChange = (aid) => {
    const a = assets.find(x => x.id === aid);
    setForm(f => {
      const newForm = { ...f, asset_id: aid === "__none__" ? "" : aid, asset_name: a ? a.name : "" };
      // If selected asset belongs to a project and no project is linked yet, auto-link it
      if (a?.project_id && !f.project_id) {
        const p = projects.find(x => x.id === a.project_id);
        if (p) { newForm.project_id = p.id; newForm.project_name = p.name; }
      }
      return newForm;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{workOrder ? "Edit Work Order" : "New Work Order"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Title *</Label>
              <Input value={form.title} onChange={e => set("title", e.target.value)} required placeholder="e.g. Crane S52 – Monthly Inspection" />
            </div>
            <div className="space-y-1">
              <Label>Reference</Label>
              <div className="px-3 py-2 rounded-md border border-input bg-muted/40 text-sm font-mono text-muted-foreground">{form.reference || "—"}</div>
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select value={form.type || ""} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status || ""} onValueChange={v => set("status", v)}>
                <SelectTrigger><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  {statusOptions.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={form.priority} onValueChange={v => set("priority", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Low","Medium","High","Urgent"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {/* Company */}
            <div className="col-span-2 space-y-1">
              <Label>Linked Company</Label>
              <div className="relative">
                {form.contact_id ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium">{form.contact_name}</p>
                    </div>
                    <button type="button" onClick={() => { handleContactChange("__none__"); setContactSearch(""); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search company..."
                      value={contactSearch}
                      onChange={e => { setContactSearch(e.target.value); setContactDropdown(true); }}
                      onFocus={() => setContactDropdown(true)}
                      onBlur={() => setTimeout(() => setContactDropdown(false), 150)} />
                  </div>
                )}
                {contactDropdown && !form.contact_id && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.map(c => (
                      <button key={c.id} type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors"
                        onMouseDown={() => { handleContactChange(c.id); setContactSearch(""); setContactDropdown(false); }}>
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{c.company || c.full_name}</p>
                          {c.company && c.full_name && <p className="text-xs text-muted-foreground">{c.full_name}</p>}
                        </div>
                      </button>
                    ))}
                    {filteredContacts.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No companies found</p>}
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Linked Project</Label>
              <div className="relative">
                {form.project_id ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium">{form.project_name}</p>
                    </div>
                    <button type="button" onClick={() => { handleProjectChange("__none__"); setProjectSearch(""); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search project..."
                      value={projectSearch}
                      onChange={e => { setProjectSearch(e.target.value); setProjectDropdown(true); }}
                      onFocus={() => setProjectDropdown(true)}
                      onBlur={() => setTimeout(() => setProjectDropdown(false), 150)} />
                  </div>
                )}
                {projectDropdown && !form.project_id && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredProjects.map(p => (
                      <button key={p.id} type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors"
                        onMouseDown={() => { handleProjectChange(p.id); setProjectSearch(""); setProjectDropdown(false); }}>
                        <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          {p.reference && <p className="text-xs text-muted-foreground">{p.reference}</p>}
                        </div>
                      </button>
                    ))}
                    {filteredProjects.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No projects found</p>}
                  </div>
                )}
              </div>
            </div>
            {/* Asset */}
            <div className="col-span-2 space-y-1">
              <Label>Linked Asset</Label>
              <div className="relative">
                {form.asset_id ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium leading-tight">{form.asset_name}</p>
                        {assets.find(a => a.id === form.asset_id)?.reference && (
                          <p className="text-xs text-muted-foreground font-mono">{assets.find(a => a.id === form.asset_id)?.reference}</p>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={() => { handleAssetChange("__none__"); setAssetSearch(""); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Search asset..."
                      value={assetSearch}
                      onChange={e => { setAssetSearch(e.target.value); setAssetDropdown(true); }}
                      onFocus={() => setAssetDropdown(true)}
                      onBlur={() => setTimeout(() => setAssetDropdown(false), 150)} />
                  </div>
                )}
                {assetDropdown && !form.asset_id && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredAssets.map(a => (
                      <button key={a.id} type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors"
                        onMouseDown={() => { handleAssetChange(a.id); setAssetSearch(""); setAssetDropdown(false); }}>
                        <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{a.name}</p>
                          {a.reference && <p className="text-xs text-muted-foreground font-mono">{a.reference}</p>}
                        </div>
                      </button>
                    ))}
                    {filteredAssets.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">No assets found</p>}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Scheduled Date</Label>
              <Input type="date" value={form.scheduled_date} onChange={e => set("scheduled_date", e.target.value)} />
              <DateQuickButtons value={form.scheduled_date} onChange={v => set("scheduled_date", v)} />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={e => set("due_date", e.target.value)} />
              <DateQuickButtons value={form.due_date} onChange={v => set("due_date", v)} baseDate={form.scheduled_date} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Contact in Charge</Label>
              {creatingContactPerson ? (
                <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
                  <p className="text-xs font-medium text-muted-foreground">
                    New contact person{form.contact_name ? ` — linked to ${form.contact_name}` : ""}
                  </p>
                  <Input
                    placeholder="Full name *"
                    value={newCpName}
                    onChange={e => setNewCpName(e.target.value)}
                    autoFocus
                  />
                  <Input
                    placeholder="Role / position (optional)"
                    value={newCpRole}
                    onChange={e => setNewCpRole(e.target.value)}
                  />
                  <Input
                    placeholder="Phone (optional)"
                    value={newCpPhone}
                    onChange={e => setNewCpPhone(e.target.value)}
                  />
                  <div className="flex gap-2 justify-end pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => { setCreatingContactPerson(false); setNewCpName(""); setNewCpRole(""); setNewCpPhone(""); }}>
                      Cancel
                    </Button>
                    <Button type="button" size="sm" disabled={!newCpName.trim()} onClick={() => {
                      const name = newCpName.trim();
                      // Stage the contact person — it is created (linked to WO + project + client) when the work order is saved
                      set("assigned_to", name);
                      setPendingCp({ full_name: name, role: newCpRole.trim() || undefined, phone: newCpPhone.trim() || undefined });
                      setCreatingContactPerson(false);
                      setNewCpName(""); setNewCpRole(""); setNewCpPhone("");
                    }}>
                      Select
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {form.assigned_to ? (
                    <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                      <div className="flex items-center gap-2">
                        <UserCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium">{form.assigned_to}</p>
                      </div>
                      <button type="button" onClick={() => { set("assigned_to", ""); setContactPersonSearch(""); setPendingCp(null); }}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Search contact person..."
                        value={contactPersonSearch}
                        onChange={e => { setContactPersonSearch(e.target.value); setContactPersonDropdown(true); }}
                        onFocus={() => setContactPersonDropdown(true)}
                        onBlur={() => setTimeout(() => setContactPersonDropdown(false), 200)} />
                    </div>
                  )}
                  {contactPersonDropdown && !form.assigned_to && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-52 overflow-y-auto">
                      {contactPersons
                        .filter(cp => {
                          if (form.contact_id && cp.contact_id && cp.contact_id !== form.contact_id) return false;
                          const q = contactPersonSearch.toLowerCase();
                          return !q || cp.full_name?.toLowerCase().includes(q) || cp.role?.toLowerCase().includes(q);
                        })
                        .map(cp => (
                          <button key={cp.id} type="button"
                            className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors"
                            onMouseDown={() => { set("assigned_to", cp.full_name); setPendingCp(null); setContactPersonSearch(""); setContactPersonDropdown(false); }}>
                            <UserCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div>
                              <p className="text-sm font-medium">{cp.full_name}</p>
                              {cp.role && <p className="text-xs text-muted-foreground">{cp.role}</p>}
                              {cp.contact_name && <p className="text-xs text-muted-foreground">{cp.contact_name}</p>}
                            </div>
                          </button>
                        ))
                      }
                      <button type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors text-primary border-t border-border"
                        onMouseDown={() => { setContactPersonDropdown(false); setCreatingContactPerson(true); setNewCpName(contactPersonSearch); }}>
                        <Plus className="w-4 h-4 shrink-0" />
                        <p className="text-sm font-medium">
                          {contactPersonSearch ? `Create "${contactPersonSearch}"` : "Create new contact person"}
                          {form.contact_name ? ` for ${form.contact_name}` : ""}
                        </p>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Location {form.project_id && <span className="text-xs text-muted-foreground font-normal">(inherited from project)</span>}</Label>
              <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Site address or name" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Google Maps Link {form.project_id && <span className="text-xs text-muted-foreground font-normal">(inherited from project)</span>}</Label>
              <Input value={form.maps_link} onChange={e => set("maps_link", e.target.value)} placeholder="https://maps.google.com/..." />
              {form.maps_link && (
                <a href={form.maps_link} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                  View on Google Maps ↗
                </a>
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="Work scope..." />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Internal notes..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : workOrder ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}