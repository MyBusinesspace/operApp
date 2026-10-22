import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Building2,
  ClipboardList,
  FileText,
  FolderKanban,
  Search,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function DemoQuickDraftTaskModal({
  open,
  onClose,
  projects = [],
  contacts = [],
  workOrders = [],
  tasks = [],
}) {
  const [reference, setReference] = useState("TSK-QUICK");
  const [title, setTitle] = useState("");
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setSearch("");
    setSelectedProject(null);
    setSelectedWorkOrder(null);
    setShowResults(false);
    setReference(`TSK-${String(1000 + (tasks.length || 0) + 1)}`);
  }, [open, tasks.length]);

  const workOrdersForProject = useMemo(() => {
    if (!selectedProject?.id) return [];
    return workOrders.filter((w) => w.project_id === selectedProject.id);
  }, [workOrders, selectedProject]);

  const existingTasks = useMemo(() => {
    if (!selectedProject) return [];
    let filtered = tasks.filter(
      (t) =>
        (selectedProject.id
          ? t.project_id === selectedProject.id
          : t.contact_id === selectedProject.contact_id) &&
        (t.status === "Scheduled" || t.status === "Not Completed")
    );
    if (selectedWorkOrder) {
      filtered = filtered.filter((t) => t.work_order_id === selectedWorkOrder.id);
    }
    return filtered;
  }, [tasks, selectedProject, selectedWorkOrder]);

  const results = (() => {
    const q = search.toLowerCase().trim();
    const projMatches = projects
      .filter(
        (p) =>
          !q ||
          p.name?.toLowerCase().includes(q) ||
          p.reference?.toLowerCase().includes(q) ||
          p.contact_name?.toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map((p) => ({
        type: "project",
        id: p.id,
        name: p.name,
        subName: p.reference,
        project: p,
      }));
    const contactMatches = contacts
      .filter(
        (c) =>
          !q ||
          c.full_name?.toLowerCase().includes(q) ||
          c.company?.toLowerCase().includes(q) ||
          c.reference?.toLowerCase().includes(q)
      )
      .slice(0, 6)
      .map((c) => ({
        type: "contact",
        id: c.id,
        name: c.company || c.full_name,
        subName: c.reference,
        contact: c,
      }));
    return [...projMatches, ...contactMatches];
  })();

  const handleSelectResult = (item) => {
    if (item.type === "project") {
      const p = item.project;
      setSelectedProject({
        id: p.id,
        name: p.name,
        reference: p.reference,
        contact_id: p.contact_id || "",
        contact_name: p.contact_name || "",
      });
    } else {
      const c = item.contact;
      setSelectedProject({
        id: null,
        name: c.company || c.full_name,
        reference: c.reference,
        contact_id: c.id,
        contact_name: c.company || c.full_name,
      });
    }
    setSearch("");
    setShowResults(false);
    setSelectedWorkOrder(null);
  };

  const statusBadge = (status) => {
    const styles = {
      Scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400",
      "Not Completed":
        "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    };
    return (
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          styles[status] || "bg-muted text-muted-foreground"
        }`}
      >
        {status}
      </span>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" /> Quick Task
          </DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onClose();
          }}
          className="space-y-4 pt-1"
        >
          <div className="space-y-1.5">
            <Label>Reference</Label>
            <div className="px-3 py-2 rounded-md border border-input bg-muted/40 text-sm font-mono text-muted-foreground">
              {reference || "—"}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Linked Project / Customer *</Label>
            {selectedProject ? (
              <div className="flex items-center justify-between px-3 py-2 rounded-md border border-border bg-muted/30">
                <div className="flex items-center gap-2 min-w-0">
                  {selectedProject.id ? (
                    <FolderKanban className="w-4 h-4 text-primary shrink-0" />
                  ) : (
                    <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {selectedProject.name}
                    </p>
                    {selectedProject.reference && (
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {selectedProject.reference}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProject(null);
                    setSelectedWorkOrder(null);
                  }}
                  className="text-muted-foreground hover:text-destructive shrink-0 ml-2"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  className="pl-9"
                  placeholder="Search project or customer…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setShowResults(true);
                  }}
                  onFocus={() => setShowResults(true)}
                  onBlur={() => setTimeout(() => setShowResults(false), 150)}
                />
                {showResults && results.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {results.map((item) => (
                      <button
                        key={`${item.type}-${item.id}`}
                        type="button"
                        onMouseDown={() => handleSelectResult(item)}
                        className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors flex items-center gap-2"
                      >
                        {item.type === "project" ? (
                          <FolderKanban className="w-3.5 h-3.5 text-primary shrink-0" />
                        ) : (
                          <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {item.name}
                          </p>
                          {item.subName && (
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {item.subName}
                            </p>
                          )}
                        </div>
                        <span className="ml-auto text-[10px] uppercase font-semibold text-muted-foreground/60 shrink-0">
                          {item.type === "project" ? "Project" : "Customer"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedProject?.id && workOrdersForProject.length > 0 && (
            <div className="space-y-1.5">
              <Label>Work Order (optional)</Label>
              <Select
                value={selectedWorkOrder?.id || "none"}
                onValueChange={(val) => {
                  if (val === "none") setSelectedWorkOrder(null);
                  else {
                    const wo = workOrdersForProject.find((w) => w.id === val);
                    if (wo)
                      setSelectedWorkOrder({
                        id: wo.id,
                        title: wo.title,
                        reference: wo.reference,
                      });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a work order…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— No work order —</SelectItem>
                  {workOrdersForProject.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.reference ? `${w.reference} · ` : ""}
                      {w.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {selectedProject && (
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Existing tasks
                <span className="text-xs font-normal text-muted-foreground">
                  ({existingTasks.length} scheduled / not completed)
                </span>
              </Label>
              {existingTasks.length > 0 ? (
                <div className="rounded-md border border-border bg-muted/20 max-h-40 overflow-y-auto divide-y divide-border">
                  {existingTasks.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 px-3 py-2">
                      <ClipboardList className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground truncate">{t.title}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">
                          {t.reference}
                          {t.planning_date ? ` · ${t.planning_date}` : ""}
                        </p>
                      </div>
                      {statusBadge(t.status)}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground px-3 py-2 rounded-md border border-dashed border-border">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  No existing Scheduled / Not Completed tasks for this selection.
                </div>
              )}
              {existingTasks.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  If the task you need is already listed above, close this modal and
                  use it instead of creating a duplicate.
                </p>
              )}
            </div>
          )}

          {selectedProject && (
            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                placeholder="Brief task description…"
              />
            </div>
          )}

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!title.trim() || !selectedProject}
              title="Demo — view only"
            >
              Create Task
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
