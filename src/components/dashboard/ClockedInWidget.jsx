import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function LiveDot() {
  return <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />;
}

export default function ClockedInWidget({ activeEntries }) {
  const [active, setActive] = useState(activeEntries || []);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (activeEntries) {
      setActive(activeEntries.filter(e => e.status === "Active"));
    }
  }, [activeEntries]);

  useEffect(() => {
    const fetchActive = () => {
      base44.entities.TimeEntry.filter({ status: "Active" }).then(setActive).catch(() => {});
    };
    const debouncedFetch = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fetchActive, 3000);
    };
    const unsub = base44.entities.TimeEntry.subscribe(debouncedFetch);
    return () => {
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  if (active.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-green-500" />
          <p className="text-sm font-semibold text-foreground">Clocked In Now</p>
        </div>
        <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">{active.length} active</span>
      </div>
      <div className="space-y-2">
        {active.slice(0, 5).map(entry => (
          <div key={entry.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <LiveDot />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{entry.employee_name}</p>
                <p className="text-xs text-muted-foreground truncate">{entry.task_title}</p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              {entry.on_site != null && (
                <span className={`inline-flex items-center gap-1 text-xs ${entry.on_site ? "text-green-600" : "text-orange-600"}`}>
                  {entry.on_site ? <CheckCircle className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                  {entry.on_site ? "On Site" : "Off Site"}
                </span>
              )}
              <p className="text-xs text-muted-foreground">
                {entry.clock_in_time ? formatDistanceToNow(new Date(entry.clock_in_time), { addSuffix: true }) : ""}
              </p>
            </div>
          </div>
        ))}
        {active.length > 5 && <p className="text-xs text-muted-foreground text-center pt-1">+{active.length - 5} more</p>}
      </div>
    </div>
  );
}