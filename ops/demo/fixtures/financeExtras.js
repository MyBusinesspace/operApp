/** Enrich industry fixtures with Sales + Purchases demo data. */

function padBills(bills = [], contacts = []) {
  const providers = contacts.filter(
    (c) => c.type === "Provider" || c.type === "Both"
  );
  return bills.map((b, i) => ({
    number: b.number || `BILL-${880 + i}`,
    contact_name:
      b.contact_name ||
      providers[i % Math.max(providers.length, 1)]?.full_name ||
      "Gulf Supplies LLC",
    amount_paid: b.amount_paid ?? (b.status === "Paid" ? b.total : 0),
    due_date: b.due_date || b.issue_date,
    ...b,
  }));
}

function padInvoices(invoices = []) {
  return invoices.map((inv) => ({
    due_date: inv.due_date || inv.issue_date,
    currency: inv.currency || "AED",
    ...inv,
  }));
}

const DEFAULT_PRODUCTS = [
  {
    id: "p1",
    code: "SVC-INSTALL",
    name: "Installation labour",
    type: "Service",
    unit: "hour",
    sale_price: 180,
    purchase_price: 0,
    status: "Active",
  },
  {
    id: "p2",
    code: "MAT-CABLE",
    name: "Cable 3×2.5mm",
    type: "Product",
    unit: "m",
    sale_price: 12.5,
    purchase_price: 7.2,
    status: "Active",
  },
  {
    id: "p3",
    code: "SVC-MAINT",
    name: "Preventive maintenance",
    type: "Service",
    unit: "visit",
    sale_price: 950,
    purchase_price: 0,
    status: "Active",
  },
  {
    id: "p4",
    code: "MAT-PANEL",
    name: "Distribution panel 12-way",
    type: "Product",
    unit: "pcs",
    sale_price: 420,
    purchase_price: 280,
    status: "Active",
  },
  {
    id: "p5",
    code: "SVC-CONSULT",
    name: "Site consultancy",
    type: "Service",
    unit: "day",
    sale_price: 2200,
    purchase_price: 0,
    status: "Archived",
  },
];

const DEFAULT_POS = [
  {
    id: "po1",
    number: "PO-441",
    contact_name: "Gulf Electrical Trading",
    status: "Approved",
    total: 18400,
    issue_date: "2026-09-12",
  },
  {
    id: "po2",
    number: "PO-438",
    contact_name: "Desert Tools Co.",
    status: "Sent",
    total: 6200,
    issue_date: "2026-09-28",
  },
  {
    id: "po3",
    number: "PO-435",
    contact_name: "Gulf Electrical Trading",
    status: "Draft",
    total: 9100,
    issue_date: "2026-10-02",
  },
  {
    id: "po4",
    number: "PO-429",
    contact_name: "Metro HVAC Parts",
    status: "Billed",
    total: 15300,
    issue_date: "2026-08-18",
  },
];

const DEFAULT_PETTY = [
  {
    id: "pc1",
    date: "2026-10-01",
    employee_name: "Omar Hassan",
    type: "Expense",
    category: "Fuel",
    amount: 240,
    note: "Site van refill",
    status: "Approved",
  },
  {
    id: "pc2",
    date: "2026-10-03",
    employee_name: "Ravi Kumar",
    type: "Expense",
    category: "Supplies",
    amount: 95,
    note: "Consumables — Site 2",
    status: "Pending",
  },
  {
    id: "pc3",
    date: "2026-09-22",
    employee_name: "Fatima Ali",
    type: "Top-up",
    category: "Float",
    amount: 1000,
    note: "Weekly float",
    status: "Approved",
  },
  {
    id: "pc4",
    date: "2026-09-15",
    employee_name: "Omar Hassan",
    type: "Expense",
    category: "Meals",
    amount: 180,
    note: "Crew lunch — overtime",
    status: "Approved",
  },
];

export function enrichFinanceFixture(data) {
  if (!data || typeof data !== "object") return data;

  data.invoices = padInvoices(data.invoices || []);
  data.bills = padBills(data.bills || [], data.contacts || []);
  data.quotes = data.quotes || [];
  data.products = data.products?.length ? data.products : DEFAULT_PRODUCTS;
  data.purchaseOrders = data.purchaseOrders?.length
    ? data.purchaseOrders
    : DEFAULT_POS;
  data.pettyCash = data.pettyCash?.length ? data.pettyCash : DEFAULT_PETTY;

  if (!data.bills.length) {
    data.bills = padBills(
      [
        {
          id: "b1",
          total: 6400,
          status: "Awaiting Payment",
          issue_date: "2026-10-02",
        },
        {
          id: "b2",
          total: 2100,
          status: "Paid",
          issue_date: "2026-09-12",
          amount_paid: 2100,
        },
        {
          id: "b3",
          total: 9800,
          status: "Paid",
          issue_date: "2026-08-20",
          amount_paid: 9800,
        },
      ],
      data.contacts || []
    );
  }

  return data;
}
