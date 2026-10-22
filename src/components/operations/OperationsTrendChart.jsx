import React from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { BarChart3 } from "lucide-react";
import { DarkSection } from "@/components/shared/DarkOverview";

export default function OperationsTrendChart({ data = [], title = "Tasks & Working Reports — last 12 months", mode = "all" }) {
  const isDay = mode === "day";
  const isMonth = mode === "month";
  const isYear = mode === "year";
  return (
    <DarkSection title={title} icon={BarChart3} iconColor="text-rose-400" bgClass="bg-card">
      <div className="h-64 py-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "#71717a" }}
              axisLine={false}
              tickLine={false}
              interval={isDay ? 1 : 0}
              tickFormatter={(v) => (isDay ? `${v}:00` : v)}
            />
            <YAxis tick={{ fontSize: 11, fill: "#71717a" }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "#1a1a1a", border: "1px solid #27272a", borderRadius: 8, fontSize: 12, color: "#fff" }}
              labelFormatter={(_, p) => p?.[0]?.payload?.fullLabel || ""}
              cursor={{ stroke: "#ffffff20" }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#71717a" }} />
            <Line type="monotone" dataKey="tasks" name="Tasks" stroke="#6366f1" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            <Line type="monotone" dataKey="reports" name="Working Reports" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </DarkSection>
  );
}