import React, { useState, useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Loader2, LogIn, LogOut, Clock, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import AttendanceWidget, { ALERT_AFTER_HOURS } from "@/components/attendance/AttendanceWidget";

const COLLAPSED_KEY = "attbar:collapsed";

function fmtDur(mins) {
  const m = Math.max(0, Math.round(mins || 0));
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/**
 * Global attendance bar: slim strip under the header, present on every page.
 * Collapsed: one-line status + one-tap Clock in/out. Expanded: the full
 * AttendanceWidget (point time, history link, alerts).
 * Default state follows the day: expanded while not clocked in, collapsed once
 * clocked in. A manual expand/collapse is remembered (localStorage). Any clock
 * toggle re-applies the rule (clock in -> collapse, clock out -> expand).
 * Hidden on /attendance, which renders the full widget itself.
 */
export default function AttendanceBar({ className = "" }) {
  const { pathname } = useLocation();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [collapsed, setCollapsed] = useState(null); // null until first load decides

  const load = useCallback(async () => {
    try {
      const res = await base44.functions.invoke("attendanceToday", {});
      const data = res?.data || res || {};
      const o = data.attendance || data.open || null;
      setOpen(o);
      setUnavailable(false);
      return o;
    } catch {
      // e.g. logged-out / no access: hide the bar quietly
      setUnavailable(true);
      return null;
    } finally { setLoading(false); }
  }, []);

  // First load: decide initial collapsed state (stored pref wins; else follow clock state)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const o = await load();
      if (!mounted) return;
      setCollapsed((c) => {
        if (c !== null) return c;
        let stored = null;
        try { stored = localStorage.getItem(COLLAPSED_KEY); } catch {}
        if (stored === "1" || stored === "0") return stored === "1";
        return !!o;
      });
    })();
    return () => { mounted = false; };
  }, [load]);

  // Refresh on route change so the strip never shows stale state
  useEffect(() => { if (!loading) load(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const setCollapsedStored = (v) => {
    setCollapsed(v);
    try { localStorage.setItem(COLLAPSED_KEY, v ? "1" : "0"); } catch {}
  };

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke("attendanceToggle", {});
      const data = res?.data || res || {};
      await load();
      setCollapsedStored(data.action !== "closed"); // clocked in -> collapse; clocked out -> expand
    } catch { /* expanded widget surfaces errors; keep the strip quiet */ }
    finally { setBusy(false); }
  };

  // The expanded widget reports its own clock toggles via onChange({ action })
  const onWidgetChange = (info) => {
    load();
    if (info && info.action) setCollapsedStored(info.action !== "closed");
  };

  const elapsedMin = open ? (now - new Date(open.clock_in_time).getTime()) / 60000 : 0;
  const needsConfirm = !!open && (elapsedMin >= ALERT_AFTER_HOURS * 60 || !!open.alert_sent_at)
    && !(open.confirmed_at && open.next_alert_at && new Date(open.next_alert_at).getTime() > now);

  const confirm = async () => {
    if (!open) return;
    setBusy(true);
    try { await base44.functions.invoke("attendanceConfirm", { attendance_id: open.id }); await load(); }
    catch {} finally { setBusy(false); }
  };

  if (pathname.startsWith("/attendance")) return null;
  if (unavailable) return null;

  const isCollapsed = collapsed === null ? true : collapsed;
  const status = open
    ? `In since ${new Date(open.clock_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${fmtDur(elapsedMin)} so far`
    : "Not clocked in";

  return (
    <div className={`bg-background border-b border-border ${className}`} data-testid="attendance-bar">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 py-1.5">
        <div className="flex items-center gap-2 min-w-0 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-medium text-foreground shrink-0">My attendance</span>
          {loading ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading…</span>
          ) : isCollapsed ? (
            <span className="truncate">{status}</span>
          ) : null}
          {!loading && needsConfirm && (
            <button onClick={confirm} disabled={busy}
              className="flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-300 rounded px-1.5 py-0.5 hover:bg-amber-100 shrink-0"
              data-testid="attbar-confirm">
              <AlertTriangle className="w-3 h-3" /> Still working? Confirm
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {!loading && isCollapsed && (
            <Button size="sm" onClick={toggle} disabled={busy}
              className={open ? "bg-red-600 hover:bg-red-700 text-white h-7 text-xs" : "bg-emerald-600 hover:bg-emerald-700 text-white h-7 text-xs"}
              data-testid="attbar-toggle">
              {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : open ? <LogOut className="w-3 h-3 mr-1" /> : <LogIn className="w-3 h-3 mr-1" />}
              {open ? "Clock out" : "Clock in"}
            </Button>
          )}
          <button onClick={() => setCollapsedStored(!isCollapsed)}
            className="p-1 rounded hover:bg-muted text-muted-foreground"
            aria-label={isCollapsed ? "Expand attendance" : "Collapse attendance"}
            data-testid="attbar-chevron">
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>
      {!isCollapsed && !loading && (
        <div className="px-4 sm:px-6 lg:px-8 pb-3">
          <AttendanceWidget onChange={onWidgetChange} />
        </div>
      )}
    </div>
  );
}
