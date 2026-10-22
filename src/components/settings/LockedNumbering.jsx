import React from "react";
import { Lock } from "lucide-react";

// Numbering and serial settings are locked: they are changed by the administrator in the system, not from Settings.
export default function LockedNumbering({ children }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg px-3 py-2 mb-3">
        <Lock className="w-3.5 h-3.5 shrink-0" />
        <span>Numbering is locked. Document and reference numbers follow the fixed series and cannot be edited here.</span>
      </div>
      <fieldset disabled className="pointer-events-none opacity-60 select-none border-0 p-0 m-0 min-w-0">
        {children}
      </fieldset>
    </div>
  );
}
