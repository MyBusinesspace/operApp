function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

function monthsAgo(n, day = 12) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
}

export const construction = {
  companyName: "Gulf Build Contracting",
  tagline: "Construction demo workspace",
  workOrders: [
    { id: "wo1", reference: "WO-2401", title: "MEP rough-in — Tower B L12", contact_name: "Al Noor Developments", status: "Active", created_date: daysAgo(2), updated_date: daysAgo(0) },
    { id: "wo2", reference: "WO-2398", title: "Crane pad inspection", contact_name: "Site 4 — Dubai Hills", status: "Active", created_date: daysAgo(5), updated_date: daysAgo(1) },
    { id: "wo3", reference: "WO-2380", title: "Formwork strip — Podium", contact_name: "Al Noor Developments", status: "Active", created_date: daysAgo(8), updated_date: daysAgo(3) },
    { id: "wo4", reference: "WO-2371", title: "Waterproofing QA", contact_name: "Marina Residences", status: "On Hold", created_date: daysAgo(12), updated_date: daysAgo(4) },
    { id: "wo5", reference: "WO-2355", title: "Scaffold handover", contact_name: "Site 2", status: "Archived", created_date: daysAgo(20), updated_date: daysAgo(10) },
    { id: "wo6", reference: "WO-2340", title: "Concrete pour — Core A", contact_name: "Al Noor Developments", status: "Archived", created_date: daysAgo(28), updated_date: daysAgo(18) },
  ],
  tasks: [
    { id: "t1", title: "Submit daily progress photos", status: "Open", priority: "High", planning_date: daysAgo(-1), project_name: "Tower B", created_date: daysAgo(1) },
    { id: "t2", title: "Order rebar delivery", status: "In Progress", priority: "Urgent", planning_date: daysAgo(-2), work_order_name: "WO-2401", created_date: daysAgo(2) },
    { id: "t3", title: "Safety toolbox talk", status: "Open", priority: "Medium", planning_date: daysAgo(0), project_name: "Site 4", created_date: daysAgo(0) },
    { id: "t4", title: "Pour checklist signed", status: "Completed", priority: "Medium", planning_date: daysAgo(2), project_name: "Core A", updated_date: daysAgo(1), created_date: daysAgo(3) },
  ],
  employees: [
    { id: "e1", full_name: "Omar Hassan", status: "Active" },
    { id: "e2", full_name: "Ravi Kumar", status: "Active" },
    { id: "e3", full_name: "James Lee", status: "Active" },
    { id: "e4", full_name: "Fatima Ali", status: "Active" },
    { id: "e5", full_name: "Chen Wei", status: "Inactive" },
  ],
  invoices: [
    { id: "i1", number: "INV-1042", contact_name: "Al Noor Developments", total: 42000, amount_paid: 0, status: "Awaiting Payment", issue_date: monthsAgo(0, 5), created_date: daysAgo(3), updated_date: daysAgo(1) },
    { id: "i2", number: "INV-1038", contact_name: "Marina Residences", total: 18500, amount_paid: 18500, status: "Paid", issue_date: monthsAgo(1, 8), created_date: daysAgo(35), updated_date: daysAgo(20) },
    { id: "i3", number: "INV-1045", contact_name: "Al Noor Developments", total: 9100, amount_paid: 0, status: "Draft", issue_date: monthsAgo(0, 1), created_date: daysAgo(1) },
    { id: "i4", number: "INV-1021", contact_name: "Site 4 JV", total: 52000, amount_paid: 20000, status: "Awaiting Payment", issue_date: monthsAgo(2, 14), created_date: daysAgo(55), updated_date: daysAgo(10) },
    { id: "i5", number: "INV-1010", contact_name: "Marina Residences", total: 12000, amount_paid: 12000, status: "Paid", issue_date: monthsAgo(3, 20), created_date: daysAgo(90) },
    { id: "i6", number: "INV-0998", contact_name: "Al Noor Developments", total: 8000, amount_paid: 8000, status: "Paid", issue_date: monthsAgo(4, 10), created_date: daysAgo(120) },
    { id: "i7", number: "INV-0980", contact_name: "Site 2", total: 15000, amount_paid: 15000, status: "Paid", issue_date: monthsAgo(5, 18), created_date: daysAgo(150) },
  ],
  bills: [
    { id: "b1", total: 6400, status: "Awaiting Payment", issue_date: monthsAgo(0, 4), created_date: daysAgo(2) },
    { id: "b2", total: 2100, status: "Paid", issue_date: monthsAgo(1, 12), created_date: daysAgo(40) },
    { id: "b3", total: 9800, status: "Paid", issue_date: monthsAgo(2, 6), created_date: daysAgo(65) },
  ],
  leaveRequests: [
    { id: "l1", status: "pending", employee_name: "Omar Hassan", leave_type: "Annual", total_days: 3, created_date: daysAgo(1) },
    { id: "l2", status: "approved", employee_name: "Fatima Ali", leave_type: "Sick", total_days: 1, created_date: daysAgo(8) },
  ],
  timeEntries: [
    { id: "te1", status: "Active", employee_name: "Omar Hassan", task_title: "MEP rough-in — Tower B", on_site: true, created_date: daysAgo(0) },
    { id: "te2", status: "Active", employee_name: "Ravi Kumar", task_title: "Crane pad inspection", on_site: true, created_date: daysAgo(0) },
    { id: "te3", status: "Active", employee_name: "Fatima Ali", task_title: "QA walkthrough", on_site: false, created_date: daysAgo(0) },
    { id: "te4", status: "Completed", employee_name: "James Lee", task_title: "Formwork strip", created_date: daysAgo(1) },
  ],
};
