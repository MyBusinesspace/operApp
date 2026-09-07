import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { base44 } from "@/api/base44Client";
import {
  FileText, ClipboardList, Users, CalendarDays,
  CheckCircle2, AlertCircle, Clock, ArrowRight
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";

const statusIcon = {
  success: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />,
  warning: <AlertCircle className="w-3.5 h-3.5 text-amber-500" />,
  info: <Clock className="w-3.5 h-3.5 text-blue-500" />,
  neutral: null,
};

function ActivityItem({ activity, delay }) {
  const iconMap = {
    workOrder: { icon: ClipboardList, bg: "bg-primary/10 text-primary" },
    task: { icon: CheckCircle2, bg: "bg-success/10 text-success" },
    invoice: { icon: FileText, bg: "bg-chart-2/10 text-chart-2" },
    leave: { icon: CalendarDays, bg: "bg-chart-4/10 text-chart-4" },
    employee: { icon: Users, bg: "bg-chart-3/10 text-chart-3" },
  };
  const { icon: Icon, bg } = iconMap[activity.type] || iconMap.workOrder;

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-start gap-3 p-3 rounded-xl hover:bg-accent/60 transition-colors group"
    >
      <div className={`p-2 rounded-lg ${bg} shrink-0`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground truncate">{activity.title}</p>
          {statusIcon[activity.status]}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{activity.desc}</p>
      </div>
      <span className="text-xs text-muted-foreground shrink-0 mt-0.5">{activity.time}</span>
    </motion.div>
  );
}

export default function RecentActivity({ workOrders, tasks, invoices, leaveRequests }) {
  const activities = useMemo(() => {
    const items = [];

    const all = [
      ...workOrders.map(w => ({
        type: "workOrder",
        title: `${w.reference || "WO"} — ${w.title || ""}`,
        desc: `${w.contact_name || ""} ${w.status || ""}`,
        date: new Date(w.updated_date || w.created_date),
        status: w.status === "Active" ? "info" : "success",
      })),
      ...tasks.filter(t => t.status === "Completed").slice(0, 5).map(t => ({
        type: "task",
        title: `Task completed: ${t.title || t.reference}`,
        desc: t.project_name || t.work_order_name || "",
        date: new Date(t.updated_date || t.created_date),
        status: "success",
      })),
      ...invoices.filter(i => i.status === "Paid" || i.status === "Awaiting Payment").slice(0, 5).map(i => ({
        type: "invoice",
        title: `${i.number || "INV"} — ${i.contact_name || ""}`,
        desc: `AED ${((i.total || 0) - (i.amount_paid || 0)).toLocaleString()} ${i.status}`,
        date: new Date(i.updated_date || i.created_date),
        status: i.status === "Paid" ? "success" : "warning",
      })),
      ...leaveRequests.filter(l => l.status === "pending").slice(0, 4).map(l => ({
        type: "leave",
        title: `Leave request: ${l.employee_name || ""}`,
        desc: `${l.total_days || 0} days — ${l.leave_type}`,
        date: new Date(l.created_date),
        status: "warning",
      })),
    ];

    all.sort((a, b) => b.date - a.date);
    return all.slice(0, 8).map(a => ({
      ...a,
      time: formatDistanceToNow(a.date, { addSuffix: true }),
    }));
  }, [workOrders, tasks, invoices, leaveRequests]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.4 }}
      className="bg-card rounded-2xl border border-border card-hover"
    >
      <div className="flex items-center justify-between p-6 pb-0">
        <div>
          <h3 className="font-semibold text-foreground">Recent Activity</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Latest updates across your business</p>
        </div>
      </div>
      <div className="p-3">
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No recent activity yet.</p>
        ) : (
          activities.map((activity, i) => (
            <ActivityItem key={i} activity={activity} delay={0.5 + i * 0.05} />
          ))
        )}
      </div>
    </motion.div>
  );
}