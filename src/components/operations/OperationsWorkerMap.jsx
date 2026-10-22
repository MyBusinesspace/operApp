import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Loader2, MapPin, Users, UserX, UserCheck, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { tzDateKey, tzTime, DEFAULT_TIMEZONE } from "@/lib/timezones";

// Fix leaflet default icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const COLOR_WORKING = "#22c55e"; // green — actively clocked in
const COLOR_CALLED = "#f59e0b";  // amber — called to work but not clocked in

function makeIcon(initial, color, avatarUrl, pulse = false) {
  const ring = pulse
    ? `box-shadow:0 0 0 4px ${color}33, 0 2px 6px rgba(0,0,0,0.35);`
    : `box-shadow:0 2px 6px rgba(0,0,0,0.35);`;
  const inner = avatarUrl
    ? `<img src="${avatarUrl}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;" onerror="this.style.display='none';this.parentNode.querySelector('span').style.display='flex';" /><span style="display:none;width:100%;height:100%;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:${color};">${initial}</span>`
    : `<span style="font-size:12px;font-weight:800;color:${color};">${initial}</span>`;
  return L.divIcon({
    className: "",
    html: `<div style="width:34px;height:34px;border-radius:50%;background:#fff;border:3px solid ${color};${ring}overflow:hidden;display:flex;align-items:center;justify-content:center;">${inner}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 34],
    popupAnchor: [0, -34],
  });
}

const OFFSET = 0.006;
function spreadOverlapping(pins) {
  const groups = {};
  const key = (p) => `${p.lat.toFixed(4)}_${p.lng.toFixed(4)}`;
  pins.forEach(p => { if (p.lat == null || p.lng == null) return; const k = key(p); (groups[k] = groups[k] || []).push(p); });
  Object.values(groups).forEach(group => {
    if (group.length <= 1) return;
    const start = -(group.length - 1) / 2;
    group.forEach((p, i) => { p.lng = p.lng + (start + i) * OFFSET; });
  });
  return pins;
}

function FitBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]));
    const apply = () => {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [40, 40], animate: false });
    };
    const t = setTimeout(apply, 100);
    return () => clearTimeout(t);
  }, [map, points]);
  return null;
}

function WorkingPopup({ pin }) {
  const e = pin.entry || {};
  return (
    <div className="text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold flex items-center gap-2">
        {e.employee_name}
        <span className="font-normal" style={{ color: COLOR_WORKING }}>● Working</span>
      </p>
      {pin.time && <p className="text-muted-foreground">Since {tzTime(pin.time, DEFAULT_TIMEZONE)}</p>}
      {e.contact_name && <p className="text-muted-foreground">Customer: {e.contact_name}</p>}
      {e.project_name && <p className="text-muted-foreground">Project: {e.project_name}</p>}
      {e.work_order_name && <p className="text-muted-foreground">WO: {e.work_order_name}</p>}
      <p>{e.task_title}</p>
    </div>
  );
}

function CalledPopup({ pin }) {
  const t = pin.task || {};
  return (
    <div className="text-xs space-y-1 min-w-[160px]">
      <p className="font-semibold flex items-center gap-2">
        {pin.employeeName}
        <span className="font-normal" style={{ color: COLOR_CALLED }}>● Called</span>
      </p>
      <p className="text-muted-foreground">Not clocked in yet</p>
      {t.contact_name && <p className="text-muted-foreground">Customer: {t.contact_name}</p>}
      {t.project_name && <p className="text-muted-foreground">Project: {t.project_name}</p>}
      {t.work_order_name && <p className="text-muted-foreground">WO: {t.work_order_name}</p>}
      <p>{t.title}</p>
      {t.planning_time_in && (
        <p className="text-muted-foreground">Planned start: {t.planning_time_in}{t.planning_time_out ? ` → ${t.planning_time_out}` : ""}</p>
      )}
    </div>
  );
}

export default function OperationsWorkerMap({ headerExtra, officeWorkingIds = [] }) {
  const [loading, setLoading] = useState(true);
  const [workingPins, setWorkingPins] = useState([]);
  const [calledPins, setCalledPins] = useState([]);
  const [employeeMap, setEmployeeMap] = useState({});
  const [teams, setTeams] = useState([]);
  const [orgTimezone, setOrgTimezone] = useState(DEFAULT_TIMEZONE);
  const [filterTeam, setFilterTeam] = useState("all");
  const [filterWorker, setFilterWorker] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orgs, emps, teamsList] = await Promise.all([
        base44.entities.Organization.list("-created_date", 1).catch(() => []),
        base44.entities.Employee.filter({ status: "Active" }, { sort: "full_name", limit: 500 }).catch(() => ({ items: [] })),
        base44.entities.Team.list("sort_order", 500).catch(() => []),
      ]);
      const tz = orgs?.[0]?.timezone || DEFAULT_TIMEZONE;
      setOrgTimezone(tz);
      const empList = emps?.items || [];
      const eMap = {};
      empList.forEach(e => { eMap[e.id] = e; });
      setEmployeeMap(eMap);
      setTeams(teamsList || []);

      const todayKey = tzDateKey(new Date(), tz);

      // Active time entries (field clock-ins). Date-matched in company timezone:
      // clock_in_time is stored in UTC, so a text prefix on the UTC date would
      // miss the first hours of the company day.
      const activePage = await base44.entities.TimeEntry.filter(
        { status: "Active" },
        { sort: "-clock_in_time", limit: 500 }
      );
      const activeEntries = (activePage?.items || []).filter(e =>
        e.clock_in_time && tzDateKey(new Date(e.clock_in_time), tz) === todayKey
      );

      // Live tracking positions for active entries
      let lastTrackingMap = {};
      try {
        const locs = await base44.entities.WorkerLocation.list("-recorded_at", 500);
        locs.forEach(l => {
          if (l.time_entry_id && !(l.time_entry_id in lastTrackingMap)) {
            lastTrackingMap[l.time_entry_id] = { lat: l.lat, lng: l.lng, recorded_at: l.recorded_at };
          }
        });
      } catch { /* ignore */ }

      // Build working pins — prefer live track, fall back to clock-in location
      const wPins = [];
      activeEntries.forEach(entry => {
        const emp = eMap[entry.employee_id];
        const initial = (emp?.full_name?.[0] || entry.employee_name?.[0] || "?").toUpperCase();
        const avatarUrl = emp?.avatar_url;
        let lat = null, lng = null, time = entry.clock_in_time;
        const track = lastTrackingMap[entry.id];
        if (track && track.lat && track.lng) {
          lat = track.lat; lng = track.lng; time = track.recorded_at || time;
        } else if (entry.clock_in_lat && entry.clock_in_lng) {
          lat = entry.clock_in_lat; lng = entry.clock_in_lng;
        }
        if (lat && lng) {
          wPins.push({ id: `${entry.id}-w`, lat, lng, color: COLOR_WORKING, kind: "Working", time, initial, avatarUrl, entry, employeeId: entry.employee_id, pulse: true });
        }
      });

      // Tasks scheduled for today (called to work in the planner)
      const todayTasksPage = await base44.entities.Task.filter(
        { planning_date: todayKey },
        { sort: "-created_date", limit: 500 }
      );
      const todayTasks = (todayTasksPage?.items || []).filter(t =>
        t.assigned_employees?.length > 0 &&
        !["Draft", "Template", "Archived", "Completed"].includes(t.status)
      );

      // Fetch project locations as fallback for tasks without GPS coordinates
      const projectIds = [...new Set(todayTasks.map(t => t.project_id).filter(Boolean))];
      const projectLocMap = {};
      if (projectIds.length) {
        const projPage = await base44.entities.Project.filter({ id: { $in: projectIds } }, { limit: 500 }).catch(() => ({ items: [] }));
        (projPage?.items || []).forEach(p => {
          if (p.location_lat && p.location_lng) {
            projectLocMap[p.id] = { lat: p.location_lat, lng: p.location_lng, address: p.location_address };
          }
        });
      }

      // Employees already working — field time entries (below) plus open office
      // attendance, which arrives from the apiOperationsOverview function because
      // AttendanceDay RLS hides it from most frontend users.
      const workingEmployeeIds = new Set([
        ...activeEntries.map(e => e.employee_id),
        ...officeWorkingIds,
      ].filter(Boolean));

      // Build called-but-not-working entries for ALL planned workers.
      // Use task GPS first, then fall back to the linked project's location.
      // Workers without any coordinates still appear in the list below the map.
      const cPins = [];
      todayTasks.forEach(task => {
        (task.assigned_employees || []).forEach((empId, idx) => {
          if (workingEmployeeIds.has(empId)) return;
          const emp = eMap[empId];
          const name = emp?.full_name || task.assigned_employee_names?.[idx] || "?";
          const initial = (name?.[0] || "?").toUpperCase();
          let lat = task.location_lat || null;
          let lng = task.location_lng || null;
          if (!lat || !lng) {
            const projLoc = projectLocMap[task.project_id];
            if (projLoc) { lat = projLoc.lat; lng = projLoc.lng; }
          }
          cPins.push({
            id: `${task.id}-${empId}`,
            lat,
            lng,
            color: COLOR_CALLED,
            kind: "Called",
            initial,
            avatarUrl: emp?.avatar_url,
            task,
            employeeId: empId,
            employeeName: name,
          });
        });
      });

      setWorkingPins(spreadOverlapping(wPins));
      setCalledPins(spreadOverlapping(cPins));
    } catch (e) {
      console.error("OperationsWorkerMap load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Refresh when the page regains focus (real-time-ish without websocket)
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    const interval = setInterval(load, 60000);
    return () => { window.removeEventListener("focus", onFocus); clearInterval(interval); };
  }, [load]);

  // Workers available in the worker filter (those involved today)
  const availableWorkers = useMemo(() => {
    const ids = new Set();
    workingPins.forEach(p => { if (p.employeeId) ids.add(p.employeeId); });
    calledPins.forEach(p => { if (p.employeeId) ids.add(p.employeeId); });
    return Array.from(ids)
      .map(id => employeeMap[id])
      .filter(Boolean)
      .filter(e => filterTeam === "all" || e.team_id === filterTeam)
      .sort((a, b) => (a.full_name || "").localeCompare(b.full_name || ""));
  }, [workingPins, calledPins, employeeMap, filterTeam]);

  // Apply team/worker filters to pins
  const filteredWorking = useMemo(() => workingPins.filter(p => {
    if (filterTeam !== "all") {
      const emp = employeeMap[p.employeeId];
      if (!emp || emp.team_id !== filterTeam) return false;
    }
    if (filterWorker !== "all" && p.employeeId !== filterWorker) return false;
    return true;
  }), [workingPins, employeeMap, filterTeam, filterWorker]);

  const filteredCalled = useMemo(() => calledPins.filter(p => {
    if (filterTeam !== "all") {
      const emp = employeeMap[p.employeeId];
      if (!emp || emp.team_id !== filterTeam) return false;
    }
    if (filterWorker !== "all" && p.employeeId !== filterWorker) return false;
    return true;
  }), [calledPins, employeeMap, filterTeam, filterWorker]);

  // One row per worker: compact all of a person's tasks into a single row so the
  // lists answer "who has (not) clocked in" instead of repeating the avatar.
  const groupedWorking = useMemo(() => {
    const byEmp = new Map();
    filteredWorking.forEach(p => {
      const k = p.employeeId || p.entry?.employee_name || p.id;
      if (!byEmp.has(k)) byEmp.set(k, { key: k, name: p.entry?.employee_name || "?", initial: p.initial, avatarUrl: p.avatarUrl, pins: [] });
      byEmp.get(k).pins.push(p);
    });
    byEmp.forEach(g => g.pins.sort((a, b) => String(a.time || "").localeCompare(String(b.time || ""))));
    return [...byEmp.values()];
  }, [filteredWorking]);

  const groupedCalled = useMemo(() => {
    const byEmp = new Map();
    filteredCalled.forEach(p => {
      const k = p.employeeId || p.employeeName || p.id;
      if (!byEmp.has(k)) byEmp.set(k, { key: k, employeeName: p.employeeName, initial: p.initial, avatarUrl: p.avatarUrl, pins: [] });
      byEmp.get(k).pins.push(p);
    });
    byEmp.forEach(g => g.pins.sort((a, b) => String(a.task?.planning_time_in || "").localeCompare(String(b.task?.planning_time_in || ""))));
    return [...byEmp.values()];
  }, [filteredCalled]);

  const mapPins = useMemo(() => [...filteredWorking, ...filteredCalled].filter(p => p.lat != null && p.lng != null), [filteredWorking, filteredCalled]);

  const center = mapPins.length > 0
    ? [mapPins.reduce((s, p) => s + p.lat, 0) / mapPins.length, mapPins.reduce((s, p) => s + p.lng, 0) / mapPins.length]
    : [25.2048, 55.2708]; // Dubai default

  const handleTeamChange = (val) => { setFilterTeam(val); setFilterWorker("all"); };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <MapPin className="w-4 h-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Worker Map — Today</p>
          <span className="text-xs text-muted-foreground">
            {filteredWorking.length} working · {filteredCalled.length} called (not clocked in)
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Team filter */}
          <Select value={filterTeam} onValueChange={handleTeamChange}>
            <SelectTrigger className="w-36 h-8 text-xs"><Filter className="w-3.5 h-3.5 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Teams</SelectItem>
              {teams.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color || "#6366f1" }} />
                    {t.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Worker filter */}
          <Select value={filterWorker} onValueChange={setFilterWorker}>
            <SelectTrigger className="w-44 h-8 text-xs"><Users className="w-3.5 h-3.5 mr-1" /><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Workers</SelectItem>
              {availableWorkers.map(e => (
                <SelectItem key={e.id} value={e.id}>
                  <span className="flex items-center gap-2">
                    <Avatar className="w-5 h-5">
                      <AvatarImage src={e.avatar_url} />
                      <AvatarFallback className="text-[9px] bg-primary/10 text-primary font-bold">{(e.full_name?.[0] || "?").toUpperCase()}</AvatarFallback>
                    </Avatar>
                    {e.full_name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR_WORKING }} />Working</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR_CALLED }} />Called (not working)</span>
          </div>
          {headerExtra}
        </div>
      </div>

      {/* Map body */}
      <div style={{ height: 420, position: "relative", zIndex: 0 }}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading worker map…
          </div>
        ) : mapPins.length === 0 && filteredCalled.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
            No workers on the map today. The map will populate as workers clock in or are scheduled in the planner.
          </div>
        ) : (
          <MapContainer center={center} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
            <FitBounds points={mapPins} />
            <TileLayer
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"
              attribution='&copy; Esri, HERE, Garmin, OpenStreetMap contributors'
            />
            {filteredWorking.map(pin => (
              <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={makeIcon(pin.initial, pin.color, pin.avatarUrl, pin.pulse)}>
                <Popup><WorkingPopup pin={pin} /></Popup>
              </Marker>
            ))}
            {filteredCalled.filter(p => p.lat != null && p.lng != null).map(pin => (
              <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={makeIcon(pin.initial, pin.color, pin.avatarUrl, false)}>
                <Popup><CalledPopup pin={pin} /></Popup>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Working now — list */}
      {!loading && filteredWorking.length > 0 && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border">
            <UserCheck className="w-4 h-4 text-green-500" />
            <p className="text-sm font-semibold text-foreground">Working now</p>
            <span className="text-xs text-muted-foreground">({groupedWorking.length})</span>
          </div>
          <div className="max-h-64 overflow-y-auto scrollable-table">
            <table className="w-full text-sm">
              <thead className="bg-muted/10 sticky top-0">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Worker</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer / Project</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Since</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {groupedWorking.map(g => (
                  <tr key={g.key} className="border-b border-border last:border-0 hover:bg-muted/15 align-top">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarImage src={g.avatarUrl} />
                          <AvatarFallback className="text-[10px] bg-green-100 text-green-700 font-bold">{g.initial}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground text-xs">{g.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 max-w-[200px]">
                      <div className="space-y-1.5">
                        {g.pins.map(pin => (
                          <div key={pin.id}>
                            <p className="text-xs text-foreground truncate">{pin.entry?.task_title}</p>
                            {pin.entry?.work_order_name && <p className="text-[11px] text-muted-foreground truncate">{pin.entry.work_order_name}</p>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 max-w-[180px]">
                      <div className="space-y-1.5">
                        {g.pins.map(pin => (
                          <div key={pin.id}>
                            {pin.entry?.contact_name && <p className="text-xs text-foreground truncate">{pin.entry.contact_name}</p>}
                            {pin.entry?.project_name && <p className="text-[11px] text-muted-foreground truncate">{pin.entry.project_name}</p>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      <div className="space-y-1.5">
                        {g.pins.map(pin => <div key={pin.id}>{pin.time ? tzTime(pin.time, DEFAULT_TIMEZONE) : "—"}</div>)}
                      </div>
                    </td>
                    <td className="px-4 py-2 max-w-[160px]">
                      <div className="space-y-1.5">
                        {g.pins.map(pin => (
                          <div key={pin.id}>
                            {pin.entry?.clock_in_address ? <p className="text-xs text-muted-foreground truncate">{pin.entry.clock_in_address}</p> : <span className="text-xs text-muted-foreground/50">—</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Working
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Planned but not clocked in — list */}
      {!loading && filteredCalled.length > 0 && (
        <div className="border-t border-border">
          <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/20 border-b border-border">
            <UserX className="w-4 h-4 text-amber-500" />
            <p className="text-sm font-semibold text-foreground">Planned today but not clocked in</p>
            <span className="text-xs text-muted-foreground">({groupedCalled.length})</span>
          </div>
          <div className="max-h-64 overflow-y-auto scrollable-table">
            <table className="w-full text-sm">
              <thead className="bg-muted/10 sticky top-0">
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Worker</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Task</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Customer / Project</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Planned</th>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {groupedCalled.map(g => (
                  <tr key={g.key} className="border-b border-border last:border-0 hover:bg-muted/15 align-top">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7 shrink-0">
                          <AvatarImage src={g.avatarUrl} />
                          <AvatarFallback className="text-[10px] bg-amber-100 text-amber-700 font-bold">{g.initial}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-foreground text-xs">{g.employeeName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 max-w-[200px]">
                      <div className="space-y-1.5">
                        {g.pins.map(pin => (
                          <div key={pin.id}>
                            <p className="text-xs text-foreground truncate">{pin.task?.title}</p>
                            {pin.task?.work_order_name && <p className="text-[11px] text-muted-foreground truncate">{pin.task.work_order_name}</p>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 max-w-[180px]">
                      <div className="space-y-1.5">
                        {g.pins.map(pin => (
                          <div key={pin.id}>
                            {pin.task?.contact_name && <p className="text-xs text-foreground truncate">{pin.task.contact_name}</p>}
                            {pin.task?.project_name && <p className="text-[11px] text-muted-foreground truncate">{pin.task.project_name}</p>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      <div className="space-y-1.5">
                        {g.pins.map(pin => {
                          const t = pin.task || {};
                          return <div key={pin.id}>{t.planning_time_in ? `${t.planning_time_in}${t.planning_time_out ? ` → ${t.planning_time_out}` : ""}` : "—"}</div>;
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-2 max-w-[160px]">
                      <div className="space-y-1.5">
                        {g.pins.map(pin => (
                          <div key={pin.id}>
                            {pin.task?.location_address ? <p className="text-xs text-muted-foreground truncate">{pin.task.location_address}</p> : <span className="text-xs text-muted-foreground/50">—</span>}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="flex flex-col items-end gap-1">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Not clocked in
                        </span>
                        {g.pins.every(pin => pin.lat == null) && (
                          <span className="text-[10px] text-muted-foreground/70">No GPS — not on map</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}