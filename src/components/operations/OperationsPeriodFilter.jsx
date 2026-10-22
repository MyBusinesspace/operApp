import React, { useCallback } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const MODES = [
  { value: "day", label: "Day" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
  { value: "all", label: "All" },
];

function shiftDay(value, delta) {
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}
function shiftMonth(value, delta) {
  const [y, m] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function OperationsPeriodFilter({ mode, year, month, day, onMode, onYear, onMonth, onDay, years }) {
  const shift = useCallback((delta) => {
    if (mode === "day") onDay(shiftDay(day, delta));
    else if (mode === "month") onMonth(shiftMonth(month, delta));
    else if (mode === "year") {
      const idx = years.indexOf(year);
      const next = idx + delta;
      if (next >= 0 && next < years.length) onYear(years[next]);
    }
  }, [mode, day, month, year, years, onDay, onMonth, onYear]);

  const showArrows = mode === "day" || mode === "month" || mode === "year";

  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
        <Calendar className="w-3.5 h-3.5" /> Period
      </div>
      <div className="flex items-center bg-muted rounded-lg p-0.5">
        {MODES.map(m => (
          <button
            key={m.value}
            type="button"
            onClick={() => onMode(m.value)}
            className={`px-3 h-7 text-xs font-medium rounded-md transition-colors ${
              mode === m.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "year" && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent transition-colors" title="Previous year">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <Select value={String(year)} onValueChange={v => onYear(Number(v))}>
            <SelectTrigger className="h-8 w-[90px] text-xs justify-center"><SelectValue /></SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <button type="button" onClick={() => shift(1)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent transition-colors" title="Next year">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      {mode === "month" && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent transition-colors" title="Previous month">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <Input type="month" value={month} onChange={e => onMonth(e.target.value)} className="h-8 w-[150px] !text-xs px-2 py-1 text-center" />
          <button type="button" onClick={() => shift(1)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent transition-colors" title="Next month">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      {mode === "day" && (
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => shift(-1)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent transition-colors" title="Previous day">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <Input type="date" value={day} onChange={e => onDay(e.target.value)} className="h-8 w-[150px] !text-xs px-2 py-1 text-center" />
          <button type="button" onClick={() => shift(1)} className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-input bg-transparent hover:bg-accent transition-colors" title="Next day">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}