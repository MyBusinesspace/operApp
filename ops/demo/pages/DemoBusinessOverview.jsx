import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  ArrowUpRight,
  Briefcase,
  ChevronRight,
  Package,
  Settings,
  Users,
  FileText,
} from "lucide-react";
import {
  DarkHero,
  Metric,
  StatusRow,
  DarkSection,
} from "@/components/shared/DarkOverview";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

function fmt(n) {
  return (n || 0).toLocaleString("en-AE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function DemoQuickCard({ icon: Icon, iconColor, label, subtitle, to }) {
  const className =
    "group flex items-center gap-3 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors p-4";
  const body = (
    <>
      <Icon className={`w-5 h-5 ${iconColor}`} strokeWidth={1.5} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground group-hover:text-foreground/80 transition-colors">
          {subtitle}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
    </>
  );
  if (to) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <div className={`${className} cursor-default`} title="Demo — view only">
      {body}
    </div>
  );
}

export default function DemoBusinessOverview() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();

  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );

  const contacts = data?.contacts || [];
  const projects = data?.projects || [];
  const assets = data?.assets || [];
  const quotes = data?.quotes || [];

  const contactGroups = useMemo(() => {
    const list = data?.contacts || [];
    const groups = {
      Customer: { count: 0, active: 0 },
      Provider: { count: 0, active: 0 },
      Both: { count: 0, active: 0 },
      Contact: { count: 0, active: 0 },
    };
    for (const c of list) {
      const type = c.type || "Contact";
      if (groups[type]) {
        groups[type].count++;
        if (c.status === "Active") groups[type].active++;
      }
    }
    return groups;
  }, [data]);

  const projectGroups = useMemo(() => {
    const list = data?.projects || [];
    const groups = { Active: 0, "On Hold": 0, Completed: 0, Draft: 0 };
    for (const p of list) {
      if (groups[p.status] !== undefined) groups[p.status]++;
    }
    return groups;
  }, [data]);

  const assetGroups = useMemo(() => {
    const list = data?.assets || [];
    const groups = {
      Available: 0,
      "In Use": 0,
      "Under Maintenance": 0,
      Retired: 0,
    };
    for (const a of list) {
      if (groups[a.status] !== undefined) groups[a.status]++;
    }
    return groups;
  }, [data]);

  const quoteGroups = useMemo(() => {
    const list = data?.quotes || [];
    const groups = {
      Draft: 0,
      Sent: 0,
      Accepted: 0,
      Declined: 0,
      Invoiced: 0,
    };
    for (const q of list) {
      if (groups[q.status] !== undefined) groups[q.status]++;
    }
    return groups;
  }, [data]);

  if (!enabled) {
    return <Navigate to="/" replace />;
  }

  if (!industryId || !data) {
    return <Navigate to="/demo" replace />;
  }

  const activeProjects = projects.filter((p) => p.status === "Active");
  const recentContacts = contacts.slice(0, 5);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        <div className="demo-readonly">
          <div className="sticky top-[var(--nav-height)] z-10 bg-background/80 backdrop-blur-xl border-b border-border">
            <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[13px] text-muted-foreground font-medium tracking-tight">
                <Link
                  to="/demo/app"
                  className="hover:text-foreground transition-colors"
                >
                  Overview
                </Link>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="text-foreground">Business</span>
              </div>
              <Link
                to="/demo/app/contacts"
                className="flex items-center gap-1.5 text-xs text-primary-foreground bg-primary hover:bg-primary/90 transition-colors font-semibold px-3.5 py-1.5 rounded-lg"
              >
                Create <ArrowUpRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          <div className="max-w-[1200px] mx-auto px-6 py-10 space-y-10">
            <DarkHero
              title="Business overview"
              subtitle="Track your customers, ongoing projects and equipment fleet — all from a single, unified workspace."
            />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pb-8 border-b border-border">
              <Metric
                icon={Users}
                iconColor="text-indigo-400"
                label="Contacts"
                value={contacts.length}
              />
              <Metric
                icon={Briefcase}
                iconColor="text-emerald-400"
                label="Projects"
                value={projects.length}
              />
              <Metric
                icon={Package}
                iconColor="text-amber-400"
                label="Assets"
                value={assets.length}
              />
              <Metric
                icon={FileText}
                iconColor="text-rose-400"
                label="Quotes"
                value={quotes.length}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-6">
                <DarkSection
                  title="Contacts"
                  icon={Users}
                  iconColor="text-indigo-400"
                >
                  <StatusRow
                    title="Customers"
                    count={contactGroups.Customer.count}
                    amount={`${contactGroups.Customer.active} active`}
                  />
                  <StatusRow
                    title="Providers"
                    count={contactGroups.Provider.count}
                    amount={`${contactGroups.Provider.active} active`}
                  />
                  <StatusRow
                    title="Both"
                    count={contactGroups.Both.count}
                    amount={`${contactGroups.Both.active} active`}
                  />
                  <StatusRow
                    title="Contacts"
                    count={contactGroups.Contact.count}
                    amount={`${contactGroups.Contact.active} active`}
                  />
                </DarkSection>

                <DarkSection
                  title="Assets"
                  icon={Package}
                  iconColor="text-amber-400"
                >
                  <StatusRow title="Available" count={assetGroups.Available} />
                  <StatusRow title="In Use" count={assetGroups["In Use"]} />
                  <StatusRow
                    title="Under Maintenance"
                    count={assetGroups["Under Maintenance"]}
                  />
                  <StatusRow title="Retired" count={assetGroups.Retired} />
                </DarkSection>
              </div>

              <div className="space-y-6">
                <DarkSection
                  title="Projects"
                  icon={Briefcase}
                  iconColor="text-emerald-400"
                >
                  <StatusRow
                    title="Active"
                    count={projectGroups.Active}
                    accentColor="text-emerald-400"
                  />
                  <StatusRow
                    title="On Hold"
                    count={projectGroups["On Hold"]}
                    accentColor="text-amber-400"
                  />
                  <StatusRow
                    title="Completed"
                    count={projectGroups.Completed}
                    accentColor="text-zinc-400"
                  />
                  <StatusRow
                    title="Draft"
                    count={projectGroups.Draft}
                    accentColor="text-zinc-500"
                  />
                </DarkSection>

                <DarkSection
                  title="Quotes"
                  icon={FileText}
                  iconColor="text-rose-400"
                >
                  <StatusRow title="Draft" count={quoteGroups.Draft} />
                  <StatusRow title="Sent" count={quoteGroups.Sent} />
                  <StatusRow
                    title="Accepted"
                    count={quoteGroups.Accepted}
                    accentColor="text-emerald-400"
                  />
                  <StatusRow title="Invoiced" count={quoteGroups.Invoiced} />
                </DarkSection>
              </div>
            </div>

            {activeProjects.length > 0 && (
              <DarkSection
                title="Active projects"
                icon={Briefcase}
                iconColor="text-emerald-400"
              >
                <div className="divide-y divide-border">
                  {activeProjects.slice(0, 6).map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate block hover:text-emerald-400 transition-colors cursor-default">
                          {p.name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {p.contact_name || "—"}
                          {p.type ? ` · ${p.type}` : ""}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-muted-foreground tabular-nums ml-4">
                        {p.budget
                          ? `${fmt(p.budget)} ${p.currency || "USD"}`
                          : "—"}
                      </span>
                    </div>
                  ))}
                </div>
              </DarkSection>
            )}

            <DarkSection
              title="Recent contacts"
              icon={Users}
              iconColor="text-indigo-400"
            >
              {recentContacts.length === 0 ? (
                <p className="text-sm text-zinc-600 py-6 text-center">
                  No contacts yet.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {recentContacts.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground hover:text-indigo-400 transition-colors cursor-default">
                          {c.full_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.email || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span className="text-xs text-muted-foreground">
                          {c.type || "Contact"}
                        </span>
                        <span
                          className={`text-xs font-medium ${
                            c.status === "Active"
                              ? "text-emerald-400"
                              : c.status === "Inactive"
                                ? "text-zinc-500"
                                : "text-zinc-600"
                          }`}
                        >
                          {c.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DarkSection>

            <div>
              <h3 className="text-[15px] font-semibold text-foreground tracking-tight mb-4">
                Quick access
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <DemoQuickCard
                  icon={Users}
                  iconColor="text-indigo-400"
                  label="Contacts"
                  subtitle={`${contacts.length} total`}
                  to="/demo/app/contacts"
                />
                <DemoQuickCard
                  icon={Briefcase}
                  iconColor="text-emerald-400"
                  label="Projects"
                  subtitle={`${projects.length} total`}
                  to="/demo/app/projects"
                />
                <DemoQuickCard
                  icon={Package}
                  iconColor="text-amber-400"
                  label="Assets"
                  subtitle={`${assets.length} items`}
                  to="/demo/app/assets"
                />
                <DemoQuickCard
                  icon={Settings}
                  iconColor="text-zinc-400"
                  label="Settings"
                  subtitle="Configuration"
                  to="/demo/app/settings/business"
                />
              </div>
            </div>
          </div>
        </div>

        <DemoGuideCard pageId="business-overview" />
      </main>
    </div>
  );
}
