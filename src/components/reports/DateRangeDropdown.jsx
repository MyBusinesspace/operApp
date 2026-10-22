import { useState } from "react";
import { compareDateOnly, parseDateOnly } from "@/lib/dateOnly";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ChevronDown, Calendar } from "lucide-react";
import {
  format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subMonths, subQuarters, subYears,
} from "date-fns";

const fmtDay = (d) => format(d, "d MMM yyyy");

export default function DateRangeDropdown({ from, to, onChange }) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customFrom, setCustomFrom] = useState(from);
  const [customTo, setCustomTo] = useState(to);

  const sections = [
    {
      items: [
        { label: "This month", range: [startOfMonth(today), endOfMonth(today)], display: format(endOfMonth(today), "MMM yyyy") },
        { label: "This quarter", range: [startOfQuarter(today), endOfQuarter(today)], display: `${format(startOfQuarter(today), "d MMM")} - ${format(endOfQuarter(today), "d MMM yyyy")}` },
        { label: "This financial year", range: [startOfYear(today), endOfYear(today)], display: `${format(startOfYear(today), "d MMM")} - ${format(endOfYear(today), "d MMM yyyy")}` },
      ],
    },
    {
      items: [
        { label: "Last month", range: [startOfMonth(subMonths(today, 1)), endOfMonth(subMonths(today, 1))], display: format(endOfMonth(subMonths(today, 1)), "MMM yyyy") },
        { label: "Last quarter", range: [startOfQuarter(subQuarters(today, 1)), endOfQuarter(subQuarters(today, 1))], display: `${format(startOfQuarter(subQuarters(today, 1)), "d MMM")} - ${format(endOfQuarter(subQuarters(today, 1)), "d MMM yyyy")}` },
        { label: "Last financial year", range: [startOfYear(subYears(today, 1)), endOfYear(subYears(today, 1))], display: `${format(startOfYear(subYears(today, 1)), "d MMM yyyy")} - ${format(endOfYear(subYears(today, 1)), "d MMM yyyy")}` },
      ],
    },
    {
      items: [
        { label: "Month to date", range: [startOfMonth(today), today], display: format(today, "MMM yyyy") },
        { label: "Quarter to date", range: [startOfQuarter(today), today], display: `${format(startOfQuarter(today), "d MMM")} - ${format(today, "d MMM yyyy")}` },
        { label: "Year to date", range: [startOfYear(today), today], display: `${format(startOfYear(today), "d MMM")} - ${format(today, "d MMM yyyy")}` },
      ],
    },
  ];

  const applyPreset = (range) => {
    onChange(format(range[0], "yyyy-MM-dd"), format(range[1], "yyyy-MM-dd"));
    setOpen(false);
  };

  const applyCustom = () => {
    if (customFrom && customTo && compareDateOnly(customFrom, customTo) <= 0) {
      onChange(customFrom, customTo);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCustomMode(false); }}>
      <PopoverTrigger asChild>
        <button className="h-8 inline-flex items-center gap-1.5 px-2.5 text-sm border border-input rounded-md bg-background hover:bg-accent transition-colors whitespace-nowrap">
          <span className="text-foreground">{fmtDay(parseDateOnly(from))}</span>
          <span className="text-muted-foreground">to</span>
          <span className="text-foreground">{fmtDay(parseDateOnly(to))}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="py-1">
          {sections.map((sec, si) => (
            <div key={si} className={si > 0 ? "border-t border-border" : ""}>
              {sec.items.map(item => {
                const isActive = format(item.range[0], "yyyy-MM-dd") === from && format(item.range[1], "yyyy-MM-dd") === to;
                return (
                  <button key={item.label}
                    onClick={() => applyPreset(item.range)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-sm text-left transition-colors border-l-2 ${
                      isActive
                        ? "border-primary text-primary font-medium bg-primary/5"
                        : "border-transparent text-foreground hover:bg-accent"
                    }`}>
                    <span>{item.label}</span>
                    <span className="text-xs text-muted-foreground">{item.display}</span>
                  </button>
                );
              })}
            </div>
          ))}
          <div className="border-t border-border">
            <button onClick={() => setCustomMode(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-foreground hover:bg-accent transition-colors">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Custom date range</span>
              <span className="ml-auto text-xs text-muted-foreground">Select or type</span>
            </button>
            {customMode && (
              <div className="px-3 pb-2 flex items-center gap-2">
                <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                  className="h-7 text-xs border border-input rounded px-1.5 bg-background flex-1" />
                <span className="text-muted-foreground text-xs">→</span>
                <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                  className="h-7 text-xs border border-input rounded px-1.5 bg-background flex-1" />
                <Button size="sm" onClick={applyCustom} className="h-7 px-2 text-xs">Apply</Button>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}