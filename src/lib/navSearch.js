import { base44 } from "@/api/base44Client";
import { withRetry } from "@/lib/apiHelpers";
import { Users, FolderKanban, ClipboardList, CheckSquare, UserCheck, FileText, Receipt } from "lucide-react";

const CATEGORIES = [
  { entity: "Contact", type: "contact", label: "Companies & Contacts", icon: Users,
    fields: ["full_name", "company", "email", "phone", "reference"], labelKey: "full_name", subKeys: ["company", "email"], path: id => `/contacts/${id}` },
  { entity: "Quote", type: "quote", label: "Quotes", icon: FileText,
    fields: ["number", "reference", "contact_name", "title"], labelKey: "contact_name", subKeys: ["number", "reference"], path: id => `/sales/quotes/${id}/edit` },
  { entity: "Invoice", type: "invoice", label: "Invoices", icon: FileText,
    fields: ["number", "reference", "contact_name", "title"], labelKey: "contact_name", subKeys: ["number", "reference"], path: id => `/sales/invoices/${id}/edit` },
  { entity: "Bill", type: "bill", label: "Bills", icon: Receipt,
    fields: ["number", "reference", "contact_name", "title"], labelKey: "contact_name", subKeys: ["number", "reference"], path: id => `/purchasing/bills/${id}/edit` },
  { entity: "Project", type: "project", label: "Projects", icon: FolderKanban,
    fields: ["name", "description", "reference", "contact_name"], labelKey: "name", subKeys: ["status"], path: id => `/projects/${id}` },
  { entity: "WorkOrder", type: "workOrder", label: "Work Orders", icon: ClipboardList,
    fields: ["title", "reference", "contact_name"], labelKey: "title", subKeys: ["contact_name", "status"], path: id => `/work-orders/${id}` },
  { entity: "Task", type: "task", label: "Tasks", icon: CheckSquare,
    fields: ["title", "reference", "contact_name"], labelKey: "title", subKeys: ["reference"], path: id => `/tasks?open=${id}` },
  { entity: "Employee", type: "employee", label: "Employees", icon: UserCheck,
    fields: ["full_name", "email", "department"], labelKey: "full_name", subKeys: ["department", "role"], path: id => `/employees/${id}` },
];

export async function searchNavRecords(query, isCurrent) {
  // Optional spaces let both "al ishrak" and "alishrak" match "Al Ishrak".
  const pattern = Array.from(query.replace(/\s+/g, ""))
    .map(character => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s*");
  const groups = [];
  for (let index = 0; index < CATEGORIES.length; index += 2) {
    if (!isCurrent()) return [];
    const batch = CATEGORIES.slice(index, index + 2);
    const responses = await Promise.allSettled(batch.map(category => withRetry(() =>
      base44.entities[category.entity].filter(
        { $or: category.fields.map(field => ({ [field]: { $regex: pattern, $options: "i" } })) },
        { sort: "-updated_date", limit: 3, fields: [...new Set([...category.fields, ...category.subKeys, category.labelKey])] }
      )
    )));
    responses.forEach((response, position) => {
      const category = batch[position];
      groups.push({
        type: category.type,
        label: category.label,
        error: response.status === "rejected",
        items: response.status === "fulfilled" ? response.value.items.map(item => ({
          id: item.id,
          type: category.type,
          label: item[category.labelKey] || item.number || item.reference || "Untitled",
          sub: category.subKeys.map(key => item[key]).find(Boolean) || "",
          path: category.path(item.id),
          icon: category.icon,
        })) : [],
      });
    });
  }
  return groups;
}