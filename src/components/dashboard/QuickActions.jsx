import React from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Plus, ClipboardList, Users, FileText, FolderKanban, Clock
} from "lucide-react";

const actions = [
  { label: "New Work Order", icon: ClipboardList, path: "/work-orders", color: "bg-primary/10 text-primary hover:bg-primary/15" },
  { label: "Add Contact", icon: Users, path: "/contacts", color: "bg-chart-2/10 text-chart-2 hover:bg-chart-2/15" },
  { label: "Create Invoice", icon: FileText, path: "/sales", color: "bg-chart-3/10 text-chart-3 hover:bg-chart-3/15" },
  { label: "New Project", icon: FolderKanban, path: "/projects", color: "bg-chart-4/10 text-chart-4 hover:bg-chart-4/15" },
  { label: "Log Time", icon: Clock, path: "/timesheets", color: "bg-chart-5/10 text-chart-5 hover:bg-chart-5/15" },
];

export default function QuickActions() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="bg-card rounded-2xl border border-border p-6 card-hover"
    >
      <h3 className="font-semibold text-foreground mb-4">Quick Actions</h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {actions.map((action) => (
          <Link
            key={action.label}
            to={action.path}
            className={`flex flex-col items-center gap-2.5 p-4 rounded-xl transition-all duration-200 ${action.color} group`}
          >
            <action.icon className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-medium text-center">{action.label}</span>
          </Link>
        ))}
      </div>
    </motion.div>
  );
}