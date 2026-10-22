import { base44 } from "@/api/base44Client";

/**
 * Find completed/switched time entries for the same employee that overlap
 * with the given [clockInISO, clockOutISO] range.
 * Returns an array of overlapping entries (empty if no overlaps).
 */
export async function findOverlappingEntries(employeeId, clockInISO, clockOutISO, excludeEntryId) {
  if (!clockInISO || !clockOutISO) return [];
  const cin = new Date(clockInISO);
  const cout = new Date(clockOutISO);
  if (!(cout > cin)) return [];
  const [comp, sw] = await Promise.all([
    base44.entities.TimeEntry.filter({ employee_id: employeeId, status: "Completed" }, "-clock_in_time", 5000),
    base44.entities.TimeEntry.filter({ employee_id: employeeId, status: "Switched" }, "-clock_in_time", 5000),
  ]);
  const all = [...(comp || []), ...(sw || [])].filter(
    e => e.id !== excludeEntryId && e.clock_in_time && e.clock_out_time
  );
  return all.filter(e => {
    const oIn = new Date(e.clock_in_time);
    const oOut = new Date(e.clock_out_time);
    return cin < oOut && oIn < cout;
  });
}