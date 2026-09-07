import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, parseISO } from "date-fns";
import { Check } from "lucide-react";

const OPERAPP_LOGO_URL = "https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png";

function fmt(date) {
  try { return format(typeof date === "string" ? parseISO(date) : date, "EEEE d MMMM yyyy"); } catch { return date; }
}

function planDur(timeIn, timeOut) {
  if (!timeIn || !timeOut) return null;
  try {
    const [ih, im] = timeIn.split(":").map(Number);
    const [oh, om] = timeOut.split(":").map(Number);
    const mins = (oh * 60 + om) - (ih * 60 + im);
    if (mins <= 0) return null;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h${m > 0 ? m + "m" : ""}` : `${m}m`;
  } catch { return null; }
}

const PRIORITY_COLORS = { Low: "#6b7280", Medium: "#3b82f6", High: "#f97316", Urgent: "#dc2626" };

export default function DaySchedulePrint() {
  const params = new URLSearchParams(window.location.search);
  const date = params.get("date") || format(new Date(), "yyyy-MM-dd");
  const embed = params.get("embed") === "1";

  const [tasks, setTasks] = useState([]);
  const [teams, setTeams] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [assets, setAssets] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);
  const [template, setTemplate] = useState(null);
  const [subtaskMap, setSubtaskMap] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      base44.entities.Task.filter({ planning_date: date }, "-created_date", 500).then(t => t.filter(x => x.status !== "Completed")),
      base44.entities.Team.list("sort_order", 200),
      base44.entities.Employee.list("full_name", 500),
      base44.entities.Project.list("name", 200).catch(() => []),
      base44.entities.WorkOrder.list("title", 200).catch(() => []),
      base44.entities.Asset.list("name", 500).catch(() => []),
      base44.entities.WorkingReportTemplate.filter({ is_default: true }).then(r => r[0] || null),
      base44.entities.TaskSubtask.list("-created_date", 1000).catch(() => []),
      base44.entities.ContactPerson.list("full_name", 1000).catch(() => []),
    ]).then(([t, tm, emp, proj, wo, ast, tpl, subs, cps]) => {
      const taskIds = new Set(t.map(x => x.id));
      const map = {};
      (subs || []).forEach(s => {
        if (taskIds.has(s.task_id)) {
          if (!map[s.task_id]) map[s.task_id] = [];
          map[s.task_id].push(s);
        }
      });
      Object.keys(map).forEach(k => map[k].sort((a, b) => (a.created_date || "").localeCompare(b.created_date || "")));
      setTasks(t); setTeams(tm); setEmployees(emp); setProjects(proj); setWorkOrders(wo); setAssets(ast);
      setContactPersons(cps || []);
      setTemplate(tpl); setSubtaskMap(map); setLoading(false);
    });
  }, [date]);

  const getContactPersonsForTask = (task) => {
    const ids = new Set();
    if (task.contact_id) ids.add(`c:${task.contact_id}`);
    if (task.project_id) ids.add(`p:${task.project_id}`);
    if (task.work_order_id) ids.add(`w:${task.work_order_id}`);
    if (ids.size === 0) return [];
    return contactPersons.filter(cp =>
      (cp.contact_id && ids.has(`c:${cp.contact_id}`)) ||
      (cp.project_id && ids.has(`p:${cp.project_id}`)) ||
      (cp.work_order_id && ids.has(`w:${cp.work_order_id}`))
    );
  };

  const projectMap = new Map(projects.map(p => [p.id, p]));
  const workOrderMap = new Map(workOrders.map(w => [w.id, w]));
  const assetMap = new Map(assets.map(a => [a.id, a]));

  const getLocationForTask = (task) => {
    if (task.location_address) return task.location_address;
    if (task.work_order_id) { const wo = workOrderMap.get(task.work_order_id); if (wo?.location) return wo.location; }
    if (task.project_id) { const p = projectMap.get(task.project_id); if (p?.location_name) return p.location_name; if (p?.location) return p.location; }
    return null;
  };

  const grouped = [];
  const seen = new Set();
  teams.forEach(team => {
    const teamEmpIds = employees.filter(e => e.team_id === team.id).map(e => e.id);
    const teamEmpSet = new Set(teamEmpIds);
    const teamTasks = tasks.filter(t =>
      (t.assigned_team_ids || []).includes(team.id) ||
      (t.assigned_employees || []).some(eid => teamEmpIds.includes(eid))
    ).sort((a, b) => (a.planning_time_in || "").localeCompare(b.planning_time_in || ""));
    if (teamTasks.length > 0) {
      teamTasks.forEach(t => seen.add(t.id));
      grouped.push({ team, tasks: teamTasks, teamEmpSet });
    }
  });
  const unassigned = tasks.filter(t => !seen.has(t.id)).sort((a, b) => (a.planning_time_in || "").localeCompare(b.planning_time_in || ""));
  if (unassigned.length > 0) grouped.push({ team: { id: "unassigned", name: "Unassigned" }, tasks: unassigned, teamEmpSet: null });

  const accent = template?.accent_color || "#cc0000";
  const companyName = template?.company_name || "";
  const logoUrl = template?.logo_url || "";
  const showLogo = template?.show_logo !== false;
  const showStats = template?.schedule_show_stats !== false;
  const showAssigned = template?.schedule_show_assigned !== false;
  const showLocation = template?.schedule_show_location !== false;
  const showEquipment = template?.schedule_show_equipment !== false;

  const fieldWorkerIds = new Set();
  tasks.forEach(t => (t.assigned_employees || []).forEach(id => fieldWorkerIds.add(id)));
  const onLeave = employees.filter(e => e.absence_status);
  const totalWorkOrders = new Set(tasks.map(t => t.work_order_id).filter(Boolean)).size;
  const dateLabel = fmt(date);

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", color: "#6b7280", fontFamily: "Arial" }}>Loading schedule...</div>;

  const Sep = () => <div style={{ height: 1, background: "#000", margin: "4px 0" }} />;

  const TaskCard = ({ task, teamEmpSet, leaderId, idx, total }) => {
    const subs = subtaskMap[task.id] || [];
    const wo = task.work_order_id ? workOrderMap.get(task.work_order_id) : null;
    const proj = task.project_id ? projectMap.get(task.project_id) : null;
    const asset = task.asset_id ? assetMap.get(task.asset_id) : null;
    const customerName = task.contact_name || proj?.contact_name;
    const cps = getContactPersonsForTask(task);
    const locText = getLocationForTask(task);
    const timeLabel = [task.planning_time_in?.slice(0, 5), task.planning_time_out?.slice(0, 5)].filter(Boolean).join(" - ");
    const dur = planDur(task.planning_time_in, task.planning_time_out);
    const workerEmps = (task.assigned_employees || []).map(id => employees.find(e => e.id === id)).filter(Boolean);
    const teamWorkers = !teamEmpSet ? workerEmps : workerEmps.filter(e => teamEmpSet.has(e.id));

    const SectionHeader = ({ label }) => <div style={{ fontSize: 7, fontWeight: 700, color: "#757575", letterSpacing: "0.06em", marginBottom: 3 }}>{label}</div>;
    const Bubble = ({ color, value, bold }) => value ? (
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: "#464646", fontWeight: bold ? 700 : 400, lineHeight: 1.2 }}>{value}</span>
      </div>
    ) : null;

    return (
      <div style={{ background: "white", border: "1px solid #000", borderRadius: 6, overflow: "hidden", display: "flex", flexDirection: "column", breakInside: "avoid" }}>
        {/* Top strip */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: accent, color: "white", padding: "3px 6px", fontSize: 8, fontWeight: 700 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{idx}/{total}</span>
            {task.reference && <span style={{ fontSize: 7, fontWeight: 400, color: "#ebebeb" }}>{task.reference}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {task.priority && (
              <span style={{ background: PRIORITY_COLORS[task.priority] || "#6b7280", color: "white", borderRadius: 3, padding: "1px 5px", fontSize: 7, fontWeight: 700 }}>{task.priority.toUpperCase()}</span>
            )}
            {timeLabel && (
              <span style={{ background: "white", color: accent, borderRadius: 3, padding: "1px 5px", fontSize: 7, fontWeight: 700 }}>{timeLabel}{dur ? ` (${dur})` : ""}</span>
            )}
          </div>
        </div>

        {/* Body: two columns */}
        <div style={{ display: "flex", flex: 1 }}>
          {/* Left column */}
          <div style={{ flex: "0 0 58%", padding: 8, borderRight: "2px solid #000" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#1a1c21", lineHeight: 1.2, marginBottom: 4 }}>{task.title || "Untitled task"}</div>
            <Sep />
            {task.description && <div style={{ fontSize: 8, color: "#464646", lineHeight: 1.3, marginBottom: 4 }}>{task.description}</div>}
            <Sep />
            <SectionHeader label="SUBTASKS" />
            <div style={{ marginBottom: 6 }}>
              {subs.length > 0 ? subs.map(s => (
                <div key={s.id} style={{ display: "flex", gap: 5, alignItems: "flex-start", marginBottom: 3 }}>
                  {s.done
                    ? <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 11, height: 11, borderRadius: 2, background: "#d4edda", flexShrink: 0 }}><Check size={8} strokeWidth={3} color="#4caf50" /></span>
                    : <span style={{ display: "inline-block", width: 11, height: 11, borderRadius: 2, border: "1.5px solid #c4c4c4", flexShrink: 0 }} />}
                  <span style={{ fontSize: 9, color: s.done ? "#6c757d" : "#374151", textDecoration: s.done ? "line-through" : "none", lineHeight: 1.25 }}>{s.title}</span>
                </div>
              )) : <div style={{ fontSize: 8, fontStyle: "italic", color: "#9ca3af" }}>{task.notes || task.description || "No instructions"}</div>}
            </div>
            <Sep />
            {showAssigned && (
              <>
                <SectionHeader label="ASSIGNED" />
                <div>
                  {teamWorkers.length > 0 ? teamWorkers.map(w => (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                      {w.avatar_url
                        ? <img src={w.avatar_url} alt={w.full_name} style={{ width: 16, height: 16, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                        : <span style={{ width: 16, height: 16, borderRadius: "50%", background: "#e2e8f0", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, color: "#64748b", flexShrink: 0 }}>{(w.full_name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}</span>}
                      <span style={{ fontSize: 9, color: "#282828" }}>{w.full_name}{leaderId === w.id && <span style={{ color: accent }}> ★ Leader</span>}</span>
                    </div>
                  )) : (task.assigned_employee_names || []).length > 0 ? task.assigned_employee_names.map((n, i) => <div key={i} style={{ fontSize: 9, color: "#282828", marginBottom: 3 }}>{n}</div>) : <div style={{ fontSize: 8, color: "#9ca3af", fontStyle: "italic" }}>Unassigned</div>}
                </div>
              </>
            )}
          </div>

          {/* Right column */}
          <div style={{ flex: "1 1 42%", padding: 8 }}>
            {customerName && (
              <>
                <SectionHeader label="CUSTOMER" />
                <div style={{ marginBottom: 4 }}>
                  <Bubble color="#6f42c1" value={customerName} bold />
                  {cps.length > 0
                    ? cps.map(cp => (
                      <div key={cp.id} style={{ marginBottom: 3 }}>
                        {cp.full_name && <div style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#6f42c1", flexShrink: 0 }} /><span style={{ fontSize: 9, color: "#464646", fontWeight: 700, lineHeight: 1.2 }}>{cp.full_name}{cp.is_primary ? " ★" : ""}{cp.role ? <span style={{ fontWeight: 400, color: "#9ca3af" }}> — {cp.role}</span> : null}</span></div>}
                        {cp.phone && <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 10 }}><span style={{ fontSize: 8, color: "#28a745", lineHeight: 1.2 }}>{cp.phone}</span></div>}
                        {cp.email && <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: 10 }}><span style={{ fontSize: 8, color: "#0056b3", lineHeight: 1.2 }}>{cp.email}</span></div>}
                      </div>
                    ))
                    : <>
                      {proj?.contact_person && <Bubble color="#6f42c1" value={proj.contact_person} />}
                      {proj?.contact_phone && <Bubble color="#28a745" value={proj.contact_phone} />}
                      {proj?.contact_email && <Bubble color="#0056b3" value={proj.contact_email} />}
                    </>}
                </div>
                <Sep />
              </>
            )}
            {task.project_name && (
              <>
                <SectionHeader label="PROJECT" />
                <div style={{ marginBottom: 4 }}>
                  <Bubble color="#6f42c1" value={task.project_name} bold />
                  {showLocation && locText && <Bubble color="#ef4444" value={locText} />}
                </div>
                <Sep />
              </>
            )}
            <SectionHeader label="WORK ORDER" />
            <div style={{ marginBottom: 4 }}>
              {task.work_order_name
                ? <div style={{ fontSize: 9, fontWeight: 700, color: "#282828", marginBottom: 2 }}>{task.work_order_name}</div>
                : <div style={{ fontSize: 8, fontStyle: "italic", color: "#9ca3af" }}>No work order</div>}
              {(wo?.type || wo?.priority) && <div style={{ fontSize: 8, color: "#646464" }}>{[wo?.type, wo?.priority].filter(Boolean).join("  •  ")}</div>}
              {wo?.description && <div style={{ fontSize: 8, color: "#646464", marginTop: 2, lineHeight: 1.25 }}>{wo.description}</div>}
              {(wo?.scheduled_date || wo?.due_date) && <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 1 }}>{[wo?.scheduled_date && `Scheduled: ${wo.scheduled_date}`, wo?.due_date && `Due: ${wo.due_date}`].filter(Boolean).join("  •  ")}</div>}
              {cps.filter(cp => cp.work_order_id && cp.work_order_id === task.work_order_id).map(cp => (
                <div key={cp.id} style={{ marginTop: 3 }}>
                  {cp.full_name && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f97316", flexShrink: 0 }} />
                      <span style={{ fontSize: 9, color: "#282828", fontWeight: 700, lineHeight: 1.2 }}>{cp.full_name}{cp.is_primary ? " ★" : ""}</span>
                    </div>
                  )}
                  {cp.role && <div style={{ fontSize: 8, color: "#9ca3af", marginLeft: 10, lineHeight: 1.2 }}>{cp.role}</div>}
                  {cp.phone && <div style={{ fontSize: 8, color: "#28a745", marginLeft: 10, lineHeight: 1.3 }}>{cp.phone}</div>}
                </div>
              ))}
            </div>
            {showEquipment && (
              <>
                <Sep />
                <SectionHeader label="ASSET" />
                <div>
                  {task.asset_name
                    ? <div style={{ fontSize: 9, fontWeight: 700, color: "#282828", marginBottom: 2 }}>{task.asset_name}</div>
                    : <div style={{ fontSize: 8, fontStyle: "italic", color: "#9ca3af" }}>No asset linked</div>}
                  {asset?.serial_number && <div style={{ fontSize: 8, color: "#646464", marginBottom: 1 }}>S/N: {asset.serial_number}</div>}
                  {(asset?.category || asset?.manufacturer) && <div style={{ fontSize: 8, color: "#646464", marginBottom: 1 }}>{[asset?.category, asset?.manufacturer].filter(Boolean).join(" • ")}</div>}
                  {(asset?.model || asset?.year) && <div style={{ fontSize: 8, color: "#646464" }}>{[asset?.model, asset?.year && String(asset.year)].filter(Boolean).join(" • ")}</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ background: "white", minHeight: "100vh", fontFamily: "Arial, Helvetica, sans-serif", fontSize: 11, color: "#111" }}>
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
        }
      `}</style>

      {!embed && (
        <div className="no-print" style={{ position: "fixed", top: 12, right: 12, zIndex: 50, display: "flex", gap: 8 }}>
          <button onClick={() => window.print()} style={{ padding: "8px 16px", background: "#1f2937", color: "white", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>🖨 Print / Save PDF</button>
          <button onClick={() => window.close()} style={{ padding: "8px 16px", background: "#e5e7eb", color: "#374151", border: "none", borderRadius: 8, fontSize: 13, cursor: "pointer" }}>Close</button>
        </div>
      )}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 24px 28px" }}>
        {/* Header: Pavarotti left + centered company name + company logo right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          {showLogo ? <img src={OPERAPP_LOGO_URL} alt="OPERAPP" style={{ height: 40, objectFit: "contain" }} /> : <div style={{ width: 40 }} />}
          <div style={{ textAlign: "center", flex: 1, padding: "0 16px" }}>
            {companyName && <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1c21", lineHeight: 1.2 }}>{companyName}</div>}
            <div style={{ fontSize: 8, color: "#9ca3af", marginTop: 1 }}>Working Day Schedule</div>
          </div>
          {logoUrl ? <img src={logoUrl} alt="Company" style={{ height: 40, objectFit: "contain" }} /> : <div style={{ width: 40 }} />}
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#282828", marginTop: 6 }}>{dateLabel}</div>
        <div style={{ height: 2, background: accent, margin: "6px 0 16px" }} />

        {/* Stats */}
        {showStats && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 18 }}>
            {[
              { label: "FIELD WORKERS", value: fieldWorkerIds.size },
              { label: "OFFICE WORKERS", value: 0 },
              { label: "ON LEAVE", value: onLeave.length },
            ].map(s => (
              <div key={s.label} style={{ border: "1px solid #e5e7eb", borderRadius: 6, padding: "8px 12px" }}>
                <div style={{ fontSize: 8, fontWeight: 700, color: "#6b7280", letterSpacing: "0.08em" }}>{s.label}</div>
                <div style={{ fontSize: 24, fontWeight: 800, marginTop: 1 }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Team sections */}
        {grouped.map(({ team, tasks: teamTasks, teamEmpSet }, gi) => (
          <div key={team.id} style={{ marginTop: gi > 0 ? 22 : 0, marginBottom: 8 }}>
            <div style={{ background: accent, color: "white", fontWeight: 800, fontSize: 12, letterSpacing: "0.04em", padding: "5px 12px", borderRadius: 4, marginBottom: 10 }}>{team.name}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {teamTasks.map((task, i) => (
                <TaskCard key={task.id} task={task} teamEmpSet={teamEmpSet} leaderId={team.leader_id} idx={i + 1} total={teamTasks.length} />
              ))}
            </div>
          </div>
        ))}

        {grouped.length === 0 && <div style={{ textAlign: "center", color: "#9ca3af", padding: "64px 0", fontSize: 12 }}>No tasks scheduled for {dateLabel}.</div>}

        {/* Footer: company data left + work orders centered */}
        <div style={{ marginTop: 24 }}>
          <div style={{ height: 2, background: accent, marginBottom: 6 }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ fontSize: 8, color: "#5a5a5a", lineHeight: 1.5 }}>
              {template?.company_address && <div>{/^office/i.test(template.company_address) ? template.company_address : ("Office: " + template.company_address)}</div>}
              {template?.company_phone && <div>Tel: {template.company_phone}</div>}
              {template?.company_email && <div>{template.company_email}</div>}
              {template?.company_website && <div>{template.company_website}</div>}
              {template?.show_tax_number && template?.tax_id && <div>TRN: {template.tax_id}</div>}
            </div>
            <div style={{ fontSize: 8, color: "#787878", textAlign: "center" }}>{totalWorkOrders} work orders</div>
          </div>
          {template?.footer_notes && <div style={{ fontSize: 8, fontStyle: "italic", color: "#787878", marginTop: 4 }}>{template.footer_notes}</div>}
        </div>
      </div>
    </div>
  );
}