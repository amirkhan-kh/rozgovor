import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Tv, X, Calendar as CalendarIcon, Search } from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Skeleton from "../../components/ui/Skeleton";
import { ratingService } from "../../services/rating.service";
import { TvSalesLeaderboard, TvAuditLeaderboard } from "./TvRatingView";
import { useLeaderboardWS } from "../../hooks/useLeaderboardWS";
import { CelebrationOverlay } from "../../components/CelebrationOverlay";
import { useAuth } from "../../store/authStore";
import { managerVideosService } from "../../services/manager-videos.service";

const scoreVariant = (score: number): "success" | "warning" | "danger" => {
  if (score >= 80) return "success";
  if (score >= 60) return "warning";
  return "danger";
};


const formatMoney = (n: number): string => {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} mlrd`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} mln`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)} ming`;
  return String(Math.round(n));
};

// ─── Sotuv tab komponenti ───────────────────────────────────────────
interface InlinePlanProps {
  managerId: string;
  value: number;
  type: "daily" | "weekly" | "monthly";
  mode: "count" | "amount";
}

const InlinePlan: React.FC<InlinePlanProps> = ({ managerId, value, type, mode }) => {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value));
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (target: number) =>
      ratingService.setManagerSalesPlan(managerId, type, target),
    onSuccess: () => {
      toast.success("Plan saqlandi");
      qc.invalidateQueries({ queryKey: ["sales-leaderboard"] });
      setEditing(false);
    },
    onError: () => toast.error("Saqlashda xatolik"),
  });

  React.useEffect(() => {
    setInput(String(value));
  }, [value]);

  const save = () => {
    const n = Number(input);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Noto'g'ri qiymat");
      return;
    }
    mutation.mutate(n);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-center">
        <input
          type="number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setInput(String(value));
              setEditing(false);
            }
          }}
          autoFocus
          className="w-24 px-2 py-1 border rounded text-sm text-center"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
            color: "var(--text-primary)",
          }}
        />
        <button
          onClick={save}
          disabled={mutation.isPending}
          className="text-green-500 text-sm font-bold px-1"
        >
          ✓
        </button>
        <button
          onClick={() => {
            setInput(String(value));
            setEditing(false);
          }}
          className="text-red-500 text-sm font-bold px-1"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="px-2 py-1 rounded hover:bg-primary/50 transition-colors text-sm font-medium"
      style={{ color: "var(--text-primary)" }}
      title="Bosib o'zgartiring"
    >
      {value > 0
        ? mode === "amount"
          ? formatMoney(value)
          : value.toLocaleString("ru-RU")
        : "—"}
    </button>
  );
};

// KPI foizini inline tahrirlash (admin sotuvchining KPI ulushini kiritadi)
const InlineKpi: React.FC<{ managerId: string; value: number }> = ({ managerId, value }) => {
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(String(value || 0));
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: (kpiPercent: number) =>
      ratingService.setManagerKpi(managerId, kpiPercent),
    onSuccess: () => {
      toast.success("KPI saqlandi");
      qc.invalidateQueries({ queryKey: ["sales-leaderboard"] });
      setEditing(false);
    },
    onError: () => toast.error("Saqlashda xatolik"),
  });

  React.useEffect(() => {
    setInput(String(value || 0));
  }, [value]);

  const save = () => {
    const n = Number(input);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      toast.error("0..100 oralig'ida foiz kiriting");
      return;
    }
    mutation.mutate(n);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-center">
        <input
          type="number"
          step="0.1"
          min="0"
          max="100"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setInput(String(value || 0));
              setEditing(false);
            }
          }}
          autoFocus
          className="w-16 px-2 py-1 border rounded text-sm text-center"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
            color: "var(--text-primary)",
          }}
        />
        <span className="text-xs text-secondary">%</span>
        <button
          onClick={save}
          disabled={mutation.isPending}
          className="text-green-500 text-sm font-bold px-1"
        >
          ✓
        </button>
        <button
          onClick={() => {
            setInput(String(value || 0));
            setEditing(false);
          }}
          className="text-red-500 text-sm font-bold px-1"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="px-2 py-1 rounded hover:bg-primary/50 transition-colors text-sm font-medium"
      style={{ color: "var(--text-primary)" }}
      title="Bosib o'zgartiring (0..100 %)"
    >
      {value > 0 ? `${value}%` : "—"}
    </button>
  );
};

type SalesFilter = "today" | "week" | "month" | "custom";

interface LeaderboardTabProps {
  search: string;
  setSearch: (v: string) => void;
}

const SalesLeaderboardTable: React.FC<LeaderboardTabProps> = ({ search, setSearch }) => {
  const [period, setPeriod] = useState<SalesFilter>("month");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [tvMode, setTvMode] = useState(false);
  const [celebration, setCelebration] = useState<{ videoPath: string } | null>(null);
  const qc = useQueryClient();
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  const { user, managerUser } = useAuth();
  const companyId = user?.id ?? (managerUser as any)?.companyId;

  const handleSale = useCallback((e: { videoUrl: string }) => {
    setCelebration({ videoPath: e.videoUrl });
  }, []);

  // Celebration endi global (MainLayout → CelebrationProvider). Bu yerda
  // o'chirilgan — aks holda TV rejimda video ikki marta chiqadi.
  useLeaderboardWS(companyId, handleSale, false);

  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen]);

  const dateFrom =
    period === "custom" && range?.from ? toLocalDateStr(range.from) : "";
  const dateTo =
    period === "custom" && range?.to ? toLocalDateStr(range.to) : "";

  const formatRangeLabel = (): string => {
    if (!range?.from) return "Sana tanlang";
    if (!range.to) return formatUzDate(range.from);
    return `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;
  };

  const { data, isLoading } = useQuery({
    queryKey: ["sales-leaderboard", period, dateFrom, dateTo],
    queryFn: () => ratingService.getSalesLeaderboard(period, dateFrom, dateTo),
    refetchInterval: false, // WS orqali real-time yangilanadi
    enabled: period !== "custom" || !!(range?.from),
  });

  // TV rejimida ishlatish uchun menejerlar shaxsiy videolari pool'i.
  // T tugmasi bossa shu pool'dan random tanlanadi (bo'sh bo'lsa fallback generic).
  const managerVideoPoolRef = useRef<string[]>([]);

  // ESC bilan TV mode'dan chiqish + browser fullscreen toggle
  useEffect(() => {
    if (!tvMode) return;
    const FALLBACK_VIDEOS = [
      "/videos/v1-arms-crossing-in-final.mp4",
      "/videos/v2-walk-in-confetti-final.mp4",
      "/videos/v3-open-arms-wide-final.mp4",
      "/videos/v4-cyan-thumbs-up-final.mp4",
      "/videos/v5-side-entry-golden-final.mp4",
    ];

    // Leaderboard'dagi menejerlar bo'yicha shaxsiy videolarni yig'amiz.
    // Har menejer uchun finalVideoUrl||videoUrl status=ready bo'lganlarini olamiz.
    let cancelled = false;
    const rows = data?.rows ?? [];
    if (rows.length > 0) {
      (async () => {
        const pool: string[] = [];
        await Promise.all(
          rows.map(async (r) => {
            try {
              const videos = await managerVideosService.listVideos(r.managerId);
              for (const v of videos) {
                if (v.status !== "ready") continue;
                const url = v.finalVideoUrl || v.videoUrl;
                if (url) pool.push(url);
              }
            } catch {
              /* manager videosi yo'q yoki access yo'q — o'tib ketamiz */
            }
          })
        );
        if (!cancelled) managerVideoPoolRef.current = pool;
      })();
    }

    const pickRandomVideo = (): string => {
      const pool = managerVideoPoolRef.current;
      if (pool.length > 0) {
        return pool[Math.floor(Math.random() * pool.length)];
      }
      return FALLBACK_VIDEOS[Math.floor(Math.random() * FALLBACK_VIDEOS.length)];
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTvMode(false);
      if (e.key === "t" || e.key === "T") {
        setCelebration({ videoPath: pickRandomVideo() });
      }
    };
    document.addEventListener("keydown", onKey);
    // Tanani scroll qila olmasin
    document.body.style.overflow = "hidden";
    // Browser fullscreen (ixtiyoriy — balki ruxsat bermaydi)
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      cancelled = true;
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [tvMode, data]);

  const modeMutation = useMutation({
    mutationFn: (mode: "count" | "amount") => ratingService.setSalesPlanMode(mode),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sales-leaderboard"] });
      toast.success("Rejim o'zgartirildi");
    },
  });

  const mode = data?.mode || "count";
  const planType = data?.planType || "monthly";

  // Real rank (to'liq ro'yxatda) — qidiruv filter'idan oldin bir marta saqlaymiz,
  // qidiruv paytida natija 1-pozitsiyada ko'rinmasin (D4 bug).
  const rankedRows = (data?.rows || []).map((r, i) => ({ ...r, rank: i + 1 }));
  const filteredRows = rankedRows.filter((r) =>
    search.trim() === "" ? true : r.managerName.toLowerCase().includes(search.trim().toLowerCase())
  );

  // Prognoz: joriy temp (fakt/kunlar) × davrdagi jami kunlar
  const DAY_MS = 1000 * 60 * 60 * 24;
  const computeForecast = (plan: number, fakt: number) => {
    if (!data?.period?.from) return null;
    const start = new Date(data.period.from).getTime();
    const now = Date.now();
    const daysElapsed = Math.max(1, Math.ceil((now - start) / DAY_MS));
    // Davr to'liq uzunligi
    let totalDays = daysElapsed;
    if (period === "month") {
      const d = new Date(data.period.from);
      totalDays = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    } else if (period === "week") {
      totalDays = 7;
    } else if (period === "today") {
      totalDays = 1;
    } else if (data?.period?.to) {
      totalDays = Math.max(
        daysElapsed,
        Math.ceil((new Date(data.period.to).getTime() - start) / DAY_MS)
      );
    }
    const projected = Math.round((fakt / daysElapsed) * totalDays);
    const pct = plan > 0 ? Math.round((projected / plan) * 100) : null;
    return { projected, pct, daysElapsed, totalDays };
  };

  return (
    <Card className="overflow-hidden w-full md:max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold">Sotuv reytingi</h2>
          <p className="text-sm text-secondary">
            Menejerlar bo'yicha plan vs fakt. Planni jadvalda bosib tahrirlang.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: "var(--text-secondary)" }}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Menejer..."
              className="h-10 pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-accent"
              style={{
                backgroundColor: "var(--color-card-bg)",
                borderColor: "var(--color-border)",
                color: "var(--text-primary)",
                width: 160,
              }}
            />
          </div>
          {/* Plan rejimi toggle — select bilan bir xil balandlik (h-10) */}
          <div
            className="inline-flex items-center h-10 p-1 rounded-lg border text-sm"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-card-bg)",
            }}
          >
            {(["count", "amount"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => !active && modeMutation.mutate(m)}
                  disabled={modeMutation.isPending}
                  className="h-full px-3 rounded-md font-medium transition-colors disabled:opacity-100"
                  style={{
                    backgroundColor: active ? "#22c55e" : "transparent",
                    color: active ? "#ffffff" : "var(--text-secondary)",
                  }}
                >
                  {m === "count" ? "Soni" : "Summa"}
                </button>
              );
            })}
          </div>

          {/* Davr filter — pills + calendar (sales style) */}
          <div
            className="inline-flex items-center h-10 gap-1 p-1 rounded-xl border"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-card-bg)",
            }}
          >
            {([
              { key: "month" as SalesFilter, label: "Bu oy" },
              { key: "week" as SalesFilter, label: "Bu hafta" },
              { key: "today" as SalesFilter, label: "Bugun" },
            ]).map((btn) => {
              const active = period === btn.key;
              return (
                <button
                  key={btn.key}
                  onClick={() => {
                    setPeriod(btn.key);
                    setRange(undefined);
                  }}
                  className="h-full px-3 rounded-lg text-sm font-medium transition-all"
                  style={{
                    backgroundColor: active ? "#22c55e" : "transparent",
                    color: active ? "#ffffff" : "var(--text-secondary)",
                  }}
                >
                  {btn.label}
                </button>
              );
            })}
            <div
              className="w-px self-stretch mx-1"
              style={{ backgroundColor: "var(--color-border)" }}
            />
            <div className="relative" ref={popoverRef}>
              <button
                onClick={() => setCalendarOpen((v) => !v)}
                className="h-full flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: period === "custom" ? "#22c55e" : "transparent",
                  color: period === "custom" ? "#ffffff" : "var(--text-secondary)",
                }}
                title="Sana oraliq tanlash"
              >
                <CalendarIcon size={15} />
                {period === "custom" && range?.from && (
                  <span className="hidden sm:inline">{formatRangeLabel()}</span>
                )}
              </button>
              {calendarOpen && (
                <div
                  className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden"
                  style={{
                    backgroundColor: "var(--color-card-bg)",
                    borderColor: "var(--color-border)",
                    minWidth: 320,
                  }}
                >
                  <div
                    className="flex items-center justify-between px-4 py-3 border-b"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <span
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Sana oralig'i
                    </span>
                    <button
                      onClick={() => setCalendarOpen(false)}
                      className="p-1 rounded hover:opacity-70"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <div className="p-3">
                    <DayPicker
                      mode="range"
                      selected={range}
                      onSelect={setRange}
                      locale={uz}
                      weekStartsOn={1}
                      numberOfMonths={1}
                      className="sales-daypicker"
                    />
                  </div>
                  <div
                    className="flex items-center justify-between gap-2 px-4 py-3 border-t"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    <button
                      onClick={() => {
                        setRange(undefined);
                        setPeriod("month");
                        setCalendarOpen(false);
                      }}
                      className="text-xs font-medium"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Tozalash
                    </button>
                    <button
                      onClick={() => {
                        if (range?.from) {
                          if (!range.to) setRange({ from: range.from, to: range.from });
                          setPeriod("custom");
                          setCalendarOpen(false);
                        }
                      }}
                      disabled={!range?.from}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                      style={{ backgroundColor: "#22c55e", color: "#ffffff" }}
                    >
                      Qo'llash
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* TV mode tugmasi */}
          <button
            onClick={() => setTvMode(true)}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border text-sm font-medium transition-colors hover:bg-accent/5"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-card-bg)",
              color: "var(--text-primary)",
            }}
            title="TV rejim — to'liq ekran"
          >
            <Tv size={16} />
            TV rejim
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 px-4 py-3 border-b"
              style={{ borderColor: "var(--color-border)", opacity: 1 - i * 0.1 }}
            >
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-6 w-16" rounded="full" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 text-sm text-secondary font-medium w-12">#</th>
                <th className="text-left py-3 px-4 text-sm text-secondary font-medium">
                  Menejer
                </th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                  Plan
                </th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                  Fakt
                </th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                  {mode === "count" ? "Summa" : "Sotuv soni"}
                </th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                  Konversiya
                </th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                  KPI %
                </th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                  KPI summa
                </th>
                <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                  Prognoz
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.managerId}
                  className="border-b border-border/50 hover:bg-primary/50"
                >
                  <td className="py-3 px-4">
                    <span className="text-lg">
                      {r.rank === 1 && "🥇"}
                      {r.rank === 2 && "🥈"}
                      {r.rank === 3 && "🥉"}
                      {r.rank > 3 && (
                        <span className="text-secondary text-sm">{r.rank}</span>
                      )}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      {r.photoUrl ? (
                        <img
                          src={r.photoUrl}
                          alt={r.managerName}
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{
                            backgroundColor: "#3b5ef522",
                            color: "#3b5ef5",
                          }}
                        >
                          {r.managerName.charAt(0)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium">{r.managerName}</div>
                        {r.role && (
                          <div className="text-[11px] text-secondary">{r.role}</div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Plan — inline edit */}
                  <td className="py-3 px-4 text-center">
                    <InlinePlan
                      managerId={r.managerId}
                      value={r.plan}
                      type={planType}
                      mode={mode}
                    />
                  </td>

                  {/* Fakt */}
                  <td className="py-3 px-4 text-center">
                    <div className="flex flex-col items-center">
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                        {mode === "amount"
                          ? formatMoney(r.fakt)
                          : r.fakt.toLocaleString("ru-RU")}
                      </span>
                      {r.plan > 0 && (
                        <Badge variant={scoreVariant(r.percent)} size="sm">
                          {r.percent}%
                        </Badge>
                      )}
                    </div>
                  </td>

                  {/* Count rejimda: Summa; Amount rejimda: Sotuv soni */}
                  {mode === "count" ? (
                    <td
                      className="py-3 px-4 text-center font-medium"
                      style={{ color: "#22c55e" }}
                    >
                      {r.revenue > 0 ? formatMoney(r.revenue) : "—"}
                    </td>
                  ) : (
                    <td
                      className="py-3 px-4 text-center font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {r.salesCount > 0
                        ? r.salesCount.toLocaleString("ru-RU")
                        : "—"}
                    </td>
                  )}

                  <td className="py-3 px-4 text-center">
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.conversion}%
                    </span>
                  </td>

                  {/* KPI % — admin tahrirlaydi */}
                  <td className="py-3 px-4 text-center">
                    <InlineKpi managerId={r.managerId} value={r.kpiPercent} />
                  </td>

                  {/* KPI summa = revenue × kpiPercent / 100 (backendda hisoblangan) */}
                  <td
                    className="py-3 px-4 text-center font-medium"
                    style={{ color: "#a855f7" }}
                  >
                    {r.kpiAmount > 0 ? formatMoney(r.kpiAmount) : "—"}
                  </td>

                  {/* Prognoz — joriy temp asosida davr oxirigacha */}
                  <td className="py-3 px-4 text-center">
                    {(() => {
                      const f = computeForecast(r.plan, r.fakt);
                      if (!f) return <span className="text-secondary text-sm">—</span>;
                      const hasPlan = f.pct !== null;
                      const color = hasPlan
                        ? f.pct! >= 100 ? "#22c55e" : f.pct! >= 80 ? "#f59e0b" : "#ef4444"
                        : "#0ea5e9";
                      const label = hasPlan
                        ? `${f.pct}%`
                        : mode === "amount"
                        ? formatMoney(f.projected)
                        : f.projected.toLocaleString("ru-RU");
                      const hint = `${mode === "amount" ? formatMoney(f.projected) : f.projected} prognoz`;
                      return (
                        <div className="flex flex-col items-center" title={hint}>
                          <span className="text-sm font-bold" style={{ color }}>
                            {label}
                          </span>
                          <span className="text-[10px] text-secondary">
                            {f.daysElapsed}/{f.totalDays} kun
                          </span>
                        </div>
                      );
                    })()}
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="py-12 text-center text-secondary"
                  >
                    Menejerlar topilmadi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tvMode && data && (
        <TvSalesLeaderboard
          rows={filteredRows}
          mode={mode}
          period={period}
          onPeriodChange={(p) => {
            setPeriod(p);
            setRange(undefined);
          }}
          onModeChange={(m) => modeMutation.mutate(m)}
          onExit={() => setTvMode(false)}
        />
      )}

      {tvMode && celebration && (
        <CelebrationOverlay
          videoPath={celebration.videoPath}
          onEnd={() => setCelebration(null)}
        />
      )}
    </Card>
  );
};

// ─── Audit tab (eski jadval) ───────────────────────────────────────
type AuditFilter = "today" | "week" | "month" | "custom";

const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const UZ_MONTHS_SHORT = [
  "yan", "fev", "mar", "apr", "may", "iyn",
  "iyl", "avg", "sen", "okt", "noy", "dek",
];
const formatUzDate = (d: Date): string =>
  `${d.getDate()} ${UZ_MONTHS_SHORT[d.getMonth()]}`;

const AuditLeaderboardTable: React.FC<LeaderboardTabProps> = ({ search, setSearch }) => {
  const [period, setPeriod] = useState<AuditFilter>("week");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [tvMode, setTvMode] = useState(false);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!calendarOpen) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setCalendarOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [calendarOpen]);

  const dateFrom =
    period === "custom" && range?.from ? toLocalDateStr(range.from) : "";
  const dateTo =
    period === "custom" && range?.to ? toLocalDateStr(range.to) : "";

  const { data: ratings, isLoading } = useQuery({
    queryKey: ["rating", period, dateFrom, dateTo],
    queryFn: () => ratingService.getRating(period, dateFrom, dateTo),
    refetchInterval: tvMode ? 30000 : false,
    enabled: period !== "custom" || !!(range?.from && range?.to),
  });

  useEffect(() => {
    if (!tvMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTvMode(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, [tvMode]);

  // Real rank (to'liq ro'yxatda overallScore bo'yicha) — filter/page'dan oldin saqlaymiz.
  // Qidiruv paytida natija 1-rank'da ko'rinmasin.
  const rankedRatings = (ratings || []).map((r, i) => ({ ...r, rank: i + 1 }));
  const filteredRatings = rankedRatings.filter((r) =>
    search.trim() === "" ? true : r.manager.name.toLowerCase().includes(search.trim().toLowerCase())
  );
  const totalItems = filteredRatings.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
  const currentPage = Math.min(page, totalPages);
  const paginatedRatings = filteredRatings.slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );
  const fromItem = totalItems === 0 ? 0 : (currentPage - 1) * perPage + 1;
  const toItem = Math.min(currentPage * perPage, totalItems);

  const formatRangeLabel = (): string => {
    if (!range?.from) return "Sana tanlang";
    if (!range.to) return formatUzDate(range.from);
    return `${formatUzDate(range.from)} — ${formatUzDate(range.to)}`;
  };

  return (
    <Card className="overflow-hidden w-full md:max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold">Menejerlar reytingi</h2>
          <p className="text-sm text-secondary">
            Gaplashish mezonlari bo'yicha tartiblangan.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-secondary)" }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Menejer..."
            className="h-10 pl-9 pr-3 rounded-lg border text-sm focus:outline-none focus:ring-1 focus:ring-accent"
            style={{
              backgroundColor: "var(--color-card-bg)",
              borderColor: "var(--color-border)",
              color: "var(--text-primary)",
              width: 160,
            }}
          />
        </div>
        {/* Filter pills: Bu oy / Bu hafta / Bugun + Calendar */}
        <div
          className="inline-flex items-center h-10 gap-1 p-1 rounded-xl border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-card-bg)",
          }}
        >
          {([
            { key: "month" as AuditFilter, label: "Bu oy" },
            { key: "week" as AuditFilter, label: "Bu hafta" },
            { key: "today" as AuditFilter, label: "Bugun" },
          ]).map((btn) => {
            const active = period === btn.key;
            return (
              <button
                key={btn.key}
                onClick={() => {
                  setPeriod(btn.key);
                  setRange(undefined);
                  setPage(1);
                }}
                className="h-full px-3 rounded-lg text-sm font-medium transition-all"
                style={{
                  backgroundColor: active ? "#22c55e" : "transparent",
                  color: active ? "#ffffff" : "var(--text-secondary)",
                }}
              >
                {btn.label}
              </button>
            );
          })}

          <div
            className="w-px self-stretch mx-1"
            style={{ backgroundColor: "var(--color-border)" }}
          />

          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setCalendarOpen((v) => !v)}
              className="h-full flex items-center gap-1.5 px-3 rounded-lg text-sm font-medium transition-all"
              style={{
                backgroundColor: period === "custom" ? "#22c55e" : "transparent",
                color: period === "custom" ? "#ffffff" : "var(--text-secondary)",
              }}
              title="Sana oraliq tanlash"
            >
              <CalendarIcon size={15} />
              {period === "custom" && range?.from && (
                <span className="hidden sm:inline">{formatRangeLabel()}</span>
              )}
            </button>

            {calendarOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  borderColor: "var(--color-border)",
                  minWidth: 320,
                }}
              >
                <div
                  className="flex items-center justify-between px-4 py-3 border-b"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <span
                    className="text-sm font-semibold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Sana oralig'i
                  </span>
                  <button
                    onClick={() => setCalendarOpen(false)}
                    className="p-1 rounded hover:opacity-70"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="p-3">
                  <DayPicker
                    mode="range"
                    selected={range}
                    onSelect={setRange}
                    locale={uz}
                    weekStartsOn={1}
                    numberOfMonths={1}
                    className="sales-daypicker"
                  />
                </div>
                <div
                  className="flex items-center justify-between gap-2 px-4 py-3 border-t"
                  style={{ borderColor: "var(--color-border)" }}
                >
                  <button
                    onClick={() => {
                      setRange(undefined);
                      setPeriod("week");
                      setCalendarOpen(false);
                    }}
                    className="text-xs font-medium"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Tozalash
                  </button>
                  <button
                    onClick={() => {
                      if (range?.from) {
                        // Agar faqat "from" tanlangan bo'lsa, to = from (bir kun)
                        if (!range.to) setRange({ from: range.from, to: range.from });
                        setPeriod("custom");
                        setPage(1);
                        setCalendarOpen(false);
                      }
                    }}
                    disabled={!range?.from}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
                    style={{ backgroundColor: "#22c55e", color: "#ffffff" }}
                  >
                    Qo'llash
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* TV mode tugmasi */}
        <button
          onClick={() => setTvMode(true)}
          className="inline-flex items-center gap-1.5 h-10 px-3 rounded-lg border text-sm font-medium transition-colors hover:bg-accent/5"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-card-bg)",
            color: "var(--text-primary)",
          }}
          title="TV rejim — to'liq ekran"
        >
          <Tv size={16} />
          TV rejim
        </button>
        </div>
      </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 8 }).map((_, r) => (
              <div
                key={r}
                className="flex items-center gap-4 px-4 py-3 border-b"
                style={{ borderColor: "var(--color-border)", opacity: 1 - r * 0.08 }}
              >
                <Skeleton className="h-4 w-8" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-16" rounded="full" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-6 w-16" rounded="full" />
                <Skeleton className="h-4 w-12" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm text-secondary font-medium w-12">
                      #
                    </th>
                    <th className="text-left py-3 px-4 text-sm text-secondary font-medium">
                      Menejer
                    </th>
                    <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                      Me'zonlar bo'yicha ball
                    </th>
                    <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                      Sotuvlar
                    </th>
                    <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                      Umumiy ball
                    </th>
                    <th className="text-center py-3 px-4 text-sm text-secondary font-medium">
                      Qo'ng'iroqlar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRatings?.map((r) => {
                    // Real rank — to'liq ro'yxatdagi pozitsiya (qidiruv/page filter'dan oldin).
                    return (
                      <tr
                        key={r.manager.id}
                        className="border-b border-border/50 hover:bg-primary/50"
                      >
                        <td className="py-3 px-4">
                          <span className="text-lg">
                            {r.rank === 1 && "🥇"}
                            {r.rank === 2 && "🥈"}
                            {r.rank === 3 && "🥉"}
                            {r.rank > 3 && (
                              <span className="text-secondary text-sm">
                                {r.rank}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium">{r.manager.name}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={scoreVariant(r.criteriaScore)} size="md">
                            {r.criteriaScore}%
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center text-secondary">
                          {r.sales}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Badge variant={scoreVariant(r.overallScore)} size="md">
                            {r.overallScore}%
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center text-secondary">
                          {r.callsCount}
                        </td>
                      </tr>
                    );
                  })}
                  {(!ratings || ratings.length === 0) && (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-secondary">
                        Ma'lumotlar topilmadi
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>


            {totalItems > 0 && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-4 border-t border-border/50 mt-2">
                <span className="text-sm text-secondary">
                  {fromItem}dan {toItem}gacha jami natijalar {totalItems}ta
                </span>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-secondary">Har bir sahifaga</span>
                    <select
                      value={perPage}
                      onChange={(e) => {
                        setPerPage(Number(e.target.value));
                        setPage(1);
                      }}
                      className="px-2 py-1 bg-card border border-border rounded-lg text-sm cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value={10}>10</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                    </select>
                  </div>

                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-2 py-1 text-sm text-secondary hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        ←
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => (
                        <button
                          key={i + 1}
                          onClick={() => setPage(i + 1)}
                          className={`px-2.5 py-1 text-sm rounded-lg ${
                            currentPage === i + 1
                              ? "bg-accent text-white"
                              : "text-secondary hover:opacity-70"
                          }`}
                        >
                          {i + 1}
                        </button>
                      ))}
                      <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-2 py-1 text-sm text-secondary hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {tvMode && ratings && (
          <TvAuditLeaderboard
            rows={filteredRatings}
            period={period}
            onPeriodChange={(p) => {
              setPeriod(p);
              setRange(undefined);
              setPage(1);
            }}
            onExit={() => setTvMode(false)}
          />
        )}
      </Card>
  );
};

// ─── Asosiy sahifa: 2 tab (Audit | Sotuv) ──────────────────────────
// Search + activeTab URL query'da saqlanadi — tab almashtirilganda ham yo'qolmaydi
const RatingPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") === "sales" ? "sales" : "audit") as
    | "audit"
    | "sales";
  const search = searchParams.get("q") || "";

  const setActiveTab = (tab: "audit" | "sales") => {
    const next = new URLSearchParams(searchParams);
    if (tab === "audit") next.delete("tab");
    else next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };

  const setSearch = (v: string) => {
    const next = new URLSearchParams(searchParams);
    if (v) next.set("q", v);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="space-y-6 overflow-hidden pb-8">
      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div
          className="flex gap-1 p-1 rounded-xl border border-border"
          style={{ backgroundColor: "var(--color-primary)" }}
        >
          <button
            onClick={() => setActiveTab("audit")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "audit" ? "bg-accent" : "hover:opacity-80"
            }`}
            style={{
              color: activeTab === "audit" ? "#ffffff" : "var(--color-secondary)",
            }}
          >
            Audit
          </button>
          <button
            onClick={() => setActiveTab("sales")}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === "sales" ? "bg-accent" : "hover:opacity-80"
            }`}
            style={{
              color: activeTab === "sales" ? "#ffffff" : "var(--color-secondary)",
            }}
          >
            Sotuv
          </button>
        </div>
      </div>

      {activeTab === "audit" && (
        <AuditLeaderboardTable search={search} setSearch={setSearch} />
      )}
      {activeTab === "sales" && (
        <SalesLeaderboardTable search={search} setSearch={setSearch} />
      )}
    </div>
  );
};

export default RatingPage;
