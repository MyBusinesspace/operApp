import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';

// Auth pages
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

// Layout
import AppLayout from '@/components/layout/AppLayout';

// Pages
import Dashboard from '@/pages/Dashboard';
import Contacts from '@/pages/Contacts';
import ContactDetail from '@/pages/ContactDetail';
import Projects from '@/pages/Projects';
import ProjectDetail from '@/pages/ProjectDetail';
import Assets from '@/pages/Assets';
import AssetDetail from '@/pages/AssetDetail';
import WorkOrders from '@/pages/WorkOrders';
import WorkOrderDetail from '@/pages/WorkOrderDetail';
import Tasks from '@/pages/Tasks';
import TaskDetail from '@/pages/TaskDetail';
import Timesheets from '@/pages/Timesheets';
import Leave from '@/pages/Leave';
import Payroll from '@/pages/Payroll';
import Sales from '@/pages/Sales';
import Purchases from '@/pages/Purchases';
import PettyCash from '@/pages/PettyCash';
import Reports from '@/pages/Reports';
import SettingsPage from '@/pages/SettingsPage';
import Employees from '@/pages/Employees';
import EmployeeDetail from '@/pages/EmployeeDetail';
import BusinessOverview from '@/pages/BusinessOverview';
import ServiceOverview from '@/pages/ServiceOverview';
import TimeHROverview from '@/pages/TimeHROverview';
import FinanceOverview from '@/pages/FinanceOverview';
import BusinessSettings from '@/pages/settings/BusinessSettings';
import ServiceSettings from '@/pages/settings/ServiceSettings';
import OperationsSettings from '@/pages/settings/OperationsSettings';
import HRSettings from '@/pages/settings/HRSettings';
import ImportCenter from '@/pages/settings/ImportCenter';
import FileTypesSettings from '@/pages/settings/FileTypesSettings';
import WorkingReportTemplateSettings from '@/pages/settings/WorkingReportTemplateSettings';
import DailyScheduleTemplateSettings from '@/pages/settings/DailyScheduleTemplateSettings';
import DaySchedulePrint from '@/pages/DaySchedulePrint';
import SalesSettings from '@/pages/settings/SalesSettings';
import AssetSettings from '@/pages/settings/AssetSettings';
import FixedAssetSettings from '@/pages/settings/FixedAssetSettings';
import OrganizationSettings from '@/pages/settings/OrganizationSettings';
import PurchasingSettings from '@/pages/settings/PurchasingSettings';
import SalesOverview from '@/pages/SalesOverview';
import PurchasingOverview from '@/pages/PurchasingOverview';
import Bills from '@/pages/purchasing/Bills';
import BillEditPage from '@/pages/purchasing/BillEditPage';
import PurchaseOrders from '@/pages/purchasing/PurchaseOrders';
import PurchaseOrderEditPage from '@/pages/purchasing/PurchaseOrderEditPage';
import Suppliers from '@/pages/purchasing/Suppliers';
import Invoices from '@/pages/sales/Invoices';
import Quotes from '@/pages/sales/Quotes';
import QuoteEditPage from '@/pages/sales/QuoteEditPage';
import InvoiceEditPage from '@/pages/sales/InvoiceEditPage';
import Products from '@/pages/sales/Products';
import Customers from '@/pages/sales/Customers';
import Statements from '@/pages/sales/Statements';
import StatementDetail from '@/pages/sales/StatementDetail';
import OperationsOverview from '@/pages/OperationsOverview';
import Planner from '@/pages/Planner';
import TimerLocation from '@/pages/TimerLocation';
import Accounting from '@/pages/Accounting';
import ProfitLoss from '@/pages/reports/ProfitLoss';
import BalanceSheet from '@/pages/reports/BalanceSheet';
import TrialBalance from '@/pages/reports/TrialBalance';
import AgedReceivables from '@/pages/reports/AgedReceivables';
import AgedPayables from '@/pages/reports/AgedPayables';
import BankReconciliationReport from '@/pages/reports/BankReconciliationReport';
import AccountSummary from '@/pages/reports/AccountSummary';
import AccountTransactions from '@/pages/reports/AccountTransactions';
import PayrollReport from '@/pages/reports/PayrollReport';
import OvertimeReport from '@/pages/reports/OvertimeReport';
import SalesTaxReport from '@/pages/reports/SalesTaxReport';
import FixedAssetReconciliation from '@/pages/reports/FixedAssetReconciliation';
import TimeCostReport from '@/pages/reports/TimeCostReport';
import MobileAppSettings from '@/pages/settings/MobileAppSettings';
import HistoricalPaymentsImport from '@/pages/settings/HistoricalPaymentsImport';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img
            src="https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png"
            alt="operapp"
            className="h-10 w-auto object-contain"
          />
          <div className="w-8 h-8 border-3 border-muted border-t-primary rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      {/* Auth routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected routes with app layout */}
      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/contacts" element={<Contacts />} />
          <Route path="/contacts/:id" element={<ContactDetail />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/assets/:id" element={<AssetDetail />} />
          <Route path="/work-orders" element={<WorkOrders />} />
          <Route path="/work-orders/:id" element={<WorkOrderDetail />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:id" element={<TaskDetail />} />
          <Route path="/timesheets" element={<Timesheets />} />
          <Route path="/leave" element={<Leave />} />
          <Route path="/payroll" element={<Payroll />} />
          <Route path="/sales" element={<Sales />} />
          <Route path="/sales/invoices" element={<Invoices />} />
          <Route path="/sales/invoices/new" element={<InvoiceEditPage />} />
          <Route path="/sales/invoices/:id/edit" element={<InvoiceEditPage />} />
          <Route path="/sales/quotes" element={<Quotes />} />
          <Route path="/sales/quotes/new" element={<QuoteEditPage />} />
          <Route path="/sales/quotes/:id/edit" element={<QuoteEditPage />} />
          <Route path="/sales/products" element={<Products />} />
          <Route path="/sales/customers" element={<Customers />} />
          <Route path="/sales/statements" element={<Statements />} />
          <Route path="/sales/statements/:contactId" element={<StatementDetail />} />
          <Route path="/purchases" element={<Purchases />} />
          <Route path="/petty-cash" element={<PettyCash />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/employees" element={<Employees />} />
          <Route path="/employees/:id" element={<EmployeeDetail />} />
          <Route path="/business-overview" element={<BusinessOverview />} />
          <Route path="/service-overview" element={<ServiceOverview />} />
          <Route path="/timehr-overview" element={<TimeHROverview />} />
          <Route path="/finance-overview" element={<FinanceOverview />} />
          <Route path="/settings/business" element={<BusinessSettings />} />
          <Route path="/settings/service" element={<ServiceSettings />} />
          <Route path="/settings/operations" element={<OperationsSettings />} />
          <Route path="/settings/operations/working-report" element={<WorkingReportTemplateSettings />} />
          <Route path="/settings/operations/daily-schedule" element={<DailyScheduleTemplateSettings />} />
          <Route path="/day-schedule-print" element={<DaySchedulePrint />} />
          <Route path="/settings/hr" element={<HRSettings />} />
          <Route path="/settings/sales" element={<SalesSettings />} />
          <Route path="/settings/assets" element={<AssetSettings />} />
          <Route path="/settings/fixed-assets" element={<FixedAssetSettings />} />
          <Route path="/settings/import-center" element={<ImportCenter />} />
          <Route path="/settings/file-types" element={<FileTypesSettings />} />
          <Route path="/settings/organization" element={<OrganizationSettings />} />
          <Route path="/settings/purchasing" element={<PurchasingSettings />} />
          <Route path="/settings/mobile-app" element={<MobileAppSettings />} />
          <Route path="/settings/historical-payments" element={<HistoricalPaymentsImport />} />
          <Route path="/sales-overview" element={<SalesOverview />} />
          <Route path="/purchasing-overview" element={<PurchasingOverview />} />
          <Route path="/purchasing/bills" element={<Bills />} />
          <Route path="/purchasing/bills/new" element={<BillEditPage />} />
          <Route path="/purchasing/bills/:id/edit" element={<BillEditPage />} />
          <Route path="/purchasing/purchase-orders" element={<PurchaseOrders />} />
          <Route path="/purchasing/purchase-orders/new" element={<PurchaseOrderEditPage />} />
          <Route path="/purchasing/purchase-orders/:id/edit" element={<PurchaseOrderEditPage />} />
          <Route path="/purchasing/suppliers" element={<Suppliers />} />
          <Route path="/operations-overview" element={<OperationsOverview />} />
          <Route path="/planner" element={<Planner />} />
          <Route path="/timer-location" element={<TimerLocation />} />
          <Route path="/accounting/*" element={<Accounting />} />
          <Route path="/reports/profit-loss" element={<ProfitLoss />} />
          <Route path="/reports/balance-sheet" element={<BalanceSheet />} />
          <Route path="/reports/trial-balance" element={<TrialBalance />} />
          <Route path="/reports/aged-receivables" element={<AgedReceivables />} />
          <Route path="/reports/aged-payables" element={<AgedPayables />} />
          <Route path="/reports/bank-reconciliation" element={<BankReconciliationReport />} />
          <Route path="/reports/account-summary" element={<AccountSummary />} />
          <Route path="/reports/account-transactions" element={<AccountTransactions />} />
          <Route path="/reports/payroll" element={<PayrollReport />} />
          <Route path="/reports/overtime" element={<OvertimeReport />} />
          <Route path="/reports/sales-tax" element={<SalesTaxReport />} />
          <Route path="/reports/fixed-asset-reconciliation" element={<FixedAssetReconciliation />} />
          <Route path="/reports/time-cost" element={<TimeCostReport />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <AuthenticatedApp />
          <Toaster />
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App