import React from "react";

function addMonths(dateStr, months) {
  const base = dateStr ? new Date(dateStr) : new Date();
  base.setMonth(base.getMonth() + months);
  return base.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Quick-fill date buttons: Today, +1M, +3M, +6M
 * baseDate: if provided (e.g. start date), the +nM buttons add from baseDate instead of today
 */
export default function DateQuickButtons({ onChange, baseDate }) {
  const base = baseDate || null;

  const buttons = [
    { label: "Today", action: () => onChange(today()) },
    { label: "+1M",   action: () => onChange(addMonths(base, 1)) },
    { label: "+3M",   action: () => onChange(addMonths(base, 3)) },
    { label: "+6M",   action: () => onChange(addMonths(base, 6)) },
  ];

  return (
    <div className="flex gap-1 mt-1">
      {buttons.map(b => (
        <button
          key={b.label}
          type="button"
          onClick={b.action}
          className="text-xs px-2 py-0.5 rounded-md border border-border text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {b.label}
        </button>
      ))}
    </div>
  );
}