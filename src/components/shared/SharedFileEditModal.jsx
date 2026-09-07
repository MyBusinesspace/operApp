import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateFileReferencePrefix } from "@/lib/fileNumbering";

const NONE = "__none__";

/**
 * Edit modal for a SharedFile record — description, post date and file type.
 * Changing the file type regenerates the reference by swapping the type prefix.
 *
 * Props:
 * - open, onClose
 * - file: the SharedFile record
 * - scope: FileType entity_scope to filter the type list
 * - onSaved: callback with the patched file
 */
export default function SharedFileEditModal({ open, onClose, file, scope, onSaved }) {
  const [description, setDescription] = useState("");
  const [postDate, setPostDate] = useState("");
  const [typeId, setTypeId] = useState("");
  const [fileTypes, setFileTypes] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (file) {
      setDescription(file.description || "");
      setPostDate(file.post_date || "");
      setTypeId(file.file_type_id || "");
    }
  }, [file]);

  useEffect(() => {
    base44.entities.FileType.list("name", 200).then(all => {
      setFileTypes(all || []);
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    if (!file) return;
    setSaving(true);
    try {
      const clearing = typeId === NONE || !typeId;
      const ft = clearing ? null : fileTypes.find(t => t.id === typeId);
      const typePrefix = ft?.reference_prefix || "";
      const newRef = updateFileReferencePrefix(file.reference, typePrefix);
      await base44.entities.SharedFile.update(file.id, {
        description: description || undefined,
        post_date: postDate || undefined,
        file_type_id: ft?.id || null,
        file_type_name: ft?.name || "",
        reference: newRef,
      });
      onSaved?.({
        ...file,
        description: description || "",
        post_date: postDate || "",
        file_type_id: ft?.id || null,
        file_type_name: ft?.name || "",
        reference: newRef,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose?.(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit File</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">File name</Label>
            <p className="text-sm text-muted-foreground truncate mt-1">{file?.file_name}</p>
          </div>
          <div>
            <Label className="text-xs">File type</Label>
            <Select value={typeId || (fileTypes.length ? NONE : "")} onValueChange={setTypeId} disabled={fileTypes.length === 0}>
              <SelectTrigger className="h-8 text-xs mt-1">
                <SelectValue placeholder="type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE} className="text-xs text-muted-foreground">— No type —</SelectItem>
                {fileTypes.map(ft => (
                  <SelectItem key={ft.id} value={ft.id} className="text-xs">
                    {ft.name}{ft.reference_prefix ? ` (${ft.reference_prefix})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Post date</Label>
            <Input type="date" value={postDate} onChange={e => setPostDate(e.target.value)} className="h-8 text-xs mt-1" />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              placeholder="Optional description / label" className="text-sm mt-1" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-1.5">
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}