import { MoreHorizontal } from "lucide-react";

export default function WidgetCard({ title, subtitle, children, className = "", headerRight }) {
  return (
    <div className={`bg-card border border-border rounded-xl shadow-sm flex flex-col ${className}`}>
      <div className="flex items-start justify-between px-5 pt-4 pb-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
          <button className="text-muted-foreground/60 hover:text-foreground transition-colors">
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}