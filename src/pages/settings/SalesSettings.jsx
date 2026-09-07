import React, { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, LayoutTemplate, Hash, Package, Percent, Ship } from "lucide-react";
import DocumentTemplates from "./DocumentTemplates";
import SalesNumberingSettings from "./SalesNumberingSettings";
import SalesProductSettings from "./SalesProductSettings";
import SalesTaxSettings from "./SalesTaxSettings";
import SalesIncotermsSettings from "./SalesIncotermsSettings";

const TABS = [
  { key: "templates", label: "Document Templates", icon: LayoutTemplate, component: DocumentTemplates },
  { key: "numbering", label: "Numbering & Defaults", icon: Hash, component: SalesNumberingSettings },
  { key: "tax", label: "Tax Rates", icon: Percent, component: SalesTaxSettings },
  { key: "incoterms", label: "Incoterms", icon: Ship, component: SalesIncotermsSettings },
  { key: "products", label: "Products & Services", icon: Package, component: SalesProductSettings },
];

export default function SalesSettings() {
  const [activeTab, setActiveTab] = useState("templates");
  const Tab = TABS.find(t => t.key === activeTab)?.component || DocumentTemplates;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/settings" className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Templates, numbering, defaults & catalog settings</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content — DocumentTemplates manages its own header so skip it when on templates tab */}
      <div>
        {activeTab === "templates" ? (
          <DocumentTemplates hideBackButton />
        ) : activeTab === "tax" ? (
          <SalesTaxSettings />
        ) : activeTab === "incoterms" ? (
          <SalesIncotermsSettings />
        ) : (
          <Tab />
        )}
      </div>
    </div>
  );
}