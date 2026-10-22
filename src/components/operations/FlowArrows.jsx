import React from "react";

export const FLOW_COLOR = "#71717a";
export const LINK_COLOR = "#6366f1";

const MARKER = { markerWidth: 9, markerHeight: 9, refX: 9, refY: 4.5 };

export function HArrow({ width = 28 }) {
  return (
    <svg width={width} height="24" viewBox={`0 0 ${width} 24`} fill="none" className="shrink-0 self-center">
      <defs>
        <marker id="ah-h" markerUnits="userSpaceOnUse" {...MARKER} orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill={FLOW_COLOR} />
        </marker>
      </defs>
      <path d={`M 4 12 L ${width - 4} 12`} fill="none" stroke={FLOW_COLOR} strokeWidth="2" strokeDasharray="4 3" className="operapp-flow-arrow" markerEnd="url(#ah-h)" />
    </svg>
  );
}

export function TwoWayArrow({ width = 28 }) {
  return (
    <svg width={width} height="24" viewBox={`0 0 ${width} 24`} fill="none" className="shrink-0 self-center">
      <defs>
        <marker id="ah-2w" markerUnits="userSpaceOnUse" {...MARKER} orient="auto-start-reverse">
          <path d="M0,0 L9,4.5 L0,9 Z" fill={LINK_COLOR} />
        </marker>
      </defs>
      <path d={`M 5 12 L ${width - 5} 12`} fill="none" stroke={LINK_COLOR} strokeWidth="2" strokeDasharray="4 3" className="operapp-flow-arrow" markerStart="url(#ah-2w)" markerEnd="url(#ah-2w)" />
    </svg>
  );
}

export function DownArrow({ height = 36 }) {
  return (
    <svg width="24" height={height} viewBox={`0 0 24 ${height}`} fill="none" className="shrink-0">
      <defs>
        <marker id="ah-dn" markerUnits="userSpaceOnUse" {...MARKER} orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill={FLOW_COLOR} />
        </marker>
      </defs>
      <path d={`M 12 2 L 12 ${height - 4}`} fill="none" stroke={FLOW_COLOR} strokeWidth="2" strokeDasharray="4 3" className="operapp-flow-arrow" markerEnd="url(#ah-dn)" />
    </svg>
  );
}

export function SplitConnector({ width = 36, height = 260, edge = 62 }) {
  const mid = height / 2;
  const top = edge;
  const bottom = height - edge;
  const c = width / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className="shrink-0 self-center">
      <defs>
        <marker id="ah-sp" markerUnits="userSpaceOnUse" {...MARKER} orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill={FLOW_COLOR} />
        </marker>
      </defs>
      <path d={`M 0 ${mid} C ${c} ${mid}, ${c} ${top}, ${width - 2} ${top}`} fill="none" stroke={FLOW_COLOR} strokeWidth="2" strokeDasharray="4 3" className="operapp-flow-arrow" markerEnd="url(#ah-sp)" />
      <path d={`M 0 ${mid} C ${c} ${mid}, ${c} ${bottom}, ${width - 2} ${bottom}`} fill="none" stroke={FLOW_COLOR} strokeWidth="2" strokeDasharray="4 3" className="operapp-flow-arrow" markerEnd="url(#ah-sp)" />
    </svg>
  );
}

export function MergeConnector({ width = 36, height = 260, edge = 62 }) {
  const mid = height / 2;
  const top = edge;
  const bottom = height - edge;
  const c = width / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} fill="none" className="shrink-0 self-center">
      <defs>
        <marker id="ah-mg" markerUnits="userSpaceOnUse" {...MARKER} orient="auto">
          <path d="M0,0 L9,4.5 L0,9 Z" fill={FLOW_COLOR} />
        </marker>
      </defs>
      <path d={`M 0 ${top} C ${c} ${top}, ${c} ${mid}, ${width - 2} ${mid}`} fill="none" stroke={FLOW_COLOR} strokeWidth="2" strokeDasharray="4 3" className="operapp-flow-arrow" markerEnd="url(#ah-mg)" />
      <path d={`M 0 ${bottom} C ${c} ${bottom}, ${c} ${mid}, ${width - 2} ${mid}`} fill="none" stroke={FLOW_COLOR} strokeWidth="2" strokeDasharray="4 3" className="operapp-flow-arrow" markerEnd="url(#ah-mg)" />
    </svg>
  );
}
