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

    const { entry_id, lat, lng, notes } = await req.json();
    if (!entry_id) return Response.json({ error: 'entry_id is required' }, { status: 400 });

    const entries = await base44.asServiceRole.entities.TimeEntry.filter({ id: entry_id });
    const entry = entries[0];
    if (!entry) return Response.json({ error: 'Time entry not found' }, { status: 404 });
    if (entry.status !== 'Active') return Response.json({ error: 'Entry is not active' }, { status: 400 });

    // Clocking out on behalf of another employee requires can_create_on_behalf on timesheets.
    const callerEmp = await getCallerEmployee(base44, user);
    if (!callerEmp || callerEmp.id !== entry.employee_id) {
      const denied = await requirePermission(base44, user, 'timesheets', 'can_create_on_behalf');
      if (denied) return denied;
    }

    const clockOutTime = new Date();
    const clockInTime = new Date(entry.clock_in_time);
    const durationMinutes = Math.round((clockOutTime - clockInTime) / 60000);

    let clock_out_address = null;
    if (lat != null && lng != null) {
      clock_out_address = await reverseGeocode(lat, lng);
    }

    const updated = await base44.asServiceRole.entities.TimeEntry.update(entry_id, {
      clock_out_time: clockOutTime.toISOString(),
      duration_minutes: durationMinutes,
      status: 'Completed',
      clock_out_lat: lat || null,
      clock_out_lng: lng || null,
      clock_out_address,
      notes: notes || entry.notes,
    });

    // Update aggregations for all linked entities
    const aggs = [
      { type: 'employee', id: entry.employee_id, name: entry.employee_name },
      { type: 'task', id: entry.task_id, name: entry.task_title },
    ];
    if (entry.work_order_id) aggs.push({ type: 'work_order', id: entry.work_order_id, name: entry.work_order_name });
    if (entry.project_id) aggs.push({ type: 'project', id: entry.project_id, name: entry.project_name });
    if (entry.contact_id) aggs.push({ type: 'contact', id: entry.contact_id, name: entry.contact_name });
    if (entry.asset_id) aggs.push({ type: 'asset', id: entry.asset_id, name: entry.asset_name });

    for (const agg of aggs) {
      await updateAggregation(base44, agg.type, agg.id, agg.name, durationMinutes, entry.clock_in_time);
    }

    return Response.json({ success: true, entry: updated, duration_minutes: durationMinutes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});