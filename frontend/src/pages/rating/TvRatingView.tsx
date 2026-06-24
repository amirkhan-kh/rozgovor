import React from "react";
import { X, Trophy } from "lucide-react";
import { SalesLeaderboardRow } from "../../services/rating.service";
import { Rating } from "../../types";

type PeriodKey = "today" | "week" | "month" | "custom";
type SalesMode = "count" | "amount";

const PERIOD_LABEL: Record<PeriodKey, string> = {
  month: "Bu oy",
  week: "Bu hafta",
  today: "Bugun",
  custom: "Oraliq",
};

const formatMoney = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} mlrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} mln`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} ming`;
  return String(Math.round(n));
};

const fs = (min: number, vw: number, max: number) =>
  `clamp(${min}px, ${vw}vw, ${max}px)`;

// ─── Umumiy TV header — period pills + mode toggle + chiqish ──────────
interface TvHeaderProps {
  title: string;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  mode?: SalesMode;
  onModeChange?: (m: SalesMode) => void;
  onExit: () => void;
}

const TvHeader: React.FC<TvHeaderProps> = ({
  title,
  period,
  onPeriodChange,
  mode,
  onModeChange,
  onExit,
}) => (
  <div
    className="flex items-center justify-between flex-wrap"
    style={{ gap: "1.2vw", flexShrink: 0 }}
  >
    <div>
      <h1
        className="font-black"
        style={{
          color: "var(--text-primary)",
          fontSize: fs(30, 2.8, 60),
          lineHeight: 1.1,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          color: "var(--text-secondary)",
          fontSize: fs(14, 1, 22),
          marginTop: "0.4vh",
        }}
      >
        Real-time · ESC — chiqish · T — test animatsiya
      </p>
    </div>

    <div className="flex items-center flex-wrap" style={{ gap: "1vw" }}>
      {/* Mode toggle (faqat sales) */}
      {mode && onModeChange && (
        <div
          className="inline-flex items-center rounded-xl border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-card-bg)",
            padding: "0.4vh 0.3vw",
            gap: "0.2vw",
          }}
        >
          {(["count", "amount"] as const).map((mm) => {
            const active = mode === mm;
            return (
              <button
                key={mm}
                onClick={() => !active && onModeChange(mm)}
                className="rounded-lg font-semibold transition-all"
                style={{
                  backgroundColor: active ? "#22c55e" : "transparent",
                  color: active ? "#ffffff" : "var(--text-secondary)",
                  padding: "1.1vh 1.2vw",
                  fontSize: fs(14, 1.05, 22),
                }}
              >
                {mm === "count" ? "Soni" : "Summa"}
              </button>
            );
          })}
        </div>
      )}

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
        {(["month", "week", "today"] as PeriodKey[]).map((key) => {
          const active = period === key;
          return (
            <button
              key={key}
              onClick={() => onPeriodChange(key)}
              className="rounded-lg font-semibold transition-all"
              style={{
                backgroundColor: active ? "#22c55e" : "transparent",
                color: active ? "#ffffff" : "var(--text-secondary)",
                padding: "1.1vh 1.3vw",
                fontSize: fs(14, 1.1, 22),
              }}
            >
              {PERIOD_LABEL[key]}
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
);

const rankBg = (i: number): string => {
  if (i === 0) return "rgba(250,204,21,0.10)";
  if (i === 1) return "rgba(156,163,175,0.08)";
  if (i === 2) return "rgba(217,119,87,0.08)";
  return "transparent";
};

const RankCell: React.FC<{ i: number }> = ({ i }) => (
  <div
    className="flex items-center justify-center"
    style={{ width: fs(42, 3.5, 72) }}
  >
    {i < 3 ? (
      <Trophy
        style={{
          color: i === 0 ? "#FFD700" : i === 1 ? "#C0C0C0" : "#CD7F32",
          width: fs(28, 2.4, 52),
          height: fs(28, 2.4, 52),
        }}
      />
    ) : (
      <span
        className="font-black"
        style={{
          color: "var(--text-secondary)",
          fontSize: fs(22, 1.8, 40),
        }}
      >
        {i + 1}
      </span>
    )}
  </div>
);

// ═══ Sales leaderboard TV ═══════════════════════════════════════════
interface TvSalesLeaderboardProps {
  rows: SalesLeaderboardRow[];
  mode: SalesMode;
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  onModeChange: (m: SalesMode) => void;
  onExit: () => void;
}

export const TvSalesLeaderboard: React.FC<TvSalesLeaderboardProps> = ({
  rows,
  mode,
  period,
  onPeriodChange,
  onModeChange,
  onExit,
}) => {
  const top = rows.slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--color-primary-bg)",
        padding: "2.5vh 3vw",
        gap: "2vh",
      }}
    >
      <TvHeader
        title="Sotuv reytingi"
        period={period}
        onPeriodChange={onPeriodChange}
        mode={mode}
        onModeChange={onModeChange}
        onExit={onExit}
      />

      {/* Table header — 7 ustun: rank, menejer, plan, fakt, summa/sotuv, KPI, konv */}
      <div
        className="grid flex-shrink-0"
        style={{
          gridTemplateColumns: "auto 2.4fr 1.2fr 1.4fr 1.3fr 1.3fr 0.9fr",
          gap: "0.8vw",
          padding: "1.4vh 1vw",
          borderBottom: "2px solid var(--color-border)",
        }}
      >
        <div style={{ width: fs(42, 3.5, 72) }} />
        <div
          className="font-bold uppercase tracking-wider"
          style={{
            color: "var(--text-secondary)",
            fontSize: fs(12, 0.9, 18),
          }}
        >
          Menejer
        </div>
        <div
          className="font-bold uppercase tracking-wider text-center"
          style={{
            color: "var(--text-secondary)",
            fontSize: fs(12, 0.9, 18),
          }}
        >
          Plan
        </div>
        <div
          className="font-bold uppercase tracking-wider text-center"
          style={{
            color: "var(--text-secondary)",
            fontSize: fs(12, 0.9, 18),
          }}
        >
          Fakt
        </div>
        <div
          className="font-bold uppercase tracking-wider text-center"
          style={{
            color: "var(--text-secondary)",
            fontSize: fs(12, 0.9, 18),
          }}
        >
          {mode === "count" ? "Summa" : "Sotuv"}
        </div>
        <div
          className="font-bold uppercase tracking-wider text-center"
          style={{
            color: "var(--text-secondary)",
            fontSize: fs(12, 0.9, 18),
          }}
        >
          KPI
        </div>
        <div
          className="font-bold uppercase tracking-wider text-center"
          style={{
            color: "var(--text-secondary)",
            fontSize: fs(12, 0.9, 18),
          }}
        >
          Konv
        </div>
      </div>

      {/* Rows — flex bilan teng taqsim */}
      <div
        className="flex-1 min-h-0 flex flex-col"
        style={{ gap: "0.5vh" }}
      >
        {top.map((r, i) => (
          <div
            key={r.managerId}
            className="grid items-center rounded-xl flex-1 min-h-0"
            style={{
              gridTemplateColumns: "auto 2.4fr 1.2fr 1.4fr 1.3fr 1.3fr 0.9fr",
              gap: "0.8vw",
              padding: "0.6vh 1vw",
              backgroundColor: rankBg(i),
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <RankCell i={i} />
            <div
              className="flex items-center min-w-0"
              style={{ gap: "0.8vw" }}
            >
              {r.photoUrl ? (
                <img
                  src={r.photoUrl}
                  alt={r.managerName}
                  className="rounded-full object-cover flex-shrink-0"
                  style={{
                    width: fs(44, 3.5, 72),
                    height: fs(44, 3.5, 72),
                    border: "2px solid var(--color-border)",
                  }}
                />
              ) : (
                <div
                  className="rounded-full flex items-center justify-center font-black flex-shrink-0"
                  style={{
                    width: fs(44, 3.5, 72),
                    height: fs(44, 3.5, 72),
                    backgroundColor: "rgba(59,94,245,0.15)",
                    color: "#3b5ef5",
                    fontSize: fs(18, 1.4, 30),
                    border: "2px solid var(--color-border)",
                  }}
                >
                  {r.managerName.charAt(0)}
                </div>
              )}
              <div className="min-w-0">
                <div
                  className="font-bold truncate"
                  style={{
                    color: "var(--text-primary)",
                    fontSize: fs(15, 1.15, 24),
                    lineHeight: 1.15,
                  }}
                >
                  {r.managerName}
                </div>
                {r.role && (
                  <div
                    className="truncate"
                    style={{
                      color: "var(--text-secondary)",
                      fontSize: fs(10, 0.75, 14),
                      marginTop: "0.2vh",
                    }}
                  >
                    {r.role}
                  </div>
                )}
              </div>
            </div>
            <div
              className="text-center font-semibold truncate"
              style={{
                color: "var(--text-secondary)",
                fontSize: fs(14, 1.1, 22),
              }}
            >
              {r.plan > 0
                ? mode === "amount"
                  ? formatMoney(r.plan)
                  : r.plan.toLocaleString("ru-RU")
                : "—"}
            </div>
            <div className="text-center flex flex-col items-center justify-center min-w-0">
              <span
                className="font-black truncate w-full"
                style={{
                  color: "var(--text-primary)",
                  fontSize: fs(17, 1.35, 28),
                  lineHeight: 1.1,
                }}
              >
                {mode === "amount"
                  ? formatMoney(r.fakt)
                  : r.fakt.toLocaleString("ru-RU")}
              </span>
              {r.plan > 0 && (
                <span
                  className="font-bold rounded-full"
                  style={{
                    backgroundColor:
                      r.percent >= 100
                        ? "rgba(34,197,94,0.18)"
                        : r.percent >= 60
                        ? "rgba(245,158,11,0.18)"
                        : "rgba(239,68,68,0.18)",
                    color:
                      r.percent >= 100
                        ? "#22c55e"
                        : r.percent >= 60
                        ? "#f59e0b"
                        : "#ef4444",
                    fontSize: fs(10, 0.75, 15),
                    padding: "0.15vh 0.7vw",
                    marginTop: "0.3vh",
                  }}
                >
                  {r.percent}%
                </span>
              )}
            </div>
            <div
              className="text-center font-bold truncate"
              style={{
                color: mode === "count" ? "#22c55e" : "var(--text-primary)",
                fontSize: fs(14, 1.1, 22),
              }}
            >
              {mode === "count"
                ? r.revenue > 0
                  ? formatMoney(r.revenue)
                  : "—"
                : r.salesCount > 0
                ? r.salesCount.toLocaleString("ru-RU")
                : "—"}
            </div>
            {/* KPI ustuni — yuqorida summa, pastida foiz badge */}
            <div className="text-center flex flex-col items-center justify-center min-w-0">
              <span
                className="font-black truncate w-full"
                style={{
                  color: r.kpiAmount > 0 ? "#a855f7" : "var(--text-secondary)",
                  fontSize: fs(15, 1.2, 24),
                  lineHeight: 1.1,
                }}
              >
                {r.kpiAmount > 0 ? formatMoney(r.kpiAmount) : "—"}
              </span>
              {r.kpiPercent > 0 && (
                <span
                  className="font-bold rounded-full"
                  style={{
                    backgroundColor: "rgba(168,85,247,0.18)",
                    color: "#a855f7",
                    fontSize: fs(10, 0.75, 15),
                    padding: "0.15vh 0.7vw",
                    marginTop: "0.3vh",
                  }}
                >
                  {r.kpiPercent}%
                </span>
              )}
            </div>
            <div
              className="text-center font-bold truncate"
              style={{
                color: "var(--text-primary)",
                fontSize: fs(14, 1.1, 22),
              }}
            >
              {r.conversion}%
            </div>
          </div>
        ))}
        {top.length === 0 && (
          <div
            className="flex items-center justify-center flex-1"
            style={{
              color: "var(--text-secondary)",
              fontSize: fs(18, 1.4, 28),
            }}
          >
            Menejerlar topilmadi
          </div>
        )}
      </div>
    </div>
  );
};

// ═══ Audit leaderboard TV ═══════════════════════════════════════════
interface TvAuditLeaderboardProps {
  rows: Rating[];
  period: PeriodKey;
  onPeriodChange: (p: PeriodKey) => void;
  onExit: () => void;
}

const scoreBg = (s: number): string => {
  if (s >= 80) return "rgba(34,197,94,0.18)";
  if (s >= 60) return "rgba(245,158,11,0.18)";
  return "rgba(239,68,68,0.18)";
};

const scoreColor = (s: number): string => {
  if (s >= 80) return "#22c55e";
  if (s >= 60) return "#f59e0b";
  return "#ef4444";
};

export const TvAuditLeaderboard: React.FC<TvAuditLeaderboardProps> = ({
  rows,
  period,
  onPeriodChange,
  onExit,
}) => {
  const top = rows.slice(0, 10);

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
      style={{
        backgroundColor: "var(--color-primary-bg)",
        padding: "2.5vh 3vw",
        gap: "2vh",
      }}
    >
      <TvHeader
        title="Menejerlar reytingi"
        period={period}
        onPeriodChange={onPeriodChange}
        onExit={onExit}
      />

      <div
        className="grid flex-shrink-0"
        style={{
          gridTemplateColumns: "auto 3fr 1.4fr 1.4fr 1.4fr 1.4fr",
          gap: "1vw",
          padding: "1.4vh 1vw",
          borderBottom: "2px solid var(--color-border)",
        }}
      >
        <div style={{ width: fs(42, 3.5, 72) }} />
        {["Menejer", "Me'zonlar", "Sotuvlar", "Umumiy ball", "Qo'ng'iroqlar"].map(
          (h, i) => (
            <div
              key={h}
              className="font-bold uppercase tracking-wider"
              style={{
                color: "var(--text-secondary)",
                fontSize: fs(13, 1, 20),
                textAlign: i === 0 ? "left" : "center",
              }}
            >
              {h}
            </div>
          )
        )}
      </div>

      <div
        className="flex-1 min-h-0 flex flex-col"
        style={{ gap: "0.5vh" }}
      >
        {top.map((r, i) => (
          <div
            key={r.manager.id}
            className="grid items-center rounded-xl flex-1 min-h-0"
            style={{
              gridTemplateColumns: "auto 3fr 1.4fr 1.4fr 1.4fr 1.4fr",
              gap: "1vw",
              padding: "0.6vh 1vw",
              backgroundColor: rankBg(i),
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <RankCell i={i} />
            <div
              className="font-bold truncate"
              style={{
                color: "var(--text-primary)",
                fontSize: fs(18, 1.4, 30),
                lineHeight: 1.2,
              }}
            >
              {r.manager.name}
            </div>
            <div className="text-center">
              <span
                className="font-bold rounded-full"
                style={{
                  backgroundColor: scoreBg(r.criteriaScore),
                  color: scoreColor(r.criteriaScore),
                  fontSize: fs(14, 1.1, 22),
                  padding: "0.5vh 1vw",
                }}
              >
                {r.criteriaScore}%
              </span>
            </div>
            <div
              className="text-center font-bold"
              style={{
                color: "var(--text-primary)",
                fontSize: fs(20, 1.6, 34),
              }}
            >
              {r.sales}
            </div>
            <div className="text-center">
              <span
                className="font-bold rounded-full"
                style={{
                  backgroundColor: scoreBg(r.overallScore),
                  color: scoreColor(r.overallScore),
                  fontSize: fs(14, 1.1, 22),
                  padding: "0.5vh 1vw",
                }}
              >
                {r.overallScore}%
              </span>
            </div>
            <div
              className="text-center font-bold"
              style={{
                color: "var(--text-primary)",
                fontSize: fs(20, 1.6, 34),
              }}
            >
              {r.callsCount}
            </div>
          </div>
        ))}
        {top.length === 0 && (
          <div
            className="flex items-center justify-center flex-1"
            style={{
              color: "var(--text-secondary)",
              fontSize: fs(18, 1.4, 28),
            }}
          >
            Ma'lumotlar topilmadi
          </div>
        )}
      </div>
    </div>
  );
};
