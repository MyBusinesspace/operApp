import { Clock, CheckCircle, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

function LiveDot() {
  return <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />;
}

/** Read-only mirror of ClockedInWidget — no Base44 subscribe/API. */
export default function DemoClockedIn({ activeEntries }) {
  const active = (activeEntries || []).filter((e) => e.status === "Active");
  if (active.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-green-500" />
          <p className="text-sm font-semibold text-foreground">Clocked In Now</p>
        </div>
        <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
          {active.length} active
        </span>
      </div>
      <div className="space-y-2">
        {active.slice(0, 5).map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <LiveDot />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {entry.employee_name}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {entry.task_title}
                </p>
              </div>
            </div>
            <div className="shrink-0 text-right">
              {entry.on_site != null && (
                <span
                  className={`inline-flex items-center gap-1 text-xs ${
                    entry.on_site ? "text-green-600" : "text-orange-600"
                  }`}
                >
                  {entry.on_site ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <AlertCircle className="w-3 h-3" />
                  )}
                  {entry.on_site ? "On Site" : "Off Site"}
                </span>
              )}
              {entry.created_date && (
                <p className="text-[10px] text-muted-foreground">
                  {formatDistanceToNow(new Date(entry.created_date), {
                    addSuffix: true,
                  })}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
