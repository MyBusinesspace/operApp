import { Routes, Route, Navigate } from "react-router-dom";
import ChartOfAccounts from "@/pages/accounting/ChartOfAccounts";
import AccountDetail from "@/pages/accounting/AccountDetail";
import JournalEntries from "@/pages/accounting/JournalEntries";
import Banks from "@/pages/accounting/Banks";
import BankTransactionDetail from "@/pages/accounting/BankTransactionDetail";
import FixedAssets from "@/pages/accounting/FixedAssets";
import BankRules from "@/pages/accounting/BankRules";

export default function Accounting() {
  return (
    <div className="flex flex-col">
      <div>
        <Routes>
          <Route path="/" element={<Navigate to="chart-of-accounts" replace />} />
          <Route path="chart-of-accounts" element={<ChartOfAccounts />} />
          <Route path="chart-of-accounts/:accountId" element={<AccountDetail />} />
          <Route path="journal-entries" element={<JournalEntries />} />
          <Route path="banks" element={<Banks />} />
          <Route path="banks/transactions/:transactionId" element={<BankTransactionDetail />} />
          <Route path="fixed-assets" element={<FixedAssets />} />
          <Route path="bank-rules" element={<BankRules />} />
          <Route path="*" element={<Navigate to="/accounting/chart-of-accounts" replace />} />
        </Routes>
      </div>
    </div>
  );
}