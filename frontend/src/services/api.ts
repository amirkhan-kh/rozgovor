import axios from "axios";

// VITE_API_URL:
//   - "/api" yoki "/..." (slash bilan) → relative (current origin'da nginx proxy)
//   - "http(s)://..." → absolyut URL
//   - "api.example.com" (protokolsiz host) → https:// avtomatik qo'shiladi
const rawApiUrl = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
const normalizedApiUrl = /^https?:\/\//i.test(rawApiUrl) || rawApiUrl.startsWith("/")
  ? rawApiUrl
  : `https://${rawApiUrl}`;

const api = axios.create({
  baseURL: normalizedApiUrl,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor - token qo'shish
api.interceptors.request.use(
  (config) => {
    // Admin routes use admin_token
    const isAdminRoute = config.url?.startsWith("/admin");
    const token = isAdminRoute
      ? localStorage.getItem("admin_token")
      : localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - 401 da logout
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Faqat auth tekshirish URL'larida 401 → logout.
    // Boshqa endpoint 401 qaytarsa (masalan, backend middleware xatosi),
    // butun sahifani login'ga yuborish o'rniga xatoni qaytaramiz.
    if (error.response?.status === 401) {
      const url = error.config?.url || "";
      const isAuthEndpoint = url.includes("/auth/") || url.includes("/me");
      if (isAuthEndpoint) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
