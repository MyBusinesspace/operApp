import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll, debounce } from "@/lib/apiHelpers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LogIn, Search, Clock, MapPin, CheckCircle, AlertCircle, Trash2, Square, CheckSquare, ThumbsUp, ThumbsDown, ClipboardEdit, Pencil, Camera, X, Download } from "lucide-react";
import { exportToCSV } from "@/lib/csvExport";
import { tzTime, tzDateKey, tzDayLabel, DEFAULT_TIMEZONE } from "@/lib/timezones";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ClockInModal from "@/components/timesheets/ClockInModal";
import ActiveEntryInlineRow from "@/components/timesheets/ActiveEntryInlineRow";
import TimeEntryDetailModal from "@/components/timesheets/TimeEntryDetailModal";
import WorkerMap from "@/components/timesheets/WorkerMap";
import ClockOutReportModal from "@/components/timesheets/ClockOutReportModal";
import AmendmentEditModal from "@/components/timesheets/AmendmentEditModal";
import EntryReportButton from "@/components/timesheets/EntryReportButton";
import PrintDayReportsButton from "@/components/timesheets/PrintDayReportsButton";
import TimesheetPaginationFooter from "@/components/timesheets/TimesheetPaginationFooter";
import { SortableTh } from "@/components/shared/SortIcon";

function formatDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Always compute duration from actual clock in/out times so it reflects amendments
function entryDuration(entry) {
  if (entry.clock_in_time && entry.clock_out_time) {
    return Math.max(0, Math.round((new Date(entry.clock_out_time) - new Date(entry.clock_in_time)) / 60000));
  }
  return entry.duration_minutes || 0;
}

function statusColor(status) {
  // Unified status colors: On Going=green, Clocked Out=red
  if (status === "Active") return "bg-green-100 text-green-700 border-green-300";
  if (status === "Completed" || status === "Switched") return "bg-red-100 text-red-700 border-red-300";
  return "bg-muted text-muted-foreground";
}

export default function Timesheets() {
  const [entries, setEntries] = useState([]);
  const [activeEntries, setActiveEntries] = useState([]);
  const [employeeMap, setEmployeeMap] = useState({});
  const [amendments, setAmendments] = useState({}); // keyed by time_entry_id
  const [approvingId, setApprovingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showClockIn, setShowClockIn] = useState(false);
  const [switchEntry, setSwitchEntry] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [reportEntry, setReportEntry] = useState(null);
  const afterReportRef = useRef(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editAmendment, setEditAmendment] = useState(null); // { entry, amendment }
  const [showPhotosColumn, setShowPhotosColumn] = useState(true);
  const [photoPopup, setPhotoPopup] = useState(null); // { url, label }
  const [sortKey, setSortKey] = useState("employee");
  const [sortDir, setSortDir] = useState("asc");
  const [onlyWithReport, setOnlyWithReport] = useState(false);
  const [entryIdsWithReport, setEntryIdsWithReport] = useState(new Set());
  const [lastTrackingMap, setLastTrackingMap] = useState({});
  const [filterTeam, setFilterTeam] = useState("all");
  const [teams, setTeams] = useState([]);
  const [orgTimezone, setOrgTimezone] = useState(DEFAULT_TIMEZONE);
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (col) => {
    if (sortKey === col) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  const sortEntries = (list) => {
    const sorted = [...list];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case "employee":
          av = (a.employee_name || "").toLowerCase();
          bv = (b.employee_name || "").toLowerCase();
          break;
        case "task":
          av = (a.task_title || "").toLowerCase();
          bv = (b.task_title || "").toLowerCase();
          break;
        case "inout":
          av = a.clock_in_time ? new Date(a.clock_in_time).getTime() : 0;
          bv = b.clock_in_time ? new Date(b.clock_in_time).getTime() : 0;
          break;
        case "duration":
          av = entryDuration(a);
          bv = entryDuration(b);
          break;
        case "status":
          av = (a.status || "").toLowerCase();
          bv = (b.status || "").toLowerCase();
          break;
        default:
          return 0;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return sorted;
  };

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const [all, emps, amends, ops, teamsList, orgs] = await batchedAll([
      () => withRetry(() => base44.entities.TimeEntry.list("-clock_in_time", 10000)),
      () => withRetry(() => base44.entities.Employee.list("full_name", 500)),
      () => withRetry(() => base44.entities.TimeEntryAmendment.filter({ status: "Pending" }, "-created_date", 200)),
      () => withRetry(() => base44.entities.OperationsSettings.list("-created_date", 10)),
      () => withRetry(() => base44.entities.Team.list("sort_order", 500)),
      () => withRetry(() => base44.entities.Organization.list("-created_date", 1)),
    ], 2);
    if (orgs?.[0]?.timezone) setOrgTimezone(orgs[0].timezone);
    const opsSetting = ops[0] || {};
    setShowPhotosColumn(opsSetting.show_timesheet_photos_column !== false);
    setTeams(teamsList || []);
    setEntries(all);
    setActiveEntries(all.filter(e => e.status === "Active"));
    // Fetch working reports to know which entries have a report
    try {
      const reports = await withRetry(() => base44.entities.WorkingReport.list("-created_date", 500));
      setEntryIdsWithReport(new Set(reports.map(r => r.time_entry_id).filter(Boolean)));
    } catch {}
    // Fetch latest worker location tracking per active entry
    try {
      const locs = await withRetry(() => base44.entities.WorkerLocation.list("-recorded_at", 500));
      const trackingMap = {};
      locs.forEach(l => { if (l.time_entry_id && !(l.time_entry_id in trackingMap)) trackingMap[l.time_entry_id] = { lat: l.lat, lng: l.lng, recorded_at: l.recorded_at }; });
      setLastTrackingMap(trackingMap);
    } catch { setLastTrackingMap({}); }
    // Sync selectedEntry with fresh data so the detail modal reflects amendments
    setSelectedEntry(prev => prev ? all.find(e => e.id === prev.id) || prev : null);
    const map = {};
    emps.forEach(e => { map[e.id] = e; });
    setEmployeeMap(map);
    // Index amendments by time_entry_id (latest pending per entry)
    const aMap = {};
    amends.forEach(a => { aMap[a.time_entry_id] = a; });
    setAmendments(aMap);
    setLoading(false);
  }, []);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Reset to first page whenever filters or page size change
  useEffect(() => { setCurrentPage(1); }, [search, filterStatus, filterTeam, onlyWithReport, pageSize]);

  // Real-time subscriptions — debounced to coalesce rapid events into a single refetch
  useEffect(() => {
    const debouncedFetch = debounce(() => fetchEntries(), 2000);
    const unsub1 = base44.entities.TimeEntry.subscribe(() => debouncedFetch());
    const unsub2 = base44.entities.TimeEntryAmendment.subscribe(() => debouncedFetch());
    return () => { debouncedFetch.cancel(); unsub1(); unsub2(); };
  }, [fetchEntries]);

  const exportCSV = () => {
    exportToCSV(`timesheets-${new Date().toISOString().slice(0, 10)}`, [
      { key: "employee_name", label: "Employee" },
      { key: "task_title", label: "Task" },
      { key: "work_order_name", label: "Work Order" },
      { key: "project_name", label: "Project" },
      { key: "contact_name", label: "Client" },
      { key: "asset_name", label: "Asset" },
      { key: "clock_in_time", label: "Clock In" },
      { key: "clock_out_time", label: "Clock Out" },
      { key: r => entryDuration(r), label: "Duration (min)" },
      { key: "status", label: "Status" },
      { key: "on_site", label: "On Site" },
      { key: "clock_in_address", label: "Clock In Address" },
      { key: "clock_out_address", label: "Clock Out Address" },
      { key: "notes", label: "Notes" },
    ], filtered);
  };

  const handleClockInSuccess = () => { fetchEntries(); setShowClockIn(false); };
  const handleSwitchSuccess = () => { fetchEntries(); setSwitchEntry(null); };
  const handleClockOutSuccess = () => fetchEntries();

  const handleShowReport = (entry, afterCb) => {
    afterReportRef.current = afterCb || null;
    setReportEntry(entry);
  };

  const handleReportClose = () => {
    const cb = afterReportRef.current;
    afterReportRef.current = null;
    setReportEntry(null);
    if (cb) cb();
    fetchEntries();
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectDay = (dayEntries, e) => {
    e.stopPropagation();
    const ids = dayEntries.map(e => e.id);
    const allSelected = ids.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleApproveAmendment = async (amendment, e) => {
    e.stopPropagation();
    setApprovingId(amendment.id);
    // Apply amended times to the TimeEntry + recalculate duration
    const newDuration = (amendment.amended_clock_in && amendment.amended_clock_out)
      ? Math.round((new Date(amendment.amended_clock_out) - new Date(amendment.amended_clock_in)) / 60000)
      : null;
    const update = {
      clock_in_time: amendment.amended_clock_in,
      clock_out_time: amendment.amended_clock_out,
    };
    if (newDuration != null) update.duration_minutes = newDuration;
    await base44.entities.TimeEntry.update(amendment.time_entry_id, update);
    await base44.entities.TimeEntryAmendment.update(amendment.id, { status: "Approved" });
    setApprovingId(null);
    fetchEntries();
  };

  const handleRejectAmendment = async (amendment, e) => {
    e.stopPropagation();
    setApprovingId(amendment.id);
    await base44.entities.TimeEntryAmendment.update(amendment.id, { status: "Rejected" });
    setApprovingId(null);
    fetchEntries();
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    setDeleting(true);
    await Promise.all([...selectedIds].map(id => base44.entities.TimeEntry.delete(id).catch(() => {})));
    setSelectedIds(new Set());
    setDeleting(false);
    fetchEntries();
  };

  const filtered = entries.filter(e => {
    if (filterTeam !== "all") {
      const emp = employeeMap[e.employee_id];
      if (!emp || emp.team_id !== filterTeam) return false;
    }
    if (filterStatus !== "all" && filterStatus !== "ClockIn") {
      // "Clocked Out" includes Switched entries (a switch performs a clock-out)
      if (filterStatus === "Completed") {
        if (e.status !== "Completed" && e.status !== "Switched") return false;
      } else if (e.status !== filterStatus) return false;
    }
    if (onlyWithReport && !entryIdsWithReport.has(e.id)) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.employee_name?.toLowerCase().includes(q) || e.task_title?.toLowerCase().includes(q)
        || e.work_order_name?.toLowerCase().includes(q) || e.contact_name?.toLowerCase().includes(q);
    }
    return true;
  });

  // Map pins honor the same filters as the table (search, status, report) — current day only (org tz)
  const todayKey = tzDateKey(new Date(), orgTimezone);
  const mapEntries = filtered.filter(e =>
    e.clock_in_time?.startsWith(todayKey) &&
    ((e.clock_in_lat && e.clock_in_lng) || (e.clock_out_lat && e.clock_out_lng))
  );

  // Link the status filter to the map pin colors: On Going→orange, Clocked Out→red, Clock In→green
  const pinFilterByStatus = { all: "all", Active: "track", Completed: "out", ClockIn: "in" };
  const pinFilter = pinFilterByStatus[filterStatus] || "all";

  // Client-side pagination over the filtered set
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const pagedEntries = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  // Group by day (in the organization's operational timezone)
  const groupedByDay = pagedEntries.reduce((acc, e) => {
    const day = e.clock_in_time ? tzDateKey(e.clock_in_time, orgTimezone) : "unknown";
    if (!acc[day]) acc[day] = [];
    acc[day].push(e);
    return acc;
  }, {});
  const sortedDays = Object.keys(groupedByDay).sort((a, b) => b.localeCompare(a));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Timesheets</h1>
          <p className="text-sm text-muted-foreground">Track employee clock-in/out against tasks</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCSV} disabled={filtered.length === 0}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Button onClick={() => setShowClockIn(true)}>
            <LogIn className="w-4 h-4 mr-2" /> Clock In
          </Button>
        </div>
      </div>

      {/* Worker Map */}
      <div className="bg-card border border-border rounded-xl overflow-hidden" style={{ height: 420, zIndex: 0, position: "relative" }}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Active Workers Map ({mapEntries.length})
          </p>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#3b82f6" }} />Clock In</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444" }} />Clock Out</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e" }} />On Going</span>
          </div>
        </div>
        <div style={{ height: 380, position: "relative" }}>
          {mapEntries.length > 0 ? (
            <WorkerMap activeEntries={mapEntries} lastTrackingMap={lastTrackingMap} pinFilter={pinFilter} />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
              No GPS-tracked entries today. The map will populate as workers clock in with location.
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-2.5">
          <span className="text-sm font-medium text-foreground">{selectedIds.size} entry{selectedIds.size > 1 ? "s" : ""} selected</span>
          <Button size="sm" variant="destructive" className="gap-1.5 h-7 text-xs ml-auto" disabled={deleting} onClick={handleDeleteSelected}>
            <Trash2 className="w-3.5 h-3.5" /> {deleting ? "Deleting..." : "Delete Selected"}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            Cancel
          </Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input className="pl-9" placeholder="Search employee, task, work order..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
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
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Active"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#22c55e" }} />On Going</span></SelectItem>
            <SelectItem value="Completed"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#ef4444" }} />Clocked Out</span></SelectItem>
            <SelectItem value="ClockIn"><span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: "#3b82f6" }} />Clock In</span></SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlyWithReport}
            onChange={e => setOnlyWithReport(e.target.checked)}
            className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
          />
          Show only with report
        </label>
      </div>

      {/* Entries grouped by day */}
      {loading ? (
        <div className="bg-card border border-border rounded-xl px-4 py-12 text-center text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl px-4 py-12 text-center text-muted-foreground">No time entries found</div>
      ) : sortedDays.map(day => {
        const dayEntries = sortEntries(groupedByDay[day]);
        const label = day === "unknown" ? "Unknown Date" : tzDayLabel(day, orgTimezone);
        const totalMins = dayEntries.reduce((s, e) => s + entryDuration(e), 0);
        const ongoing = dayEntries.filter(e => e.status === "Active").length;
        const completed = dayEntries.filter(e => e.status === "Completed" || e.status === "Switched").length;
        const uniqueWorkers = new Set(dayEntries.map(e => e.employee_id).filter(Boolean)).size;
        return (
          <div key={day} className="bg-card border border-border rounded-xl overflow-hidden">
            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
              <div className="flex items-center gap-2.5">
                <button type="button" onClick={(e) => toggleSelectDay(dayEntries, e)} className="text-muted-foreground hover:text-primary transition-colors">
                  {dayEntries.every(e => selectedIds.has(e.id))
                    ? <CheckSquare className="w-4 h-4 text-primary" />
                    : dayEntries.some(e => selectedIds.has(e.id))
                      ? <CheckSquare className="w-4 h-4 text-primary/50" />
                      : <Square className="w-4 h-4" />}
                </button>
                <span className="text-sm font-semibold text-foreground">{label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{dayEntries.length} entries</span>
                <span className="text-xs font-mono font-bold text-primary">{formatDuration(totalMins)}</span>
                <PrintDayReportsButton dayEntries={dayEntries} />
              </div>
            </div>
            {/* Per-day counters (compact) */}
            <div className="grid grid-cols-3 gap-2 px-4 py-1.5 bg-muted/15 border-b border-border">
              <div className="flex items-center gap-1.5">
                <LogIn className="w-3 h-3 text-green-500 shrink-0" />
                <span className="text-[11px] text-muted-foreground">Clocking On Going</span>
                <span className="text-xs font-bold text-foreground ml-auto">{ongoing}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle className="w-3 h-3 text-red-500 shrink-0" />
                <span className="text-[11px] text-muted-foreground">Completed Task</span>
                <span className="text-xs font-bold text-foreground ml-auto">{completed}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3 text-primary shrink-0" />
                <span className="text-[11px] text-muted-foreground">Workers Clocked In</span>
                <span className="text-xs font-bold text-foreground ml-auto">{uniqueWorkers}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/10">
                    <th className="w-7 px-1 py-1.5"></th>
                    <SortableTh colKey="employee" label="Employee" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-1.5 py-1.5 tracking-wide whitespace-nowrap" />
                    <SortableTh colKey="task" label="Task / Work Order" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-1.5 py-1.5 tracking-wide" />
                    <SortableTh colKey="inout" label="In → Out" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-1.5 py-1.5 tracking-wide whitespace-nowrap" />
                    <SortableTh colKey="duration" label="Duration" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-1.5 py-1.5 tracking-wide whitespace-nowrap" />
                    <th className="text-left px-1.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">Last Tracking</th>
                    <th className="text-left px-1.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Location</th>
                    <SortableTh colKey="status" label="Status" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="px-1.5 py-1.5 tracking-wide" />
                    {showPhotosColumn && <th className="text-left px-1.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Photos</th>}
                    <th className="text-left px-1.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amendment</th>
                    <th className="text-left px-1.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Report</th>
                    <th className="px-1 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {dayEntries.map(entry => (
                    <tr key={entry.id} className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors ${selectedIds.has(entry.id) ? "bg-primary/5" : ""}`}
                      onClick={() => setSelectedEntry(entry)}>
                      <td className="px-1 py-2" onClick={e => toggleSelect(entry.id, e)}>
                        {selectedIds.has(entry.id)
                          ? <CheckSquare className="w-4 h-4 text-primary" />
                          : <Square className="w-4 h-4 text-muted-foreground" />}
                      </td>
                      <td className="px-1.5 py-2">
                        <div className="flex items-center gap-1.5">
                          <Avatar className="w-6 h-6 shrink-0">
                            <AvatarImage src={employeeMap[entry.employee_id]?.avatar_url} />
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                              {entry.employee_name?.[0]?.toUpperCase() || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-foreground whitespace-nowrap text-xs">{entry.employee_name || "—"}</span>
                        </div>
                      </td>
                      <td className="px-1.5 py-2 max-w-[160px]">
                        <p className="font-medium text-foreground truncate text-xs">{entry.task_title}</p>
                        {entry.contact_name && <p className="text-[11px] text-muted-foreground truncate">{entry.contact_name}</p>}
                        {entry.work_order_name && <p className="text-[11px] text-muted-foreground truncate">{entry.work_order_name}</p>}
                        {entry.asset_name && <p className="text-[11px] text-muted-foreground truncate">Asset: {entry.asset_name}</p>}
                      </td>
                      <td className="px-1.5 py-2 text-muted-foreground whitespace-nowrap text-xs">
                        {entry.clock_in_time ? tzTime(entry.clock_in_time, orgTimezone) : "—"}
                        <span className="text-muted-foreground/50 mx-0.5">→</span>
                        {entry.clock_out_time ? tzTime(entry.clock_out_time, orgTimezone) : "—"}
                      </td>
                      <td className="px-1.5 py-2 font-mono text-foreground whitespace-nowrap text-xs">{formatDuration(entryDuration(entry))}</td>
                      <td className="px-1.5 py-2 whitespace-nowrap text-xs">
                        {entry.status === "Active" && lastTrackingMap[entry.id]?.recorded_at ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                            {tzTime(lastTrackingMap[entry.id].recorded_at, orgTimezone)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-1.5 py-2">
                        {entry.on_site != null ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${entry.on_site ? "text-green-600" : "text-orange-600"}`}>
                            {entry.on_site ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                            {entry.on_site ? "On Site" : "Off Site"}
                            {entry.distance_from_task_m != null && ` (${entry.distance_from_task_m}m)`}
                          </span>
                        ) : (
                          entry.clock_in_lat ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="w-3.5 h-3.5" /> GPS</span> : "—"
                        )}
                      </td>
                      <td className="px-1.5 py-2">
                        <Badge className={`text-xs w-fit ${statusColor(entry.status)}`}>
                          {entry.status === "Active" ? "On Going" : "Clocked Out"}
                        </Badge>
                      </td>
                      {showPhotosColumn && (
                        <td className="px-1 py-2" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                            {entry.clock_in_photo_url ? (
                              <button type="button" title="Clock-in photo" onClick={() => setPhotoPopup({ url: entry.clock_in_photo_url, label: "Clock-In Photo", employee: entry.employee_name })}>
                                <img src={entry.clock_in_photo_url} alt="In" className="w-7 h-7 rounded-md object-cover border border-green-300 hover:scale-110 hover:border-green-500 transition-all cursor-zoom-in" />
                              </button>
                            ) : (
                              <div className="w-7 h-7 rounded-md border border-dashed border-border flex items-center justify-center" title="No clock-in photo">
                                <Camera className="w-3 h-3 text-muted-foreground/40" />
                              </div>
                            )}
                            {entry.clock_out_photo_url ? (
                              <button type="button" title="Clock-out photo" onClick={() => setPhotoPopup({ url: entry.clock_out_photo_url, label: "Clock-Out Photo", employee: entry.employee_name })}>
                                <img src={entry.clock_out_photo_url} alt="Out" className="w-7 h-7 rounded-md object-cover border border-red-300 hover:scale-110 hover:border-red-500 transition-all cursor-zoom-in" />
                              </button>
                            ) : (
                              <div className="w-7 h-7 rounded-md border border-dashed border-border flex items-center justify-center" title="No clock-out photo">
                                <Camera className="w-3 h-3 text-muted-foreground/40" />
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                        {amendments[entry.id] ? (
                          <div className="flex flex-col gap-1 min-w-[140px]">
                            <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                              <ClipboardEdit className="w-3.5 h-3.5 shrink-0" />
                              <span>
                                {amendments[entry.id].amended_clock_in ? tzTime(amendments[entry.id].amended_clock_in, orgTimezone) : "—"}
                                {" → "}
                                {amendments[entry.id].amended_clock_out ? tzTime(amendments[entry.id].amended_clock_out, orgTimezone) : "—"}
                              </span>
                            </div>
                            {amendments[entry.id].reason && (
                              <p className="text-xs text-muted-foreground italic truncate max-w-[120px]">"{amendments[entry.id].reason}"</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                              <Button
                                size="sm"
                                className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700 text-white gap-1"
                                disabled={approvingId === amendments[entry.id].id}
                                onClick={(e) => handleApproveAmendment(amendments[entry.id], e)}
                              >
                                <ThumbsUp className="w-3 h-3" /> Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2 border-red-300 text-red-600 hover:bg-red-50 gap-1"
                                disabled={approvingId === amendments[entry.id].id}
                                onClick={(e) => handleRejectAmendment(amendments[entry.id], e)}
                              >
                                <ThumbsDown className="w-3 h-3" /> Reject
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs px-2 gap-1"
                                onClick={(e) => { e.stopPropagation(); setEditAmendment({ entry, amendment: amendments[entry.id] }); }}
                              >
                                <Pencil className="w-3 h-3" /> Edit
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                            onClick={(e) => { e.stopPropagation(); setEditAmendment({ entry, amendment: null }); }}
                          >
                            <Pencil className="w-3 h-3" /> Edit times
                          </button>
                        )}
                      </td>
                      <td className="px-1.5 py-2" onClick={e => e.stopPropagation()}>
                        <EntryReportButton entry={entry} />
                      </td>
                      <td className="px-1 py-2 text-right">
                        {entry.status === "Active" && (
                          <ActiveEntryInlineRow
                            entry={entry}
                            dayAccumulatedMinutes={dayEntries
                              .filter(e => e.employee_id === entry.employee_id && e.id !== entry.id && e.status !== "Active")
                              .reduce((s, e) => s + entryDuration(e), 0)}
                            onClockOut={handleClockOutSuccess}
                            onSwitchTask={(e) => { setReportEntry(null); setSwitchEntry(e); }}
                            onShowReport={handleShowReport}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {!loading && filtered.length > 0 && (
        <TimesheetPaginationFooter
          currentPage={safePage}
          totalPages={totalPages}
          totalItems={totalItems}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      )}

      <ClockInModal
        open={showClockIn}
        onClose={() => setShowClockIn(false)}
        onSuccess={handleClockInSuccess}
      />
      <ClockInModal
        open={!!switchEntry}
        onClose={() => setSwitchEntry(null)}
        onSuccess={handleSwitchSuccess}
        switchFromEntry={switchEntry}
      />
      {selectedEntry && (
        <TimeEntryDetailModal
          open={!!selectedEntry}
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      <ClockOutReportModal
        open={!!reportEntry}
        entry={reportEntry}
        onClose={handleReportClose}
      />

      <AmendmentEditModal
        open={!!editAmendment}
        entry={editAmendment?.entry}
        amendment={editAmendment?.amendment}
        onClose={() => setEditAmendment(null)}
        onSaved={() => { setEditAmendment(null); fetchEntries(); }}
      />

      {/* Photo lightbox popup */}
      {photoPopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setPhotoPopup(null)}
        >
          <div className="relative max-w-lg w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="bg-card rounded-2xl overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div>
                  <p className="text-sm font-semibold text-foreground">{photoPopup.label}</p>
                  {photoPopup.employee && <p className="text-xs text-muted-foreground">{photoPopup.employee}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => setPhotoPopup(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <img
                src={photoPopup.url}
                alt={photoPopup.label}
                className="w-full object-contain max-h-[70vh]"
              />
              <div className="px-4 py-2.5 flex justify-end border-t border-border">
                <a
                  href={photoPopup.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  Open full size ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}