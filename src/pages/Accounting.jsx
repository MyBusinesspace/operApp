import { Routes, Route, Navigate } from "react-router-dom";
import ChartOfAccounts from "@/pages/accounting/ChartOfAccounts";
import JournalEntries from "@/pages/accounting/JournalEntries";
import Banks from "@/pages/accounting/Banks";
import FixedAssets from "@/pages/accounting/FixedAssets";

export default function Accounting() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        <Routes>
          <Route path="/" element={<Navigate to="chart-of-accounts" replace />} />
          <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="journal-entries" element={<JournalEntries />} />
          <Route path="banks" element={<Banks />} />
          <Route path="fixed-assets" element={<FixedAssets />} />
        </Routes>
      </div>
    </div>
  );
}