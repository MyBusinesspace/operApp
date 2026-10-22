import React, { useState, useEffect } from "react";
import FlowGraph from "./FlowGraph";

// Desktop layout: two parallel tracks (Customer / Organization) merge at Task,
// then Task -> Timesheets -> Reports and Task linked to Bills <- Providers.
// Assets is linked (∞) to both Customer and Organization.
const DESKTOP = {
  canvas: { w: 895, h: 410 },
  nodes: {
    asset:        { x: 70,  y: 132, w: 130, h: 108 },
    customer:     { x: 220, y: 70,  w: 130, h: 95 },
    organization: { x: 220, y: 195, w: 140, h: 72 },
    project:      { x: 370, y: 70,  w: 130, h: 108 },
    invoice:      { x: 370, y: 195, w: 130, h: 108 },
    wo:           { x: 520, y: 70,  w: 130, h: 95 },
    tasks:        { x: 520, y: 195, w: 130, h: 108 },
    bill:         { x: 670, y: 195, w: 130, h: 108 },
    providers:    { x: 820, y: 195, w: 130, h: 95 },
    timesheets:   { x: 520, y: 335, w: 130, h: 95 },
    reports:      { x: 370, y: 335, w: 130, h: 95 },
    employees:    { x: 220, y: 335, w: 130, h: 108 },
  },
  edges: [
    { from: "asset", to: "customer", type: "link" },
    { from: "asset", to: "organization", type: "link" },
    { from: "organization", to: "customer", type: "arrow" },
    { from: "organization", to: "employees", type: "arrow" },
    { from: "customer", to: "project", type: "arrow" },
    { from: "organization", to: "invoice", type: "arrow" },
    { from: "project", to: "invoice", type: "link" },
    { from: "project", to: "wo", type: "arrow" },
    { from: "wo", to: "tasks", type: "arrow" },
    { from: "invoice", to: "tasks", type: "link" },
    { from: "invoice", to: "reports", type: "link" },
    { from: "tasks", to: "timesheets", type: "arrow" },
    { from: "timesheets", to: "reports", type: "arrow" },
    { from: "tasks", to: "bill", type: "link" },
    { from: "providers", to: "bill", type: "arrow" },
    { from: "reports", to: "employees", type: "link" },
  ],
};

// Mobile layout: compact 2-column grid preserving the same relationships.
const MOBILE = {
  canvas: { w: 240, h: 852 },
  nodes: {
    asset:        { x: 120, y: 55,  w: 104, h: 108 },
    customer:     { x: 62,  y: 175, w: 104, h: 95 },
    organization: { x: 178, y: 175, w: 104, h: 72 },
    project:      { x: 62,  y: 295, w: 104, h: 108 },
    invoice:      { x: 178, y: 295, w: 104, h: 108 },
    employees:    { x: 62,  y: 425, w: 104, h: 108 },
    reports:      { x: 178, y: 425, w: 104, h: 95 },
    wo:           { x: 62,  y: 555, w: 104, h: 95 },
    bill:         { x: 178, y: 555, w: 104, h: 108 },
    tasks:        { x: 62,  y: 685, w: 104, h: 108 },
    providers:    { x: 178, y: 685, w: 104, h: 95 },
    timesheets:   { x: 120, y: 815, w: 104, h: 95 },
  },
  edges: [
    { from: "asset", to: "customer", type: "link" },
    { from: "asset", to: "organization", type: "link" },
    { from: "organization", to: "customer", type: "arrow" },
    { from: "organization", to: "employees", type: "arrow" },
    { from: "customer", to: "project", type: "arrow" },
    { from: "organization", to: "invoice", type: "arrow" },
    { from: "project", to: "invoice", type: "link" },
    { from: "project", to: "wo", type: "arrow" },
    { from: "wo", to: "tasks", type: "arrow" },
    { from: "invoice", to: "tasks", type: "link" },
    { from: "invoice", to: "reports", type: "link" },
    { from: "tasks", to: "timesheets", type: "arrow" },
    { from: "timesheets", to: "reports", type: "arrow" },
    { from: "tasks", to: "bill", type: "link" },
    { from: "providers", to: "bill", type: "arrow" },
    { from: "reports", to: "employees", type: "link" },
  ],
};

export default function OperationsFlowDiagram({ counts = {}, headerExtra }) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== "undefined" ? window.innerWidth >= 960 : true
  );
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 960);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const layout = isDesktop ? DESKTOP : MOBILE;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 relative overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          background:
            "radial-gradient(circle at 20% 50%, #818cf8, transparent 40%), radial-gradient(circle at 80% 50%, #f43f5e, transparent 40%)",
        }}
      />
      <div className="relative">
        <div className="flex items-center justify-between mb-6 gap-4">
          <div>
            <h3 className="text-base font-semibold text-foreground tracking-tight mb-1">Operations flow</h3>
            <p className="text-xs text-muted-foreground">How work moves from customers and providers through to financial documents.</p>
          </div>
          {headerExtra}
        </div>

        <div className="overflow-x-auto pb-2 -mx-1 px-1">
          <FlowGraph
            nodes={layout.nodes}
            edges={layout.edges}
            canvas={layout.canvas}
            counts={counts}
            markerId={isDesktop ? "fg-d" : "fg-m"}
          />
        </div>

        <div className="flex items-center justify-center gap-5 text-xs text-muted-foreground mt-3 flex-wrap">
          <span className="flex items-center gap-1.5">
            <svg width="28" height="14" viewBox="0 0 28 14">
              <line x1="2" y1="7" x2="26" y2="7" stroke="#6366f1" strokeWidth="2" strokeDasharray="4 3" />
              <circle cx="12" cy="7" r="4" fill="none" stroke="#6366f1" strokeWidth="1.8" />
              <circle cx="16" cy="7" r="4" fill="none" stroke="#6366f1" strokeWidth="1.8" />
            </svg>
            linked (many-to-many)
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="28" height="14" viewBox="0 0 28 14">
              <defs>
                <marker id="lg-ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#71717a" />
                </marker>
              </defs>
              <line x1="2" y1="7" x2="22" y2="7" stroke="#71717a" strokeWidth="2" strokeDasharray="4 3" markerEnd="url(#lg-ah)" />
            </svg>
            belongs to (membership)
          </span>
        </div>
      </div>
    </div>
  );
}