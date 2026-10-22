// Shared helpers for the office attendance feature.
// Imported by attendanceToggle / attendanceAllocate / attendanceConfirm / attendanceToday.

export const ATTENDANCE_TZ = "Asia/Dubai";

/** Company-local calendar date (YYYY-MM-DD) for an instant, in the given IANA timezone. */
export function localDateKey(when = new Date(), timeZone = ATTENDANCE_TZ) {
  const d = when instanceof Date ? when : new Date(when);
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/** Whole minutes elapsed since an ISO timestamp (never negative). */
export function elapsedMinutes(clockInTime, now = new Date()) {
  const start = new Date(clockInTime).getTime();
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.round((now.getTime() - start) / 60000));
}

/** True when the user may manage everyone's time: platform admin or User.can_manage_time. */
export async function canManageTime(base44, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const inline = user.can_manage_time ?? user.data?.can_manage_time;
  if (inline === true) return true;
  if (inline === false) return false;
  try {
    const rows = await base44.asServiceRole.entities.User.filter({ id: user.id });
    return rows?.[0]?.can_manage_time === true;
  } catch {
    return false;
  }
}

// ── Notification language (OperationsSettings.app_language) ───────────────────
// Every automatic, system-generated string (bell notifications, emails) goes
// through t() so the whole app speaks the language chosen in Settings.
export const APP_LANGUAGES = { en: "English", es: "Español" };

const STRINGS = {
  en: {
    alert_title: "Still working?",
    alert_message: "You have been clocked in for 12 hours. Confirm you are still working or the session will close automatically.",
    closed_title: "Session closed automatically",
    closed_message: "Your session was closed automatically at {time} because you did not confirm you were still working.",
    email_title: "Confirm you're still working",
    email_preview: "Press \"OK, still working\" within 30 minutes to keep your session open.",
    email_heading: "Still working, {first_name}?",
    email_subtitle: "You have a session that is still open.",
    email_body1: "Open the app and press \"OK, still working\" to keep the session running.",
    email_body2: "If you do not confirm within 30 minutes, the session will close automatically.",
    email_button: "OK, still working",
    email_footer: "This is an automatic message from OPERAPP360.",
    reminder_title: "Time to clock in",
    reminder_message: "Scheduled: {task_name} ({ref}) at {time}",
    reminder2_title: "Reminder: you have not clocked in yet",
    reminder2_message: "Scheduled: {task_name} ({ref}) at {time}",
  },
  es: {
    alert_title: "¿Sigues trabajando?",
    alert_message: "Llevas 12 horas con la sesión abierta. Confirma que sigues trabajando o la sesión se cerrará automáticamente.",
    closed_title: "Sesión cerrada automáticamente",
    closed_message: "Tu sesión se cerró automáticamente a las {time} porque no confirmaste que seguías trabajando.",
    email_title: "Confirma que sigues trabajando",
    email_preview: "Pulsa \"OK, sigo trabajando\" en los próximos 30 minutos para mantener tu sesión abierta.",
    email_heading: "¿Sigues trabajando, {first_name}?",
    email_subtitle: "Tienes una sesión que sigue abierta.",
    email_body1: "Abre la app y pulsa \"OK, sigo trabajando\" para mantener la sesión activa.",
    email_body2: "Si no confirmas en 30 minutos, la sesión se cerrará automáticamente.",
    email_button: "OK, sigo trabajando",
    email_footer: "Este es un mensaje automático de OPERAPP360.",
    reminder_title: "Hora de fichar",
    reminder_message: "Tienes programada: {task_name} ({ref}) a las {time}",
    reminder2_title: "Recordatorio: aún no has fichado",
    reminder2_message: "Tienes programada: {task_name} ({ref}) a las {time}",
  },
};

/** Translate a system string; falls back to English, then to the key itself. */
export function t(key, lang, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let s = table[key] || STRINGS.en[key] || key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Reads OperationsSettings.app_language once per run; falls back to English. */
export async function getAppLanguage(db) {
  try {
    const rows = await db.OperationsSettings.filter({}, "-created_date", 1);
    const lang = rows?.[0]?.app_language;
    return typeof lang === "string" && STRINGS[lang] ? lang : "en";
  } catch {
    return "en";
  }
}

/** All variables the AttendanceStillWorking email template needs, in the app language. */
export function stillWorkingEmailVars(lang, firstName) {
  return {
    first_name: firstName,
    email_title: t("email_title", lang),
    email_preview: t("email_preview", lang),
    email_heading: t("email_heading", lang, { first_name: firstName }),
    email_subtitle: t("email_subtitle", lang),
    email_body1: t("email_body1", lang),
    email_body2: t("email_body2", lang),
    email_button: t("email_button", lang),
    email_footer: t("email_footer", lang),
  };
}
