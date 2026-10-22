import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { addDays, format, isSameDay, startOfWeek, subDays } from "date-fns";
import { Inbox, Plus, Search } from "lucide-react";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import PlannerHeader from "@/components/planner/PlannerHeader";
import PlannerFilterBar from "@/components/planner/PlannerFilterBar";
import PlannerRow from "@/components/planner/PlannerRow";
import DailyView from "@/components/planner/DailyView";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import DemoTaskDialog from "../components/DemoTaskDialog.jsx";
import "../demo.css";

function DemoCellTaskPicker({
  open,
  onClose,
  cellPicker,
  viewBy,
  queuedTasks,
  onCreateNew,
  onPickQueued,
}) {
  const [search, setSearch] = useState("");

  if (!cellPicker?.entity || !cellPicker?.dateStr) return null;

  const entity = cellPicker.entity;
  const dateStr = cellPicker.dateStr;
  const entityName = entity.full_name || entity.name || "—";
  const viewLabel =
    viewBy === "employee" ? "Employee" : viewBy === "team" ? "Team" : "Project";

  const filtered = queuedTasks.filter((t) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      t.title?.toLowerCase().includes(q) ||
      t.reference?.toLowerCase().includes(q) ||
      t.category?.toLowerCase().includes(q) ||
      t.work_order_name?.toLowerCase().includes(q) ||
      t.project_name?.toLowerCase().includes(q) ||
      t.contact_name?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col overflow-hidden gap-0 p-0 sm:rounded-lg">
        <DialogHeader className="px-6 pt-6 pb-3 space-y-1">
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Demo view only
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            {viewLabel}:{" "}
            <span className="font-medium text-foreground">{entityName}</span> ·
            Date:{" "}
            <span className="font-medium text-foreground">{dateStr}</span>
          </p>
        </DialogHeader>

        <div className="px-6 pb-3">
          <Button type="button" onClick={onCreateNew} className="w-full">
            <Plus className="w-4 h-4" />
            Create New Task
          </Button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col border-t border-border px-6 pt-3 pb-6">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <Inbox className="w-3.5 h-3.5" />
            Or pick from queue ({queuedTasks.length})
          </p>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Search queued tasks..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1">
            {filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                No queued tasks available.
              </p>
            ) : (
              filtered.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onPickQueued(task)}
                  className="w-full text-left p-2 rounded-md border border-border hover:border-primary hover:bg-primary/5 transition-colors"
                >
                  <p className="text-sm font-medium text-foreground truncate">
                    {task.title}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {task.reference}
                    {task.project_name ? ` · ${task.project_name}` : ""}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function DemoTeamsDialog({ open, onClose, teams, employees }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Teams</DialogTitle>
          <p className="text-xs text-muted-foreground">
            View-only — team membership from demo data.
          </p>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">No teams defined.</p>
          ) : (
            teams.map((team) => {
              const members = employees.filter(
                (e) => e.team_id === team.id && e.status === "Active"
              );
              return (
                <div
                  key={team.id}
                  className="rounded-lg border border-border p-3 space-y-2"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: team.color || "#6366f1" }}
                    />
                    <p className="text-sm font-semibold text-foreground">
                      {team.name}
                    </p>
                    {team.leader_name && (
                      <span className="text-[11px] text-muted-foreground">
                        · Lead: {team.leader_name}
                      </span>
                    )}
                  </div>
                  {members.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No active members
                    </p>
                  ) : (
                    <ul className="text-xs text-foreground space-y-0.5 pl-1">
                      {members.map((m) => (
                        <li key={m.id}>{m.full_name}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DemoPlanner() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );
  const { toast } = useToast();

  const tasks = data?.tasks || [];
  const allEmployees = data?.employees || [];
  const teams = data?.teams || [];
  const projects = data?.projects || [];
  const workOrders = data?.workOrders || [];
  const contacts = data?.contacts || [];
  const assets = data?.assets || [];
  const timeEntries = data?.timeEntries || [];

  const employees = useMemo(
    () => allEmployees.filter((e) => e.status === "Active"),
    [allEmployees]
  );

  const [currentWeek, setCurrentWeek] = useState(() => subDays(new Date(), 3));
  const [viewBy, setViewBy] = useState("team");
  const [mode, setMode] = useState("week");
  const [currentDay, setCurrentDay] = useState(() => new Date());
  const [search, setSearch] = useState("");
  const [filterEmployee, setFilterEmployee] = useState("all");
  const [filterWorkOrder, setFilterWorkOrder] = useState("all");
  const [filterProject, setFilterProject] = useState("all");
  const [collapseCompleted, setCollapseCompleted] = useState(true);
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [teamsModalOpen, setTeamsModalOpen] = useState(false);
  const [cellPicker, setCellPicker] = useState(null);
  const [searchIndex, setSearchIndex] = useState(0);

  const weekStart = currentWeek;
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const plannerTasks = useMemo(
    () => tasks.filter((t) => t.planning_date),
    [tasks]
  );

  const searchFiltered = useMemo(() => {
    const s = search.toLowerCase();
    if (!s) return plannerTasks;
    return plannerTasks.filter(
      (t) =>
        t.title?.toLowerCase().includes(s) ||
        t.description?.toLowerCase().includes(s) ||
        t.reference?.toLowerCase().includes(s) ||
        t.work_order_name?.toLowerCase().includes(s) ||
        t.project_name?.toLowerCase().includes(s) ||
        t.contact_name?.toLowerCase().includes(s) ||
        (t.assigned_employee_names || []).some((n) =>
          n.toLowerCase().includes(s)
        ) ||
        (t.assigned_team_names || []).some((n) => n.toLowerCase().includes(s))
    );
  }, [plannerTasks, search]);

  const empNameById = (id) => employees.find((e) => e.id === id)?.full_name;
  const woNameById = (id) => workOrders.find((w) => w.id === id)?.title;
  const projNameById = (id) => projects.find((p) => p.id === id)?.name;
  const taskEmpNames = (t) =>
    (t.assigned_employees || []).map(
      (id, i) => empNameById(id) || t.assigned_employee_names?.[i] || "?"
    );
  const taskWOName = (t) =>
    t.work_order_id
      ? woNameById(t.work_order_id) || t.work_order_name
      : t.work_order_name;
  const taskProjName = (t) =>
    t.project_id
      ? projNameById(t.project_id) || t.project_name
      : t.project_name;

  const availEmployees = useMemo(() => {
    const excluding = searchFiltered.filter((t) => {
      if (
        !(filterWorkOrder === "all" || taskWOName(t) === filterWorkOrder)
      )
        return false;
      if (!(filterProject === "all" || taskProjName(t) === filterProject))
        return false;
      return true;
    });
    return [
      ...new Map(
        excluding.flatMap((t) =>
          (t.assigned_employees || []).map((id) => [
            id,
            empNameById(id) ||
              t.assigned_employee_names?.[
                (t.assigned_employees || []).indexOf(id)
              ] ||
              "?",
          ])
        )
      ).values(),
    ].sort((a, b) => a.localeCompare(b));
  }, [
    searchFiltered,
    filterWorkOrder,
    filterProject,
    employees,
    workOrders,
    projects,
  ]);

  const availWorkOrders = useMemo(() => {
    const excluding = searchFiltered.filter((t) => {
      if (
        !(filterEmployee === "all" || taskEmpNames(t).includes(filterEmployee))
      )
        return false;
      if (!(filterProject === "all" || taskProjName(t) === filterProject))
        return false;
      return true;
    });
    return [
      ...new Map(
        excluding
          .filter((t) => t.work_order_id)
          .map((t) => [t.work_order_id, taskWOName(t)])
      ).values(),
    ].sort((a, b) => a.localeCompare(b));
  }, [
    searchFiltered,
    filterEmployee,
    filterProject,
    employees,
    workOrders,
    projects,
  ]);

  const availProjects = useMemo(() => {
    const excluding = searchFiltered.filter((t) => {
      if (
        !(filterEmployee === "all" || taskEmpNames(t).includes(filterEmployee))
      )
        return false;
      if (!(filterWorkOrder === "all" || taskWOName(t) === filterWorkOrder))
        return false;
      return true;
    });
    return [
      ...new Map(
        excluding
          .filter((t) => t.project_id)
          .map((t) => [t.project_id, taskProjName(t)])
      ).values(),
    ].sort((a, b) => a.localeCompare(b));
  }, [
    searchFiltered,
    filterEmployee,
    filterWorkOrder,
    employees,
    workOrders,
    projects,
  ]);

  const filteredTasks = useMemo(
    () =>
      searchFiltered.filter((t) => {
        const matchEmp =
          filterEmployee === "all" || taskEmpNames(t).includes(filterEmployee);
        const matchWO =
          filterWorkOrder === "all" || taskWOName(t) === filterWorkOrder;
        const matchProject =
          filterProject === "all" || taskProjName(t) === filterProject;
        return matchEmp && matchWO && matchProject;
      }),
    [
      searchFiltered,
      filterEmployee,
      filterWorkOrder,
      filterProject,
      employees,
      workOrders,
      projects,
    ]
  );

  const searchMatches = useMemo(() => {
    const term = (search || "").trim().toLowerCase();
    if (!term) return [];
    return plannerTasks
      .filter((t) => {
        return (
          t.title?.toLowerCase().includes(term) ||
          t.description?.toLowerCase().includes(term) ||
          t.reference?.toLowerCase().includes(term) ||
          t.work_order_name?.toLowerCase().includes(term) ||
          t.project_name?.toLowerCase().includes(term) ||
          t.contact_name?.toLowerCase().includes(term) ||
          (t.assigned_employee_names || []).some((n) =>
            n.toLowerCase().includes(term)
          ) ||
          (t.assigned_team_names || []).some((n) =>
            n.toLowerCase().includes(term)
          )
        );
      })
      .sort(
        (a, b) => new Date(a.planning_date) - new Date(b.planning_date)
      );
  }, [search, plannerTasks]);

  useEffect(() => {
    setSearchIndex(0);
  }, [search]);

  useEffect(() => {
    if (searchMatches.length === 0) return;
    const match =
      searchMatches[Math.min(searchIndex, searchMatches.length - 1)];
    const date = new Date(match.planning_date + "T00:00:00");
    if (Number.isNaN(date.getTime())) return;
    setCurrentDay(date);
    setCurrentWeek(startOfWeek(date, { weekStartsOn: 1 }));
  }, [searchMatches, searchIndex]);

  const goPrevMatch = () =>
    searchMatches.length > 0 &&
    setSearchIndex((i) => (i - 1 + searchMatches.length) % searchMatches.length);
  const goNextMatch = () =>
    searchMatches.length > 0 &&
    setSearchIndex((i) => (i + 1) % searchMatches.length);

  const getTasksForEntity = (entity) => {
    if (entity._unassigned) {
      return filteredTasks.filter((task) => {
        if (!task.planning_date) return false;
        const hasTeam = (task.assigned_team_ids?.length ?? 0) > 0;
        const hasEmp = (task.assigned_employees?.length ?? 0) > 0;
        return !hasTeam && !hasEmp;
      });
    }
    return filteredTasks.filter((task) => {
      if (!task.planning_date) return false;
      if (viewBy === "employee") {
        return (
          task.assigned_employees?.includes(entity.id) ||
          task.assigned_employee_names?.includes(entity.full_name)
        );
      }
      if (viewBy === "team") {
        if (task.assigned_team_ids?.includes(entity.id)) return true;
        const teamEmployeeIds = employees
          .filter((e) => e.team_id === entity.id)
          .map((e) => e.id);
        return (
          teamEmployeeIds.length > 0 &&
          task.assigned_employees?.some((eid) =>
            teamEmployeeIds.includes(eid)
          )
        );
      }
      if (viewBy === "project") {
        if (task.project_id === entity.id) return true;
        if (
          !task.project_id &&
          task.project_name &&
          task.project_name === entity.name
        )
          return true;
        if (task.work_order_id) {
          const wo = workOrders.find((w) => w.id === task.work_order_id);
          if (wo && wo.project_id === entity.id) return true;
        }
        return false;
      }
      return false;
    });
  };

  const unassignedTasks = useMemo(
    () =>
      filteredTasks.filter((task) => {
        if (!task.planning_date) return false;
        const hasTeam = (task.assigned_team_ids?.length ?? 0) > 0;
        const hasEmp = (task.assigned_employees?.length ?? 0) > 0;
        return !hasTeam && !hasEmp;
      }),
    [filteredTasks]
  );

  const unassignedRow =
    unassignedTasks.length > 0
      ? {
          id: "__unassigned__",
          name: "Unassigned",
          _unassigned: true,
          color: "#94a3b8",
        }
      : null;

  const rows =
    viewBy === "employee"
      ? employees
      : viewBy === "team"
        ? teams
        : projects;

  const queuedTasks = useMemo(
    () => tasks.filter((t) => t.status === "Queued" && !t.planning_date),
    [tasks]
  );

  const openTaskDialog = (task) => {
    setEditingTask(task ?? null);
    setTaskDialogOpen(true);
  };

  const buildCellTemplate = () => {
    if (!cellPicker) return {};
    const { entity, dateStr } = cellPicker;
    const template = { planning_date: dateStr };
    if (viewBy === "team" && !entity._unassigned) {
      template.assigned_team_ids = [entity.id];
      template.assigned_team_names = [entity.name];
      const teamEmps = employees.filter((e) => e.team_id === entity.id);
      if (teamEmps.length > 0) {
        template.assigned_employees = teamEmps.map((e) => e.id);
        template.assigned_employee_names = teamEmps.map((e) => e.full_name);
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
    return template;
  };

  const handleCellCreateNew = () => {
    const template = buildCellTemplate();
    setCellPicker(null);
    openTaskDialog(template);
  };

  const handlePickQueued = (task) => {
    setCellPicker(null);
    toast({
      title: "Demo view only",
      description: `"${task.title}" would be assigned in the live app.`,
    });
  };

  const openNewTaskForDay = (dateStr) => {
    openTaskDialog({ planning_date: dateStr });
  };

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DemoTopNavBar companyName={data.companyName} />
      <main className="pt-[var(--nav-height)] flex flex-col flex-1 min-h-0">
        <div className="px-4 py-2 border-b border-border bg-card flex items-center gap-3 shrink-0">
          <BackToOverviewButton to="/demo/app/operations-overview" />
          <div>
            <h1 className="text-sm font-semibold text-foreground">Planner</h1>
            <p className="text-[11px] text-muted-foreground">
              Week & day schedule — demo data, view only
            </p>
          </div>
        </div>

        <div className="flex flex-col flex-1 min-h-0 h-[calc(100vh-var(--nav-height)-3.25rem)]">
          <PlannerHeader
            currentWeek={currentWeek}
            setCurrentWeek={setCurrentWeek}
            weekStart={weekStart}
            viewBy={viewBy}
            setViewBy={setViewBy}
            onViewByChange={setViewBy}
            onNewTask={() => openTaskDialog(null)}
            canCreate
            canEdit
            onOpenTeams={() => setTeamsModalOpen(true)}
            mode={mode}
            setMode={setMode}
            currentDay={currentDay}
            setCurrentDay={setCurrentDay}
            collapseCompleted={collapseCompleted}
            onToggleCollapseCompleted={() =>
              setCollapseCompleted((v) => !v)
            }
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

          {mode === "day" && (
            <DailyView
              currentDay={currentDay}
              teams={teams}
              projects={projects}
              tasks={filteredTasks}
              employees={employees}
              timeEntries={timeEntries}
              viewBy={viewBy}
              setViewBy={setViewBy}
              sortedRows={rows}
              onLeaveIds={new Set()}
              subtasksMap={{}}
              onTaskClick={(task) => openTaskDialog(task)}
              readOnly
            />
          )}

          {mode === "week" && (
            <div className="flex-1 overflow-auto min-h-0">
              <div className="flex sticky top-0 z-20 bg-card border-b border-border shadow-sm">
                <div className="w-40 shrink-0 border-r border-border px-3 py-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {viewBy === "employee"
                      ? "Employee"
                      : viewBy === "team"
                        ? "Team"
                        : "Project"}
                  </p>
                </div>
                <div className="flex flex-1">
                  {days.map((day) => {
                    const isToday = isSameDay(day, new Date());
                    const dateStr = format(day, "yyyy-MM-dd");
                    return (
                      <div
                        key={dateStr}
                        className={`flex-1 min-w-[140px] border-r border-border last:border-r-0 px-2 py-2 ${
                          isToday ? "bg-primary/10" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p
                            className={`text-xs font-bold ${
                              isToday ? "text-primary" : "text-foreground"
                            }`}
                          >
                            {format(day, "EEE d/M")}
                            {isToday && (
                              <span className="ml-1 text-primary text-[10px]">
                                ●
                              </span>
                            )}
                          </p>
                          <button
                            type="button"
                            onClick={() => openNewTaskForDay(dateStr)}
                            className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title={`Add task on ${format(day, "MMM d")}`}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                  No {viewBy}s found.
                </div>
              ) : (
                <>
                  {rows.map((entity) => (
                    <PlannerRow
                      key={entity.id}
                      entity={entity}
                      tasks={getTasksForEntity(entity)}
                      weekStart={weekStart}
                      viewBy={viewBy}
                      employees={employees}
                      timeEntries={timeEntries}
                      onTaskClick={(task) => openTaskDialog(task)}
                      onAddTask={(entity, dateStr) =>
                        setCellPicker({ entity, dateStr })
                      }
                      canCreate
                      readOnly
                      subtasksMap={{}}
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
                      onTaskClick={(task) => openTaskDialog(task)}
                      onAddTask={(entity, dateStr) =>
                        setCellPicker({ entity, dateStr })
                      }
                      canCreate
                      readOnly
                      collapseCompleted={collapseCompleted}
                    />
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-6 shrink-0">
          <DemoGuideCard pageId="planner" />
        </div>
      </main>

      <DemoTaskDialog
        open={taskDialogOpen}
        onClose={() => {
          setTaskDialogOpen(false);
          setEditingTask(null);
        }}
        task={editingTask}
        contacts={contacts}
        projects={projects}
        assets={assets}
        workOrders={workOrders}
        employees={allEmployees}
        teams={teams}
        allTasks={tasks}
      />

      <DemoCellTaskPicker
        open={!!cellPicker}
        onClose={() => setCellPicker(null)}
        cellPicker={cellPicker}
        viewBy={viewBy}
        queuedTasks={queuedTasks}
        onCreateNew={handleCellCreateNew}
        onPickQueued={handlePickQueued}
      />

      <DemoTeamsDialog
        open={teamsModalOpen}
        onClose={() => setTeamsModalOpen(false)}
        teams={teams}
        employees={allEmployees}
      />
    </div>
  );
}
