import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const GUIDES = {
  dashboard: {
    title: "Overall Quick View",
    body: "Your home snapshot: operations flow, key financial metrics, bank balances, invoices and bills, cash movement, recent payments, and quick links into overview sections.",
    tips: [],
  },
  "business-overview": {
    title: "Business overview",
    body: "A snapshot of your business workspace: contact types, project and asset status, open quotes, active projects, and recent contacts — all view-only in this demo.",
    tips: [],
  },
  companies: {
    title: "Companies",
    body: "Browse customers, providers, and contacts. Filter by status or category, open a company dialog to inspect General and Fiscal details, or preview a group — everything is view-only.",
    tips: [],
  },
  projects: {
    title: "Projects",
    body: "Track project scopes with status tabs, category filters, and active work-order focus. Open a project dialog to review customer, dates, budget, location, and notes — view only.",
    tips: [],
  },
  assets: {
    title: "Assets",
    body: "Equipment register with status, category, and group filters. Open an asset dialog for identity, linked contact/project/work orders, and purchase details — view only.",
    tips: [],
  },
  "business-settings": {
    title: "Business settings",
    body: "Configure contact, project, and asset categories, statuses, groups, reference numbering, file types (with type prefixes), and file numbering — explore the tabs; changes are not saved in the demo.",
    tips: [],
  },
  "operations-settings": {
    title: "Operations settings",
    body: "Work-order and task labels, timesheet toggles, GPS location rules, photo requirements, and working-report options — interactive preview; Save stays view-only.",
    tips: [],
  },
  "operations-overview": {
    title: "Operations overview",
    body: "See the operations flow, report summaries, task & working-report trends, and quick links into work orders and related modules — view only in this demo.",
    tips: [],
  },
  "work-orders": {
    title: "Work Orders",
    body: "Browse field jobs by status and category. Open a work order to inspect company, project, asset, dates, and notes — changes are not saved in the demo.",
    tips: [],
  },
  tasks: {
    title: "Tasks",
    body: "Use New Task for the full form (links, subtasks, shifts, team selection, recurring) or Quick Task for a fast draft with project/customer — everything is view-only in this demo.",
    tips: [],
  },
  planner: {
    title: "Planner",
    body: "Switch Day/Week and view by Team, Employee, or Project. Open task cards, browse filters, and explore team lists — scheduling actions stay view-only in this demo.",
    tips: [],
  },
  timesheets: {
    title: "Timesheets",
    body: "See the live worker map, day-grouped clock entries, amendments, and reports. Clock In / Clock Out and edits are view-only in this demo.",
    tips: [],
  },
  "hr-overview": {
    title: "Time & HR overview",
    body: "Workforce snapshot: employee status, leave this month, week timesheets, and the latest pay period — view only in this demo.",
    tips: [],
  },
  employees: {
    title: "Employees",
    body: "Same as the live app: eye/row opens the split preview; click the employee name for the full profile with All, Documents, Leave, Gratuity, Salary, Pay Slips, Extra Time, and Timeline.",
    tips: [],
  },
  leave: {
    title: "Leave",
    body: "Review leave requests by status and type, open a request to edit details, or try Approve / Reject — everything is view-only in this demo.",
    tips: [],
  },
  "sales-overview": {
    title: "Sales overview",
    body: "See invoices awaiting payment, quotes, products, and customers — then open each list for full demo detail. View only.",
    tips: [],
  },
  invoices: {
    title: "Invoices",
    body: "Browse sample customer invoices by status and amount. Creating and payments are available in the live app — this demo is view-only.",
    tips: [],
  },
  quotes: {
    title: "Quotes",
    body: "Review proposals and quote status. Convert-to-invoice lives in the full product; demo lists stay read-only.",
    tips: [],
  },
  products: {
    title: "Products & Services",
    body: "Catalog of sellable products and services with prices — explore filters and search; edits are not saved here.",
    tips: [],
  },
  "sales-customers": {
    title: "Customers",
    body: "Customers filtered from your demo contacts. Open Companies under Business for the full contact workspace.",
    tips: [],
  },
  "purchasing-overview": {
    title: "Purchasing overview",
    body: "Bills to pay, purchase orders, petty cash, and suppliers — jump into each list for the same detail shape as the live app.",
    tips: [],
  },
  "purchase-orders": {
    title: "Purchase Orders",
    body: "Supplier POs with status and totals. Approvals and billing links are view-only in the demo.",
    tips: [],
  },
  bills: {
    title: "Bills",
    body: "Supplier bills awaiting payment or paid. Record payment and PDFs are in the live product.",
    tips: [],
  },
  "petty-cash": {
    title: "Petty Cash",
    body: "Crew expenses and float top-ups. Approvals stay view-only in this demo.",
    tips: [],
  },
  suppliers: {
    title: "Suppliers",
    body: "Providers filtered from demo contacts. Use Companies under Business for the full contact record.",
    tips: [],
  },
};

const textParent = {
  animate: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
};

const textChild = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: "easeOut" },
  },
  exit: { opacity: 0, y: -6, transition: { duration: 0.15 } },
};

export default function DemoGuideCard({ pageId = "dashboard" }) {
  const guide = GUIDES[pageId] || GUIDES.dashboard;
  const storageKey = `operapp_demo_guide_${pageId}`;
  const [open, setOpen] = useState(() => {
    try {
      return sessionStorage.getItem(storageKey) !== "0";
    } catch {
      return true;
    }
  });

  const dismiss = () => {
    setOpen(false);
    try {
      sessionStorage.setItem(storageKey, "0");
    } catch {
      /* ignore */
    }
  };

  const reopen = () => {
    setOpen(true);
    try {
      sessionStorage.setItem(storageKey, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence mode="wait">
      {open ? (
        <motion.aside
          key="guide-card"
          className="demo-guide-card"
          aria-label="Demo page guide"
          initial={{ opacity: 0, x: 28, y: "-50%", scale: 0.96, filter: "blur(4px)" }}
          animate={{ opacity: 1, x: 0, y: "-50%", scale: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: 20, y: "-50%", scale: 0.97, filter: "blur(3px)" }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.div
            variants={textParent}
            initial="initial"
            animate="animate"
            exit="exit"
          >
            <motion.div className="demo-guide-head" variants={textChild}>
              <div>
                <p className="demo-guide-kicker">Demo guide</p>
                <h2>{guide.title}</h2>
              </div>
              <button
                type="button"
                className="demo-guide-close"
                onClick={dismiss}
                aria-label="Close guide"
              >
                <X size={16} />
              </button>
            </motion.div>
              <motion.p className="demo-guide-body" variants={textChild}>
                {guide.body}
              </motion.p>
              {guide.tips?.length > 0 && (
                <motion.ul className="demo-guide-tips" variants={textChild}>
                  {guide.tips.map((tip) => (
                    <motion.li key={tip} variants={textChild}>
                      {tip}
                    </motion.li>
                  ))}
                </motion.ul>
              )}
          </motion.div>
        </motion.aside>
      ) : (
        <motion.button
          key="guide-fab"
          type="button"
          className="demo-guide-fab"
          onClick={reopen}
          title="Show page guide"
          initial={{ opacity: 0, scale: 0.85, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 8 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          <HelpCircle size={20} aria-hidden />
          <span>Guide</span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}
