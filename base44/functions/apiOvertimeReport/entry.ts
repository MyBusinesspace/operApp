import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { checkEmployeePermission } from '../../shared/permissions.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const employeeId = req.headers.get("x-employee-id");

    if (!employeeId) {
      return Response.json({ error: "Missing x-employee-id header" }, { status: 401 });
    }

    // Resolve the caller's employee record (used for permission checks on writes).
    const empRows = await base44.asServiceRole.entities.Employee.filter({ id: employeeId });
    const callerEmployee = empRows[0] || null;

    const method = req.method;
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    // LIST all overtime entries (optionally filtered by employee_id query param)
    if (method === "GET" && !id) {
      const filterEmployee = url.searchParams.get("employee_id");
      // A switch performs a clock-out, so Switched entries are clocked-out too — fetch both and merge
      const [completed, switched] = await Promise.all([
        base44.asServiceRole.entities.TimeEntry.filter(
          filterEmployee ? { employee_id: filterEmployee, status: "Completed" } : { status: "Completed" },
          "-clock_in_time", 5000
        ),
        base44.asServiceRole.entities.TimeEntry.filter(
          filterEmployee ? { employee_id: filterEmployee, status: "Switched" } : { status: "Switched" },
          "-clock_in_time", 5000
        ),
      ]);
      const entries = [...(completed || []), ...(switched || [])];
      const profiles = await base44.asServiceRole.entities.EmployeePayrollProfile.list("-created_date", 500);
      const settings = await base44.asServiceRole.entities.PayrollSettings.list("-created_date", 10);
      const payrollSettings = settings[0] || {};

      // Org timezone for local date grouping (must match the Overtime Report)
      const orgs = await base44.asServiceRole.entities.Organization.list();
      const orgTimezone = (Array.isArray(orgs) && orgs[0]?.timezone) || "Asia/Dubai";
      function localDateKey(isoStr: string): string {
        try {
          return new Intl.DateTimeFormat("en-CA", {
            timeZone: orgTimezone, year: "numeric", month: "2-digit", day: "2-digit"
          }).format(new Date(isoStr));
        } catch { return new Date(isoStr).toISOString().slice(0, 10); }
      }

      // Per-day OT: group entries by employee + day, compute OT from daily total hours.
      // Same logic as the Overtime Report and calculatePayPeriod.
      const thresholdMins = (payrollSettings.overtime_threshold_daily_h || 8) * 60;
      const holidays = payrollSettings.public_holidays || [];
      const profileMap: Record<string, any> = {};
      profiles.forEach(p => { profileMap[p.employee_id] = p; });

      const dayMap: Record<string, any> = {}; // key = empId|dayKey
      entries.forEach(entry => {
        if (!entry.clock_in_time || !entry.clock_out_time || !entry.employee_id) return;
        const dayKey = localDateKey(entry.clock_in_time);
        const key = `${entry.employee_id}|${dayKey}`;
        if (!dayMap[key]) dayMap[key] = { employee_id: entry.employee_id, employee_name: entry.employee_name, dayKey, totalMins: 0, entries: [], overrideMins: 0, hasOverride: false };
        const dur = entry.duration_minutes || Math.round((new Date(entry.clock_out_time).getTime() - new Date(entry.clock_in_time).getTime()) / 60000);
        dayMap[key].totalMins += dur;
        dayMap[key].entries.push(entry);
        if (entry.overtime_override_minutes != null) {
          dayMap[key].hasOverride = true;
          dayMap[key].overrideMins += entry.overtime_override_minutes;
        }
      });

      const result = Object.values(dayMap).map((day: any) => {
        let overtimeMins: number;
        if (day.hasOverride) {
          overtimeMins = Math.max(0, day.overrideMins);
        } else {
          overtimeMins = Math.max(0, day.totalMins - thresholdMins);
        }
        if (overtimeMins <= 0 && !day.hasOverride) return null;

        const regularMins = Math.min(day.totalMins, thresholdMins);
        const isHoliday = holidays.includes(day.dayKey);
        const isSunday = new Date(day.dayKey + "T12:00:00").getDay() === 0;
        const dayType = isHoliday ? "holiday" : isSunday ? "sunday" : "regular";

        const profile = profileMap[day.employee_id];
        const basicSalary = profile?.basic_salary || 0;
        const workDays = payrollSettings.working_days_per_month || 22;
        const workHours = payrollSettings.working_hours_per_day || 8;
        const baseHourly = profile?.pay_type === "hourly"
          ? (profile.hourly_rate || 0)
          : (basicSalary > 0 ? basicSalary / workDays / workHours : 0);

        let otRate = 0;
        if (dayType === "holiday") {
          const fixed = parseFloat(payrollSettings.overtime_fixed_rate_holiday);
          otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (payrollSettings.overtime_multiplier_holiday || 2.0);
        } else if (dayType === "sunday") {
          const fixed = parseFloat(payrollSettings.overtime_fixed_rate_sunday);
          otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (payrollSettings.overtime_multiplier_sunday || 2.0);
        } else {
          const fixed = parseFloat(payrollSettings.overtime_fixed_rate);
          otRate = !isNaN(fixed) && fixed > 0 ? fixed : baseHourly * (payrollSettings.overtime_multiplier || 1.5);
        }

        return {
          employee_id: day.employee_id,
          employee_name: day.employee_name,
          date: day.dayKey,
          total_minutes: day.totalMins,
          regular_minutes: regularMins,
          overtime_minutes: overtimeMins,
          day_type: dayType,
          hourly_rate: otRate,
          overtime_cost: otRate * (overtimeMins / 60),
          entry_count: day.entries.length,
          entries: day.entries.map((e: any) => ({
            entry_id: e.id,
            task_title: e.task_title,
            work_order_name: e.work_order_name,
            project_name: e.project_name,
            clock_in_time: e.clock_in_time,
            clock_out_time: e.clock_out_time,
          })),
        };
      }).filter(Boolean);

      return Response.json({ data: result, count: result.length });
    }

    // GET single entry by TimeEntry id
    if (method === "GET" && id) {
      const entry = await base44.asServiceRole.entities.TimeEntry.get(id);
      if (!entry) return Response.json({ error: "Entry not found" }, { status: 404 });
      return Response.json({ data: entry });
    }

    // CREATE a new TimeEntry (manual overtime log)
    if (method === "POST") {
      if (!callerEmployee || !await checkEmployeePermission(base44, callerEmployee, "timesheets", "can_edit")) {
        return Response.json({ error: "Forbidden: missing timesheets can_edit" }, { status: 403 });
      }
      const body = await req.json();
      const { employee_id, employee_name, task_id, task_title, clock_in_time, clock_out_time, notes } = body;

      if (!employee_id || !clock_in_time || !clock_out_time) {
        return Response.json({ error: "employee_id, clock_in_time and clock_out_time are required" }, { status: 400 });
      }

      const clockIn = new Date(clock_in_time);
      const clockOut = new Date(clock_out_time);
      const duration_minutes = Math.round((clockOut - clockIn) / 60000);

      const created = await base44.asServiceRole.entities.TimeEntry.create({
        employee_id,
        employee_name: employee_name || "",
        task_id: task_id || "",
        task_title: task_title || "",
        clock_in_time,
        clock_out_time,
        duration_minutes,
        status: "Completed",
        notes: notes || "",
      });

      return Response.json({ data: created }, { status: 201 });
    }

    // UPDATE an existing TimeEntry
    if (method === "PUT") {
      if (!id) return Response.json({ error: "id query param required" }, { status: 400 });
      if (!callerEmployee || !await checkEmployeePermission(base44, callerEmployee, "timesheets", "can_edit")) {
        return Response.json({ error: "Forbidden: missing timesheets can_edit" }, { status: 403 });
      }
      const body = await req.json();

      // Recalculate duration if times changed
      if (body.clock_in_time && body.clock_out_time) {
        const clockIn = new Date(body.clock_in_time);
        const clockOut = new Date(body.clock_out_time);
        body.duration_minutes = Math.round((clockOut - clockIn) / 60000);
      }

      const updated = await base44.asServiceRole.entities.TimeEntry.update(id, body);
      return Response.json({ data: updated });
    }

    // DELETE a TimeEntry
    if (method === "DELETE") {
      if (!id) return Response.json({ error: "id query param required" }, { status: 400 });
      if (!callerEmployee || !await checkEmployeePermission(base44, callerEmployee, "timesheets", "can_edit")) {
        return Response.json({ error: "Forbidden: missing timesheets can_edit" }, { status: 403 });
      }
      await base44.asServiceRole.entities.TimeEntry.delete(id);
      return Response.json({ success: true });
    }

    return Response.json({ error: "Method not allowed" }, { status: 405 });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});