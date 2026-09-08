-- Auto-generated from base44/entities — do not edit by hand
-- Regenerated: 2026-09-08T08:17:06.979Z
-- Tables mirror Base44 entity schemas (field names preserved)

create extension if not exists "pgcrypto";

-- Shared updated_date trigger
create or replace function public.set_updated_date()
returns trigger as $$
begin
  new.updated_date = now();
  return new;
end;
$$ language plpgsql;

-- Entity: AccountingSettings
create table if not exists public.accounting_settings (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  financial_year_start_month double precision DEFAULT 1,
  default_currency text DEFAULT 'AED',
  lock_date date,
  tax_basis text DEFAULT 'Accrual',
  auto_post_invoices boolean DEFAULT true,
  auto_post_bills boolean DEFAULT true,
  accounts_receivable_id text,
  accounts_payable_id text,
  sales_tax_account_id text,
  purchase_tax_account_id text,
  retained_earnings_id text
);

-- Entity: Asset
create table if not exists public.asset (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  serial_number text,
  reference text,
  category text,
  status text DEFAULT 'Available',
  accounting_status text DEFAULT 'draft',
  group_id text,
  contact_id text,
  contact_name text,
  project_id text,
  project_name text,
  work_order_id text,
  work_order_name text,
  work_order_ids jsonb,
  work_order_names jsonb,
  purchase_date date,
  purchase_price double precision,
  currency text DEFAULT 'AED',
  location text,
  manufacturer text,
  model text,
  year double precision,
  notes text,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  depreciation_method text DEFAULT 'straight_line',
  useful_life_years double precision,
  residual_value double precision DEFAULT 0,
  depreciation_rate double precision,
  depreciation_start_date date,
  accumulated_depreciation double precision DEFAULT 0,
  last_depreciation_date date,
  depreciation_account_id text,
  depreciation_account_name text,
  accumulated_account_id text,
  accumulated_account_name text
);

-- Entity: AssetCategory
create table if not exists public.asset_category (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text
);

-- Entity: AssetField
create table if not exists public.asset_field (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  field_type text DEFAULT 'text',
  sort_order double precision DEFAULT 0,
  is_active boolean DEFAULT true
);

-- Entity: AssetFile
create table if not exists public.asset_file (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  reference text,
  asset_id text not null,
  file_name text not null,
  file_url text not null,
  file_size double precision,
  file_type text,
  file_type_id text,
  file_type_name text,
  description text
);

-- Entity: AssetGroup
create table if not exists public.asset_group (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text,
  asset_account_id text,
  asset_account_name text,
  accumulated_account_id text,
  accumulated_account_name text,
  depreciation_account_id text,
  depreciation_account_name text,
  depreciation_method text DEFAULT 'straight_line',
  useful_life_years double precision,
  residual_value_pct double precision DEFAULT 0
);

-- Entity: AssetNote
create table if not exists public.asset_note (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  asset_id text not null,
  note text not null,
  action text DEFAULT 'Note',
  user_name text
);

-- Entity: AssetStatus
create table if not exists public.asset_status (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text
);

-- Entity: BankAccount
create table if not exists public.bank_account (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  bank_name text,
  account_number text,
  account_type text DEFAULT 'Bank',
  currency text DEFAULT 'AED',
  chart_account_id text,
  chart_account_code text,
  chart_account_name text,
  opening_balance double precision DEFAULT 0,
  opening_balance_date date,
  status text DEFAULT 'Active',
  show_on_dashboard boolean DEFAULT true,
  color text DEFAULT '#6366f1'
);

-- Entity: BankTransaction
create table if not exists public.bank_transaction (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  bank_account_id text not null,
  bank_account_name text,
  date date not null,
  description text,
  reference text,
  type text DEFAULT 'Spend Money',
  amount double precision DEFAULT 0,
  currency text DEFAULT 'AED',
  contact_id text,
  contact_name text,
  account_id text,
  account_code text,
  account_name text,
  status text DEFAULT 'Unreconciled',
  source_type text DEFAULT 'Manual',
  source_id text,
  source_number text,
  journal_entry_id text,
  transfer_to_account_id text,
  transfer_to_account_name text,
  notes text
);

-- Entity: Bill
create table if not exists public.bill (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  number text,
  reference text,
  title text,
  doc_summary text,
  contact_id text not null,
  contact_name text,
  status text DEFAULT 'Draft',
  department text,
  issue_date date,
  due_date date,
  currency text DEFAULT 'AED',
  subtotal double precision DEFAULT 0,
  tax_amount double precision DEFAULT 0,
  total double precision DEFAULT 0,
  amount_paid double precision DEFAULT 0,
  notes text,
  project_id text,
  project_name text,
  work_order_id text,
  work_order_name text,
  purchase_order_id text,
  purchase_order_number text,
  payments jsonb,
  line_items jsonb
);

-- Entity: ChartOfAccount
create table if not exists public.chart_of_account (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  code text,
  name text not null,
  type text not null,
  subtype text,
  parent_id text,
  parent_code text,
  parent_name text,
  tax_rate_id text,
  tax_rate_name text,
  tax_rate_value double precision,
  description text,
  currency text DEFAULT 'AED',
  status text DEFAULT 'Active',
  show_on_dashboard boolean DEFAULT false,
  enable_payments boolean DEFAULT false,
  is_system boolean DEFAULT false,
  lock_date date,
  opening_balance double precision DEFAULT 0,
  opening_balance_date date,
  ytd_balance double precision DEFAULT 0
);

-- Entity: Contact
create table if not exists public.contact (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  reference text,
  full_name text not null,
  email text,
  phone text,
  company text,
  type text DEFAULT 'Contact',
  status text DEFAULT 'Active',
  group_id text,
  address text,
  city text,
  country text,
  tax_id text,
  website text,
  maps_link text,
  notes text,
  avatar_url text,
  fiscal_legal_name text,
  fiscal_address text,
  fiscal_city text,
  fiscal_country text,
  fiscal_zip text,
  fiscal_currency text,
  fiscal_payment_terms text,
  fiscal_bank_name text,
  fiscal_iban text,
  fiscal_swift text
);

-- Entity: ContactCategory
create table if not exists public.contact_category (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text
);

-- Entity: ContactFile
create table if not exists public.contact_file (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  reference text,
  contact_id text not null,
  file_name text not null,
  file_url text not null,
  file_size double precision,
  file_type text,
  file_type_id text,
  file_type_name text,
  description text
);

-- Entity: ContactGroup
create table if not exists public.contact_group (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text
);

-- Entity: ContactNote
create table if not exists public.contact_note (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  contact_id text not null,
  note text not null,
  action text DEFAULT 'Note',
  user_name text
);

-- Entity: ContactPerson
create table if not exists public.contact_person (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  contact_id text,
  contact_name text,
  project_id text,
  project_name text,
  work_order_id text,
  work_order_name text,
  full_name text not null,
  role text,
  email text,
  phone text,
  is_primary boolean DEFAULT false,
  notes text
);

-- Entity: ContactStatus
create table if not exists public.contact_status (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#22c55e',
  description text
);

-- Entity: DocumentFile
create table if not exists public.document_file (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  doc_type text not null,
  doc_id text not null,
  doc_number text,
  file_name text not null,
  file_url text not null,
  file_size double precision,
  file_type text,
  description text,
  include_in_pdf boolean DEFAULT false
);

-- Entity: DocumentHistory
create table if not exists public.document_history (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  doc_type text not null,
  doc_id text,
  doc_number text not null,
  action text not null,
  detail text,
  user_name text,
  note text
);

-- Entity: DocumentTemplate
create table if not exists public.document_template (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  document_types jsonb,
  page_size text DEFAULT 'A4',
  font text DEFAULT 'Inter',
  accent_color text DEFAULT '#6366f1',
  logo_url text,
  logo_size double precision DEFAULT 60,
  logo_position text DEFAULT 'right',
  stamp_url text,
  company_name text,
  company_name_font_size double precision DEFAULT 19,
  body_font_size double precision DEFAULT 8.5,
  auto_text_scale boolean DEFAULT true,
  company_address text,
  company_phone text,
  company_email text,
  company_website text,
  tax_id text,
  show_logo boolean DEFAULT true,
  show_stamp boolean DEFAULT false,
  show_tax_number boolean DEFAULT true,
  show_tax_column boolean DEFAULT true,
  show_unit_price boolean DEFAULT true,
  show_discount boolean DEFAULT false,
  tax_display text DEFAULT 'exclusive',
  quote_title text DEFAULT 'Quotation',
  quote_title_sent text DEFAULT 'Quotation',
  invoice_title_draft text DEFAULT 'Proforma Invoice',
  invoice_title text DEFAULT 'Tax Invoice',
  invoice_title_overdue text DEFAULT 'Tax Invoice',
  footer_notes text,
  quote_terms text,
  is_default boolean DEFAULT false
);

-- Entity: Employee
create table if not exists public.employee (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  full_name text not null,
  employee_no text,
  bank_account text,
  email text not null,
  phone text,
  role text not null,
  department text,
  status text DEFAULT 'Active',
  hire_date date,
  avatar_url text,
  team_id text,
  team_name text,
  user_id text,
  user_email text,
  notes text,
  absence_status text,
  sort_order double precision DEFAULT 0
);

-- Entity: EmployeeDocument
create table if not exists public.employee_document (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  employee_id text not null,
  employee_name text,
  document_type_id text not null,
  document_type_name text,
  file_url text,
  file_name text,
  expiry_date date,
  notes text,
  document_number text,
  full_name text,
  date_of_birth date,
  issue_date date,
  issuing_authority text,
  nationality text,
  extra_fields jsonb
);

-- Entity: EmployeeDocumentType
create table if not exists public.employee_document_type (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  requires_expiry boolean DEFAULT false,
  description text
);

-- Entity: EmployeeGroup
create table if not exists public.employee_group (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text
);

-- Entity: EmployeeLoan
create table if not exists public.employee_loan (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  employee_id text not null,
  employee_name text,
  loan_type text DEFAULT 'salary_advance',
  amount double precision DEFAULT 0,
  reason text,
  issue_date date not null,
  monthly_deduction double precision DEFAULT 0,
  remaining_balance double precision DEFAULT 0,
  status text DEFAULT 'active',
  notes text,
  approved_by text,
  approved_by_name text
);

-- Entity: EmployeePayrollProfile
create table if not exists public.employee_payroll_profile (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  employee_id text not null,
  employee_name text,
  employment_type text DEFAULT 'full_time',
  pay_type text DEFAULT 'salary',
  basic_salary double precision DEFAULT 0,
  hourly_rate double precision DEFAULT 0,
  effective_date date,
  components jsonb,
  annual_leave_days double precision DEFAULT 30,
  leave_used_override double precision,
  yearly_leave_overrides jsonb DEFAULT '{}'::jsonb,
  last_annual_bonus_year double precision,
  last_gratuity_year double precision,
  gratuity_total_override double precision,
  tax_country text DEFAULT 'AE',
  tax_status text DEFAULT 'resident',
  tax_rate_override double precision,
  bank_name text,
  iban text,
  bank_routing text,
  wps_id text,
  tax_id text,
  is_active boolean DEFAULT true,
  notes text
);

-- Entity: EmployeeRole
create table if not exists public.employee_role (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  key text not null,
  color text DEFAULT '#6366f1',
  description text,
  is_system boolean DEFAULT false,
  sort_order double precision DEFAULT 0
);

-- Entity: EmployeeStatus
create table if not exists public.employee_status (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#22c55e',
  description text
);

-- Entity: FileType
create table if not exists public.file_type (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text,
  reference_prefix text DEFAULT '',
  entity_scope text
);

-- Entity: HistoricalPayment
create table if not exists public.historical_payment (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  employee_id text not null,
  employee_name text,
  payment_type text not null,
  year double precision not null,
  amount double precision DEFAULT 0,
  payment_date date,
  notes text
);

-- Entity: Invoice
create table if not exists public.invoice (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  number text,
  reference text,
  title text,
  doc_summary text,
  quote_id text,
  contact_id text not null,
  contact_name text,
  status text DEFAULT 'Draft',
  issue_date date,
  due_date date,
  currency text DEFAULT 'AED',
  incoterm text,
  subtotal double precision DEFAULT 0,
  tax_amount double precision DEFAULT 0,
  total double precision DEFAULT 0,
  amount_paid double precision DEFAULT 0,
  notes text,
  terms text,
  project_id text,
  project_name text,
  work_order_id text,
  work_order_name text,
  task_ids jsonb,
  task_names jsonb,
  task_references jsonb,
  payments jsonb,
  line_items jsonb,
  annex_photos jsonb
);

-- Entity: JournalEntry
create table if not exists public.journal_entry (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  number text,
  date date not null,
  narration text not null,
  reference text,
  source_type text DEFAULT 'Manual',
  source_id text,
  source_number text,
  status text DEFAULT 'Draft',
  currency text DEFAULT 'AED',
  total_debit double precision DEFAULT 0,
  total_credit double precision DEFAULT 0,
  lines jsonb,
  posted_date date,
  contact_id text,
  contact_name text,
  project_id text,
  project_name text
);

-- Entity: LeaveRequest
create table if not exists public.leave_request (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  employee_id text not null,
  employee_name text,
  submitted_by_name text,
  leave_type text DEFAULT 'vacation',
  start_date date not null,
  end_date date not null,
  total_days double precision DEFAULT 0,
  reason text,
  status text DEFAULT 'pending',
  approved_by text,
  approved_by_name text,
  approved_at text,
  admin_notes text,
  documents jsonb
);

-- Entity: MobileApp
create table if not exists public.mobile_app (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  android_path text,
  ios_path text,
  app_version text,
  version_description text
);

-- Entity: OperationsSettings
create table if not exists public.operations_settings (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  track_gps_location boolean DEFAULT true,
  require_work_order boolean DEFAULT false,
  allow_manual_edit boolean DEFAULT true,
  enable_alarms boolean DEFAULT false,
  alarm_minutes_before double precision DEFAULT 5,
  gps_accuracy_threshold_m double precision DEFAULT 15,
  tracking_interval_min double precision DEFAULT 15,
  require_photo_clock_in boolean DEFAULT false,
  require_photo_clock_out boolean DEFAULT false,
  require_photo_task_switch boolean DEFAULT false,
  show_timesheet_photos_column boolean DEFAULT true
);

-- Entity: Organization
create table if not exists public.organization (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  legal_name text,
  logo_url text,
  industry text,
  website text,
  email text,
  phone text,
  address text,
  city text,
  country text,
  zip text,
  tax_id text,
  currency text DEFAULT 'AED',
  fiscal_year_start text,
  timezone text DEFAULT 'Asia/Dubai',
  bank_name text,
  bank_account text,
  bank_swift text,
  notes text
);

-- Entity: OrganizationFile
create table if not exists public.organization_file (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  organization_id text not null,
  name text not null,
  file_url text not null,
  file_type text,
  file_size double precision,
  reference text,
  file_type_id text,
  file_type_name text,
  notes text
);

-- Entity: PayPeriod
create table if not exists public.pay_period (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  start_date date not null,
  end_date date not null,
  pay_date date not null,
  status text DEFAULT 'draft',
  selected_employee_ids jsonb,
  total_gross double precision DEFAULT 0,
  total_deductions double precision DEFAULT 0,
  total_net double precision DEFAULT 0,
  total_tax double precision DEFAULT 0,
  employee_count double precision DEFAULT 0,
  notes text,
  approved_by text,
  approved_by_name text,
  approved_at text,
  paid_at text
);

-- Entity: PayrollAuditLog
create table if not exists public.payroll_audit_log (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  pay_period_id text not null,
  pay_period_name text,
  payroll_entry_id text,
  employee_id text,
  employee_name text,
  action text not null,
  performed_by text not null,
  performed_by_name text,
  timestamp text not null,
  changes_summary text,
  previous_values jsonb,
  new_values jsonb
);

-- Entity: PayrollComponent
create table if not exists public.payroll_component (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  code text,
  type text DEFAULT 'earning',
  calculation_method text DEFAULT 'fixed',
  default_value double precision DEFAULT 0,
  is_taxable boolean DEFAULT false,
  is_recurring boolean DEFAULT true,
  is_active boolean DEFAULT true,
  is_system boolean DEFAULT false,
  applies_to_roles jsonb,
  description text
);

-- Entity: PayrollEntry
create table if not exists public.payroll_entry (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  pay_period_id text not null,
  pay_period_name text,
  employee_id text not null,
  employee_name text,
  employment_type text,
  pay_type text,
  regular_hours double precision DEFAULT 0,
  overtime_hours double precision DEFAULT 0,
  absent_days double precision DEFAULT 0,
  paid_leave_days double precision DEFAULT 0,
  late_minutes double precision DEFAULT 0,
  working_days_in_period double precision DEFAULT 0,
  days_present double precision DEFAULT 0,
  basic_salary double precision DEFAULT 0,
  allowances_total double precision DEFAULT 0,
  overtime_pay double precision DEFAULT 0,
  bonus double precision DEFAULT 0,
  gross_pay double precision DEFAULT 0,
  absence_deduction double precision DEFAULT 0,
  late_deduction double precision DEFAULT 0,
  loan_deduction double precision DEFAULT 0,
  other_deductions double precision DEFAULT 0,
  total_deductions double precision DEFAULT 0,
  taxable_income double precision DEFAULT 0,
  tax_amount double precision DEFAULT 0,
  net_pay double precision DEFAULT 0,
  status text DEFAULT 'draft',
  time_entries_count double precision DEFAULT 0,
  line_items jsonb,
  notes text,
  reviewed_by text,
  reviewed_by_name text,
  reviewed_at text
);

-- Entity: PayrollLineItem
create table if not exists public.payroll_line_item (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  payroll_entry_id text not null,
  pay_period_id text,
  employee_id text not null,
  component_id text,
  component_name text,
  component_code text,
  type text not null,
  calculation_method text,
  base_amount double precision DEFAULT 0,
  rate double precision,
  amount double precision DEFAULT 0,
  notes text
);

-- Entity: PayrollSettings
create table if not exists public.payroll_settings (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  pay_frequency text DEFAULT 'monthly',
  pay_day double precision DEFAULT 25,
  shift_end_time text DEFAULT '17:00',
  overtime_threshold_daily_h double precision DEFAULT 8,
  overtime_use_clock_time boolean DEFAULT true,
  overtime_threshold_weekly_h double precision DEFAULT 40,
  overtime_multiplier double precision DEFAULT 1.5,
  overtime_multiplier_sunday double precision DEFAULT 2,
  overtime_multiplier_holiday double precision DEFAULT 2,
  overtime_fixed_rate double precision,
  overtime_fixed_rate_sunday double precision,
  overtime_fixed_rate_holiday double precision,
  public_holidays jsonb,
  working_days_per_month double precision DEFAULT 22,
  currency text DEFAULT 'AED',
  working_days_per_week double precision DEFAULT 5,
  working_hours_per_day double precision DEFAULT 8,
  default_annual_leave_days double precision DEFAULT 30,
  late_deduction_per_minute double precision DEFAULT 0,
  gratuity_enabled boolean DEFAULT true,
  gratuity_years_threshold double precision DEFAULT 1,
  gratuity_days_per_year double precision DEFAULT 21,
  annual_leave_bonus_enabled boolean DEFAULT true,
  social_insurance_enabled boolean DEFAULT false,
  social_insurance_employee_rate double precision DEFAULT 0,
  social_insurance_employer_rate double precision DEFAULT 0,
  default_tax_rate double precision DEFAULT 0,
  wps_enabled boolean DEFAULT false,
  company_registration_number text
);

-- Entity: PettyCashEntry
create table if not exists public.petty_cash_entry (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  type text DEFAULT 'expense',
  employee_id text not null,
  employee_name text,
  date date not null,
  provider text,
  note_number text,
  note text,
  amount double precision DEFAULT 0,
  currency text DEFAULT 'AED',
  category text,
  project_id text,
  project_name text,
  work_order_id text,
  work_order_name text,
  receipt_url text,
  ai_extracted boolean DEFAULT false,
  status text DEFAULT 'pending'
);

-- Entity: Product
create table if not exists public.product (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  code text not null,
  name text not null,
  type text DEFAULT 'Service',
  track_inventory boolean DEFAULT false,
  is_purchased boolean DEFAULT true,
  cost_price double precision DEFAULT 0,
  purchase_tax_rate double precision DEFAULT 0,
  purchase_description text,
  is_sold boolean DEFAULT true,
  sale_price double precision DEFAULT 0,
  sale_tax_rate double precision DEFAULT 0,
  sale_description text,
  quantity double precision DEFAULT 0,
  unit text,
  notes text
);

-- Entity: Project
create table if not exists public.project (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  reference text,
  type text DEFAULT 'Other',
  status text DEFAULT 'Active',
  contact_id text,
  contact_name text,
  contact_phone text,
  contact_email text,
  contact_person text,
  start_date date,
  end_date date,
  budget double precision,
  currency text DEFAULT 'USD',
  location text,
  location_name text,
  maps_link text,
  location_lat double precision,
  location_lng double precision,
  description text,
  notes text,
  tags text
);

-- Entity: ProjectCategory
create table if not exists public.project_category (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text
);

-- Entity: ProjectFile
create table if not exists public.project_file (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  reference text,
  project_id text not null,
  file_name text not null,
  file_url text not null,
  file_size double precision,
  file_type text,
  file_type_id text,
  file_type_name text,
  description text
);

-- Entity: ProjectNote
create table if not exists public.project_note (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  project_id text not null,
  note text not null,
  action text DEFAULT 'Note',
  user_name text
);

-- Entity: ProjectStatus
create table if not exists public.project_status (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#22c55e',
  description text
);

-- Entity: PurchaseOrder
create table if not exists public.purchase_order (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  number text,
  reference text,
  title text,
  doc_summary text,
  contact_id text not null,
  contact_name text,
  status text DEFAULT 'Draft',
  department text,
  issue_date date,
  delivery_date date,
  currency text DEFAULT 'AED',
  subtotal double precision DEFAULT 0,
  tax_amount double precision DEFAULT 0,
  total double precision DEFAULT 0,
  notes text,
  project_id text,
  project_name text,
  work_order_id text,
  work_order_name text,
  line_items jsonb
);

-- Entity: Quote
create table if not exists public.quote (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  number text,
  reference text,
  title text,
  doc_summary text,
  contact_id text not null,
  contact_name text,
  status text DEFAULT 'Draft',
  issue_date date,
  expiry_date date,
  currency text DEFAULT 'AED',
  incoterm text,
  subtotal double precision DEFAULT 0,
  tax_amount double precision DEFAULT 0,
  total double precision DEFAULT 0,
  notes text,
  terms text,
  project_id text,
  project_name text,
  work_order_id text,
  work_order_name text,
  task_ids jsonb,
  task_names jsonb,
  task_references jsonb,
  line_items jsonb,
  annex_photos jsonb
);

-- Entity: RetiredDocumentNumber
create table if not exists public.retired_document_number (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  doc_type text not null,
  number text not null,
  year double precision,
  prefix text,
  doc_id text,
  reason text
);

-- Entity: RolePermission
create table if not exists public.role_permission (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  role text not null,
  module text not null,
  can_view boolean DEFAULT false,
  can_create boolean DEFAULT false,
  can_edit boolean DEFAULT false,
  can_delete boolean DEFAULT false,
  can_approve boolean DEFAULT false,
  can_create_on_behalf boolean DEFAULT false
);

-- Entity: SalaryAuditLog
create table if not exists public.salary_audit_log (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  employee_id text not null,
  employee_name text,
  profile_id text,
  action text not null,
  source text DEFAULT 'individual_edit',
  field_changed text,
  old_value double precision,
  new_value double precision,
  change_amount double precision,
  performed_by_id text not null,
  performed_by_name text,
  timestamp text not null,
  notes text
);

-- Entity: SharedFile
create table if not exists public.shared_file (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  reference text,
  file_name text not null,
  file_url text not null,
  file_size double precision,
  file_type text,
  file_type_id text,
  file_type_name text,
  description text,
  post_date date,
  contact_id text,
  contact_name text,
  project_id text,
  project_name text,
  work_order_id text,
  work_order_name text,
  asset_id text,
  asset_name text
);

-- Entity: Task
create table if not exists public.task (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  reference text,
  title text not null,
  description text,
  status text DEFAULT 'Queued',
  category text,
  work_order_id text,
  work_order_name text,
  project_id text,
  project_name text,
  contact_id text,
  contact_name text,
  asset_id text,
  asset_name text,
  assigned_users jsonb,
  assigned_user_names jsonb,
  assigned_employees jsonb,
  assigned_employee_names jsonb,
  assigned_team_ids jsonb,
  assigned_team_names jsonb,
  planning_date date,
  planning_time_in text,
  planning_time_out text,
  priority text DEFAULT 'Medium',
  notes text,
  photos jsonb,
  location_lat double precision,
  location_lng double precision,
  location_address text,
  allowed_radius_m double precision DEFAULT 200,
  is_recurring boolean DEFAULT false,
  recurrence_frequency text,
  recurrence_day_of_month double precision,
  recurrence_day_of_week double precision,
  recurrence_end_date date,
  last_generated_date date,
  recurrence_template_id text
);

-- Entity: TaskCategory
create table if not exists public.task_category (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text
);

-- Entity: TaskHistory
create table if not exists public.task_history (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  task_id text not null,
  task_reference text,
  action text not null,
  detail text,
  user_name text,
  note text
);

-- Entity: TaskShift
create table if not exists public.task_shift (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  time_in text not null,
  time_out text not null,
  color text DEFAULT '#6366f1'
);

-- Entity: TaskStatus
create table if not exists public.task_status (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#22c55e',
  description text
);

-- Entity: TaskSubtask
create table if not exists public.task_subtask (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  task_id text not null,
  title text not null,
  done boolean DEFAULT false,
  sort_order double precision DEFAULT 0
);

-- Entity: TaxRate
create table if not exists public.tax_rate (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  rate double precision DEFAULT 0
);

-- Entity: Team
create table if not exists public.team (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text,
  leader_id text,
  leader_name text,
  employee_ids jsonb,
  employee_names jsonb,
  sort_order double precision DEFAULT 0
);

-- Entity: TimeAggregation
create table if not exists public.time_aggregation (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  entity_type text not null,
  entity_id text not null,
  entity_name text,
  period text not null,
  period_key text not null,
  total_minutes double precision DEFAULT 0,
  entry_count double precision DEFAULT 0
);

-- Entity: TimeEntry
create table if not exists public.time_entry (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  employee_id text not null,
  employee_name text,
  task_id text not null,
  task_title text,
  work_order_id text,
  work_order_name text,
  project_id text,
  project_name text,
  contact_id text,
  contact_name text,
  asset_id text,
  asset_name text,
  clock_in_time text not null,
  clock_out_time text,
  duration_minutes double precision,
  overtime_override_minutes double precision,
  status text DEFAULT 'Active',
  clock_in_lat double precision,
  clock_in_lng double precision,
  clock_in_address text,
  clock_in_photo_url text,
  clock_out_lat double precision,
  clock_out_lng double precision,
  clock_out_address text,
  clock_out_photo_url text,
  distance_from_task_m double precision,
  on_site boolean,
  switched_from_entry_id text,
  notes text
);

-- Entity: TimeEntryAmendment
create table if not exists public.time_entry_amendment (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  time_entry_id text not null,
  employee_id text not null,
  employee_name text,
  task_id text,
  task_title text,
  original_clock_in text,
  original_clock_out text,
  amended_clock_in text,
  amended_clock_out text,
  reason text,
  status text DEFAULT 'Pending',
  manager_notes text
);

-- Entity: User
create table if not exists public.users (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  role text DEFAULT 'user',
  email text,
  full_name text
);

-- Entity: WorkOrder
create table if not exists public.work_order (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  title text not null,
  reference text,
  status text DEFAULT 'Active',
  priority text DEFAULT 'Medium',
  type text DEFAULT 'Other',
  project_id text,
  project_name text,
  contact_id text,
  contact_name text,
  asset_id text,
  asset_name text,
  assigned_to text,
  scheduled_date date,
  due_date date,
  location text,
  maps_link text,
  location_lat double precision,
  location_lng double precision,
  description text,
  notes text
);

-- Entity: WorkOrderCategory
create table if not exists public.work_order_category (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#6366f1',
  description text
);

-- Entity: WorkOrderFile
create table if not exists public.work_order_file (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  reference text,
  work_order_id text not null,
  file_name text not null,
  file_url text not null,
  file_size double precision,
  file_type text,
  file_type_id text,
  file_type_name text,
  description text
);

-- Entity: WorkOrderNote
create table if not exists public.work_order_note (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  work_order_id text not null,
  note text not null,
  action text DEFAULT 'Note'
);

-- Entity: WorkOrderStatus
create table if not exists public.work_order_status (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  color text DEFAULT '#22c55e',
  description text
);

-- Entity: WorkerLocation
create table if not exists public.worker_location (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  time_entry_id text not null,
  employee_id text not null,
  employee_name text,
  task_id text,
  task_title text,
  lat double precision not null,
  lng double precision not null,
  address text,
  recorded_at text not null
);

-- Entity: WorkingReport
create table if not exists public.working_report (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  reference text,
  task_id text not null,
  task_reference text,
  task_title text,
  time_entry_id text not null,
  employee_id text,
  employee_name text,
  contact_id text,
  contact_name text,
  work_order_id text,
  work_order_name text,
  project_id text,
  project_name text,
  clock_in_time text,
  clock_out_time text,
  duration_minutes double precision,
  report_site_items jsonb,
  report_work_description text,
  report_balance_work text,
  report_client_comments text,
  report_client_signature text,
  on_site boolean,
  clock_in_address text,
  clock_out_address text,
  is_acting_leader boolean DEFAULT false,
  report_leader_name text,
  designated_leader_name text
);

-- Entity: WorkingReportTemplate
create table if not exists public.working_report_template (
  id text primary key,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text,
  created_by_id text,
  is_sample boolean default false,
  name text not null,
  max_reports_per_task double precision DEFAULT 99,
  ref_prefix text DEFAULT 'WR',
  ref_include_year boolean DEFAULT true,
  ref_number_padding double precision DEFAULT 4,
  ref_next_number double precision DEFAULT 1,
  accent_color text DEFAULT '#cc0000',
  logo_url text,
  show_logo boolean DEFAULT true,
  stamp_url text,
  show_stamp boolean DEFAULT false,
  company_name text,
  company_name_font_size double precision DEFAULT 22,
  company_address text,
  company_phone text,
  company_email text,
  company_website text,
  tax_id text,
  show_tax_number boolean DEFAULT true,
  report_title text DEFAULT 'SERVICE & MAINTENANCE REPORT',
  footer_notes text,
  is_default boolean DEFAULT false,
  layout jsonb DEFAULT '{}'::jsonb,
  schedule_orientation text DEFAULT 'portrait',
  schedule_paper_size text DEFAULT 'a4',
  schedule_font_size text DEFAULT 'medium',
  schedule_show_stats boolean DEFAULT true,
  schedule_show_assigned boolean DEFAULT true,
  schedule_show_location boolean DEFAULT true,
  schedule_show_equipment boolean DEFAULT true,
  schedule_show_switch_task boolean DEFAULT true
);

-- updated_date triggers
drop trigger if exists accounting_settings_set_updated_date on public.accounting_settings;
create trigger accounting_settings_set_updated_date before update on public.accounting_settings
for each row execute function public.set_updated_date();
drop trigger if exists asset_set_updated_date on public.asset;
create trigger asset_set_updated_date before update on public.asset
for each row execute function public.set_updated_date();
drop trigger if exists asset_category_set_updated_date on public.asset_category;
create trigger asset_category_set_updated_date before update on public.asset_category
for each row execute function public.set_updated_date();
drop trigger if exists asset_field_set_updated_date on public.asset_field;
create trigger asset_field_set_updated_date before update on public.asset_field
for each row execute function public.set_updated_date();
drop trigger if exists asset_file_set_updated_date on public.asset_file;
create trigger asset_file_set_updated_date before update on public.asset_file
for each row execute function public.set_updated_date();
drop trigger if exists asset_group_set_updated_date on public.asset_group;
create trigger asset_group_set_updated_date before update on public.asset_group
for each row execute function public.set_updated_date();
drop trigger if exists asset_note_set_updated_date on public.asset_note;
create trigger asset_note_set_updated_date before update on public.asset_note
for each row execute function public.set_updated_date();
drop trigger if exists asset_status_set_updated_date on public.asset_status;
create trigger asset_status_set_updated_date before update on public.asset_status
for each row execute function public.set_updated_date();
drop trigger if exists bank_account_set_updated_date on public.bank_account;
create trigger bank_account_set_updated_date before update on public.bank_account
for each row execute function public.set_updated_date();
drop trigger if exists bank_transaction_set_updated_date on public.bank_transaction;
create trigger bank_transaction_set_updated_date before update on public.bank_transaction
for each row execute function public.set_updated_date();
drop trigger if exists bill_set_updated_date on public.bill;
create trigger bill_set_updated_date before update on public.bill
for each row execute function public.set_updated_date();
drop trigger if exists chart_of_account_set_updated_date on public.chart_of_account;
create trigger chart_of_account_set_updated_date before update on public.chart_of_account
for each row execute function public.set_updated_date();
drop trigger if exists contact_set_updated_date on public.contact;
create trigger contact_set_updated_date before update on public.contact
for each row execute function public.set_updated_date();
drop trigger if exists contact_category_set_updated_date on public.contact_category;
create trigger contact_category_set_updated_date before update on public.contact_category
for each row execute function public.set_updated_date();
drop trigger if exists contact_file_set_updated_date on public.contact_file;
create trigger contact_file_set_updated_date before update on public.contact_file
for each row execute function public.set_updated_date();
drop trigger if exists contact_group_set_updated_date on public.contact_group;
create trigger contact_group_set_updated_date before update on public.contact_group
for each row execute function public.set_updated_date();
drop trigger if exists contact_note_set_updated_date on public.contact_note;
create trigger contact_note_set_updated_date before update on public.contact_note
for each row execute function public.set_updated_date();
drop trigger if exists contact_person_set_updated_date on public.contact_person;
create trigger contact_person_set_updated_date before update on public.contact_person
for each row execute function public.set_updated_date();
drop trigger if exists contact_status_set_updated_date on public.contact_status;
create trigger contact_status_set_updated_date before update on public.contact_status
for each row execute function public.set_updated_date();
drop trigger if exists document_file_set_updated_date on public.document_file;
create trigger document_file_set_updated_date before update on public.document_file
for each row execute function public.set_updated_date();
drop trigger if exists document_history_set_updated_date on public.document_history;
create trigger document_history_set_updated_date before update on public.document_history
for each row execute function public.set_updated_date();
drop trigger if exists document_template_set_updated_date on public.document_template;
create trigger document_template_set_updated_date before update on public.document_template
for each row execute function public.set_updated_date();
drop trigger if exists employee_set_updated_date on public.employee;
create trigger employee_set_updated_date before update on public.employee
for each row execute function public.set_updated_date();
drop trigger if exists employee_document_set_updated_date on public.employee_document;
create trigger employee_document_set_updated_date before update on public.employee_document
for each row execute function public.set_updated_date();
drop trigger if exists employee_document_type_set_updated_date on public.employee_document_type;
create trigger employee_document_type_set_updated_date before update on public.employee_document_type
for each row execute function public.set_updated_date();
drop trigger if exists employee_group_set_updated_date on public.employee_group;
create trigger employee_group_set_updated_date before update on public.employee_group
for each row execute function public.set_updated_date();
drop trigger if exists employee_loan_set_updated_date on public.employee_loan;
create trigger employee_loan_set_updated_date before update on public.employee_loan
for each row execute function public.set_updated_date();
drop trigger if exists employee_payroll_profile_set_updated_date on public.employee_payroll_profile;
create trigger employee_payroll_profile_set_updated_date before update on public.employee_payroll_profile
for each row execute function public.set_updated_date();
drop trigger if exists employee_role_set_updated_date on public.employee_role;
create trigger employee_role_set_updated_date before update on public.employee_role
for each row execute function public.set_updated_date();
drop trigger if exists employee_status_set_updated_date on public.employee_status;
create trigger employee_status_set_updated_date before update on public.employee_status
for each row execute function public.set_updated_date();
drop trigger if exists file_type_set_updated_date on public.file_type;
create trigger file_type_set_updated_date before update on public.file_type
for each row execute function public.set_updated_date();
drop trigger if exists historical_payment_set_updated_date on public.historical_payment;
create trigger historical_payment_set_updated_date before update on public.historical_payment
for each row execute function public.set_updated_date();
drop trigger if exists invoice_set_updated_date on public.invoice;
create trigger invoice_set_updated_date before update on public.invoice
for each row execute function public.set_updated_date();
drop trigger if exists journal_entry_set_updated_date on public.journal_entry;
create trigger journal_entry_set_updated_date before update on public.journal_entry
for each row execute function public.set_updated_date();
drop trigger if exists leave_request_set_updated_date on public.leave_request;
create trigger leave_request_set_updated_date before update on public.leave_request
for each row execute function public.set_updated_date();
drop trigger if exists mobile_app_set_updated_date on public.mobile_app;
create trigger mobile_app_set_updated_date before update on public.mobile_app
for each row execute function public.set_updated_date();
drop trigger if exists operations_settings_set_updated_date on public.operations_settings;
create trigger operations_settings_set_updated_date before update on public.operations_settings
for each row execute function public.set_updated_date();
drop trigger if exists organization_set_updated_date on public.organization;
create trigger organization_set_updated_date before update on public.organization
for each row execute function public.set_updated_date();
drop trigger if exists organization_file_set_updated_date on public.organization_file;
create trigger organization_file_set_updated_date before update on public.organization_file
for each row execute function public.set_updated_date();
drop trigger if exists pay_period_set_updated_date on public.pay_period;
create trigger pay_period_set_updated_date before update on public.pay_period
for each row execute function public.set_updated_date();
drop trigger if exists payroll_audit_log_set_updated_date on public.payroll_audit_log;
create trigger payroll_audit_log_set_updated_date before update on public.payroll_audit_log
for each row execute function public.set_updated_date();
drop trigger if exists payroll_component_set_updated_date on public.payroll_component;
create trigger payroll_component_set_updated_date before update on public.payroll_component
for each row execute function public.set_updated_date();
drop trigger if exists payroll_entry_set_updated_date on public.payroll_entry;
create trigger payroll_entry_set_updated_date before update on public.payroll_entry
for each row execute function public.set_updated_date();
drop trigger if exists payroll_line_item_set_updated_date on public.payroll_line_item;
create trigger payroll_line_item_set_updated_date before update on public.payroll_line_item
for each row execute function public.set_updated_date();
drop trigger if exists payroll_settings_set_updated_date on public.payroll_settings;
create trigger payroll_settings_set_updated_date before update on public.payroll_settings
for each row execute function public.set_updated_date();
drop trigger if exists petty_cash_entry_set_updated_date on public.petty_cash_entry;
create trigger petty_cash_entry_set_updated_date before update on public.petty_cash_entry
for each row execute function public.set_updated_date();
drop trigger if exists product_set_updated_date on public.product;
create trigger product_set_updated_date before update on public.product
for each row execute function public.set_updated_date();
drop trigger if exists project_set_updated_date on public.project;
create trigger project_set_updated_date before update on public.project
for each row execute function public.set_updated_date();
drop trigger if exists project_category_set_updated_date on public.project_category;
create trigger project_category_set_updated_date before update on public.project_category
for each row execute function public.set_updated_date();
drop trigger if exists project_file_set_updated_date on public.project_file;
create trigger project_file_set_updated_date before update on public.project_file
for each row execute function public.set_updated_date();
drop trigger if exists project_note_set_updated_date on public.project_note;
create trigger project_note_set_updated_date before update on public.project_note
for each row execute function public.set_updated_date();
drop trigger if exists project_status_set_updated_date on public.project_status;
create trigger project_status_set_updated_date before update on public.project_status
for each row execute function public.set_updated_date();
drop trigger if exists purchase_order_set_updated_date on public.purchase_order;
create trigger purchase_order_set_updated_date before update on public.purchase_order
for each row execute function public.set_updated_date();
drop trigger if exists quote_set_updated_date on public.quote;
create trigger quote_set_updated_date before update on public.quote
for each row execute function public.set_updated_date();
drop trigger if exists retired_document_number_set_updated_date on public.retired_document_number;
create trigger retired_document_number_set_updated_date before update on public.retired_document_number
for each row execute function public.set_updated_date();
drop trigger if exists role_permission_set_updated_date on public.role_permission;
create trigger role_permission_set_updated_date before update on public.role_permission
for each row execute function public.set_updated_date();
drop trigger if exists salary_audit_log_set_updated_date on public.salary_audit_log;
create trigger salary_audit_log_set_updated_date before update on public.salary_audit_log
for each row execute function public.set_updated_date();
drop trigger if exists shared_file_set_updated_date on public.shared_file;
create trigger shared_file_set_updated_date before update on public.shared_file
for each row execute function public.set_updated_date();
drop trigger if exists task_set_updated_date on public.task;
create trigger task_set_updated_date before update on public.task
for each row execute function public.set_updated_date();
drop trigger if exists task_category_set_updated_date on public.task_category;
create trigger task_category_set_updated_date before update on public.task_category
for each row execute function public.set_updated_date();
drop trigger if exists task_history_set_updated_date on public.task_history;
create trigger task_history_set_updated_date before update on public.task_history
for each row execute function public.set_updated_date();
drop trigger if exists task_shift_set_updated_date on public.task_shift;
create trigger task_shift_set_updated_date before update on public.task_shift
for each row execute function public.set_updated_date();
drop trigger if exists task_status_set_updated_date on public.task_status;
create trigger task_status_set_updated_date before update on public.task_status
for each row execute function public.set_updated_date();
drop trigger if exists task_subtask_set_updated_date on public.task_subtask;
create trigger task_subtask_set_updated_date before update on public.task_subtask
for each row execute function public.set_updated_date();
drop trigger if exists tax_rate_set_updated_date on public.tax_rate;
create trigger tax_rate_set_updated_date before update on public.tax_rate
for each row execute function public.set_updated_date();
drop trigger if exists team_set_updated_date on public.team;
create trigger team_set_updated_date before update on public.team
for each row execute function public.set_updated_date();
drop trigger if exists time_aggregation_set_updated_date on public.time_aggregation;
create trigger time_aggregation_set_updated_date before update on public.time_aggregation
for each row execute function public.set_updated_date();
drop trigger if exists time_entry_set_updated_date on public.time_entry;
create trigger time_entry_set_updated_date before update on public.time_entry
for each row execute function public.set_updated_date();
drop trigger if exists time_entry_amendment_set_updated_date on public.time_entry_amendment;
create trigger time_entry_amendment_set_updated_date before update on public.time_entry_amendment
for each row execute function public.set_updated_date();
drop trigger if exists users_set_updated_date on public.users;
create trigger users_set_updated_date before update on public.users
for each row execute function public.set_updated_date();
drop trigger if exists work_order_set_updated_date on public.work_order;
create trigger work_order_set_updated_date before update on public.work_order
for each row execute function public.set_updated_date();
drop trigger if exists work_order_category_set_updated_date on public.work_order_category;
create trigger work_order_category_set_updated_date before update on public.work_order_category
for each row execute function public.set_updated_date();
drop trigger if exists work_order_file_set_updated_date on public.work_order_file;
create trigger work_order_file_set_updated_date before update on public.work_order_file
for each row execute function public.set_updated_date();
drop trigger if exists work_order_note_set_updated_date on public.work_order_note;
create trigger work_order_note_set_updated_date before update on public.work_order_note
for each row execute function public.set_updated_date();
drop trigger if exists work_order_status_set_updated_date on public.work_order_status;
create trigger work_order_status_set_updated_date before update on public.work_order_status
for each row execute function public.set_updated_date();
drop trigger if exists worker_location_set_updated_date on public.worker_location;
create trigger worker_location_set_updated_date before update on public.worker_location
for each row execute function public.set_updated_date();
drop trigger if exists working_report_set_updated_date on public.working_report;
create trigger working_report_set_updated_date before update on public.working_report
for each row execute function public.set_updated_date();
drop trigger if exists working_report_template_set_updated_date on public.working_report_template;
create trigger working_report_template_set_updated_date before update on public.working_report_template
for each row execute function public.set_updated_date();

-- Basic indexes on common foreign-key style fields
create index if not exists accounting_settings_created_date_idx on public.accounting_settings (created_date desc);
create index if not exists accounting_settings_created_by_id_idx on public.accounting_settings (created_by_id);
create index if not exists asset_created_date_idx on public.asset (created_date desc);
create index if not exists asset_created_by_id_idx on public.asset (created_by_id);
create index if not exists asset_category_created_date_idx on public.asset_category (created_date desc);
create index if not exists asset_category_created_by_id_idx on public.asset_category (created_by_id);
create index if not exists asset_field_created_date_idx on public.asset_field (created_date desc);
create index if not exists asset_field_created_by_id_idx on public.asset_field (created_by_id);
create index if not exists asset_file_created_date_idx on public.asset_file (created_date desc);
create index if not exists asset_file_created_by_id_idx on public.asset_file (created_by_id);
create index if not exists asset_group_created_date_idx on public.asset_group (created_date desc);
create index if not exists asset_group_created_by_id_idx on public.asset_group (created_by_id);
create index if not exists asset_note_created_date_idx on public.asset_note (created_date desc);
create index if not exists asset_note_created_by_id_idx on public.asset_note (created_by_id);
create index if not exists asset_status_created_date_idx on public.asset_status (created_date desc);
create index if not exists asset_status_created_by_id_idx on public.asset_status (created_by_id);
create index if not exists bank_account_created_date_idx on public.bank_account (created_date desc);
create index if not exists bank_account_created_by_id_idx on public.bank_account (created_by_id);
create index if not exists bank_transaction_created_date_idx on public.bank_transaction (created_date desc);
create index if not exists bank_transaction_created_by_id_idx on public.bank_transaction (created_by_id);
create index if not exists bill_created_date_idx on public.bill (created_date desc);
create index if not exists bill_created_by_id_idx on public.bill (created_by_id);
create index if not exists chart_of_account_created_date_idx on public.chart_of_account (created_date desc);
create index if not exists chart_of_account_created_by_id_idx on public.chart_of_account (created_by_id);
create index if not exists contact_created_date_idx on public.contact (created_date desc);
create index if not exists contact_created_by_id_idx on public.contact (created_by_id);
create index if not exists contact_category_created_date_idx on public.contact_category (created_date desc);
create index if not exists contact_category_created_by_id_idx on public.contact_category (created_by_id);
create index if not exists contact_file_created_date_idx on public.contact_file (created_date desc);
create index if not exists contact_file_created_by_id_idx on public.contact_file (created_by_id);
create index if not exists contact_group_created_date_idx on public.contact_group (created_date desc);
create index if not exists contact_group_created_by_id_idx on public.contact_group (created_by_id);
create index if not exists contact_note_created_date_idx on public.contact_note (created_date desc);
create index if not exists contact_note_created_by_id_idx on public.contact_note (created_by_id);
create index if not exists contact_person_created_date_idx on public.contact_person (created_date desc);
create index if not exists contact_person_created_by_id_idx on public.contact_person (created_by_id);
create index if not exists contact_status_created_date_idx on public.contact_status (created_date desc);
create index if not exists contact_status_created_by_id_idx on public.contact_status (created_by_id);
create index if not exists document_file_created_date_idx on public.document_file (created_date desc);
create index if not exists document_file_created_by_id_idx on public.document_file (created_by_id);
create index if not exists document_history_created_date_idx on public.document_history (created_date desc);
create index if not exists document_history_created_by_id_idx on public.document_history (created_by_id);
create index if not exists document_template_created_date_idx on public.document_template (created_date desc);
create index if not exists document_template_created_by_id_idx on public.document_template (created_by_id);
create index if not exists employee_created_date_idx on public.employee (created_date desc);
create index if not exists employee_created_by_id_idx on public.employee (created_by_id);
create index if not exists employee_document_created_date_idx on public.employee_document (created_date desc);
create index if not exists employee_document_created_by_id_idx on public.employee_document (created_by_id);
create index if not exists employee_document_type_created_date_idx on public.employee_document_type (created_date desc);
create index if not exists employee_document_type_created_by_id_idx on public.employee_document_type (created_by_id);
create index if not exists employee_group_created_date_idx on public.employee_group (created_date desc);
create index if not exists employee_group_created_by_id_idx on public.employee_group (created_by_id);
create index if not exists employee_loan_created_date_idx on public.employee_loan (created_date desc);
create index if not exists employee_loan_created_by_id_idx on public.employee_loan (created_by_id);
create index if not exists employee_payroll_profile_created_date_idx on public.employee_payroll_profile (created_date desc);
create index if not exists employee_payroll_profile_created_by_id_idx on public.employee_payroll_profile (created_by_id);
create index if not exists employee_role_created_date_idx on public.employee_role (created_date desc);
create index if not exists employee_role_created_by_id_idx on public.employee_role (created_by_id);
create index if not exists employee_status_created_date_idx on public.employee_status (created_date desc);
create index if not exists employee_status_created_by_id_idx on public.employee_status (created_by_id);
create index if not exists file_type_created_date_idx on public.file_type (created_date desc);
create index if not exists file_type_created_by_id_idx on public.file_type (created_by_id);
create index if not exists historical_payment_created_date_idx on public.historical_payment (created_date desc);
create index if not exists historical_payment_created_by_id_idx on public.historical_payment (created_by_id);
create index if not exists invoice_created_date_idx on public.invoice (created_date desc);
create index if not exists invoice_created_by_id_idx on public.invoice (created_by_id);
create index if not exists journal_entry_created_date_idx on public.journal_entry (created_date desc);
create index if not exists journal_entry_created_by_id_idx on public.journal_entry (created_by_id);
create index if not exists leave_request_created_date_idx on public.leave_request (created_date desc);
create index if not exists leave_request_created_by_id_idx on public.leave_request (created_by_id);
create index if not exists mobile_app_created_date_idx on public.mobile_app (created_date desc);
create index if not exists mobile_app_created_by_id_idx on public.mobile_app (created_by_id);
create index if not exists operations_settings_created_date_idx on public.operations_settings (created_date desc);
create index if not exists operations_settings_created_by_id_idx on public.operations_settings (created_by_id);
create index if not exists organization_created_date_idx on public.organization (created_date desc);
create index if not exists organization_created_by_id_idx on public.organization (created_by_id);
create index if not exists organization_file_created_date_idx on public.organization_file (created_date desc);
create index if not exists organization_file_created_by_id_idx on public.organization_file (created_by_id);
create index if not exists pay_period_created_date_idx on public.pay_period (created_date desc);
create index if not exists pay_period_created_by_id_idx on public.pay_period (created_by_id);
create index if not exists payroll_audit_log_created_date_idx on public.payroll_audit_log (created_date desc);
create index if not exists payroll_audit_log_created_by_id_idx on public.payroll_audit_log (created_by_id);
create index if not exists payroll_component_created_date_idx on public.payroll_component (created_date desc);
create index if not exists payroll_component_created_by_id_idx on public.payroll_component (created_by_id);
create index if not exists payroll_entry_created_date_idx on public.payroll_entry (created_date desc);
create index if not exists payroll_entry_created_by_id_idx on public.payroll_entry (created_by_id);
create index if not exists payroll_line_item_created_date_idx on public.payroll_line_item (created_date desc);
create index if not exists payroll_line_item_created_by_id_idx on public.payroll_line_item (created_by_id);
create index if not exists payroll_settings_created_date_idx on public.payroll_settings (created_date desc);
create index if not exists payroll_settings_created_by_id_idx on public.payroll_settings (created_by_id);
create index if not exists petty_cash_entry_created_date_idx on public.petty_cash_entry (created_date desc);
create index if not exists petty_cash_entry_created_by_id_idx on public.petty_cash_entry (created_by_id);
create index if not exists product_created_date_idx on public.product (created_date desc);
create index if not exists product_created_by_id_idx on public.product (created_by_id);
create index if not exists project_created_date_idx on public.project (created_date desc);
create index if not exists project_created_by_id_idx on public.project (created_by_id);
create index if not exists project_category_created_date_idx on public.project_category (created_date desc);
create index if not exists project_category_created_by_id_idx on public.project_category (created_by_id);
create index if not exists project_file_created_date_idx on public.project_file (created_date desc);
create index if not exists project_file_created_by_id_idx on public.project_file (created_by_id);
create index if not exists project_note_created_date_idx on public.project_note (created_date desc);
create index if not exists project_note_created_by_id_idx on public.project_note (created_by_id);
create index if not exists project_status_created_date_idx on public.project_status (created_date desc);
create index if not exists project_status_created_by_id_idx on public.project_status (created_by_id);
create index if not exists purchase_order_created_date_idx on public.purchase_order (created_date desc);
create index if not exists purchase_order_created_by_id_idx on public.purchase_order (created_by_id);
create index if not exists quote_created_date_idx on public.quote (created_date desc);
create index if not exists quote_created_by_id_idx on public.quote (created_by_id);
create index if not exists retired_document_number_created_date_idx on public.retired_document_number (created_date desc);
create index if not exists retired_document_number_created_by_id_idx on public.retired_document_number (created_by_id);
create index if not exists role_permission_created_date_idx on public.role_permission (created_date desc);
create index if not exists role_permission_created_by_id_idx on public.role_permission (created_by_id);
create index if not exists salary_audit_log_created_date_idx on public.salary_audit_log (created_date desc);
create index if not exists salary_audit_log_created_by_id_idx on public.salary_audit_log (created_by_id);
create index if not exists shared_file_created_date_idx on public.shared_file (created_date desc);
create index if not exists shared_file_created_by_id_idx on public.shared_file (created_by_id);
create index if not exists task_created_date_idx on public.task (created_date desc);
create index if not exists task_created_by_id_idx on public.task (created_by_id);
create index if not exists task_category_created_date_idx on public.task_category (created_date desc);
create index if not exists task_category_created_by_id_idx on public.task_category (created_by_id);
create index if not exists task_history_created_date_idx on public.task_history (created_date desc);
create index if not exists task_history_created_by_id_idx on public.task_history (created_by_id);
create index if not exists task_shift_created_date_idx on public.task_shift (created_date desc);
create index if not exists task_shift_created_by_id_idx on public.task_shift (created_by_id);
create index if not exists task_status_created_date_idx on public.task_status (created_date desc);
create index if not exists task_status_created_by_id_idx on public.task_status (created_by_id);
create index if not exists task_subtask_created_date_idx on public.task_subtask (created_date desc);
create index if not exists task_subtask_created_by_id_idx on public.task_subtask (created_by_id);
create index if not exists tax_rate_created_date_idx on public.tax_rate (created_date desc);
create index if not exists tax_rate_created_by_id_idx on public.tax_rate (created_by_id);
create index if not exists team_created_date_idx on public.team (created_date desc);
create index if not exists team_created_by_id_idx on public.team (created_by_id);
create index if not exists time_aggregation_created_date_idx on public.time_aggregation (created_date desc);
create index if not exists time_aggregation_created_by_id_idx on public.time_aggregation (created_by_id);
create index if not exists time_entry_created_date_idx on public.time_entry (created_date desc);
create index if not exists time_entry_created_by_id_idx on public.time_entry (created_by_id);
create index if not exists time_entry_amendment_created_date_idx on public.time_entry_amendment (created_date desc);
create index if not exists time_entry_amendment_created_by_id_idx on public.time_entry_amendment (created_by_id);
create index if not exists users_created_date_idx on public.users (created_date desc);
create index if not exists users_created_by_id_idx on public.users (created_by_id);
create index if not exists work_order_created_date_idx on public.work_order (created_date desc);
create index if not exists work_order_created_by_id_idx on public.work_order (created_by_id);
create index if not exists work_order_category_created_date_idx on public.work_order_category (created_date desc);
create index if not exists work_order_category_created_by_id_idx on public.work_order_category (created_by_id);
create index if not exists work_order_file_created_date_idx on public.work_order_file (created_date desc);
create index if not exists work_order_file_created_by_id_idx on public.work_order_file (created_by_id);
create index if not exists work_order_note_created_date_idx on public.work_order_note (created_date desc);
create index if not exists work_order_note_created_by_id_idx on public.work_order_note (created_by_id);
create index if not exists work_order_status_created_date_idx on public.work_order_status (created_date desc);
create index if not exists work_order_status_created_by_id_idx on public.work_order_status (created_by_id);
create index if not exists worker_location_created_date_idx on public.worker_location (created_date desc);
create index if not exists worker_location_created_by_id_idx on public.worker_location (created_by_id);
create index if not exists working_report_created_date_idx on public.working_report (created_date desc);
create index if not exists working_report_created_by_id_idx on public.working_report (created_by_id);
create index if not exists working_report_template_created_date_idx on public.working_report_template (created_date desc);
create index if not exists working_report_template_created_by_id_idx on public.working_report_template (created_by_id);

-- Enable RLS (policies: authenticated full access for migration phase)
alter table public.accounting_settings enable row level security;
drop policy if exists accounting_settings_authenticated_all on public.accounting_settings;
create policy accounting_settings_authenticated_all on public.accounting_settings
  for all to authenticated using (true) with check (true);
alter table public.asset enable row level security;
drop policy if exists asset_authenticated_all on public.asset;
create policy asset_authenticated_all on public.asset
  for all to authenticated using (true) with check (true);
alter table public.asset_category enable row level security;
drop policy if exists asset_category_authenticated_all on public.asset_category;
create policy asset_category_authenticated_all on public.asset_category
  for all to authenticated using (true) with check (true);
alter table public.asset_field enable row level security;
drop policy if exists asset_field_authenticated_all on public.asset_field;
create policy asset_field_authenticated_all on public.asset_field
  for all to authenticated using (true) with check (true);
alter table public.asset_file enable row level security;
drop policy if exists asset_file_authenticated_all on public.asset_file;
create policy asset_file_authenticated_all on public.asset_file
  for all to authenticated using (true) with check (true);
alter table public.asset_group enable row level security;
drop policy if exists asset_group_authenticated_all on public.asset_group;
create policy asset_group_authenticated_all on public.asset_group
  for all to authenticated using (true) with check (true);
alter table public.asset_note enable row level security;
drop policy if exists asset_note_authenticated_all on public.asset_note;
create policy asset_note_authenticated_all on public.asset_note
  for all to authenticated using (true) with check (true);
alter table public.asset_status enable row level security;
drop policy if exists asset_status_authenticated_all on public.asset_status;
create policy asset_status_authenticated_all on public.asset_status
  for all to authenticated using (true) with check (true);
alter table public.bank_account enable row level security;
drop policy if exists bank_account_authenticated_all on public.bank_account;
create policy bank_account_authenticated_all on public.bank_account
  for all to authenticated using (true) with check (true);
alter table public.bank_transaction enable row level security;
drop policy if exists bank_transaction_authenticated_all on public.bank_transaction;
create policy bank_transaction_authenticated_all on public.bank_transaction
  for all to authenticated using (true) with check (true);
alter table public.bill enable row level security;
drop policy if exists bill_authenticated_all on public.bill;
create policy bill_authenticated_all on public.bill
  for all to authenticated using (true) with check (true);
alter table public.chart_of_account enable row level security;
drop policy if exists chart_of_account_authenticated_all on public.chart_of_account;
create policy chart_of_account_authenticated_all on public.chart_of_account
  for all to authenticated using (true) with check (true);
alter table public.contact enable row level security;
drop policy if exists contact_authenticated_all on public.contact;
create policy contact_authenticated_all on public.contact
  for all to authenticated using (true) with check (true);
alter table public.contact_category enable row level security;
drop policy if exists contact_category_authenticated_all on public.contact_category;
create policy contact_category_authenticated_all on public.contact_category
  for all to authenticated using (true) with check (true);
alter table public.contact_file enable row level security;
drop policy if exists contact_file_authenticated_all on public.contact_file;
create policy contact_file_authenticated_all on public.contact_file
  for all to authenticated using (true) with check (true);
alter table public.contact_group enable row level security;
drop policy if exists contact_group_authenticated_all on public.contact_group;
create policy contact_group_authenticated_all on public.contact_group
  for all to authenticated using (true) with check (true);
alter table public.contact_note enable row level security;
drop policy if exists contact_note_authenticated_all on public.contact_note;
create policy contact_note_authenticated_all on public.contact_note
  for all to authenticated using (true) with check (true);
alter table public.contact_person enable row level security;
drop policy if exists contact_person_authenticated_all on public.contact_person;
create policy contact_person_authenticated_all on public.contact_person
  for all to authenticated using (true) with check (true);
alter table public.contact_status enable row level security;
drop policy if exists contact_status_authenticated_all on public.contact_status;
create policy contact_status_authenticated_all on public.contact_status
  for all to authenticated using (true) with check (true);
alter table public.document_file enable row level security;
drop policy if exists document_file_authenticated_all on public.document_file;
create policy document_file_authenticated_all on public.document_file
  for all to authenticated using (true) with check (true);
alter table public.document_history enable row level security;
drop policy if exists document_history_authenticated_all on public.document_history;
create policy document_history_authenticated_all on public.document_history
  for all to authenticated using (true) with check (true);
alter table public.document_template enable row level security;
drop policy if exists document_template_authenticated_all on public.document_template;
create policy document_template_authenticated_all on public.document_template
  for all to authenticated using (true) with check (true);
alter table public.employee enable row level security;
drop policy if exists employee_authenticated_all on public.employee;
create policy employee_authenticated_all on public.employee
  for all to authenticated using (true) with check (true);
alter table public.employee_document enable row level security;
drop policy if exists employee_document_authenticated_all on public.employee_document;
create policy employee_document_authenticated_all on public.employee_document
  for all to authenticated using (true) with check (true);
alter table public.employee_document_type enable row level security;
drop policy if exists employee_document_type_authenticated_all on public.employee_document_type;
create policy employee_document_type_authenticated_all on public.employee_document_type
  for all to authenticated using (true) with check (true);
alter table public.employee_group enable row level security;
drop policy if exists employee_group_authenticated_all on public.employee_group;
create policy employee_group_authenticated_all on public.employee_group
  for all to authenticated using (true) with check (true);
alter table public.employee_loan enable row level security;
drop policy if exists employee_loan_authenticated_all on public.employee_loan;
create policy employee_loan_authenticated_all on public.employee_loan
  for all to authenticated using (true) with check (true);
alter table public.employee_payroll_profile enable row level security;
drop policy if exists employee_payroll_profile_authenticated_all on public.employee_payroll_profile;
create policy employee_payroll_profile_authenticated_all on public.employee_payroll_profile
  for all to authenticated using (true) with check (true);
alter table public.employee_role enable row level security;
drop policy if exists employee_role_authenticated_all on public.employee_role;
create policy employee_role_authenticated_all on public.employee_role
  for all to authenticated using (true) with check (true);
alter table public.employee_status enable row level security;
drop policy if exists employee_status_authenticated_all on public.employee_status;
create policy employee_status_authenticated_all on public.employee_status
  for all to authenticated using (true) with check (true);
alter table public.file_type enable row level security;
drop policy if exists file_type_authenticated_all on public.file_type;
create policy file_type_authenticated_all on public.file_type
  for all to authenticated using (true) with check (true);
alter table public.historical_payment enable row level security;
drop policy if exists historical_payment_authenticated_all on public.historical_payment;
create policy historical_payment_authenticated_all on public.historical_payment
  for all to authenticated using (true) with check (true);
alter table public.invoice enable row level security;
drop policy if exists invoice_authenticated_all on public.invoice;
create policy invoice_authenticated_all on public.invoice
  for all to authenticated using (true) with check (true);
alter table public.journal_entry enable row level security;
drop policy if exists journal_entry_authenticated_all on public.journal_entry;
create policy journal_entry_authenticated_all on public.journal_entry
  for all to authenticated using (true) with check (true);
alter table public.leave_request enable row level security;
drop policy if exists leave_request_authenticated_all on public.leave_request;
create policy leave_request_authenticated_all on public.leave_request
  for all to authenticated using (true) with check (true);
alter table public.mobile_app enable row level security;
drop policy if exists mobile_app_authenticated_all on public.mobile_app;
create policy mobile_app_authenticated_all on public.mobile_app
  for all to authenticated using (true) with check (true);
alter table public.operations_settings enable row level security;
drop policy if exists operations_settings_authenticated_all on public.operations_settings;
create policy operations_settings_authenticated_all on public.operations_settings
  for all to authenticated using (true) with check (true);
alter table public.organization enable row level security;
drop policy if exists organization_authenticated_all on public.organization;
create policy organization_authenticated_all on public.organization
  for all to authenticated using (true) with check (true);
alter table public.organization_file enable row level security;
drop policy if exists organization_file_authenticated_all on public.organization_file;
create policy organization_file_authenticated_all on public.organization_file
  for all to authenticated using (true) with check (true);
alter table public.pay_period enable row level security;
drop policy if exists pay_period_authenticated_all on public.pay_period;
create policy pay_period_authenticated_all on public.pay_period
  for all to authenticated using (true) with check (true);
alter table public.payroll_audit_log enable row level security;
drop policy if exists payroll_audit_log_authenticated_all on public.payroll_audit_log;
create policy payroll_audit_log_authenticated_all on public.payroll_audit_log
  for all to authenticated using (true) with check (true);
alter table public.payroll_component enable row level security;
drop policy if exists payroll_component_authenticated_all on public.payroll_component;
create policy payroll_component_authenticated_all on public.payroll_component
  for all to authenticated using (true) with check (true);
alter table public.payroll_entry enable row level security;
drop policy if exists payroll_entry_authenticated_all on public.payroll_entry;
create policy payroll_entry_authenticated_all on public.payroll_entry
  for all to authenticated using (true) with check (true);
alter table public.payroll_line_item enable row level security;
drop policy if exists payroll_line_item_authenticated_all on public.payroll_line_item;
create policy payroll_line_item_authenticated_all on public.payroll_line_item
  for all to authenticated using (true) with check (true);
alter table public.payroll_settings enable row level security;
drop policy if exists payroll_settings_authenticated_all on public.payroll_settings;
create policy payroll_settings_authenticated_all on public.payroll_settings
  for all to authenticated using (true) with check (true);
alter table public.petty_cash_entry enable row level security;
drop policy if exists petty_cash_entry_authenticated_all on public.petty_cash_entry;
create policy petty_cash_entry_authenticated_all on public.petty_cash_entry
  for all to authenticated using (true) with check (true);
alter table public.product enable row level security;
drop policy if exists product_authenticated_all on public.product;
create policy product_authenticated_all on public.product
  for all to authenticated using (true) with check (true);
alter table public.project enable row level security;
drop policy if exists project_authenticated_all on public.project;
create policy project_authenticated_all on public.project
  for all to authenticated using (true) with check (true);
alter table public.project_category enable row level security;
drop policy if exists project_category_authenticated_all on public.project_category;
create policy project_category_authenticated_all on public.project_category
  for all to authenticated using (true) with check (true);
alter table public.project_file enable row level security;
drop policy if exists project_file_authenticated_all on public.project_file;
create policy project_file_authenticated_all on public.project_file
  for all to authenticated using (true) with check (true);
alter table public.project_note enable row level security;
drop policy if exists project_note_authenticated_all on public.project_note;
create policy project_note_authenticated_all on public.project_note
  for all to authenticated using (true) with check (true);
alter table public.project_status enable row level security;
drop policy if exists project_status_authenticated_all on public.project_status;
create policy project_status_authenticated_all on public.project_status
  for all to authenticated using (true) with check (true);
alter table public.purchase_order enable row level security;
drop policy if exists purchase_order_authenticated_all on public.purchase_order;
create policy purchase_order_authenticated_all on public.purchase_order
  for all to authenticated using (true) with check (true);
alter table public.quote enable row level security;
drop policy if exists quote_authenticated_all on public.quote;
create policy quote_authenticated_all on public.quote
  for all to authenticated using (true) with check (true);
alter table public.retired_document_number enable row level security;
drop policy if exists retired_document_number_authenticated_all on public.retired_document_number;
create policy retired_document_number_authenticated_all on public.retired_document_number
  for all to authenticated using (true) with check (true);
alter table public.role_permission enable row level security;
drop policy if exists role_permission_authenticated_all on public.role_permission;
create policy role_permission_authenticated_all on public.role_permission
  for all to authenticated using (true) with check (true);
alter table public.salary_audit_log enable row level security;
drop policy if exists salary_audit_log_authenticated_all on public.salary_audit_log;
create policy salary_audit_log_authenticated_all on public.salary_audit_log
  for all to authenticated using (true) with check (true);
alter table public.shared_file enable row level security;
drop policy if exists shared_file_authenticated_all on public.shared_file;
create policy shared_file_authenticated_all on public.shared_file
  for all to authenticated using (true) with check (true);
alter table public.task enable row level security;
drop policy if exists task_authenticated_all on public.task;
create policy task_authenticated_all on public.task
  for all to authenticated using (true) with check (true);
alter table public.task_category enable row level security;
drop policy if exists task_category_authenticated_all on public.task_category;
create policy task_category_authenticated_all on public.task_category
  for all to authenticated using (true) with check (true);
alter table public.task_history enable row level security;
drop policy if exists task_history_authenticated_all on public.task_history;
create policy task_history_authenticated_all on public.task_history
  for all to authenticated using (true) with check (true);
alter table public.task_shift enable row level security;
drop policy if exists task_shift_authenticated_all on public.task_shift;
create policy task_shift_authenticated_all on public.task_shift
  for all to authenticated using (true) with check (true);
alter table public.task_status enable row level security;
drop policy if exists task_status_authenticated_all on public.task_status;
create policy task_status_authenticated_all on public.task_status
  for all to authenticated using (true) with check (true);
alter table public.task_subtask enable row level security;
drop policy if exists task_subtask_authenticated_all on public.task_subtask;
create policy task_subtask_authenticated_all on public.task_subtask
  for all to authenticated using (true) with check (true);
alter table public.tax_rate enable row level security;
drop policy if exists tax_rate_authenticated_all on public.tax_rate;
create policy tax_rate_authenticated_all on public.tax_rate
  for all to authenticated using (true) with check (true);
alter table public.team enable row level security;
drop policy if exists team_authenticated_all on public.team;
create policy team_authenticated_all on public.team
  for all to authenticated using (true) with check (true);
alter table public.time_aggregation enable row level security;
drop policy if exists time_aggregation_authenticated_all on public.time_aggregation;
create policy time_aggregation_authenticated_all on public.time_aggregation
  for all to authenticated using (true) with check (true);
alter table public.time_entry enable row level security;
drop policy if exists time_entry_authenticated_all on public.time_entry;
create policy time_entry_authenticated_all on public.time_entry
  for all to authenticated using (true) with check (true);
alter table public.time_entry_amendment enable row level security;
drop policy if exists time_entry_amendment_authenticated_all on public.time_entry_amendment;
create policy time_entry_amendment_authenticated_all on public.time_entry_amendment
  for all to authenticated using (true) with check (true);
alter table public.users enable row level security;
drop policy if exists users_authenticated_all on public.users;
create policy users_authenticated_all on public.users
  for all to authenticated using (true) with check (true);
alter table public.work_order enable row level security;
drop policy if exists work_order_authenticated_all on public.work_order;
create policy work_order_authenticated_all on public.work_order
  for all to authenticated using (true) with check (true);
alter table public.work_order_category enable row level security;
drop policy if exists work_order_category_authenticated_all on public.work_order_category;
create policy work_order_category_authenticated_all on public.work_order_category
  for all to authenticated using (true) with check (true);
alter table public.work_order_file enable row level security;
drop policy if exists work_order_file_authenticated_all on public.work_order_file;
create policy work_order_file_authenticated_all on public.work_order_file
  for all to authenticated using (true) with check (true);
alter table public.work_order_note enable row level security;
drop policy if exists work_order_note_authenticated_all on public.work_order_note;
create policy work_order_note_authenticated_all on public.work_order_note
  for all to authenticated using (true) with check (true);
alter table public.work_order_status enable row level security;
drop policy if exists work_order_status_authenticated_all on public.work_order_status;
create policy work_order_status_authenticated_all on public.work_order_status
  for all to authenticated using (true) with check (true);
alter table public.worker_location enable row level security;
drop policy if exists worker_location_authenticated_all on public.worker_location;
create policy worker_location_authenticated_all on public.worker_location
  for all to authenticated using (true) with check (true);
alter table public.working_report enable row level security;
drop policy if exists working_report_authenticated_all on public.working_report;
create policy working_report_authenticated_all on public.working_report
  for all to authenticated using (true) with check (true);
alter table public.working_report_template enable row level security;
drop policy if exists working_report_template_authenticated_all on public.working_report_template;
create policy working_report_template_authenticated_all on public.working_report_template
  for all to authenticated using (true) with check (true);

-- Storage bucket for UploadFile compat
insert into storage.buckets (id, name, public)
values ('uploads', 'uploads', true)
on conflict (id) do nothing;

drop policy if exists uploads_public_read on storage.objects;
create policy uploads_public_read on storage.objects
  for select using (bucket_id = 'uploads');

drop policy if exists uploads_authenticated_write on storage.objects;
create policy uploads_authenticated_write on storage.objects
  for insert to authenticated with check (bucket_id = 'uploads');

drop policy if exists uploads_authenticated_update on storage.objects;
create policy uploads_authenticated_update on storage.objects
  for update to authenticated using (bucket_id = 'uploads');

-- Entity to table map:
--   AccountingSettings -> accounting_settings
--   Asset -> asset
--   AssetCategory -> asset_category
--   AssetField -> asset_field
--   AssetFile -> asset_file
--   AssetGroup -> asset_group
--   AssetNote -> asset_note
--   AssetStatus -> asset_status
--   BankAccount -> bank_account
--   BankTransaction -> bank_transaction
--   Bill -> bill
--   ChartOfAccount -> chart_of_account
--   Contact -> contact
--   ContactCategory -> contact_category
--   ContactFile -> contact_file
--   ContactGroup -> contact_group
--   ContactNote -> contact_note
--   ContactPerson -> contact_person
--   ContactStatus -> contact_status
--   DocumentFile -> document_file
--   DocumentHistory -> document_history
--   DocumentTemplate -> document_template
--   Employee -> employee
--   EmployeeDocument -> employee_document
--   EmployeeDocumentType -> employee_document_type
--   EmployeeGroup -> employee_group
--   EmployeeLoan -> employee_loan
--   EmployeePayrollProfile -> employee_payroll_profile
--   EmployeeRole -> employee_role
--   EmployeeStatus -> employee_status
--   FileType -> file_type
--   HistoricalPayment -> historical_payment
--   Invoice -> invoice
--   JournalEntry -> journal_entry
--   LeaveRequest -> leave_request
--   MobileApp -> mobile_app
--   OperationsSettings -> operations_settings
--   Organization -> organization
--   OrganizationFile -> organization_file
--   PayPeriod -> pay_period
--   PayrollAuditLog -> payroll_audit_log
--   PayrollComponent -> payroll_component
--   PayrollEntry -> payroll_entry
--   PayrollLineItem -> payroll_line_item
--   PayrollSettings -> payroll_settings
--   PettyCashEntry -> petty_cash_entry
--   Product -> product
--   Project -> project
--   ProjectCategory -> project_category
--   ProjectFile -> project_file
--   ProjectNote -> project_note
--   ProjectStatus -> project_status
--   PurchaseOrder -> purchase_order
--   Quote -> quote
--   RetiredDocumentNumber -> retired_document_number
--   RolePermission -> role_permission
--   SalaryAuditLog -> salary_audit_log
--   SharedFile -> shared_file
--   Task -> task
--   TaskCategory -> task_category
--   TaskHistory -> task_history
--   TaskShift -> task_shift
--   TaskStatus -> task_status
--   TaskSubtask -> task_subtask
--   TaxRate -> tax_rate
--   Team -> team
--   TimeAggregation -> time_aggregation
--   TimeEntry -> time_entry
--   TimeEntryAmendment -> time_entry_amendment
--   User -> users
--   WorkOrder -> work_order
--   WorkOrderCategory -> work_order_category
--   WorkOrderFile -> work_order_file
--   WorkOrderNote -> work_order_note
--   WorkOrderStatus -> work_order_status
--   WorkerLocation -> worker_location
--   WorkingReport -> working_report
--   WorkingReportTemplate -> working_report_template
