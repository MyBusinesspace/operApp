import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getCallerEmployee, requireOnBehalf } from "../../shared/permissions.ts";

// Haversine formula: distance in meters between two lat/lng points
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Reverse geocode using nominatim (free, no key needed)
async function reverseGeocode(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
      headers: { 'User-Agent': 'OPERAPP360/1.0' }
    });
    const data = await res.json();
    return data.display_name || `${lat}, ${lng}`;
  } catch {
    return `${lat}, ${lng}`;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { employee_id, employee_name, task_id, lat, lng, clock_in_photo_url } = await req.json();
    if (!employee_id || !task_id) return Response.json({ error: 'employee_id and task_id are required' }, { status: 400 });

    // Clocking in on behalf of another employee requires can_create on timesheets
    // + can_edit_all_employees data scope.
    const callerEmp = await getCallerEmployee(base44, user);
    if (!callerEmp || callerEmp.id !== employee_id) {
      const denied = await requireOnBehalf(base44, user, 'timesheets', 'can_edit_all_employees');
      if (denied) return denied;
    }

    // Check if employee already has an active entry
    const activeEntries = await base44.asServiceRole.entities.TimeEntry.filter({ employee_id, status: "Active" });
    if (activeEntries.length > 0) {
      return Response.json({ error: 'Employee already has an active clock-in. Please clock out first.' }, { status: 409 });
    }

    // Fetch task to get linked entities and task location
    const tasks = await base44.asServiceRole.entities.Task.filter({ id: task_id });
    const task = tasks[0];
    if (!task) return Response.json({ error: 'Task not found' }, { status: 404 });

    // Stamp the payroll currency at clock-in so historical labour cost stays in the
    // currency the salary was paid in, even if the payroll currency later changes.
    const settingsList = await base44.asServiceRole.entities.PayrollSettings.list();
    const payrollCurrency = (Array.isArray(settingsList) && settingsList[0]?.currency) || "AED";

    // Auto-populate planning_date from today's clock-in if missing (makes task visible in Planner)
    if (!task.planning_date) {
      const today = new Date().toISOString().slice(0, 10);
      await base44.asServiceRole.entities.Task.update(task_id, { planning_date: today });
      task.planning_date = today;
    }

    // Resolve the owning app user id from the employee's profile (empty when absent).
    const empRows = await base44.asServiceRole.entities.Employee.filter({ id: employee_id });
    const entryUserId = empRows?.[0]?.user_id || "";

    // Long-session safeguard: the first reminder is due 12 hours after clock-in.
    const clockInIso = new Date().toISOString();
    const nextAlertIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();

    // Geolocation analysis
    let distance_from_task_m = null;
    let on_site = null;
    let clock_in_address = null;

    if (lat != null && lng != null) {
      clock_in_address = await reverseGeocode(lat, lng);
      if (task.location_lat != null && task.location_lng != null) {
        distance_from_task_m = Math.round(haversineDistance(lat, lng, task.location_lat, task.location_lng));
        const radius = task.allowed_radius_m || 200;
        on_site = distance_from_task_m <= radius;
      }
    }

    const entry = await base44.asServiceRole.entities.TimeEntry.create({
      employee_id,
      employee_name: employee_name || "",
      user_id: entryUserId,
      task_id,
      task_title: task.title,
      work_order_id: task.work_order_id || "",
      work_order_name: task.work_order_name || "",
      project_id: task.project_id || "",
      project_name: task.project_name || "",
      contact_id: task.contact_id || "",
      contact_name: task.contact_name || "",
      asset_id: task.asset_id || "",
      asset_name: task.asset_name || "",
      clock_in_time: clockInIso,
      status: "Active",
      next_alert_at: nextAlertIso,
      clock_in_lat: lat || null,
      clock_in_lng: lng || null,
      clock_in_address,
      distance_from_task_m,
      on_site,
      clock_in_photo_url: clock_in_photo_url || null,
      currency: payrollCurrency,
    });

    return Response.json({ success: true, entry });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});