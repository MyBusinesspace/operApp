import React from "react";
import { Folder, FileText, ArrowDownRight } from "lucide-react";

// Read-only view of where the mirror puts things in Google Drive.
const ROWS = [
  { icon: Folder, name: "Redcrane LLC/", indent: 0, bold: true },
  { icon: Folder, name: "Clientes/", indent: 1 },
  { icon: Folder, name: "└─ [Customer name]/", indent: 2 },
  { icon: FileText, name: "└─ customer files + shared files", indent: 3, muted: true },
  { icon: Folder, name: "Proveedores/", indent: 1 },
  { icon: Folder, name: "└─ [Supplier name]/", indent: 2 },
  { icon: FileText, name: "└─ supplier files + shared files", indent: 3, muted: true },
  { icon: Folder, name: "Proyectos/", indent: 1 },
  { icon: Folder, name: "└─ [Client - Project]/", indent: 2 },
  { icon: FileText, name: "├─ project + shared files", indent: 3, muted: true },
  { icon: FileText, name: "├─ task photos", indent: 3, muted: true },
  { icon: FileText, name: "└─ working report PDFs", indent: 3, muted: true },
  { icon: Folder, name: "Empleados/", indent: 1 },
  { icon: Folder, name: "└─ [Employee name]/", indent: 2 },
  { icon: FileText, name: "└─ employee documents", indent: 3, muted: true },
  { icon: Folder, name: "Equipos/", indent: 1 },
  { icon: Folder, name: "└─ [Equipment name]/", indent: 2 },
  { icon: FileText, name: "└─ equipment files", indent: 3, muted: true },
  { icon: Folder, name: "Empresa Redcrane/", indent: 1 },
  { icon: FileText, name: "└─ company files", indent: 2, muted: true },
];

export default function MirrorStructure() {
  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-border bg-muted/20 p-4 font-mono text-xs space-y-0.5 max-h-[420px] overflow-y-auto">
        {ROWS.map((row, i) => (
          <div
            key={i}
            className={`flex items-center gap-1.5 ${
              row.bold ? "font-semibold text-foreground" : row.muted ? "text-muted-foreground" : "text-foreground"
            }`}
            style={{ paddingLeft: `${row.indent * 14}px` }}
          >
            <row.icon className={`w-3.5 h-3.5 shrink-0 ${row.muted ? "text-muted-foreground/60" : "text-primary"}`} />
            <span>{row.name}</span>
          </div>
        ))}
      </div>
      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <ArrowDownRight className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>
          Folders are created for the entities that have files. A shared file that belongs to a customer, a project
          and a piece of equipment is mirrored into every one of those folders. The mirror never renames, moves or
          deletes a folder in your Drive, and it never changes app data.
        </p>
      </div>
    </div>
  );
}