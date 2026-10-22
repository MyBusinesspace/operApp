import React from "react";
import Node from "./FlowNode";

const FLOW_COLOR = "#71717a";
const LINK_COLOR = "#6366f1";

// Trim a line between two node centers so it starts/ends at the node borders.
function trim(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (!dx && !dy) return [a, b];
  const edge = (c, ddx, ddy) => {
    const hw = c.w / 2;
    const hh = c.h / 2;
    const t = Math.min(hw / Math.abs(ddx || 1e-6), hh / Math.abs(ddy || 1e-6));
    return { x: c.x + ddx * t, y: c.y + ddy * t };
  };
  return [edge(a, dx, dy), edge(b, -dx, -dy)];
}

export default function FlowGraph({ nodes, edges, canvas, counts, markerId = "fg" }) {
  return (
    <div className="relative mx-auto" style={{ width: canvas.w, height: canvas.h }}>
      <svg
        width={canvas.w}
        height={canvas.h}
        className="absolute inset-0 pointer-events-none"
        style={{ overflow: "visible" }}
      >
        <defs>
          <marker
            id={`${markerId}-arrow`}
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L10,5 L0,10 Z" fill={FLOW_COLOR} />
          </marker>
        </defs>
        {edges.map((ed, i) => {
          const [s, e] = trim(nodes[ed.from], nodes[ed.to]);
          if (ed.type === "arrow") {
            return (
              <line
                key={i}
                x1={s.x}
                y1={s.y}
                x2={e.x}
                y2={e.y}
                stroke={FLOW_COLOR}
                strokeWidth="2"
                strokeDasharray="5 3" className="operapp-flow-arrow"
                markerEnd={`url(#${markerId}-arrow)`}
              />
            );
          }
          // linked (∞) — two overlapping circles at the midpoint
          const mx = (s.x + e.x) / 2;
          const my = (s.y + e.y) / 2;
          const dx = e.x - s.x;
          const dy = e.y - s.y;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const r = 5;
          const off = 3;
          return (
            <g key={i}>
              <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke={LINK_COLOR} strokeWidth="2" strokeDasharray="5 3" className="operapp-flow-arrow" />
              <circle cx={mx - ux * off} cy={my - uy * off} r={r} fill="none" stroke={LINK_COLOR} strokeWidth="2" />
              <circle cx={mx + ux * off} cy={my + uy * off} r={r} fill="none" stroke={LINK_COLOR} strokeWidth="2" />
            </g>
          );
        })}
      </svg>
      {Object.entries(nodes).map(([id, c]) => (
        <div
          key={id}
          className="absolute"
          style={{ left: c.x, top: c.y, transform: "translate(-50%, -50%)", width: c.w, zIndex: 2 }}
        >
          <Node
            id={id}
            width={c.w}
            total={counts[id]?.total}
            hideCount={!!counts[id]?.hideCount}
            caption={counts[id]?.caption}
            breakdown={counts[id]?.breakdown || []}
          />
        </div>
      ))}
    </div>
  );
}
