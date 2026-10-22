import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import {
  AlertCircle,
  Camera,
  CheckCircle,
  CheckSquare,
  ClipboardEdit,
  Clock,
  Download,
  LogIn,
  MapPin,
  Pencil,
  Search,
  Square,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { SortableTh } from "@/components/shared/SortIcon";
import TimesheetPaginationFooter from "@/components/timesheets/TimesheetPaginationFooter";
import WorkerMap from "@/components/timesheets/WorkerMap";
import { exportToCSV } from "@/lib/csvExport";
import { tzTime, tzDateKey, tzDayLabel, DEFAULT_TIMEZONE } from "@/lib/timezones";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

const DEMO_TITLE = "Demo — view only";

function formatDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function entryDuration(entry) {
  if (entry.clock_in_time && entry.clock_out_time) {
    return Math.max(
      0,
      Math.round(
        (new Date(entry.clock_out_time) - new Date(entry.clock_in_time)) / 60000
      )
    );
  }
  return entry.duration_minutes || 0;
}

function statusColor(status) {
  if (status === "Active") return "bg-green-100 text-green-700 border-green-300";
  if (status === "Completed" || status === "Switched")
    return "bg-red-100 text-red-700 border-red-300";
  return "bg-muted text-muted-foreground";
}

const COLUMN_DEFS = [
  { key: "lastTracking", label: "Last Tracking" },
  { key: "location", label: "Location" },
  { key: "photos", label: "Photos" },
  { key: "amendment", label: "Amendment" },
  { key: "report", label: "Report" },
];

function noopDemo(e) {
  e?.stopPropagation?.();
}

export default function DemoTimesheets() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const entries = data?.timeEntries || [];
  const employees = data?.employees || [];
  const teams = data?.teams || [];
  const tasks = data?.tasks || [];
  const amendmentsList = data?.amendments || [];
  const workerLocations = data?.workerLocations || [];
  const workingReports = data?.workingReports || [];

  const orgTimezone = DEFAULT_TIMEZONE;
  const showPhotosColumn = true;

  const employeeMap = useMemo(() => {
    const map = {};
    employees.forEach((e) => {
      map[e.id] = e;
    });
    return map;
  }, [employees]);

  const amendments = useMemo(() => {
    const aMap = {};
    amendmentsList
      .filter((a) => a.status === "Pending")
      .forEach((a) => {
        aMap[a.time_entry_id] = a;
      });
    return aMap;
  }, [amendmentsList]);

  const entryIdsWithReport = useMemo(
    () =>
      new Set(workingReports.map((r) => r.time_entry_id).filter(Boolean)),
    [workingReports]
  );

  const reportsByEntryId = useMemo(() => {
    const map = {};
    workingReports.forEach((r) => {
      if (r.time_entry_id && !map[r.time_entry_id]) map[r.time_entry_id] = r;
    });
    return map;
  }, [workingReports]);

  const lastTrackingMap = useMemo(() => {
    const trackingMap = {};
    workerLocations.forEach((l) => {
      if (l.time_entry_id && !(l.time_entry_id in trackingMap)) {
        trackingMap[l.time_entry_id] = {
          lat: l.lat,
          lng: l.lng,
          recorded_at: l.recorded_at,
        };
      }
    });
    return trackingMap;
  }, [workerLocations]);

  const [showClockIn, setShowClockIn] = useState(false);
  const [clockInEmployeeId, setClockInEmployeeId] = useState("");
  const [clockInTaskId, setClockInTaskId] = useState("");
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [reportView, setReportView] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterTeam, setFilterTeam] = useState("all");
  const [onlyWithReport, setOnlyWithReport] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [sortKey, setSortKey] = useState("employee");
  const [sortDir, setSortDir] = useState("asc");
  const [visibleCols, setVisibleCols] = useState({
    lastTracking: true,
    location: true,
    photos: true,
    amendment: true,
    report: true,
  });
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(1);

  const toggleCol = useCallback((key) => {
    setVisibleCols((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterStatus, filterTeam, onlyWithReport, pageSize]);

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const handleSort = (col) => {
    if (sortKey === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(col);
      setSortDir("asc");
    }
  };

  const sortEntries = (list) => {
    const sorted = [...list];
    const dir = sortDir === "asc" ? 1 : -1;
    sorted.sort((a, b) => {
      let av;
      let bv;
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

  const filtered = entries.filter((e) => {
    if (filterTeam !== "all") {
      const emp = employeeMap[e.employee_id];
      if (!emp || emp.team_id !== filterTeam) return false;
    }
    if (filterStatus !== "all" && filterStatus !== "ClockIn") {
      if (filterStatus === "Completed") {
        if (e.status !== "Completed" && e.status !== "Switched") return false;
      } else if (e.status !== filterStatus) return false;
    }
    if (onlyWithReport && !entryIdsWithReport.has(e.id)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        e.employee_name?.toLowerCase().includes(q) ||
        e.task_title?.toLowerCase().includes(q) ||
        e.work_order_name?.toLowerCase().includes(q) ||
        e.contact_name?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const todayKey = tzDateKey(new Date(), orgTimezone);
  const mapEntries = filtered.filter(
    (e) =>
      e.clock_in_time?.startsWith(todayKey) &&
      ((e.clock_in_lat && e.clock_in_lng) ||
        (e.clock_out_lat && e.clock_out_lng))
  );

  const pinFilterByStatus = {
    all: "all",
    Active: "track",
    Completed: "out",
    ClockIn: "in",
  };
  const pinFilter = pinFilterByStatus[filterStatus] || "all";

  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.max(1, Math.min(currentPage, totalPages));
  const pagedEntries = filtered.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const groupedByDay = pagedEntries.reduce((acc, e) => {
    const day = e.clock_in_time
      ? tzDateKey(e.clock_in_time, orgTimezone)
      : "unknown";
    if (!acc[day]) acc[day] = [];
    acc[day].push(e);
    return acc;
  }, {});
  const sortedDays = Object.keys(groupedByDay).sort((a, b) => b.localeCompare(a));

  const exportCSV = () => {
    exportToCSV(`timesheets-demo-${new Date().toISOString().slice(0, 10)}`, [
      { key: "employee_name", label: "Employee" },
      { key: "task_title", label: "Task" },
      { key: "work_order_name", label: "Work Order" },
      { key: "project_name", label: "Project" },
      { key: "contact_name", label: "Client" },
      { key: "asset_name", label: "Asset" },
      { key: "clock_in_time", label: "Clock In" },
      { key: "clock_out_time", label: "Clock Out" },
      { key: (r) => entryDuration(r), label: "Duration (min)" },
      { key: "status", label: "Status" },
      { key: "on_site", label: "On Site" },
      { key: "clock_in_address", label: "Clock In Address" },
      { key: "clock_out_address", label: "Clock Out Address" },
      { key: "notes", label: "Notes" },
    ], filtered);
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectDay = (dayEntries, e) => {
    e.stopPropagation();
    const ids = dayEntries.map((en) => en.id);
    const allSelected = ids.every((id) => selectedIds.has(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const closeClockIn = () => {
    setShowClockIn(false);
    setClockInEmployeeId("");
    setClockInTaskId("");
  };

  const activeEmployees = employees.filter((e) => e.status === "Active");

  return (
    <div className="min-h-screen bg-background">
      <DemoTopNavBar companyName={data.companyName} />
      <main className="pt-[var(--nav-height)]">
        <div className="px-8 py-4 space-y-4 demo-readonly">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BackToOverviewButton to="/demo/app/operations-overview" />
              <div>
                <h1 className="text-2xl font-bold text-foreground">Timesheets</h1>
                <p className="text-sm text-muted-foreground">
                  Track employee clock-in/out against tasks
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={exportCSV}
                disabled={filtered.length === 0}
              >
                <Download className="w-4 h-4 mr-2" /> Export CSV
              </Button>
              <Button onClick={() => setShowClockIn(true)} title={DEMO_TITLE}>
                <LogIn className="w-4 h-4 mr-2" /> Clock In
              </Button>
            </div>
          </div>

          <div
            className="bg-card border border-border rounded-xl overflow-hidden"
            style={{ height: 420, zIndex: 0, position: "relative" }}
          >
            <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Active Workers Map ({mapEntries.length})
              </p>
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: "#3b82f6" }}
                  />
                  Clock In
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: "#ef4444" }}
                  />
                  Clock Out
                </span>
                <span className="flex items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: "#22c55e" }}
                  />
                  On Going
                </span>
              </div>
            </div>
            <div style={{ height: 380, position: "relative" }}>
              {mapEntries.length > 0 ? (
                <WorkerMap
                  activeEntries={mapEntries}
                  lastTrackingMap={lastTrackingMap}
                  pinFilter={pinFilter}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No GPS-tracked entries today. The map will populate as workers
                  clock in with location.
                </div>
              )}
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 bg-destructive/10 border border-destructive/30 rounded-xl px-4 py-2.5">
              <span className="text-sm font-medium text-foreground">
                {selectedIds.size} entry{selectedIds.size > 1 ? "s" : ""} selected
              </span>
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5 h-7 text-xs ml-auto"
                title={DEMO_TITLE}
                onClick={noopDemo}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Selected
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setSelectedIds(new Set())}
              >
                Cancel
              </Button>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9"
                placeholder="Search employee, task, work order..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Teams</SelectItem>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: t.color || "#6366f1" }}
                      />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: "#22c55e" }}
                    />
                    On Going
                  </span>
                </SelectItem>
                <SelectItem value="Completed">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: "#ef4444" }}
                    />
                    Clocked Out
                  </span>
                </SelectItem>
                <SelectItem value="ClockIn">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ background: "#3b82f6" }}
                    />
                    Clock In
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={onlyWithReport}
                onChange={(e) => setOnlyWithReport(e.target.checked)}
                className="w-4 h-4 rounded border-border accent-primary cursor-pointer"
              />
              Show only with report
            </label>
          </div>

          {filtered.length === 0 ? (
            <div className="bg-card border border-border rounded-xl px-4 py-12 text-center text-muted-foreground">
              No time entries found
            </div>
          ) : (
            sortedDays.map((day) => {
              const dayEntries = sortEntries(groupedByDay[day]);
              const label =
                day === "unknown" ? "Unknown Date" : tzDayLabel(day, orgTimezone);
              const totalMins = dayEntries.reduce(
                (s, e) => s + entryDuration(e),
                0
              );
              const ongoing = dayEntries.filter((e) => e.status === "Active").length;
              const completed = dayEntries.filter(
                (e) => e.status === "Completed" || e.status === "Switched"
              ).length;
              const uniqueWorkers = new Set(
                dayEntries.map((e) => e.employee_id).filter(Boolean)
              ).size;

              return (
                <div
                  key={day}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  <div className="flex items-center justify-between px-4 py-2.5 bg-muted/40 border-b border-border">
                    <div className="flex items-center gap-2.5">
                      <button
                        type="button"
                        onClick={(e) => toggleSelectDay(dayEntries, e)}
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        {dayEntries.every((e) => selectedIds.has(e.id)) ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : dayEntries.some((e) => selectedIds.has(e.id)) ? (
                          <CheckSquare className="w-4 h-4 text-primary/50" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                      <span className="text-sm font-semibold text-foreground">
                        {label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {dayEntries.length} entries
                      </span>
                      <span className="text-xs font-mono font-bold text-primary">
                        {formatDuration(totalMins)}
                      </span>
                      <ColumnToggle
                        columns={COLUMN_DEFS}
                        visible={visibleCols}
                        onToggle={toggleCol}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 px-4 py-1.5 bg-muted/15 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <LogIn className="w-3 h-3 text-green-500 shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        Clocking On Going
                      </span>
                      <span className="text-xs font-bold text-foreground ml-auto">
                        {ongoing}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="w-3 h-3 text-red-500 shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        Completed Task
                      </span>
                      <span className="text-xs font-bold text-foreground ml-auto">
                        {completed}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-primary shrink-0" />
                      <span className="text-[11px] text-muted-foreground">
                        Workers Clocked In
                      </span>
                      <span className="text-xs font-bold text-foreground ml-auto">
                        {uniqueWorkers}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-hidden scrollable-table px-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/10">
                          <th className="w-7 px-1 py-1.5" />
                          <SortableTh
                            colKey="employee"
                            label="Employee"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="px-1 py-1.5 tracking-wide whitespace-nowrap"
                          />
                          <SortableTh
                            colKey="task"
                            label="Task / Work Order"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="px-1 py-1.5 tracking-wide"
                          />
                          <SortableTh
                            colKey="inout"
                            label="In → Out"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="px-1 py-1.5 tracking-wide whitespace-nowrap"
                          />
                          <SortableTh
                            colKey="duration"
                            label="Duration"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="px-1 py-1.5 tracking-wide whitespace-nowrap"
                          />
                          {visibleCols.lastTracking && (
                            <th className="text-left px-1 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                              Track
                            </th>
                          )}
                          {visibleCols.location && (
                            <th className="text-center px-1 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              <MapPin className="w-3.5 h-3.5 inline" />
                            </th>
                          )}
                          <SortableTh
                            colKey="status"
                            label="Status"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                            className="px-1 py-1.5 tracking-wide"
                          />
                          {showPhotosColumn && visibleCols.photos && (
                            <th className="text-left px-1 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Photos
                            </th>
                          )}
                          {visibleCols.amendment && (
                            <th className="text-left px-1 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Amendment
                            </th>
                          )}
                          {visibleCols.report && (
                            <th className="text-left px-1 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Report
                            </th>
                          )}
                          <th className="px-1 py-1.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {dayEntries.map((entry) => (
                          <tr
                            key={entry.id}
                            className={`border-b border-border last:border-0 hover:bg-muted/20 cursor-pointer transition-colors ${
                              selectedIds.has(entry.id) ? "bg-primary/5" : ""
                            }`}
                            onClick={() => setSelectedEntry(entry)}
                          >
                            <td
                              className="px-1 py-1.5"
                              onClick={(e) => toggleSelect(entry.id, e)}
                            >
                              {selectedIds.has(entry.id) ? (
                                <CheckSquare className="w-4 h-4 text-primary" />
                              ) : (
                                <Square className="w-4 h-4 text-muted-foreground" />
                              )}
                            </td>
                            <td className="px-1.5 py-1.5">
                              <div className="flex items-center gap-1.5">
                                <Avatar className="w-6 h-6 shrink-0">
                                  <AvatarImage
                                    src={employeeMap[entry.employee_id]?.avatar_url}
                                  />
                                  <AvatarFallback className="text-[10px] bg-primary/10 text-primary font-bold">
                                    {entry.employee_name?.[0]?.toUpperCase() || "?"}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="font-medium text-foreground whitespace-nowrap text-xs">
                                  {entry.employee_name || "—"}
                                </span>
                              </div>
                            </td>
                            <td className="px-1.5 py-1.5 max-w-[160px]">
                              <p className="font-medium text-foreground truncate text-xs">
                                {entry.task_title}
                              </p>
                              {entry.contact_name && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {entry.contact_name}
                                </p>
                              )}
                              {entry.work_order_name && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {entry.work_order_name}
                                </p>
                              )}
                              {entry.asset_name && (
                                <p className="text-[11px] text-muted-foreground truncate">
                                  Asset: {entry.asset_name}
                                </p>
                              )}
                            </td>
                            <td className="px-1.5 py-1.5 text-muted-foreground whitespace-nowrap text-xs">
                              {entry.clock_in_time
                                ? tzTime(entry.clock_in_time, orgTimezone)
                                : "—"}
                              <span className="text-muted-foreground/50 mx-0.5">
                                →
                              </span>
                              {entry.clock_out_time
                                ? tzTime(entry.clock_out_time, orgTimezone)
                                : "—"}
                            </td>
                            <td className="px-1.5 py-1.5 font-mono text-foreground whitespace-nowrap text-xs">
                              {formatDuration(entryDuration(entry))}
                            </td>
                            {visibleCols.lastTracking && (
                              <td className="px-1 py-1.5 whitespace-nowrap text-xs">
                                {entry.status === "Active" &&
                                lastTrackingMap[entry.id]?.recorded_at ? (
                                  <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                                    {tzTime(
                                      lastTrackingMap[entry.id].recorded_at,
                                      orgTimezone
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">—</span>
                                )}
                              </td>
                            )}
                            {visibleCols.location && (
                              <td className="px-1 py-1.5 text-center">
                                {entry.on_site != null ? (
                                  <span
                                    title={`${entry.on_site ? "On Site" : "Off Site"}${
                                      entry.distance_from_task_m != null
                                        ? ` (${entry.distance_from_task_m}m)`
                                        : ""
                                    }`}
                                    className={
                                      entry.on_site
                                        ? "text-green-600"
                                        : "text-orange-600"
                                    }
                                  >
                                    {entry.on_site ? (
                                      <CheckCircle className="w-3.5 h-3.5 inline" />
                                    ) : (
                                      <AlertCircle className="w-3.5 h-3.5 inline" />
                                    )}
                                  </span>
                                ) : entry.clock_in_lat ? (
                                  <span title="GPS location" className="text-muted-foreground">
                                    <MapPin className="w-3.5 h-3.5 inline" />
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">—</span>
                                )}
                              </td>
                            )}
                            <td className="px-1 py-1.5">
                              <Badge
                                className={`text-xs w-fit ${statusColor(entry.status)}`}
                              >
                                {entry.status === "Active" ? "On Going" : "Clocked Out"}
                              </Badge>
                            </td>
                            {showPhotosColumn && visibleCols.photos && (
                              <td className="px-1 py-1.5" onClick={noopDemo}>
                                <div className="flex items-center gap-1">
                                  <div
                                    className="w-7 h-7 rounded-md border border-dashed border-border flex items-center justify-center"
                                    title="No clock-in photo"
                                  >
                                    <Camera className="w-3 h-3 text-muted-foreground/40" />
                                  </div>
                                  <div
                                    className="w-7 h-7 rounded-md border border-dashed border-border flex items-center justify-center"
                                    title="No clock-out photo"
                                  >
                                    <Camera className="w-3 h-3 text-muted-foreground/40" />
                                  </div>
                                </div>
                              </td>
                            )}
                            {visibleCols.amendment && (
                              <td className="px-1.5 py-1.5" onClick={noopDemo}>
                                {amendments[entry.id] ? (
                                  <div className="flex flex-col gap-1 min-w-[140px]">
                                    <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                                      <ClipboardEdit className="w-3.5 h-3.5 shrink-0" />
                                      <span>
                                        {amendments[entry.id].amended_clock_in
                                          ? tzTime(
                                              amendments[entry.id].amended_clock_in,
                                              orgTimezone
                                            )
                                          : "—"}
                                        {" → "}
                                        {amendments[entry.id].amended_clock_out
                                          ? tzTime(
                                              amendments[entry.id].amended_clock_out,
                                              orgTimezone
                                            )
                                          : "—"}
                                      </span>
                                    </div>
                                    {amendments[entry.id].reason && (
                                      <p className="text-xs text-muted-foreground italic truncate max-w-[120px]">
                                        &quot;{amendments[entry.id].reason}&quot;
                                      </p>
                                    )}
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                      <Button
                                        size="sm"
                                        className="h-6 text-xs px-2 bg-green-600 hover:bg-green-700 text-white gap-1"
                                        title={DEMO_TITLE}
                                        onClick={noopDemo}
                                      >
                                        <ThumbsUp className="w-3 h-3" /> Approve
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-xs px-2 border-red-300 text-red-600 hover:bg-red-50 gap-1"
                                        title={DEMO_TITLE}
                                        onClick={noopDemo}
                                      >
                                        <ThumbsDown className="w-3 h-3" /> Reject
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-6 text-xs px-2 gap-1"
                                        title={DEMO_TITLE}
                                        onClick={noopDemo}
                                      >
                                        <Pencil className="w-3 h-3" /> Edit
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                                    title={DEMO_TITLE}
                                    onClick={noopDemo}
                                  >
                                    <Pencil className="w-3 h-3" /> Edit times
                                  </button>
                                )}
                              </td>
                            )}
                            {visibleCols.report && (
                              <td className="px-1.5 py-1.5" onClick={noopDemo}>
                                {reportsByEntryId[entry.id] ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setReportView(reportsByEntryId[entry.id]);
                                    }}
                                  >
                                    View report
                                  </Button>
                                ) : (
                                  <span className="text-xs text-muted-foreground/50">
                                    No report
                                  </span>
                                )}
                              </td>
                            )}
                            <td
                              className="px-1 py-1.5 text-right"
                              onClick={noopDemo}
                            >
                              {entry.status === "Active" && (
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] px-2"
                                    title={DEMO_TITLE}
                                    onClick={noopDemo}
                                  >
                                    Clock Out
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] px-2"
                                    title={DEMO_TITLE}
                                    onClick={noopDemo}
                                  >
                                    Switch
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })
          )}

          {filtered.length > 0 && (
            <TimesheetPaginationFooter
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          )}
        </div>

        <Dialog open={showClockIn} onOpenChange={(o) => !o && closeClockIn()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Clock In</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Employee</label>
                <Select
                  value={clockInEmployeeId}
                  onValueChange={setClockInEmployeeId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Task</label>
                <Select value={clockInTaskId} onValueChange={setClockInTaskId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select task" />
                  </SelectTrigger>
                  <SelectContent>
                    {tasks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.reference ? `${t.reference} — ` : ""}
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeClockIn}>
                Cancel
              </Button>
              <Button title={DEMO_TITLE} onClick={closeClockIn}>
                Clock In
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!selectedEntry}
          onOpenChange={(o) => !o && setSelectedEntry(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Time entry</DialogTitle>
            </DialogHeader>
            {selectedEntry && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Employee</dt>
                <dd className="font-medium">{selectedEntry.employee_name || "—"}</dd>
                <dt className="text-muted-foreground">Task</dt>
                <dd>{selectedEntry.task_title || "—"}</dd>
                <dt className="text-muted-foreground">Work order</dt>
                <dd>{selectedEntry.work_order_name || "—"}</dd>
                <dt className="text-muted-foreground">Project</dt>
                <dd>{selectedEntry.project_name || "—"}</dd>
                <dt className="text-muted-foreground">Clock in</dt>
                <dd>
                  {selectedEntry.clock_in_time
                    ? tzTime(selectedEntry.clock_in_time, orgTimezone)
                    : "—"}
                </dd>
                <dt className="text-muted-foreground">Clock out</dt>
                <dd>
                  {selectedEntry.clock_out_time
                    ? tzTime(selectedEntry.clock_out_time, orgTimezone)
                    : "—"}
                </dd>
                <dt className="text-muted-foreground">Duration</dt>
                <dd>{formatDuration(entryDuration(selectedEntry))}</dd>
                <dt className="text-muted-foreground">Clock-in address</dt>
                <dd>{selectedEntry.clock_in_address || "—"}</dd>
                <dt className="text-muted-foreground">Clock-out address</dt>
                <dd>{selectedEntry.clock_out_address || "—"}</dd>
                <dt className="text-muted-foreground">On site</dt>
                <dd>
                  {selectedEntry.on_site == null
                    ? "—"
                    : selectedEntry.on_site
                      ? "Yes"
                      : "No"}
                </dd>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="col-span-2">{selectedEntry.notes || "—"}</dd>
              </dl>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedEntry(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!reportView}
          onOpenChange={(o) => !o && setReportView(null)}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Working report</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-foreground font-medium">
              {reportView?.title || "Report"}
            </p>
            <p className="text-xs text-muted-foreground">
              Demo preview — full report content is view-only in the live app.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setReportView(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <DemoGuideCard pageId="timesheets" />
      </main>
    </div>
  );
}
