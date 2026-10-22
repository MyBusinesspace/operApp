// Shared helpers to compute invoice/bill counts for flow diagrams.
// Only documents linked to at least one task are counted.

import { todayLocalISO } from "@/lib/dateOnly";

const hasTask = (doc) => Array.isArray(doc?.task_ids) && doc.task_ids.length > 0;

export function computeInvoiceCounts(invoices) {
  const today = todayLocalISO();
  const linked = (invoices || []).filter(hasTask);
  const breakdown = [
    { label: "Draft", value: 0, color: "#9ca3af" },
    { label: "Awaiting Payment", value: 0, color: "#f59e0b" },
    { label: "Paid", value: 0, color: "#10b981" },
    { label: "Overdue", value: 0, color: "#ef4444" },
  ];
  for (const inv of linked) {
    if (inv.status === "Draft") breakdown[0].value++;
    else if (inv.status === "Paid") breakdown[2].value++;
    else if (inv.status === "Awaiting Payment" || inv.status === "Awaiting Approval") {
      if (inv.due_date && inv.due_date < today) breakdown[3].value++;
      else breakdown[1].value++;
    }
  }
  return { total: linked.length, breakdown };
}

export function computeBillCounts(bills) {
  const today = todayLocalISO();
  const linked = (bills || []).filter(hasTask);
  const breakdown = [
    { label: "Draft", value: 0, color: "#9ca3af" },
    { label: "Awaiting Payment", value: 0, color: "#f59e0b" },
    { label: "Paid", value: 0, color: "#10b981" },
    { label: "Overdue", value: 0, color: "#ef4444" },
  ];
  for (const b of linked) {
    if (b.status === "Draft") breakdown[0].value++;
    else if (b.status === "Paid") breakdown[2].value++;
    else if (b.status === "Awaiting Payment" || b.status === "Awaiting Approval") {
      if (b.due_date && b.due_date < today) breakdown[3].value++;
      else breakdown[1].value++;
    }
  }
  return { total: linked.length, breakdown };
}