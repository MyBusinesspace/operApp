import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X, User, MapPin, ExternalLink, Loader2 } from "lucide-react";
import DateQuickButtons from "@/components/shared/DateQuickButtons";
import HistoryNotesPanel from "@/components/shared/HistoryNotesPanel";

const EMPTY = {
  name: "", reference: "", type: "", status: "",
  contact_id: "", contact_name: "", contact_person: "",
  start_date: "", end_date: "",
  budget: "", currency: "USD", location: "", maps_link: "",
  location_lat: null, location_lng: null, description: "", notes: "", tags: ""
};

// Parse lat/lng from various Google Maps URL formats
function parseGoogleMapsLink(url) {
  if (!url) return null;
  // Format: @lat,lng or /place/.../@lat,lng or maps?q=lat,lng or ll=lat,lng
  const patterns = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /[?&]ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
    /maps\/place\/[^/]+\/@(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return null;
}

const DEFAULT_CATEGORIES = ["Rental","Installation","Maintenance","Consulting","Construction","Other"];
const DEFAULT_STATUSES = ["Draft","Active","On Hold","Completed","Cancelled"];

export default function ProjectFormModal({ open, onClose, onSave, project, contacts = [] }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [contactSearch, setContactSearch] = useState("");
  const [contactDropdown, setContactDropdown] = useState(false);
  const [categories, setCategories] = useState([]);
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    if (open) {
      Promise.all([
        base44.entities.ProjectCategory.list("name", 100),
        base44.entities.ProjectStatus.list("name", 100),
      ]).then(([cats, stats]) => {
        setCategories(cats);
        setStatuses(stats);
      });
    }
  }, [open]);

  useEffect(() => {
    if (project) {
      setForm({ ...EMPTY, ...project, budget: project.budget ?? "" });
    } else {
      setForm(EMPTY);
      // Auto-generate reference for new projects
      import("@/lib/referenceNumbering").then(({ generateReference }) => {
        base44.entities.Project.list("-created_date", 200).then(all => {
          generateReference("__project_numbering__", "PRJ", all).then(ref => {
            setForm(f => ({ ...f, reference: ref }));
          });
        });
      });
    }
    setContactSearch("");
    setContactDropdown(false);
  }, [project, open]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const [resolvingMaps, setResolvingMaps] = useState(false);

  const resolveMapsLinkServer = async (url) => {
    setResolvingMaps(true);
    try {
      const res = await base44.functions.invoke('resolveMapsLink', { url });
      const data = res.data || res;
      if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
        setForm(f => ({ ...f, location_lat: data.lat, location_lng: data.lng }));
      }
    } catch (_) {
      // leave as-is (no coordinates)
    } finally {
      setResolvingMaps(false);
    }
  };

  const handleMapsLink = async (url) => {
    const coords = parseGoogleMapsLink(url);
    if (coords) {
      setForm(f => ({ ...f, maps_link: url, location_lat: coords.lat, location_lng: coords.lng }));
      return;
    }
    if (!url) {
      setForm(f => ({ ...f, maps_link: "", location_lat: null, location_lng: null }));
      return;
    }
    // Local parse failed — try server-side resolution for short links (maps.app.goo.gl)
    setForm(f => ({ ...f, maps_link: url, location_lat: null, location_lng: null }));
    resolveMapsLinkServer(url);
  };

  // Resolve short links on load when coords are missing
  useEffect(() => {
    if (open && form.maps_link && !form.location_lat && !resolvingMaps) {
      const coords = parseGoogleMapsLink(form.maps_link);
      if (!coords) resolveMapsLinkServer(form.maps_link);
    }
  }, [open, form.maps_link]);

  const categoryOptions = categories.length > 0 ? categories.map(c => c.name) : DEFAULT_CATEGORIES;
  const statusOptions = statuses.length > 0 ? statuses.map(s => s.name) : DEFAULT_STATUSES;

  const handleContactChange = (cid) => {
    const c = contacts.find(x => x.id === cid);
    set("contact_id", cid === "__none__" ? "" : cid);
    set("contact_name", c ? (c.company || c.full_name) : "");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...form,
      budget: form.budget !== "" ? Number(form.budget) : undefined,
    };
    await onSave(payload);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Project Name *</Label>
              <Input value={form.name} onChange={e => set("name", e.target.value)} required placeholder="e.g. Rental Tower Crane S52" />
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
            <div className="col-span-2 space-y-1">
              <Label>Customer Contact</Label>
              <div className="relative">
                {form.contact_id ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                    <div className="flex items-center gap-2">
                     <User className="w-4 h-4 text-muted-foreground shrink-0" />
                     <div>
                       <p className="text-sm font-medium leading-tight">{form.contact_name}</p>
                       {(() => { const c = contacts.find(x => x.id === form.contact_id); return c?.company && c?.full_name ? <p className="text-xs text-muted-foreground">{c.full_name}</p> : null; })()}
                     </div>
                    </div>
                    <button type="button" onClick={() => { handleContactChange("__none__"); setContactSearch(""); }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search company or contact..."
                    value={contactSearch}
                    onChange={e => { setContactSearch(e.target.value); setContactDropdown(true); }}
                    onFocus={() => setContactDropdown(true)}
                    onBlur={() => setTimeout(() => setContactDropdown(false), 150)}
                  />
                </div>
                )}
                {contactDropdown && !form.contact_id && (
                <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {contacts
                    .filter(c => {
                      const q = contactSearch.toLowerCase();
                      return !q || c.full_name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q);
                    })
                    .map(c => (
                      <button key={c.id} type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors"
                        onMouseDown={() => { handleContactChange(c.id); setContactSearch(""); setContactDropdown(false); }}>
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{c.company || c.full_name}</p>
                          {c.company && c.full_name && <p className="text-xs text-muted-foreground">{c.full_name}</p>}
                        </div>
                      </button>
                    ))
                  }
                    {contacts.filter(c => {
                      const q = contactSearch.toLowerCase();
                      return !q || c.full_name?.toLowerCase().includes(q) || c.company?.toLowerCase().includes(q);
                    }).length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">No contacts found</p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date} onChange={e => set("start_date", e.target.value)} />
              <DateQuickButtons value={form.start_date} onChange={v => set("start_date", v)} />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input type="date" value={form.end_date} onChange={e => set("end_date", e.target.value)} />
              <DateQuickButtons value={form.end_date} onChange={v => set("end_date", v)} baseDate={form.start_date} />
            </div>
            <div className="space-y-1">
              <Label>Budget</Label>
              <Input type="number" value={form.budget} onChange={e => set("budget", e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select value={form.currency} onValueChange={v => set("currency", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["USD","EUR","GBP","AED","MXN","BRL"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Location / Site</Label>
              <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Site address or name" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Google Maps Link</Label>
              <div className="flex gap-2">
                <Input
                  value={form.maps_link}
                  onChange={e => handleMapsLink(e.target.value)}
                  placeholder="Paste a Google Maps URL..."
                />
                {form.maps_link && (
                  <a href={form.maps_link} target="_blank" rel="noopener noreferrer">
                    <Button type="button" variant="outline" size="icon" title="Open in Google Maps">
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </a>
                )}
              </div>
              {form.location_lat && form.location_lng ? (
                <div className="mt-2 rounded-lg overflow-hidden border border-border">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40 border-b border-border text-xs text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5 text-primary" />
                    <span className="font-mono">{form.location_lat.toFixed(6)}, {form.location_lng.toFixed(6)}</span>
                  </div>
                  <iframe
                    title="Project location"
                    width="100%"
                    height="200"
                    style={{ border: 0 }}
                    loading="lazy"
                    src={`https://www.google.com/maps?q=${form.location_lat},${form.location_lng}&z=15&output=embed`}
                  />
                </div>
              ) : resolvingMaps ? (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Resolving link…
                </p>
              ) : form.maps_link ? (
                <p className="text-xs text-amber-600 mt-1">⚠ Could not extract coordinates from this URL. Make sure it's a standard Google Maps link.</p>
              ) : null}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="Project scope..." />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Tags</Label>
              <Input value={form.tags} onChange={e => set("tags", e.target.value)} placeholder="crane, tower, rental" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Internal notes..." />
            </div>
          </div>
          {project?.id && (
            <HistoryNotesPanel entityName="ProjectNote" idField="project_id" recordId={project.id} />
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : project ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}