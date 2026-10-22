import React, { useState, useEffect, useCallback, useRef } from "react";
import { base44 } from "@/api/base44Client";
import {
  Wrench, ClipboardList, Clock, LayoutGrid, Loader2
} from "lucide-react";
import OperationsWorkerMap from "@/components/operations/OperationsWorkerMap";
import OperationsReportsCard from "@/components/operations/OperationsReportsCard";
import OperationsTrendChart from "@/components/operations/OperationsTrendChart";
import OperationsPeriodFilter from "@/components/operations/OperationsPeriodFilter";
import {
  DarkHeader, DarkQuickLink, DarkLoading
} from "@/components/shared/DarkOverview";

const EMPTY = {
  customer: { total: 0, breakdown: [] },
  providers: { total: 0, breakdown: [] },
  project: { total: 0, breakdown: [] },
  asset: { total: 0, breakdown: [] },
  wo: { total: 0, breakdown: [] },
  tasks: { total: 0, breakdown: [] },
  timesheets: { total: 0, breakdown: [], live: [] },
  reports: {
    timeCost: { hours: 0, entries: 0 },
    validation: { runs: 0, violations: 0, quarantined: 0 },
    workingReports: { count: 0 },
  },
  trend: [],
};

export default function OperationsOverview() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);
  const [periodMode, setPeriodMode] = useState("month");
  const [periodYear, setPeriodYear] = useState(new Date().getFullYear());
  const [periodMonth, setPeriodMonth] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`);
  const [periodDay, setPeriodDay] = useState(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`);

  const years = useCallback(() => {
    const now = new Date().getFullYear();
    const list = [];
    for (let y = now; y >= 2020; y--) list.push(y);
    return list;
  }, []);

  const load = useCallback(async () => {
    if (hasLoadedRef.current) setRefreshing(true); else setLoading(true);
    try {
      const res = await base44.functions.invoke("apiOperationsOverview", {
        period: { mode: periodMode, year: periodYear, month: periodMonth, day: periodDay },
      });
      setData(res.data || EMPTY);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [periodMode, periodYear, periodMonth, periodDay]);

  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { load(); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [load]);

  const trendTitle = periodMode === "year"
    ? `Tasks & Working Reports — ${periodYear}`
    : periodMode === "month"
      ? `Tasks & Working Reports — ${new Date(periodMonth + "-01").toLocaleString("en", { month: "long", year: "numeric" })}`
      : periodMode === "day"
        ? `Tasks & Working Reports — ${new Date(periodDay + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}`
        : "Tasks & Working Reports — last 12 months";

  if (loading) return <DarkLoading />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DarkHeader sectionLabel="Operations" createTo="/work-orders" />

      <div className="max-w-4xl mx-auto px-6 py-10 space-y-10">
        {refreshing && (
          <div className="fixed top-20 right-6 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-sm text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…
          </div>
        )}

        {/* Worker map — today's working vs called (not clocked in) */}
        <OperationsWorkerMap
          officeWorkingIds={data.office_working_employee_ids || []}
          headerExtra={
            <OperationsPeriodFilter
              mode={periodMode}
              year={periodYear}
              month={periodMonth}
              day={periodDay}
              onMode={setPeriodMode}
              onYear={setPeriodYear}
              onMonth={setPeriodMonth}
              onDay={setPeriodDay}
              years={years()}
            />
          }
        />

        {/* Operations reports summary */}
        <OperationsReportsCard stats={data.reports} />

        {/* Tasks & Working Reports trend */}
        <OperationsTrendChart key={`${periodMode}-${periodYear}-${periodMonth}-${periodDay}`} data={data.trend} title={trendTitle} mode={periodMode} />

        {/* Quick Links */}
        <div>
          <h3 className="text-sm font-semibold text-foreground tracking-tight mb-4">Quick access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DarkQuickLink to="/work-orders" icon={Wrench} iconColor="text-indigo-400" label="Work Orders" subtitle={`${data.wo.total} total`} />
            <DarkQuickLink to="/tasks" icon={ClipboardList} iconColor="text-emerald-400" label="Tasks" subtitle={`${data.tasks.total} total`} />
            <DarkQuickLink to="/timesheets" icon={Clock} iconColor="text-amber-400" label="Timesheets" subtitle={`${data.timesheets.total} entries`} />
            <DarkQuickLink to="/planner" icon={LayoutGrid} iconColor="text-rose-400" label="Planner" subtitle="Schedule tasks" />
          </div>
        </div>
      </div>
    </div>
  );
}