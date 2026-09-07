import React from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Search, ArrowUpRight } from "lucide-react";

export const MASCOT_URL =
  "https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png";

// ── Header (breadcrumb + actions) ────────────────────────────────────
export function DarkHeader({ sectionLabel, searchLabel = "Search", createLabel = "Create", createTo = "/" }) {
  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-medium tracking-tight">
          <span>Overview</span>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground">{sectionLabel}</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium px-3 py-1.5 rounded-lg hover:bg-accent">
            <Search className="w-3.5 h-3.5" /> {searchLabel}
          </button>
          <Link to={createTo}>
            <button className="flex items-center gap-1.5 text-xs text-primary-foreground bg-primary hover:bg-primary/90 transition-colors font-semibold px-3.5 py-1.5 rounded-lg">
              {createLabel} <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Hero with mascot (themed bg) ─────────────────────────────────────
export function DarkHero({ title, subtitle, mascot = true }) {
  return (
    <div className="flex items-start gap-6">
      {mascot && (
        <div className="hidden sm:flex shrink-0 items-center justify-center w-20 h-20 rounded-2xl bg-card shadow-lg shadow-foreground/10">
          <img src={MASCOT_URL} alt="operapp" className="h-16 w-16 object-contain" draggable={false} />
        </div>
      )}
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground" style={{ letterSpacing: "-0.02em" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="mt-3 text-[15px] text-muted-foreground max-w-2xl leading-relaxed">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

// ── Metric (no bubble — just colored icon + typography) ──────────────
export function Metric({ icon: Icon, iconColor, label, value }) {
  return (
    <div className="flex items-center gap-4">
      <Icon className={`w-6 h-6 ${iconColor}`} strokeWidth={1.5} />
      <div>
        <p className="text-[13px] text-muted-foreground font-medium tracking-tight">{label}</p>
        <p className="text-2xl font-bold text-foreground tracking-tight">{value}</p>
      </div>
    </div>
  );
}

// ── Status Row ───────────────────────────────────────────────────────
export function StatusRow({ title, count, amount, accentColor = "text-muted-foreground", onClick }) {
  return (
    <button onClick={onClick} className="flex items-center justify-between w-full py-2.5 text-left group">
      <span className="text-sm text-muted-foreground font-medium">{title}</span>
      <div className="flex items-center gap-3">
        {amount !== undefined && (
          <span className={`text-xs font-medium ${accentColor}`}>{amount}</span>
        )}
        <span className="text-sm font-semibold text-foreground tabular-nums">{count}</span>
      </div>
    </button>
  );
}

// ── Section container (themed bg) ────────────────────────────────────
export function DarkSection({ title, icon: Icon, iconColor, seeAllTo, children, bgClass = "bg-card" }) {
  return (
    <div className={`rounded-2xl border border-border ${bgClass} overflow-hidden`}>
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon className={`w-[18px] h-[18px] ${iconColor}`} strokeWidth={1.5} />}
          <h2 className="text-[15px] font-semibold text-foreground tracking-tight">{title}</h2>
        </div>
        {seeAllTo && (
          <Link to={seeAllTo} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors font-medium">
            See all <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        )}
      </div>
      <div className="h-px bg-border" />
      <div className="px-6 py-2">{children}</div>
    </div>
  );
}

// ── Quick Link card ──────────────────────────────────────────────────
export function DarkQuickLink({ to, icon: Icon, iconColor, label, subtitle }) {
  return (
    <Link to={to} className="group flex items-center gap-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors p-4">
      <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
    </Link>
  );
}

// ── Loading state ────────────────────────────────────────────────────
export function DarkLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-7 h-7 border-2 border-muted border-t-primary rounded-full animate-spin" />
    </div>
  );
}