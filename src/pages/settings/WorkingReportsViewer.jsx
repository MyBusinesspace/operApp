import React, { useState, useEffect, useMemo, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { formatDateValue } from "@/lib/dateOnly";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SearchableSelect from "@/components/shared/SearchableSelect";
import ColumnToggle from "@/components/shared/ColumnToggle";
import { getHourlyRate, loadLabourContext, entryCosts } from "@/lib/labourCost";
import { listAll, withRetry } from "@/lib/apiHelpers";
import { getEffectiveStatus } from "@/lib/taskStatus";
import { ArrowLeft, FileText, Printer, Loader2, Filter, CalendarDays, User, Briefcase, FileSpreadsheet, Layers, Check, X, ArrowUp, ArrowDown, ArrowUpDown, FolderKanban } from "lucide-react";
import { jsPDF } from "jspdf";
import { buildWorkingReportPages } from "@/components/timesheets/WorkingReportPrint";
import ReportQuickViewModal from "@/components/tasks/ReportQuickViewModal";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/use-toast";

const TZ = "Asia/Dubai";
const dayKey = (iso) => iso
  ? new Date(iso).toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
  : "";

function fmtDate(iso) {
  if (!iso) return "—";
  return formatDateValue(iso);
}
function fmtDuration(mins) {
  if (!mins && mins !== 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtCost(v) {
  if (v == null) return "—";
  return "AED " + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

const COLUMN_DEFS = [
  { key: "report", label: "Checklist", required: true },
  { key: "status", label: "Status" },
  { key: "task", label: "Task" },
  { key: "project", label: "Project" },
  { key: "contact", label: "Contact" },
  { key: "leader", label: "Leader" },
  { key: "invoice", label: "Invoice" },
  { key: "costReport", label: "Cost / Report" },
  { key: "costTask", label: "Cost / Task" },
  { key: "duration", label: "Duration" },
  { key: "date", label: "Date" },
];

function SortableHeader({ label, col, sort, onSort, align = "left" }) {
  const active = sort.key === col;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={`flex items-center gap-1 hover:text-foreground transition-colors ${align === "right" ? "justify-end" : ""}`}
    >
      <span className="truncate">{label}</span>
      <Icon className={`w-3 h-3 shrink-0 ${active ? "text-primary" : "opacity-40"}`} />
    </button>
  );
}

// Calendar-date helpers (TZ-independent, operate on YYYY-MM-DD strings)
function parseDate(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toISO(d) {
  if (!d || isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}
// Monday of the week containing the given YYYY-MM-DD (also returned as YYYY-MM-DD)
function mondayOf(s) {
  if (!s || !s.includes("-")) return "";
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return "";
  const base = new Date(Date.UTC(y, m - 1, d));
  if (isNaN(base.getTime())) return "";
  const dow = base.getUTCDay(); // 0=Sun
  const offset = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(Date.UTC(y, m - 1, d + offset));
  return toISO(mon);
}
function addDays(s, n) {
  const [y, m, d] = s.split("-").map(Number);
  return toISO(new Date(Date.UTC(y, m - 1, d + n)));
}
function weekRangeLabel(mondayStr) {
  const sun = addDays(mondayStr, 6);
  return `${fmtDate(mondayStr + "T00:00:00Z")} – ${fmtDate(sun + "T00:00:00Z")}`;
}

// Returns [from, to] inclusive YYYY-MM-DD for a given mode + anchor date
function rangeFor(mode, anchor) {
  if (mode === "day") return [anchor, anchor];
  const mon = mondayOf(anchor);
  if (!mon) return ["", ""];
  return [mon, addDays(mon, 6)];
}

export default function WorkingReportsViewer() {
  const { toast } = useToast();
  const backPath = new URLSearchParams(window.location.search).get("back") || "/reports";
  const backLabel = backPath === "/operations-overview" ? "Back to Operations" : "Back to Reports";
  const [mode, setMode] = useState("day"); // day | week
  const [anchor, setAnchor] = useState(() => toISO(new Date()));
  const [contactId, setContactId] = useState("all");
  const [employeeId, setEmployeeId] = useState("all");
  const [taskQuery, setTaskQuery] = useState("");
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [checkFilter, setCheckFilter] = useState("all"); // all | unchecked | checked

  const [reports, setReports] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [subtasksByTask, setSubtasksByTask] = useState({});
  const [contacts, setContacts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [template, setTemplate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [profiles, setProfiles] = useState({});
  const [labour, setLabour] = useState({ costs: {}, taskTotals: {}, settings: null });
  const [visibleCols, setVisibleCols] = useState({
    report: true, status: true, task: true, project: true, contact: true, leader: true,
    invoice: true, costReport: true, costTask: true, duration: true, date: true,
  });
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  const [from, to] = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);

  // Static data (contacts, employees, templates) — loaded once, doesn't depend on date
  const loadStatic = useCallback(async () => {
    const [ct, em, tmpls] = await Promise.all([
      withRetry(() => listAll(base44.entities.Contact, "full_name")).catch(() => []),
      withRetry(() => base44.entities.Employee.list("full_name", 500)).catch(() => []),
      withRetry(() => base44.entities.WorkingReportTemplate.list("name", 50)).catch(() => []),
    ]);
    setContacts(ct || []);
    setEmployees(em || []);
    setTemplate((tmpls || []).find(t => t.is_default) || (tmpls || [])[0] || null);
  }, []);

  // Date-dependent data — filtered server-side by the selected week/day
  const loadReports = useCallback(async (dateFrom, dateTo) => {
    setLoading(true);
    try {
      // Server-side date filter: only fetch reports within the selected range
      const startISO = dateFrom ? dateFrom + "T00:00:00+04:00" : null;
      const endISO = dateTo ? addDays(dateTo, 1) + "T00:00:00+04:00" : null;
      let rep = [];
      if (startISO && endISO) {
        const page = await withRetry(() =>
          base44.entities.WorkingReport.filter(
            { clock_in_time: { $gte: startISO, $lt: endISO } },
            { sort: "-clock_in_time", limit: 500 }
          )
        ).catch(() => ({ items: [] }));
        rep = page.items || page || [];
      }
      setReports(rep);

      // Extract referenced task and employee IDs from the filtered reports
      const taskIds = [...new Set(rep.map(r => r.task_id).filter(Boolean))];
      const employeeIds = [...new Set(rep.map(r => r.employee_id).filter(Boolean))];

      // Load tasks, subtasks, invoices, and payroll profiles ONLY for referenced items
      const [taskList, subs, inv, profs] = await Promise.all([
        taskIds.length
          ? withRetry(() => base44.entities.Task.filter({ id: { $in: taskIds } }, { limit: 500 }))
              .then(p => (p && p.items) || []).catch(() => [])
          : [],
        taskIds.length
          ? withRetry(() => base44.entities.TaskSubtask.filter({ task_id: { $in: taskIds } }, { sort: "sort_order", limit: 2000 }))
              .then(p => (p && p.items) || []).catch(() => [])
          : [],
        taskIds.length
          ? withRetry(() => base44.entities.Invoice.filter({ task_ids: { $in: taskIds } }, { sort: "-issue_date", limit: 200 }))
              .then(p => (p && p.items) || []).catch(() => [])
          : [],
        employeeIds.length
          ? withRetry(() => base44.entities.EmployeePayrollProfile.filter({ employee_id: { $in: employeeIds } }, { limit: 200 }))
              .then(p => (p && p.items) || []).catch(() => [])
          : [],
      ]);

      setTasks(taskList || []);
      const byTask = {};
      (subs || []).forEach(s => { (byTask[s.task_id] = byTask[s.task_id] || []).push(s); });
      setSubtasksByTask(byTask);
      setInvoices(inv || []);
      const profMap = {};
      (profs || []).forEach(p => { if (p.employee_id) profMap[p.employee_id] = p; });
      // Day-aware labour cost from TimeEntry (same engine as task / project / Time & Cost)
      try {
        const tEntries = taskIds.length
          ? await withRetry(() => base44.entities.TimeEntry.filter({ task_id: { $in: taskIds } }, { limit: 5000 }))
              .then(p => (p && p.items) || p || []).catch(() => [])
          : [];
        const allEmp = [...new Set(tEntries.map(e => e.employee_id).filter(Boolean))].filter(id => !profMap[id]);
        if (allEmp.length) {
          const more = await withRetry(() => base44.entities.EmployeePayrollProfile.filter({ employee_id: { $in: allEmp } }, { limit: 200 }))
            .then(p => (p && p.items) || p || []).catch(() => []);
          (more || []).forEach(p => { if (p.employee_id) profMap[p.employee_id] = p; });
        }
        const ctx = await loadLabourContext(tEntries);
        const costs = entryCosts(tEntries, profMap, ctx);
        const taskTotals = {};
        tEntries.forEach(e => { const c = costs[e.id]; if (c && e.task_id) taskTotals[e.task_id] = (taskTotals[e.task_id] || 0) + c.cost; });
        setLabour({ costs, taskTotals, settings: ctx.settings });
      } catch (err) { console.error("labour cost load failed", err); }
      setProfiles(profMap);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to load reports", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadStatic(); }, [loadStatic]);
  useEffect(() => { loadReports(from, to); }, [loadReports, from, to]);

  const filtered = useMemo(() => {
    return reports.filter(r => {
      const k = dayKey(r.clock_in_time);
      if (!k || !from || !to) return false;
      if (k < from || k > to) return false;
      if (contactId !== "all" && r.contact_id !== contactId) return false;
      if (employeeId !== "all" && r.employee_id !== employeeId) return false;
      if (checkFilter === "unchecked" && r.checked) return false;
      if (checkFilter === "checked" && !r.checked) return false;
      const q = taskQuery.trim().toLowerCase();
      if (q) {
        const t = tasks.find(tk => tk.id === r.task_id);
        const hay = `${r.task_reference || ""} ${r.task_title || ""} ${t?.reference || ""} ${t?.title || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const iq = invoiceQuery.trim().toLowerCase();
      if (iq) {
        const t = tasks.find(tk => tk.id === r.task_id);
        const hay = `${t?.reference || ""} ${t?.title || ""} ${r.task_reference || ""}`.toLowerCase();
        if (!hay.includes(iq)) return false;
      }
      return true;
    });
  }, [reports, from, to, contactId, employeeId, taskQuery, invoiceQuery, checkFilter, tasks]);

  // Group by day (day mode) or by week (week mode)
  const groups = useMemo(() => {
    const map = {};
    filtered.forEach(r => {
      const dk = dayKey(r.clock_in_time);
      if (!dk) return;
      const key = mode === "week" ? mondayOf(dk) : dk;
      if (!key) return;
      (map[key] = map[key] || []).push(r);
    });
    return Object.entries(map).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filtered, mode]);

  const taskFor = useCallback((r) => {
    const t = tasks.find(tk => tk.id === r?.task_id);
    if (!t) return null;
    return { ...t, subtasks: (subtasksByTask[t.id] || []).map(s => ({ title: s.title, done: s.done })) };
  }, [tasks, subtasksByTask]);

  // Map task_id → linked invoices (a task can have many WRs; if it has an invoice, all its WRs show it)
  const invoiceByTask = useMemo(() => {
    const map = {};
    (invoices || []).forEach(inv => {
      (inv.task_ids || []).forEach(tid => {
        (map[tid] = map[tid] || []).push({ number: inv.number, status: inv.status, due_date: inv.due_date });
      });
    });
    return map;
  }, [invoices]);

  const invoiceInfoFor = useCallback((taskId) => {
    const list = invoiceByTask[taskId] || [];
    if (!list.length) return { text: "—", sub: "no invoice" };
    const first = list[0];
    const extra = list.length - 1;
    const sub = `${first.status || ""}${extra > 0 ? ` +${extra}` : ""}`.trim();
    const unpaid = !!first.status && first.status !== "Paid";
    const today = dayKey(new Date().toISOString());
    const overdue = first.status === "Awaiting Payment" && first.due_date && first.due_date < today;
    return { text: first.number || "—", sub: sub || "linked", unpaid, overdue };
  }, [invoiceByTask]);

  const rateByEmployee = useMemo(() => {
    const map = {};
    Object.keys(profiles).forEach(eid => { map[eid] = getHourlyRate(profiles[eid], labour.settings); });
    return map;
  }, [profiles, labour.settings]);

  const costByReport = useMemo(() => {
    const map = {};
    (reports || []).forEach(r => {
      const c = r.time_entry_id ? labour.costs[r.time_entry_id] : null;
      if (c) { map[r.id] = c.cost; return; }
      const rate = rateByEmployee[r.employee_id];
      map[r.id] = (rate != null && r.duration_minutes) ? (r.duration_minutes / 60) * rate : null;
    });
    return map;
  }, [reports, rateByEmployee, labour.costs]);

  const costByTask = useMemo(() => {
    const map = {};
    (reports || []).forEach(r => {
      if (!r.task_id) return;
      if (labour.taskTotals[r.task_id] != null) { map[r.task_id] = labour.taskTotals[r.task_id]; return; }
      const c = costByReport[r.id] || 0;
      map[r.task_id] = (map[r.task_id] || 0) + c;
    });
    return map;
  }, [reports, costByReport, labour.taskTotals]);

  const getSortVal = useCallback((r, key) => {
    switch (key) {
      case "report": return (r.reference || "").toLowerCase();
      case "status": return (getEffectiveStatus(taskFor(r)) || "").toLowerCase();
      case "task": return (r.task_title || taskFor(r)?.title || "").toLowerCase();
      case "project": return (r.project_name || taskFor(r)?.project_name || "").toLowerCase();
      case "contact": return (r.contact_name || "").toLowerCase();
      case "leader": return (r.report_leader_name || r.employee_name || r.designated_leader_name || "").toLowerCase();
      case "invoice": return (invoiceInfoFor(r.task_id).text || "").toLowerCase();
      case "costReport": return costByReport[r.id] ?? -Infinity;
      case "costTask": return costByTask[r.task_id] ?? -Infinity;
      case "duration": return r.duration_minutes ?? 0;
      case "date": return r.clock_in_time ? new Date(r.clock_in_time).getTime() : 0;
      default: return "";
    }
  }, [taskFor, invoiceInfoFor, costByReport, costByTask]);

  const onSort = useCallback((key) => {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }, []);

  const sortedGroups = useMemo(() => {
    if (!sort.key) return groups;
    const dir = sort.dir === "asc" ? 1 : -1;
    return groups.map(([key, rs]) => [key, [...rs].sort((a, b) => {
      const va = getSortVal(a, sort.key);
      const vb = getSortVal(b, sort.key);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    })]);
  }, [groups, sort, getSortVal]);

  const toggleCol = useCallback((key) => {
    setVisibleCols(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleChecked = useCallback(async (r) => {
    const next = !r.checked;
    setReports(prev => prev.map(x => x.id === r.id ? { ...x, checked: next } : x));
    try {
      await base44.entities.WorkingReport.update(r.id, { checked: next });
    } catch (e) {
      console.error(e);
      setReports(prev => prev.map(x => x.id === r.id ? { ...x, checked: !next } : x));
      toast({ title: "Failed to update check", variant: "destructive" });
    }
  }, [toast]);

  const handlePrintAll = async () => {
    if (filtered.length === 0) return;
    setPrinting(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < filtered.length; i++) {
        const r = filtered[i];
        if (i > 0) pdf.addPage();
        await buildWorkingReportPages({ template, entry: { ...r, report_reference: r.reference }, task: taskFor(r), pdf });
      }
      pdf.save(`Working_Reports_${from}_to_${to}.pdf`);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to print reports", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const handlePrintGroup = async (key, groupReports) => {
    setPrinting(true);
    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      for (let i = 0; i < groupReports.length; i++) {
        const r = groupReports[i];
        if (i > 0) pdf.addPage();
        await buildWorkingReportPages({ template, entry: { ...r, report_reference: r.reference }, task: taskFor(r), pdf });
      }
      const label = mode === "week" ? `Week_${key}` : key;
      pdf.save(`Working_Reports_${label}.pdf`);
    } catch (e) {
      console.error(e);
      toast({ title: "Failed to print", variant: "destructive" });
    } finally {
      setPrinting(false);
    }
  };

  const shiftAnchor = (delta) => {
    setAnchor(prev => addDays(prev, mode === "day" ? delta : delta * 7));
  };

  const groupLabel = (key) => mode === "week"
    ? `Week: ${key ? weekRangeLabel(key) : "—"}`
    : key ? fmtDate(key + "T00:00:00Z") : "—";
  const printGroupLabel = mode === "week" ? "Print Week" : "Print Day";

  return (
    <div className="space-y-6">
      <Link to={backPath} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> {backLabel}
      </Link>

      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Working Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Browse, filter, and print working reports by day, week, contact, worker, or linked task/invoice</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Filter className="w-4 h-4" /> Filters
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Period</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Per Day</SelectItem>
                <SelectItem value="week">Per Week</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> {mode === "day" ? "Day" : "Week"}</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => shiftAnchor(-1)} title="Previous">‹</Button>
              <Input type="date" value={anchor} onChange={e => setAnchor(e.target.value)} className="flex-1" />
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => shiftAnchor(1)} title="Next">›</Button>
            </div>
            {mode === "week" && mondayOf(anchor) && (
              <p className="text-xs text-primary font-medium">{weekRangeLabel(mondayOf(anchor))}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><Briefcase className="w-3.5 h-3.5" /> Contact</Label>
            <SearchableSelect
              value={contactId}
              onValueChange={setContactId}
              placeholder="All contacts"
              searchPlaceholder="Search contacts…"
              options={[{ value: "all", label: "All contacts" }, ...contacts.map(c => ({ value: c.id, label: c.full_name || c.company || "Unnamed" }))]}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><User className="w-3.5 h-3.5" /> Worker</Label>
            <SearchableSelect
              value={employeeId}
              onValueChange={setEmployeeId}
              placeholder="All workers"
              searchPlaceholder="Search workers…"
              options={[{ value: "all", label: "All workers" }, ...employees.map(e => ({ value: e.id, label: e.full_name }))]}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Task (ref / title)</Label>
            <Input value={taskQuery} onChange={e => setTaskQuery(e.target.value)} placeholder="e.g. TSK-2026-0001 or HVAC" />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5"><FileSpreadsheet className="w-3.5 h-3.5" /> Invoice / linked ref</Label>
            <Input value={invoiceQuery} onChange={e => setInvoiceQuery(e.target.value)} placeholder="e.g. INV-0001 or task ref" />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <Switch checked={checkFilter === "unchecked"} onCheckedChange={(v) => setCheckFilter(v ? "unchecked" : "all")} className="scale-90" />
              Unchecked only
            </label>
            <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
              <Switch checked={checkFilter === "checked"} onCheckedChange={(v) => setCheckFilter(v ? "checked" : "all")} className="scale-90" />
              Checked only
            </label>
            <div className="text-xs text-muted-foreground">
              {loading ? "Loading…" : `${filtered.length} report${filtered.length === 1 ? "" : "s"} · ${from}${to !== from ? ` → ${to}` : ""}`}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => loadReports(from, to)} disabled={loading}>
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Update"}
            </Button>
            <Button size="sm" onClick={handlePrintAll} disabled={printing || filtered.length === 0} className="gap-1.5">
              {printing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              Print All ({filtered.length})
            </Button>
          </div>
        </div>
      </div>

      {/* Results grouped by day or week */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center text-muted-foreground text-xs py-12">Loading reports…</div>
        ) : groups.length === 0 ? (
          <div className="text-center text-muted-foreground text-xs py-12 bg-card border border-border rounded-xl">
            No working reports match the selected filters.
          </div>
        ) : sortedGroups.map(([key, groupReports]) => (
          <div key={key} className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-muted/30 border-b border-border">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">{groupLabel(key)}</span>
                <span className="text-xs text-muted-foreground">· {groupReports.length} report{groupReports.length === 1 ? "" : "s"}</span>
              </div>
              <div className="flex items-center gap-2">
                <ColumnToggle columns={COLUMN_DEFS} visible={visibleCols} onToggle={toggleCol} />
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={() => handlePrintGroup(key, groupReports)} disabled={printing}>
                  <Printer className="w-3 h-3" /> {printGroupLabel}
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 bg-muted/30 border-b border-border text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              <div className="w-4 h-4 shrink-0" />
              <div className="flex-1 min-w-0 flex items-center gap-2">
                {visibleCols.report && <div className="flex-[1.2] min-w-0"><SortableHeader label="Checklist" col="report" sort={sort} onSort={onSort} /></div>}
                {visibleCols.status && <div className="flex-[1.4] min-w-0"><SortableHeader label="Status" col="status" sort={sort} onSort={onSort} /></div>}
                {visibleCols.task && <div className="flex-[2.5] min-w-0"><SortableHeader label="Task" col="task" sort={sort} onSort={onSort} /></div>}
                {visibleCols.project && <div className="flex-[1.8] min-w-0"><SortableHeader label="Project" col="project" sort={sort} onSort={onSort} /></div>}
                {visibleCols.contact && <div className="flex-[1.6] min-w-0"><SortableHeader label="Contact" col="contact" sort={sort} onSort={onSort} /></div>}
                {visibleCols.leader && <div className="flex-[1.4] min-w-0"><SortableHeader label="Leader" col="leader" sort={sort} onSort={onSort} /></div>}
                {visibleCols.invoice && <div className="flex-[1.3] min-w-0"><SortableHeader label="Invoice" col="invoice" sort={sort} onSort={onSort} /></div>}
                {visibleCols.costReport && <div className="flex-[1.1] min-w-0"><SortableHeader label="Cost / Report" col="costReport" sort={sort} onSort={onSort} align="right" /></div>}
                {visibleCols.costTask && <div className="flex-[1.1] min-w-0"><SortableHeader label="Cost / Task" col="costTask" sort={sort} onSort={onSort} align="right" /></div>}
                {visibleCols.duration && <div className="flex-[1.2] min-w-0"><SortableHeader label="Duration" col="duration" sort={sort} onSort={onSort} align="right" /></div>}
                {visibleCols.date && <div className="flex-[1.2] min-w-0"><SortableHeader label="Date" col="date" sort={sort} onSort={onSort} /></div>}
              </div>
              <div className="w-8 shrink-0" />
            </div>
            <div className="divide-y divide-border">
              {groupReports.map(r => {
                const t = taskFor(r);
                const inv = invoiceInfoFor(r.task_id);
                return (
                  <div key={r.id} onClick={() => setViewing(r)} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-primary/[0.06] cursor-pointer transition-colors">
                    <FileText className="w-4 h-4 text-primary/60 shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      {visibleCols.report && (
                        <div className="flex-[1.2] min-w-0">
                          <div className="text-xs font-mono font-medium text-primary truncate">{r.reference || "—"}</div>
                          <div className="text-xs text-muted-foreground truncate">{r.task_reference || t?.reference || "—"}</div>
                        </div>
                      )}
                      {visibleCols.status && (() => {
                        const st = getEffectiveStatus(t) || "—";
                        const tone = st === "Completed"
                          ? "bg-success/10 border-success/30 text-success"
                          : st === "Active"
                            ? "bg-info/10 border-info/30 text-info"
                            : st === "Not Completed"
                              ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400"
                              : "bg-muted border-border text-muted-foreground";
                        const dot = st === "Completed" ? "bg-success" : st === "Active" ? "bg-info" : st === "Not Completed" ? "bg-red-500" : "bg-muted-foreground/50";
                        return (
                          <div className="flex-[1.4] min-w-0">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${tone}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                              {st}
                            </span>
                          </div>
                        );
                      })()}
                      {visibleCols.task && (
                        <div className="flex-[2.5] min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">{r.task_title || t?.title || "—"}</div>
                        </div>
                      )}
                      {visibleCols.project && (
                        <div className="flex-[1.8] min-w-0">
                          <div className="text-xs text-foreground truncate flex items-center gap-1">
                            <FolderKanban className="w-3 h-3 text-muted-foreground shrink-0" />
                            <span className="truncate">{r.project_name || t?.project_name || "—"}</span>
                          </div>
                        </div>
                      )}
                      {visibleCols.contact && (
                        <div className="flex-[1.6] min-w-0">
                          <div className="text-xs text-foreground truncate">{r.contact_name || t?.contact_name || "—"}</div>
                        </div>
                      )}
                      {visibleCols.leader && (
                        <div className="flex-[1.4] min-w-0">
                          <div className="text-xs text-foreground truncate flex items-center gap-1"><User className="w-3 h-3" /> {r.report_leader_name || r.employee_name || r.designated_leader_name || "—"}</div>
                        </div>
                      )}
                      {visibleCols.invoice && (
                        <div className="flex-[1.3] min-w-0">
                          <div className={`text-xs font-mono font-medium truncate ${inv.overdue ? "text-red-800" : inv.unpaid ? "text-red-600" : "text-foreground"}`}>{inv.text}</div>
                          <div className={`text-xs truncate ${inv.overdue ? "text-red-700" : inv.unpaid ? "text-red-500" : "text-muted-foreground"}`}>{inv.sub}</div>
                        </div>
                      )}
                      {visibleCols.costReport && (
                        <div className="flex-[1.1] min-w-0 text-right">
                          <div className="text-xs font-medium text-foreground truncate">{fmtCost(costByReport[r.id])}</div>
                        </div>
                      )}
                      {visibleCols.costTask && (
                        <div className="flex-[1.1] min-w-0 text-right">
                          <div className="text-xs font-medium text-foreground truncate">{fmtCost(costByTask[r.task_id])}</div>
                        </div>
                      )}
                      {visibleCols.duration && (
                        <div className="flex-[1.2] min-w-0 text-right">
                          <div className="text-xs text-muted-foreground whitespace-nowrap">{fmtDuration(r.duration_minutes)}</div>
                        </div>
                      )}
                      {visibleCols.date && (
                        <div className="flex-[1.2] min-w-0">
                          <div className="text-xs text-muted-foreground whitespace-nowrap">{fmtDate(r.clock_in_time)}</div>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleChecked(r); }}
                      title={r.checked ? "Seen — click to mark unseen" : "Not seen — click to mark seen"}
                      className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center border transition-colors ${
                        r.checked
                          ? "bg-success/15 border-success text-success"
                          : "bg-muted border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {r.checked ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <ReportQuickViewModal
          open={!!viewing}
          onClose={() => setViewing(null)}
          report={viewing}
          task={taskFor(viewing)}
        />
      )}
    </div>
  );
}