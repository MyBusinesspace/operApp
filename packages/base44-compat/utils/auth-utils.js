const TOKEN_KEY = "base44_access_token";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem("token");
}

export function saveAccessToken(token) {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem("token", token);
  }
}

export function removeAccessToken() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem("token");
}

export function getLoginUrl(nextUrl = "/") {
  const url = new URL("/login", window.location.origin);
  if (nextUrl) url.searchParams.set("from_url", nextUrl);
  return url.toString();
}
