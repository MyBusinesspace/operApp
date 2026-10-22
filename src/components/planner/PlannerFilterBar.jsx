import React, { useState } from "react";
import { Search, SlidersHorizontal, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function PlannerFilterBar({
  search, setSearch,
  filterEmployee, setFilterEmployee,
  filterWorkOrder, setFilterWorkOrder,
  filterProject, setFilterProject,
  availEmployees, availWorkOrders, availProjects,
  searchResultsCount = 0, searchResultIndex = 0, onPrevResult, onNextResult,
}) {
  const [expanded, setExpanded] = useState(false);

  const activeCount =
    (filterEmployee && filterEmployee !== "all" ? 1 : 0) +
    (filterWorkOrder && filterWorkOrder !== "all" ? 1 : 0) +
    (filterProject && filterProject !== "all" ? 1 : 0) +
    (search ? 1 : 0);

  return (
    <div className="border-b border-border bg-card">
      {/* Toggle row — always visible */}
      <div className="flex items-center justify-between px-4 py-1.5">
        <button
          onClick={() => setExpanded(e => !e)}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
              {activeCount}
            </span>
          )}
          {expanded
            ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" />
            : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
        </button>
        {!expanded && activeCount > 0 && (
          <span className="text-xs text-muted-foreground truncate max-w-[60%]">
            {[
              search && `"${search}"`,
              filterEmployee !== "all" && filterEmployee,
              filterWorkOrder !== "all" && filterWorkOrder,
              filterProject !== "all" && filterProject,
            ].filter(Boolean).join(" · ")}
          </span>
        )}
      </div>

      {/* Expandable search + filters */}
      {expanded && (
        <div className="flex flex-wrap items-center gap-2 px-4 pb-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search tasks, contacts, projects..." className="pl-9 pr-20 h-9" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5 rounded-md bg-muted/70 border border-border px-0.5 py-0.5">
                <button
                  type="button"
                  onClick={onPrevResult}
                  disabled={searchResultsCount <= 1}
                  className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Previous match"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="text-[11px] tabular-nums text-muted-foreground px-0.5 min-w-[28px] text-center">
                  {searchResultsCount > 0 ? `${searchResultIndex + 1}/${searchResultsCount}` : "0"}
                </span>
                <button
                  type="button"
                  onClick={onNextResult}
                  disabled={searchResultsCount <= 1}
                  className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Next match"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
          {availEmployees.length > 0 && (
            <Select value={filterEmployee} onValueChange={setFilterEmployee}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Employees" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {availEmployees.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {availWorkOrders.length > 0 && (
            <Select value={filterWorkOrder} onValueChange={setFilterWorkOrder}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Work Orders" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Work Orders</SelectItem>
                {availWorkOrders.map(w => <SelectItem key={w} value={w}>{w}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {availProjects.length > 0 && (
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="All Projects" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {availProjects.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}