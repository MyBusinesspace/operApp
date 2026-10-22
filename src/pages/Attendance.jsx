import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { addDaysISO, todayLocalISO } from "@/lib/dateOnly";
import AttendanceWidget from "@/components/attendance/AttendanceWidget";
import { Loader2 } from "lucide-react";

const fmtDur = (mins) => { const m = Math.max(0, Math.round(mins || 0)); return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`; };
const todayISO = () => todayLocalISO();
const addDays = (iso, n) => addDaysISO(iso, n);

export default function Attendance() {
  const [from, setFrom] = useState(addDays(todayISO(), -6));
  const [to, setTo] = useState(todayISO());
  const [days, setDays] = useState([]);
  const [allocs, setAllocs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = { work_date: { $gte: from, $lte: to } };
      const [d, a] = await Promise.all([
        base44.entities.AttendanceDay.filter(q, "-clock_in_time", 2000).catch(() => []),
        base44.entities.AttendanceAllocation.filter(q, "-created_date", 5000).catch(() => []),
      ]);
      setDays(d || []); setAllocs(a || []);
    } finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); }, [load]);

  const allocByDay = useMemo(() => {
    const m = {};
    allocs.forEach(x => { m[x.attendance_id] = (m[x.attendance_id] || 0) + (x.minutes || 0); });
    return m;
  }, [allocs]);

  const rows = useMemo(() => days.map(d => {
    const total = d.status === "Open" ? Math.max(0, (Date.now() - new Date(d.clock_in_time).getTime()) / 60000) : (d.duration_minutes || 0);
    const assigned = allocByDay[d.id] || 0;
    return { ...d, total, assigned, overhead: Math.max(0, total - assigned) };
  }), [days, allocByDay]);

  const byEmp = useMemo(() => {
    const m = {};
    rows.forEach(r => {
      const e = m[r.employee_id] || (m[r.employee_id] = { name: r.employee_name || r.employee_id, total: 0, assigned: 0, overhead: 0, days: 0 });
      e.total += r.total; e.assigned += r.assigned; e.overhead += r.overhead; e.days += 1;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [rows]);

  const statusLabel = (r) => r.status === "AutoClosed" ? "Closed automatically" : r.status === "Open" ? "Open" : "Closed";

  return (
    <div className="px-8 py-6 space-y-5 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Attendance</h1>
        <p className="text-xs text-muted-foreground">Clock in and out of the day. Pointing time to a project or task is optional; the rest counts as overhead.</p>
      </div>

      <AttendanceWidget onChange={load} />

      <div className="flex items-end gap-3 flex-wrap">
        <div><label className="text-xs text-muted-foreground block mb-1">From</label><input type="date" className="border border-border rounded-md px-2 py-1.5 text-sm bg-background" value={from} onChange={e => setFrom(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground block mb-1">To</label><input type="date" className="border border-border rounded-md px-2 py-1.5 text-sm bg-background" value={to} onChange={e => setTo(e.target.value)} /></div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
      ) : (
        <>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/40 border-b border-border text-sm font-semibold">Hours and overhead by person</div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground text-left"><th className="px-4 py-2">Person</th><th className="px-4 py-2 text-right">Days</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">On projects/tasks</th><th className="px-4 py-2 text-right">Overhead</th></tr></thead>
              <tbody>
                {byEmp.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">No attendance in this period.</td></tr>}
                {byEmp.map(e => (
                  <tr key={e.name} className="border-t border-border"><td className="px-4 py-2">{e.name}</td><td className="px-4 py-2 text-right">{e.days}</td><td className="px-4 py-2 text-right">{fmtDur(e.total)}</td><td className="px-4 py-2 text-right">{fmtDur(e.assigned)}</td><td className="px-4 py-2 text-right">{fmtDur(e.overhead)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/40 border-b border-border text-sm font-semibold">Days</div>
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-muted-foreground text-left"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Person</th><th className="px-4 py-2">In</th><th className="px-4 py-2">Out</th><th className="px-4 py-2 text-right">Total</th><th className="px-4 py-2 text-right">Overhead</th><th className="px-4 py-2">Status</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-2">{r.work_date}</td><td className="px-4 py-2">{r.employee_name}</td>
                    <td className="px-4 py-2">{new Date(r.clock_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="px-4 py-2">{r.clock_out_time ? new Date(r.clock_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"}</td>
                    <td className="px-4 py-2 text-right">{fmtDur(r.total)}</td><td className="px-4 py-2 text-right">{fmtDur(r.overhead)}</td>
                    <td className="px-4 py-2">{statusLabel(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}