import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { DEFAULT_LAYOUT, resolveLayout, resolveBind } from "@/lib/workingReportLayout";

// Unified Working Report document renderer.
// The report structure (sections, rows, variable bindings) is read from
// `template.layout` (stored in the database) so web and mobile render the same
// document. Identity/styling (logo, accent color, company, title) stays on the
// template. The PDF (WorkingReportPrint.jsx) is a separate jsPDF rendering.

const MOCK_ENTRY = {
  reference: "WR-2026-0042.1",
  work_order_name: "WO-2026-0042",
  contact_name: "Sample Client LLC",
  project_name: "Project Alpha",
  asset_name: "Unit #A42",
  task_title: "Routine HVAC Inspection & Filter Replacement",
  clock_in_time: "2026-06-04T08:02:00",
  clock_out_time: "2026-06-04T16:55:00",
  duration_minutes: 533,
  report_work_description: "Replaced return air filters on all units\nCleaned condenser coils and checked refrigerant\nVerified thermostat calibration",
  report_balance_work: "Replace supply duct gasket on Unit 3 (parts on order)",
  report_client_comments: "Service completed satisfactorily. No issues observed.",
  report_leader_name: "John Doe",
  employee_name: "John Doe",
};
const MOCK_TASK = {
  title: "Routine HVAC Inspection & Filter Replacement",
  description: "Quarterly preventive maintenance of HVAC units across Site A. Inspect filters, coils, refrigerant levels and thermostat calibration.",
  notes: "Client requests extra attention to Unit #A42 (recurring airflow complaint).",
  status: "Completed",
  work_order_name: "WO-2026-0042",
  contact_name: "Sample Client LLC",
  project_name: "Project Alpha",
  location_address: "Site A, Dubai",
  asset_name: "Unit #A42",
  assigned_employee_names: ["John Doe", "Ahmed Ali"],
  subtasks: [
    { title: "Inspect filters", done: true },
    { title: "Replace worn gaskets", done: false },
    { title: "Log meter readings", done: false },
  ],
};
const MOCK_WO_CPS = [{ full_name: "John Smith", phone: "+971 50 123 4567" }];
const MOCK_ASSET = { serial_number: "SN-A42-001", category: "Equipment" };
const MOCK_PARTICIPANTS = [
  { employee_name: "John Doe", clock_in_time: "2026-06-04T08:02:00", clock_out_time: "2026-06-04T16:55:00", duration_minutes: 533 },
  { employee_name: "Ahmed Ali", clock_in_time: "2026-06-04T08:30:00", clock_out_time: "2026-06-04T16:30:00", duration_minutes: 480 },
];

function fmtDate(iso) {
  if (!iso) return "—";
  return format(new Date(iso), "dd/MM/yyyy");
}
function fmtTime(iso) {
  if (!iso) return "—";
  return format(new Date(iso), "HH:mm");
}
function fmtDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function WorkingReportPreview({ template, entry, task }) {
  const realMode = !!(entry || task);
  const t = template || {};
  const e = realMode ? (entry || {}) : MOCK_ENTRY;
  const tk = realMode ? (task || {}) : MOCK_TASK;
  const accent = t.accent_color || "#cc0000";
  const title = t.report_title || "SERVICE & MAINTENANCE REPORT";
  const layout = resolveLayout(t);

  const [woCps, setWoCps] = useState(realMode ? [] : MOCK_WO_CPS);
  const [asset, setAsset] = useState(realMode ? null : MOCK_ASSET);
  const [participants, setParticipants] = useState(realMode ? [] : MOCK_PARTICIPANTS);
  const [assetFields, setAssetFields] = useState([]);

  useEffect(() => {
    let active = true;
    base44.entities.AssetField.list("sort_order", 50)
      .then(list => { if (active) setAssetFields((list || []).filter(f => f.is_active !== false)); })
      .catch(() => { if (active) setAssetFields([]); });
    if (!realMode) return () => { active = false; };
    const woId = e.work_order_id || tk.work_order_id;
    if (!woId) { setWoCps([]); }
    else {
      base44.entities.ContactPerson.filter({ work_order_id: woId }, "full_name", 50)
        .then(cps => { if (active) setWoCps(cps || []); })
        .catch(() => { if (active) setWoCps([]); });
    }
    const assetId = tk.asset_id || e.asset_id;
    if (!assetId) { setAsset(null); }
    else {
      base44.entities.Asset.get(assetId)
        .then(a => { if (active) setAsset(a); })
        .catch(() => { if (active) setAsset(null); });
    }
    const taskId = e.task_id || tk.id;
    if (!taskId) { setParticipants([]); }
    else {
      base44.entities.TimeEntry.filter({ task_id: taskId }, "clock_in_time", 200)
        .then(entries => {
          if (!active) return;
          const reportDay = e.clock_in_time
            ? new Date(e.clock_in_time).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" })
            : "";
          const dayKey = (iso) => iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }) : "";
          const parts = (entries || [])
            .filter(te => !reportDay || dayKey(te.clock_in_time) === reportDay)
            .map(te => ({
              employee_id: te.employee_id,
              employee_name: te.employee_name,
              clock_in_time: te.clock_in_time,
              clock_out_time: te.clock_out_time,
              duration_minutes: te.duration_minutes,
            }));
          if (active) setParticipants(parts);
        })
        .catch(() => { if (active) setParticipants([]); });
    }
    return () => { active = false; };
  }, [realMode, e.work_order_id, tk.work_order_id, tk.asset_id, e.asset_id, e.task_id, tk.id, e.clock_in_time]);

  const woContactLabel = woCps.length > 0
    ? woCps.map(cp => cp.phone ? `${cp.full_name} (${cp.phone})` : cp.full_name).join(" · ")
    : "";

  const bindCtx = { entry: e, task: tk, woContactLabel };

  // ── Row primitives (unchanged visuals) ────────────────────────────────────
  const Row = ({ label, val1, label2, val2 }) => (
    <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0" }}>
      <div style={{ width: "20%", padding: "3px 5px", fontSize: 7, fontWeight: 700, color: "#555", background: "#fafafa", borderRight: "1px solid #e0e0e0" }}>{label}</div>
      <div style={{ width: "30%", minWidth: 0, padding: "3px 5px", fontSize: 8, color: "#222", borderRight: label2 !== undefined ? "1px solid #e0e0e0" : "none", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{val1 || <span style={{ color: "#bbb" }}>—</span>}</div>
      {label2 !== undefined && <>
        <div style={{ width: "22%", padding: "3px 5px", fontSize: 7, fontWeight: 700, color: "#555", background: "#fafafa", borderRight: "1px solid #e0e0e0" }}>{label2}</div>
        <div style={{ flex: 1, minWidth: 0, padding: "3px 5px", fontSize: 8, color: "#222", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{val2 || <span style={{ color: "#bbb" }}>—</span>}</div>
      </>}
    </div>
  );

  const RowTriple = ({ l1, v1, l2, v2, l3, v3 }) => (
    <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0" }}>
      {[{ l: l1, v: v1 }, { l: l2, v: v2 }, { l: l3, v: v3 }].map((c, i) => (
        <div key={i} style={{ flex: 1, padding: "3px 5px", borderRight: i < 2 ? "1px solid #e0e0e0" : "none" }}>
          <div style={{ fontSize: 7, fontWeight: 700, color: "#555" }}>{c.l}</div>
          <div style={{ fontSize: 8, color: "#222", marginTop: 1, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{c.v || <span style={{ color: "#bbb" }}>—</span>}</div>
        </div>
      ))}
    </div>
  );

  const RowFull = ({ label, value }) => (
    <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0" }}>
      <div style={{ width: "20%", padding: "3px 5px", fontSize: 7, fontWeight: 700, color: "#555", background: "#fafafa", borderRight: "1px solid #e0e0e0" }}>{label}</div>
      <div style={{ flex: 1, padding: "3px 5px", fontSize: 8, color: "#222" }}>{value || <span style={{ color: "#bbb" }}>—</span>}</div>
    </div>
  );

  const SectionHeader = ({ num, label }) => (
    <div style={{ background: accent, color: "#fff", padding: "3px 6px", fontSize: 8, fontWeight: 700, marginTop: 6 }}>
      {num}. {label}
    </div>
  );

  // ── Row renderer driven by the stored layout ───────────────────────────────
  const renderRow = (row) => {
    switch (row.type) {
      case "full":
        return <RowFull label={row.label} value={resolveBind(row.bind, bindCtx)} />;
      case "pair":
        return <Row label={row.label} val1={resolveBind(row.bind, bindCtx)} label2={row.label2} val2={resolveBind(row.bind2, bindCtx)} />;
      case "generalColumns":
        return ((() => {
          const cfVal = (i) => {
            const def = assetFields[i];
            if (!def || !asset?.custom_fields) return "";
            const v = asset.custom_fields[def.id];
            return v == null ? "" : String(v);
          };
          const leftRows = [
            { label: "COMPANY", val: resolveBind("company", bindCtx) },
            { label: "LOCATION", val: resolveBind("location", bindCtx) },
            { label: "PROJECT", val: resolveBind("project", bindCtx) },
            { label: "WORK ORDER", val: resolveBind("workOrder", bindCtx) },
            { label: "CONTACT", val: resolveBind("woContact", bindCtx) },
          ];
          const rightRows = [
            { label: "EQUIPMENT NAME", val: tk.asset_name || e.asset_name || asset?.name },
            { label: "CATEGORY", val: asset?.category },
            { label: "STATUS", val: asset?.status },
            { label: (assetFields[0] && assetFields[0].name) || "SERIAL NUMBER", val: cfVal(0) },
            { label: (assetFields[1] && assetFields[1].name) || "LOAD / MAX LOAD", val: cfVal(1) },
          ];
          const renderCol = (rows, isRight) => (
            <div style={{ flex: 1, minWidth: 0, borderRight: isRight ? "none" : "1px solid #e0e0e0" }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: "flex", borderBottom: i < rows.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <div style={{ width: "38%", padding: "2px 4px", fontSize: 6.5, fontWeight: 700, color: "#555", background: "#fafafa", borderRight: "1px solid #e0e0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
                  <div style={{ flex: 1, minWidth: 0, padding: "2px 4px", fontSize: 8, color: r.val ? "#222" : "#bbb", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{r.val || "—"}</div>
                </div>
              ))}
            </div>
          );
          return (
            <div style={{ display: "flex" }}>
              {renderCol(leftRows, false)}
              {renderCol(rightRows, true)}
            </div>
          );
        })());
      case "equipment":
        return ((() => {
          const cfVal = (i) => {
            const def = assetFields[i];
            if (!def || !asset?.custom_fields) return "";
            const v = asset.custom_fields[def.id];
            return v == null ? "" : String(v);
          };
          const cols = [
            { label: "NAME",     val: tk.asset_name || e.asset_name || asset?.name },
            { label: "CATEGORY", val: asset?.category },
            { label: "STATUS",   val: asset?.status },
            { label: (assetFields[0] && assetFields[0].name) || "FIELD 1", val: cfVal(0) },
            { label: (assetFields[1] && assetFields[1].name) || "FIELD 2", val: cfVal(1) },
          ];
          return (
            <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0" }}>
              <div style={{ width: 52, flexShrink: 0, padding: "3px 5px", fontSize: 7, fontWeight: 700, color: "#555", background: "#fafafa", borderRight: "1px solid #e0e0e0", display: "flex", alignItems: "center" }}>EQUIPMENT</div>
              {cols.map((c, i) => (
                <div key={i} style={{ flex: 1, padding: "3px 5px", borderRight: i < 4 ? "1px solid #e0e0e0" : "none", minWidth: 0 }}>
                  <div style={{ fontSize: 6.5, fontWeight: 700, color: "#555", whiteSpace: "nowrap" }}>{c.label}</div>
                  <div style={{ fontSize: 8, color: c.val ? "#222" : "#bbb", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.val || "—"}</div>
                </div>
              ))}
            </div>
          );
        })());
      case "taskTitle":
        return (e.task_title || tk.title) ? (
          <div style={{ padding: "5px 6px" }}>
            <div style={{ fontSize: 6.5, fontWeight: 700, color: "#555", marginBottom: 1 }}>TITLE</div>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#1a1a2e", lineHeight: 1.3 }}>{e.task_title || tk.title}</div>
          </div>
        ) : null;
      case "taskDescription":
        return tk.description ? (
          <div style={{ padding: "5px 6px" }}>
            <div style={{ fontSize: 6.5, fontWeight: 700, color: "#555", marginBottom: 1 }}>DESCRIPTION</div>
            <div style={{ fontSize: 8, color: "#222", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{tk.description}</div>
          </div>
        ) : null;
      case "taskNotes":
        return tk.notes ? (
          <div style={{ padding: "5px 6px" }}>
            <div style={{ fontSize: 6.5, fontWeight: 700, color: "#555", marginBottom: 1 }}>NOTES</div>
            <div style={{ fontSize: 8, color: "#222", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{tk.notes}</div>
          </div>
        ) : null;
      case "subtasks": {
        const subtasks = tk.subtasks || [];
        if (subtasks.length === 0) return null;
        return (
          <React.Fragment>
            <div style={{ background: "#222", color: "#fff", padding: "2.5px 5px", fontSize: 7, fontWeight: 700 }}>SUBTASKS</div>
            {subtasks.map((sub, i) => (
              <div key={i} style={{ display: "flex", borderBottom: "1px solid #e8e8e8" }}>
                <div style={{ width: 16, display: "flex", alignItems: "center", justifyContent: "center", borderRight: "1px solid #e0e0e0" }}>
                  <div style={{ width: 8, height: 8, border: `1px solid ${sub.done ? "#228b57" : "#ccc"}`, borderRadius: 1, background: sub.done ? "#228b57" : "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {sub.done && <span style={{ color: "#fff", fontSize: 6, lineHeight: 1, fontWeight: 700 }}>✓</span>}
                  </div>
                </div>
                <div style={{ flex: 1, padding: "3px 5px", fontSize: 7.5, color: "#333" }}>{sub.title || sub.name || ""}</div>
              </div>
            ))}
          </React.Fragment>
        );
      }
      case "workDescription":
        return e.report_work_description ? (
          <React.Fragment>
            <div style={{ background: "#222", color: "#fff", padding: "2.5px 5px", fontSize: 7, fontWeight: 700 }}>DESCRIBE YOUR WORK</div>
            <div style={{
              padding: "4px 6px 6px",
              fontSize: 10,
              color: "#222",
              lineHeight: 1.6,
              borderBottom: e.report_balance_work ? "1px solid #e0e0e0" : "none",
            }}>
              {e.report_work_description.split("\n").filter(l => l.trim()).map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: "#000", fontWeight: 700 }}>•</span>
                  <span style={{ whiteSpace: "pre-wrap" }}>{l}</span>
                </div>
              ))}
            </div>
          </React.Fragment>
        ) : null;
      case "balanceWork":
        return e.report_balance_work ? (
          <React.Fragment>
            <div style={{ background: "#222", color: "#fff", padding: "2.5px 5px", fontSize: 7, fontWeight: 700 }}>BALANCE WORK</div>
            <div style={{ padding: "5px 6px", fontSize: 10, color: "#222", lineHeight: 1.6 }}>
              {e.report_balance_work.split("\n").filter(l => l.trim()).map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2 }}>
                  <span style={{ color: "#000", fontWeight: 700 }}>•</span>
                  <span style={{ whiteSpace: "pre-wrap" }}>{l}</span>
                </div>
              ))}
            </div>
          </React.Fragment>
        ) : null;
      case "timeTracker": {
        const reportAuthor = e.report_leader_name || e.employee_name || "";
        const rows = [];
        let totalMinutes = 0;
        if (participants.length > 0) {
          for (const p of participants) {
            const name = p.employee_name || "—";
            const isAuthor = reportAuthor && name === reportAuthor;
            const mins = p.duration_minutes || 0;
            totalMinutes += mins;
            rows.push({
              date: fmtDate(p.clock_in_time || e.clock_in_time || tk.planning_date),
              name: isAuthor ? `${name} *` : name,
              timeIn: fmtTime(p.clock_in_time),
              timeOut: fmtTime(p.clock_out_time),
              duration: mins ? fmtDuration(mins) : "—",
            });
          }
        } else {
          const workers = [
            ...(tk.assigned_employee_names || []),
            e.employee_name ? e.employee_name : null,
          ].filter((v, i, a) => v && a.indexOf(v) === i);
          for (const w of workers) {
            const isAuthor = reportAuthor && w === reportAuthor;
            const isEntry = w === e.employee_name;
            const mins = isEntry && e.duration_minutes ? e.duration_minutes : 0;
            totalMinutes += mins;
            rows.push({
              date: fmtDate(e.clock_in_time || tk.planning_date),
              name: isAuthor ? `${w} *` : w,
              timeIn: isEntry ? fmtTime(e.clock_in_time) : "—",
              timeOut: isEntry ? fmtTime(e.clock_out_time) : "—",
              duration: mins ? fmtDuration(mins) : "—",
            });
          }
        }
        if (rows.length === 0) return null;
        return (
          <div>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", borderBottom: "1px solid #e0e0e0" }}>
                <div style={{ width: "18%", padding: "1.5px 5px", fontSize: 7.5, color: "#222", borderRight: "1px solid #e0e0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.date}</div>
                <div style={{ width: "32%", padding: "1.5px 5px", fontSize: 7.5, color: "#222", fontWeight: r.name.endsWith(" *") ? 700 : 400, borderRight: "1px solid #e0e0e0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                <div style={{ width: "16%", padding: "1.5px 5px", fontSize: 7.5, color: "#555", borderRight: "1px solid #e0e0e0" }}>{r.timeIn}</div>
                <div style={{ width: "16%", padding: "1.5px 5px", fontSize: 7.5, color: "#555", borderRight: "1px solid #e0e0e0" }}>{r.timeOut}</div>
                <div style={{ flex: 1, padding: "1.5px 5px", fontSize: 7.5, color: "#555" }}>{r.duration}</div>
              </div>
            ))}
            <div style={{ display: "flex", background: accent, color: "#fff" }}>
              <div style={{ width: "50%", padding: "1.5px 5px", fontSize: 7.5, fontWeight: 700, borderRight: "1px solid rgba(255,255,255,0.2)" }}>TOTAL DURATION</div>
              <div style={{ flex: 1, padding: "1.5px 5px", fontSize: 7.5, fontWeight: 700, textAlign: "right" }}>{fmtDuration(totalMinutes)}</div>
            </div>
          </div>
        );
      }
      case "comments":
        return (
          <div style={{ border: "1px solid #e0e0e0", padding: "4px 6px", fontSize: 7.5, color: e.report_client_comments ? "#222" : "#aaa", marginBottom: 4, minHeight: 22 }}>
            {e.report_client_comments || "Client comments…"}
          </div>
        );
      case "signatureRow":
        return (
          <div style={{ display: "flex" }}>
            {[
              { label: "WORKER RESPONSIBLE FOR REPORT:", value: e.report_leader_name || e.employee_name },
              { label: "CLIENT NUMBER:", value: e.contact_name || tk.contact_name },
              { label: "SIGNATURE:", value: null, isSignature: true },
            ].map((col, i) => (
              <div key={i} style={{ flex: 1, border: "1px solid #e0e0e0", padding: "3px 4px", minHeight: 32, fontSize: 6.5, fontWeight: 700, color: "#555" }}>
                <div>{col.label}</div>
                {col.isSignature && e.report_client_signature
                  ? <img src={e.report_client_signature} alt="sig" style={{ maxWidth: "100%", maxHeight: 24, objectFit: "contain", marginTop: 2 }} />
                  : col.value && <div style={{ fontWeight: 400, color: "#555", fontSize: 7, marginTop: 2 }}>{col.value}</div>
                }
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ background: "#fff", padding: "16px 18px", fontSize: 9, color: "#1a1a2e", lineHeight: 1.4, boxShadow: "0 4px 32px rgba(0,0,0,0.10)", borderRadius: 8 }}>

      {/* HEADER */}
      {layout.header?.showCompany !== false && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {t.show_logo !== false && (t.logo_url
              ? <img src={t.logo_url} alt="logo" style={{ maxHeight: 40, maxWidth: 100, objectFit: "contain" }} />
              : <div style={{ width: 64, height: 34, border: `1.5px dashed ${accent}40`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: `${accent}08` }}><span style={{ fontSize: 6.5, color: "#bbb" }}>Logo</span></div>
            )}
            <div>
              <div style={{ fontSize: t.company_name_font_size || 22, fontWeight: 800, color: accent, lineHeight: 1 }}>{t.company_name || "Company Name"}</div>
              <div style={{ fontSize: 7, color: "#888", marginTop: 2 }}>
                {[t.company_phone && `Tel: ${t.company_phone}`, t.company_email, t.show_tax_number !== false && t.tax_id && `TRN: ${t.tax_id}`].filter(Boolean).join("  ·  ")}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ height: 1, background: "#ddd", marginBottom: 4 }} />

      {/* Doc refs */}
      {layout.header?.showDocRefs !== false && (
        <div style={{ textAlign: "right", fontSize: 7, color: "#888", marginBottom: 4, lineHeight: 1.6 }}>
          <div>Working order N: <span style={{ fontWeight: 600, color: "#333" }}>{e.work_order_name || tk.work_order_name || "—"}</span></div>
          <div>Report N: <span style={{ fontWeight: 600, color: "#333" }}>{e.reference || "—"}</span></div>
        </div>
      )}

      {/* Title + status on same line */}
      {layout.header?.showTitleStatus !== false && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#1a1a2e" }}>{title}</div>
          <span style={{ background: tk.status === "Completed" ? "#228b57" : "#cc0000", color: "#fff", padding: "3px 14px", fontSize: 10, fontWeight: 800, borderRadius: 3, letterSpacing: 0.5 }}>
            {tk.status === "Completed" ? "COMPLETED" : "NOT COMPLETED"}
          </span>
        </div>
      )}

      {/* SECTIONS (driven by stored layout) */}
      {layout.sections.map((section) => {
        const inner = section.rows.map((row, i) => (
          <React.Fragment key={i}>{renderRow(row)}</React.Fragment>
        ));
        return (
          <React.Fragment key={section.id}>
            <SectionHeader num={section.num} label={section.label} />
            {section.wrap === false
              ? <>{inner}</>
              : <div style={{ border: "1px solid #e0e0e0" }}>{inner}</div>}
          </React.Fragment>
        );
      })}

      {/* Footer */}
      {layout.footer?.show !== false && (
        <div style={{ marginTop: 10, paddingTop: 6, borderTop: `1.5px solid ${accent}40`, textAlign: "center", fontSize: 7, color: "#aaa" }}>
          {[t.company_name, t.company_email, t.company_phone].filter(Boolean).join("  ·  ") || "Your Company"}
        </div>
      )}
    </div>
  );
}