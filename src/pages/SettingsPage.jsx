import React, { useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import {
  Settings, Users, FolderKanban, Package, ClipboardList,
  Clock, CalendarDays, UserCheck, CreditCard, FileText,
  ShoppingCart, BarChart3, Building2, Wrench,
  ChevronRight, Search, FileStack, Shield, Upload, TrendingDown, BookOpen, Smartphone
} from "lucide-react";
import { Input } from "@/components/ui/input";

const sections = [
  {
    category: "Organization",
    icon: Building2,
    color: "bg-primary/10 text-primary",
    items: [
      { label: "Organization Profile", desc: "Company name, logo, address, tax ID & banking details", path: "/settings/organization", icon: Building2 },
    ],
  },
  {
    category: "Business",
    icon: Building2,
    color: "bg-blue-50 text-blue-600",
    items: [
      { label: "Contacts & Projects", desc: "Categories, statuses for contacts & projects", path: "/settings/business", icon: Building2 },
      { label: "Assets", desc: "Asset groups & reference numbering", path: "/settings/assets", icon: Package },
      { label: "Fixed Asset Settings", desc: "Asset types, depreciation accounts & default methods", path: "/settings/fixed-assets", icon: TrendingDown },
    ],
  },
  {
    category: "Operations",
    icon: Wrench,
    color: "bg-orange-50 text-orange-600",
    items: [
      { label: "Work Orders & Tasks", desc: "Categories, statuses & shifts for work orders and tasks", path: "/settings/operations", icon: ClipboardList },
      { label: "Timesheet Settings", desc: "GPS tracking, photo requirements & alarm rules", path: "/settings/operations", icon: Clock },
    ],
  },
  {
    category: "HR",
    icon: Users,
    color: "bg-emerald-50 text-emerald-600",
    items: [
      { label: "Employees", desc: "Groups, statuses, teams & document types", path: "/settings/hr", icon: Users },
      { label: "Roles & Permissions", desc: "Configure access levels for each user role", path: "/settings/hr#roles", icon: Shield },
      { label: "Leave", desc: "Leave types, balances & approval workflows", path: "/leave", icon: UserCheck },
      { label: "Payroll", desc: "Pay periods, deductions & pay structures", path: "/payroll", icon: CreditCard },
    ],
  },
  {
    category: "Finance",
    icon: BookOpen,
    color: "bg-emerald-50 text-emerald-600",
    items: [
      { label: "Fixed Asset Settings", desc: "Asset types, depreciation accounts & default methods", path: "/settings/fixed-assets", icon: TrendingDown },
    ],
  },
  {
    category: "Sales",
    icon: FileText,
    color: "bg-violet-50 text-violet-600",
    items: [
      { label: "Sales Settings", desc: "Invoice templates, payment terms & tax rates", path: "/settings/sales", icon: FileText },
    ],
  },
  {
    category: "Purchasing",
    icon: ShoppingCart,
    color: "bg-orange-50 text-orange-600",
    items: [
      { label: "Purchasing Settings", desc: "Supplier defaults, PO rules & expense categories", path: "/settings/purchasing", icon: ShoppingCart },
    ],
  },
  {
    category: "Reports",
    icon: BarChart3,
    color: "bg-pink-50 text-pink-600",
    items: [
      { label: "Reports", desc: "Report templates, schedules & export formats", path: "/reports", icon: BarChart3 },
    ],
  },
  {
    category: "Data Management",
    icon: Upload,
    color: "bg-emerald-50 text-emerald-600",
    items: [
      { label: "File Types", desc: "Central manager for file categories across all modules", path: "/settings/file-types", icon: FileStack },
      { label: "Mobile App", desc: "Upload APK / IPA builds & manage OTA version updates", path: "/settings/mobile-app", icon: Smartphone },
    ],
  },
];

export default function SettingsPage() {
  const [search, setSearch] = useState("");

  const filtered = sections.map(section => {
    if (section.groups) {
      const filteredGroups = section.groups.map(g => ({
        ...g,
        items: g.items.filter(item =>
          !search ||
          item.label.toLowerCase().includes(search.toLowerCase()) ||
          item.desc.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(g => g.items.length > 0);
      return { ...section, groups: filteredGroups, items: filteredGroups.flatMap(g => g.items) };
    }
    return {
      ...section,
      items: section.items.filter(item =>
        !search ||
        item.label.toLowerCase().includes(search.toLowerCase()) ||
        item.desc.toLowerCase().includes(search.toLowerCase())
      ),
    };
  }).filter(section => section.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
        className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Settings className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Organization, modules & configuration</p>
        </div>
      </motion.div>

      {/* Search */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search settings..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </motion.div>

      {/* Sections */}
      <div className="space-y-8">
        {filtered.map((section, si) => (
          <motion.div key={section.category}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + si * 0.05 }}>
            {/* Section header */}
            <div className="flex items-center gap-2.5 mb-3">
              <div className={`p-1.5 rounded-lg ${section.color}`}>
                <section.icon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{section.category}</h2>
            </div>

            {/* Cards — grouped or flat */}
            {section.groups ? (
              <div className="space-y-4">
                {section.groups.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 ml-1">{group.label}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.items.map((item, ii) => (
                        <Link key={item.path} to={item.path}>
                          <motion.div
                            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 + si * 0.05 + ii * 0.03 }}
                            className="bg-card rounded-xl border border-border p-4 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200 group cursor-pointer flex items-center gap-4"
                          >
                            <div className={`p-2.5 rounded-lg ${section.color} shrink-0`}>
                              <item.icon className="w-4.5 h-4.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.label}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.desc}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                          </motion.div>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {section.items.map((item, ii) => (
                  <Link key={item.path} to={item.path}>
                    <motion.div
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + si * 0.05 + ii * 0.03 }}
                      className="bg-card rounded-xl border border-border p-4 hover:shadow-md hover:-translate-y-0.5 hover:border-primary/30 transition-all duration-200 group cursor-pointer flex items-center gap-4"
                    >
                      <div className={`p-2.5 rounded-lg ${section.color} shrink-0`}>
                        <item.icon className="w-4.5 h-4.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{item.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.desc}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                    </motion.div>
                  </Link>
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}