import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { getCallerEmployee, requirePermission } from "../../shared/permissions.ts";

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

function getPeriodKey(period, date) {
  const d = new Date(date);
  if (period === 'daily') return d.toISOString().slice(0, 10);
  if (period === 'monthly') return d.toISOString().slice(0, 7);
  if (period === 'weekly') {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`;
  }
  return 'all';
}

async function updateAggregation(base44, entityType, entityId, entityName, durationMinutes, clockInTime) {
  for (const period of ['daily', 'weekly', 'monthly', 'alltime']) {
    const period_key = getPeriodKey(period, clockInTime);
    const existing = await base44.asServiceRole.entities.TimeAggregation.filter({
      entity_type: entityType, entity_id: entityId, period, period_key
    });
    if (existing.length > 0) {
      await base44.asServiceRole.entities.TimeAggregation.update(existing[0].id, {
        total_minutes: (existing[0].total_minutes || 0) + durationMinutes,
        entry_count: (existing[0].entry_count || 0) + 1,
      });
    } else {
      await base44.asServiceRole.entities.TimeAggregation.create({
        entity_type: entityType, entity_id: entityId, entity_name: entityName,
        period, period_key, total_minutes: durationMinutes, entry_count: 1,
      });
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { current_entry_id, new_task_id, employee_id, employee_name, lat, lng } = await req.json();
    if (!current_entry_id || !new_task_id) return Response.json({ error: 'current_entry_id and new_task_id are required' }, { status: 400 });

    // 1. Close current entry
    const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: current_entry_id });
    const currentEntry = entries[0];
    if (!currentEntry) return Response.json({ error: 'Current entry not found' }, { status: 404 });
    if (currentEntry.status !== 'Active') return Response.json({ error: 'Entry is not active' }, { status: 400 });

    // Switching task on behalf of another employee requires can_create_on_behalf on timesheets.
    const callerEmp = await getCallerEmployee(base44, user);
    const selfSwitch = callerEmp && currentEntry.employee_id === callerEmp.id && (!employee_id || employee_id === callerEmp.id);
    if (!selfSwitch) {
      const denied = await requirePermission(base44, user, 'timesheets', 'can_create_on_behalf');
      if (denied) return denied;
    }

    const switchTime = new Date();
    const clockInTime = new Date(currentEntry.clock_in_time);
    const durationMinutes = Math.round((switchTime - clockInTime) / 60000);

    let address = null;
    if (lat != null && lng != null) address = await reverseGeocode(lat, lng);

    await base44.asServiceRole.entities.TimeEntry.update(current_entry_id, {
      clock_out_time: switchTime.toISOString(),
      duration_minutes: durationMinutes,
      status: 'Switched',
      clock_out_lat: lat || null,
      clock_out_lng: lng || null,
      clock_out_address: address,
    });

    // Update aggregations for closed entry
    const aggs = [
      { type: 'employee', id: currentEntry.employee_id, name: currentEntry.employee_name },
      { type: 'task', id: currentEntry.task_id, name: currentEntry.task_title },
    ];
    if (currentEntry.work_order_id) aggs.push({ type: 'work_order', id: currentEntry.work_order_id, name: currentEntry.work_order_name });
    if (currentEntry.project_id) aggs.push({ type: 'project', id: currentEntry.project_id, name: currentEntry.project_name });
    if (currentEntry.contact_id) aggs.push({ type: 'contact', id: currentEntry.contact_id, name: currentEntry.contact_name });
    if (currentEntry.asset_id) aggs.push({ type: 'asset', id: currentEntry.asset_id, name: currentEntry.asset_name });
    for (const agg of aggs) {
      await updateAggregation(base44, agg.type, agg.id, agg.name, durationMinutes, currentEntry.clock_in_time);
    }

    // 2. Open new entry for the new task
    const tasks = await base44.asServiceRole.entities.Task.filter({ id: new_task_id });
    const newTask = tasks[0];
    if (!newTask) return Response.json({ error: 'New task not found' }, { status: 404 });

    let distance_from_task_m = null;
    let on_site = null;
    if (lat != null && lng != null && newTask.location_lat != null && newTask.location_lng != null) {
      distance_from_task_m = Math.round(haversineDistance(lat, lng, newTask.location_lat, newTask.location_lng));
      on_site = distance_from_task_m <= (newTask.allowed_radius_m || 200);
    }

    const newEntry = await base44.asServiceRole.entities.TimeEntry.create({
      employee_id: employee_id || currentEntry.employee_id,
      employee_name: employee_name || currentEntry.employee_name,
      task_id: new_task_id,
      task_title: newTask.title,
      work_order_id: newTask.work_order_id || "",
      work_order_name: newTask.work_order_name || "",
      project_id: newTask.project_id || "",
      project_name: newTask.project_name || "",
      contact_id: newTask.contact_id || "",
      contact_name: newTask.contact_name || "",
      asset_id: newTask.asset_id || "",
      asset_name: newTask.asset_name || "",
      clock_in_time: switchTime.toISOString(),
      status: 'Active',
      clock_in_lat: lat || null,
      clock_in_lng: lng || null,
      clock_in_address: address,
      distance_from_task_m,
      on_site,
      switched_from_entry_id: current_entry_id,
    });

    return Response.json({ success: true, closed_entry_id: current_entry_id, new_entry: newEntry });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});