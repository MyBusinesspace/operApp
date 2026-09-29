import { useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

const GUIDES = {
  dashboard: {
    title: "Dashboard",
    body: "Your home overview: KPI cards, revenue vs expenses, work-order status, recent activity, upcoming tasks, and who is clocked in.",
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
