import { useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Building2, FolderKanban, Package } from "lucide-react";
import {
  cloneFixture,
  getDemoIndustryId,
  isDemoEnabled,
} from "@demo/index.js";
import {
  DEMO_ASSET_CATEGORIES,
  DEMO_ASSET_FIELDS,
  DEMO_ASSET_STATUSES,
  DEMO_CONTACT_CATEGORIES,
  DEMO_CONTACT_STATUSES,
  DEMO_FILE_TYPES,
  DEMO_NUMBERING,
  DEMO_PROJECT_CATEGORIES,
  DEMO_PROJECT_STATUSES,
} from "../fixtures/settingsDefaults.js";
import {
  DemoAssetFieldsSection,
  DemoFileSettingsSection,
  DemoLabelItemList,
  DemoNumberingSection,
} from "../components/DemoSettingsShared.jsx";
import DemoTopNavBar from "../components/DemoTopNavBar.jsx";
import DemoGuideCard from "../components/DemoGuideCard.jsx";
import "../demo.css";

const TABS = [
  { key: "contacts", label: "Contacts", icon: Building2 },
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "assets", label: "Assets", icon: Package },
];

export default function DemoBusinessSettings() {
  const enabled = isDemoEnabled();
  const industryId = getDemoIndustryId();
  const data = useMemo(
    () => (industryId ? cloneFixture(industryId) : null),
    [industryId]
  );
  const [activeTab, setActiveTab] = useState("contacts");

  if (!enabled) return <Navigate to="/" replace />;
  if (!industryId || !data) return <Navigate to="/demo" replace />;

  const contactGroups = data.contactGroups || [];
  const assetGroups = (data.assetGroups || []).map((g) => ({
    ...g,
    color: g.color || "#6366f1",
  }));

  return (
    <div className="min-h-screen bg-background">
      <DemoTopNavBar companyName={data.companyName} />

      <main className="pt-[var(--nav-height)]">
        <div className="max-w-[1100px] mx-auto px-6 py-8 space-y-6">
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
            <Link
              to="/demo/app/business-overview"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="w-4 h-4" /> Business overview
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  Business Settings
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Manage categories and statuses for contacts and projects
                </p>
              </div>
            </div>
          </motion.div>

          <div className="flex gap-1 border-b border-border">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    activeTab === tab.key
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === "contacts" && (
              <div className="space-y-4">
                <DemoNumberingSection
                  label="Contact"
                  prefix={DEMO_NUMBERING.contact.prefix}
                  nextNumber={DEMO_NUMBERING.contact.next_number}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DemoLabelItemList title="Categories" items={DEMO_CONTACT_CATEGORIES} />
                  <DemoLabelItemList title="Statuses" items={DEMO_CONTACT_STATUSES} />
                  <DemoLabelItemList title="Groups" items={contactGroups} />
                </div>
                <DemoFileSettingsSection
                  label="Contact File"
                  prefix={DEMO_NUMBERING.contactFile.prefix}
                  nextNumber={DEMO_NUMBERING.contactFile.next_number}
                  fileTypes={DEMO_FILE_TYPES.Contact}
                />
              </div>
            )}

            {activeTab === "projects" && (
              <div className="space-y-4">
                <DemoNumberingSection
                  label="Project"
                  prefix={DEMO_NUMBERING.project.prefix}
                  nextNumber={DEMO_NUMBERING.project.next_number}
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DemoLabelItemList title="Categories" items={DEMO_PROJECT_CATEGORIES} />
                  <DemoLabelItemList title="Statuses" items={DEMO_PROJECT_STATUSES} />
                </div>
                <DemoFileSettingsSection
                  label="Project File"
                  prefix={DEMO_NUMBERING.projectFile.prefix}
                  nextNumber={DEMO_NUMBERING.projectFile.next_number}
                  fileTypes={DEMO_FILE_TYPES.Project}
                />
              </div>
            )}

            {activeTab === "assets" && (
              <div className="space-y-4">
                <DemoNumberingSection
                  label="Asset"
                  prefix={DEMO_NUMBERING.asset.prefix}
                  nextNumber={DEMO_NUMBERING.asset.next_number}
                />
                <DemoAssetFieldsSection fields={DEMO_ASSET_FIELDS} />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <DemoLabelItemList title="Categories" items={DEMO_ASSET_CATEGORIES} />
                  <DemoLabelItemList title="Groups" items={assetGroups} />
                  <DemoLabelItemList title="Statuses" items={DEMO_ASSET_STATUSES} />
                </div>
                <DemoFileSettingsSection
                  label="Asset File"
                  prefix={DEMO_NUMBERING.assetFile.prefix}
                  nextNumber={DEMO_NUMBERING.assetFile.next_number}
                  fileTypes={DEMO_FILE_TYPES.Asset}
                />
              </div>
            )}
          </motion.div>
        </div>

        <DemoGuideCard pageId="business-settings" />
      </main>
    </div>
  );
}
