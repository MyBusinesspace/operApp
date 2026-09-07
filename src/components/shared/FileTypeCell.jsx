import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { updateFileReferencePrefix } from "@/lib/fileNumbering";

const NONE = "__none__";

/**
 * Inline-editable file type cell for file tables.
 * Shows the file type name, or "type" placeholder when none is set.
 * On change, updates file_type_id, file_type_name, and regenerates the
 * reference by swapping only the type prefix segment.
 *
 * Uses local state for the select value so the UI updates instantly
 * without triggering a full server refresh.
 *
 * Props:
 * - file: the file record (needs id, reference, file_type_id, file_type_name)
 * - entityName: e.g. "AssetFile"
 * - onUpdated: callback receiving the patched file object (no server refetch needed)
 */
const SCOPE_MAP = {
  ContactFile: "Contact",
  ProjectFile: "Project",
  AssetFile: "Asset",
  WorkOrderFile: "WorkOrder",
  OrganizationFile: "Organization",
};

export default function FileTypeCell({ file, entityName, onUpdated, scope }) {
  const [fileTypes, setFileTypes] = useState([]);
  const [updating, setUpdating] = useState(false);
  const [localTypeId, setLocalTypeId] = useState(file.file_type_id || "");

  useEffect(() => {
    base44.entities.FileType.list("name", 200).then(all => {
      setFileTypes(all || []);
    }).catch(() => {});
  }, []);

  const handleChange = async (value) => {
    setUpdating(true);
    try {
      const clearing = value === NONE;
      const ft = clearing ? null : fileTypes.find(t => t.id === value);
      const typePrefix = ft?.reference_prefix || "";
      const newRef = updateFileReferencePrefix(file.reference, typePrefix);

      // Optimistic UI update — no server refetch
      setLocalTypeId(ft?.id || "");

      await base44.entities[entityName].update(file.id, {
        file_type_id: ft?.id || null,
        file_type_name: ft?.name || "",
        reference: newRef,
      });

      // Notify parent with patched data so the reference column updates locally
      if (onUpdated) {
        onUpdated({ ...file, file_type_id: ft?.id || null, file_type_name: ft?.name || "", reference: newRef });
      }
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Select
      value={localTypeId || (fileTypes.length ? NONE : "")}
      onValueChange={handleChange}
      disabled={updating || fileTypes.length === 0}
    >
      <SelectTrigger className="h-7 text-xs w-36 border-dashed">
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
  );
}