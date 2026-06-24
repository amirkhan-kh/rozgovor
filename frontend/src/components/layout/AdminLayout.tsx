import React, { useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../../hooks/useTheme";

const AdminLayout: React.FC = () => {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useTheme();

  useEffect(() => {
    const token = localStorage.getItem("admin_token");
    if (!token) {
      navigate("/admin/login", { replace: true });
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem("admin_token");
    navigate("/admin/login", { replace: true });
  };

  return (
    <div className="min-h-screen bg-primary flex flex-col">
      {/* Top bar */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <h1
          className="text-xl font-bold text-accent cursor-pointer"
          onClick={() => navigate("/admin")}
        >
          SalesAI Admin
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 text-secondary hover:text-white transition-colors"
            title={isDark ? "Yorug' rejim" : "Qorong'u rejim"}
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            onClick={handleLogout}
            className="text-sm text-secondary hover:text-white transition-colors"
          >
            Chiqish
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-6">
        <div className="max-w-[1240px] mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 px-6 text-center">
        <p className="text-xs text-secondary">
          &copy; 2026 - SalesAI Admin
        </p>
      </footer>
    </div>
  );
};

export default AdminLayout;
