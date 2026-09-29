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

export const facilities = {
  companyName: "PrimeFacilities FM",
  tagline: "Facilities demo workspace",
  workOrders: [
    { id: "wo1", reference: "WO-5521", title: "AHU-3 vibration check", contact_name: "Business Bay Tower", status: "Active", created_date: daysAgo(1), updated_date: daysAgo(0) },
    { id: "wo2", reference: "WO-5510", title: "Lobby lighting retrofit", contact_name: "DIFC Gate", status: "Active", created_date: daysAgo(4), updated_date: daysAgo(1) },
    { id: "wo3", reference: "WO-5498", title: "Fire pump weekly test", contact_name: "JLT Cluster X", status: "Active", created_date: daysAgo(2), updated_date: daysAgo(0) },
    { id: "wo4", reference: "WO-5480", title: "Chiller chemical dosing", contact_name: "Business Bay Tower", status: "On Hold", created_date: daysAgo(7), updated_date: daysAgo(3) },
    { id: "wo5", reference: "WO-5466", title: "Lift L2 callback", contact_name: "DIFC Gate", status: "Active", created_date: daysAgo(0), updated_date: daysAgo(0) },
    { id: "wo6", reference: "WO-5440", title: "Pest control — B1", contact_name: "JLT Cluster X", status: "Archived", created_date: daysAgo(16), updated_date: daysAgo(14) },
    { id: "wo7", reference: "WO-5422", title: "Soft services audit", contact_name: "Business Bay Tower", status: "Archived", created_date: daysAgo(25), updated_date: daysAgo(20) },
  ],
  tasks: [
    { id: "t1", title: "Close PPM backlog — week 39", status: "In Progress", priority: "High", planning_date: daysAgo(-2), project_name: "Business Bay Tower", created_date: daysAgo(3) },
    { id: "t2", title: "Client SLA report", status: "Open", priority: "Urgent", planning_date: daysAgo(-1), project_name: "DIFC Gate", created_date: daysAgo(1) },
    { id: "t3", title: "Stocktake — filters", status: "Open", priority: "Medium", planning_date: daysAgo(0), work_order_name: "WO-5521", created_date: daysAgo(0) },
    { id: "t4", title: "Fire drill debrief", status: "Completed", priority: "Medium", planning_date: daysAgo(2), project_name: "JLT Cluster X", updated_date: daysAgo(1), created_date: daysAgo(3) },
  ],
  employees: [
    { id: "e1", full_name: "Youssef Farid", status: "Active" },
    { id: "e2", full_name: "Manoj Patel", status: "Active" },
    { id: "e3", full_name: "Elena Rossi", status: "Active" },
    { id: "e4", full_name: "Khalid Mansour", status: "Active" },
    { id: "e5", full_name: "Samir Haddad", status: "Active" },
    { id: "e6", full_name: "Julia Chen", status: "Active" },
    { id: "e7", full_name: "Temp Crew A", status: "Inactive" },
  ],
  invoices: [
    { id: "i1", number: "INV-8801", contact_name: "Business Bay Tower", total: 36000, amount_paid: 0, status: "Awaiting Payment", issue_date: monthsAgo(0, 6), created_date: daysAgo(4), updated_date: daysAgo(1) },
    { id: "i2", number: "INV-8788", contact_name: "DIFC Gate", total: 22000, amount_paid: 22000, status: "Paid", issue_date: monthsAgo(1, 4), created_date: daysAgo(32), updated_date: daysAgo(20) },
    { id: "i3", number: "INV-8810", contact_name: "JLT Cluster X", total: 4500, amount_paid: 0, status: "Draft", issue_date: monthsAgo(0, 2), created_date: daysAgo(1) },
    { id: "i4", number: "INV-8760", contact_name: "Business Bay Tower", total: 17500, amount_paid: 8000, status: "Awaiting Payment", issue_date: monthsAgo(2, 16), created_date: daysAgo(58), updated_date: daysAgo(12) },
    { id: "i5", number: "INV-8740", contact_name: "DIFC Gate", total: 14000, amount_paid: 14000, status: "Paid", issue_date: monthsAgo(3, 9), created_date: daysAgo(88) },
    { id: "i6", number: "INV-8712", contact_name: "JLT Cluster X", total: 11000, amount_paid: 11000, status: "Paid", issue_date: monthsAgo(4, 21), created_date: daysAgo(118) },
    { id: "i7", number: "INV-8690", contact_name: "Business Bay Tower", total: 9800, amount_paid: 9800, status: "Paid", issue_date: monthsAgo(5, 3), created_date: daysAgo(148) },
  ],
  bills: [
    { id: "b1", total: 5100, status: "Awaiting Payment", issue_date: monthsAgo(0, 5), created_date: daysAgo(3) },
    { id: "b2", total: 2700, status: "Paid", issue_date: monthsAgo(1, 17), created_date: daysAgo(36) },
    { id: "b3", total: 4300, status: "Paid", issue_date: monthsAgo(2, 11), created_date: daysAgo(68) },
    { id: "b4", total: 1900, status: "Paid", issue_date: monthsAgo(3, 2), created_date: daysAgo(100) },
  ],
  leaveRequests: [
    { id: "l1", status: "pending", employee_name: "Elena Rossi", leave_type: "Annual", total_days: 4, created_date: daysAgo(1) },
  ],
  timeEntries: [
    { id: "te1", status: "Active", employee_name: "Youssef Farid", task_title: "AHU-3 vibration check", on_site: true, created_date: daysAgo(0) },
    { id: "te2", status: "Active", employee_name: "Manoj Patel", task_title: "Lobby lighting retrofit", on_site: true, created_date: daysAgo(0) },
    { id: "te3", status: "Active", employee_name: "Elena Rossi", task_title: "Fire pump weekly test", on_site: true, created_date: daysAgo(0) },
    { id: "te4", status: "Active", employee_name: "Khalid Mansour", task_title: "Lift L2 callback", on_site: false, created_date: daysAgo(0) },
  ],
};
