import React from "react";
import { Settings2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export default function ColumnToggle({ columns, visible, onToggle }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0">
          <Settings2 className="w-3.5 h-3.5" /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-1">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Toggle Columns
        </div>
        {columns.map(col => (
          <button
            key={col.key}
            onClick={() => onToggle(col.key)}
            disabled={col.required}
            className="flex items-center justify-between w-full px-2 py-1.5 text-sm rounded-md hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-foreground">{col.label}</span>
            <span className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              visible[col.key]
                ? "bg-primary border-primary text-primary-foreground"
                : "border-border"
            }`}>
              {visible[col.key] && <Check className="w-3 h-3" />}
            </span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}