import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, subMonths } from "date-fns";

const f = (d) => format(d, "yyyy-MM-dd");

// Xero-style "Common formats" for reports with a from/to range and a comparison.
export function rangeFormats(today = new Date()) {
  return [
    { label: "Current and previous 3 months", from: f(startOfMonth(today)), to: f(endOfMonth(today)), comparison: { type: "months", value: 3 } },
    { label: "Current financial year by month", from: f(startOfMonth(today)), to: f(endOfMonth(today)), comparison: { type: "months", value: today.getMonth() } },
    { label: "Month to date comparison", from: f(startOfMonth(today)), to: f(today), comparison: { type: "shift", unit: "month", value: 1 } },
    { label: "Year to date comparison", from: f(startOfYear(today)), to: f(today), comparison: { type: "shift", unit: "year", value: 1 } },
  ];
}

// Balance sheet: as-of date plus one comparison date.
export function asOfFormats(today = new Date()) {
  const pm = endOfMonth(subMonths(today, 1));
  const ly = endOfMonth(subMonths(today, 12));
  return [
    { label: "Today vs previous month end", asOf: f(today), compareAsOf: f(pm) },
    { label: "Month end vs previous month end", asOf: f(endOfMonth(today)), compareAsOf: f(pm) },
    { label: "Month end vs same month last year", asOf: f(endOfMonth(today)), compareAsOf: f(ly) },
    { label: "Today vs same day last year", asOf: f(today), compareAsOf: f(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())) },
  ];
}

export default function CommonFormatsMenu({ formats, onApply }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted">
          Common formats <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Common formats</p>
        {formats.map((fm) => (
          <button key={fm.label} type="button"
            className="block w-full rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
            onClick={() => { onApply(fm); setOpen(false); }}>
            {fm.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
