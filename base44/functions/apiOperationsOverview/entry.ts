import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';

const LIMIT = 100000;

function monthKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function dayKey(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inPeriod(iso, period) {
  if (!period || period.mode === "all") return true;
  if (!iso) return false;
  const d = new Date(iso);
  if (isNaN(d)) return false;
  if (period.mode === "year") return d.getFullYear() === period.year;
  if (period.mode === "month") return monthKey(iso) === period.month;
  if (period.mode === "day") return dayKey(iso) === period.day;
  return true;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const period = body && body.period ? body.period : { mode: "all" };

    const [wo, t, te, c, p, a, wr, valRuns, inv, bl, org, profs, emps] = await Promise.all([
      base44.entities.WorkOrder.list("-created_date", LIMIT),
      base44.entities.Task.list("-created_date", LIMIT),
      base44.entities.TimeEntry.list("-created_date", LIMIT),
      base44.entities.Contact.list("-created_date", LIMIT),
      base44.entities.Project.list("-created_date", LIMIT),
      base44.entities.Asset.list("-created_date", LIMIT),
      base44.entities.WorkingReport.list("-created_date", LIMIT),
      base44.entities.WorkingReportValidationRun.list("-run_at", LIMIT),
      base44.entities.Invoice.list("-created_date", LIMIT),
      base44.entities.Bill.list("-created_date", LIMIT),
      base44.entities.Organization.list("-created_date", LIMIT),
      base44.entities.EmployeePayrollProfile.list("-created_date", LIMIT),
      base44.entities.Employee.list("-created_date", LIMIT),
    ]);

    // Office attendance open today (service role: AttendanceDay RLS hides rows
    // from non-managers, but everyone who opens this page already sees who is
    // working on the map). Used to exclude office workers from "not clocked in".
    let officeWorkingEmployeeIds = [];
    try {
      const orgTz = org?.[0]?.timezone || "Asia/Dubai";
      const todayKey = new Intl.DateTimeFormat("en-CA", {
        timeZone: orgTz, year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      const openDays = await base44.asServiceRole.entities.AttendanceDay.filter(
        { status: "Open", work_date: todayKey }, "-clock_in_time", 500
      );
      officeWorkingEmployeeIds = [...new Set((openDays || []).map(d => d.employee_id).filter(Boolean))];
    } catch { /* best-effort: the map falls back to field entries only */ }

    const fWo = wo.filter(x => inPeriod(x.created_date, period));
    const fT = t.filter(x => inPeriod(x.planning_date || x.created_date, period));
    const fTe = te.filter(x => inPeriod(x.clock_in_time, period));
    const fC = c.filter(x => inPeriod(x.created_date, period));
    const fP = p.filter(x => inPeriod(x.created_date, period));
    const fA = a.filter(x => inPeriod(x.created_date, period));
    const fInv = inv.filter(x => inPeriod(x.issue_date || x.created_date, period));
    const fBl = bl.filter(x => inPeriod(x.issue_date || x.created_date, period));

    const count = (arr, fn) => arr.filter(fn).length;
    const statusCounts = (arr, keys) => {
      const res = {};
      for (const k of keys) res[k] = 0;
      for (const x of arr) if (res[x.status] !== undefined) res[x.status]++;
      return res;
    };

    const today = new Date().toISOString().slice(0, 10);
    const docBreakdown = (arr) => {
      const linked = arr.filter(x => Array.isArray(x.task_ids) && x.task_ids.length > 0);
      const bd = [
        { label: "Draft", value: 0, color: "#9ca3af" },
        { label: "Awaiting Payment", value: 0, color: "#f59e0b" },
        { label: "Paid", value: 0, color: "#10b981" },
        { label: "Overdue", value: 0, color: "#ef4444" },
      ];
      for (const d of linked) {
        if (d.status === "Draft") bd[0].value++;
        else if (d.status === "Paid") bd[2].value++;
        else if (d.status === "Awaiting Payment" || d.status === "Awaiting Approval") {
          if (d.due_date && d.due_date < today) bd[3].value++;
          else bd[1].value++;
        }
      }
      return { total: linked.length, breakdown: bd };
    };

    // Breakdown counting ALL documents in the period (not only task-linked)
    const docBreakdownAll = (arr) => {
      const bd = [
        { label: "Draft", value: 0, color: "#9ca3af" },
        { label: "Awaiting Payment", value: 0, color: "#f59e0b" },
        { label: "Paid", value: 0, color: "#10b981" },
        { label: "Overdue", value: 0, color: "#ef4444" },
      ];
      for (const d of arr) {
        if (d.status === "Draft") bd[0].value++;
        else if (d.status === "Paid") bd[2].value++;
        else if (d.status === "Awaiting Payment" || d.status === "Awaiting Approval") {
          if (d.due_date && d.due_date < today) bd[3].value++;
          else bd[1].value++;
        }
      }
      return { total: arr.length, breakdown: bd };
    };

    const organizationName = org && org.length > 0 ? (org[0].name || org[0].legal_name || "") : "";

    const custs = fC.filter(x => x.type === "Customer" || x.type === "Both");
    const sups = c.filter(x => x.type === "Provider" || x.type === "Both");
    const woG = statusCounts(fWo, ["Active", "On Hold", "Archived"]);
    const taskG = statusCounts(fT, ["Queued", "Scheduled", "Not Completed", "Completed"]);

    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const thisWeek = te.filter(e => e.clock_in_time && new Date(e.clock_in_time) >= weekStart);
    const weekMinutes = thisWeek.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const weekHours = Math.round(weekMinutes / 60 * 10) / 10;
    const live = te.filter(e => e.status === "Active").map(e => e.employee_name).filter(Boolean);

    const fMinutes = fTe.reduce((s, e) => s + (e.duration_minutes || 0), 0);
    const fHours = Math.round(fMinutes / 60 * 10) / 10;

    const fWr = wr.filter(x => inPeriod(x.clock_in_time || x.created_date, period));

    // Reports: labour cost + revenue (invoices linked to those reports' tasks)
    const rateOf = (pr) => {
      if (!pr) return null;
      if (pr.pay_type === "hourly") return pr.hourly_rate || 0;
      if (pr.basic_salary) return pr.basic_salary / 22 / 8;
      return null;
    };
    const rateByEmp = {};
    (profs || []).forEach(pr => { if (pr.employee_id) rateByEmp[pr.employee_id] = rateOf(pr); });
    let reportsCost = 0;
    for (const r of fWr) {
      const rate = rateByEmp[r.employee_id];
      if (rate != null && r.duration_minutes) reportsCost += (r.duration_minutes / 60) * rate;
    }
    const wrTaskIds = new Set(fWr.map(r => r.task_id).filter(Boolean));
    let reportsRevenue = 0;
    for (const i of fInv) {
      if (i.status === "Draft") continue;
      if (Array.isArray(i.task_ids) && i.task_ids.some(tid => wrTaskIds.has(tid))) {
        reportsRevenue += i.total || 0;
      }
    }
    const compactAed = (n) => {
      if (n == null) return "—";
      const abs = Math.abs(n);
      if (abs >= 1e6) return (n / 1e6).toFixed(1) + "M";
      if (abs >= 1e3) return (n / 1e3).toFixed(1) + "k";
      return Math.round(n).toString();
    };
    const valInPeriod = valRuns.filter(x => inPeriod(x.run_at, period));
    const valViolations = valInPeriod.reduce((s, r) => s + (r.violations_found || 0), 0);
    const valQuarantined = valInPeriod.reduce((s, r) => s + (r.quarantined || 0), 0);

    // Build trend buckets based on the selected period
    let trendBuckets = [];
    if (period.mode === "day") {
      for (let h = 0; h < 24; h++) {
        trendBuckets.push({
          key: String(h),
          label: String(h).padStart(2, "0"),
          fullLabel: `${String(h).padStart(2, "0")}:00`,
          tasks: 0,
          reports: 0,
        });
      }
    } else if (period.mode === "month") {
      const [yy, mm] = period.month.split("-").map(Number);
      const dim = new Date(yy, mm, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const key = `${period.month}-${String(d).padStart(2, "0")}`;
        trendBuckets.push({
          key,
          label: String(d),
          fullLabel: `${d} ${new Date(yy, mm - 1, 1).toLocaleString("en", { month: "short", year: "numeric" })}`,
          tasks: 0,
          reports: 0,
        });
      }
    } else if (period.mode === "year") {
      for (let m = 0; m < 12; m++) {
        const d = new Date(period.year, m, 1);
        const key = `${period.year}-${String(m + 1).padStart(2, "0")}`;
        trendBuckets.push({
          key,
          label: d.toLocaleString("en", { month: "short" }),
          fullLabel: d.toLocaleString("en", { month: "short", year: "numeric" }),
          tasks: 0,
          reports: 0,
        });
      }
    } else {
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        trendBuckets.push({
          key,
          label: d.toLocaleString("en", { month: "short" }),
          fullLabel: d.toLocaleString("en", { month: "short", year: "numeric" }),
          tasks: 0,
          reports: 0,
        });
      }
    }

    const trendKey = period.mode === "day"
      ? (iso) => {
          if (!iso) return null;
          const d = new Date(iso);
          if (isNaN(d)) return null;
          return String(d.getHours());
        }
      : period.mode === "month"
        ? (iso) => {
            if (!iso) return null;
            const d = new Date(iso);
            if (isNaN(d)) return null;
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          }
        : monthKey;

    const tmap = Object.fromEntries(trendBuckets.map(m => [m.key, m]));
    for (const task of t) {
      const k = trendKey(task.planning_date || task.created_date);
      if (k && tmap[k]) tmap[k].tasks++;
    }
    for (const r of wr) {
      const k = trendKey(r.clock_in_time || r.created_date);
      if (k && tmap[k]) tmap[k].reports++;
    }

    return Response.json({
      invoice: docBreakdown(fInv),
      bill: docBreakdownAll(fBl),
      organizationName,
      customer: {
        total: custs.length,
        breakdown: [
          { label: "Active", value: count(custs, x => x.status === "Active"), color: "#34d399" },
          { label: "Inactive", value: count(custs, x => x.status === "Inactive"), color: "#fbbf24" },
          { label: "Archived", value: count(custs, x => x.status === "Archived"), color: "#a1a1aa" },
        ],
      },
      providers: {
        total: sups.length,
        breakdown: [
          { label: "Active", value: count(sups, x => x.status === "Active"), color: "#34d399" },
          { label: "Inactive", value: count(sups, x => x.status === "Inactive"), color: "#fbbf24" },
          { label: "Archived", value: count(sups, x => x.status === "Archived"), color: "#a1a1aa" },
        ],
      },
      project: {
        total: fP.length,
        breakdown: [
          { label: "Active", value: count(fP, x => x.status === "Active"), color: "#34d399" },
          { label: "On Hold", value: count(fP, x => x.status === "On Hold"), color: "#fbbf24" },
          { label: "Completed", value: count(fP, x => x.status === "Completed"), color: "#818cf8" },
          { label: "Draft", value: count(fP, x => x.status === "Draft"), color: "#a1a1aa" },
        ],
      },
      asset: {
        total: a.length,
        breakdown: [
          { label: "Available", value: count(a, x => x.status === "Available"), color: "#34d399" },
          { label: "In Use", value: count(a, x => x.status === "In Use"), color: "#60a5fa" },
          { label: "Maintenance", value: count(a, x => x.status === "Under Maintenance"), color: "#fbbf24" },
          { label: "Retired", value: count(a, x => x.status === "Retired"), color: "#a1a1aa" },
        ],
      },
      employees: {
        total: emps.length,
        breakdown: [
          { label: "Active", value: count(emps, x => x.status === "Active"), color: "#34d399" },
          { label: "On Leave", value: count(emps, x => x.status === "On Leave"), color: "#fbbf24" },
          { label: "Inactive", value: count(emps, x => x.status === "Inactive"), color: "#a1a1aa" },
          { label: "Terminated", value: count(emps, x => x.status === "Terminated"), color: "#ef4444" },
        ],
      },
      wo: {
        total: fWo.length,
        breakdown: [
          { label: "Active", value: woG.Active, color: "#34d399" },
          { label: "On Hold", value: woG["On Hold"], color: "#fbbf24" },
          { label: "Archived", value: woG.Archived, color: "#a1a1aa" },
        ],
      },
      tasks: {
        total: fT.length,
        breakdown: [
          { label: "Queued", value: taskG.Queued, color: "#a1a1aa" },
          { label: "Scheduled", value: taskG.Scheduled, color: "#818cf8" },
          { label: "Not Completed", value: taskG["Not Completed"], color: "#fbbf24" },
          { label: "Completed", value: taskG.Completed, color: "#34d399" },
        ],
      },
      timesheets: {
        total: period.mode === "all" ? te.length : fTe.length,
        breakdown: period.mode === "all" ? [
          { label: "This Week", value: thisWeek.length, color: "#fbbf24" },
          { label: "Total Hours", value: `${weekHours}h`, color: "#60a5fa" },
          { label: "Minutes", value: weekMinutes, color: "#a78bfa" },
        ] : [
          { label: "In Period", value: fTe.length, color: "#fbbf24" },
          { label: "Hours", value: `${fHours}h`, color: "#60a5fa" },
          { label: "Minutes", value: fMinutes, color: "#a78bfa" },
        ],
        live,
      },
      reports: {
        total: fWr.length,
        breakdown: [
          { label: "Timesheets", value: fTe.length, color: "#fbbf24" },
          { label: "Cost (AED)", value: compactAed(reportsCost), color: "#ef4444" },
          { label: "Revenue (AED)", value: compactAed(reportsRevenue), color: "#10b981" },
        ],
        timeCost: { hours: fHours, entries: fTe.length },
        validation: { runs: valInPeriod.length, violations: valViolations, quarantined: valQuarantined },
        workingReports: {
          count: fWr.length,
          cost: Math.round(reportsCost * 100) / 100,
          revenue: Math.round(reportsRevenue * 100) / 100,
        },
      },
      trend: trendBuckets,
      office_working_employee_ids: officeWorkingEmployeeIds,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}