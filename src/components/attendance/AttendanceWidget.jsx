import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SearchableSelect from "@/components/shared/SearchableSelect";
import { Link } from "react-router-dom";
import { Loader2, LogIn, LogOut, Plus, Trash2, AlertTriangle, Clock } from "lucide-react";

export const ALERT_AFTER_HOURS = 12;

function fmtDur(mins) {
  const m = Math.max(0, Math.round(mins || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * One-tap office attendance: Enter / Exit for the day, then optionally point time to a project or task.
 * Time that is not pointed anywhere is overhead. Uses attendanceToday / attendanceToggle /
 * attendanceAllocate / attendanceConfirm.
 */
export default function AttendanceWidget({ onChange }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(null);       // open AttendanceDay or null
  const [allocs, setAllocs] = useState([]);     // saved allocations
  const [rows, setRows] = useState([]);         // editable rows { key, hours, notes }
  const [now, setNow] = useState(Date.now());
  const [options, setOptions] = useState([]);
  const [showAssign, setShowAssign] = useState(false);
  const [lastClosed, setLastClosed] = useState(null);
  const [fieldEntry, setFieldEntry] = useState(null); // active field clock-in that needs a long-session confirmation

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("attendanceToday", {});
      const data = res?.data || res || {};
      setOpen(data.attendance || data.open || null);
      const a = data.allocations || [];
      setAllocs(a);
      setRows(a.map(x => ({ key: x.task_id ? `task:${x.task_id}` : `project:${x.project_id}`, hours: String((x.minutes || 0) / 60), notes: x.notes || "" })));
      setError("");
    } catch (e) {
      setError(e?.response?.data?.error || e?.message || "Could not load attendance");
    } finally { setLoading(false); }
  }, []);

  const loadField = useCallback(async () => {
    try {
      const me = await base44.auth.me();
      if (!me?.id) return;
      const list = await base44.entities.TimeEntry.filter({ user_id: me.id, status: "Active" }, "-clock_in_time", 5);
      const due = (list || []).find(e => e.next_alert_at && new Date(e.next_alert_at).getTime() <= Date.now());
      setFieldEntry(due || null);
    } catch { /* optional banner */ }
  }, []);
  useEffect(() => { load(); loadField(); }, [load, loadField]);
  const confirmField = async () => {
    if (!fieldEntry) return;
    setBusy(true); setError("");
    try { await base44.functions.invoke("timeEntryConfirm", { time_entry_id: fieldEntry.id }); setFieldEntry(null); }
    catch (e) { setError(e?.response?.data?.error || e?.message || "Could not confirm"); }
    finally { setBusy(false); }
  };
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!showAssign || options.length) return;
    (async () => {
      const [tasks, projects] = await Promise.all([
        base44.entities.Task.list("-created_date", 500).catch(() => []),
        base44.entities.Project.list("-created_date", 300).catch(() => []),
      ]);
      setOptions([
        ...(projects || []).map(p => ({ value: `project:${p.id}`, label: `Project · ${p.name || p.title || p.reference || p.id}` })),
        ...(tasks || []).map(t => ({ value: `task:${t.id}`, label: `Task · ${t.reference ? t.reference + " " : ""}${t.title || ""}` })),
      ]);
    })();
  }, [showAssign, options.length]);

  const elapsedMin = open ? (now - new Date(open.clock_in_time).getTime()) / 60000 : 0;
  const needsConfirm = !!open && (elapsedMin >= ALERT_AFTER_HOURS * 60 || !!open.alert_sent_at)
    && !(open.confirmed_at && open.next_alert_at && new Date(open.next_alert_at).getTime() > now);

  const toggle = async () => {
    setBusy(true); setError("");
    try {
      const res = await base44.functions.invoke("attendanceToggle", {});
      const data = res?.data || res || {};
      if (data.action === "closed") setLastClosed(data.attendance);
      else setLastClosed(null);
      await load();
      onChange?.({ action: data.action });
    } catch (e) { setError(e?.response?.data?.error || e?.message || "Action failed"); }
    finally { setBusy(false); }
  };

  const confirm = async () => {
    if (!open) return;
    setBusy(true); setError("");
    try { await base44.functions.invoke("attendanceConfirm", { attendance_id: open.id }); await load(); }
    catch (e) { setError(e?.response?.data?.error || e?.message || "Could not confirm"); }
    finally { setBusy(false); }
  };

  const day = open || lastClosed;
  const totalMin = open ? elapsedMin : (lastClosed?.duration_minutes || 0);
  const assignedMin = rows.reduce((s, r) => s + Math.round((parseFloat(r.hours) || 0) * 60), 0);
  const overhead = Math.max(0, totalMin - assignedMin);
  const canEditAlloc = !!day;

  const addRow = () => setRows(r => [...r, { key: "", hours: "", notes: "" }]);
  const setRow = (i, patch) => setRows(r => r.map((x, j) => j === i ? { ...x, ...patch } : x));
  const delRow = i => setRows(r => r.filter((_, j) => j !== i));

  const saveAlloc = async () => {
    if (!day) return;
    setBusy(true); setError("");
    try {
      const allocations = rows.filter(r => r.key && (parseFloat(r.hours) || 0) > 0).map(r => {
        const [kind, id] = r.key.split(":");
        return { [kind === "task" ? "task_id" : "project_id"]: id, minutes: Math.round(parseFloat(r.hours) * 60), notes: r.notes || undefined };
      });
      await base44.functions.invoke("attendanceAllocate", { attendance_id: day.id, allocations });
      await load();
      onChange?.();
    } catch (e) { setError(e?.response?.data?.error || e?.message || "Could not save"); }
    finally { setBusy(false); }
  };

  const optionLabel = useMemo(() => Object.fromEntries(options.map(o => [o.value, o.label])), [options]);

  if (loading) return <div className="bg-card border border-border rounded-xl p-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading attendance...</div>;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4" data-testid="attendance-widget">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2"><Clock className="w-4 h-4 text-primary" /> My attendance</h2>
          {open ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              In since {new Date(open.clock_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {fmtDur(elapsedMin)} so far
            </p>
          ) : lastClosed ? (
            <p className="text-xs text-muted-foreground mt-0.5">Day closed · {fmtDur(lastClosed.duration_minutes)}</p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5">Not clocked in</p>
          )}
        </div>
        <Button onClick={toggle} disabled={busy} size="lg" className={open ? "bg-red-600 hover:bg-red-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"} data-testid="attendance-toggle">
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : open ? <LogOut className="w-4 h-4 mr-2" /> : <LogIn className="w-4 h-4 mr-2" />}
          {open ? "Clock out" : "Clock in"}
        </Button>
      </div>

      {needsConfirm && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="attendance-alert">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-amber-900">
            You have been clocked in for more than {ALERT_AFTER_HOURS} hours. Are you still working? If you do not confirm, the day closes automatically at the {ALERT_AFTER_HOURS}-hour mark.
          </div>
          <Button size="sm" onClick={confirm} disabled={busy} data-testid="attendance-confirm">OK, still working</Button>
        </div>
      )}

      {fieldEntry && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3" data-testid="field-alert">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div className="flex-1 text-sm text-amber-900">
            Your clock-in on "{fieldEntry.task_title || "a task"}" has been open for more than {ALERT_AFTER_HOURS} hours. Are you still working? If you do not confirm, it closes automatically at the {ALERT_AFTER_HOURS}-hour mark.
          </div>
          <Button size="sm" onClick={confirmField} disabled={busy} data-testid="field-confirm">OK, still working</Button>
        </div>
      )}

      {canEditAlloc && (
        <div className="space-y-2">
          {!showAssign && rows.length === 0 ? (
            <button className="text-xs text-primary hover:underline" onClick={() => { setShowAssign(true); addRow(); }}>
              + Point time to a project or task (optional)
            </button>
          ) : (
            <>
              <div className="text-xs font-medium text-muted-foreground">Point time to a project or task (optional)</div>
              {rows.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      value={r.key}
                      onValueChange={v => { setShowAssign(true); setRow(i, { key: v }); }}
                      options={options.length ? options : (r.key ? [{ value: r.key, label: optionLabel[r.key] || r.key }] : [])}
                      placeholder="Project or task"
                      searchPlaceholder="Search projects and tasks..."
                    />
                  </div>
                  <Input className="w-24" type="number" min="0" step="0.25" placeholder="Hours" value={r.hours} onChange={e => setRow(i, { hours: e.target.value })} />
                  <Button variant="ghost" size="icon" onClick={() => delRow(i)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => { setShowAssign(true); addRow(); }}><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>
                <div className="text-xs text-muted-foreground">
                  Assigned {fmtDur(assignedMin)} · Overhead (not pointed) {fmtDur(overhead)}
                </div>
                <Button size="sm" onClick={saveAlloc} disabled={busy || assignedMin > totalMin + 1}>Save</Button>
              </div>
              {assignedMin > totalMin + 1 && <p className="text-xs text-red-600">Assigned time is more than the day so far.</p>}
            </>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600" data-testid="attendance-error">{error}</p>}
      {!window.location.pathname.startsWith("/attendance") && <Link to="/attendance" className="text-xs text-muted-foreground hover:underline">Attendance history and overhead</Link>}
    </div>
  );
}
