import React, { useState } from "react";
import { CriteriaData, CriteriaGroup } from "../../../services/dashboard.service";

interface CriteriaManagersTableProps {
  data: CriteriaData;
}

const scoreColor = (score: number): string => {
  if (score >= 80) return "#2fcc6e";
  if (score >= 60) return "#e6a020";
  if (score >= 40) return "#d97706";
  return "#e64545";
};

const avatarColors = [
  "#f97316", "#3b82f6", "#2fcc6e", "#8b5cf6", "#ec4899",
  "#06b6d4", "#e64545", "#a855f7", "#14b8a6", "#e6a020",
];

const getInitials = (name: string): string => {
  const parts = name.split(/[\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
};

const truncate = (text: string, max: number): string => {
  return text.length > max ? text.substring(0, max) + "..." : text;
};

const ManagersTable: React.FC<{ group: CriteriaGroup; label: string }> = ({ group, label }) => {
  if (!group.managers || Object.keys(group.managers).length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-secondary text-sm">{label} bo'yicha menejer ma'lumotlari yo'q</p>
      </div>
    );
  }

  // Tartib: avval team (backend sortOrder bo'yicha), keyin qolgan keylar
  const criteriaKeys: string[] = [];
  const added = new Set<string>();
  Object.keys(group.team || {}).forEach((k) => {
    if (!added.has(k)) {
      criteriaKeys.push(k);
      added.add(k);
    }
  });
  Object.values(group.managers).forEach((criteria) => {
    Object.keys(criteria).forEach((k) => {
      if (!added.has(k)) {
        criteriaKeys.push(k);
        added.add(k);
      }
    });
  });

  const managerEntries = Object.entries(group.managers);
  const sortedManagers = managerEntries
    .map(([name, criteria]) => {
      const scores = Object.values(criteria);
      const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
      return { name, criteria, avg };
    })
    .sort((a, b) => b.avg - a.avg);

  return (
    <>
      {/* Desktop: Table */}
      <div className="hidden md:block bg-primary/50 border border-border rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-4 px-4 text-xs text-secondary font-semibold tracking-wider w-32">
                MENEJER
              </th>
              {criteriaKeys.map((key) => (
                <th
                  key={key}
                  className="text-center py-4 px-2 text-[10px] text-secondary font-semibold tracking-wider uppercase"
                  style={{ minWidth: 80 }}
                >
                  {truncate(key, 20)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedManagers.map(({ name, criteria }, idx) => (
              <tr key={name} className="border-b border-border/20">
                <td className="py-4 px-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-xs text-white font-bold shrink-0"
                      style={{ backgroundColor: avatarColors[idx % avatarColors.length] }}
                    >
                      {getInitials(name)}
                    </div>
                    <span className="text-white text-sm font-medium">{name}</span>
                  </div>
                </td>
                {criteriaKeys.map((key) => {
                  const score = criteria[key] ?? 0;
                  return (
                    <td key={key} className="py-4 px-2">
                      <div className="flex items-center gap-2 justify-center">
                        <span
                          className="text-sm font-semibold tabular-nums w-12 text-right"
                          style={{ color: scoreColor(score) }}
                        >
                          {score.toFixed(1)}%
                        </span>
                        <div className="w-16 h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${score}%`, backgroundColor: scoreColor(score) }}
                          />
                        </div>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: Card layout */}
      <div className="md:hidden space-y-3">
        {sortedManagers.map(({ name, criteria, avg }, idx) => (
          <div key={name} className="bg-primary/50 border border-border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs text-white font-bold shrink-0"
                style={{ backgroundColor: avatarColors[idx % avatarColors.length] }}
              >
                {getInitials(name)}
              </div>
              <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{name}</span>
              <span className="ml-auto text-sm font-bold" style={{ color: scoreColor(avg) }}>{avg}%</span>
            </div>
            <div className="space-y-1.5">
              {criteriaKeys.map((key) => {
                const score = criteria[key] ?? 0;
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="text-[10px] text-secondary truncate w-24 shrink-0">{truncate(key, 18)}</span>
                    <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
                    </div>
                    <span className="text-[10px] font-medium w-8 text-right" style={{ color: scoreColor(score) }}>{Math.round(score)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex flex-wrap gap-2">
          {sortedManagers.map(({ name, avg }) => (
            <div
              key={name}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border"
              style={{
                borderColor: scoreColor(avg) + "30",
                backgroundColor: scoreColor(avg) + "08",
              }}
            >
              <span className="text-xs text-white">{name}</span>
              <span className="text-xs font-bold" style={{ color: scoreColor(avg) }}>{avg}%</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

const CriteriaManagersTable: React.FC<CriteriaManagersTableProps> = ({ data }) => {
  const [activeTab, setActiveTab] = useState<"sotuv" | "qayta">("sotuv");

  const hasSotuv = data.sotuv && Object.keys(data.sotuv.managers || {}).length > 0;
  const hasQayta = data.qayta && Object.keys(data.qayta.managers || {}).length > 0;

  if (!hasSotuv && !hasQayta) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-3 md:p-6 overflow-hidden min-w-0">
      <h3 className="text-lg font-semibold text-white mb-0.5">
        Mezonlarga rioya qilishi (Menejerlar)
      </h3>
      <p className="text-sm text-secondary mb-4">
        Har bir menejerning mezonlarga rioya qilish ko'rsatkichlari — AI tahlili asosida
      </p>

      {/* Tabs */}
      <div className="flex gap-1 bg-primary/50 border border-border rounded-lg p-1 w-fit mb-5">
        <button
          onClick={() => setActiveTab("sotuv")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "sotuv" ? "bg-accent shadow-sm" : ""
          }`}
          style={{ color: activeTab === "sotuv" ? "#fff" : "var(--color-secondary)" }}
        >
          1-Qo'ng'iroq (Sotuv)
        </button>
        <button
          onClick={() => setActiveTab("qayta")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            activeTab === "qayta" ? "bg-accent shadow-sm" : ""
          }`}
          style={{ color: activeTab === "qayta" ? "#fff" : "var(--color-secondary)" }}
        >
          Qayta qo'ng'iroq
        </button>
      </div>

      {activeTab === "sotuv" && (
        <ManagersTable group={data.sotuv || { team: {}, managers: {} }} label="Sotuv" />
      )}
      {activeTab === "qayta" && (
        <ManagersTable group={data.qayta || { team: {}, managers: {} }} label="Qayta qo'ng'iroq" />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 md:gap-5 mt-4 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#2fcc6e" }} />
          <span className="text-secondary">A'lo (80-100)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#e6a020" }} />
          <span className="text-secondary">Yaxshi (60-79)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#d97706" }} />
          <span className="text-secondary">O'rtacha (40-59)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: "#e64545" }} />
          <span className="text-secondary">Past (0-39)</span>
        </div>
      </div>
    </div>
  );
};

export default CriteriaManagersTable;
