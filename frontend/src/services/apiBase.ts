const LOCAL_API_URL = "http://localhost:5001/api";

export const API_BASE_URL = (() => {
  const raw = (import.meta.env.VITE_API_URL as string | undefined) ||
    (import.meta.env.DEV ? LOCAL_API_URL : "/api");
  const normalized = /^https?:\/\//i.test(raw) || raw.startsWith("/")
    ? raw
    : `https://${raw}`;
  return normalized.replace(/\/+$/, "");
})();

export const HTTP_BASE_URL = API_BASE_URL.replace(/\/api$/, "");

export const WS_BASE_URL = (() => {
  const base = HTTP_BASE_URL;
  if (/^https:\/\//i.test(base)) return base.replace(/^https:/i, "wss:");
  if (/^http:\/\//i.test(base)) return base.replace(/^http:/i, "ws:");

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}${base}`;
  }

  return base;
})();
