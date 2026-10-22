import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useGoBack } from "@/hooks/useGoBack";
import { ArrowLeft, Hash } from "lucide-react";
import PurchasingNumberingSettings from "./PurchasingNumberingSettings";

const TABS = [
  { key: "numbering", label: "Numbering & Defaults", icon: Hash, component: PurchasingNumberingSettings },
];

export default function PurchasingSettings() {
  const goBack = useGoBack("/purchasing-overview");
  const [activeTab, setActiveTab] = useState("numbering");
  const Tab = TABS.find(t => t.key === activeTab)?.component || PurchasingNumberingSettings;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button type="button" onClick={goBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /></button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Purchasing Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bill & PO numbering, defaults & catalog settings</p>
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

      {/* Tab content */}
      <div>
        <Tab />
      </div>
    </div>
  );
}