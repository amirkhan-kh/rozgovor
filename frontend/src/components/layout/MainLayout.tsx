import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar, { useSidebarCollapsed } from "./Sidebar";
import Header from "./Header";
import AnnouncementBigScreen from "../AnnouncementBigScreen";
import CelebrationProvider from "../CelebrationProvider";

const MainLayout: React.FC = () => {
  const collapsed = useSidebarCollapsed();

  return (
    <div className="flex min-h-screen bg-primary">
      <AnnouncementBigScreen />
      <CelebrationProvider />
      <Sidebar />

      {/* Main content area — desktopda sidebar kengligi bo'yicha dinamik margin.
          Mobileda margin yo'q (sidebar overlay) */}
      <div
        className="flex-1 flex flex-col min-h-screen transition-[margin] duration-300 ease-in-out md:ml-[var(--sidebar-w)]"
        style={
          {
            // CSS variable — har responsive breakpoint bir xil ishlaydi
            "--sidebar-w": collapsed ? "64px" : "220px",
          } as React.CSSProperties
        }
      >
        {/* Header — sticky fixed */}
        <Header />

        {/* Content */}
        <main className="flex-1 p-4 md:p-6">
          <div className="max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>

        {/* Footer — faqat desktop */}
        <footer className="hidden md:block border-t border-border py-4 px-6 text-center">
          <p className="text-xs text-secondary">
            &copy; 2026 - SalesAI &nbsp;&middot;&nbsp; SalesAI - bu AI va u
            xato qilishi mumkin.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default MainLayout;
