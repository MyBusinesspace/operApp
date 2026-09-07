import { base44 } from "@/api/base44Client";

/**
 * Generates a unique task reference code (e.g. TSK-2026-0001).
 * Uses DocumentTemplate "__task_numbering__" for prefix/padding/counter settings.
 * Shared by TaskFormModal and QuickDraftTaskModal.
 *
 * NEVER returns an empty string — if the API call fails (rate limit, network,
 * permissions) a timestamp-based fallback is used so the task is always indexed.
 */
export async function generateTaskReference() {
  try {
    const [settingsList, allTasks] = await Promise.all([
      base44.entities.DocumentTemplate.list("name", 100),
      base44.entities.Task.list("-created_date", 500),
    ]);
    const s = settingsList.find(t => t.name === "__task_numbering__");
    const settings = s ? JSON.parse(s.footer_notes || "{}") : {};
    const prefix = settings.task_prefix || "TSK";
    const padding = settings.number_padding || 4;
    const includeYear = settings.include_year !== false;
    const year = new Date().getFullYear();
    const storedNext = settings.next_number || 1;
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
    const padded = String(nextNum).padStart(padding, "0");
    const ref = includeYear ? `${prefix}-${year}-${padded}` : `${prefix}-${padded}`;
    // Persist a monotonic high-water mark immediately so a deleted task's number
    // is NEVER recycled onto a new task (which would collide with the deleted
    // task's working reports). Numbers may have small gaps when a form is
    // cancelled, but never reuse — uniqueness is required for WR-{taskNum}.{seq}.
    try {
      if (s) {
        const updated = JSON.parse(s.footer_notes || "{}");
        if ((updated.next_number || 0) < nextNum + 1) {
          updated.next_number = nextNum + 1;
          await base44.entities.DocumentTemplate.update(s.id, { footer_notes: JSON.stringify(updated) });
        }
      }
    } catch { /* non-fatal */ }
    return ref;
  } catch {
    // Fallback: generate a unique reference from the current timestamp so the
    // task is never saved without a reference. The number is large enough that
    // it will never collide with the sequential counter, and the next normal
    // generation will advance past it automatically via maxFound.
    const year = new Date().getFullYear();
    const prefix = "TSK";
    const fallbackNum = (Math.floor(Date.now() / 1000) % 100000) * 1000 + Math.floor(Math.random() * 1000);
    const padded = String(fallbackNum).padStart(6, "0");
    return `${prefix}-${year}-${padded}`;
  }
}