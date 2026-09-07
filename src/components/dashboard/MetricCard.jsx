import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";

export default function MetricCard({ title, value, change, changeLabel, icon: Icon, gradient, delay = 0 }) {
  const isPositive = change >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`${gradient} rounded-2xl p-6 card-hover border border-border/50 relative overflow-hidden`}
    >
      <div className="absolute top-0 right-0 w-24 h-24 rounded-full bg-white/5 -translate-y-6 translate-x-6" />
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl bg-white/60 dark:bg-white/10 backdrop-blur-sm">
          <Icon className="w-5 h-5 text-foreground/70" />
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
            isPositive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
              : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
          }`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-2xl font-bold tracking-tight text-foreground">{value}</h3>
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
      </div>
      {changeLabel && (
        <p className="text-xs text-muted-foreground mt-3">{changeLabel}</p>
      )}
    </motion.div>
  );
}