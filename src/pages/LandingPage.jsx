import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import { isDemoEnabled } from "@demo/index.js";
import {
  ArrowRight,
  Bell,
  CalendarDays,
  Check,
  ClipboardList,
  Database,
  FileText,
  FolderKanban,
  Lock,
  Play,
  Quote,
  Share2,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import "./LandingPage.css";

const FEATURES = [
  {
    icon: ClipboardList,
    tone: "blue",
    title: "Work Orders & Planner",
    body: "Schedule field jobs, assign crews, and track every work order from open to archived.",
  },
  {
    icon: FolderKanban,
    tone: "purple",
    title: "Projects, Companies & Assets",
    body: "Keep customers, project sites, and asset fleets linked in one business workspace.",
  },
  {
    icon: CalendarDays,
    tone: "green",
    title: "Timesheets & Clock-in",
    body: "Capture live attendance and timesheet entries so payroll and costing stay accurate.",
  },
  {
    icon: FileText,
    tone: "blue",
    title: "Quotes to Invoices",
    body: "Move from quote to invoice without re-entering line items, products, or customer data.",
  },
  {
    icon: Wallet,
    tone: "purple",
    title: "Purchases & Petty Cash",
    body: "Manage purchase orders, supplier bills, and petty cash alongside your field work.",
  },
  {
    icon: Users,
    tone: "green",
    title: "HR, Leave & Payroll",
    body: "Employee directory, leave approvals, and payroll runs connected to the same crews.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "149",
    blurb: "For small crews starting with OperApp",
    cta: "Start Free Trial",
    featured: false,
    perks: [
      "Up to 10 users",
      "Work orders & tasks",
      "Timesheets",
      "Quotes & invoices",
      "Email support",
    ],
  },
  {
    name: "Professional",
    price: "399",
    blurb: "For growing field and project teams",
    cta: "Start Free Trial",
    featured: true,
    perks: [
      "Up to 50 users",
      "Planner & assets",
      "Purchases & petty cash",
      "HR leave & payroll",
      "Operations dashboard",
      "Priority support",
    ],
  },
  {
    name: "Enterprise",
    price: "999",
    blurb: "For multi-site operations and finance",
    cta: "Contact Sales",
    featured: false,
    perks: [
      "Unlimited users",
      "Full accounting suite",
      "Bank rules & journals",
      "Tax & financial reports",
      "Dedicated onboarding",
      "SLA & phone support",
    ],
  },
];

const NAV_OFFSET = 88;

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const top = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [yearly, setYearly] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const onNavClick = (event, id) => {
    event.preventDefault();
    scrollToSection(id);
    if (window.history.replaceState) {
      window.history.replaceState(null, "", `#${id}`);
    }
  };

  const primaryHref = isAuthenticated ? "/app" : "/login";
  const primaryLabel = isAuthenticated ? "Open App" : "Get Started";
  const showDemo = isDemoEnabled();

  return (
    <div className="dp">
      <header className={`dp-nav ${scrolled ? "is-on" : ""}`}>
        <div className="dp-wrap">
          <div className="dp-nav-shell">
            <a
              href="#top"
              className="dp-logo"
              onClick={(e) => onNavClick(e, "top")}
            >
              <span className="dp-mark" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span>OperApp</span>
            </a>
            <nav className="dp-links">
              <a href="#features" onClick={(e) => onNavClick(e, "features")}>
                Features
              </a>
              <a href="#dashboard" onClick={(e) => onNavClick(e, "dashboard")}>
                Operations
              </a>
              <a href="#pricing" onClick={(e) => onNavClick(e, "pricing")}>
                Pricing
              </a>
              <a href="#trust" onClick={(e) => onNavClick(e, "trust")}>
                Trust
              </a>
            </nav>
            <div className="dp-nav-cta">
              {showDemo && (
                <Link to="/demo" className="dp-text-btn">
                  Try Demo
                </Link>
              )}
              {isAuthenticated ? (
                <Link to="/app" className="dp-btn dp-btn-green">
                  Open App
                </Link>
              ) : (
                <>
                  <Link to="/login" className="dp-text-btn">
                    Sign In
                  </Link>
                  <Link to="/login" className="dp-btn dp-btn-green">
                    Get Started
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="dp-hero">
          <div className="dp-hero-glow" aria-hidden />
          <div className="dp-wrap dp-hero-grid">
            <div className="dp-hero-copy">
              <span className="dp-badge dp-anim-up" style={{ "--d": "0.05s" }}>
                <i className="dp-badge-dot" aria-hidden />
                Live field operations
              </span>
              <h1 className="dp-anim-up" style={{ "--d": "0.12s" }}>
                OperApp — From Work Order to{" "}
                <span className="dp-grad-text">Invoice</span>
              </h1>
              <p className="dp-anim-up" style={{ "--d": "0.2s" }}>
                Run projects, crews, sales, purchasing, and accounting in one
                workspace built for field and service businesses.
              </p>
              <div className="dp-hero-actions dp-anim-up" style={{ "--d": "0.28s" }}>
                <Link to={primaryHref} className="dp-btn dp-btn-green dp-btn-lg">
                  {primaryLabel}
                  <ArrowRight size={16} aria-hidden />
                </Link>
                {showDemo ? (
                  <Link to="/demo" className="dp-btn dp-btn-outline-blue dp-btn-lg">
                    <span className="dp-play">
                      <Play size={12} fill="currentColor" aria-hidden />
                    </span>
                    Try Demo
                  </Link>
                ) : (
                  <a
                    href="#dashboard"
                    className="dp-btn dp-btn-outline-blue dp-btn-lg"
                    onClick={(e) => onNavClick(e, "dashboard")}
                  >
                    <span className="dp-play">
                      <Play size={12} fill="currentColor" aria-hidden />
                    </span>
                    See Operations
                  </a>
                )}
              </div>
              <div className="dp-stats dp-anim-up" style={{ "--d": "0.36s" }}>
                <div>
                  <strong>6</strong>
                  <span>Core modules</span>
                </div>
                <div>
                  <strong>AED</strong>
                  <span>Finance ready</span>
                </div>
                <div>
                  <strong>1</strong>
                  <span>Shared workspace</span>
                </div>
              </div>
            </div>

            <div className="dp-hero-visual" aria-hidden="true">
              <div className="dp-hero-card">
                <div className="dp-hero-card-head">
                  <div>
                    <p className="dp-hero-card-title">Revenue vs Expenses</p>
                    <p className="dp-hero-card-sub">
                      Last 6 months (invoiced vs billed)
                    </p>
                  </div>
                  <div className="dp-chart-legend">
                    <span>
                      <i className="c-indigo" /> Invoiced
                    </span>
                    <span>
                      <i className="c-teal" /> Billed
                    </span>
                  </div>
                </div>

                <div className="dp-hero-chart-wrap dp-hero-chart-wrap--dash">
                  <svg
                    className="dp-combo-chart"
                    viewBox="0 0 360 168"
                    preserveAspectRatio="xMidYMid meet"
                  >
                    <defs>
                      <linearGradient id="dpInvFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {[28, 56, 84, 112, 140].map((y) => (
                      <line
                        key={y}
                        x1="42"
                        x2="348"
                        y1={y}
                        y2={y}
                        stroke="#e2e8f0"
                        strokeDasharray="4 4"
                      />
                    ))}
                    <g fill="#94a3b8" fontSize="10" fontFamily="Inter, sans-serif">
                      <text x="8" y="32">60K</text>
                      <text x="8" y="60">45K</text>
                      <text x="8" y="88">30K</text>
                      <text x="8" y="116">15K</text>
                      <text x="18" y="144">0</text>
                    </g>
                    <path
                      d="M58,140 L110,140 L162,140 C175,138 188,118 214,112 C232,108 248,132 270,138 C288,128 312,48 342,28 L342,140 Z"
                      fill="url(#dpInvFill)"
                    />
                    <path
                      d="M58,140 L110,140 L162,140 C175,138 188,118 214,112 C232,108 248,132 270,138 C288,128 312,48 342,28"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M58,140 L342,140"
                      fill="none"
                      stroke="#14b8a6"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    <g fill="#94a3b8" fontSize="10" fontFamily="Inter, sans-serif" textAnchor="middle">
                      <text x="58" y="160">Apr</text>
                      <text x="110" y="160">May</text>
                      <text x="162" y="160">Jun</text>
                      <text x="214" y="160">Jul</text>
                      <text x="270" y="160">Aug</text>
                      <text x="332" y="160">Sep</text>
                    </g>
                  </svg>
                </div>
              </div>

              <div className="dp-float-wo">
                <div className="dp-float-wo-head">
                  <div>
                    <p className="dp-float-wo-title">Work Orders</p>
                    <p className="dp-float-wo-sub">Status breakdown</p>
                  </div>
                  <span className="dp-float-wo-view">View →</span>
                </div>
                <div className="dp-float-wo-body">
                  <div className="dp-wo-donut">
                    <svg viewBox="0 0 80 80">
                      <circle
                        cx="40"
                        cy="40"
                        r="28"
                        fill="none"
                        stroke="#e2e8f0"
                        strokeWidth="10"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="28"
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="10"
                        strokeDasharray="162 176"
                        strokeDashoffset="44"
                        transform="rotate(-90 40 40)"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="28"
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="10"
                        strokeDasharray="8 176"
                        strokeDashoffset="-118"
                        transform="rotate(-90 40 40)"
                      />
                    </svg>
                    <div className="dp-wo-donut-label">
                      <strong>133</strong>
                      <span>Total</span>
                    </div>
                  </div>
                  <ul className="dp-wo-stats">
                    <li>
                      <span>
                        <i className="c-indigo" /> In Progress
                      </span>
                      <em>
                        <b>99</b> 74%
                      </em>
                    </li>
                    <li>
                      <span>
                        <i className="c-red" /> Archived
                      </span>
                      <em>
                        <b>5</b> 4%
                      </em>
                    </li>
                  </ul>
                </div>
              </div>

              <div className="dp-float-note">
                <Bell size={14} aria-hidden />
                <span>New invoice issued — AED 52.4K</span>
              </div>
            </div>
          </div>
        </section>

        <section className="dp-section" id="features">
          <div className="dp-wrap">
            <div className="dp-section-head">
              <h2>
                Everything You Need to <span className="dp-grad-text">Operate</span>
              </h2>
              <p>
                Business, operations, HR, sales, purchasing, and accounting —
                connected for the way field teams actually work.
              </p>
            </div>
            <div className="dp-feature-grid">
              {FEATURES.map(({ icon: Icon, title, body, tone }) => (
                <article key={title} className="dp-feature">
                  <div className={`dp-feature-icon tone-${tone}`}>
                    <Icon size={18} aria-hidden />
                  </div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="dp-section dp-section-soft" id="dashboard">
          <div className="dp-wrap">
            <div className="dp-section-head">
              <h2>
                Your Operations <span className="dp-grad-text">Command Center</span>
              </h2>
              <p>
                See work orders, revenue, and crew activity in one live overview
                — the same dashboard your team uses every day.
              </p>
            </div>

            <div className="dp-overview">
              <div className="dp-overview-head">
                <div>
                  <h3>Operations Overview</h3>
                  <p>Live pulse across field and finance</p>
                </div>
                <div className="dp-overview-actions">
                  <button type="button">This month</button>
                  <button type="button" className="is-solid">
                    Export
                  </button>
                </div>
              </div>

              <div className="dp-kpi-row">
                {[
                  ["Active Work Orders", "99", "+12"],
                  ["Open Invoices", "AED 52.4K", "+8.2%"],
                  ["Clocked In", "38", "+4"],
                  ["Pending Leave", "7", "-2"],
                ].map(([label, value, delta], idx) => (
                  <div key={label} className="dp-kpi">
                    <span>{label}</span>
                    <strong>{value}</strong>
                    <em className={String(delta).startsWith("-") ? "down" : "up"}>
                      {delta}
                    </em>
                    <svg viewBox="0 0 80 28" className="dp-spark">
                      <path
                        d={
                          idx % 2 === 0
                            ? "M0,22 C12,20 18,10 28,12 C40,14 48,6 60,8 C68,9 74,4 80,3"
                            : "M0,8 C14,10 20,18 32,16 C44,14 52,22 64,18 C72,16 76,20 80,22"
                        }
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                ))}
              </div>

              <div className="dp-panels">
                <div className="dp-panel dp-panel-wide">
                  <div className="dp-panel-head">
                    <h4>Revenue vs Expenses</h4>
                    <div className="dp-legend">
                      <span>
                        <i className="c-indigo" /> Invoiced
                      </span>
                      <span>
                        <i className="c-teal" /> Billed
                      </span>
                    </div>
                  </div>
                  <svg className="dp-trend" viewBox="0 0 520 180" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,140 C60,130 90,90 140,95 C190,100 220,60 280,70 C340,80 380,40 440,50 C480,56 500,35 520,30 L520,180 L0,180 Z"
                      fill="url(#trendFill)"
                    />
                    <path
                      d="M0,140 C60,130 90,90 140,95 C190,100 220,60 280,70 C340,80 380,40 440,50 C480,56 500,35 520,30"
                      fill="none"
                      stroke="#4f46e5"
                      strokeWidth="3"
                    />
                    <path
                      d="M0,150 C70,145 110,120 160,125 C220,132 260,100 320,108 C380,116 430,90 520,95"
                      fill="none"
                      stroke="#14b8a6"
                      strokeWidth="2.5"
                    />
                  </svg>
                  <div className="dp-months">
                    {["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((m) => (
                      <span key={m}>{m}</span>
                    ))}
                  </div>
                </div>

                <div className="dp-side">
                  <div className="dp-panel">
                    <h4>Work Orders</h4>
                    <div className="dp-donut-wrap">
                      <div className="dp-donut" aria-hidden />
                      <ul>
                        <li>
                          <i className="c-indigo" /> In Progress <strong>74%</strong>
                        </li>
                        <li>
                          <i className="c-green" /> Completed <strong>22%</strong>
                        </li>
                        <li>
                          <i className="c-red" /> Archived <strong>4%</strong>
                        </li>
                      </ul>
                    </div>
                  </div>
                  <div className="dp-panel">
                    <h4>Team Activity</h4>
                    <ul className="dp-hbars">
                      {[
                        ["Planner", 78],
                        ["Timesheets", 62],
                        ["Tasks", 91],
                      ].map(([label, pct]) => (
                        <li key={label}>
                          <div>
                            <span>{label}</span>
                            <strong>{pct}%</strong>
                          </div>
                          <div className="dp-bar">
                            <i style={{ width: `${pct}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="dp-section" id="pricing">
          <div className="dp-wrap">
            <div className="dp-section-head">
              <h2>
                Plans for Every <span className="dp-grad-text">Crew Size</span>
              </h2>
              <p>
                Start with field ops, then add HR, purchasing, and full books as
                you grow. 14-day free trial on every plan.
              </p>
              <div className="dp-billing">
                <span className={!yearly ? "is-on" : ""}>Monthly</span>
                <button
                  type="button"
                  className={`dp-switch ${yearly ? "is-yearly" : ""}`}
                  aria-label="Toggle yearly billing"
                  onClick={() => setYearly((v) => !v)}
                />
                <span className={yearly ? "is-on" : ""}>
                  Yearly <em>Save 20%</em>
                </span>
              </div>
            </div>

            <div className="dp-pricing">
              {PLANS.map((plan) => {
                const price = yearly
                  ? Math.round(Number(plan.price) * 0.8)
                  : plan.price;
                return (
                  <article
                    key={plan.name}
                    className={`dp-plan ${plan.featured ? "is-featured" : ""}`}
                  >
                    {plan.featured && <span className="dp-popular">Most Popular</span>}
                    <h3>{plan.name}</h3>
                    <p className="dp-plan-blurb">{plan.blurb}</p>
                    <p className="dp-price">
                      <span>AED </span>
                      {price}
                      <small>/month</small>
                    </p>
                    <ul>
                      {plan.perks.map((perk) => (
                        <li key={perk}>
                          <Check size={16} aria-hidden />
                          {perk}
                        </li>
                      ))}
                    </ul>
                    <Link
                      to="/login"
                      className={`dp-btn ${
                        plan.featured ? "dp-btn-green" : "dp-btn-outline"
                      }`}
                    >
                      {plan.cta}
                    </Link>
                  </article>
                );
              })}
            </div>
            <p className="dp-guarantee">30-day money-back guarantee</p>
          </div>
        </section>

        <section className="dp-section dp-section-soft" id="trust">
          <div className="dp-wrap">
            <p className="dp-trust-label">
              Built for contractors, facility, and field-service teams
            </p>
            <div className="dp-logos">
              {[
                "Construction",
                "Facilities",
                "Maintenance",
                "Logistics",
                "MEP",
                "Services",
              ].map((name) => (
                <span key={name}>{name}</span>
              ))}
            </div>

            <div className="dp-trust-grid">
              {[
                [ShieldCheck, "Role-based access", "Office, leaders & field roles"],
                [Lock, "Secure by default", "Protected operational data"],
                [Share2, "One shared workspace", "Ops, sales & finance aligned"],
                [Database, "UAE-ready books", "AED invoicing & reports"],
              ].map(([Icon, title, body]) => (
                <div key={title} className="dp-trust-item">
                  <Icon size={18} aria-hidden />
                  <div>
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </div>
                </div>
              ))}
            </div>

            <blockquote className="dp-quote">
              <Quote className="dp-quote-mark" aria-hidden />
              <p>
                “OperApp replaced our spreadsheets for work orders, timesheets,
                and invoicing. Dispatch and finance finally see the same live
                picture.”
              </p>
              <footer>
                <span className="dp-avatar">AM</span>
                <div>
                  <strong>Ahmed Mansour</strong>
                  <span>Operations Lead, Gulf Service Co.</span>
                </div>
              </footer>
            </blockquote>
          </div>
        </section>

        <section className="dp-final">
          <div className="dp-final-grid" aria-hidden />
          <div className="dp-wrap dp-final-inner">
            <h2>Ready to Run Operations in One Place?</h2>
            <p>
              Bring work orders, crews, sales, and books together with OperApp.
              Start your free trial today.
            </p>
            <div className="dp-hero-actions">
              <Link to={primaryHref} className="dp-btn dp-btn-white dp-btn-lg">
                {primaryLabel}
              </Link>
              <Link to="/login" className="dp-btn dp-btn-ghost-light dp-btn-lg">
                Contact sales
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="dp-footer">
        <div className="dp-wrap dp-footer-grid">
          <div>
            <div className="dp-logo">
              <span className="dp-mark" aria-hidden>
                <span />
                <span />
                <span />
              </span>
              <span>OperApp</span>
            </div>
            <p>
              The operations platform for field and project teams — from work
              order to invoice, timesheet to payroll.
            </p>
            <div className="dp-social">
              <a href="#trust" aria-label="X (Twitter)">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M18.244 2H21.5l-7.19 8.22L22.5 22h-6.59l-5.16-6.74L5.1 22H1.84l7.69-8.79L1.5 2h6.75l4.66 6.2L18.244 2zm-1.16 18h1.82L7.02 3.94H5.07L17.084 20z"
                  />
                </svg>
              </a>
              <a href="#trust" aria-label="LinkedIn">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M6.94 8.5H3.56V21h3.38V8.5zM5.25 3a1.96 1.96 0 1 0 0 3.92A1.96 1.96 0 0 0 5.25 3zM21 21h-3.37v-6.62c0-1.58-.03-3.6-2.2-3.6-2.2 0-2.54 1.72-2.54 3.49V21H9.52V8.5h3.24v1.7h.05c.45-.85 1.55-1.75 3.19-1.75 3.41 0 4.04 2.24 4.04 5.16V21z"
                  />
                </svg>
              </a>
              <a href="#trust" aria-label="Instagram">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2zm0 7.92A3.12 3.12 0 1 1 12 8.88a3.12 3.12 0 0 1 0 6.24zM17.74 6.96a1.12 1.12 0 1 1-2.24 0 1.12 1.12 0 0 1 2.24 0zM12 3.2c-2.4 0-2.7.01-3.64.05-.93.04-1.57.2-2.13.42a4.3 4.3 0 0 0-1.55 1.01 4.3 4.3 0 0 0-1.01 1.55c-.22.56-.38 1.2-.42 2.13C3.21 9.3 3.2 9.6 3.2 12s.01 2.7.05 3.64c.04.93.2 1.57.42 2.13a4.3 4.3 0 0 0 1.01 1.55 4.3 4.3 0 0 0 1.55 1.01c.56.22 1.2.38 2.13.42.94.04 1.24.05 3.64.05s2.7-.01 3.64-.05c.93-.04 1.57-.2 2.13-.42a4.3 4.3 0 0 0 1.55-1.01 4.3 4.3 0 0 0 1.01-1.55c.22-.56.38-1.2.42-2.13.04-.94.05-1.24.05-3.64s-.01-2.7-.05-3.64c-.04-.93-.2-1.57-.42-2.13a4.3 4.3 0 0 0-1.01-1.55 4.3 4.3 0 0 0-1.55-1.01c-.56-.22-1.2-.38-2.13-.42C14.7 3.21 14.4 3.2 12 3.2zm0 1.68c2.36 0 2.64.01 3.57.05.86.04 1.33.18 1.64.3.41.16.71.35.96.6.25.25.44.55.6.96.12.31.26.78.3 1.64.04.93.05 1.21.05 3.57s-.01 2.64-.05 3.57c-.04.86-.18 1.33-.3 1.64a2.3 2.3 0 0 1-.6.96 2.3 2.3 0 0 1-.96.6c-.31.12-.78.26-1.64.3-.93.04-1.21.05-3.57.05s-2.64-.01-3.57-.05c-.86-.04-1.33-.18-1.64-.3a2.3 2.3 0 0 1-.96-.6 2.3 2.3 0 0 1-.6-.96c-.12-.31-.26-.78-.3-1.64-.04-.93-.05-1.21-.05-3.57s.01-2.64.05-3.57c.04-.86.18-1.33.3-1.64.16-.41.35-.71.6-.96.25-.25.55-.44.96-.6.31-.12.78-.26 1.64-.3.93-.04 1.21-.05 3.57-.05z"
                  />
                </svg>
              </a>
            </div>
          </div>
          <div>
            <h4>Product</h4>
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#dashboard">Operations</a>
            <Link to="/login">Sign in</Link>
          </div>
          <div>
            <h4>Modules</h4>
            <a href="#features">Work Orders</a>
            <a href="#features">Timesheets</a>
            <a href="#features">Sales</a>
            <a href="#features">Accounting</a>
          </div>
          <div>
            <h4>Resources</h4>
            <a href="#dashboard">Overview</a>
            <a href="#trust">Security</a>
            <a href="#pricing">Plans</a>
          </div>
          <div>
            <h4>Legal</h4>
            <a href="#trust">Privacy</a>
            <a href="#trust">Terms</a>
            <a href="#trust">Cookies</a>
          </div>
        </div>
        <div className="dp-wrap dp-copy">
          <span>© {new Date().getFullYear()} OperApp. All rights reserved.</span>
          <div>
            <a href="#trust">Privacy Policy</a>
            <a href="#trust">Terms of Service</a>
            <a href="#trust">Cookie Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
