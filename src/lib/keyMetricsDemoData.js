// Generates fictitious chart accounts, journal entries and bank transactions
// across the last 5 years so the KeyMetricsWidget (5-year overview) can be previewed.
// Entries are accounting-correct so Revenue, EBITDA, Equity, Debt, PER, Earnings Yield
// and ROE all compute to real values for every year.

// Per-year growth profile (oldest -> newest)
const yearMultiplier = [0.55, 0.7, 0.85, 1.0, 1.25];

function isoDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function buildDemoKeyMetricsData() {
  const now = new Date();
  const curYear = now.getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => curYear - (4 - i));

  const cash = { id: "demo-coa-cash", code: "1000", name: "Cash", type: "Asset", status: "Active" };
  const revenue1 = { id: "demo-coa-rev1", code: "4000", name: "Sales Revenue", type: "Revenue", status: "Active" };
  const revenue2 = { id: "demo-coa-rev2", code: "4100", name: "Service Revenue", type: "Revenue", status: "Active" };
  const expense1 = { id: "demo-coa-exp1", code: "5000", name: "Cost of Sales", type: "Expense", status: "Active" };
  const expense2 = { id: "demo-coa-exp2", code: "6000", name: "Salaries Expense", type: "Expense", status: "Active" };
  const expense3 = { id: "demo-coa-exp3", code: "6100", name: "Rent Expense", type: "Expense", status: "Active" };
  const liability1 = { id: "demo-coa-liab1", code: "2000", name: "Accounts Payable", type: "Liability", status: "Active" };
  const liability2 = { id: "demo-coa-liab2", code: "2100", name: "Bank Loan", type: "Liability", status: "Active" };
  const equity1 = { id: "demo-coa-eq1", code: "3000", name: "Owner Equity", type: "Equity", status: "Active" };
  const equity2 = { id: "demo-coa-eq2", code: "3100", name: "Retained Earnings", type: "Equity", status: "Active" };

  const chartAccounts = [cash, revenue1, revenue2, expense1, expense2, expense3, liability1, liability2, equity1, equity2];

  const journalEntries = [];
  let jeCounter = 1;

  // Opening equity + loan for the first year so equity is never zero
  journalEntries.push({
    id: `demo-je-${jeCounter++}`,
    status: "Posted",
    date: isoDate(years[0], 1, 1),
    lines: [
      { account_id: cash.id, debit: 500000, credit: 0 },
      { account_id: equity1.id, debit: 0, credit: 350000 },
      { account_id: liability2.id, debit: 0, credit: 150000 },
    ],
  });

  years.forEach((year, yi) => {
    const m = yearMultiplier[yi];

    // Revenue: 12 monthly entries across two revenue accounts
    for (let month = 1; month <= 12; month++) {
      const revId = month % 2 === 0 ? revenue2.id : revenue1.id;
      const amount = Math.round((120000 + ((month * 7300) % 30000)) * m);
      journalEntries.push({
        id: `demo-je-${jeCounter++}`,
        status: "Posted",
        date: isoDate(year, month, 15),
        lines: [
          { account_id: cash.id, debit: amount, credit: 0 },
          { account_id: revId, debit: 0, credit: amount },
        ],
      });
    }

    // Expenses: 12 monthly entries across three expense accounts
    for (let month = 1; month <= 12; month++) {
      const expId = [expense1.id, expense2.id, expense3.id][(month - 1) % 3];
      const amount = Math.round((45000 + ((month * 5100) % 20000)) * m);
      journalEntries.push({
        id: `demo-je-${jeCounter++}`,
        status: "Posted",
        date: isoDate(year, month, 20),
        lines: [
          { account_id: expId, debit: amount, credit: 0 },
          { account_id: cash.id, debit: 0, credit: amount },
        ],
      });
    }

    // Yearly closing: net profit -> retained earnings (credits equity)
    const yearRevenue = 12 * Math.round(135000 * m);
    const yearExpenses = 12 * Math.round(55000 * m);
    const netProfit = yearRevenue - yearExpenses;
    journalEntries.push({
      id: `demo-je-${jeCounter++}`,
      status: "Posted",
      date: isoDate(year, 12, 31),
      lines: [
        { account_id: revenue1.id, debit: yearRevenue / 2, credit: 0 },
        { account_id: revenue2.id, debit: yearRevenue / 2, credit: 0 },
        { account_id: expense1.id, debit: 0, credit: yearExpenses / 3 },
        { account_id: expense2.id, debit: 0, credit: yearExpenses / 3 },
        { account_id: expense3.id, debit: 0, credit: yearExpenses / 3 },
        { account_id: equity2.id, debit: 0, credit: netProfit },
      ],
    });

    // New loan drawdown each year (increases debt)
    const loanAmount = Math.round(40000 * m);
    journalEntries.push({
      id: `demo-je-${jeCounter++}`,
      status: "Posted",
      date: isoDate(year, 6, 10),
      lines: [
        { account_id: cash.id, debit: loanAmount, credit: 0 },
        { account_id: liability2.id, debit: 0, credit: loanAmount },
      ],
    });
  });

  // Bank transactions for cashflow (Receive / Spend) across the 5 years
  const bankTransactions = [];
  let btCounter = 1;
  years.forEach((year, yi) => {
    const m = yearMultiplier[yi];
    for (let month = 1; month <= 12; month++) {
      bankTransactions.push({
        id: `demo-bt-${btCounter++}`,
        type: "Receive Money",
        amount: Math.round((110000 + ((month * 6100) % 25000)) * m),
        date: isoDate(year, month, 5),
      });
      bankTransactions.push({
        id: `demo-bt-${btCounter++}`,
        type: "Spend Money",
        amount: Math.round((65000 + ((month * 4200) % 18000)) * m),
        date: isoDate(year, month, 25),
      });
    }
  });

  return { chartAccounts, journalEntries, bankTransactions };
}