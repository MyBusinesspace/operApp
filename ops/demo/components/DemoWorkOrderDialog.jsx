import { useEffect, useState } from "react";
import {
  Building2,
  FolderKanban,
  Package,
  Search,
  X,
} from "lucide-react";
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
  title: "",
  reference: "",
  status: "",
  priority: "Medium",
  type: "",
  project_id: "",
  project_name: "",
  contact_id: "",
  contact_name: "",
  asset_id: "",
  asset_name: "",
  assigned_to: "",
  scheduled_date: "",
  due_date: "",
  location: "",
  description: "",
  notes: "",
};

const CATEGORIES = ["Maintenance", "Repair", "Inspection", "Installation", "Other"];
const STATUSES = ["Active", "On Hold", "Archived"];

export default function DemoWorkOrderDialog({
  open,
  onClose,
  workOrder,
  contacts = [],
  projects = [],
  assets = [],
}) {
  const [form, setForm] = useState(EMPTY);
  const [contactSearch, setContactSearch] = useState("");
  const [contactDropdown, setContactDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectDropdown, setProjectDropdown] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [assetDropdown, setAssetDropdown] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(workOrder ? { ...EMPTY, ...workOrder } : { ...EMPTY, reference: "WO-DEMO" });
    setContactSearch("");
    setContactDropdown(false);
    setProjectSearch("");
    setProjectDropdown(false);
    setAssetSearch("");
    setAssetDropdown(false);
  }, [workOrder, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleContactChange = (cid) => {
    if (cid === "__none__") {
      set("contact_id", "");
      set("contact_name", "");
      return;
    }
    const c = contacts.find((x) => x.id === cid);
    set("contact_id", cid);
    set("contact_name", c ? c.company || c.full_name : "");
  };

  const handleProjectChange = (pid) => {
    if (pid === "__none__") {
      set("project_id", "");
      set("project_name", "");
      return;
    }
    const p = projects.find((x) => x.id === pid);
    setForm((f) => ({
      ...f,
      project_id: pid,
      project_name: p?.name || "",
      contact_id: p?.contact_id || f.contact_id,
      contact_name: p?.contact_name || f.contact_name,
      location: p?.location || f.location,
    }));
  };

  const handleAssetChange = (aid) => {
    if (aid === "__none__") {
      set("asset_id", "");
      set("asset_name", "");
      return;
    }
    const a = assets.find((x) => x.id === aid);
    setForm((f) => ({
      ...f,
      asset_id: aid,
      asset_name: a?.name || "",
      project_id: a?.project_id || f.project_id,
      project_name: a?.project_name || f.project_name,
    }));
  };

  const filteredContacts = contacts.filter((c) => {
    const q = contactSearch.toLowerCase();
    return (
      !q ||
      c.full_name?.toLowerCase().includes(q) ||
      c.company?.toLowerCase().includes(q)
    );
  });

  const filteredProjects = projects.filter((p) => {
    const q = projectSearch.toLowerCase();
    return (
      !q ||
      p.name?.toLowerCase().includes(q) ||
      p.reference?.toLowerCase().includes(q)
    );
  });

  const filteredAssets = assets.filter((a) => {
    const q = assetSearch.toLowerCase();
    return (
      !q ||
      a.name?.toLowerCase().includes(q) ||
      a.reference?.toLowerCase().includes(q)
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
          <DialogTitle>
            {workOrder ? "Edit Work Order" : "New Work Order"}
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
          }}
          className="space-y-4 pt-1"
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Title *</Label>
              <Input
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                required
                readOnly={!!workOrder}
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
              <Select value={form.type || ""} onValueChange={(v) => set("type", v)}>
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
              <Select value={form.status || ""} onValueChange={(v) => set("status", v)}>
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
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select
                value={form.priority || "Medium"}
                onValueChange={(v) => set("priority", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Low", "Medium", "High", "Urgent"].map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Linked Company</Label>
              <div className="relative">
                {form.contact_id ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium">{form.contact_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleContactChange("__none__")}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search company..."
                      value={contactSearch}
                      onChange={(e) => {
                        setContactSearch(e.target.value);
                        setContactDropdown(true);
                      }}
                      onFocus={() => setContactDropdown(true)}
                      onBlur={() => setTimeout(() => setContactDropdown(false), 150)}
                    />
                  </div>
                )}
                {contactDropdown && !form.contact_id && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredContacts.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2"
                        onMouseDown={() => {
                          handleContactChange(c.id);
                          setContactDropdown(false);
                        }}
                      >
                        <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium">
                          {c.company || c.full_name}
                        </p>
                      </button>
                    ))}
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
                    <button
                      type="button"
                      onClick={() => handleProjectChange("__none__")}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search project..."
                      value={projectSearch}
                      onChange={(e) => {
                        setProjectSearch(e.target.value);
                        setProjectDropdown(true);
                      }}
                      onFocus={() => setProjectDropdown(true)}
                      onBlur={() => setTimeout(() => setProjectDropdown(false), 150)}
                    />
                  </div>
                )}
                {projectDropdown && !form.project_id && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2"
                        onMouseDown={() => {
                          handleProjectChange(p.id);
                          setProjectDropdown(false);
                        }}
                      >
                        <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium">{p.name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Linked Asset</Label>
              <div className="relative">
                {form.asset_id ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium">{form.asset_name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAssetChange("__none__")}
                      className="p-1 rounded hover:bg-muted text-muted-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Search asset..."
                      value={assetSearch}
                      onChange={(e) => {
                        setAssetSearch(e.target.value);
                        setAssetDropdown(true);
                      }}
                      onFocus={() => setAssetDropdown(true)}
                      onBlur={() => setTimeout(() => setAssetDropdown(false), 150)}
                    />
                  </div>
                )}
                {assetDropdown && !form.asset_id && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredAssets.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2"
                        onMouseDown={() => {
                          handleAssetChange(a.id);
                          setAssetDropdown(false);
                        }}
                      >
                        <Package className="w-4 h-4 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium">{a.name}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label>Assigned To</Label>
              <Input
                value={form.assigned_to}
                onChange={(e) => set("assigned_to", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Location</Label>
              <Input
                value={form.location}
                onChange={(e) => set("location", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Scheduled</Label>
              <Input
                type="date"
                value={form.scheduled_date || ""}
                onChange={(e) => set("scheduled_date", e.target.value)}
              />
              <DateQuickButtons
                baseDate={form.scheduled_date}
                onChange={(v) => set("scheduled_date", v)}
              />
            </div>
            <div className="space-y-1">
              <Label>Due Date</Label>
              <Input
                type="date"
                value={form.due_date || ""}
                onChange={(e) => set("due_date", e.target.value)}
              />
              <DateQuickButtons
                baseDate={form.due_date}
                onChange={(v) => set("due_date", v)}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Textarea
                value={form.description || ""}
                onChange={(e) => set("description", e.target.value)}
                rows={2}
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea
                value={form.notes || ""}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" title="Demo — view only">
              {workOrder ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
