import React, { useMemo } from "react";
import { ArrowRight, Lock } from "lucide-react";

// A clear two-column mapping table:
//   Left  = the app's own field (friendly label + internal key)
//   Right = which incoming CSV column feeds it (dropdown)
// Fields are ordered: required first, then matched, then the rest —
// so the table reads top-to-bottom with a clear sense of order.
export default function ImportFieldMapping({
  entityLabel,
  appFields,
  labelFor,
  requiredFields = [],
  headers,
  fieldToSource,
  usedSources,
  onAssign,
  sampleRow = {},
  lockedFields = new Set(),
}) {
  const filledCount = appFields.filter(f => fieldToSource[f]).length;

  // Order: required → matched → empty; alphabetical within each group by label.
  const orderedFields = useMemo(() => {
    const rank = (f) => {
      if (requiredFields.includes(f)) return 0;
      if (fieldToSource[f]) return 1;
      return 2;
    };
    return [...appFields].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return (labelFor(a) || a).localeCompare(labelFor(b) || b);
    });
  }, [appFields, requiredFields, fieldToSource, labelFor]);

  return (
    <div className="rounded-lg border border-border mb-4 overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-muted/50 border-b border-border">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {entityLabel} Fields
        </span>
        <span className="text-xs text-emerald-600 font-medium">{filledCount} matched</span>
        <span className="text-xs text-muted-foreground">{appFields.length - filledCount} empty</span>
      </div>

      {/* Sticky header row */}
      <div className="sticky top-0 z-10 grid grid-cols-[1fr_auto_1.4fr] gap-2 px-4 py-2 bg-muted/20 border-b border-border text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span>App field</span>
        <span className="w-5" />
        <span>Column from your file</span>
      </div>

      <div className="divide-y divide-border">
        {orderedFields.map((field, i) => {
          const source = fieldToSource[field] || "";
          const required = requiredFields.includes(field);
          const sample = source ? (sampleRow[source] ?? "") : "";
          const locked = lockedFields.has(field);
          return (
            <div key={field} className={`grid grid-cols-[1fr_auto_1.4fr] gap-2 px-4 py-2 items-center hover:bg-muted/20 ${i % 2 === 1 ? "bg-muted/10" : ""}`}>
              {/* Left: app field */}
              <div className="min-w-0 flex items-center gap-2">
                <span className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${required ? "bg-destructive" : source ? "bg-emerald-500" : "bg-transparent border border-border"}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate leading-tight">
                    {labelFor(field)}
                    {required && <span className="text-destructive ml-0.5">*</span>}
                  </p>
                  <p className="text-[11px] font-mono text-muted-foreground truncate leading-tight">{field}</p>
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight className={`w-4 h-4 ${source ? "text-emerald-500" : "text-muted-foreground/30"}`} />

              {/* Right: source column selector */}
              <div className="min-w-0">
                {locked ? (
                  <div className="flex items-center gap-1.5 h-8 px-2 rounded-md border border-dashed border-amber-300 bg-amber-50 text-amber-700 text-xs">
                    <Lock className="w-3.5 h-3.5 shrink-0" />
                    <span>Set per record (Settings)</span>
                  </div>
                ) : (
                  <select
                    value={source}
                    onChange={(e) => onAssign(field, e.target.value)}
                    className={`w-full h-8 rounded-md border px-2 text-xs font-mono transition-colors ${
                      source
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-dashed border-border bg-card text-muted-foreground"
                    }`}
                  >
                    <option value="">— Not imported —</option>
                    {headers.map(h => {
                      const takenElsewhere = usedSources.has(h) && fieldToSource[field] !== h;
                      return (
                        <option key={h} value={h} disabled={takenElsewhere}>
                          {h}{takenElsewhere ? " (already used)" : ""}
                        </option>
                      );
                    })}
                  </select>
                )}
                {source && sample !== "" && !locked && (
                  <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                    e.g. <span className="text-foreground">{String(sample)}</span>
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}