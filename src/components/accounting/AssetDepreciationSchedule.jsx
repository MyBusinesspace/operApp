import React, { useMemo } from "react";

function fmtCurrency(v) {
  return new Intl.NumberFormat("en-AE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v || 0);
}
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AssetDepreciationSchedule({ asset }) {
  const schedule = useMemo(() => {
    if (!asset) return [];
    const cost = asset.purchase_price || 0;
    const residual = asset.residual_value || 0;
    const life = asset.useful_life_years || 0;
    const rate = asset.depreciation_rate || 0;
    const method = asset.depreciation_method || "straight_line";
    const startDate = asset.depreciation_start_date || asset.purchase_date;

    if (!cost || !startDate) return [];
    if (method === "straight_line" && (!life || life <= 0)) return [];
    if (method === "diminishing_value" && (!rate || rate <= 0)) return [];

    const rows = [];
    let bookValue = cost;
    let accumulated = asset.accumulated_depreciation || 0;
    const start = new Date(startDate);
    const years = method === "straight_line" ? life : Math.ceil(Math.log(residual / cost) / Math.log(1 - rate / 100));
    const totalYears = method === "straight_line" ? life : Math.min(years || 50, 50);

    for (let y = 1; y <= totalYears; y++) {
      let annual;
      if (method === "straight_line") {
        annual = (cost - residual) / life;
      } else {
        annual = (bookValue - residual) * (rate / 100);
      }
      annual = Math.max(0, annual);
      // Stop if book value would go below residual
      if (bookValue - annual < residual) annual = Math.max(0, bookValue - residual);
      if (annual <= 0) break;

      accumulated += annual;
      bookValue -= annual;

      const periodDate = new Date(start);
      periodDate.setFullYear(periodDate.getFullYear() + y);

      rows.push({
        year: y,
        periodEnd: periodDate.toISOString().split("T")[0],
        annual,
        accumulated,
        bookValue: Math.max(bookValue, residual),
      });

      if (bookValue <= residual + 0.01) break;
    }
    return rows;
  }, [asset]);

  if (!asset?.purchase_price) {
    return <p className="text-sm text-muted-foreground py-4">No purchase price set for this asset.</p>;
  }
  if (!asset?.useful_life_years && !asset?.depreciation_rate) {
    return <p className="text-sm text-muted-foreground py-4">Set up depreciation settings to view the schedule.</p>;
  }
  if (schedule.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">Cannot calculate schedule — check depreciation settings.</p>;
  }

  const cost = asset.purchase_price || 0;
  const bookValue = cost - (asset.accumulated_depreciation || 0);

  return (
    <div className="space-y-3">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Cost", value: fmtCurrency(cost), color: "text-foreground" },
          { label: "Accumulated Depreciation", value: fmtCurrency(asset.accumulated_depreciation || 0), color: "text-amber-600" },
          { label: "Net Book Value", value: fmtCurrency(bookValue), color: "text-primary" },
          { label: "Residual Value", value: fmtCurrency(asset.residual_value || 0), color: "text-muted-foreground" },
        ].map(s => (
          <div key={s.label} className="p-3 rounded-lg border border-border bg-card">
            <p className={`text-sm font-semibold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Schedule table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Year</th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">Period End</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Depreciation</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Accumulated</th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">Book Value</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50 bg-muted/10">
              <td className="px-4 py-2 text-xs text-muted-foreground font-medium">—</td>
              <td className="px-4 py-2 text-xs text-muted-foreground">Purchase</td>
              <td className="px-4 py-2 text-xs text-right text-muted-foreground">—</td>
              <td className="px-4 py-2 text-xs text-right text-muted-foreground">—</td>
              <td className="px-4 py-2 text-xs text-right font-mono font-semibold text-foreground">{fmtCurrency(cost)}</td>
            </tr>
            {schedule.map((row, i) => (
              <tr key={i} className={`border-b border-border/50 hover:bg-muted/20 ${i === schedule.length - 1 ? "bg-emerald-50/40" : ""}`}>
                <td className="px-4 py-2 text-xs text-muted-foreground">{row.year}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">{fmtDate(row.periodEnd)}</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-amber-700">{fmtCurrency(row.annual)}</td>
                <td className="px-4 py-2 text-xs text-right font-mono text-muted-foreground">{fmtCurrency(row.accumulated)}</td>
                <td className={`px-4 py-2 text-xs text-right font-mono font-semibold ${i === schedule.length - 1 ? "text-emerald-700" : "text-foreground"}`}>
                  {fmtCurrency(row.bookValue)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Method: {asset.depreciation_method === "straight_line" ? "Straight Line" : "Diminishing Value"}
        {asset.useful_life_years ? ` · ${asset.useful_life_years} years` : ""}
        {asset.depreciation_rate ? ` · ${asset.depreciation_rate}% p.a.` : ""}
      </p>
    </div>
  );
}