import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { addDaysISO, todayLocalISO } from "@/lib/dateOnly";
import { Clock, ChevronDown, ChevronRight, ShieldCheck, AlertTriangle, Trash2, Calendar, Zap, Hand, Play, Loader2 } from "lucide-react";
import BackToOverviewButton from "@/components/shared/BackToOverviewButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

const REASON_LABELS = {
  session_too_short: "Session too short (< 2 min)",
  leader_present_non_leader_signed: "Non-leader signed (leader present)",
  not_last_out: "Not last to clock out",
};

export default function ValidationHistory() {
  const { toast } = useToast();
  const backPath = new URLSearchParams(window.location.search).get("back") || "/reports";
  const backTitle = backPath === "/operations-overview" ? "Back to Operations" : "Back to Reports";
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [expandedRuns, setExpandedRuns] = useState({});

  // Manual run state
  const today = todayLocalISO();
  const yesterday = addDaysISO(today, -1);
  const [runFrom, setRunFrom] = useState(yesterday);
  const [runTo, setRunTo] = useState(yesterday);
  const [autoQuarantine, setAutoQuarantine] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState(null);

  const loadRuns = async () => {
    setLoading(true);
    try {
      const records = await base44.entities.WorkingReportValidationRun.list("-run_at", 5000);
      setRuns(records);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRuns(); }, []);

  const handleRunValidation = async () => {
    if (!runFrom || !runTo) {
      toast({ title: "Please select a date range", variant: "destructive" });
      return;
    }
    if (runTo < runFrom) {
      toast({ title: "End date must be after start date", variant: "destructive" });
      return;
    }
    setRunning(true);
    setLastResult(null);
    try {
      const res = await base44.functions.invoke("validateWorkingReports", {
        date_from: runFrom,
        date_to: runTo,
        auto_quarantine: autoQuarantine,
      });
      setLastResult(res);
      toast({
        title: "Validation complete",
        description: `${res.checked || 0} checked · ${res.violations_found || 0} violations${res.quarantined ? ` · ${res.quarantined} quarantined` : ""}`,
      });
      await loadRuns();
    } catch (e) {
      console.error(e);
      toast({ title: "Validation failed", description: e?.message || "Unexpected error", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  // Group by month
  const byMonth = {};
  for (const r of runs) {
    const month = (r.run_at || "").slice(0, 7);
    if (!byMonth[month]) byMonth[month] = [];
    byMonth[month].push(r);
  }
  const monthKeys = Object.keys(byMonth).sort().reverse();

  const monthName = (key) => {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const fmtTime = (iso) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground py-20">Loading validation history…</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <BackToOverviewButton to={backPath} title={backTitle} />
        <div>
          <h1 className="text-2xl font-bold text-foreground">Working Report Validation History</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Daily automated validation runs — reports checked, violations found and quarantined</p>
        </div>
      </div>

      {/* Manual run control */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Play className="w-4 h-4 text-primary" /> Run Validation Manually
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> From</Label>
            <Input type="date" value={runFrom} onChange={e => setRunFrom(e.target.value)} max={today} />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> To</Label>
            <Input type="date" value={runTo} onChange={e => setRunTo(e.target.value)} max={today} />
          </div>
          <div className="space-y-1.5">
            <Label>Auto-quarantine</Label>
            <label className="flex items-center gap-2 h-9 text-xs text-foreground cursor-pointer select-none">
              <Switch checked={autoQuarantine} onCheckedChange={setAutoQuarantine} className="scale-90" />
              <span className="text-xs text-muted-foreground">Delete violating reports</span>
            </label>
          </div>
          <Button onClick={handleRunValidation} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            {running ? "Running…" : "Run Now"}
          </Button>
        </div>
        {lastResult && (
          <div className="flex flex-wrap items-center gap-4 pt-3 border-t border-border text-xs">
            <span className="text-muted-foreground">Last run result:</span>
            <span className="font-medium tabular-nums">{lastResult.checked || 0} checked</span>
            <span className={`font-medium tabular-nums ${(lastResult.violations_found || 0) > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {lastResult.violations_found || 0} violations
            </span>
            {(lastResult.quarantined || 0) > 0 && (
              <span className="font-medium text-destructive tabular-nums">{lastResult.quarantined} quarantined</span>
            )}
            <span className="text-xs text-muted-foreground">({lastResult.date_from} → {lastResult.date_to})</span>
          </div>
        )}
      </div>

      {runs.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <ShieldCheck className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-xs text-muted-foreground">No validation runs yet. Run a validation manually above, or wait for the first automatic run tonight.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {monthKeys.map((mk) => {
            const monthRuns = byMonth[mk];
            const totalChecked = monthRuns.reduce((s, r) => s + (r.checked || 0), 0);
            const totalViolations = monthRuns.reduce((s, r) => s + (r.violations_found || 0), 0);
            const totalQuarantined = monthRuns.reduce((s, r) => s + (r.quarantined || 0), 0);
            const isOpen = expandedMonths[mk] !== false;

            return (
              <div key={mk} className="rounded-xl border border-border bg-card overflow-hidden">
                <button
                  onClick={() => setExpandedMonths((p) => ({ ...p, [mk]: !isOpen }))}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-sky-500/10">
                      <Calendar className="w-4 h-4 text-sky-600" />
                    </div>
                    <span className="text-base font-semibold text-foreground">{monthName(mk)}</span>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{monthRuns.length} runs</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">{totalChecked} checked</span>
                    {totalViolations > 0 ? (
                      <span className="text-amber-600 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> {totalViolations} violations
                      </span>
                    ) : (
                      <span className="text-emerald-600 font-medium flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> Clean
                      </span>
                    )}
                    {totalQuarantined > 0 && (
                      <span className="text-destructive font-medium flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" /> {totalQuarantined} deleted
                      </span>
                    )}
                    {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-border divide-y divide-border">
                    {monthRuns.map((r) => {
                      const runOpen = expandedRuns[r.id];
                      const vSum = r.violations_summary || [];

                      return (
                        <div key={r.id}>
                          <button
                            onClick={() => setExpandedRuns((p) => ({ ...p, [r.id]: !runOpen }))}
                            className="w-full flex items-center justify-between px-5 py-3 hover:bg-muted/20 transition-colors text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-medium text-foreground">{fmtTime(r.run_at)}</p>
                                <p className="text-xs text-muted-foreground">
                                  Range: {r.date_from} → {r.date_to}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${r.triggered_by === "workflow" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"} flex items-center gap-1`}>
                                {r.triggered_by === "workflow" ? <Zap className="w-3 h-3" /> : <Hand className="w-3 h-3" />}
                                {r.triggered_by}
                              </span>
                              <span className="text-xs text-muted-foreground tabular-nums">{r.checked} checked</span>
                              {r.violations_found > 0 ? (
                                <span className="text-xs text-amber-600 font-medium tabular-nums">{r.violations_found} violations</span>
                              ) : (
                                <span className="text-xs text-emerald-600 font-medium">Clean</span>
                              )}
                              {r.quarantined > 0 && <span className="text-xs text-destructive tabular-nums">{r.quarantined} deleted</span>}
                              {vSum.length > 0 && (runOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />)}
                            </div>
                          </button>

                          {runOpen && vSum.length > 0 && (
                            <div className="px-5 pb-3 bg-muted/20">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="text-xs text-muted-foreground border-b border-border">
                                    <th className="text-left py-1.5 font-medium">Reference</th>
                                    <th className="text-left py-1.5 font-medium">Task</th>
                                    <th className="text-left py-1.5 font-medium">Employee</th>
                                    <th className="text-left py-1.5 font-medium">Reason</th>
                                    <th className="text-right py-1.5 font-medium">Duration</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {vSum.map((v, i) => (
                                    <tr key={i} className="border-b border-border/50">
                                      <td className="py-1.5 font-mono text-xs">{v.reference || "—"}</td>
                                      <td className="py-1.5 font-mono text-xs">{v.task_reference || "—"}</td>
                                      <td className="py-1.5">{v.employee_name || "—"}</td>
                                      <td className="py-1.5">
                                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                          {REASON_LABELS[v.reason] || v.reason}
                                        </span>
                                      </td>
                                      <td className="py-1.5 text-right tabular-nums">{v.duration_minutes != null ? `${v.duration_minutes}m` : "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}