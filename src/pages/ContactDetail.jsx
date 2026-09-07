import React, { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { motion } from "framer-motion";
import {
  ArrowLeft, Mail, Phone, Globe, MapPin, Building2,
  Pencil, Users, FileText, ShoppingCart, TrendingUp,
  TrendingDown, FolderKanban, ClipboardList, CheckSquare,
  Hash, Paperclip, Clock, Package, Search, ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import ContactFormModal from "@/components/contacts/ContactFormModal";
import ContactHistory from "@/components/contacts/ContactHistory";
import SharedFilesPanel from "@/components/shared/SharedFilesPanel";
import ContactPersonPanel from "@/components/contacts/ContactPersonPanel";
import { syncPrimaryContactPerson } from "@/lib/syncPrimaryContact";
import { computeChanges } from "@/lib/changeLog";

const TYPE_STYLES = {
  Customer: "bg-blue-100 text-blue-700",
  Provider: "bg-violet-100 text-violet-700",
  Both: "bg-emerald-100 text-emerald-700",
  Contact: "bg-slate-100 text-slate-600",
};

function initials(name) {
  return (name || "?").split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
}
function avatarColor(str) {
  const palette = ["bg-indigo-400","bg-sky-400","bg-emerald-400","bg-amber-400","bg-rose-400","bg-purple-400","bg-teal-400"];
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = (h * 31 + str.charCodeAt(i)) % palette.length;
  return palette[h];
}

const TABS = [
  { id: "all", label: "All" },
  { id: "contact_persons", label: "Contact Persons" },
  { id: "quotes", label: "Quotes" },
  { id: "invoices", label: "Invoices" },
  { id: "bills", label: "Bills" },
  { id: "money_sent", label: "Money Sent" },
  { id: "money_received", label: "Money Received" },
  { id: "projects", label: "Projects" },
  { id: "work_orders", label: "Work Orders" },
  { id: "tasks", label: "Tasks" },
  { id: "assets", label: "Assets" },
  { id: "history", label: "History & Notes" },
  { id: "files", label: "Files" },
];

function EmptySection({ label, icon: IconComp }) {
  return (
    <div className="py-10 text-center">
      {IconComp && <IconComp className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />}
      <p className="text-sm text-muted-foreground">No {label.toLowerCase()} found for this company.</p>
    </div>
  );
}

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contact, setContact] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [editModal, setEditModal] = useState(false);

  // Related data
  const [quotes, setQuotes] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [bills, setBills] = useState([]);
  const [moneySent, setMoneySent] = useState([]);
  const [moneyReceived, setMoneyReceived] = useState([]);
  const [projects, setProjects] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [assets, setAssets] = useState([]);
  const [notes, setNotes] = useState([]);
  const [contactFiles, setContactFiles] = useState([]);
  const [contactPersons, setContactPersons] = useState([]);

  const load = async () => {
    setLoading(true);
    const [c, g] = await Promise.all([
      base44.entities.Contact.filter({ id }),
      base44.entities.ContactGroup.list("name", 200),
    ]);
    const found = Array.isArray(c) ? c[0] : c;
    setContact(found || null);
    setGroups(g);

    // Load related entities in parallel - gracefully handle missing entities
    try {
      const results = await Promise.allSettled([
        base44.entities.Invoice?.filter({ contact_id: id }) || Promise.resolve([]),
        base44.entities.Bill?.filter({ contact_id: id }) || Promise.resolve([]),
        base44.entities.Payment?.filter({ contact_id: id, direction: "sent" }) || Promise.resolve([]),
        base44.entities.Payment?.filter({ contact_id: id, direction: "received" }) || Promise.resolve([]),
        base44.entities.Project?.filter({ contact_id: id }) || Promise.resolve([]),
        base44.entities.WorkOrder?.filter({ contact_id: id }) || Promise.resolve([]),
        base44.entities.Task?.filter({ contact_id: id }) || Promise.resolve([]),
        base44.entities.Asset?.filter({ contact_id: id }) || Promise.resolve([]),
        base44.entities.Quote?.filter({ contact_id: id }) || Promise.resolve([]),
      ]);
      setQuotes(results[8].status === "fulfilled" ? results[8].value || [] : []);
      setInvoices(results[0].status === "fulfilled" ? results[0].value || [] : []);
      setBills(results[1].status === "fulfilled" ? results[1].value || [] : []);
      setMoneySent(results[2].status === "fulfilled" ? results[2].value || [] : []);
      setMoneyReceived(results[3].status === "fulfilled" ? results[3].value || [] : []);
      setProjects(results[4].status === "fulfilled" ? results[4].value || [] : []);
      setWorkOrders(results[5].status === "fulfilled" ? results[5].value || [] : []);
      setTasks(results[6].status === "fulfilled" ? results[6].value || [] : []);
      setAssets(results[7].status === "fulfilled" ? results[7].value || [] : []);
    } catch (_) {}

    // Notes, Files & Contact Persons
    const [n, f, cp] = await Promise.all([
      base44.entities.ContactNote.filter({ contact_id: id }),
      base44.entities.SharedFile.filter({ contact_id: id }),
      base44.entities.ContactPerson.filter({ contact_id: id }),
    ]);
    setNotes(n || []);
    setContactFiles(f || []);
    setContactPersons(cp || []);

    setLoading(false);
  };

  useEffect(() => { load(); }, [id]);

  // Hide empty tabs — fall back to "All" when the active tab becomes empty
  useEffect(() => {
    const counts = {
      all: quotes.length + invoices.length + bills.length + moneySent.length + moneyReceived.length + projects.length + workOrders.length + tasks.length + assets.length,
      contact_persons: contactPersons.length,
      quotes: quotes.length,
      invoices: invoices.length,
      bills: bills.length,
      money_sent: moneySent.length,
      money_received: moneyReceived.length,
      projects: projects.length,
      work_orders: workOrders.length,
      tasks: tasks.length,
      assets: assets.length,
      history: notes.length,
      files: contactFiles.length,
    };
    const visible = TABS.filter(t => t.id === "all" || (counts[t.id] ?? 0) > 0);
    if (!visible.find(t => t.id === tab)) setTab("all");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, quotes.length, invoices.length, bills.length, moneySent.length, moneyReceived.length, projects.length, workOrders.length, tasks.length, assets.length, contactPersons.length, notes.length, contactFiles.length]);

  const handleSave = async (form) => {
    const changes = computeChanges(contact, form, [
      ["full_name", "Name"], ["company", "Nickname"], ["email", "Email"],
      ["phone", "Phone"], ["type", "Type"], ["status", "Status"],
      ["group_id", "Group"], ["address", "Address"], ["city", "City"],
      ["country", "Country"], ["tax_id", "Tax ID"], ["website", "Website"],
      ["maps_link", "Maps Link"], ["contact_person", "Contact Person"],
      ["contact_phone", "Contact Phone"], ["contact_email", "Contact Email"],
    ]);

    await base44.entities.Contact.update(id, form);
    if (changes.length > 0) {
      try {
        await base44.entities.ContactNote.create({
          contact_id: id,
          action: "Update",
          note: changes.join(" · "),
        });
      } catch (e) { console.error("Failed to log history", e); }
    }
    await syncPrimaryContactPerson(id, {
      full_name: form.contact_person,
      phone: form.phone,
      email: form.email,
    });
    setEditModal(false);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading company...
      </div>
    );
  }

  if (!contact) {
    return (
      <div className="text-center py-20">
        <p className="text-muted-foreground">Company not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/contacts")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Companies
        </Button>
      </div>
    );
  }

  const group = groups.find(g => g.id === contact.group_id);

  // Summary counts for "All" tab
  const allItems = [
    ...quotes.map(q => ({ ...q, _section: "Quote" })),
    ...invoices.map(i => ({ ...i, _section: "Invoice" })),
    ...bills.map(b => ({ ...b, _section: "Bill" })),
    ...moneySent.map(m => ({ ...m, _section: "Money Sent" })),
    ...moneyReceived.map(m => ({ ...m, _section: "Money Received" })),
    ...projects.map(p => ({ ...p, _section: "Project" })),
    ...workOrders.map(w => ({ ...w, _section: "Work Order" })),
    ...tasks.map(t => ({ ...t, _section: "Task" })),
    ...assets.map(a => ({ ...a, _section: "Asset" })),
  ];

  const tabCounts = {
    all: allItems.length,
    contact_persons: contactPersons.length,
    quotes: quotes.length,
    invoices: invoices.length,
    bills: bills.length,
    money_sent: moneySent.length,
    money_received: moneyReceived.length,
    projects: projects.length,
    work_orders: workOrders.length,
    tasks: tasks.length,
    assets: assets.length,
    history: notes.length,
    files: contactFiles.length,
  };

  const visibleTabs = TABS.filter(t => t.id === "all" || (tabCounts[t.id] ?? 0) > 0);

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link to="/contacts" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Companies
      </Link>

      {/* Contact Header Card */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-card rounded-2xl border border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <Avatar className="w-16 h-16 shrink-0 text-lg font-bold">
            {contact.avatar_url
              ? <img src={contact.avatar_url} alt={contact.company || contact.full_name} className="object-cover" />
              : <AvatarFallback className={`${avatarColor(contact.company || contact.full_name)} text-white font-bold text-xl`}>
                  {initials(contact.company || contact.full_name)}
                </AvatarFallback>
            }
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <h1 className="text-2xl font-bold text-foreground">{contact.company || contact.full_name}</h1>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${TYPE_STYLES[contact.type] || TYPE_STYLES.Contact}`}>
                {contact.type || "Contact"}
              </span>
              {group && (
                <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border"
                  style={{ color: group.color, borderColor: group.color + "50", backgroundColor: group.color + "15" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: group.color }} />
                  {group.name}
                </span>
              )}
            </div>

            {/* Contact details row */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground mt-2">
              {contact.company && contact.full_name && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 shrink-0" /> {contact.full_name}
                </span>
              )}
              {contact.email && (
                <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                  <Mail className="w-3.5 h-3.5 shrink-0" /> {contact.email}
                </a>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1.5 hover:text-primary transition-colors">
                  <Phone className="w-3.5 h-3.5 shrink-0" /> {contact.phone}
                </a>
              )}
              {contact.website && (
                <a href={contact.website} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                  <Globe className="w-3.5 h-3.5 shrink-0" /> {contact.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {(contact.city || contact.country) && (
                contact.maps_link ? (
                  <a href={contact.maps_link} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-primary transition-colors">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {[contact.address, contact.city, contact.country].filter(Boolean).join(", ")}
                  </a>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {[contact.address, contact.city, contact.country].filter(Boolean).join(", ")}
                  </span>
                )
              )}
              {contact.tax_id && (
                <span className="flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5 shrink-0" /> {contact.tax_id}
                </span>
              )}
            </div>

            {contact.notes && (
              <p className="mt-2 text-sm text-muted-foreground italic border-l-2 border-border pl-3">{contact.notes}</p>
            )}
          </div>

          <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={() => setEditModal(true)}>
            <Pencil className="w-3.5 h-3.5" /> Edit
          </Button>
        </div>

        {/* Map embed */}
        {contact.maps_link && (() => {
          // Extract coords from Google Maps URL or use embed
          const url = contact.maps_link;
          // Try to extract lat/lng from URL (formats: @lat,lng or q=lat,lng or place/...)
          const coordMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/) || url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
          let embedSrc;
          if (coordMatch) {
            const lat = coordMatch[1], lng = coordMatch[2];
            embedSrc = `https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`;
          } else {
            // Try to extract place name or use the link as a search
            const placeMatch = url.match(/place\/([^/]+)/);
            const query = placeMatch ? decodeURIComponent(placeMatch[1].replace(/\+/g, " ")) : url;
            embedSrc = `https://maps.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
          }
          return (
            <div className="mt-4 rounded-xl overflow-hidden border border-border" style={{ height: 200 }}>
              <div className="relative w-full h-full">
                <iframe
                  src={embedSrc}
                  width="100%" height="200"
                  style={{ border: 0 }}
                  allowFullScreen loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="Company Location"
                />
                <a href={url} target="_blank" rel="noreferrer"
                  className="absolute top-2 right-2 flex items-center gap-1 text-xs bg-white/90 hover:bg-white text-foreground px-2 py-1 rounded-lg shadow-sm border border-border transition-colors">
                  <ExternalLink className="w-3 h-3" /> Open in Maps
                </a>
              </div>
            </div>
          );
        })()}
      </motion.div>

      {/* Summary stats */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.08 }}
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        {[
          { label: "Invoices", count: invoices.length, icon: FileText, color: "text-blue-600" },
          { label: "Bills", count: bills.length, icon: ShoppingCart, color: "text-violet-600" },
          { label: "Sent", count: moneySent.length, icon: TrendingDown, color: "text-rose-600" },
          { label: "Received", count: moneyReceived.length, icon: TrendingUp, color: "text-emerald-600" },
          { label: "Projects", count: projects.length, icon: FolderKanban, color: "text-amber-600" },
          { label: "Work Orders", count: workOrders.length, icon: ClipboardList, color: "text-orange-600" },
          { label: "Tasks", count: tasks.length, icon: CheckSquare, color: "text-indigo-600" },
          { label: "Assets", count: assets.length, icon: Package, color: "text-cyan-600" },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-3 text-center">
            <s.icon className={`w-4 h-4 mx-auto mb-1 ${s.color}`} />
            <div className={`text-xl font-bold ${s.color}`}>{s.count}</div>
            <div className="text-xs text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </motion.div>

      {/* Tabs + Content */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
        className="bg-card rounded-2xl border border-border overflow-hidden">

        {/* Tab bar */}
        <div className="border-b border-border overflow-x-auto">
          <div className="flex min-w-max">
            {visibleTabs.map(t => (
              <button key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}>
                {t.label}
                {tabCounts[t.id] > 0 && (
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    tab === t.id ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {tabCounts[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="p-4">
          {tab === "history" ? (
            <ContactHistory contactId={id} notes={notes} onRefresh={load} />
          ) : tab === "files" ? (
            <SharedFilesPanel context={{ contact_id: id, contact_name: contact.company || contact.full_name }} files={contactFiles} onRefresh={load} />
          ) : tab === "contact_persons" ? (
            <ContactPersonPanel context={{ contact_id: id, contact_name: contact.company || contact.full_name }} />
          ) : (
            <TabContent
              tab={tab}
              allItems={allItems}
              quotes={quotes}
              invoices={invoices} bills={bills}
              moneySent={moneySent} moneyReceived={moneyReceived}
              projects={projects} workOrders={workOrders}
              tasks={tasks} assets={assets}
            />
          )}
        </div>
      </motion.div>

      <ContactFormModal
        open={editModal}
        onClose={() => setEditModal(false)}
        onSave={handleSave}
        contact={contact}
        groups={groups}
      />
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d) { return d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"; }
function fmtAmt(n, cur) { return n != null ? `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${cur ? " " + cur : ""}` : "—"; }

const STATUS_PILL = {
  Draft: "bg-slate-100 text-slate-600",
  Sent: "bg-blue-50 text-blue-600",
  Paid: "bg-emerald-50 text-emerald-700",
  Accepted: "bg-emerald-50 text-emerald-700",
  Overdue: "bg-red-50 text-red-600",
  Cancelled: "bg-slate-100 text-slate-400",
  Invoiced: "bg-violet-50 text-violet-700",
  Declined: "bg-red-50 text-red-600",
  Active: "bg-emerald-50 text-emerald-700",
  "On Hold": "bg-amber-50 text-amber-700",
  Archived: "bg-slate-100 text-slate-400",
  Completed: "bg-emerald-50 text-emerald-700",
  Available: "bg-emerald-50 text-emerald-700",
  "In Use": "bg-blue-50 text-blue-600",
  Pending: "bg-amber-50 text-amber-700",
  "In Progress": "bg-blue-50 text-blue-600",
};

function StatusPill({ status }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_PILL[status] || "bg-slate-100 text-slate-600"}`}>
      {status || "—"}
    </span>
  );
}

function TH({ children, right }) {
  return <th className={`px-3 py-2.5 text-xs font-medium text-muted-foreground ${right ? "text-right" : "text-left"}`}>{children}</th>;
}
function TD({ children, right, muted, mono }) {
  return (
    <td className={`px-3 py-3 text-sm ${right ? "text-right" : ""} ${muted ? "text-muted-foreground" : "text-foreground"} ${mono ? "font-mono text-xs" : ""}`}>
      {children}
    </td>
  );
}

// ── Per-section tables ────────────────────────────────────────────────────────
// ── Unified columns: Reference | Name | Type | Date | End Date | Amount | Status
// Each entity maps its fields into these universal columns.
function normalizeRow(r, section) {
  switch (section) {
    case "Invoice":
      return { ref: r.number, refLink: "/sales/invoices", name: r.reference, type: null, date: fmtDate(r.issue_date), endDate: fmtDate(r.due_date), amount: fmtAmt(r.total, r.currency), status: r.status };
    case "Quote":
      return { ref: r.number, refLink: "/sales/quotes", name: r.reference, type: null, date: fmtDate(r.issue_date), endDate: fmtDate(r.expiry_date), amount: fmtAmt(r.total, r.currency), status: r.status };
    case "Bill":
      return { ref: r.number, refLink: null, name: r.reference, type: null, date: fmtDate(r.issue_date), endDate: fmtDate(r.due_date), amount: fmtAmt(r.total, r.currency), status: r.status };
    case "Project":
      return { ref: r.reference || r.name, refLink: `/projects/${r.id}`, name: r.reference ? r.name : null, type: r.type, date: fmtDate(r.start_date), endDate: fmtDate(r.end_date), amount: null, status: r.status };
    case "Work Order":
      return { ref: r.reference || r.title, refLink: `/work-orders/${r.id}`, name: r.reference ? r.title : null, type: r.type, date: fmtDate(r.scheduled_date), endDate: fmtDate(r.due_date), amount: null, status: r.status };
    case "Task":
      return { ref: r.reference || r.title, refLink: `/tasks/${r.id}`, name: r.reference ? r.title : r.category, type: r.priority, date: fmtDate(r.planning_date), endDate: null, amount: null, status: r.status };
    case "Asset":
      return { ref: r.reference || r.name, refLink: `/assets/${r.id}`, name: r.reference ? r.name : null, type: r.category, date: null, endDate: null, amount: null, status: r.status };
    case "Payment":
      return { ref: r.reference || r.number, refLink: null, name: null, type: null, date: fmtDate(r.date || r.issue_date), endDate: null, amount: fmtAmt(r.amount || r.total, r.currency), status: r.status };
    default:
      return { ref: "—", refLink: null, name: null, type: null, date: null, endDate: null, amount: null, status: r.status };
  }
}

const UNIFIED_HEADER = (
  <thead>
    <tr className="border-b border-border">
      <TH>Reference</TH>
      <TH>Name</TH>
      <TH>Type</TH>
      <TH>Date</TH>
      <TH>End Date</TH>
      <TH right>Amount</TH>
      <TH>Status</TH>
    </tr>
  </thead>
);

function UnifiedRows({ rows, section }) {
  return rows.map(r => {
    const n = normalizeRow(r, section);
    return (
      <tr key={r.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
        <TD>
          {n.refLink
            ? <Link to={n.refLink} className="font-medium text-primary hover:underline">{n.ref || "—"}</Link>
            : <span className="font-medium">{n.ref || "—"}</span>}
        </TD>
        <TD muted>{n.name || "—"}</TD>
        <TD muted>{n.type || "—"}</TD>
        <TD muted>{n.date || "—"}</TD>
        <TD muted>{n.endDate || "—"}</TD>
        <TD right>{n.amount || "—"}</TD>
        <TD><StatusPill status={n.status} /></TD>
      </tr>
    );
  });
}

function UnifiedTable({ rows, section }) {
  return (
    <table className="w-full text-sm">
      {UNIFIED_HEADER}
      <tbody><UnifiedRows rows={rows} section={section} /></tbody>
    </table>
  );
}

// Aliases so SectionView dispatch still works
const QuotesTable = ({ rows }) => <UnifiedTable rows={rows} section="Quote" />;
const InvoicesTable = ({ rows }) => <UnifiedTable rows={rows} section="Invoice" />;
const BillsTable = ({ rows }) => <UnifiedTable rows={rows} section="Bill" />;
const ProjectsTable = ({ rows }) => <UnifiedTable rows={rows} section="Project" />;
const WorkOrdersTable = ({ rows }) => <UnifiedTable rows={rows} section="Work Order" />;
const TasksTable = ({ rows }) => <UnifiedTable rows={rows} section="Task" />;
const AssetsTable = ({ rows }) => <UnifiedTable rows={rows} section="Asset" />;
const PaymentsTable = ({ rows }) => <UnifiedTable rows={rows} section="Payment" />;

// ── Search + table wrapper ────────────────────────────────────────────────────
function SectionView({ rows, section, emptyLabel, emptyIcon: Icon }) {
  const [search, setSearch] = useState("");

  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    if (!q) return true;
    return Object.values(r).some(v => v && String(v).toLowerCase().includes(q));
  });

  const TableComp = {
    Quote: QuotesTable,
    Invoice: InvoicesTable,
    Bill: BillsTable,
    Project: ProjectsTable,
    "Work Order": WorkOrdersTable,
    Task: TasksTable,
    Asset: AssetsTable,
    Payment: PaymentsTable,
  }[section] || (() => null);

  if (rows.length === 0) {
    return (
      <div className="py-10 text-center">
        {Icon && <Icon className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />}
        <p className="text-sm text-muted-foreground">No {emptyLabel.toLowerCase()} found for this company.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 bg-muted/40 border-border/60 text-sm"
          placeholder={`Search ${emptyLabel.toLowerCase()}...`}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      <div className="overflow-x-auto">
        {filtered.length === 0
          ? <p className="text-sm text-muted-foreground py-6 text-center">No results match your search.</p>
          : <TableComp rows={filtered} />
        }
      </div>
    </div>
  );
}

// ── All tab — flat list with section labels stripped, just rows ───────────────
function AllTabView({ allItems }) {
  const [search, setSearch] = useState("");

  const filtered = allItems.filter(r => {
    const q = search.toLowerCase();
    if (!q) return true;
    return Object.values(r).some(v => v && String(v).toLowerCase().includes(q));
  });

  const sections = [...new Set(filtered.map(i => i._section))];

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-9 bg-muted/40 border-border/60 text-sm"
          placeholder="Search all activity..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No results match your search.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            {UNIFIED_HEADER}
            <tbody>
              {sections.map(section => {
                const sectionRows = filtered.filter(i => i._section === section);
                return <UnifiedRows key={section} rows={sectionRows} section={section} />;
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Tab content dispatcher ────────────────────────────────────────────────────
function TabContent({ tab, allItems, quotes, invoices, bills, moneySent, moneyReceived, projects, workOrders, tasks, assets }) {
  if (tab === "all") return <AllTabView allItems={allItems} />;
  if (tab === "quotes") return <SectionView rows={quotes} section="Quote" emptyLabel="Quotes" emptyIcon={FileText} />;
  if (tab === "invoices") return <SectionView rows={invoices} section="Invoice" emptyLabel="Invoices" emptyIcon={FileText} />;
  if (tab === "bills") return <SectionView rows={bills} section="Bill" emptyLabel="Bills" emptyIcon={ShoppingCart} />;
  if (tab === "money_sent") return <SectionView rows={moneySent} section="Payment" emptyLabel="Money Sent" emptyIcon={TrendingDown} />;
  if (tab === "money_received") return <SectionView rows={moneyReceived} section="Payment" emptyLabel="Money Received" emptyIcon={TrendingUp} />;
  if (tab === "projects") return <SectionView rows={projects} section="Project" emptyLabel="Projects" emptyIcon={FolderKanban} />;
  if (tab === "work_orders") return <SectionView rows={workOrders} section="Work Order" emptyLabel="Work Orders" emptyIcon={ClipboardList} />;
  if (tab === "tasks") return <SectionView rows={tasks} section="Task" emptyLabel="Tasks" emptyIcon={CheckSquare} />;
  if (tab === "assets") return <SectionView rows={assets} section="Asset" emptyLabel="Assets" emptyIcon={Package} />;
  return null;
}