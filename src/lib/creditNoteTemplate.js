import { base44 } from "@/api/base44Client";

// Credit-note template resolution.
//
// A template explicitly configured for credit notes wins. When no credit-note
// template is configured, the default invoice template supplies the branding —
// the templates' stored records are never modified by this.
const hasType = (t, type) => (t?.document_types || []).includes(type);

export const isRealTemplate = (t) => !(t?.name || "").startsWith("__");

export function pickCreditNoteTemplate(templates = []) {
  const list = (templates || []).filter(isRealTemplate);
  return (
    list.find((t) => t.is_default && hasType(t, "credit_note")) ||
    list.find((t) => hasType(t, "credit_note")) ||
    list.find((t) => t.is_default && hasType(t, "invoice")) ||
    list.find((t) => hasType(t, "invoice")) ||
    list[0] ||
    {}
  );
}

/** Title for the credit note's status: Draft → draft title, otherwise the approved title. */
export function creditNoteTitle(template, status) {
  const t = template || {};
  const draft = (status || "Draft") === "Draft";
  return (draft ? t.credit_note_title_draft || t.credit_note_title : t.credit_note_title) || "Credit Note";
}

/** Real templates only — the "__" prefixed setting records are never offered. */
export async function loadCreditNoteTemplates() {
  const list = await base44.entities.DocumentTemplate.list("-created_date", 100).catch(() => []);
  return (list || []).filter(isRealTemplate);
}