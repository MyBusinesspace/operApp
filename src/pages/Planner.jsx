import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { startOfWeek, addDays, subDays, format, isSameDay } from "date-fns";
import { isOnLeaveOnDate } from "@/lib/leaveCalendar";
import PlannerHeader from "@/components/planner/PlannerHeader";
import PlannerRow from "@/components/planner/PlannerRow";
import DailyView from "@/components/planner/DailyView";
import TeamManagementModal from "@/components/planner/TeamManagementModal";
import { Loader2, Plus, MoreHorizontal, Printer, RefreshCw, AlertTriangle, Archive } from "lucide-react";
import TaskQuickEditModal from "@/components/planner/TaskQuickEditModal";
import TaskFormModal from "@/components/tasks/TaskFormModal";
import CellTaskPickerModal from "@/components/planner/CellTaskPickerModal";
import PrintDayScheduleButton from "@/components/planner/PrintDayScheduleButton";
import PlannerFilterBar from "@/components/planner/PlannerFilterBar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/components/ui/use-toast";

function DayMenu({ dateStr, onUpdateDayWorkers }) {
  const [open, setOpen] = React.useState(false);
  const [showPrint, setShowPrint] = React.useState(false);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        title="Day options"
      >
        <MoreHorizontal className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 bg-popover border border-border rounded-lg shadow-lg min-w-[160px] py-1">
          <button
            type="button"
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted/50 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              setShowPrint(true);
            }}
          >
            <Printer className="w-3 h-3" />
            Print Day Schedule
          </button>
          {onUpdateDayWorkers && (
            <button
              type="button"
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
                onUpdateDayWorkers(dateStr);
              }}
            >
              <RefreshCw className="w-3 h-3" />
              Update workers
            </button>
          )}
        </div>
      )}
      <PrintDayScheduleButton dateStr={dateStr} externalOpen={showPrint} onExternalOpenChange={setShowPrint} />
    </div>
  );
}

export default function Planner() {
  // Center today in the 7-day window by default (today = 4th column)
  const [currentWeek, setCurrentWeek] = useState(() => subDays(new Date(), 3));
  const [viewBy, setViewByRaw] = useState(() => {
    try { return localStorage.getItem("planner_view_by") || "team"; } catch { return "team"; }
  });
  const setViewBy = (v) => {
    setViewByRaw(v);
    try { localStorage.setItem("planner_view_by", v); } catch {}
  };
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [rowOrder, setRowOrder] = useState(() => {
    try { return JSON.parse(localStorage.getItem("planner_row_order") || "{}"); } catch { return {}; }
  }); // { employee: [...ids], team: [...ids], project: [...ids] }
  const [draggingRowId, setDraggingRowId] = useState(null);
  const [rowDragOverId, setRowDragOverId] = useState(null);
  const [draggingEmployeeId, setDraggingEmployeeId] = useState(null); // for avatar drag-to-reassign
  const [tasks, setTasks] = useState([]);
  const [timeEntries, setTimeEntries] = useState([]);
  const [subtasksMap, setSubtasksMap] = useState({});
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draggingTask, setDraggingTask] = useState(null);
  const [teamsModalOpen, setTeamsModalOpen] = useState(false);
  const [mode, setModeRaw] = useState(() => {
    try { return localStorage.getItem("planner_mode") || "week"; } catch { return "week"; }
  });
  const setMode = (v) => {
    setModeRaw(v);
    try { localStorage.setItem("planner_mode", v); } catch {}
  };
  const [currentDay, setCurrentDay] = useState(new Date());
  const [quickEditTask, setQuickEditTask] = useState(null);
  const [newTaskOpen, setNewTaskOpen] = useState(false);
  const [newTaskDate, setNewTaskDate] = useState(null);
  const [newTaskTemplate, setNewTaskTemplate] = useState(null);
  const [cellPicker, setCellPicker] = useState(null); // { entity, dateStr }
  const [dayWorkersConfirm, setDayWorkersConfirm] = useState(null); // { dateStr, tasks }
  const [updatingDayWorkers, setUpdatingDayWorkers] = useState(false);
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterWorkOrder, setFilterWorkOrder] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [collapseCompleted, setCollapseCompleted] = useState(() => {
    try { return localStorage.getItem("planner_collapse_completed") !== "false"; } catch { return true; }
  });
  const toggleCollapseCompleted = () => {
    setCollapseCompleted(prev => {
      const next = !prev;
      try { localStorage.setItem("planner_collapse_completed", String(next)); } catch {}
      return next;
    });
  };


  // currentWeek stores the actual window start (may be any day when navigating by day)
  const weekStart = currentWeek;
  const weekEnd = addDays(weekStart, 6);

  useEffect(() => {
    loadData();
    // Realtime: update task status/data when tasks change elsewhere
    const unsubscribe = base44.entities.Task.subscribe((event) => {
      if (event.type === "delete") {
        setTasks(prev => prev.filter(t => t.id !== event.id));
        return;
      }
      const updated = event.data;
      if (!updated) return;
      setTasks(prev => {
        const idx = prev.findIndex(t => t.id === event.id);
        if (idx === -1) {
          if (updated.planning_date) return [...prev, updated];
          return prev;
        }
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      });
    });
    // Realtime: keep team order in sync with reorders made in Team Management
    const unsubscribeTeams = base44.entities.Team.subscribe((event) => {
      if (event.type === "delete") {
        setTeams(prev => prev.filter(t => t.id !== event.id));
        return;
      }
      const updated = event.data;
      if (!updated) return;
      setTeams(prev => {
        const idx = prev.findIndex(t => t.id === event.id);
        if (idx === -1) return [...prev, updated];
        const next = [...prev];
        next[idx] = { ...next[idx], ...updated };
        return next;
      });
    });
    // Realtime: sync Project edits (rename etc.) into planner lists + cached task names
    const unsubscribeProjects = base44.entities.Project.subscribe((event) => {
      if (event.type === "delete") {
        setProjects(prev => prev.filter(p => p.id !== event.id));
        setTasks(prev => prev.map(t => t.project_id === event.id ? { ...t, project_id: null, project_name: "" } : t));
        return;
      }
      const updated = event.data;
      if (!updated) return;
      setProjects(prev => {
        const idx = prev.findIndex(p => p.id === event.id);
        if (idx === -1) return [...prev, updated];
        const next = [...prev]; next[idx] = { ...next[idx], ...updated }; return next;
      });
      if (updated.name) {
        setTasks(prev => prev.map(t => t.project_id === event.id ? { ...t, project_name: updated.name } : t));
      }
    });
    // Realtime: sync Work Order edits into planner lists + cached task names
    const unsubscribeWorkOrders = base44.entities.WorkOrder.subscribe((event) => {
      if (event.type === "delete") {
        setWorkOrders(prev => prev.filter(w => w.id !== event.id));
        setTasks(prev => prev.map(t => t.work_order_id === event.id ? { ...t, work_order_id: null, work_order_name: "" } : t));
        return;
      }
      const updated = event.data;
      if (!updated) return;
      setWorkOrders(prev => {
        const idx = prev.findIndex(w => w.id === event.id);
        if (idx === -1) return [...prev, updated];
        const next = [...prev]; next[idx] = { ...next[idx], ...updated }; return next;
      });
      if (updated.title) {
        setTasks(prev => prev.map(t => t.work_order_id === event.id ? { ...t, work_order_name: updated.title } : t));
      }
    });
    // Realtime: sync Employee edits (rename etc.) into planner lists + cached task names
    const unsubscribeEmployees = base44.entities.Employee.subscribe((event) => {
      if (event.type === "delete") {
        setEmployees(prev => prev.filter(e => e.id !== event.id));
        setTasks(prev => prev.map(t => {
          const ids = t.assigned_employees || [];
          if (!ids.includes(event.id)) return t;
          const names = (t.assigned_employee_names || []).map((n, i) => ids[i] === event.id ? null : n).filter(Boolean);
          return { ...t, assigned_employees: ids.filter(x => x !== event.id), assigned_employee_names: names };
        }));
        return;
      }
      const updated = event.data;
      if (!updated) return;
      setEmployees(prev => {
        const idx = prev.findIndex(e => e.id === event.id);
        if (idx === -1) return [...prev, updated].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const next = [...prev]; next[idx] = { ...next[idx], ...updated };
        return next.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      });
      if (updated.full_name) {
        setTasks(prev => prev.map(t => {
          const ids = t.assigned_employees || [];
          if (!ids.includes(event.id)) return t;
          const names = (t.assigned_employee_names || []).map((n, i) => ids[i] === event.id ? updated.full_name : n);
          return { ...t, assigned_employee_names: names };
        }));
      }
    });
    return () => { if (unsubscribe) unsubscribe(); if (unsubscribeTeams) unsubscribeTeams(); if (unsubscribeProjects) unsubscribeProjects(); if (unsubscribeWorkOrders) unsubscribeWorkOrders(); if (unsubscribeEmployees) unsubscribeEmployees(); };
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [empList, teamList, projList, taskList, teList, woList, subList, leaveList] = await Promise.all([
      base44.entities.Employee.list("full_name", 500),
      base44.entities.Team.list("sort_order", 200),
      base44.entities.Project.list("name", 200),
      base44.entities.Task.list('-planning_date', 500),
      base44.entities.TimeEntry.list("-clock_in_time", 500),
      base44.entities.WorkOrder.list("title", 200),
      base44.entities.TaskSubtask.list("created_date", 500),
      base44.entities.LeaveRequest.filter({ status: "approved" }),
    ]);
    // Auto-fix: Pending tasks that have a date + time slot should be Planned
    const toFix = taskList.filter(t =>
      t.status === "Queued" && t.planning_date && t.planning_time_in && t.planning_time_out
    );
    if (toFix.length > 0) {
      await Promise.all(toFix.map(t => base44.entities.Task.update(t.id, { status: "Scheduled" })));
      toFix.forEach(t => { t.status = "Scheduled"; });
    }

    setEmployees([...empList].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    setTeams([...teamList].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)));
    setProjects(projList);
    setWorkOrders(woList);
    setTasks(taskList);
    setTimeEntries(teList);
    const sMap = {};
    (subList || []).forEach(s => { if (!sMap[s.task_id]) sMap[s.task_id] = []; sMap[s.task_id].push(s); });
    setSubtasksMap(sMap);
    setLeaveRequests(leaveList || []);
    setLoading(false);
  };

  const saveRowOrder = (viewKey, ordered) => {
    setRowOrder(prev => {
      const next = { ...prev, [viewKey]: ordered };
      try { localStorage.setItem("planner_row_order", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // --- Planner filters (coordinated like Tasks page) ---
  // Only tasks with a planning_date are relevant to the planner
  const plannerTasks = tasks.filter(t => t.planning_date);

  const searchFiltered = plannerTasks.filter(t => {
    const s = search.toLowerCase();
    if (!s) return true;
    return t.title?.toLowerCase().includes(s) ||
      t.description?.toLowerCase().includes(s) ||
      t.reference?.toLowerCase().includes(s) ||
      t.work_order_name?.toLowerCase().includes(s) ||
      t.project_name?.toLowerCase().includes(s) ||
      t.contact_name?.toLowerCase().includes(s) ||
      (t.assigned_employee_names || []).some(n => n.toLowerCase().includes(s)) ||
      (t.assigned_team_names || []).some(n => n.toLowerCase().includes(s));
  });

  // Resolve live entity names by id (falls back to the task's cached name when no id).
  // This keeps the dropdown lists + filters in sync with renames done elsewhere, since
  // the `projects`/`workOrders`/`employees` state is updated in real time (see subscriptions).
  const empNameById = (id) => employees.find(e => e.id === id)?.full_name;
  const woNameById = (id) => workOrders.find(w => w.id === id)?.title;
  const projNameById = (id) => projects.find(p => p.id === id)?.name;
  const taskEmpNames = (t) => (t.assigned_employees || []).map((id, i) => empNameById(id) || t.assigned_employee_names?.[i] || "?");
  const taskWOName = (t) => (t.work_order_id ? (woNameById(t.work_order_id) || t.work_order_name) : t.work_order_name);
  const taskProjName = (t) => (t.project_id ? (projNameById(t.project_id) || t.project_name) : t.project_name);

  // Coordinated dropdown options: each derived from tasks matching all OTHER active dropdown filters
  const tasksExcluding = (exclude) => searchFiltered.filter(t => {
    if (exclude !== "employee"  && !(filterEmployee  === "all" || taskEmpNames(t).includes(filterEmployee))) return false;
    if (exclude !== "workOrder" && !(filterWorkOrder === "all" || taskWOName(t) === filterWorkOrder)) return false;
    if (exclude !== "project"   && !(filterProject   === "all" || taskProjName(t) === filterProject))  return false;
    return true;
  });

  const availEmployees  = [...new Map(tasksExcluding("employee").flatMap(t => (t.assigned_employees || []).map(id => [id, empNameById(id) || t.assigned_employee_names?.[(t.assigned_employees || []).indexOf(id)] || "?"]))).values()].sort((a, b) => a.localeCompare(b));
  const availWorkOrders = [...new Map(tasksExcluding("workOrder").filter(t => t.work_order_id).map(t => [t.work_order_id, taskWOName(t)])).values()].sort((a, b) => a.localeCompare(b));
  const availProjects   = [...new Map(tasksExcluding("project").filter(t => t.project_id).map(t => [t.project_id, taskProjName(t)])).values()].sort((a, b) => a.localeCompare(b));

  // Final filtered tasks used across the planner grid
  const filteredTasks = searchFiltered.filter(t => {
    const matchEmp     = filterEmployee  === "all" || taskEmpNames(t).includes(filterEmployee);
    const matchWO      = filterWorkOrder === "all" || taskWOName(t) === filterWorkOrder;
    const matchProject = filterProject   === "all" || taskProjName(t) === filterProject;
    return matchEmp && matchWO && matchProject;
  });

  // --- Search results navigation ---
  // Time-ordered list of tasks matching the current search term, with a selector
  // to step through them across different dates without manual day/week scrolling.
  const [searchIndex, setSearchIndex] = useState(0);

  const searchMatches = useMemo(() => {
    const term = (search || "").trim().toLowerCase();
    if (!term) return [];
    return plannerTasks
      .filter(t => {
        const s = term;
        return t.title?.toLowerCase().includes(s) ||
          t.description?.toLowerCase().includes(s) ||
          t.reference?.toLowerCase().includes(s) ||
          t.work_order_name?.toLowerCase().includes(s) ||
          t.project_name?.toLowerCase().includes(s) ||
          t.contact_name?.toLowerCase().includes(s) ||
          (t.assigned_employee_names || []).some(n => n.toLowerCase().includes(s)) ||
          (t.assigned_team_names || []).some(n => n.toLowerCase().includes(s));
      })
      .filter(t => t.planning_date)
      .sort((a, b) => new Date(a.planning_date) - new Date(b.planning_date));
  }, [search, plannerTasks]);

  // Reset to the first match whenever the search term changes.
  useEffect(() => { setSearchIndex(0); }, [search]);

  // Navigate the planner to the selected match's date (both day + week cursors).
  useEffect(() => {
    if (searchMatches.length === 0) return;
    const match = searchMatches[Math.min(searchIndex, searchMatches.length - 1)];
    const date = new Date(match.planning_date + "T00:00:00");
    if (Number.isNaN(date.getTime())) return;
    setCurrentDay(date);
    setCurrentWeek(startOfWeek(date, { weekStartsOn: 1 }));
  }, [searchMatches, searchIndex]);

  const goPrevMatch = () => searchMatches.length > 0 && setSearchIndex(i => (i - 1 + searchMatches.length) % searchMatches.length);
  const goNextMatch = () => searchMatches.length > 0 && setSearchIndex(i => (i + 1) % searchMatches.length);

  // Get tasks for a specific entity depending on viewBy
  // Show all statuses: Scheduled, Not Completed, Completed, Queued with planning_date
  const getTasksForEntity = (entity) => {
    if (entity._unassigned) {
      // Show tasks that have a planning_date but no team/employee assignment
      return filteredTasks.filter(task => {
        if (!task.planning_date) return false;
        const hasTeam = (task.assigned_team_ids?.length > 0);
        const hasEmp = (task.assigned_employees?.length > 0);
        return !hasTeam && !hasEmp;
      });
    }
    return filteredTasks.filter((task) => {
      // Must have a planning_date to appear in the planner
      if (!task.planning_date) return false;
      if (viewBy === "employee") {
        return (
          task.assigned_employees?.includes(entity.id) ||
          task.assigned_users?.includes(entity.user_id) ||
          task.assigned_employee_names?.includes(entity.full_name)
        );
      }
      if (viewBy === "team") {
        // Direct team assignment
        if (task.assigned_team_ids?.includes(entity.id)) return true;
        // Also show tasks assigned to any employee belonging to this team
        const teamEmployeeIds = employees.filter(e => e.team_id === entity.id).map(e => e.id);
        return teamEmployeeIds.length > 0 && task.assigned_employees?.some(eid => teamEmployeeIds.includes(eid));
      }
      if (viewBy === "project") {
        if (task.project_id === entity.id) return true;
        if (!task.project_id && task.project_name && task.project_name === entity.name) return true;
        // Also match via work order → project linkage
        if (task.work_order_id) {
          const wo = workOrders.find(w => w.id === task.work_order_id);
          if (wo && wo.project_id === entity.id) return true;
        }
        return false;
      }
      return false;
    });
  };

  // Unassigned row: tasks with a planning_date but no team/employee assignment
  const unassignedTasks = filteredTasks.filter(task => {
    if (!task.planning_date) return false;
    const hasTeam = (task.assigned_team_ids?.length > 0);
    const hasEmp = (task.assigned_employees?.length > 0);
    return !hasTeam && !hasEmp;
  });
  const unassignedRow = unassignedTasks.length > 0
    ? { id: "__unassigned__", name: "Unassigned", _unassigned: true, color: "#94a3b8" }
    : null;

  // Task drag & drop: move to new date, optionally reassign team employees
  const handleTaskDragStart = (task) => {
    setDraggingTask(task);
  };

  const handleTaskDrop = async (newDate, targetEntity) => {
    if (!draggingTask) return;
    setDraggingTask(null);

    const updates = { planning_date: newDate };

    // If dropped on a team row and team changed, replace employees with this team's members
    if (viewBy === "team" && targetEntity) {
      const teamEmps = employees.filter(e => e.team_id === targetEntity.id);
      if (teamEmps.length > 0) {
        updates.assigned_team_ids = [targetEntity.id];
        updates.assigned_team_names = [targetEntity.name];
        updates.assigned_employees = teamEmps.map(e => e.id);
        updates.assigned_employee_names = teamEmps.map(e => e.full_name);
      }
    }

    // If dropped on an employee row, replace with that single employee
    if (viewBy === "employee" && targetEntity) {
      updates.assigned_employees = [targetEntity.id];
      updates.assigned_employee_names = [targetEntity.full_name];
      // clear team assignment if moved to a different employee's row
      updates.assigned_team_ids = [];
      updates.assigned_team_names = [];
    }

    // Optimistic update — no full reload
    setTasks(prev => prev.map(t => t.id === draggingTask.id ? { ...t, ...updates } : t));
    base44.entities.Task.update(draggingTask.id, updates);
  };

  // Teams and employees use DB sort_order as source of truth; projects use localStorage
  const baseRows = viewBy === "employee"
    ? [...employees].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : viewBy === "team"
    ? [...teams].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : projects;

  const currentOrder = (viewBy === "team" || viewBy === "employee") ? [] : (rowOrder[viewBy] || []);
  const rows = currentOrder.length > 0
    ? [...baseRows].sort((a, b) => {
        const ia = currentOrder.indexOf(a.id);
        const ib = currentOrder.indexOf(b.id);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
    : baseRows;

  // Employees on leave for the currently-viewed day (for the "On Leave" badge).
  const todayStr = format(currentDay, "yyyy-MM-dd");
  const onLeaveIds = useMemo(() => {
    const ids = new Set();
    employees.forEach(e => { if (isOnLeaveOnDate(e.id, todayStr, leaveRequests)) ids.add(e.id); });
    return ids;
  }, [employees, todayStr, leaveRequests]);

  // Row drag-and-drop handlers
  const handleRowDragStart = (id) => setDraggingRowId(id);
  const handleRowDragEnd = () => { setDraggingRowId(null); setRowDragOverId(null); };
  const handleRowDragOver = (e, id) => {
    e.preventDefault();
    if (id !== draggingRowId) setRowDragOverId(id);
  };
  const persistDbOrder = (orderedIds, entityName, setState) => {
    setState(prev => {
      const next = [...prev].sort((a, b) => orderedIds.indexOf(a.id) - orderedIds.indexOf(b.id));
      return next.map((t, i) => ({ ...t, sort_order: i }));
    });
    Promise.all(orderedIds.map((id, i) => base44.entities[entityName].update(id, { sort_order: i }).catch(() => {})));
  };

  const handleRowDrop = (targetId) => {
    if (!draggingRowId || draggingRowId === targetId) return;
    const ordered = rows.map(r => r.id);
    const fromIdx = ordered.indexOf(draggingRowId);
    const toIdx = ordered.indexOf(targetId);
    ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, draggingRowId);
    if (viewBy === "team") persistDbOrder(ordered, "Team", setTeams);
    else if (viewBy === "employee") persistDbOrder(ordered, "Employee", setEmployees);
    else saveRowOrder(viewBy, ordered);
    setDraggingRowId(null);
    setRowDragOverId(null);
  };

  const moveRow = (id, direction) => {
    const ordered = rows.map(r => r.id);
    const idx = ordered.indexOf(id);
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= ordered.length) return;
    ordered.splice(idx, 1);
    ordered.splice(targetIdx, 0, id);
    if (viewBy === "team") persistDbOrder(ordered, "Team", setTeams);
    else if (viewBy === "employee") persistDbOrder(ordered, "Employee", setEmployees);
    else saveRowOrder(viewBy, ordered);
  };

  // Avatar drag-to-reassign employee between team rows
  const handleAvatarDragStart = (employeeId) => setDraggingEmployeeId(employeeId);
  const handleAvatarDropOnTeam = async (targetTeamId) => {
    if (!draggingEmployeeId) return;
    const emp = employees.find(e => e.id === draggingEmployeeId);
    if (!emp || emp.team_id === targetTeamId) { setDraggingEmployeeId(null); return; }
    const targetTeam = teams.find(t => t.id === targetTeamId);
    // Optimistic update — no full reload
    setEmployees(prev => prev.map(e => e.id === draggingEmployeeId
      ? { ...e, team_id: targetTeamId, team_name: targetTeam?.name || "" }
      : e
    ));
    setDraggingEmployeeId(null);
    base44.entities.Employee.update(draggingEmployeeId, { team_id: targetTeamId, team_name: targetTeam?.name || "" });
  };

  // Queued tasks available for assignment from cell picker
  const queuedTasks = tasks.filter(t => t.status === "Queued" && !t.planning_date);

  // Assign a queued task to a cell's entity + date
  // Re-sync a task's assigned workers to match their current team/group membership.
  // Useful after workers are moved between groups while the task kept a stale snapshot.
  const handleUpdateWorkers = async (task) => {
    if (!task?.id) return;
    // Resolve the task's teams. If the task has no teams stored, derive them from
    // the current teams of its assigned employees — then sync membership against
    // those teams so workers who left are removed, not just new ones added.
    let teamIds = (task.assigned_team_ids || []).filter(id => teams.some(t => t.id === id));
    if (teamIds.length === 0) {
      const empIds = task.assigned_employees || [];
      teamIds = [...new Set(
        employees.filter(e => empIds.includes(e.id) && e.team_id).map(e => e.team_id)
      )];
    }
    let updates = {};
    if (teamIds.length > 0) {
      const currentTeams = teams.filter(t => teamIds.includes(t.id));
      const teamEmps = employees.filter(e =>
        teamIds.includes(e.team_id) && !isOnLeaveOnDate(e.id, task.planning_date, leaveRequests)
      );
      updates.assigned_team_ids = currentTeams.map(t => t.id);
      updates.assigned_team_names = currentTeams.map(t => t.name);
      updates.assigned_employees = teamEmps.map(e => e.id);
      updates.assigned_employee_names = teamEmps.map(e => e.full_name);
    } else {
      // No teams derivable — just refresh cached names for the assigned employees
      const empIds = task.assigned_employees || [];
      const matched = employees.filter(e => empIds.includes(e.id));
      updates.assigned_employee_names = matched.map(e => e.full_name);
    }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates } : t));
    try {
      await base44.entities.Task.update(task.id, updates);
      // Refresh employees so team_id changes made elsewhere are reflected locally
      const freshEmployees = await base44.entities.Employee.list("full_name", 500);
      setEmployees(freshEmployees);
    } catch (e) {
      console.error("Update workers error:", e);
      loadData();
    }
  };

  // Day-level: open confirmation dialog to sync workers across all tasks scheduled on a given day.
  const openDayWorkersConfirm = (dateStr) => {
    const dayTasks = tasks.filter(t => t.planning_date === dateStr);
    if (dayTasks.length === 0) {
      toast({ title: "No tasks scheduled", description: `There are no tasks planned for ${format(new Date(dateStr), "MMM d")}.` });
      return;
    }
    const flagged = dayTasks.filter(t => {
      const multiTeam = (t.assigned_team_ids || []).length > 1;
      const teamsOfEmps = [...new Set((t.assigned_employees || [])
        .map(id => employees.find(e => e.id === id)?.team_id).filter(Boolean))];
      const looseAcrossTeams = teamsOfEmps.length > 1;
      return multiTeam || looseAcrossTeams;
    });
    setDayWorkersConfirm({ dateStr, tasks: dayTasks, flaggedCount: flagged.length });
  };

  const computeWorkersUpdate = (task) => {
    // Same logic as handleUpdateWorkers: resolve the task's teams (directly or
    // derived from assigned employees), then keep only current team members.
    let teamIds = (task.assigned_team_ids || []).filter(id => teams.some(t => t.id === id));
    if (teamIds.length === 0) {
      const empIds = task.assigned_employees || [];
      teamIds = [...new Set(
        employees.filter(e => empIds.includes(e.id) && e.team_id).map(e => e.team_id)
      )];
    }
    const updates = {};
    if (teamIds.length > 0) {
      const currentTeams = teams.filter(t => teamIds.includes(t.id));
      const teamEmps = employees.filter(e =>
        teamIds.includes(e.team_id) && !isOnLeaveOnDate(e.id, task.planning_date, leaveRequests)
      );
      updates.assigned_team_ids = currentTeams.map(t => t.id);
      updates.assigned_team_names = currentTeams.map(t => t.name);
      updates.assigned_employees = teamEmps.map(e => e.id);
      updates.assigned_employee_names = teamEmps.map(e => e.full_name);
    } else {
      const empIds = task.assigned_employees || [];
      const matched = employees.filter(e => empIds.includes(e.id));
      updates.assigned_employee_names = matched.map(e => e.full_name);
    }
    return updates;
  };

  const confirmDayWorkersUpdate = async () => {
    if (!dayWorkersConfirm) return;
    const { tasks: dayTasks, dateStr } = dayWorkersConfirm;
    setUpdatingDayWorkers(true);
    let ok = 0;
    let fail = 0;
    for (const task of dayTasks) {
      const updates = computeWorkersUpdate(task);
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates } : t));
      try {
        await base44.entities.Task.update(task.id, updates);
        ok++;
      } catch {
        fail++;
      }
    }
    setUpdatingDayWorkers(false);
    setDayWorkersConfirm(null);
    if (fail === 0) {
      toast({
        title: "Workers updated",
        description: `Synced ${ok} task${ok !== 1 ? "s" : ""} on ${format(new Date(dateStr), "MMM d")} to current team members.`,
      });
    } else {
      toast({
        title: "Update completed with errors",
        description: `${ok} updated, ${fail} failed on ${format(new Date(dateStr), "MMM d")}.`,
        variant: "destructive",
      });
    }
  };

  const handleDeleteTask = async (task) => {
    if (!task?.id) return;
    if (!window.confirm(`Delete "${task.title}"? This will remove it from the planner and the Tasks list.`)) return;
    setTasks(prev => prev.filter(t => t.id !== task.id));
    setQuickEditTask(null);
    try {
      await base44.entities.Task.delete(task.id);
    } catch (e) {
      console.error("Delete task error:", e);
      loadData();
    }
  };

  const handleCellAssignTask = async (task) => {
    if (!cellPicker) return;
    const { entity, dateStr } = cellPicker;
    const updates = { planning_date: dateStr, status: "Scheduled" };

    if (viewBy === "team" && !entity._unassigned) {
      const teamEmps = employees.filter(e => e.team_id === entity.id);
      updates.assigned_team_ids = [entity.id];
      updates.assigned_team_names = [entity.name];
      if (teamEmps.length > 0) {
        updates.assigned_employees = teamEmps.map(e => e.id);
        updates.assigned_employee_names = teamEmps.map(e => e.full_name);
      }
    }
    if (viewBy === "employee" && !entity._unassigned) {
      updates.assigned_employees = [entity.id];
      updates.assigned_employee_names = [entity.full_name];
    }
    if (viewBy === "project" && !entity._unassigned) {
      updates.project_id = entity.id;
      updates.project_name = entity.name;
    }

    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...updates } : t));
    await base44.entities.Task.update(task.id, updates);
  };

  // Open TaskFormModal pre-filled with entity + date from a cell
  const handleCellCreateNew = () => {
    if (!cellPicker) return;
    const { entity, dateStr } = cellPicker;
    const template = { planning_date: dateStr };
    if (viewBy === "team" && !entity._unassigned) {
      template.assigned_team_ids = [entity.id];
      template.assigned_team_names = [entity.name];
      const teamEmps = employees.filter(e => e.team_id === entity.id);
      if (teamEmps.length > 0) {
        template.assigned_employees = teamEmps.map(e => e.id);
        template.assigned_employee_names = teamEmps.map(e => e.full_name);
      }
    }
    if (viewBy === "employee" && !entity._unassigned) {
      template.assigned_employees = [entity.id];
      template.assigned_employee_names = [entity.full_name];
    }
    if (viewBy === "project" && !entity._unassigned) {
      template.project_id = entity.id;
      template.project_name = entity.name;
    }
    setNewTaskTemplate(template);
    setNewTaskDate(dateStr);
    setNewTaskOpen(true);
  };

  // Day header row
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--nav-height)-3rem)] bg-background">
      <PlannerHeader
        currentWeek={currentWeek}
        setCurrentWeek={setCurrentWeek}
        weekStart={weekStart}
        viewBy={viewBy}
        setViewBy={setViewBy}
        onNewTask={() => { setNewTaskTemplate(null); setNewTaskDate(null); setNewTaskOpen(true); }}
        onOpenTeams={() => setTeamsModalOpen(true)}
        onViewByChange={setViewBy}
        mode={mode}
        setMode={setMode}
        currentDay={currentDay}
        setCurrentDay={setCurrentDay}
        collapseCompleted={collapseCompleted}
        onToggleCollapseCompleted={toggleCollapseCompleted}
      />
      <PlannerFilterBar
        search={search}
        setSearch={setSearch}
        filterEmployee={filterEmployee}
        setFilterEmployee={setFilterEmployee}
        filterWorkOrder={filterWorkOrder}
        setFilterWorkOrder={setFilterWorkOrder}
        filterProject={filterProject}
        setFilterProject={setFilterProject}
        availEmployees={availEmployees}
        availWorkOrders={availWorkOrders}
        availProjects={availProjects}
        searchResultsCount={searchMatches.length}
        searchResultIndex={searchIndex}
        onPrevResult={goPrevMatch}
        onNextResult={goNextMatch}
      />
      <TeamManagementModal
        open={teamsModalOpen}
        onClose={() => setTeamsModalOpen(false)}
        onRefresh={loadData}
      />
      <TaskQuickEditModal
        open={!!quickEditTask}
        task={quickEditTask}
        onClose={() => setQuickEditTask(null)}
        onSaved={(updatedTask) => setTasks(prev => prev.map(t => t.id === updatedTask.id ? { ...t, ...updatedTask } : t))}
        onDelete={handleDeleteTask}
      />
      <TaskFormModal
        open={newTaskOpen}
        onClose={() => { setNewTaskOpen(false); setNewTaskDate(null); setNewTaskTemplate(null); }}
        onSaved={() => { setNewTaskOpen(false); setNewTaskDate(null); setNewTaskTemplate(null); loadData(); }}
        initialDate={newTaskDate}
        task={newTaskTemplate}
        workOrders={workOrders}
      />
      <CellTaskPickerModal
        open={!!cellPicker}
        onClose={() => setCellPicker(null)}
        entity={cellPicker?.entity}
        viewBy={viewBy}
        dateStr={cellPicker?.dateStr}
        queuedTasks={queuedTasks}
        onAssignTask={handleCellAssignTask}
        onCreateNew={handleCellCreateNew}
      />



      {/* Daily View */}
      {mode === "day" && (
        <DailyView
          currentDay={currentDay}
          teams={teams}
          projects={projects}
          tasks={filteredTasks}
          employees={employees}
          timeEntries={timeEntries}
          onTasksRefresh={loadData}
          onTaskUpdate={(taskId, updates) => setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...updates } : t))}
          viewBy={viewBy}
          setViewBy={setViewBy}
          sortedRows={rows}
          onLeaveIds={onLeaveIds}
        />
      )}

      {/* Weekly Grid */}
      {mode === "week" && <div className="flex-1 overflow-auto">
        {/* Sticky day header row */}
        <div className="flex sticky top-0 z-20 bg-card border-b border-border shadow-sm">
          <div className="w-40 shrink-0 border-r border-border px-3 py-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {viewBy === "employee" ? "Employee" : viewBy === "team" ? "Team" : "Project"}
            </p>
          </div>
          <div className="flex flex-1">
            {days.map((day) => {
              const isCurrentDay = isSameDay(day, new Date());
              const dateStr = format(day, "yyyy-MM-dd");
              return (
                <div
                  key={dateStr}
                  className={`flex-1 min-w-[140px] border-r border-border last:border-r-0 px-2 py-2 ${
                    isCurrentDay ? "bg-primary/10" : ""
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <p className={`text-xs font-bold ${isCurrentDay ? "text-primary" : "text-foreground"}`}>
                        {format(day, "EEE d/M")}
                        {isCurrentDay && <span className="ml-1 text-primary text-[10px]">●</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 ml-auto">
                      <button
                        type="button"
                        onClick={() => { setNewTaskDate(dateStr); setNewTaskOpen(true); }}
                        className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title={`Add task on ${format(day, "MMM d")}`}
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      <DayMenu dateStr={dateStr} onUpdateDayWorkers={openDayWorkersConfirm} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No {viewBy}s found.
          </div>
        ) : (
          <>
            {rows.map((entity, rowIndex) => (
              <PlannerRow
                key={entity.id}
                entity={entity}
                tasks={getTasksForEntity(entity)}
                weekStart={weekStart}
                viewBy={viewBy}
                employees={employees}
                timeEntries={timeEntries}
                onTaskClick={setQuickEditTask}
                onTaskDelete={handleDeleteTask}
                onTaskDragStart={handleTaskDragStart}
                onTaskDrop={handleTaskDrop}
                onAddTask={(entity, dateStr) => setCellPicker({ entity, dateStr })}
                onUpdateWorkers={handleUpdateWorkers}
                subtasksMap={subtasksMap}
                isRowDragging={draggingRowId === entity.id}
                isRowDragOver={rowDragOverId === entity.id}
                onRowDragStart={() => handleRowDragStart(entity.id)}
                onRowDragEnd={handleRowDragEnd}
                onRowDragOver={(e) => handleRowDragOver(e, entity.id)}
                onRowDrop={() => handleRowDrop(entity.id)}
                draggingEmployeeId={draggingEmployeeId}
                onAvatarDragStart={handleAvatarDragStart}
                onAvatarDropOnTeam={() => handleAvatarDropOnTeam(entity.id)}
                canMoveUp={rowIndex > 0}
                canMoveDown={rowIndex < rows.length - 1}
                onMoveUp={() => moveRow(entity.id, "up")}
                onMoveDown={() => moveRow(entity.id, "down")}
                onLeaveIds={onLeaveIds}
                collapseCompleted={collapseCompleted}
              />
            ))}
            {unassignedRow && (
              <PlannerRow
                key="__unassigned__"
                entity={unassignedRow}
                tasks={getTasksForEntity(unassignedRow)}
                weekStart={weekStart}
                viewBy={viewBy}
                employees={employees}
                timeEntries={timeEntries}
                onTaskClick={setQuickEditTask}
                onTaskDelete={handleDeleteTask}
                onTaskDragStart={handleTaskDragStart}
                onTaskDrop={handleTaskDrop}
                onUpdateWorkers={handleUpdateWorkers}
                subtasksMap={subtasksMap}
                collapseCompleted={collapseCompleted}
              />
            )}
          </>
        )}
      </div>}

      {/* Day-level Update Workers confirmation */}
      <AlertDialog open={!!dayWorkersConfirm} onOpenChange={(open) => { if (!open && !updatingDayWorkers) setDayWorkersConfirm(null); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600">
                <RefreshCw className="w-4 h-4" />
              </span>
              Update workers for the day
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-sm text-muted-foreground space-y-3">
                <p>
                  This will sync the assigned workers on{" "}
                  <span className="font-semibold text-foreground">
                    {dayWorkersConfirm ? format(new Date(dayWorkersConfirm.dateStr), "EEEE, MMM d") : ""}
                  </span>{" "}
                  to match the current members of their teams —{" "}
                  <span className="font-semibold text-foreground">
                    {dayWorkersConfirm?.tasks.length || 0} task{(dayWorkersConfirm?.tasks.length || 0) !== 1 ? "s" : ""}
                  </span>{" "}
                  will be updated.
                </p>
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-1">
                    <p className="font-semibold">Please be aware</p>
                    <p>
                      Tasks assigned to multiple teams at once, or with loose employees spread across
                      different teams, may lose some assignments because each task keeps only the
                      workers that still belong to its assigned team(s).
                    </p>
                    {dayWorkersConfirm?.flaggedCount > 0 && (
                      <p className="font-semibold">
                        {dayWorkersConfirm.flaggedCount} task{dayWorkersConfirm.flaggedCount !== 1 ? "s" : ""} flagged as potentially affected.
                      </p>
                    )}
                  </div>
                </div>
                <p>Are you sure you want to continue?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingDayWorkers}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={updatingDayWorkers}
              onClick={(e) => { e.preventDefault(); confirmDayWorkersUpdate(); }}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {updatingDayWorkers ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" /> Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" /> Update workers
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}