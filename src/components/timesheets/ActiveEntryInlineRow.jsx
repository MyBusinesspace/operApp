import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { ArrowRightLeft, LogOut, Loader2, Timer } from "lucide-react";

function useLiveSeconds(startTime) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startTime) return;
    const calc = () => setElapsed(Math.floor((Date.now() - new Date(startTime)) / 1000));
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [startTime]);
  return elapsed;
}

function fmtHMS(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// onShowReport(entry, afterCallback) — called to open the modal at page level
export default function ActiveEntryInlineRow({ entry, dayAccumulatedMinutes = 0, onClockOut, onSwitchTask, onShowReport }) {
  const liveSeconds = useLiveSeconds(entry.clock_in_time);
  const [clockingOut, setClockingOut] = useState(false);

  // Accumulated = completed entries today (minutes) + current live task (seconds)
  const totalSeconds = dayAccumulatedMinutes * 60 + liveSeconds;

  const handleClockOut = async (e) => {
    e.stopPropagation();
    setClockingOut(true);

    // Open the report modal immediately with the current entry data
    // while the clockOut API runs in the background
    let resolveAfter;
    const afterPromise = new Promise(res => { resolveAfter = res; });

    onShowReport({ ...entry }, async () => {
      // This callback runs when the modal closes — wait for the API to finish first
      await afterPromise;
    });

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
      resolveAfter(result.data);
      onClockOut(result.data);

      // Sync WorkingReport(s) with the real clock-out time and duration from the backend
      const realEntry = result.data?.entry;
      if (realEntry?.clock_out_time) {
        try {
          const reports = await base44.entities.WorkingReport.filter({ time_entry_id: entry.id });
          if (reports.length > 0) {
            await base44.entities.WorkingReport.bulkUpdate(
              reports.map(r => ({
                id: r.id,
                clock_out_time: realEntry.clock_out_time,
                duration_minutes: realEntry.duration_minutes ?? r.duration_minutes,
              }))
            );
          }
        } catch {}
      }
    } catch (err) {
      console.error(err);
      resolveAfter(null);
    }
    setClockingOut(false);
  };

  const handleSwitch = (e) => {
    e.stopPropagation();
    onShowReport({ ...entry }, () => onSwitchTask(entry));
  };

  return (
    <span className="inline-flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
      {/* Current task live timer */}
      <span className="font-mono text-xs font-bold text-green-700" title="Current task">{fmtHMS(liveSeconds)}</span>
      {/* Accumulative total working time today */}
      {dayAccumulatedMinutes > 0 && (
        <span className="inline-flex items-center gap-0.5 font-mono text-xs font-bold text-primary" title="Total working time today (all tasks)">
          <Timer className="w-3 h-3" />
          {fmtHMS(totalSeconds)}
        </span>
      )}
      <Button size="sm" variant="outline" className="h-6 px-2 text-xs border-green-300 text-green-700 hover:bg-green-50"
        onClick={handleSwitch}>
        <ArrowRightLeft className="w-3 h-3 mr-1" /> Switch
      </Button>
      <Button size="sm" variant="destructive" className="h-6 px-2 text-xs"
        onClick={handleClockOut} disabled={clockingOut}>
        {clockingOut ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3 mr-1" />}
        {!clockingOut && "Out"}
      </Button>
    </span>
  );
}