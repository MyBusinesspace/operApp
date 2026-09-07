import React from "react";
import { ChevronLeft, ChevronRight, Users, Layers, FolderKanban, CalendarDays, CalendarRange, Plus, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, addDays, subDays } from "date-fns";

const VIEW_BY_OPTIONS = [
  { value: "employee", label: "Employee", icon: Users },
  { value: "team", label: "Team", icon: Layers },
  { value: "project", label: "Project", icon: FolderKanban },
];

export default function PlannerHeader({ currentWeek, setCurrentWeek, weekStart, viewBy, setViewBy, onViewByChange, onOpenTeams, onNewTask, mode, setMode, currentDay, setCurrentDay, collapseCompleted = false, onToggleCollapseCompleted }) {
  const handleViewBy = (v) => { setViewBy(v); if (onViewByChange) onViewByChange(v); };
  const weekEnd = addDays(weekStart, 6);

  const goToToday = () => {
    // Center today in the 7-day window (today = 4th column)
    setCurrentWeek(subDays(new Date(), 3));
    if (setCurrentDay) setCurrentDay(new Date());
  };
  // Big arrows (next to "Today") move by DAY; small arrows (next to the date
  // range) move by WEEK — swapped so the most-used day navigation sits beside Today.
  const goPrev = () => {
    if (mode === "day") setCurrentDay(subDays(currentDay, 1));
    else setCurrentWeek(subDays(weekStart, 1));
  };
  const goNext = () => {
    if (mode === "day") setCurrentDay(addDays(currentDay, 1));
    else setCurrentWeek(addDays(weekStart, 1));
  };
  const goPrevDay = () => setCurrentWeek(startOfWeek(subWeeks(currentWeek, 1), { weekStartsOn: 1 }));
  const goNextDay = () => setCurrentWeek(startOfWeek(addWeeks(currentWeek, 1), { weekStartsOn: 1 }));

  return (
    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card gap-2 overflow-x-auto">
      <div className="flex items-center gap-1.5 shrink-0">
        {/* View by selector */}
        <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
          {VIEW_BY_OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              onClick={() => handleViewBy(value)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${
                viewBy === value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3 h-3" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Day / Week mode toggle — Day first (most used) */}
        <div className="flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 bg-muted rounded-lg p-0.5">
            <button
              onClick={() => setMode("day")}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${mode === "day" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              title="View a single day"
            >
              <CalendarDays className="w-3 h-3" />
              <span className="hidden md:inline">Day</span>
            </button>
            <button
              onClick={() => setMode("week")}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all ${mode === "week" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              title="View a full week"
            >
              <CalendarRange className="w-3 h-3" />
              <span className="hidden md:inline">Week</span>
            </button>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-0.5">
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={goToToday}>Today</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrev}>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNext}>
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
          {mode === "week" && (
            <>
              <span className="text-muted-foreground text-xs px-0.5">|</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goPrevDay} title="Previous week">
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={goNextDay} title="Next week">
                <ChevronRight className="w-3 h-3" />
              </Button>
            </>
          )}
          <span className="text-xs font-medium text-foreground px-1 whitespace-nowrap">
            {mode === "day"
              ? format(currentDay || new Date(), "EEE, MMM d, yyyy")
              : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`
            }
          </span>
        </div>
      </div>

      {/* Right: action buttons */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className={`h-7 px-2 gap-1 text-xs ${collapseCompleted ? "border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700" : ""}`}
          onClick={onToggleCollapseCompleted}
          title={collapseCompleted ? "Completed tasks are collapsed — click to expand" : "Completed tasks are expanded — click to collapse"}
        >
          <Archive className="w-3.5 h-3.5" /> Collapse done
        </Button>
        <Button size="sm" className="h-7 px-2 gap-1 text-xs" onClick={onNewTask}>
          <Plus className="w-3.5 h-3.5" /> New Task
        </Button>
        <Button variant="outline" size="sm" className="h-7 px-2 gap-1 text-xs" onClick={onOpenTeams}>
          <Users className="w-3.5 h-3.5" /> Teams
        </Button>
      </div>
    </div>
  );
}