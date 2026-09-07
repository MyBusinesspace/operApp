import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, Search, Filter } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function PlaceholderPage({ title, subtitle, icon: Icon, actionLabel }) {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          {Icon && (
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Icon className="w-5 h-5 text-primary" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actionLabel && (
          <Button className="gap-2 shadow-sm">
            <Plus className="w-4 h-4" />
            {actionLabel}
          </Button>
        )}
      </motion.div>

      {/* Toolbar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex items-center gap-3"
      >
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder={`Search ${title.toLowerCase()}...`} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="w-3.5 h-3.5" /> Filters
        </Button>
      </motion.div>

      {/* Empty state */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card rounded-2xl border border-border p-12 text-center"
      >
        {Icon && (
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
            <Icon className="w-7 h-7 text-muted-foreground/60" />
          </div>
        )}
        <h3 className="text-lg font-semibold text-foreground mb-1">No {title.toLowerCase()} yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Get started by creating your first record. This module will be fully built in upcoming phases.
        </p>
        {actionLabel && (
          <Button className="mt-6 gap-2">
            <Plus className="w-4 h-4" /> {actionLabel}
          </Button>
        )}
      </motion.div>
    </div>
  );
}