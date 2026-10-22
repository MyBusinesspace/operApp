import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Shield, Lock, DollarSign, FileText, Pencil, ClipboardList, Briefcase,
  User, Eye, Users, Settings, Wrench, Truck, HardHat, Crown, Star, Zap,
  Building2, Cpu, Heart,
} from "lucide-react";
import { ROLE_ICON_OPTIONS } from "@/lib/rolePermissionsConfig";

const ICONS = {
  Shield, Lock, DollarSign, FileText, Pencil, ClipboardList, Briefcase,
  User, Eye, Users, Settings, Wrench, Truck, HardHat, Crown, Star, Zap,
  Building2, Cpu, Heart,
};

export default function RoleEditModal({ open, onClose, onSave, role, existingKeys }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("Shield");
  const [color, setColor] = useState("#6366f1");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const savingRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setName(role?.name || "");
    setIcon(role?.icon || "Shield");
    setColor(role?.color || "#6366f1");
    setDescription(role?.description || "");
  }, [open, role]);

  const handleSave = async () => {
    if (!name.trim() || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), icon, color, description: description.trim() });
    } catch (e) {
      setError(e.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{role ? "Edit Role" : "Add Role"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Field Supervisor" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Icon</Label>
            <div className="grid grid-cols-10 gap-1.5">
              {ROLE_ICON_OPTIONS.map(ic => {
                const Ic = ICONS[ic] || Shield;
                const active = ic === icon;
                return (
                  <button key={ic} type="button"
                    onClick={() => setIcon(ic)}
                    className={`flex items-center justify-center h-8 w-8 rounded-md border transition-colors ${
                      active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                    }`}>
                    <Ic className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={color} onChange={e => setColor(e.target.value)}
                className="h-9 w-12 rounded-md border border-input cursor-pointer bg-transparent p-0.5" />
              <Input value={color} onChange={e => setColor(e.target.value)} className="w-28" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              placeholder="Short summary of what this role can do" />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? "Saving..." : role ? "Save Changes" : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}