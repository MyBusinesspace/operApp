const KEY = "operapp_demo_industry";

export function getDemoIndustryId() {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

export function setDemoIndustryId(id) {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export function clearDemoSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
