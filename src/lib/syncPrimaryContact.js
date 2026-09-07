import { base44 } from "@/api/base44Client";

/**
 * Keeps a single primary ContactPerson record in sync with the Contact form's
 * "Primary Contact Person / Primary Phone / Primary Email" fields.
 * - Finds an existing ContactPerson marked is_primary for this contact.
 * - Updates it if found, otherwise creates one (only when a name is provided).
 *
 * @param {string} contactId  the Contact id
 * @param {{ full_name?: string, phone?: string, email?: string }} fields
 */
export async function syncPrimaryContactPerson(contactId, { full_name, phone, email } = {}) {
  if (!contactId) return;
  const name = (full_name || "").trim();
  const ph = (phone || "").trim();
  const em = (email || "").trim();

  let existing = null;
  try {
    const list = await base44.entities.ContactPerson.filter(
      { contact_id: contactId, is_primary: true },
      "-created_date",
      50
    );
    existing = (list && list[0]) || null;
  } catch {
    existing = null;
  }

  if (existing) {
    await base44.entities.ContactPerson.update(existing.id, {
      full_name: name || existing.full_name,
      phone: ph || undefined,
      email: em || undefined,
      is_primary: true,
    });
  } else if (name) {
    await base44.entities.ContactPerson.create({
      contact_id: contactId,
      full_name: name,
      phone: ph || undefined,
      email: em || undefined,
      is_primary: true,
    });
  }
}