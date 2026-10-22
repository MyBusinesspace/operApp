import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { History, TrendingUp, TrendingDown, RefreshCw, User, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

function fmt(n) {
  if (n == null) return "—";
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDt(s) {
  if (!s) return "—";
  return format(new Date(s), "dd MMM yyyy, HH:mm");
}

const ACTION_LABELS = {
  salary_updated:    "Salary Updated",
  hourly_rate_updated: "Hourly Rate Updated",
  profile_created:   "Profile Created",
  profile_updated:   "Profile Updated",
};

const SOURCE_BADGE = {
  bulk_edit:       { label: "Bulk Edit", cls: "bg-purple-100 text-purple-700" },
  individual_edit: { label: "Individual Edit", cls: "bg-blue-100 text-blue-700" },
};

// Optional: pass employeeId to show only that employee's history
export default function SalaryAuditLogPanel({ employeeId = null }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const all = await base44.entities.SalaryAuditLog.list("-created_date", 100);
    const data = Array.isArray(all) ? all : [];
    setLogs(employeeId ? data.filter(l => l.employee_id === employeeId) : data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [employeeId]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Salary Audit Trail</span>
        </div>
        <Button variant="ghost" size="sm" onClick={load} className="h-7 px-2 text-xs gap-1.5 text-muted-foreground">
          <RefreshCw className="w-3 h-3" /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="py-8 text-center text-xs text-muted-foreground">Loading...</div>
      ) : logs.length === 0 ? (
        <div className="py-8 text-center">
          <History className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">No salary changes recorded yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Date & Time</th>
                {!employeeId && <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Employee</th>}
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Action</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Before</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">After</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Change</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Changed By</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {logs.map(log => {
                const delta = log.change_amount;
                const src = SOURCE_BADGE[log.source] || SOURCE_BADGE.individual_edit;
                return (
                  <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{fmtDt(log.timestamp)}</td>
                    {!employeeId && (
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-foreground text-xs">{log.employee_name || "—"}</span>
                      </td>
                    )}
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-foreground">{ACTION_LABELS[log.action] || log.action}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs text-muted-foreground">
                      {log.old_value != null ? fmt(log.old_value) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs font-semibold text-foreground">
                      {log.new_value != null ? fmt(log.new_value) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                      {delta != null ? (
                        <span className={`flex items-center justify-end gap-0.5 font-semibold ${delta >= 0 ? "text-emerald-600" : "text-destructive"}`}>
                          {delta >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {delta >= 0 ? "+" : ""}{fmt(delta)}
                        </span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <User className="w-3 h-3 shrink-0" />
                        {log.performed_by_name || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${src.cls}`}>
                        <Edit3 className="w-2.5 h-2.5" />
                        {src.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}