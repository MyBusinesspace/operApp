import React from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

export default function ColumnToggle({ columns, visible, onToggle }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0">
          <Settings2 className="w-3.5 h-3.5" /> Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Toggle Columns
        </div>
        {columns.map(col => {
          const isOn = !!visible[col.key];
          return (
            <div
              key={col.key}
              className={`flex items-center justify-between w-full px-2 py-2 text-sm rounded-md transition-colors ${
                col.required ? "opacity-50 cursor-not-allowed" : "hover:bg-accent"
              }`}
            >
              <span className="text-foreground">{col.label}</span>
              <Switch
                checked={isOn}
                disabled={col.required}
                onCheckedChange={() => onToggle(col.key)}
              />
            </div>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}