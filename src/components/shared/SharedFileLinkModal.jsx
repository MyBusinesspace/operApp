import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";

/**
 * Cross-link an existing SharedFile to one additional scope (Asset / Work Order /
 * Project / Contact). Adds a horizontal link on the same record — no re-upload,
 * no duplication. The file keeps its original ascending chain.
 *
 * Props:
 * - open, onClose
 * - file: the SharedFile record
 * - context: the page context { contact_id, project_id, work_order_id, asset_id, ... }
 * - onSaved: callback with the patched file
 */

const SCOPES = [
  { key: "work_order", label: "Work Order", entity: "WorkOrder", idField: "work_order_id", nameField: "work_order_name", pick: "title" },
  { key: "asset",      label: "Asset",      entity: "Asset",      idField: "asset_id",      nameField: "asset_name",      pick: "name" },
  { key: "project",    label: "Project",    entity: "Project",    idField: "project_id",    nameField: "project_name",    pick: "name" },
  { key: "contact",    label: "Client / Contact", entity: "Contact", idField: "contact_id",  nameField: "contact_name",    pick: "full_name" },
];

// Primary scope of the current page — never offered as a link target (it's the vertical)
const PRIMARY = { work_order_id: "work_order", project_id: "project", asset_id: "asset", contact_id: "contact" };

export default function SharedFileLinkModal({ open, onClose, file, context, onSaved }) {
  const { toast } = useToast();
  const [target, setTarget] = useState("");   // scope key
  const [records, setRecords] = useState([]);
  const [recordId, setRecordId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Available targets: exclude the page's primary scope + scopes already linked on the file
  const primaryKey = PRIMARY[Object.keys(PRIMARY).find(k => context?.[k])];
  const available = SCOPES.filter(s =>
    s.key !== primaryKey &&
    !(file && file[s.idField])
  );

  useEffect(() => {
    if (!open) { setTarget(""); setRecordId(""); setRecords([]); return; }
  }, [open]);

  // Lazy-load the list for the chosen target scope only
  useEffect(() => {
    if (!target) { setRecords([]); setRecordId(""); return; }
    const cfg = SCOPES.find(s => s.key === target);
    if (!cfg) return;
    setLoading(true);
    base44.entities[cfg.entity].list(cfg.pick, 300)
      .then(all => setRecords(all || []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [target]);

  const handleSave = async () => {
    if (!file || !target || !recordId) return;
    const cfg = SCOPES.find(s => s.key === target);
    const rec = records.find(r => r.id === recordId);
    if (!cfg || !rec) return;
    setSaving(true);
    try {
      const patch = { [cfg.idField]: rec.id, [cfg.nameField]: rec[cfg.pick] };
      await base44.entities.SharedFile.update(file.id, patch);
      const updated = { ...file, ...patch };
      toast({ title: `File linked to ${cfg.label}` });
      onSaved?.(updated);
      onClose?.();
    } catch (e) {
      toast({ title: "Could not link file", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-primary" /> Link file to another scope
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-1">
          Adds a cross-link on the same file record — it will also appear under that entity&rsquo;s Files tab. No re-upload, no duplication.
        </p>

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Link to</Label>
            <Select value={target} onValueChange={setTarget} disabled={available.length === 0}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue placeholder={available.length ? "Choose a scope" : "Nothing to link"} />
              </SelectTrigger>
              <SelectContent>
                {available.map(s => (
                  <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {target && (
            <div>
              <Label className="text-xs">Select record</Label>
              <Select value={recordId} onValueChange={setRecordId} disabled={loading || records.length === 0}>
                <SelectTrigger className="h-8 text-xs mt-1">
                  <SelectValue placeholder={loading ? "Loading..." : (records.length ? "Choose..." : "No records")} />
                </SelectTrigger>
                <SelectContent>
                  {records.map(r => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r[SCOPES.find(s => s.key === target).pick]}
                      {r.reference ? ` · ${r.reference}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !target || !recordId} className="gap-1.5">
            <Link2 className="w-3.5 h-3.5" />
            {saving ? "Linking..." : "Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}