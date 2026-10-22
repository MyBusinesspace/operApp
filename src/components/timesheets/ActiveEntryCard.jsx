import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, ArrowRightLeft, LogOut, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import ClockOutReportModal from "./ClockOutReportModal";

function useLiveTimer(startTime) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const calc = () => setElapsed(Math.floor((Date.now() - new Date(startTime)) / 1000));
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function checkIsLeader(employeeId) {
  if (!employeeId) return false;
  const teams = await base44.entities.Team.filter({ leader_id: employeeId }).catch(() => []);
  return teams.length > 0;
}

export default function ActiveEntryCard({ entry, onClockOut, onSwitchTask }) {
  const timer = useLiveTimer(entry.clock_in_time);
  const [clockingOut, setClockingOut] = useState(false);
  const [switching, setSwitching] = useState(false);
  // completedEntry = the closed entry to show in the report modal
  // afterReportCallback = what to call after the report is closed
  const [completedEntry, setCompletedEntry] = useState(null);
  const afterReportRef = React.useRef(null);

  const handleClockOut = async () => {
    setClockingOut(true);
    try {
      let lat = null, lng = null;
      try {
        const pos = await new Promise((res, rej) =>
          navigator.geolocation.getCurrentPosition(res, rej, { timeout: 6000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {}

      const result = await base44.functions.invoke("clockOut", { entry_id: entry.id, lat, lng });
      afterReportRef.current = () => onClockOut(result.data);
      setCompletedEntry(result.data?.entry || { ...entry });
    } catch (e) { console.error(e); }
    setClockingOut(false);
  };

  const handleSwitchTask = async (entryToSwitch) => {
    setSwitching(true);
    try {
      // Always show report before switching
      afterReportRef.current = () => onSwitchTask(entryToSwitch);
      setCompletedEntry({ ...entry });
    } catch (e) { console.error(e); }
    setSwitching(false);
  };

  const handleReportClose = () => {
    const cb = afterReportRef.current;
    afterReportRef.current = null;
    setCompletedEntry(null);
    if (cb) cb();
  };

  return (
    <>
      <div className="relative border border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800 rounded-xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
              <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wide">Active</span>
            </div>
            <p className="font-semibold text-foreground truncate">{entry.employee_name}</p>
            <p className="text-sm text-muted-foreground truncate">{entry.task_title}</p>
            {entry.work_order_name && <p className="text-xs text-muted-foreground truncate">{entry.work_order_name}</p>}
            {entry.asset_name && <p className="text-xs text-muted-foreground truncate">Asset: {entry.asset_name}</p>}
          </div>
          <div className="text-right shrink-0">
            <p className="font-mono text-xl font-bold text-green-700 dark:text-green-400">{timer}</p>
            {entry.on_site != null && (
              <Badge className={`text-xs mt-1 ${entry.on_site ? "bg-green-100 text-green-700 border-green-300" : "bg-orange-100 text-orange-700 border-orange-300"}`}>
                {entry.on_site ? <><CheckCircle className="w-3 h-3 mr-1" />On Site</> : <><AlertCircle className="w-3 h-3 mr-1" />Off Site</>}
              </Badge>
            )}
          </div>
        </div>

        {entry.clock_in_address && (
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="line-clamp-1">{entry.clock_in_address}</span>
          </div>
        )}
        {entry.distance_from_task_m != null && (
          <p className="text-xs text-muted-foreground">Distance from task site: <strong>{entry.distance_from_task_m}m</strong></p>
        )}

        <div className="flex gap-2 pt-1">
          <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => handleSwitchTask(entry)} disabled={switching}>
            {switching ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />}
            Switch Task
          </Button>
          <Button size="sm" variant="destructive" className="flex-1 text-xs" onClick={handleClockOut} disabled={clockingOut}>
            {clockingOut ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : <LogOut className="w-3.5 h-3.5 mr-1.5" />}
            Clock Out
          </Button>
        </div>
      </div>

      <ClockOutReportModal
        open={!!completedEntry}
        entry={completedEntry}
        onClose={handleReportClose}
      />
    </>
  );
}