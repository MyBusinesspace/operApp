// Default Chart of Accounts (International)
// All codes are unique. is_system=true = locked (cannot be deleted/archived).
// `type` = detailed account type, `category` = auto-computed group.
// This is the built-in default COA shipped with the app. Additional regional
// COAs (Spain, Chile, etc.) can be added alongside this one.
export const DEFAULT_COA = [
  // ── ASSETS ──────────────────────────────────────────────────────────────
  { code: "090", name: "Opening Stock",                                          type: "Current Asset", category: "Assets", is_system: true },
  { code: "091", name: "Inventory",                                              type: "Current Asset", category: "Assets", is_system: true },
  { code: "100", name: "Bank",                                                   type: "Bank", category: "Assets", is_system: true, enable_payments: true },
  { code: "110", name: "Accounts Receivable",                                    type: "Current Asset", category: "Assets", is_system: true },
  { code: "120", name: "Prepayments",                                            type: "Prepayment", category: "Assets", is_system: true },
  { code: "130", name: "Electronic Clearing Account",                            type: "Current Asset", category: "Assets", is_system: true },
  { code: "140", name: "Petty Cash",                                             type: "Bank", category: "Assets", is_system: true, enable_payments: true },
  { code: "150", name: "Other Receivables",                                      type: "Current Asset", category: "Assets", is_system: true },
  { code: "160", name: "Employee Advances",                                      type: "Current Asset", category: "Assets", is_system: true },
  { code: "170", name: "VAT Receivable",                                         type: "Current Asset", category: "Assets", is_system: true },
  { code: "180", name: "Input Tax Credit",                                       type: "Current Asset", category: "Assets", is_system: true },
  { code: "710", name: "Office Equipment",                                       type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "711", name: "Less Accumulated Depreciation on Office Equipment",      type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "720", name: "Computer Equipment",                                     type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "721", name: "Less Accumulated Depreciation on Computer Equipment",    type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "730", name: "Buildings",                                              type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "731", name: "Less Accumulated Depreciation on Buildings",             type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "740", name: "Motor Vehicles",                                         type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "741", name: "Less Accumulated Depreciation on Motor Vehicles",        type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "750", name: "Plant and Machinery",                                    type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "751", name: "Less Accumulated Depreciation on Plant and Machinery",   type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "760", name: "Furniture and Fittings",                                 type: "Fixed Asset", category: "Assets", is_system: true },
  { code: "761", name: "Less Accumulated Depreciation on Furniture and Fittings",type: "Fixed Asset", category: "Assets", is_system: true },

  // ── LIABILITIES ─────────────────────────────────────────────────────────
  { code: "200", name: "Accounts Payable",                                       type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "210", name: "Output VAT",                                             type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "220", name: "Income Tax Payable",                                     type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "230", name: "Wages Payable",                                          type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "240", name: "GST / VAT Payable",                                      type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "250", name: "Employee Benefits Payable",                              type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "260", name: "Prepaid Revenue / Deferred Revenue",                     type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "270", name: "Accrued Liabilities",                                    type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "280", name: "Customer Deposits",                                      type: "Current Liability", category: "Liabilities", is_system: true },
  { code: "800", name: "Long Term Loans",                                        type: "Non-current Liability", category: "Liabilities", is_system: true },
  { code: "810", name: "Finance Lease Obligations",                              type: "Non-current Liability", category: "Liabilities", is_system: true },

  // ── EQUITY ──────────────────────────────────────────────────────────────
  { code: "300", name: "Share Capital",                                          type: "Equity", category: "Equity", is_system: true },
  { code: "310", name: "Owner's Drawings",                                       type: "Equity", category: "Equity", is_system: true },
  { code: "320", name: "Retained Earnings",                                      type: "Equity", category: "Equity", is_system: true },
  { code: "330", name: "Owner A Funds Introduced",                               type: "Equity", category: "Equity", is_system: true },
  { code: "340", name: "Owner A Drawings",                                       type: "Equity", category: "Equity", is_system: true },

  // ── REVENUE ─────────────────────────────────────────────────────────────
  { code: "400", name: "Sales",                                                  type: "Revenue", category: "Revenue", is_system: true },
  { code: "410", name: "Sales – Services",                                       type: "Revenue", category: "Revenue", is_system: true },
  { code: "420", name: "Sales – Goods",                                          type: "Revenue", category: "Revenue", is_system: true },
  { code: "430", name: "Rental Income",                                          type: "Revenue", category: "Revenue", is_system: true },
  { code: "440", name: "Commission Income",                                      type: "Revenue", category: "Revenue", is_system: true },

  // ── OTHER INCOME ─────────────────────────────────────────────────────────
  { code: "460", name: "Other Income",                                           type: "Other Income", category: "Revenue", is_system: true },
  { code: "470", name: "Interest Income",                                        type: "Other Income", category: "Revenue", is_system: true },
  { code: "480", name: "Gain on Disposal of Fixed Assets",                       type: "Other Income", category: "Revenue", is_system: true },

  // ── DIRECT COSTS ─────────────────────────────────────────────────────────
  { code: "500", name: "Cost of Goods Sold",                                     type: "Direct Costs", category: "Expenses", is_system: true },
  { code: "501", name: "Cost of Goods Sold – Materials",                         type: "Direct Costs", category: "Expenses", is_system: true },
  { code: "502", name: "Cost of Goods Sold – Labour",                            type: "Direct Costs", category: "Expenses", is_system: true },
  { code: "503", name: "Cost of Goods Sold – Subcontractors",                    type: "Direct Costs", category: "Expenses", is_system: true },
  { code: "510", name: "Direct Expenses",                                        type: "Direct Costs", category: "Expenses", is_system: true },
  { code: "520", name: "Purchases",                                              type: "Direct Costs", category: "Expenses", is_system: true },

  // ── EXPENSES ─────────────────────────────────────────────────────────────
  { code: "600", name: "Advertising",                                            type: "Expense", category: "Expenses", is_system: true },
  { code: "601", name: "Audit & Accountancy Fees",                               type: "Expense", category: "Expenses", is_system: true },
  { code: "602", name: "Bank Fees",                                              type: "Expense", category: "Expenses", is_system: true },
  { code: "603", name: "Cleaning",                                               type: "Expense", category: "Expenses", is_system: true },
  { code: "604", name: "Computer & IT Expenses",                                 type: "Expense", category: "Expenses", is_system: true },
  { code: "605", name: "Consulting & Accounting",                                type: "Expense", category: "Expenses", is_system: true },
  { code: "606", name: "Depreciation",                                           type: "Depreciation", category: "Expenses", is_system: true },
  { code: "607", name: "Entertainment",                                          type: "Expense", category: "Expenses", is_system: true },
  { code: "608", name: "Freight & Courier",                                      type: "Expense", category: "Expenses", is_system: true },
  { code: "609", name: "General Expenses",                                       type: "Expense", category: "Expenses", is_system: true },
  { code: "610", name: "Insurance",                                              type: "Expense", category: "Expenses", is_system: true },
  { code: "611", name: "Legal Expenses",                                         type: "Expense", category: "Expenses", is_system: true },
  { code: "612", name: "Light, Power & Heating",                                 type: "Expense", category: "Expenses", is_system: true },
  { code: "613", name: "Motor Vehicle Expenses",                                 type: "Expense", category: "Expenses", is_system: true },
  { code: "614", name: "Postage & Printing",                                     type: "Expense", category: "Expenses", is_system: true },
  { code: "615", name: "Rent",                                                   type: "Expense", category: "Expenses", is_system: true },
  { code: "616", name: "Repairs and Maintenance",                                type: "Expense", category: "Expenses", is_system: true },
  { code: "617", name: "Salaries",                                               type: "Expense", category: "Expenses", is_system: true },
  { code: "618", name: "Staff Amenities",                                        type: "Expense", category: "Expenses", is_system: true },
  { code: "619", name: "Subscriptions",                                          type: "Expense", category: "Expenses", is_system: true },
  { code: "620", name: "Telephone & Internet",                                   type: "Expense", category: "Expenses", is_system: true },
  { code: "621", name: "Travel & Accommodation",                                 type: "Expense", category: "Expenses", is_system: true },
  { code: "622", name: "Wages",                                                  type: "Expense", category: "Expenses", is_system: true },
  { code: "623", name: "End of Service Benefits",                                type: "Expense", category: "Expenses", is_system: true },
  { code: "624", name: "Employee Benefits",                                      type: "Expense", category: "Expenses", is_system: true },

  // ── OTHER EXPENSE ────────────────────────────────────────────────────────
  { code: "650", name: "Interest Expense",                                       type: "Expense", category: "Expenses", is_system: true },
  { code: "660", name: "Loss on Disposal of Fixed Assets",                       type: "Expense", category: "Expenses", is_system: true },
  { code: "670", name: "Income Tax Expense",                                     type: "Expense", category: "Expenses", is_system: true },
];
