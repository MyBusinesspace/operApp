import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { withRetry, batchedAll } from "@/lib/apiHelpers";
import {
  Building2, Users, Briefcase, Package, FileText, ChevronRight, Settings
} from "lucide-react";
import {
  DarkHeader, DarkHero, Metric, StatusRow, DarkSection, DarkQuickLink, DarkLoading
} from "@/components/shared/DarkOverview";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BusinessOverview() {
  const [contacts, setContacts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [assets, setAssets] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [c, p, a, q] = await batchedAll([
        () => withRetry(() => base44.entities.Contact.list("full_name", 500)),
        () => withRetry(() => base44.entities.Project.list("-created_date", 500)),
        () => withRetry(() => base44.entities.Asset.list("-created_date", 500)),
        () => withRetry(() => base44.entities.Quote.list("-created_date", 500)),
      ], 2);
      setContacts(Array.isArray(c) ? c : []);
      setProjects(Array.isArray(p) ? p : []);
      setAssets(Array.isArray(a) ? a : []);
      setQuotes(Array.isArray(q) ? q : []);
      setLoading(false);
    };
    load();
  }, []);

  const contactGroups = useMemo(() => {
    const groups = { Customer: { count: 0, active: 0 }, Provider: { count: 0, active: 0 }, Both: { count: 0, active: 0 }, Contact: { count: 0, active: 0 } };
    for (const c of contacts) {
      const type = c.type || "Contact";
      if (groups[type]) {
        groups[type].count++;
        if (c.status === "Active") groups[type].active++;
      }
    }
    return groups;
  }, [contacts]);

  const projectGroups = useMemo(() => {
    const groups = { Active: 0, "On Hold": 0, Completed: 0, Draft: 0 };
    for (const p of projects) {
      if (groups[p.status] !== undefined) groups[p.status]++;
    }
    return groups;
  }, [projects]);

  const assetGroups = useMemo(() => {
    const groups = { Available: 0, "In Use": 0, "Under Maintenance": 0, Retired: 0 };
    for (const a of assets) {
      if (groups[a.status] !== undefined) groups[a.status]++;
    }
    return groups;
  }, [assets]);

  const quoteGroups = useMemo(() => {
    const groups = { Draft: 0, Sent: 0, Accepted: 0, Declined: 0, Invoiced: 0 };
    for (const q of quotes) {
      if (groups[q.status] !== undefined) groups[q.status]++;
    }
    return groups;
  }, [quotes]);

  const activeProjects = projects.filter(p => p.status === "Active");
  const recentContacts = contacts.slice(0, 5);

  if (loading) return <DarkLoading />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DarkHeader sectionLabel="Business" createTo="/contacts" />

      <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
        <DarkHero
          title="Business overview"
          subtitle="Track your customers, ongoing projects and equipment fleet — all from a single, unified workspace."
        />

        {/* Top metrics */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
          <Metric icon={Users} iconColor="text-indigo-400" label="Contacts" value={contacts.length} />
          <Metric icon={Briefcase} iconColor="text-emerald-400" label="Projects" value={projects.length} />
          <Metric icon={Package} iconColor="text-amber-400" label="Assets" value={assets.length} />
          <Metric icon={FileText} iconColor="text-rose-400" label="Quotes" value={quotes.length} />
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <DarkSection title="Contacts" icon={Users} iconColor="text-indigo-400" seeAllTo="/contacts">
              <StatusRow title="Customers" count={contactGroups.Customer.count} amount={`${contactGroups.Customer.active} active`} />
              <StatusRow title="Providers" count={contactGroups.Provider.count} amount={`${contactGroups.Provider.active} active`} />
              <StatusRow title="Both" count={contactGroups.Both.count} amount={`${contactGroups.Both.active} active`} />
              <StatusRow title="Contacts" count={contactGroups.Contact.count} amount={`${contactGroups.Contact.active} active`} />
            </DarkSection>

            <DarkSection title="Assets" icon={Package} iconColor="text-amber-400" seeAllTo="/assets">
              <StatusRow title="Available" count={assetGroups.Available} />
              <StatusRow title="In Use" count={assetGroups["In Use"]} />
              <StatusRow title="Under Maintenance" count={assetGroups["Under Maintenance"]} />
              <StatusRow title="Retired" count={assetGroups.Retired} />
            </DarkSection>
          </div>

          <div className="space-y-6">
            <DarkSection title="Projects" icon={Briefcase} iconColor="text-emerald-400" seeAllTo="/projects">
              <StatusRow title="Active" count={projectGroups.Active} accentColor="text-emerald-400" />
              <StatusRow title="On Hold" count={projectGroups["On Hold"]} accentColor="text-amber-400" />
              <StatusRow title="Completed" count={projectGroups.Completed} accentColor="text-zinc-400" />
              <StatusRow title="Draft" count={projectGroups.Draft} accentColor="text-zinc-500" />
            </DarkSection>

            <DarkSection title="Quotes" icon={FileText} iconColor="text-rose-400" seeAllTo="/sales/quotes">
              <StatusRow title="Draft" count={quoteGroups.Draft} />
              <StatusRow title="Sent" count={quoteGroups.Sent} />
              <StatusRow title="Accepted" count={quoteGroups.Accepted} accentColor="text-emerald-400" />
              <StatusRow title="Invoiced" count={quoteGroups.Invoiced} />
            </DarkSection>
          </div>
        </div>

        {/* Active Projects */}
        {activeProjects.length > 0 && (
          <DarkSection title="Active projects" icon={Briefcase} iconColor="text-emerald-400" seeAllTo="/projects">
            <div className="divide-y divide-border">
              {activeProjects.slice(0, 6).map(p => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div className="flex-1 min-z-0">
                    <Link to={`/projects/${p.id}`} className="text-sm font-medium text-foreground hover:text-emerald-400 transition-colors truncate block">
                      {p.name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.contact_name || "—"} {p.type ? `· ${p.type}` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground tabular-nums ml-4">
                    {p.budget ? `${fmt(p.budget)} ${p.currency || "USD"}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          </DarkSection>
        )}

        {/* Recent Contacts */}
        <DarkSection title="Recent contacts" icon={Users} iconColor="text-indigo-400" seeAllTo="/contacts">
          {recentContacts.length === 0 ? (
            <p className="text-sm text-zinc-600 py-6 text-center">No contacts yet.</p>
          ) : (
            <div className="divide-y divide-border">
              {recentContacts.map(c => (
                <div key={c.id} className="flex items-center justify-between py-3">
                  <div className="flex-1 min-w-0">
                    <Link to={`/contacts/${c.id}`} className="text-sm font-medium text-foreground hover:text-indigo-400 transition-colors">
                      {c.full_name}
                    </Link>
                    <p className="text-xs text-muted-foreground mt-0.5">{c.email || "—"}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-xs text-muted-foreground">{c.type || "Contact"}</span>
                    <span className={`text-xs font-medium ${
                      c.status === "Active" ? "text-emerald-400" :
                      c.status === "Inactive" ? "text-zinc-500" : "text-zinc-600"
                    }`}>{c.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DarkSection>

        {/* Quick Links */}
        <div>
          <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">Quick access</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <DarkQuickLink to="/contacts" icon={Users} iconColor="text-indigo-400" label="Contacts" subtitle={`${contacts.length} total`} />
            <DarkQuickLink to="/projects" icon={Briefcase} iconColor="text-emerald-400" label="Projects" subtitle={`${projects.length} total`} />
            <DarkQuickLink to="/assets" icon={Package} iconColor="text-amber-400" label="Assets" subtitle={`${assets.length} items`} />
            <DarkQuickLink to="/settings/business" icon={Settings} iconColor="text-zinc-400" label="Settings" subtitle="Configuration" />
          </div>
        </div>
      </div>
    </div>
  );
}