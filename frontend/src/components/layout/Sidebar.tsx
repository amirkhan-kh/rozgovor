import React, { useState, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  BarChart3,
  Medal,
  GitCompareArrows,
  ScrollText,
  Headphones,
  BookOpen,
  CircleUserRound,
  Sparkles,
  Mic,
  Lock,
  X,
  PlayCircle,
  Search,
  Library,
  Users,
  TrendingUp,
  Zap,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  FileText,
} from "lucide-react";
import { useFeaturePermissions } from "../../hooks/useFeaturePermissions";
import { usePermissions } from "../../hooks/usePermissions";
import { useAuth } from "../../store/authStore";

type Section = "action" | "analytics" | "coaching" | "settings";

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  section: Section;
  desktopOnly?: boolean;
  feature?: string; // agar feature yopiq bo'lsa lock ko'rinadi
  roles?: string[]; // qaysi rollarga ko'rinadi (bo'lmasa — hammaga)
  // Permissions tizimiga mos sahifa kaliti. Agar berilgan bo'lsa —
  // usePermissions.can(pageKey, "view") tekshiriladi.
  pageKey?: string;
}

const SECTION_LABELS: Record<Section, string> = {
  action: "Kundalik ish",
  analytics: "Tahlil",
  coaching: "Bilim va coaching",
  settings: "Sozlash",
};

const SECTION_ORDER: Section[] = ["action", "analytics", "coaching", "settings"];

// Rollar: "admin" (Boshliq/company login), "rop" (ROP), "sotuvchi" (Manager)
// Tartib: muhimlik va foydalanish chastotasiga qarab.
const navItems: NavItem[] = [
  // ─── Kundalik ish ─────────────────────────────────────────────────
  { section: "action", to: "/sales", label: "Sotuv", icon: <TrendingUp size={20} />, color: "#22c55e", roles: ["admin", "rop"], pageKey: "sales" },
  { section: "action", to: "/analytics", label: "Analitika", icon: <BarChart3 size={20} />, color: "#06b6d4", roles: ["admin", "rop"], pageKey: "sales" },
  { section: "action", to: "/audit", label: "Audit", icon: <Headphones size={20} />, color: "#8b5cf6", roles: ["admin", "rop"], pageKey: "audit" },
  { section: "action", to: "/clients", label: "Mijozlar", icon: <CircleUserRound size={20} />, color: "#06b6d4", roles: ["admin", "rop"], pageKey: "clients" },
  { section: "action", to: "/managers", label: "Menejerlar", icon: <Users size={20} />, color: "#10b981", roles: ["admin", "rop"], pageKey: "managers" },

  // ─── Tahlil ───────────────────────────────────────────────────────
  { section: "analytics", to: "/audio", label: "Audio", icon: <Headphones size={20} />, color: "#2fcc6e", pageKey: "audio" },
  { section: "analytics", to: "/rating", label: "Reyting", icon: <Medal size={20} />, color: "#f59e0b", pageKey: "rating" },
  { section: "analytics", to: "/summaries", label: "Xulosalar", icon: <ScrollText size={20} />, color: "#06b6d4", roles: ["admin", "rop", "canViewDashboard"] },

  // ─── Bilim va coaching ────────────────────────────────────────────
  { section: "coaching", to: "/playlists", label: "Playlistlar", icon: <PlayCircle size={20} />, color: "#2fcc6e" },
  { section: "coaching", to: "/knowledge/objections", label: "E'tirozlar bazasi", icon: <Library size={20} />, color: "#f59e0b" },
  { section: "coaching", to: "/search", label: "AI Qidiruv", icon: <Search size={20} />, color: "#06b6d4" },
  { section: "coaching", to: "/exam", label: "Imtihon", icon: <Mic size={20} />, color: "#ef4444", feature: "exam_chat" },
  { section: "coaching", to: "/lessons", label: "Darsliklar", icon: <BookOpen size={20} />, color: "#8b5cf6", roles: ["rop", "sotuvchi", "manager"], pageKey: "lessons" },
  { section: "coaching", to: "/admin/lessons", label: "Darsliklar (admin)", icon: <BookOpen size={20} />, color: "#8b5cf6", roles: ["admin", "rop"], pageKey: "lessons" },
  { section: "coaching", to: "/custdev", label: "Custdev", icon: <MessageCircle size={20} />, color: "#06b6d4", roles: ["admin", "rop"], pageKey: "custdev" },
  { section: "coaching", to: "/scripts", label: "Skriptlar", icon: <FileText size={20} />, color: "#14b8a6", roles: ["rop", "sotuvchi"] },
  { section: "coaching", to: "/scenario", label: "Oltin senariy", icon: <Zap size={20} />, color: "#f59e0b", pageKey: "scenario" },
  { section: "coaching", to: "/rivals", label: "Raqobatchilar", icon: <GitCompareArrows size={20} />, color: "#e64545", roles: ["admin", "rop"], pageKey: "rivals" },

  // ─── Sozlash ──────────────────────────────────────────────────────
  { section: "settings", to: "/profile", label: "Profil", icon: <CircleUserRound size={20} />, color: "#6366f1", pageKey: "profile" },
];

// ─── Section header component ─────────────────────────────────────────
const SectionHeader: React.FC<{ section: Section; collapsed?: boolean }> = ({ section, collapsed }) => {
  if (collapsed) {
    // Collapsed mode: section divider chizigi (label yo'q)
    return (
      <div
        className="mx-2 my-2 h-px"
        style={{ background: "var(--color-border)", opacity: 0.5 }}
        aria-hidden="true"
      />
    );
  }
  return (
    <div
      className="px-3 pt-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider select-none"
      style={{ color: "var(--text-secondary)", opacity: 0.7, letterSpacing: "0.08em" }}
    >
      {SECTION_LABELS[section]}
    </div>
  );
};

// ─── Global desktop collapse state ────────────────────────────────────
// Mobile sidebar boshqa state — Header'dagi tugma uchun.
// Desktop collapse esa localStorage'da saqlanadi.
const COLLAPSED_STORAGE_KEY = "sidebar-collapsed";

const loadCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

// Subscribe pattern — MainLayout reaktiv tarzda kuzatadi
type Listener = (collapsed: boolean) => void;
const listeners = new Set<Listener>();

let _globalCollapsed = loadCollapsed();
export const useSidebarCollapsed = (): boolean => {
  const [collapsed, setCollapsed] = useState(_globalCollapsed);
  useEffect(() => {
    listeners.add(setCollapsed);
    return () => {
      listeners.delete(setCollapsed);
    };
  }, []);
  return collapsed;
};

const setGlobalCollapsed = (v: boolean) => {
  _globalCollapsed = v;
  try {
    localStorage.setItem(COLLAPSED_STORAGE_KEY, v ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l(v));
};

export const toggleSidebarCollapsed = () => setGlobalCollapsed(!_globalCollapsed);

// Mobile sidebar state
let _setMobileOpen: ((v: boolean) => void) | null = null;
export const openMobileSidebar = () => _setMobileOpen?.(true);

const Sidebar: React.FC = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  _setMobileOpen = setMobileOpen;
  const collapsed = useSidebarCollapsed();
  const location = useLocation();
  const { features } = useFeaturePermissions();
  const { userRole, managerUser } = useAuth();
  const { can, isSuperAdmin, loading: permsLoading } = usePermissions();

  // Foydalanuvchi rolini aniqlash
  const effectiveRole: string = userRole === "company"
    ? "admin"
    : (managerUser?.role || "sotuvchi");

  // Rol bo'yicha filter: item.roles bo'lmasa — hammaga ko'rinadi
  // "canViewDashboard" — manager uchun admin ruxsat bergan bo'lsa ko'rinadi
  const canViewDashboard = managerUser?.canViewDashboard === true;
  const visibleItems = navItems.filter((item) => {
    // 1) Rol filter (eski mantiq — company/admin bu bosqichdan doim o'tadi)
    const rolePass =
      !item.roles ||
      item.roles.includes(effectiveRole) ||
      (item.roles.includes("canViewDashboard") && canViewDashboard);
    if (!rolePass) return false;

    // 2) Permissions filter — faqat pageKey bor bo'lsa va permissions yuklangan bo'lsa
    // Super admin (company login) doim ruxsatli.
    if (item.pageKey && !isSuperAdmin && !permsLoading) {
      if (!can(item.pageKey, "view")) return false;
    }
    return true;
  });

  const isLocked = (item: NavItem) => item.feature ? features[item.feature] === false : false;

  const handleLockedClick = (label: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    alert(`"${label}" funksiyasi siz uchun yopilgan. Admin bilan bog'laning.`);
  };

  // Sahifa o'zgarganda mobileda yopish
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  // Desktop sidebar kengligi
  const desktopWidth = collapsed ? 64 : 220;

  return (
    <>
      {/* ===== Mobile: Backdrop ===== */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ===== Mobile: Full sidebar (sliding) ===== */}
      <aside
        className={`fixed left-0 top-0 h-screen w-64 border-r flex flex-col z-50 md:hidden transition-transform duration-300 ease-in-out ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b" style={{ borderColor: "var(--color-border)" }}>
          <span className="text-lg font-bold" style={{ color: "var(--color-accent, #3b5ef5)" }}>SalesAI</span>
          <button
            onClick={() => setMobileOpen(false)}
            style={{ color: "var(--color-secondary)" }}
            aria-label="Sidebar yopish"
          >
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {SECTION_ORDER.map((sec) => {
            const items = visibleItems.filter((it) => it.section === sec && !it.desktopOnly);
            if (items.length === 0) return null;
            return (
              <React.Fragment key={sec}>
                <SectionHeader section={sec} />
                {items.map((item) => {
                  const locked = isLocked(item);
                  return (
                    <NavLink
                      key={item.to}
                      to={locked ? "#" : item.to}
                      end={item.to === "/"}
                      onClick={locked ? handleLockedClick(item.label) : undefined}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors mb-0.5 ${
                          isActive && !locked ? "sidebar-active" : "sidebar-link"
                        } ${locked ? "opacity-50 cursor-not-allowed" : ""}`
                      }
                      style={({ isActive }) => ({
                        color: isActive && !locked ? item.color : undefined,
                      })}
                    >
                      {item.icon}
                      <span className="flex-1">{item.label}</span>
                      {locked && <Lock size={14} />}
                    </NavLink>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>

        {/* AI Chat */}
        <div className="px-2 py-3 border-t" style={{ borderColor: "var(--color-border)" }}>
          <NavLink
            to="/coach"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isActive ? "bg-accent/10" : "hover:bg-accent/5"
              }`
            }
            style={({ isActive }) => ({
              color: isActive ? "#f59e0b" : "var(--color-secondary)",
            })}
          >
            <Sparkles size={20} />
            <span>AI Maslahatchi</span>
          </NavLink>
        </div>
      </aside>

      {/* ===== Desktop: Collapsible Sidebar ===== */}
      <aside
        className="fixed left-0 top-0 h-screen border-r hidden md:flex flex-col z-50 transition-[width] duration-300 ease-in-out"
        style={{
          width: desktopWidth,
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Logo + Toggle button */}
        <div
          className="flex items-center h-16 border-b relative"
          style={{
            borderColor: "var(--color-border)",
            paddingLeft: collapsed ? 0 : 20,
            paddingRight: collapsed ? 0 : 12,
            justifyContent: collapsed ? "center" : "space-between",
          }}
        >
          {collapsed ? (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm"
              style={{ background: "linear-gradient(135deg, #8b5cf6, #3b5ef5)" }}
              title="SalesAI"
            >
              <BarChart3 size={18} style={{ color: "#ffffff" }} />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shadow-sm"
                style={{ background: "linear-gradient(135deg, #8b5cf6, #3b5ef5)" }}
              >
                <BarChart3 size={18} style={{ color: "#ffffff" }} />
              </div>
              <span className="text-lg font-bold tracking-tight" style={{ color: "var(--color-accent, #3b5ef5)" }}>
                SalesAI
              </span>
            </div>
          )}

          {/* Toggle button — collapsed bo'lsa pastida (logoning ostida joylashadi),
              ochilgan bo'lsa o'ng tomonida */}
          {!collapsed && (
            <button
              onClick={toggleSidebarCollapsed}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: "var(--color-secondary)" }}
              title="Sidebarni yopish"
              aria-label="Sidebarni yopish"
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>

        {/* Collapsed: ochish tugmasi alohida */}
        {collapsed && (
          <button
            onClick={toggleSidebarCollapsed}
            className="mx-auto mt-2 mb-1 w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-accent/10"
            style={{ color: "var(--color-secondary)" }}
            title="Sidebarni ochish"
            aria-label="Sidebarni ochish"
          >
            <ChevronRight size={18} />
          </button>
        )}

        {/* Nav items */}
        <nav
          className="flex-1 flex flex-col gap-0.5 py-2 overflow-y-auto overflow-x-hidden"
          style={{
            paddingLeft: collapsed ? 8 : 12,
            paddingRight: collapsed ? 8 : 12,
          }}
        >
          {SECTION_ORDER.map((sec) => {
            const items = visibleItems.filter((it) => it.section === sec);
            if (items.length === 0) return null;
            return (
              <React.Fragment key={sec}>
                <SectionHeader section={sec} collapsed={collapsed} />
                {items.map((item) => {
                  const locked = isLocked(item);
                  return (
                    <NavLink
                      key={item.to}
                      to={locked ? "#" : item.to}
                      end={item.to === "/"}
                      onClick={locked ? handleLockedClick(item.label) : undefined}
                      title={collapsed ? item.label : undefined}
                      className={({ isActive }) =>
                        `relative flex items-center rounded-xl text-sm font-medium transition-all ${
                          isActive && !locked ? "sidebar-active" : "sidebar-link"
                        } ${locked ? "opacity-50 cursor-not-allowed" : ""} ${
                          collapsed ? "justify-center w-12 h-12 mx-auto" : "gap-3 px-3 py-2.5"
                        }`
                      }
                      style={({ isActive }) => ({
                        color: isActive && !locked ? item.color : undefined,
                        backgroundColor: isActive && !locked ? `${item.color}15` : undefined,
                      })}
                    >
                      <span className="flex-shrink-0">{item.icon}</span>
                      {!collapsed && (
                        <>
                          <span className="flex-1 truncate">{item.label}</span>
                          {locked && <Lock size={13} className="flex-shrink-0 opacity-70" />}
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </React.Fragment>
            );
          })}
        </nav>

        {/* AI Chat button */}
        <div
          className="py-3 border-t"
          style={{
            borderColor: "var(--color-border)",
            paddingLeft: collapsed ? 8 : 12,
            paddingRight: collapsed ? 8 : 12,
          }}
        >
          <NavLink
            to="/coach"
            title={collapsed ? "AI Maslahatchi" : undefined}
            className={({ isActive }) =>
              `flex items-center rounded-xl text-sm font-medium transition-all ${
                isActive ? "bg-amber-500/10" : "hover:bg-amber-500/5"
              } ${collapsed ? "justify-center w-12 h-12 mx-auto" : "gap-3 px-3 py-2.5"}`
            }
            style={({ isActive }) => ({
              color: isActive ? "#f59e0b" : "var(--color-secondary)",
            })}
          >
            <Sparkles size={20} className="flex-shrink-0" />
            {!collapsed && <span className="flex-1">AI Maslahatchi</span>}
          </NavLink>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
