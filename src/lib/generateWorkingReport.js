import { base44 } from "@/api/base44Client";

/**
 * Generates a Working Report PDF server-side (single source of truth for web
 * and mobile) and returns a hosted PDF URL.
 *
 * @param {string} reportId - WorkingReport entity id
 * @param {object} [opts]
 * @param {boolean} [opts.forClientFill=false] - leave client comments/signature blank
 * @returns {Promise<{url:string, file_name:string}>}
 */
export async function generateWorkingReport(reportId, { forClientFill = false } = {}) {
  const res = await base44.functions.invoke("generateWorkingReport", {
    report_id: reportId,
    for_client_fill: forClientFill,
  });
  return res?.data || {};
}