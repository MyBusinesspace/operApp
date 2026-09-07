import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

export default function WorkOrdersChart({ workOrders }) {
  const chartData = useMemo(() => {
    const groups = { Completed: 0, "In Progress": 0, Pending: 0, Archived: 0 };
    for (const wo of workOrders) {
      if (wo.status === "Active") groups["In Progress"]++;
      else if (wo.status === "On Hold") groups.Pending++;
      else if (wo.status === "Archived") groups.Archived++;
    }
    return [
      { name: "In Progress", value: groups["In Progress"], color: "hsl(239 84% 67%)" },
      { name: "Completed", value: groups.Completed, color: "hsl(168 76% 42%)" },
      { name: "Pending", value: groups.Pending, color: "hsl(43 96% 56%)" },
      { name: "Archived", value: groups.Archived, color: "hsl(0 84% 60%)" },
    ].filter(d => d.value > 0);
  }, [workOrders]);

  const total = workOrders.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-card rounded-2xl border border-border p-6 card-hover"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Work Orders</h3>
          <p className="text-sm text-muted-foreground mt-0.5">Status breakdown</p>
        </div>
        <Link to="/work-orders" className="text-xs text-primary font-semibold hover:text-primary/80 flex items-center gap-1 transition-colors">
          View <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      {chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No work orders yet.</p>
      ) : (
        <div className="flex items-center gap-6">
          <div className="h-[180px] w-[180px] relative shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" stroke="none">
                  {chartData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value, name) => [`${value} orders`, name]}
                  contentStyle={{ borderRadius: "12px", border: "1px solid hsl(220 13% 91%)", boxShadow: "0 8px 24px rgb(0 0 0 / 0.06)" }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-foreground">{total}</span>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
          </div>
          <div className="flex-1 space-y-3">
            {chartData.map((item) => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  <span className="text-sm text-muted-foreground">{item.name}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{item.value}</span>
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {total > 0 ? Math.round((item.value / total) * 100) : 0}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}