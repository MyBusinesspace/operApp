import { base44 } from "@/api/base44Client";

// Statuses where a document is approved and must carry its official number.
export const APPROVED_STATUSES = {
  Invoice: ["Awaiting Payment", "Paid"],
  CreditNote: ["Awaiting Application", "Applied", "Paid", "Approved"],
  Quote: ["Sent", "Accepted", "Invoiced"],
};

export const isApprovedStatus = (docType, status) => (APPROVED_STATUSES[docType] || []).includes(status);

// Assign the official number on the server (atomic, yearly series, idempotent).
// Returns the number, or "" if it could not be assigned.
export async function assignOfficialNumber(docType, docId) {
  try {
    const res = await base44.functions.invoke("assignDocumentNumber", { doc_type: docType, doc_id: docId });
    return res?.data?.number || res?.number || "";
  } catch (e) {
    console.error("assignDocumentNumber failed", e);
    return "";
  }
}


// Reserve the next yearly reference (Project/WorkOrder/Task/Asset/Contact) atomically on the server.
// Series: P-YYYY-N, WO-YYYY-N, T-YYYY-N, A-YYYY-N, C-YYYY-N. No padding, no maximum.
// Returns "" when the server could not reserve (callers then use their legacy fallback).
export async function reserveReference(entity) {
  try {
    const res = await base44.functions.invoke("assignReferenceNumber", { entity, reserve: true });
    return res?.data?.number || res?.number || "";
  } catch (e) {
    console.error("assignReferenceNumber failed", e);
    return "";
  }
}
