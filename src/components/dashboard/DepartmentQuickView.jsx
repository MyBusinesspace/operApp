import React from "react";
import { Link } from "react-router-dom";
import { Building2, Wrench, TrendingUp, TrendingDown, Users, BarChart3, ChevronRight } from "lucide-react";

const DEPARTMENTS = [
  { key: "business",   label: "Business",   path: "/business-overview",    icon: Building2,    iconClass: "text-indigo-400",  tintClass: "bg-indigo-500/10" },
  { key: "operations", label: "Operations", path: "/operations-overview",  icon: Wrench,       iconClass: "text-emerald-400", tintClass: "bg-emerald-500/10" },
  { key: "sales",      label: "Sales",      path: "/sales-overview",       icon: TrendingUp,   iconClass: "text-emerald-400", tintClass: "bg-emerald-500/10" },
  { key: "purchases",  label: "Purchases",  path: "/purchasing-overview",  icon: TrendingDown, iconClass: "text-sky-400",     tintClass: "bg-sky-500/10" },
  { key: "timehr",     label: "Time & HR",  path: "/timehr-overview",      icon: Users,        iconClass: "text-amber-400",   tintClass: "bg-amber-500/10" },
  { key: "accounting", label: "Accounting", path: "/accounting",           icon: BarChart3,    iconClass: "text-indigo-400",  tintClass: "bg-indigo-500/10" },
];

export default function DepartmentQuickView({ departments = [] }) {
  const rowsFor = (key) => departments.find((d) => d.key === key)?.rows || [];

  return (
    <div>
      <h3 className="text-xs font-semibold text-foreground mb-3">Departments</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {DEPARTMENTS.map((dept) => (
          <Link
            key={dept.key}
            to={dept.path}
            className="group flex flex-col rounded-xl border border-border bg-card hover:border-primary/40 transition-colors"
          >
            <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
              <div className={`p-1.5 rounded-lg ${dept.tintClass}`}>
                <dept.icon className={`w-4 h-4 ${dept.iconClass}`} strokeWidth={1.5} />
              </div>
              <span className="text-xs font-semibold text-foreground">{dept.label}</span>
              <ChevronRight className="w-3.5 h-3.5 ml-auto text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="px-4 py-2 flex-1">
              {rowsFor(dept.key).map((row, i) => (
                <div
                  key={row.label}
                  className={`flex items-baseline justify-between gap-3 py-1.5 ${i > 0 ? "border-t border-border/60" : ""}`}
                >
                  <span className="text-[11px] text-muted-foreground">{row.label}</span>
                  <span className="text-right">
                    <span className="text-xs font-semibold text-foreground tabular-nums">{row.value}</span>
                    {row.sub && <span className="block text-[10px] text-muted-foreground tabular-nums">{row.sub}</span>}
                  </span>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}