import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const results = {
      contacts_scanned: 0,
      contact_persons_migrated: 0,
      projects_scanned: 0,
      project_persons_migrated: 0,
    };

    // 1. Migrate Contact.contact_persons array → standalone ContactPerson records
    const allContacts = await base44.asServiceRole.entities.Contact.list("-created_date", 100000);
    results.contacts_scanned = allContacts.length;

    const contactPersonsToCreate = [];
    for (const contact of allContacts) {
      const persons = contact.contact_persons;
      if (!Array.isArray(persons) || persons.length === 0) continue;
      for (const p of persons) {
        if (!p.name && !p.email && !p.phone) continue;
        contactPersonsToCreate.push({
          full_name: p.name || "Unnamed",
          role: p.role || "",
          email: p.email || "",
          phone: p.phone || "",
          contact_id: contact.id,
          contact_name: contact.company || contact.full_name || "",
        });
      }
    }
    if (contactPersonsToCreate.length > 0) {
      const created = await base44.asServiceRole.entities.ContactPerson.bulkCreate(contactPersonsToCreate);
      results.contact_persons_migrated = Array.isArray(created) ? created.length : 0;
    }

    // 2. Migrate Project.contact_persons array → standalone ContactPerson records
    const allProjects = await base44.asServiceRole.entities.Project.list("-created_date", 100000);
    results.projects_scanned = allProjects.length;

    const projectPersonsToCreate = [];
    for (const project of allProjects) {
      const persons = project.contact_persons;
      if (!Array.isArray(persons) || persons.length === 0) continue;
      for (const p of persons) {
        if (!p.name && !p.phone) continue;
        projectPersonsToCreate.push({
          full_name: p.name || "Unnamed",
          phone: p.phone || "",
          role: "",
          contact_id: project.contact_id || undefined,
          contact_name: project.contact_name || "",
          project_id: project.id,
          project_name: project.name || "",
        });
      }
    }
    if (projectPersonsToCreate.length > 0) {
      const created = await base44.asServiceRole.entities.ContactPerson.bulkCreate(projectPersonsToCreate);
      results.project_persons_migrated = Array.isArray(created) ? created.length : 0;
    }

    return Response.json({ status: "success", results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});