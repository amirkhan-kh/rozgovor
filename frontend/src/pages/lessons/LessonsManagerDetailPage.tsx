// Manager darslik tafsiloti — admin/ROP/boss uchun.
// URL: /admin/lessons/managers/:managerId
// Ko'rsatadi: KPI kartalar + 3 ta diagramma + dars-ma-dars test natijalari jadvali.
import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  GraduationCap,
  CheckCircle2,
  Clock,
  Trophy,
  Target,
  Award,
  Video,
  AlertCircle,
  TrendingUp,
  Lock,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
} from "recharts";
import { lessonsService } from "../../services/lessons.service";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}s ${m}d` : `${m} daq`;
};

const fmtDate = (s: string | null): string => {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return d.toLocaleDateString("uz-UZ", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const KpiCard: React.FC<{
  label: string;
  value: string | number;
  sub?: string;
  color: string;
  icon: React.ElementType;
}> = ({ label, value, sub, color, icon: Icon }) => (
  <div
    className="rounded-2xl p-4 relative overflow-hidden"
    style={{
      backgroundColor: "var(--color-card-bg)",
      border: "1px solid var(--color-border)",
    }}
  >
    <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: color }} />
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
          {label}
        </div>
        <div className="text-2xl leading-none font-bold" style={{ color }}>
          {value}
        </div>
        {sub && (
          <div className="text-[11px] mt-1" style={{ color: "var(--text-secondary)" }}>
            {sub}
          </div>
        )}
      </div>
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${color}1a` }}
      >
        <Icon size={18} style={{ color }} />
      </div>
    </div>
  </div>
);

const LessonsManagerDetailPage: React.FC = () => {
  const { managerId } = useParams<{ managerId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["lessons-manager-detail", managerId],
    queryFn: () => lessonsService.managerStats(managerId!),
    enabled: !!managerId,
  });

  const stats = useMemo(() => {
    if (!data) return null;
    const lessons = data.lessons || [];
    const total = lessons.length;
    const completed = lessons.filter((l) => l.completedAt).length;
    const inProgress = lessons.filter(
      (l) => !l.completedAt && (l.videoCompleted || l.testPassed || l.aiStatus !== "not_started"),
    ).length;
    const notStarted = total - completed - inProgress;
    const videoDone = lessons.filter((l) => l.videoCompleted).length;
    const testDone = lessons.filter((l) => l.testPassed).length;
    const aiDone = lessons.filter((l) => l.aiStatus === "completed").length;

    const finalScores = lessons
      .filter((l) => l.finalScore != null)
      .map((l) => l.finalScore as number);
    const testScores = lessons
      .filter((l) => l.testBestScore != null)
      .map((l) => l.testBestScore as number);
    const aiScores = lessons
      .filter((l) => l.aiScore != null)
      .map((l) => l.aiScore as number);
    const avg = (xs: number[]) =>
      xs.length === 0 ? 0 : Math.round(xs.reduce((s, x) => s + x, 0) / xs.length);

    return {
      total,
      completed,
      inProgress,
      notStarted,
      videoDone,
      testDone,
      aiDone,
      avgFinal: avg(finalScores),
      avgTest: avg(testScores),
      avgAi: avg(aiScores),
    };
  }, [data]);

  if (isLoading) {
    return (
      <div className="py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
        Yuklanmoqda...
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="py-12 text-center">
        <AlertCircle size={36} className="mx-auto mb-2" style={{ color: "#ef4444" }} />
        <p className="text-sm" style={{ color: "#ef4444" }}>
          Xatolik yoki ma'lumot topilmadi
        </p>
      </div>
    );
  }

  const m = data.manager;
  const lessons = data.lessons || [];

  // Charts data
  const statusPieData = stats
    ? [
        { name: "Tugatilgan", value: stats.completed, color: "#10b981" },
        { name: "Jarayonda", value: stats.inProgress, color: "#f59e0b" },
        { name: "Boshlanmagan", value: stats.notStarted, color: "#9ca3af" },
      ].filter((d) => d.value > 0)
    : [];

  const lessonScoreBars = lessons.map((l, idx) => ({
    name: `${idx + 1}`,
    fullName: l.title,
    finalScore: l.finalScore || 0,
    testScore: l.testBestScore || 0,
    aiScore: l.aiScore || 0,
  }));

  const radarData = stats
    ? [
        {
          metric: "Video",
          value: stats.total > 0 ? Math.round((stats.videoDone / stats.total) * 100) : 0,
        },
        { metric: "Test", value: stats.avgTest },
        { metric: "AI", value: stats.avgAi },
        { metric: "Umumiy", value: stats.avgFinal },
        {
          metric: "Tugatish %",
          value: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
        },
      ]
    : [];

  return (
    <div className="max-w-7xl mx-auto pb-8">
      <button
        onClick={() => navigate("/admin/lessons")}
        className="inline-flex items-center gap-2 text-sm mb-4 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Darsliklar
      </button>

      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 mb-5"
        style={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}
      >
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20"
          style={{ backgroundColor: "#fff" }}
        />
        <div className="relative flex flex-col md:flex-row md:items-center gap-4">
          {m.photoUrl ? (
            <img
              src={m.photoUrl}
              alt={m.name}
              className="w-20 h-20 rounded-2xl object-cover flex-shrink-0"
              style={{ border: "3px solid rgba(255,255,255,0.3)" }}
            />
          ) : (
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center font-bold text-3xl flex-shrink-0"
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(8px)",
                color: "#fff",
                border: "3px solid rgba(255,255,255,0.3)",
              }}
            >
              {m.name.slice(0, 1).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div
              className="text-xs font-semibold mb-1 opacity-80 inline-flex items-center gap-1"
              style={{ color: "#fff" }}
            >
              <GraduationCap size={12} />
              MANAGER DARSLIK STATISTIKASI
            </div>
            <h1
              className="text-2xl md:text-3xl font-bold leading-tight"
              style={{ color: "#fff" }}
            >
              {m.name}
            </h1>
            <p className="text-sm mt-1 opacity-90" style={{ color: "#fff" }}>
              {m.role || "—"} ·{" "}
              {stats ? `${stats.completed}/${stats.total} dars tugatilgan` : ""}
            </p>
          </div>
          <button
            onClick={() => navigate(`/managers/${m.id}`)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all hover:scale-105"
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              backdropFilter: "blur(8px)",
              border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff",
            }}
          >
            Manager profili →
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          <KpiCard
            label="Biriktirilgan darslar"
            value={stats.total}
            sub={`${stats.completed} tugatilgan`}
            color="#667eea"
            icon={GraduationCap}
          />
          <KpiCard
            label="Tugatish foizi"
            value={`${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%`}
            sub={`${stats.completed}/${stats.total}`}
            color="#10b981"
            icon={CheckCircle2}
          />
          <KpiCard
            label="O'rtacha umumiy ball"
            value={stats.avgFinal}
            sub={`${stats.avgTest} test · ${stats.avgAi} AI`}
            color="#f59e0b"
            icon={Trophy}
          />
          <KpiCard
            label="Video tomosha"
            value={stats.videoDone}
            sub={`${stats.testDone} test · ${stats.aiDone} AI suhbat`}
            color="#3b82f6"
            icon={Video}
          />
        </div>
      )}

      {/* Charts row — 3 ta alohida diagramma */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-5">
        {/* 1. Status pie */}
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#10b98115" }}
            >
              <CheckCircle2 size={14} style={{ color: "#10b981" }} />
            </div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Darslar holati
            </h3>
          </div>
          {statusPieData.length === 0 ? (
            <div className="py-12 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
              Ma'lumot yo'q
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={statusPieData}
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  stroke="none"
                >
                  {statusPieData.map((d, idx) => (
                    <Cell key={idx} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 11 }}
                  formatter={(value) => (
                    <span style={{ color: "var(--text-secondary)" }}>{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 2. Performance radar */}
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#8b5cf615" }}
            >
              <TrendingUp size={14} style={{ color: "#8b5cf6" }} />
            </div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Samaradorlik
            </h3>
          </div>
          {radarData.length === 0 ? (
            <div className="py-12 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
              Ma'lumot yo'q
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData} outerRadius={70}>
                <PolarGrid stroke="var(--color-border)" />
                <PolarAngleAxis
                  dataKey="metric"
                  tick={{ fill: "var(--text-secondary)", fontSize: 11 }}
                />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} stroke="var(--color-border)" />
                <Radar
                  name="Ball"
                  dataKey="value"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.4}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 3. Per-lesson final score bar */}
        <div
          className="rounded-2xl p-4"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#f59e0b15" }}
            >
              <Trophy size={14} style={{ color: "#f59e0b" }} />
            </div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Dars-ma-dars ball
            </h3>
          </div>
          {lessonScoreBars.length === 0 ? (
            <div className="py-12 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
              Ma'lumot yo'q
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={lessonScoreBars} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="var(--color-border)" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--color-border)" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-card-bg)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0]?.payload;
                    return item?.fullName || `Dars ${label}`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="testScore" fill="#3b82f6" name="Test" radius={[4, 4, 0, 0]} />
                <Bar dataKey="aiScore" fill="#8b5cf6" name="AI" radius={[4, 4, 0, 0]} />
                <Bar dataKey="finalScore" fill="#f59e0b" name="Umumiy" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Test natijalari jadvali — alohida bo'lim */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div
          className="px-4 py-3 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: "#3b82f615" }}
            >
              <Target size={14} style={{ color: "#3b82f6" }} />
            </div>
            <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
              Dars-ma-dars natijalar
            </h3>
          </div>
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {lessons.length} ta dars
          </div>
        </div>

        {lessons.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
            Bu manager'ga hali dars biriktirilmagan
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-left text-xs"
                  style={{
                    backgroundColor: "var(--ds-bg-overlay)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <th className="px-3 py-2 font-medium whitespace-nowrap">#</th>
                  <th className="px-3 py-2 font-medium">Dars</th>
                  <th className="px-3 py-2 font-medium text-center whitespace-nowrap">
                    <Video size={11} className="inline mr-1" />
                    Video
                  </th>
                  <th className="px-3 py-2 font-medium text-center whitespace-nowrap">
                    <Target size={11} className="inline mr-1" />
                    Test
                  </th>
                  <th className="px-3 py-2 font-medium text-center whitespace-nowrap">
                    <Award size={11} className="inline mr-1" />
                    AI
                  </th>
                  <th className="px-3 py-2 font-medium text-center whitespace-nowrap">
                    <Trophy size={11} className="inline mr-1" />
                    Umumiy
                  </th>
                  <th className="px-3 py-2 font-medium text-center whitespace-nowrap">
                    <Clock size={11} className="inline mr-1" />
                    Davomiyligi
                  </th>
                  <th className="px-3 py-2 font-medium text-center whitespace-nowrap">
                    <CalendarIcon size={11} className="inline mr-1" />
                    Tugatildi
                  </th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((l, idx) => {
                  const finalColor =
                    (l.finalScore || 0) >= 80
                      ? "#10b981"
                      : (l.finalScore || 0) >= 50
                        ? "#f59e0b"
                        : (l.finalScore || 0) > 0
                          ? "#ef4444"
                          : "#9ca3af";
                  const isLocked = l.status !== "ready";
                  return (
                    <tr
                      key={l.lessonId}
                      className="cursor-pointer transition-colors hover:bg-white/[0.02]"
                      style={{ borderTop: "1px solid var(--color-border)" }}
                      onClick={() => navigate(`/admin/lessons/${l.lessonId}`)}
                    >
                      <td
                        className="px-3 py-2.5 text-xs tabular-nums"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <div
                          className="text-sm font-semibold truncate max-w-md"
                          style={{ color: "var(--text-primary)" }}
                          title={l.title}
                        >
                          {l.title}
                        </div>
                        {isLocked && (
                          <div
                            className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[10px]"
                            style={{ backgroundColor: "#9ca3af15", color: "#9ca3af" }}
                          >
                            <Lock size={9} />
                            {l.status}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {l.videoCompleted ? (
                          <CheckCircle2
                            size={16}
                            className="inline"
                            style={{ color: "#10b981" }}
                          />
                        ) : (
                          <span style={{ color: "var(--text-secondary)", opacity: 0.4 }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {l.testBestScore != null ? (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold"
                            style={{
                              backgroundColor: l.testPassed ? "#10b98115" : "#ef444415",
                              color: l.testPassed ? "#10b981" : "#ef4444",
                            }}
                          >
                            {l.testBestScore}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)", opacity: 0.4 }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {l.aiScore != null ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-bold"
                            style={{ backgroundColor: "#8b5cf615", color: "#8b5cf6" }}
                          >
                            {l.aiScore}
                          </span>
                        ) : l.aiStatus === "in_progress" ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold"
                            style={{ backgroundColor: "#f59e0b15", color: "#f59e0b" }}
                          >
                            jarayonda
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)", opacity: 0.4 }}>—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {l.finalScore != null ? (
                          <span
                            className="inline-flex items-center justify-center w-12 h-7 rounded-lg text-xs font-bold"
                            style={{
                              backgroundColor: `${finalColor}15`,
                              color: finalColor,
                              border: `1px solid ${finalColor}33`,
                            }}
                          >
                            {l.finalScore}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)", opacity: 0.4 }}>—</span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2.5 text-center text-xs font-mono"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {fmtDuration(l.videoDurationSec)}
                      </td>
                      <td
                        className="px-3 py-2.5 text-center text-xs"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {fmtDate(l.completedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default LessonsManagerDetailPage;
