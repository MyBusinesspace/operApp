import { base44 } from "@/api/base44Client";

/**
 * Automatically updates a contact's type based on the document being saved.
 * - Quote/Invoice → "Customer" (or "Both" if already "Provider")
 * - Bill → "Provider" (or "Both" if already "Customer")
 *
 * @param {string} contactId - The contact ID linked to the document
 * @param {"customer"|"provider"} role - Which role this document implies
 */
export async function syncContactType(contactId, role) {
  if (!contactId) return;
  try {
    const contact = await base44.entities.Contact.get(contactId);
    if (!contact) return;

    let newType = contact.type;
    if (role === "customer") {
      if (newType === "Contact" || newType === "Provider") {
        newType = newType === "Provider" ? "Both" : "Customer";
      }
    } else if (role === "provider") {
      if (newType === "Contact" || newType === "Customer") {
        newType = newType === "Customer" ? "Both" : "Provider";
      }
    }

    if (newType !== contact.type) {
      await base44.entities.Contact.update(contactId, { type: newType });
    }
  } catch {
    // Non-critical — don't block document save
  }
}