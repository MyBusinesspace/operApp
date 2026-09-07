import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

async function generateReference(base44) {
  try {
    const settingsList = await base44.asServiceRole.entities.DocumentTemplate.list();
    const s = settingsList.find(t => t.name === "__task_numbering__");
    const settings = s ? JSON.parse(s.footer_notes || "{}") : {};
    const prefix = settings.task_prefix || "TSK";
    const padding = settings.number_padding || 4;
    const includeYear = settings.include_year !== false;
    const year = new Date().getFullYear();
    const storedNext = settings.next_number || 1;

    const allTasks = await base44.asServiceRole.entities.Task.list();
    const pattern = includeYear
      ? new RegExp(`^${prefix}-${year}-(\\d+)$`)
      : new RegExp(`^${prefix}-(\\d+)$`);
    let maxFound = 0;
    for (const t of allTasks) {
      if (!t.reference) continue;
      const m = t.reference.match(pattern);
      if (m) { const n = parseInt(m[1], 10); if (n > maxFound) maxFound = n; }
    }

    const nextNum = Math.max(storedNext, maxFound + 1);
    const newSettings = { ...settings, next_number: nextNum + 1 };
    if (s) {
      await base44.asServiceRole.entities.DocumentTemplate.update(s.id, { footer_notes: JSON.stringify(newSettings) });
    }

    const padded = String(nextNum).padStart(padding, "0");
    return includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
  } catch {
    // Fallback: never return empty — use a timestamp-based unique reference
    const year = new Date().getFullYear();
    const fallbackNum = (Math.floor(Date.now() / 1000) % 100000) * 1000 + Math.floor(Math.random() * 1000);
    const padded = String(fallbackNum).padStart(6, "0");
    return `TSK-${year}-${padded}`;
  }
}

function resolvePlaceholders(title, date) {
  if (!title) return title;
  const d = new Date(date + "T00:00:00");
  const month = d.toLocaleString("en", { month: "long" });
  const year = d.getFullYear();
  const week = `W${Math.ceil(d.getDate() / 7)}`;
  return title
    .replace(/\[Month\]/g, month)
    .replace(/\[Week\]/g, week)
    .replace(/\[Year\]/g, String(year))
    .replace(/\[MonthYear\]/g, `${month} ${year}`)
    .replace(/\[WeekYear\]/g, `${week}-${year}`);
}

function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Build all target dates from start up to and including today
function buildDueDates(template, today) {
  const freq = template.recurrence_frequency || "monthly";
  const dayOfMonth = template.recurrence_day_of_month ? Number(template.recurrence_day_of_month) : null;
  const dayOfWeek = template.recurrence_day_of_week !== undefined && template.recurrence_day_of_week !== null ? Number(template.recurrence_day_of_week) : 1;
  const endDate = template.recurrence_end_date ? new Date(template.recurrence_end_date + "T00:00:00") : null;

  // Determine first occurrence date
  let first;
  if (freq === "weekly") {
    first = new Date(today);
    const todayDow = today.getDay();
    let daysUntil = (dayOfWeek - todayDow + 7) % 7;
    if (daysUntil === 0) daysUntil = 7;
    first.setDate(today.getDate() + daysUntil);
  } else if (dayOfMonth) {
    first = new Date(today.getFullYear(), today.getMonth(), dayOfMonth);
    if (first < today) {
      first.setMonth(first.getMonth() + (freq === "quarterly" ? 3 : 1));
    }
  } else if (freq === "daily") {
    first = new Date(today);
    first.setDate(today.getDate() + 1);
  } else {
    first = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  }

  // If there's a last_generated_date, start from the next occurrence after it
  if (template.last_generated_date) {
    const lastGen = new Date(template.last_generated_date + "T00:00:00");
    // Advance first until it's strictly after lastGen
    let candidate = new Date(first);
    while (candidate <= lastGen) {
      if (freq === "daily") candidate.setDate(candidate.getDate() + 1);
      else if (freq === "weekly") candidate.setDate(candidate.getDate() + 7);
      else if (freq === "quarterly") candidate.setMonth(candidate.getMonth() + 3);
      else candidate.setMonth(candidate.getMonth() + 1);
    }
    first = candidate;
  }

  // Determine the generation horizon:
  // - monthly/quarterly: generate all occurrences whose month <= current month
  // - weekly: generate all occurrences whose week <= current week
  // - daily: generate up to today
  let horizon = new Date(today);
  if (freq === "monthly" || freq === "quarterly") {
    // End of current month
    horizon = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  } else if (freq === "weekly") {
    // End of current week (Saturday)
    const daysToEndOfWeek = 6 - today.getDay();
    horizon = new Date(today);
    horizon.setDate(today.getDate() + daysToEndOfWeek);
  }

  // Collect all dates from first up to horizon (catch up missed + current period)
  const dates = [];
  let cur = new Date(first);
  while (cur <= horizon) {
    if (endDate && cur > endDate) break;
    dates.push(toLocalDateStr(cur));
    if (freq === "daily") cur.setDate(cur.getDate() + 1);
    else if (freq === "weekly") cur.setDate(cur.getDate() + 7);
    else if (freq === "quarterly") cur.setMonth(cur.getMonth() + 3);
    else cur.setMonth(cur.getMonth() + 1);
  }
  return dates;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const templates = await base44.asServiceRole.entities.Task.filter({ is_recurring: true });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toLocalDateStr(today);

    let generated = 0;

    for (const template of templates) {
      // Skip if past end date
      if (template.recurrence_end_date && todayStr > template.recurrence_end_date) continue;

      const dueDates = buildDueDates(template, today);
      if (dueDates.length === 0) continue;

      // Fetch all existing child tasks for this template once
      const existing = await base44.asServiceRole.entities.Task.filter({ recurrence_template_id: template.id });
      const existingDates = new Set(existing.map(t => t.planning_date).filter(Boolean));

      let latestGenerated = template.last_generated_date || null;

      for (const targetDate of dueDates) {
        // Skip if already generated
        if (existingDates.has(targetDate)) {
          if (!latestGenerated || targetDate > latestGenerated) latestGenerated = targetDate;
          continue;
        }

        const resolvedTitle = resolvePlaceholders(template.title, targetDate);
        const reference = await generateReference(base44);

        const copy = {
          reference,
          title: resolvedTitle,
          description: template.description,
          category: template.category,
          priority: template.priority,
          work_order_id: template.work_order_id,
          work_order_name: template.work_order_name,
          project_id: template.project_id,
          project_name: template.project_name,
          contact_id: template.contact_id,
          contact_name: template.contact_name,
          asset_id: template.asset_id,
          asset_name: template.asset_name,
          assigned_users: template.assigned_users,
          assigned_user_names: template.assigned_user_names,
          assigned_employees: template.assigned_employees,
          assigned_employee_names: template.assigned_employee_names,
          assigned_team_ids: template.assigned_team_ids,
          assigned_team_names: template.assigned_team_names,
          planning_time_in: template.planning_time_in,
          planning_time_out: template.planning_time_out,
          notes: template.notes,
          planning_date: targetDate,
          status: "Scheduled",
          is_recurring: false,
          recurrence_template_id: template.id,
        };

        const newTask = await base44.asServiceRole.entities.Task.create(copy);

        // Copy subtasks from the template to the new child task
        const templateSubtasks = await base44.asServiceRole.entities.TaskSubtask.filter({ task_id: template.id }).catch(() => []);
        for (const sub of templateSubtasks) {
          await base44.asServiceRole.entities.TaskSubtask.create({
            task_id: newTask.id,
            title: sub.title,
            done: false,
            sort_order: sub.sort_order,
          }).catch(() => {});
        }

        if (!latestGenerated || targetDate > latestGenerated) latestGenerated = targetDate;
        generated++;
      }

      // Update last_generated_date to the latest date processed
      if (latestGenerated && latestGenerated !== template.last_generated_date) {
        await base44.asServiceRole.entities.Task.update(template.id, { last_generated_date: latestGenerated });
      }
    }

    return Response.json({ success: true, generated, checked: templates.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});