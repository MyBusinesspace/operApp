import { useEffect, useState } from "react";
import {
  Search,
  User,
  X,
  FolderKanban,
  ClipboardList,
  Upload,
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

const EMPTY = {
  name: "",
  reference: "",
  category: "",
  status: "Available",
  group_id: "",
  contact_id: "",
  contact_name: "",
  project_id: "",
  project_name: "",
  work_order_ids: [],
  work_order_names: [],
  purchase_date: "",
  purchase_price: "",
  currency: "USD",
  notes: "",
};

const DEFAULT_CATEGORIES = [
  "Crane",
  "Hoist",
  "Platform",
  "Vehicle",
  "Tool",
  "Equipment",
  "Other",
];

function FieldRow({ label, required, children, fullWidth }) {
  return (
    <div className={fullWidth ? "sm:col-span-2" : ""}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
        <Label className="sm:w-32 sm:shrink-0 text-xs sm:text-sm text-muted-foreground sm:text-foreground sm:text-right">
          {label}
          {required && <span className="text-destructive"> *</span>}
        </Label>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

export default function DemoAssetDialog({
  open,
  onClose,
  asset,
  contacts = [],
  projects = [],
  workOrders = [],
  groups = [],
}) {
  const [form, setForm] = useState(EMPTY);
  const [contactSearch, setContactSearch] = useState("");
  const [contactDropdown, setContactDropdown] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [projectDropdown, setProjectDropdown] = useState(false);
  const [woSearch, setWoSearch] = useState("");
  const [woDropdown, setWoDropdown] = useState(false);

  useEffect(() => {
    if (open) {
      if (asset) {
        const woIds =
          Array.isArray(asset.work_order_ids) && asset.work_order_ids.length
            ? [...asset.work_order_ids]
            : [];
        const woNames =
          Array.isArray(asset.work_order_names) && asset.work_order_names.length
            ? [...asset.work_order_names]
            : [];
        setForm({
          ...EMPTY,
          ...asset,
          work_order_ids: woIds,
          work_order_names: woNames,
          purchase_price: asset.purchase_price ?? "",
        });
      } else {
        setForm({ ...EMPTY });
      }
      setContactSearch("");
      setContactDropdown(false);
      setProjectSearch("");
      setProjectDropdown(false);
      setWoSearch("");
      setWoDropdown(false);
    }
  }, [asset, open]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleContactChange = (cid) => {
    const c = contacts.find((x) => x.id === cid);
    setForm((f) => ({
      ...f,
      contact_id: cid === "__none__" ? "" : cid,
      contact_name: c ? c.company || c.full_name : "",
    }));
  };

  const handleProjectChange = (pid) => {
    const p = projects.find((x) => x.id === pid);
    setForm((f) => ({
      ...f,
      project_id: pid === "__none__" ? "" : pid,
      project_name: p ? p.name : "",
    }));
  };

  const selectedWOIds = Array.isArray(form.work_order_ids)
    ? form.work_order_ids
    : [];

  const handleWOAdd = (wid) => {
    const w = workOrders.find((x) => x.id === wid);
    if (!w || selectedWOIds.includes(wid)) return;
    setForm((f) => ({
      ...f,
      work_order_ids: [...(f.work_order_ids || []), wid],
      work_order_names: [...(f.work_order_names || []), w.title],
    }));
    setWoSearch("");
  };

  const handleWORemove = (wid) => {
    setForm((f) => {
      const idx = (f.work_order_ids || []).indexOf(wid);
      return {
        ...f,
        work_order_ids: (f.work_order_ids || []).filter((id) => id !== wid),
        work_order_names: (f.work_order_names || []).filter((_, i) => i !== idx),
      };
    });
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

  const filteredWO = workOrders.filter((w) => {
    if (selectedWOIds.includes(w.id)) return false;
    const q = woSearch.toLowerCase();
    return (
      !q ||
      w.title?.toLowerCase().includes(q) ||
      w.reference?.toLowerCase().includes(q)
    );
  });

  const categoryOpts = (() => {
    const names = [...DEFAULT_CATEGORIES];
    if (form.category && !names.includes(form.category)) {
      names.unshift(form.category);
    }
    return names;
  })();

  const handleSubmit = (e) => {
    e.preventDefault();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{asset ? "Edit Asset" : "New Asset"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-2.5 pt-1 min-w-0">
          <div className="space-y-2.5 min-w-0">
            <FieldRow label="Asset Name" required>
              <Input
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                required
                placeholder="e.g. Tower Crane Liebherr 280 EC"
              />
            </FieldRow>
            <FieldRow label="Reference">
              <div className="px-3 py-2 rounded-md border border-input bg-muted/40 text-sm font-mono text-muted-foreground">
                {form.reference || "—"}
              </div>
            </FieldRow>
            <FieldRow label="Status">
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "Available",
                    "In Use",
                    "Under Maintenance",
                    "Retired",
                  ].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Category">
              <Select
                value={form.category || "__none__"}
                onValueChange={(v) => set("category", v === "__none__" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No category</SelectItem>
                  {categoryOpts.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Group">
              <Select
                value={form.group_id || "__none__"}
                onValueChange={(v) =>
                  set("group_id", v === "__none__" ? "" : v)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No group</SelectItem>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-border">
            <FieldRow label="Linked Contact" fullWidth>
              <div className="relative">
                {form.contact_id ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium leading-tight">
                        {form.contact_name}
                      </p>
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
                      placeholder="Search contact..."
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
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
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
            </FieldRow>

            <FieldRow label="Linked Project" fullWidth>
              <div className="relative">
                {form.project_id ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30">
                    <div className="flex items-center gap-2">
                      <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-sm font-medium leading-tight">
                          {form.project_name}
                        </p>
                        {projects.find((p) => p.id === form.project_id)
                          ?.reference && (
                          <p className="text-xs text-muted-foreground font-mono">
                            {
                              projects.find((p) => p.id === form.project_id)
                                ?.reference
                            }
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleProjectChange("__none__");
                        setProjectSearch("");
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
                      placeholder="Search project..."
                      value={projectSearch}
                      onChange={(e) => {
                        setProjectSearch(e.target.value);
                        setProjectDropdown(true);
                      }}
                      onFocus={() => setProjectDropdown(true)}
                      onBlur={() =>
                        setTimeout(() => setProjectDropdown(false), 150)
                      }
                    />
                  </div>
                )}
                {projectDropdown && !form.project_id && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                    {filteredProjects.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors"
                        onMouseDown={() => {
                          handleProjectChange(p.id);
                          setProjectSearch("");
                          setProjectDropdown(false);
                        }}
                      >
                        <FolderKanban className="w-4 h-4 text-muted-foreground shrink-0" />
                        <div>
                          <p className="text-sm font-medium">{p.name}</p>
                          {p.reference && (
                            <p className="text-xs text-muted-foreground font-mono">
                              {p.reference}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                    {filteredProjects.length === 0 && (
                      <p className="px-3 py-2 text-sm text-muted-foreground">
                        No projects found
                      </p>
                    )}
                  </div>
                )}
              </div>
            </FieldRow>

            <FieldRow label="Linked Work Orders" fullWidth>
              <div className="space-y-1.5">
                {selectedWOIds.length > 0 && (
                  <div className="space-y-1.5">
                    {selectedWOIds.map((wid, i) => {
                      const w = workOrders.find((x) => x.id === wid);
                      return (
                        <div
                          key={wid}
                          className="flex items-center justify-between px-3 py-2 rounded-md border border-input bg-muted/30"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium leading-tight truncate">
                                {(form.work_order_names || [])[i] || w?.title}
                              </p>
                              {w?.reference && (
                                <p className="text-xs text-muted-foreground font-mono">
                                  {w.reference}
                                </p>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleWORemove(wid)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search work order..."
                    value={woSearch}
                    onChange={(e) => {
                      setWoSearch(e.target.value);
                      setWoDropdown(true);
                    }}
                    onFocus={() => setWoDropdown(true)}
                    onBlur={() => setTimeout(() => setWoDropdown(false), 150)}
                  />
                  {woDropdown && (
                    <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-lg max-h-40 overflow-y-auto">
                      {filteredWO.map((w) => (
                        <button
                          key={w.id}
                          type="button"
                          className="w-full px-3 py-2 text-left hover:bg-accent flex items-center gap-2 transition-colors"
                          onMouseDown={() => handleWOAdd(w.id)}
                        >
                          <ClipboardList className="w-4 h-4 text-muted-foreground shrink-0" />
                          <div>
                            <p className="text-sm font-medium">{w.title}</p>
                            {w.reference && (
                              <p className="text-xs text-muted-foreground font-mono">
                                {w.reference}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                      {filteredWO.length === 0 && (
                        <p className="px-3 py-2 text-sm text-muted-foreground">
                          No work orders found
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </FieldRow>
          </div>

          <div className="space-y-2.5 pt-2 border-t border-border">
            <FieldRow label="Purchase Price">
              <Input
                type="number"
                value={form.purchase_price}
                onChange={(e) => set("purchase_price", e.target.value)}
                placeholder="0.00"
              />
            </FieldRow>
            <FieldRow label="Currency">
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
            </FieldRow>
            <FieldRow label="Purchase Date">
              <Input
                type="date"
                value={form.purchase_date}
                onChange={(e) => set("purchase_date", e.target.value)}
              />
            </FieldRow>
          </div>

          <div className="pt-2 border-t border-border">
            <FieldRow label="Notes" fullWidth>
              <Textarea
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                rows={2}
                placeholder="Internal notes..."
                className="break-all"
              />
            </FieldRow>
          </div>

          <div className="pt-2 border-t border-border">
            <Label className="text-sm font-medium">Attached Files</Label>
            {asset?.id ? (
              <div className="mt-2">
                <div className="flex items-center justify-center gap-2 px-3 py-4 rounded-md border border-dashed border-input text-sm text-muted-foreground cursor-default">
                  <Upload className="w-4 h-4" /> Demo — view only
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-2">
                Save the asset first to attach files.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{asset ? "Update" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
