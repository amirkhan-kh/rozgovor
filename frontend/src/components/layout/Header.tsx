import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Bell, X, CheckCircle, Clock, AlertCircle, Loader2, Sun, Moon, Monitor, User, Menu, AlertTriangle } from "lucide-react";
import { agentsService } from "../../services/agents.service";
import { openMobileSidebar } from "./Sidebar";
import { useAuth } from "../../store/authStore";
import { useQuery } from "@tanstack/react-query";
import { audioService } from "../../services/audio.service";
import { AudioFile } from "../../types";
import Avatar from "../ui/Avatar";

const routeTitles: Record<string, string> = {
  "/": "Sotuv",
  "/rating": "Reyting",
  "/summaries": "Tahlil Xulosalari",
  "/audio": "Audio Fayllar",
  "/audio/upload": "Audio yuklash",
  "/voronka": "Voronkalar",
  "/scripts": "Skriptlar",
  "/managers": "Menejerlar",
  "/managers/create": "Yangi Manager yaratish",
  "/coach": "AI Maslahatchi",
  "/profile": "Profil",
};

const statusIcon = (status: string) => {
  switch (status) {
    case "done":
      return <CheckCircle size={16} className="text-green-400 shrink-0" />;
    case "processing":
      return <Loader2 size={16} className="text-yellow-400 animate-spin shrink-0" />;
    case "error":
      return <AlertCircle size={16} className="text-red-400 shrink-0" />;
    default:
      return <Clock size={16} className="text-gray-400 shrink-0" />;
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "done": return "Tahlil tugadi";
    case "processing": return "Tahlil qilinmoqda";
    case "error": return "Xatolik";
    default: return "Kutilmoqda";
  }
};

const timeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hozirgina";
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  return `${days} kun oldin`;
};

const applyTheme = (theme: string) => {
  const root = document.documentElement;
  root.classList.remove("dark", "light");

  if (theme === "system") {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.add(prefersDark ? "dark" : "light");
  } else if (theme === "light") {
    root.classList.add("light");
  } else {
    root.classList.add("dark");
  }
};

const Header: React.FC = () => {
  const location = useLocation();
  const { user, managerUser, userRole, logout } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<string>(() => localStorage.getItem("theme") || "dark");

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Listen for system theme changes when in system mode
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Close profile menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    if (showProfileMenu) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showProfileMenu]);

  const getTitle = (): string => {
    const path = location.pathname;
    if (routeTitles[path]) return routeTitles[path];
    if (path.startsWith("/audio/")) return "Audio Detail";
    if (path.startsWith("/voronka/")) return "Voronka tafsilotlari";
    if (/^\/managers\/[^/]+\/detail$/.test(path)) return "Menejer tafsilotlari";
    if (/^\/managers\/[^/]+\/edit$/.test(path)) return "Menejerni tahrirlash";
    return "SalesAI";
  };

  // So'nggi audio fayllar (notification uchun)
  const { data: recentFiles } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      try {
        return await audioService.getAll({ page: 1, limit: 20, period: "today" });
      } catch {
        return { data: [], total: 0 };
      }
    },
    refetchInterval: 30000, // Har 30 sekundda yangilash
  });

  // ⭐ Red-Alert (Layer 5 — at-risk deals)
  const { data: redAlertData, refetch: refetchRedAlerts } = useQuery({
    queryKey: ["red-alerts"],
    queryFn: async () => {
      try {
        return await agentsService.getRedAlerts();
      } catch {
        return [];
      }
    },
    refetchInterval: 60000, // har daqiqada
  });
  const redAlerts = redAlertData || [];

  const ackRedAlert = async (id: string) => {
    try {
      await agentsService.acknowledgeRedAlert(id);
      refetchRedAlerts();
    } catch {}
  };

  const notifications = Array.isArray(recentFiles?.data) ? recentFiles.data : [];
  const unanalyzedCount = notifications.filter(
    (f: AudioFile) => f.status === "pending" || f.status === "error"
  ).length;
  const processingCount = notifications.filter(
    (f: AudioFile) => f.status === "processing"
  ).length;

  const badgeCount = unanalyzedCount + processingCount + redAlerts.length;

  // Notification panel — overlay onClick va X tugmasi bilan yopiladi (portal)

  const avatarSrc =
    userRole === "manager"
      ? managerUser?.customPhotoUrl || managerUser?.photoUrl || null
      : null;
  const displayName =
    userRole === "manager" ? managerUser?.name : user?.name || "S";

  return (
    <header className="sticky top-0 z-40 h-14 md:h-16 border-b border-border bg-card/95 backdrop-blur-md flex items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-2">
          <button
            onClick={openMobileSidebar}
            className="p-1.5 rounded-lg md:hidden"
            style={{ color: "var(--color-secondary)" }}
            aria-label="Sidebar menyusini ochish"
          >
            <Menu size={20} />
          </button>
          <h2 className="text-sm md:text-lg font-semibold truncate" style={{ color: "var(--text-primary)" }}>{getTitle()}</h2>
        </div>

      <div className="flex items-center gap-4">
        {/* Notification bell */}
        <div className="relative" ref={panelRef}>
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="relative p-2 text-secondary hover:text-white transition-colors"
            aria-label={`Bildirishnomalar (${badgeCount} ta)`}
            aria-expanded={showPanel}
          >
            <Bell size={20} />
            {badgeCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-accent text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {badgeCount > 9 ? "9+" : badgeCount}
              </span>
            )}
          </button>

          {/* Notification panel — portal orqali body'ga chiqadi */}
          {showPanel && createPortal(
            <>
              <div className="fixed inset-0 z-[9998] bg-black/40" onMouseDown={() => setShowPanel(false)} />
              <div className="fixed top-0 right-0 h-full w-[85vw] sm:w-96 bg-card border-l border-border shadow-2xl z-[9999] flex flex-col animate-slide-in-right">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                  <h3 className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>Bildirishnomalar</h3>
                  <button onClick={() => setShowPanel(false)} className="text-secondary hover:opacity-70">
                    <X size={18} />
                  </button>
                </div>

                {/* Summary */}
                {(unanalyzedCount > 0 || processingCount > 0) && (
                  <div className="px-4 py-2 bg-primary/50 border-b border-border shrink-0">
                    {unanalyzedCount > 0 && (
                      <span className="text-xs text-yellow-400">{unanalyzedCount} ta tahlil qilinmagan</span>
                    )}
                    {unanalyzedCount > 0 && processingCount > 0 && (
                      <span className="text-xs text-secondary mx-2">|</span>
                    )}
                    {processingCount > 0 && (
                      <span className="text-xs text-blue-400">{processingCount} ta tahlil qilinmoqda</span>
                    )}
                  </div>
                )}

                {/* 🚨 Red-Alerts */}
                {redAlerts.length > 0 && (
                  <div className="border-b border-border shrink-0" style={{ background: "rgba(230,69,69,0.08)" }}>
                    <div className="px-4 py-2 flex items-center gap-2">
                      <AlertTriangle size={14} color="#e64545" />
                      <span className="text-xs font-bold" style={{ color: "#e64545" }}>
                        {redAlerts.length} ta yo'qotish xavfi
                      </span>
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {redAlerts.map((a) => (
                        <div
                          key={a.id}
                          className="px-4 py-3 border-t border-border/50"
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span
                              className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                              style={{
                                background:
                                  a.riskLevel === "critical"
                                    ? "rgba(230,69,69,0.25)"
                                    : a.riskLevel === "high"
                                    ? "rgba(230,160,32,0.25)"
                                    : "rgba(59,94,245,0.25)",
                                color:
                                  a.riskLevel === "critical"
                                    ? "#e64545"
                                    : a.riskLevel === "high"
                                    ? "#e6a020"
                                    : "#3b5ef5",
                              }}
                            >
                              {a.riskLevel}
                            </span>
                            <button
                              onClick={() => ackRedAlert(a.id)}
                              className="text-[10px] text-secondary hover:text-primary transition-colors"
                              title="Tasdiqlash (ro'yxatdan o'chirish)"
                            >
                              ✓ Ack
                            </button>
                          </div>
                          <p className="text-xs mb-1" style={{ color: "var(--text-primary)" }}>
                            {a.reason}
                          </p>
                          <p className="text-[11px] italic text-secondary">💡 {a.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* List */}
                <div className="flex-1 overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="py-12 text-center text-secondary text-sm">
                      Bugungi bildirishnomalar yo'q
                    </div>
                  ) : (
                    notifications.map((file: AudioFile) => (
                      <div
                        key={file.id}
                        className="flex items-start gap-3 px-4 py-3 border-b border-border/50 hover:bg-primary/30 cursor-pointer transition-colors"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => { setShowPanel(false); window.location.href = `/audio/${file.id}`; }}
                      >
                        {statusIcon(file.status)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>{file.fileName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs ${
                              file.status === "done" ? "text-green-400" :
                              file.status === "processing" ? "text-yellow-400" :
                              file.status === "error" ? "text-red-400" : "text-secondary"
                            }`}>{statusLabel(file.status)}</span>
                            {file.analysis?.overallScore !== undefined && (
                              <span className="text-xs text-accent">{file.analysis.overallScore} ball</span>
                            )}
                          </div>
                          <span className="text-[11px] text-secondary">{timeAgo(file.createdAt)}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>,
            document.body
          )}
        </div>

        {/* Profile dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="rounded-full overflow-hidden focus:outline-none"
            aria-label="Profil menyusi"
          >
            <Avatar src={avatarSrc} name={displayName} size={36} />
          </button>

          {showProfileMenu && createPortal(
            <div ref={profileRef} className="fixed bottom-0 left-0 right-0 md:bottom-auto md:right-4 md:left-auto md:top-16 md:w-48 bg-card border-t md:border border-border rounded-t-2xl md:rounded-xl shadow-2xl z-[9999] overflow-hidden">
              {/* User name */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <User size={16} className="text-secondary shrink-0" />
                <span className="text-white text-sm font-medium truncate">
                  {userRole === "manager" ? managerUser?.name : user?.name || "Foydalanuvchi"}
                </span>
              </div>

              {/* Theme switcher — 3 column grid */}
              <div className="px-3 py-3 border-b border-border">
                <div className="grid grid-cols-3 gap-1 bg-primary rounded-lg p-1">
                  <button
                    onClick={() => setTheme("light")}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors ${
                      theme === "light" ? "bg-card text-accent shadow-sm" : "text-secondary hover:text-white"
                    }`}
                  >
                    <Sun size={13} />
                  </button>
                  <button
                    onClick={() => setTheme("dark")}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors ${
                      theme === "dark" ? "bg-card text-accent shadow-sm" : "text-secondary hover:text-white"
                    }`}
                  >
                    <Moon size={13} />
                  </button>
                  <button
                    onClick={() => setTheme("system")}
                    className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs transition-colors ${
                      theme === "system" ? "bg-card text-accent shadow-sm" : "text-secondary hover:text-white"
                    }`}
                  >
                    <Monitor size={16} />
                  </button>
                </div>
              </div>

              {/* Logout */}
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-primary/30 transition-colors"
              >
                Chiqish
              </button>
            </div>,
            document.body
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
