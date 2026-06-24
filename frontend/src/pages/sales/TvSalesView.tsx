import React from "react";
import {
  Users,
  TrendingUp,
  Percent,
  Wallet,
  Filter,
  Receipt,
  Clock,
  BarChart3,
  Trophy,
  ClipboardList,
  ClipboardX,
  AlertTriangle,
  CalendarClock,
  X,
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  SalesOverview,
  SalesTaskStats,
  SalesByManager,
} from "../../services/sales.service";

type FilterKey = "today" | "week" | "month" | "custom";

interface PieDatum {
  id: string;
  name: string;
  value: number;
  share: number;
  color: string;
}

interface Props {
  data: SalesOverview;
  taskStats: SalesTaskStats | undefined;
  filter: FilterKey;
  onFilterChange: (f: FilterKey) => void;
  pieData: PieDatum[];
  pieManagers: SalesByManager[];
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  onExit: () => void;
}

const PIE_COLORS = [
  "#3b5ef5",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#ef4444",
  "#14b8a6",
  "#f97316",
  "#a855f7",
];

const formatMoney = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} mlrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} mln`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} ming`;
  return String(Math.round(n));
};

const formatDays = (days: number): string => {
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours} s`;
  }
  const whole = Math.floor(days);
  const frac = Math.round((days - whole) * 10);
  return frac > 0 ? `${whole}.${frac} k` : `${whole} k`;
};

// TV uchun font/o'lcham yordamchi — clamp() orqali 1280px dan 3840px gacha adaptiv
const fs = (min: number, vw: number, max: number) =>
  `clamp(${min}px, ${vw}vw, ${max}px)`;

const TvSalesView: React.FC<Props> = ({
  data,
  taskStats,
  filter,
  onFilterChange,
  pieData,
  pieManagers,
  activeId,
  setActiveId,
  onExit,
}) => {
  const activeIdx = activeId
    ? pieData.findIndex((d) => d.id === activeId)
    : -1;
  const topManagers = pieManagers.slice(0, 8);

  const kpis = [
    {
      label: "Lid soni",
      value: data.kpis.leadCount.toLocaleString("ru-RU"),
      suffix: "ta",
      color: "#3b5ef5",
      Icon: Users,
    },
    {
      label: "Sifatli lid",
      value: data.kpis.qualifiedLeadCount.toLocaleString("ru-RU"),
      suffix: "ta",
      color: "#06b6d4",
      Icon: Filter,
    },
    {
      label: "Konversiya",
      value: String(data.kpis.conversionRate),
      suffix: "%",
      color: "#8b5cf6",
      Icon: Percent,
    },
    {
      label: "Sotuv soni",
      value: data.kpis.salesCount.toLocaleString("ru-RU"),
      suffix: "ta",
      color: "#22c55e",
      Icon: TrendingUp,
    },
    {
      label: "Tushum",
      value: formatMoney(data.kpis.totalRevenue),
      suffix: "UZS",
      color: "#f59e0b",
      Icon: Wallet,
    },
    {
      label: "O'rtacha chek",
      value: formatMoney(data.kpis.avgCheck),
      suffix: "UZS",
      color: "#14b8a6",
      Icon: Receipt,
    },
  ];

  const taskCards = taskStats
    ? [
        {
          label: "Umumiy",
          value: taskStats.totalOpen,
          color: "#8b5cf6",
          Icon: ClipboardList,
        },
        {
          label: "Bez zadach",
          value: taskStats.dealsWithoutTask,
          color: "#64748b",
          Icon: ClipboardX,
          hint: `${taskStats.openDeals} dealdan`,
        },
        {
          label: "Prosrochka",
          value: taskStats.overdue,
          color: "#ef4444",
          Icon: AlertTriangle,
        },
        {
          label: "Bugungi",
          value: taskStats.today,
          color: "#f59e0b",
          Icon: CalendarClock,
        },
      ]
    : [];

  const labelMap: Record<FilterKey, string> = {
    month: "Bu oy",
    week: "Bu hafta",
    today: "Bugun",
    custom: "Oraliq",
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--color-primary-bg)",
        padding: "2.5vh 3vw",
        gap: "2vh",
      }}
    >
      {/* ─── Header ─── */}
      <div
        className="flex items-center justify-between flex-wrap"
        style={{ gap: "1.5vw" }}
      >
        <div className="flex items-center" style={{ gap: "1vw" }}>
          <TrendingUp
            style={{
              color: "#22c55e",
              width: fs(32, 2.8, 60),
              height: fs(32, 2.8, 60),
            }}
          />
          <div>
            <h1
              className="font-black"
              style={{
                color: "var(--text-primary)",
                fontSize: fs(30, 2.8, 60),
                lineHeight: 1.1,
              }}
            >
              Sotuv — Umumiy ko'rinish
            </h1>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: fs(14, 1, 22),
                marginTop: "0.4vh",
              }}
            >
              Har 30 sekundda yangilanadi · ESC — chiqish
            </p>
          </div>
        </div>

        <div className="flex items-center" style={{ gap: "1vw" }}>
          {/* Period pills */}
          <div
            className="inline-flex items-center rounded-xl border"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-card-bg)",
              padding: "0.4vh 0.3vw",
              gap: "0.2vw",
            }}
          >
            {(["month", "week", "today"] as FilterKey[]).map((key) => {
              const active = filter === key;
              return (
                <button
                  key={key}
                  onClick={() => onFilterChange(key)}
                  className="rounded-lg font-semibold transition-all"
                  style={{
                    backgroundColor: active ? "#22c55e" : "transparent",
                    color: active ? "#ffffff" : "var(--text-secondary)",
                    padding: "1.1vh 1.3vw",
                    fontSize: fs(14, 1.1, 22),
                  }}
                >
                  {labelMap[key]}
                </button>
              );
            })}
          </div>

          <button
            onClick={onExit}
            className="flex items-center rounded-xl border font-semibold transition-all"
            style={{
              borderColor: "var(--color-border)",
              color: "var(--text-primary)",
              backgroundColor: "var(--color-card-bg)",
              padding: "1.1vh 1.3vw",
              fontSize: fs(14, 1.1, 22),
              gap: "0.5vw",
            }}
            title="ESC — chiqish"
          >
            <X
              style={{
                width: fs(18, 1.2, 26),
                height: fs(18, 1.2, 26),
              }}
            />
            Chiqish
          </button>
        </div>
      </div>

      {/* ─── KPI row — 6 ta, bir qator ─── */}
      <div
        className="grid grid-cols-6"
        style={{ gap: "1vw", flexShrink: 0 }}
      >
        {kpis.map((k) => {
          const Icon = k.Icon;
          return (
            <div
              key={k.label}
              className="relative overflow-hidden rounded-2xl border flex flex-col justify-between"
              style={{
                backgroundColor: "var(--color-card-bg)",
                borderColor: "var(--color-border)",
                padding: "1.6vh 1vw",
                minHeight: "18vh",
              }}
            >
              <div
                className="flex items-start justify-between"
                style={{ gap: "0.5vw" }}
              >
                <p
                  className="font-bold uppercase tracking-wider truncate"
                  style={{
                    color: "var(--text-secondary)",
                    opacity: 0.75,
                    fontSize: fs(11, 0.85, 18),
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  {k.label}
                </p>
                <div
                  className="flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{
                    backgroundColor: `${k.color}22`,
                    color: k.color,
                    width: fs(36, 2.8, 56),
                    height: fs(36, 2.8, 56),
                  }}
                >
                  <Icon
                    style={{
                      width: fs(18, 1.5, 30),
                      height: fs(18, 1.5, 30),
                    }}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <div
                  className="font-black tracking-tight truncate"
                  style={{
                    color: "var(--text-primary)",
                    fontSize: fs(26, 2.4, 52),
                    lineHeight: 1.05,
                  }}
                  title={`${k.value} ${k.suffix}`}
                >
                  {k.value}
                </div>
                <div
                  className="font-semibold uppercase tracking-wide truncate"
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: fs(10, 0.75, 15),
                    marginTop: "0.4vh",
                    opacity: 0.8,
                  }}
                >
                  {k.suffix}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Sotuv sikli — ingichka row ─── */}
      <div
        className="flex items-center justify-between flex-wrap rounded-2xl border"
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
          padding: "1.4vh 1.4vw",
          gap: "1vw",
          flexShrink: 0,
        }}
      >
        <div className="flex items-center" style={{ gap: "1vw" }}>
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              backgroundColor: "rgba(6, 182, 212, 0.15)",
              color: "#06b6d4",
              width: fs(48, 3.8, 80),
              height: fs(48, 3.8, 80),
            }}
          >
            <Clock
              style={{
                width: fs(22, 1.9, 40),
                height: fs(22, 1.9, 40),
              }}
            />
          </div>
          <div>
            <h3
              className="font-bold"
              style={{
                color: "var(--text-primary)",
                fontSize: fs(18, 1.4, 30),
                lineHeight: 1.1,
              }}
            >
              Sotuv sikli
            </h3>
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: fs(12, 0.9, 18),
                marginTop: "0.2vh",
              }}
            >
              Lid tushgandan sotuvgacha
            </p>
          </div>
        </div>
        <div className="flex items-center" style={{ gap: "2vw" }}>
          <div className="text-center">
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: fs(12, 0.9, 18),
              }}
            >
              O'rtacha
            </p>
            <p
              className="font-black"
              style={{
                color: "#06b6d4",
                fontSize: fs(28, 2.4, 52),
                lineHeight: 1.1,
                marginTop: "0.3vh",
              }}
            >
              {formatDays(data.cycle.avgDays)}
            </p>
          </div>
          <div
            className="text-center border-l"
            style={{
              borderColor: "var(--color-border)",
              paddingLeft: "1.5vw",
            }}
          >
            <p
              style={{
                color: "var(--text-secondary)",
                fontSize: fs(12, 0.9, 18),
              }}
            >
              Hisoblangan
            </p>
            <p
              className="font-bold"
              style={{
                color: "var(--text-primary)",
                fontSize: fs(24, 2, 44),
                lineHeight: 1.1,
                marginTop: "0.3vh",
              }}
            >
              {data.cycle.sampleCount} ta
            </p>
          </div>
        </div>
      </div>

      {/* ─── Main — pie 2/3 + tasks 1/3 ─── */}
      <div
        className="grid grid-cols-3 flex-1 min-h-0"
        style={{ gap: "1.2vw" }}
      >
        {/* Menejerlar pie */}
        <div
          className="col-span-2 rounded-2xl border flex flex-col min-h-0"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
            padding: "1.6vh 1.4vw",
          }}
        >
          <div
            className="flex items-center"
            style={{ gap: "0.6vw", marginBottom: "1.2vh" }}
          >
            <BarChart3
              style={{
                color: "#3b5ef5",
                width: fs(22, 1.6, 32),
                height: fs(22, 1.6, 32),
              }}
            />
            <h2
              className="font-bold"
              style={{
                color: "var(--text-primary)",
                fontSize: fs(18, 1.5, 30),
              }}
            >
              Menejerlar bo'yicha sotuv
            </h2>
          </div>

          <div
            className="grid grid-cols-5 flex-1 min-h-0"
            style={{ gap: "1vw" }}
          >
            {/* Pie */}
            <div className="col-span-2 relative min-h-0">
              {pieData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius="55%"
                        outerRadius="92%"
                        paddingAngle={2}
                        dataKey="value"
                        stroke="none"
                        startAngle={90}
                        endAngle={-270}
                        onMouseEnter={(_, i) =>
                          setActiveId(pieData[i]?.id ?? null)
                        }
                        onMouseLeave={() => setActiveId(null)}
                      >
                        {pieData.map((d, i) => (
                          <Cell
                            key={d.id}
                            fill={d.color}
                            style={{
                              filter:
                                activeIdx === -1 || activeIdx === i
                                  ? "none"
                                  : "opacity(0.4)",
                              transition: "filter 0.2s",
                            }}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      {activeIdx >= 0 ? (
                        <>
                          <div
                            className="font-semibold truncate mx-auto"
                            style={{
                              color: pieData[activeIdx].color,
                              fontSize: fs(14, 1.1, 22),
                              maxWidth: "14vw",
                              marginBottom: "0.4vh",
                            }}
                          >
                            {pieData[activeIdx].name}
                          </div>
                          <div
                            className="font-black"
                            style={{
                              color: "var(--text-primary)",
                              fontSize: fs(32, 3, 64),
                              lineHeight: 1,
                            }}
                          >
                            {pieData[activeIdx].share}%
                          </div>
                          <div
                            style={{
                              color: "var(--text-secondary)",
                              fontSize: fs(12, 0.9, 18),
                              marginTop: "0.4vh",
                            }}
                          >
                            {pieData[activeIdx].value} sotuv
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className="font-black"
                            style={{
                              color: "var(--text-primary)",
                              fontSize: fs(40, 3.4, 76),
                              lineHeight: 1,
                            }}
                          >
                            {data.kpis.salesCount}
                          </div>
                          <div
                            className="font-semibold"
                            style={{
                              color: "var(--text-secondary)",
                              fontSize: fs(12, 0.9, 18),
                              marginTop: "0.6vh",
                            }}
                          >
                            Jami sotuv
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div
                  className="h-full flex items-center justify-center"
                  style={{
                    color: "var(--text-secondary)",
                    fontSize: fs(14, 1, 22),
                  }}
                >
                  Ma'lumot yo'q
                </div>
              )}
            </div>

            {/* Legend — top 8, flex bilan teng baland */}
            <div
              className="col-span-3 flex flex-col min-h-0"
              style={{ gap: "0.5vh" }}
            >
              {topManagers.map((m, idx) => {
                const color = PIE_COLORS[idx % PIE_COLORS.length];
                const isActive = activeId === m.managerId;
                return (
                  <div
                    key={m.managerId}
                    onMouseEnter={() => setActiveId(m.managerId)}
                    onMouseLeave={() => setActiveId(null)}
                    className="flex items-center rounded-lg border transition-all flex-1 min-h-0"
                    style={{
                      backgroundColor: isActive ? `${color}18` : "transparent",
                      borderColor: isActive ? color : "var(--color-border)",
                      padding: "0.8vh 0.8vw",
                      gap: "0.7vw",
                    }}
                  >
                    <span
                      className="flex-shrink-0 rounded-full"
                      style={{
                        backgroundColor: color,
                        width: fs(10, 0.9, 18),
                        height: fs(10, 0.9, 18),
                      }}
                    />
                    <div
                      className="flex-shrink-0 flex items-center justify-center"
                      style={{
                        width: fs(22, 1.8, 36),
                      }}
                    >
                      {idx < 3 ? (
                        <Trophy
                          style={{
                            color:
                              idx === 0
                                ? "#FFD700"
                                : idx === 1
                                ? "#C0C0C0"
                                : "#CD7F32",
                            width: fs(16, 1.2, 24),
                            height: fs(16, 1.2, 24),
                          }}
                        />
                      ) : (
                        <span
                          className="font-bold"
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: fs(13, 1, 20),
                          }}
                        >
                          {idx + 1}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-semibold truncate"
                        style={{
                          color: "var(--text-primary)",
                          fontSize: fs(14, 1.1, 22),
                          lineHeight: 1.2,
                        }}
                      >
                        {m.managerName}
                      </div>
                      <div
                        className="truncate"
                        style={{
                          color: "var(--text-secondary)",
                          fontSize: fs(11, 0.85, 17),
                          marginTop: "0.2vh",
                        }}
                      >
                        {m.leadCount} lid · {m.qualifiedLeadCount} kval ·{" "}
                        {m.conversionRate}% konv
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div
                        className="font-bold"
                        style={{
                          color,
                          fontSize: fs(14, 1.2, 24),
                          lineHeight: 1.1,
                        }}
                      >
                        {m.salesCount} sotuv
                      </div>
                      <div
                        className="font-medium"
                        style={{
                          color: "#22c55e",
                          fontSize: fs(11, 0.85, 17),
                          marginTop: "0.2vh",
                        }}
                      >
                        {formatMoney(m.revenue)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Tasks */}
        {taskStats ? (
          <div
            className="rounded-2xl border flex flex-col min-h-0"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
              padding: "1.6vh 1.4vw",
            }}
          >
            <div
              className="flex items-center"
              style={{ gap: "0.6vw", marginBottom: "1.2vh" }}
            >
              <ClipboardList
                style={{
                  color: "#8b5cf6",
                  width: fs(22, 1.6, 32),
                  height: fs(22, 1.6, 32),
                }}
              />
              <h2
                className="font-bold"
                style={{
                  color: "var(--text-primary)",
                  fontSize: fs(18, 1.5, 30),
                }}
              >
                Zadach statistikasi
              </h2>
            </div>
            <div
              className="grid grid-cols-2 flex-1 min-h-0"
              style={{ gap: "0.8vw" }}
            >
              {taskCards.map((t) => {
                const Icon = t.Icon;
                return (
                  <div
                    key={t.label}
                    className="relative overflow-hidden rounded-xl border flex flex-col justify-between min-h-0"
                    style={{
                      backgroundColor: "var(--color-primary-bg)",
                      borderColor: "var(--color-border)",
                      padding: "1.2vh 1vw",
                    }}
                  >
                    <div
                      className="flex items-start justify-between"
                      style={{ gap: "0.4vw" }}
                    >
                      <p
                        className="font-bold uppercase tracking-wider"
                        style={{
                          color: "var(--text-secondary)",
                          opacity: 0.75,
                          fontSize: fs(10, 0.8, 16),
                          lineHeight: 1.1,
                        }}
                      >
                        {t.label}
                      </p>
                      <div
                        className="flex items-center justify-center rounded-lg flex-shrink-0"
                        style={{
                          backgroundColor: `${t.color}22`,
                          color: t.color,
                          width: fs(32, 2.4, 52),
                          height: fs(32, 2.4, 52),
                        }}
                      >
                        <Icon
                          style={{
                            width: fs(16, 1.2, 26),
                            height: fs(16, 1.2, 26),
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div
                        className="flex items-baseline"
                        style={{ gap: "0.3vw" }}
                      >
                        <span
                          className="font-black"
                          style={{
                            color: "var(--text-primary)",
                            fontSize: fs(28, 2.4, 54),
                            lineHeight: 1,
                          }}
                        >
                          {t.value.toLocaleString("ru-RU")}
                        </span>
                        <span
                          className="font-medium"
                          style={{
                            color: "var(--text-secondary)",
                            fontSize: fs(12, 0.85, 18),
                          }}
                        >
                          ta
                        </span>
                      </div>
                      {t.hint && (
                        <p
                          style={{
                            color: "var(--text-secondary)",
                            opacity: 0.7,
                            fontSize: fs(10, 0.75, 15),
                            marginTop: "0.4vh",
                          }}
                        >
                          {t.hint}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TvSalesView;
