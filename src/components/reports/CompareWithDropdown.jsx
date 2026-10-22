import { useState, useEffect, useMemo } from "react";
import { parseDateOnly } from "@/lib/dateOnly";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear } from "date-fns";

const PERIOD_OPTIONS = {
  week: [
    { label: "None", value: 0 },
    { label: "1 week", value: 1 },
    { label: "2 weeks", value: 2 },
    { label: "3 weeks", value: 3 },
    { label: "4 weeks", value: 4 },
  ],
  month: [
    { label: "None", value: 0 },
    { label: "1 month", value: 1 },
    { label: "2 months", value: 2 },
    { label: "3 months", value: 3 },
    { label: "4 months", value: 4 },
  ],
  quarter: [
    { label: "None", value: 0 },
    { label: "1 quarter", value: 1 },
    { label: "2 quarters", value: 2 },
    { label: "3 quarters", value: 3 },
    { label: "4 quarters", value: 4 },
  ],
  year: [
    { label: "None", value: 0 },
    { label: "1 year", value: 1 },
    { label: "2 years", value: 2 },
    { label: "3 years", value: 3 },
    { label: "4 years", value: 4 },
  ],
};

const PERIOD_RANK = { week: 0, month: 1, quarter: 2, year: 3 };

const PREVIOUS_OPTIONS = [
  { label: "Month", value: "month", rank: 1 },
  { label: "Quarter", value: "quarter", rank: 2 },
  { label: "Year", value: "year", rank: 3 },
  { label: "Custom date range", value: "custom" },
];

function detectPeriod(fromStr, toStr) {
  if (!fromStr || !toStr) return "month";
  const f = parseDateOnly(fromStr);
  const t = parseDateOnly(toStr);
  if (isNaN(f) || isNaN(t)) return "month";
  const days = Math.round((t - f) / 86400000) + 1;
  // Check alignment with calendar boundaries first
  if (+f === +startOfWeek(f, { weekStartsOn: 1 }) && +t === +endOfWeek(t, { weekStartsOn: 1 })) return "week";
  if (+f === +startOfMonth(f) && +t === +endOfMonth(t)) return "month";
  if (+f === +startOfQuarter(f) && +t === +endOfQuarter(t)) return "quarter";
  if (+f === +startOfYear(f) && +t === +endOfYear(t)) return "year";
  // Fall back to day count
  if (days <= 8) return "week";
  if (days >= 28 && days <= 32) return "month";
  if (days >= 85 && days <= 95) return "quarter";
  if (days >= 360 && days <= 370) return "year";
  return "month";
}

export default function CompareWithDropdown({ comparison, onChange, from, to }) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customValue, setCustomValue] = useState("");

  const period = useMemo(() => detectPeriod(from, to), [from, to]);
  const expectedType = period + "s"; // weeks, months, quarters, years

  // Backward compat: normalize old-style comparison
  const comp = typeof comparison === "number"
    ? { type: "months", value: comparison }
    : (comparison || { type: expectedType, value: 4 });

  // Auto-correct comparison type when period changes
  useEffect(() => {
    if (comp.type !== "previous" && comp.type !== "shift" && comp.type !== expectedType) {
      onChange({ type: expectedType, value: 4 });
    }
  }, [period]);

  const options = PERIOD_OPTIONS[period] || PERIOD_OPTIONS.month;

  const triggerLabel = comp.type === "shift"
    ? `Same period, ${comp.value} ${comp.unit}${comp.value > 1 ? "s" : ""} back`
    : comp.type === "previous"
    ? `Previous ${PREVIOUS_OPTIONS.find(o => o.value === comp.value)?.label.toLowerCase() || ""}`
    : (options.find(o => o.value === comp.value)?.label || `${comp.value} ${period}s`);

  const selectPeriod = (value) => {
    onChange({ type: expectedType, value });
    setOpen(false);
  };

  const selectPrevious = (value) => {
    onChange({ type: "previous", value });
    setOpen(false);
  };

  const applyCustom = () => {
    const n = parseInt(customValue, 10);
    if (!isNaN(n) && n >= 0) {
      selectPeriod(n);
      setCustomMode(false);
      setCustomValue("");
    }
  };

  const currentRank = PERIOD_RANK[period] ?? 1;
  const hasDisabledPrevious = PREVIOUS_OPTIONS.some(o => o.rank && o.rank < currentRank);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="h-8 inline-flex items-center gap-1.5 px-2.5 text-sm border border-input rounded-md bg-background hover:bg-accent transition-colors whitespace-nowrap">
          <span className="text-muted-foreground">Compare with</span>
          <span className="text-foreground">{triggerLabel}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-0" align="start">
        <div className="py-1">
          <p className="px-3 py-1 text-xs text-muted-foreground">Compare with</p>
          {options.map(o => {
            const isActive = comp.type === expectedType && o.value === comp.value;
            return (
              <button key={o.value}
                onClick={() => selectPeriod(o.value)}
                className={`w-full flex items-center px-3 py-1.5 text-sm text-left transition-colors border-l-2 ${
                  isActive
                    ? "border-primary text-primary font-medium bg-primary/5"
                    : "border-transparent text-foreground hover:bg-accent"
                }`}>
                {o.label}
              </button>
            );
          })}
          <button onClick={() => setCustomMode(v => !v)}
            className="w-full flex items-center px-3 py-1.5 text-sm text-left text-foreground hover:bg-accent transition-colors border-l-2 border-transparent">
            Enter a different number
          </button>
          {customMode && (
            <div className="px-3 pb-2 flex items-center gap-2">
              <input type="number" min="0" value={customValue} onChange={e => setCustomValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyCustom()}
                placeholder="e.g. 6"
                className="h-7 text-xs border border-input rounded px-1.5 bg-background flex-1" />
              <button onClick={applyCustom}
                className="h-7 px-2 text-xs bg-primary text-primary-foreground rounded">Apply</button>
            </div>
          )}
          <div className="border-t border-border">
            <p className="px-3 py-1 text-xs text-muted-foreground">Previous</p>
            {PREVIOUS_OPTIONS.map(o => {
              const isActive = comp.type === "previous" && o.value === comp.value;
              const isDisabled = o.rank && o.rank < currentRank;
              return (
                <button key={o.value}
                  disabled={isDisabled}
                  onClick={() => !isDisabled && selectPrevious(o.value)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left transition-colors ${
                    isDisabled
                      ? "text-muted-foreground/50 cursor-not-allowed"
                      : isActive
                        ? "text-primary font-medium"
                        : "text-foreground hover:bg-accent"
                  }`}>
                  <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-colors ${
                    isActive ? "border-primary" : isDisabled ? "border-muted-foreground/20" : "border-muted-foreground/40"
                  }`}>
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                  </span>
                  {o.label}
                </button>
              );
            })}
            {hasDisabledPrevious && (
              <p className="px-3 py-1.5 text-xs text-muted-foreground leading-snug">
                Options are disabled because the report date range is longer.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}