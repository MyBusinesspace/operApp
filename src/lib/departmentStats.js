/**
 * Department quick-view stats — every number is derived from the entity rows the
 * dashboard has already loaded (no demo data, no placeholders). Rows are capped
 * at the loaded list limits, so the counts reflect what was fetched.
 */
import { startOfWeek } from "date-fns";
import { compareDateOnly, dateOnlyKey, todayLocalISO } from "@/lib/dateOnly";

const num = (n) => new Intl.NumberFormat("en-US").format(Number(n) || 0);
const money = (n, currency = "AED") =>
  new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0) + " " + currency;

// A record counts as "open" when it is neither finished nor closed.
const CLOSED_STATUSES = ["Completed", "Cancelled", "Archived"];
const isOpen = (status) => !!status && !CLOSED_STATUSES.includes(status);

// amount_paid, falling back to the payment rows (same rule the invoices list uses).
const paidOn = (doc) =>
  Number(doc.amount_paid) || (doc.payments || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);

const awaitingPayment = (docs) => {
  const rows = docs.filter((d) => d.status === "Awaiting Payment");
  const amount = rows.reduce((s, d) => s + Math.max(0, (Number(d.total) || 0) - paidOn(d)), 0);
  return { count: rows.length, amount, currency: rows[0]?.currency || docs[0]?.currency || "AED" };
};

export function buildDepartmentStats(data = {}) {
  const {
    contacts = [], projects = [], assets = [], workOrders = [], tasks = [], employees = [],
    timeEntries = [], purchaseOrders = [], quotes = [], invoices = [], bills = [],
    journalEntries = [], chartAccounts = [], bankAccounts = [],
  } = data;

  // ── Business ──────────────────────────────────────────────────────────────
  const customers = contacts.filter((c) => c.type === "Customer" || c.type === "Both").length;
  const providers = contacts.filter((c) => c.type === "Provider" || c.type === "Both").length;
  const activeProjects = projects.filter((p) => p.status === "Active").length;

  // ── Operations ────────────────────────────────────────────────────────────
  const openWorkOrders = workOrders.filter((w) => isOpen(w.status)).length;
  const openTasks = tasks.filter((t) => isOpen(t.status)).length;

  // ── Sales ─────────────────────────────────────────────────────────────────
  const salesAwaiting = awaitingPayment(invoices);

  // ── Purchases ─────────────────────────────────────────────────────────────
  const billsAwaiting = awaitingPayment(bills);

  // ── Time & HR ─────────────────────────────────────────────────────────────
  const today = todayLocalISO();
  const weekStart = dateOnlyKey(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const clockInsToday = timeEntries.filter((e) => dateOnlyKey(e.clock_in_time) === today).length;
  const weekHours = timeEntries
    .filter((e) => {
      const k = dateOnlyKey(e.clock_in_time);
      return k && compareDateOnly(k, weekStart) >= 0 && compareDateOnly(k, today) <= 0;
    })
    .reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0) / 60;

  // ── Accounting ────────────────────────────────────────────────────────────
  const thisMonth = today.slice(0, 7);
  const journalEntriesThisMonth = journalEntries.filter((j) => dateOnlyKey(j.date).slice(0, 7) === thisMonth).length;

  return [
    {
      key: "business",
      rows: [
        { label: "Contacts", value: num(contacts.length), sub: `Customers ${num(customers)} · Providers ${num(providers)}` },
        { label: "Active projects", value: num(activeProjects) },
        { label: "Assets", value: num(assets.length) },
      ],
    },
    {
      key: "operations",
      rows: [
        { label: "Work orders", value: num(workOrders.length), sub: `Open ${num(openWorkOrders)}` },
        { label: "Tasks", value: num(tasks.length), sub: `Open ${num(openTasks)}` },
      ],
    },
    {
      key: "sales",
      rows: [
        { label: "Invoices & credit notes", value: num(invoices.length) },
        { label: "Awaiting payment", value: num(salesAwaiting.count), sub: money(salesAwaiting.amount, salesAwaiting.currency) },
        { label: "Quotes", value: num(quotes.length) },
      ],
    },
    {
      key: "purchases",
      rows: [
        { label: "Bills", value: num(bills.length) },
        { label: "Awaiting payment", value: num(billsAwaiting.count), sub: money(billsAwaiting.amount, billsAwaiting.currency) },
        { label: "Purchase orders", value: num(purchaseOrders.length) },
      ],
    },
    {
      key: "timehr",
      rows: [
        { label: "Employees", value: num(employees.length), sub: `Active ${num(employees.filter((e) => e.status === "Active").length)}` },
        { label: "Clock-ins today", value: num(clockInsToday) },
        { label: "Hours this week", value: `${weekHours.toFixed(1)} h` },
      ],
    },
    {
      key: "accounting",
      rows: [
        { label: "Journal entries", value: num(journalEntries.length), sub: `This month ${num(journalEntriesThisMonth)}` },
        { label: "Active accounts", value: num(chartAccounts.length) },
        { label: "Bank accounts", value: num(bankAccounts.filter((b) => b.status === "Active").length) },
      ],
    },
  ];
}