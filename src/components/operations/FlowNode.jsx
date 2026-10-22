import React from "react";
import { Link } from "react-router-dom";
import {
  Wrench, ClipboardList, Clock,
  Users, FolderKanban, Package, FileText, Receipt, Truck,
  Building2, BarChart3, HardHat
} from "lucide-react";

const FLOW_MOTION_CSS = `
@keyframes operappFlowFloat {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
.operapp-flow-node {
  animation: operappFlowFloat 5.5s ease-in-out infinite;
  will-change: transform;
}
.operapp-flow-node:hover {
  animation: none;
  transform: translateY(-4px);
}
@keyframes operappDashMove {
  to { stroke-dashoffset: -14; }
}
.operapp-flow-arrow {
  animation: operappDashMove 1.1s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .operapp-flow-node, .operapp-flow-arrow { animation: none; }
}
`;

export const NODES = {
  asset:        { to: "/assets", icon: Package, label: "Assets", color: "#22d3ee" },
  customer:     { to: "/contacts", icon: Users, label: "Customer", color: "#a78bfa" },
  organization: { to: "/settings/organization", icon: Building2, label: "Organization", color: "#64748b" },
  project:      { to: "/projects", icon: FolderKanban, label: "Projects", color: "#60a5fa" },
  invoice:      { to: "/sales/invoices", icon: FileText, label: "Invoices", color: "#c084fc" },
  wo:           { to: "/work-orders", icon: Wrench, label: "Work Orders", color: "#818cf8" },
  tasks:        { to: "/tasks", icon: ClipboardList, label: "Task", color: "#34d399" },
  bill:         { to: "/purchasing/bills", icon: Receipt, label: "Bills", color: "#fb7185" },
  providers:    { to: "/purchasing/suppliers", icon: Truck, label: "Providers", color: "#f97316" },
  timesheets:   { to: "/timesheets", icon: Clock, label: "Timesheets", color: "#fbbf24" },
  reports:      { to: "/reports/working-reports", icon: BarChart3, label: "Working reports", color: "#0ea5e9" },
  employees:    { to: "/employees", icon: HardHat, label: "Employees", color: "#2dd4bf" },
};

export default function Node({ id, total, breakdown = [], live = [], width = 104, hideCount = false, caption }) {
  const n = NODES[id];
  const Icon = n.icon;
  // Deterministic per-node delay so the boxes drift out of sync, not in lockstep.
  const delay = (id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 6) * 0.6;
  return (
    <>
      <style>{FLOW_MOTION_CSS}</style>
    <Link
      to={n.to}
      className="operapp-flow-node group relative rounded-xl border-2 p-2 flex flex-col gap-1 overflow-hidden transition-all duration-300"
      style={{
        animationDelay: `${delay}s`,
        width,
        borderColor: `${n.color}66`,
        background: `linear-gradient(140deg, ${n.color}1f, ${n.color}08 60%, transparent)`,
        boxShadow: `0 4px 14px -6px ${n.color}55`,
      }}
    >
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, ${n.color}, transparent)` }} />
      <div className="flex items-center gap-1.5">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
          style={{ backgroundColor: n.color, boxShadow: `0 4px 10px -3px ${n.color}99` }}
        >
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex flex-col leading-none min-w-0">
          <span className="text-[9px] font-medium text-muted-foreground mb-0.5 leading-[1.1] whitespace-normal">{n.label}</span>
          {!hideCount && (
            <span className="text-xl font-extrabold tabular-nums" style={{ color: n.color }}>{total ?? 0}</span>
          )}
          {hideCount && !caption && (
            <span className="text-[11px] font-bold text-foreground/70 leading-none">—</span>
          )}
        </div>
      </div>
      {caption && (
        <div className="pt-1 border-t" style={{ borderColor: `${n.color}22` }}>
          <span className="text-[10px] font-semibold text-foreground leading-tight break-words">{caption}</span>
        </div>
      )}
      {breakdown.length > 0 && (
        <div className="space-y-0.5 pt-1 border-t" style={{ borderColor: `${n.color}22` }}>
          {breakdown.map((r) => (
            <div key={r.label} title={r.label} className="flex items-center justify-between gap-1 text-[9px] leading-tight">
              <span className="text-muted-foreground flex items-center gap-1 min-w-0">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="font-bold tabular-nums text-foreground">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {live.length > 0 && (
        <div className="pt-1 border-t space-y-0.5" style={{ borderColor: `${n.color}22` }}>
          <p className="text-[9px] text-muted-foreground font-medium">Clocked in now</p>
          {live.slice(0, 3).map((name, i) => (
            <div key={i} className="flex items-center gap-1 text-[9px] text-foreground">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="truncate">{name}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
    </>
  );
}
