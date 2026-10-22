import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ChevronUp, ChevronDown, Eye, EyeOff, Layers,
  Heading, FileText, Type,
} from "lucide-react";

const ROW_LABELS = {
  generalColumns: "General Columns",
  taskTitle: "Task Title",
  taskDescription: "Task Description",
  taskNotes: "Task Notes",
  subtasks: "Subtasks",
  workDescription: "Work Description",
  balanceWork: "Balance Work",
  timeTracker: "Time Tracker",
  comments: "Client Comments",
  signatureRow: "Signature Row",
  full: "Custom Row",
  pair: "Pair Row",
  equipment: "Equipment",
};

// Row types that support a label override rendered by the preview
const LABELABLE_ROWS = new Set(["full", "pair", "taskTitle", "taskDescription", "taskNotes", "subtasks", "workDescription", "balanceWork"]);

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-foreground">{label}</span>
      <Switch checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}

/**
 * ReportLayoutPanel — side panel that lists every available layout option
 * for the Working Report template being edited.
 *
 * Props:
 *   layout: the template.layout object
 *   onChange: (newLayout) => void
 */
export default function ReportLayoutPanel({ layout, onChange }) {
  const [openSection, setOpenSection] = useState(null);

  const update = (patch) => onChange({ ...layout, ...patch });
  const updateHeader = (key, val) => update({ header: { ...layout.header, [key]: val } });
  const updateFooter = (key, val) => update({ footer: { ...layout.footer, [key]: val } });

  const updateSection = (idx, patch) => {
    const sections = [...layout.sections];
    sections[idx] = { ...sections[idx], ...patch };
    update({ sections });
  };

  const moveSection = (idx, dir) => {
    const sections = [...layout.sections];
    const target = idx + dir;
    if (target < 0 || target >= sections.length) return;
    [sections[idx], sections[target]] = [sections[target], sections[idx]];
    update({ sections });
  };

  const updateRow = (sIdx, rIdx, patch) => {
    const sections = [...layout.sections];
    const rows = [...sections[sIdx].rows];
    rows[rIdx] = { ...rows[rIdx], ...patch };
    sections[sIdx] = { ...sections[sIdx], rows };
    update({ sections });
  };

  const moveRow = (sIdx, rIdx, dir) => {
    const sections = [...layout.sections];
    const rows = [...sections[sIdx].rows];
    const target = rIdx + dir;
    if (target < 0 || target >= rows.length) return;
    [rows[rIdx], rows[target]] = [rows[target], rows[rIdx]];
    sections[sIdx] = { ...sections[sIdx], rows };
    update({ sections });
  };

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-foreground">
          <Heading className="w-3.5 h-3.5 text-primary" /> Header
        </div>
        <ToggleRow label="Company info" checked={layout.header?.showCompany !== false} onChange={(v) => updateHeader("showCompany", v)} />
        <ToggleRow label="Document refs" checked={layout.header?.showDocRefs !== false} onChange={(v) => updateHeader("showDocRefs", v)} />
        <ToggleRow label="Title & status" checked={layout.header?.showTitleStatus !== false} onChange={(v) => updateHeader("showTitleStatus", v)} />
      </div>

      {/* ── Sections ── */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <Layers className="w-3.5 h-3.5 text-primary" /> Sections & Rows
        </div>
        {layout.sections.map((section, sIdx) => {
          const isOpen = openSection === sIdx;
          return (
            <div key={section.id} className="rounded-lg border border-border overflow-hidden">
              {/* Section header */}
              <div className="flex items-center gap-1.5 px-2 py-2 bg-muted/30">
                <Switch
                  checked={!section.hidden}
                  onCheckedChange={(v) => updateSection(sIdx, { hidden: !v })}
                  className="scale-75 origin-left"
                />
                <button
                  type="button"
                  className="flex-1 text-left text-xs font-medium text-foreground truncate"
                  onClick={() => setOpenSection(isOpen ? null : sIdx)}
                >
                  {section.num}. {section.label}
                </button>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30">
                    <ChevronUp className="w-3.5 h-3.5" />
                  </button>
                  <button type="button" onClick={() => moveSection(sIdx, 1)} disabled={sIdx === layout.sections.length - 1}
                    className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30">
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Section details (expandable) */}
              {isOpen && (
                <div className="px-3 py-2.5 space-y-2.5 border-t border-border">
                  {/* Section label & number */}
                  <div className="flex gap-2">
                    <Input
                      value={section.num || ""}
                      onChange={(e) => updateSection(sIdx, { num: e.target.value })}
                      className="h-7 w-12 text-xs text-center"
                      placeholder="#"
                    />
                    <Input
                      value={section.label || ""}
                      onChange={(e) => updateSection(sIdx, { label: e.target.value })}
                      className="h-7 flex-1 text-xs"
                      placeholder="Section label"
                    />
                  </div>
                  <ToggleRow label="Wrap in border (grouping)" checked={section.wrap !== false} onChange={(v) => updateSection(sIdx, { wrap: v })} />

                  {/* Rows */}
                  <div className="space-y-1.5 pt-1 border-t border-border">
                    {section.rows.map((row, rIdx) => (
                      <div key={rIdx} className="rounded-md border border-border/60 px-2 py-1.5 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Switch
                            checked={!row.hidden}
                            onCheckedChange={(v) => updateRow(sIdx, rIdx, { hidden: !v })}
                            className="scale-75 origin-left"
                          />
                          <span className="flex-1 text-xs text-foreground truncate">
                            {ROW_LABELS[row.type] || row.type}
                          </span>
                          <div className="flex items-center gap-0.5">
                            <button type="button" onClick={() => moveRow(sIdx, rIdx, -1)} disabled={rIdx === 0}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30">
                              <ChevronUp className="w-3 h-3" />
                            </button>
                            <button type="button" onClick={() => moveRow(sIdx, rIdx, 1)} disabled={rIdx === section.rows.length - 1}
                              className="p-0.5 rounded hover:bg-muted text-muted-foreground disabled:opacity-30">
                              <ChevronDown className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Label rename (for rows that support it) */}
                        {LABELABLE_ROWS.has(row.type) && !row.hidden && (
                          <div className="flex gap-1.5 pl-6">
                            <Input
                              value={row.label || ""}
                              onChange={(e) => updateRow(sIdx, rIdx, { label: e.target.value })}
                              className="h-6 flex-1 text-xs"
                              placeholder="Label"
                            />
                            {row.type === "pair" && (
                              <Input
                                value={row.label2 || ""}
                                onChange={(e) => updateRow(sIdx, rIdx, { label2: e.target.value })}
                                className="h-6 flex-1 text-xs"
                                placeholder="Label 2"
                              />
                            )}
                          </div>
                        )}

                        {/* Subtotal toggle for timeTracker */}
                        {row.type === "timeTracker" && !row.hidden && (
                          <div className="pl-6">
                            <ToggleRow label="Show total / subtotal row" checked={row.showTotal !== false} onChange={(v) => updateRow(sIdx, rIdx, { showTotal: v })} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      <div className="rounded-lg border border-border p-3">
        <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold text-foreground">
          <FileText className="w-3.5 h-3.5 text-primary" /> Footer
        </div>
        <ToggleRow label="Show footer" checked={layout.footer?.show !== false} onChange={(v) => updateFooter("show", v)} />
      </div>
    </div>
  );
}