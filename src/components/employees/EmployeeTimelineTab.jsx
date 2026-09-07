import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Calendar, Pencil, DollarSign, FileText, Clock, ChevronDown, ChevronUp } from "lucide-react";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtTime(d) {
  if (!d) return "";
  return new Date(d).toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
function fmtNum(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const LEAVE_STATUS_STYLES = {
  pending:   "bg-amber-100 text-amber-700",
  approved:  "bg-emerald-100 text-emerald-700",
  rejected:  "bg-red-100 text-red-600",
  cancelled: "bg-slate-100 text-slate-500",
};

const EVENT_ICONS = {
  salary_change:   <Pencil className="w-3.5 h-3.5" />,
  leave:           <Calendar className="w-3.5 h-3.5" />,
  payroll_action:  <FileText className="w-3.5 h-3.5" />,
  profile_created: <DollarSign className="w-3.5 h-3.5" />,
};

const EVENT_COLORS = {
  salary_change:   "border-blue-300 bg-blue-50",
  leave:           "border-amber-300 bg-amber-50",
  payroll_action:  "border-purple-300 bg-purple-50",
  profile_created: "border-emerald-300 bg-emerald-50",
};

export default function EmployeeTimelineTab({ employeeId }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [salaryLogs, leaveReqs, payrollLogs] = await Promise.all([
        base44.entities.SalaryAuditLog.filter({ employee_id: employeeId }),
        base44.entities.LeaveRequest.filter({ employee_id: employeeId }),
        base44.entities.PayrollAuditLog.filter({ employee_id: employeeId }),
      ]);

      const all = [];

      // Salary audit logs
      (salaryLogs || []).forEach(log => {
        let desc = "";
        if (log.action === "profile_created") {
          desc = "Payroll profile created";
        } else if (log.action === "salary_updated") {
          desc = `Basic salary changed from AED ${fmtNum(log.old_value)} → AED ${fmtNum(log.new_value)}`;
        } else if (log.action === "hourly_rate_updated") {
          desc = `Hourly rate changed from AED ${fmtNum(log.old_value)} → AED ${fmtNum(log.new_value)}`;
        } else {
          desc = `${log.field_changed || "Field"} updated: ${fmtNum(log.old_value)} → ${fmtNum(log.new_value)}`;
        }
        all.push({
          type: log.action === "profile_created" ? "profile_created" : "salary_change",
          date: log.timestamp,
          description: desc,
          by: log.performed_by_name || "System",
          notes: log.notes,
          source: log.source === "bulk_edit" ? "Bulk edit" : "Manual",
          raw: log,
        });
      });

      // Leave requests
      (leaveReqs || []).forEach(lr => {
        const range = `${fmtDate(lr.start_date)} → ${fmtDate(lr.end_date)}`;
        let desc = "";
        if (lr.status === "approved") {
          desc = `Leave approved: ${lr.total_days} days (${range})`;
        } else if (lr.status === "rejected") {
          desc = `Leave rejected: ${lr.total_days} days (${range})`;
        } else if (lr.status === "cancelled") {
          desc = `Leave cancelled: ${lr.total_days} days (${range})`;
        } else {
          desc = `Leave requested: ${lr.total_days} days (${range})`;
        }
        all.push({
          type: "leave",
          date: lr.approved_at || lr.start_date,
          description: desc,
          by: lr.approved_by_name || lr.employee_name,
          notes: lr.reason ? `Reason: ${lr.reason}` : "",
          badge: { label: lr.status, style: LEAVE_STATUS_STYLES[lr.status] || "bg-slate-100 text-slate-600" },
          raw: lr,
        });
      });

      // Payroll audit logs
      (payrollLogs || []).forEach(pl => {
        all.push({
          type: "payroll_action",
          date: pl.timestamp,
          description: pl.changes_summary || `${pl.action?.replace(/_/g, " ")} — ${pl.pay_period_name || ""}`,
          by: pl.performed_by_name || "System",
          notes: "",
          raw: pl,
        });
      });

      // Sort newest first
      all.sort((a, b) => new Date(b.date) - new Date(a.date));
      setEvents(all);
      setLoading(false);
    };
    load();
  }, [employeeId]);

  if (loading) return <div className="py-8 text-center text-sm text-muted-foreground">Loading timeline...</div>;
  if (events.length === 0) return <div className="py-12 text-center text-sm text-muted-foreground">No history events found for this employee.</div>;

  return (
    <div className="relative pl-8 space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

      {events.map((ev, idx) => (
        <TimelineItem key={idx} event={ev} />
      ))}
    </div>
  );
}

function TimelineItem({ event }) {
  const [expanded, setExpanded] = useState(false);
  const colorClass = EVENT_COLORS[event.type] || "border-slate-300 bg-slate-50";

  return (
    <div className="relative pb-5 last:pb-0">
      {/* Dot */}
      <div className={`absolute -left-[29px] top-1 w-4 h-4 rounded-full border-2 bg-card ${event.type === "leave" ? "border-amber-400" : event.type === "salary_change" || event.type === "profile_created" ? "border-blue-400" : "border-purple-400"}`} />

      <div className={`rounded-lg border ${colorClass} p-3`}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="shrink-0 text-muted-foreground">
              {EVENT_ICONS[event.type] || <Clock className="w-3.5 h-3.5" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{event.description}</p>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {fmtDate(event.date)}{event.date && <span className="ml-1">{fmtTime(event.date)}</span>}
                </span>
                <span className="text-xs text-muted-foreground">·</span>
                <span className="text-xs text-muted-foreground">{event.by}</span>
                {event.source && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{event.source}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {event.badge && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${event.badge.style}`}>
                {event.badge.label}
              </span>
            )}
            {event.notes && (
              <button onClick={() => setExpanded(v => !v)} className="text-muted-foreground hover:text-foreground transition-colors">
                {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        </div>
        {expanded && event.notes && (
          <p className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">{event.notes}</p>
        )}
      </div>
    </div>
  );
}