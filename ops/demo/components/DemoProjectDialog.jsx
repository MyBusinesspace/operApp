import { useEffect, useState } from "react";
import { Search, User, X, ExternalLink, MapPin } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import DateQuickButtons from "@/components/shared/DateQuickButtons";

const EMPTY = {
  name: "",
  reference: "",
  type: "",
  status: "",
  contact_id: "",
  contact_name: "",
  start_date: "",
  end_date: "",
  budget: "",
  currency: "USD",
  location: "",
  maps_link: "",
  description: "",
  notes: "",
  tags: "",
};

const CATEGORIES = [
  "Rental",
  "Installation",
  "Maintenance",
  "Consulting",
  "Construction",
  "Other",
];
const STATUSES = ["Draft", "Active", "On Hold", "Completed", "Cancelled"];

export default function DemoProjectDialog({
  open,
  onClose,
  project,
  contacts = [],
}) {
  const [form, setForm] = useState(EMPTY);
  const [contactSearch, setContactSearch] = useState("");
  const [contactDropdown, setContactDropdown] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(
        project
          ? { ...EMPTY, ...project, budget: project.budget ?? "" }
          : { ...EMPTY }
      );
      setContactSearch("");
      setContactDropdown(false);
    }
  }, [project, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleContactChange = (cid) => {
    const c = contacts.find((x) => x.id === cid);
    set("contact_id", cid === "__none__" ? "" : cid);
    set("contact_name", c ? c.company || c.full_name : "");
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onClose();
  };

  const filteredContacts = contacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return (
      !q ||
      c.full_name?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Project Name *</Label>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                placeholder="e.g. Rental Tower Crane S52"
              />
            </div>
            <div className="space-y-1">
              <Label>Reference</Label>
              <div className="px-3 py-2 rounded-md border border-input bg-muted/40 text-sm font-mono text-muted-foreground">
                {form.reference || "—"}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Select
                value={form.type || undefined}
                onValueChange={(v) => set("type", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select
                value={form.status || undefined}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
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
                        <p className="text-sm font-medium leading-tight">
                          {form.contact_name}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleContactChange("__none__");
                        setContactSearch("");
                      }}
                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
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
                      onChange={(e) => {
                        setContactSearch(e.target.value);
                        setContactDropdown(true);
                      }}
                      onFocus={() => setContactDropdown(true)}
                      onBlur={() =>
                        setTimeout(() => setContactDropdown(false), 150)
                      }
                    />
                  </div>
                )}
                {contactDropdown && !form.contact_id && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors"
                        onMouseDown={() => {
                          handleContactChange(c.id);
                          setContactSearch("");
                          setContactDropdown(false);
                        }}
                      >
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium">
                            {c.company || c.full_name}
                          </p>
                          {c.company && c.full_name && (
                            <p className="text-xs text-muted-foreground">
                              {c.full_name}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                    {filteredContacts.length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">
                        No contacts found
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Start Date</Label>
              <Input
                type="date"
                value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
              />
              <DateQuickButtons
                value={form.start_date}
                onChange={(v) => set("start_date", v)}
              />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <Input
                type="date"
                value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
              />
              <DateQuickButtons
                value={form.end_date}
                onChange={(v) => set("end_date", v)}
                baseDate={form.start_date}
              />
            </div>
            <div className="space-y-1">
              <Label>Budget</Label>
              <Input
                type="number"
                value={form.budget}
                onChange={(e) => set("budget", e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>Currency</Label>
              <Select
                value={form.currency}
                onValueChange={(v) => set("currency", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["USD", "EUR", "GBP", "AED", "MXN", "BRL"].map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Location / Site</Label>
              <Input
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
                placeholder="Site address or name"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Google Maps Link</Label>
              <div className="flex gap-2">
                <Input
                  value={form.maps_link}
                  onChange={(e) => set("maps_link", e.target.value)}
                  placeholder="Paste a Google Maps URL..."
                />
                {form.maps_link && (
                  <a
                    href={form.maps_link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Open in Google Maps"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </Button>
                  </a>
                )}
              </div>
              {form.maps_link && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Demo — map preview view only
                </p>
              )}
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
                placeholder="Project scope..."
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Tags</Label>
              <Input
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                placeholder="crane, tower, rental"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder="Internal notes..."
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{project ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
