import React, { useState } from "react";
import { useAuth } from "../../store/authStore";
import ProfileTab from "./tabs/ProfileTab";
import CriteriaTab from "./tabs/CriteriaTab";
import NotificationsTab from "./tabs/NotificationsTab";
import LessonsTab from "./tabs/LessonsTab";
import PermissionsTab from "./tabs/PermissionsTab";
import VideosTab from "./tabs/VideosTab";
import DepartmentsTab from "./tabs/DepartmentsTab";
import BotScheduleTab from "./tabs/BotScheduleTab";

const adminTabs = [
  { id: "profile", label: "Profil" },
  { id: "departments", label: "Aktiv bo'limlar" },
  { id: "criteria", label: "Suhbat mezonlari" },
  { id: "notifications", label: "Bildirishnomalar" },
  { id: "bot-schedule", label: "Bot jadvali" },
  { id: "permissions-manager", label: "Manager" },
  { id: "permissions-rop", label: "ROP" },
];

const managerTabs = [
  { id: "profile", label: "Profil" },
  { id: "lessons", label: "Darsliklar" },
  { id: "videos", label: "Videolar" },
  { id: "notifications", label: "Bildirishnomalar" },
  { id: "bot-schedule", label: "Bot va ish jadvalim" },
];

const ProfilePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("profile");
  const { userRole } = useAuth();
  const isAdmin = userRole === "company";
  const tabs = isAdmin ? adminTabs : managerTabs;

  return (
    <div className="space-y-6 overflow-hidden pb-8">
      {/* Tablar */}
      {tabs.length > 1 && (
        <div
          className="flex border-b overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 scrollbar-hide"
          style={{ borderColor: "var(--color-border)" }}
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 md:px-4 py-3 text-xs md:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                activeTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-secondary hover:opacity-80"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab content */}
      <div>
        {activeTab === "profile" && <ProfileTab />}
        {activeTab === "departments" && isAdmin && <DepartmentsTab />}
        {activeTab === "criteria" && isAdmin && <CriteriaTab />}
        {activeTab === "lessons" && !isAdmin && <LessonsTab />}
        {activeTab === "videos" && !isAdmin && <VideosTab />}
        {activeTab === "notifications" && <NotificationsTab />}
        {activeTab === "bot-schedule" && <BotScheduleTab />}
        {activeTab === "permissions-manager" && isAdmin && (
          <PermissionsTab role="manager" />
        )}
        {activeTab === "permissions-rop" && isAdmin && (
          <PermissionsTab role="rop" />
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
