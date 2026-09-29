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

export const healthcare = {
  companyName: "CarePlus Clinics",
  tagline: "Healthcare demo workspace",
  workOrders: [
    { id: "wo1", reference: "WO-881", title: "MRI chiller service", contact_name: "Dubai Marina Clinic", status: "Active", created_date: daysAgo(1), updated_date: daysAgo(0) },
    { id: "wo2", reference: "WO-874", title: "OT HVAC filter change", contact_name: "JLT Day Surgery", status: "Active", created_date: daysAgo(3), updated_date: daysAgo(1) },
    { id: "wo3", reference: "WO-860", title: "Generator load test", contact_name: "Al Qusais Center", status: "Active", created_date: daysAgo(6), updated_date: daysAgo(2) },
    { id: "wo4", reference: "WO-851", title: "Autoclave calibration", contact_name: "Dubai Marina Clinic", status: "On Hold", created_date: daysAgo(9), updated_date: daysAgo(5) },
    { id: "wo5", reference: "WO-840", title: "UPS battery replace", contact_name: "JLT Day Surgery", status: "Archived", created_date: daysAgo(18), updated_date: daysAgo(12) },
  ],
  tasks: [
    { id: "t1", title: "Biomed weekly checklist", status: "Open", priority: "High", planning_date: daysAgo(-1), project_name: "Marina Clinic", created_date: daysAgo(0) },
    { id: "t2", title: "Order oxygen manifold seals", status: "In Progress", priority: "Urgent", planning_date: daysAgo(-3), work_order_name: "WO-881", created_date: daysAgo(2) },
    { id: "t3", title: "Fridge temp log audit", status: "Completed", priority: "Medium", planning_date: daysAgo(1), project_name: "JLT Day Surgery", updated_date: daysAgo(0), created_date: daysAgo(2) },
  ],
  employees: [
    { id: "e1", full_name: "Dr. Sara Nasser", status: "Active" },
    { id: "e2", full_name: "Nurse Layla", status: "Active" },
    { id: "e3", full_name: "Tech. Habib", status: "Active" },
    { id: "e4", full_name: "Admin Noor", status: "Active" },
    { id: "e5", full_name: "Tech. Priya", status: "Active" },
    { id: "e6", full_name: "Porter Ahmed", status: "Inactive" },
  ],
  invoices: [
    { id: "i1", number: "INV-2201", contact_name: "Dubai Marina Clinic", total: 28500, amount_paid: 0, status: "Awaiting Payment", issue_date: monthsAgo(0, 3), created_date: daysAgo(2), updated_date: daysAgo(1) },
    { id: "i2", number: "INV-2190", contact_name: "JLT Day Surgery", total: 11200, amount_paid: 11200, status: "Paid", issue_date: monthsAgo(1, 15), created_date: daysAgo(40), updated_date: daysAgo(25) },
    { id: "i3", number: "INV-2208", contact_name: "Al Qusais Center", total: 6400, amount_paid: 0, status: "Draft", issue_date: monthsAgo(0, 1), created_date: daysAgo(1) },
    { id: "i4", number: "INV-2175", contact_name: "Dubai Marina Clinic", total: 19800, amount_paid: 5000, status: "Awaiting Payment", issue_date: monthsAgo(2, 9), created_date: daysAgo(60), updated_date: daysAgo(8) },
    { id: "i5", number: "INV-2160", contact_name: "JLT Day Surgery", total: 9000, amount_paid: 9000, status: "Paid", issue_date: monthsAgo(3, 22), created_date: daysAgo(95) },
    { id: "i6", number: "INV-2144", contact_name: "Al Qusais Center", total: 7400, amount_paid: 7400, status: "Paid", issue_date: monthsAgo(4, 11), created_date: daysAgo(125) },
    { id: "i7", number: "INV-2120", contact_name: "Dubai Marina Clinic", total: 15600, amount_paid: 15600, status: "Paid", issue_date: monthsAgo(5, 7), created_date: daysAgo(155) },
  ],
  bills: [
    { id: "b1", total: 3200, status: "Awaiting Payment", issue_date: monthsAgo(0, 2), created_date: daysAgo(1) },
    { id: "b2", total: 4800, status: "Paid", issue_date: monthsAgo(1, 19), created_date: daysAgo(38) },
    { id: "b3", total: 2100, status: "Paid", issue_date: monthsAgo(2, 8), created_date: daysAgo(70) },
  ],
  leaveRequests: [
    { id: "l1", status: "pending", employee_name: "Nurse Layla", leave_type: "Annual", total_days: 2, created_date: daysAgo(0) },
    { id: "l2", status: "pending", employee_name: "Tech. Priya", leave_type: "Sick", total_days: 1, created_date: daysAgo(2) },
    { id: "l3", status: "approved", employee_name: "Admin Noor", leave_type: "Annual", total_days: 5, created_date: daysAgo(10) },
  ],
  timeEntries: [
    { id: "te1", status: "Active", employee_name: "Tech. Habib", task_title: "MRI chiller service", on_site: true, created_date: daysAgo(0) },
    { id: "te2", status: "Active", employee_name: "Nurse Layla", task_title: "Ward rounds support", on_site: true, created_date: daysAgo(0) },
  ],
};
