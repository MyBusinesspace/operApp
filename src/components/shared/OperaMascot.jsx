import { motion, AnimatePresence } from "framer-motion";

export const MASCOT_URL =
  "https://media.base44.com/images/public/6a201f5ce89c0f167dbe847d/574a64419_OPERAPPLOGO.png";

/**
 * OperaMascot — emotional design element for OPERAPP.
 * A small opera tenor that appears alongside system messages (toasts),
 * "singing" the message with floating musical notes.
 *
 * Props:
 *  - message: string  — text shown in the speech bubble
 *  - visible: bool    — whether the mascot is showing
 *  - variant: string  — "default" | "destructive" (matches toast variant)
 */
export default function OperaMascot({ message, visible = false, variant = "default" }) {
  const isDestructive = variant === "destructive";

  return (
    <AnimatePresence>
      {visible && message && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="fixed bottom-4 left-4 z-[100] flex items-end gap-2 pointer-events-none sm:bottom-6 sm:left-6 sm:gap-3"
        >
          {/* Speech bubble */}
          <motion.div
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ delay: 0.12 }}
            className={`relative mb-7 max-w-[180px] rounded-2xl rounded-bl-sm border px-3.5 py-2.5 text-xs shadow-lg sm:max-w-[220px] sm:text-sm ${
              isDestructive
                ? "border-destructive/30 bg-destructive text-destructive-foreground"
                : "border-border bg-card text-card-foreground"
            }`}
          >
            {message}
            <span
              className={`absolute -bottom-1 left-4 h-2.5 w-2.5 rotate-45 ${
                isDestructive ? "bg-destructive" : "bg-card"
              }`}
            />
          </motion.div>

          {/* Mascot + floating notes */}
          <div className="relative">
            <motion.span
              className="absolute left-1 top-0 text-base text-primary sm:text-lg"
              animate={{ y: [0, -22], opacity: [0, 1, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            >
              ♪
            </motion.span>
            <motion.span
              className="absolute left-7 top-2 text-xs text-primary sm:text-sm"
              animate={{ y: [0, -26], opacity: [0, 1, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 0.7 }}
            >
              ♫
            </motion.span>

            <motion.img
              src={MASCOT_URL}
              alt="operapp mascot"
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="h-16 w-16 object-contain drop-shadow-lg sm:h-20 sm:w-20"
              draggable={false}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}