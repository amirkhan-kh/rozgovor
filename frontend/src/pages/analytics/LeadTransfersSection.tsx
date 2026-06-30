import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import {
  ArrowLeftRight,
  ArrowRight,
  Users,
  Calendar as CalendarIcon,
  Filter as FilterIcon,
  X,
} from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import { analyticsService, LeadTransferReport, TransferRecent } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import Avatar from "../../components/ui/Avatar";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ManagerDeptFilter from "../../components/filters/ManagerDeptFilter";

// Semantik ranglar
const RECEIVED = "#10b981"; // qabul qilingan — kelgan
const GIVEN = "#f59e0b"; // berilgan — chiqib ketgan
const ACCENT = "#22c55e"; // period pill active (Sotuv bilan bir xil)

// Avatar palitrasi — layout ds-token ranglaridan (rasmsiz menejerlar uchun, deterministik)
const AV_PALETTE = [
  "#4f46e5", "#10b981", "#f59e0b", "#f43f5e", "#0ea5e9", "#8b5cf6",
  "#14b8a6", "#ec4899", "#22c55e", "#f97316", "#3b82f6", "#eab308",
];
const managerColor = (name: string): string => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AV_PALETTE[h % AV_PALETTE.length];
};

const ROW_H = 46;
const VISIBLE_ROWS = 10;

type FilterKey = "today" | "week" | "month" | "custom";

// ── Sana helperlari ───────────────────────────────────────────────────
const toLocalDateStr = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const startOfToday = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const startOfWeek = (d: Date) => {
  const x = startOfToday(d);
  const day = (x.getDay() + 6) % 7; // dushanba = 0
  x.setDate(x.getDate() - day);
  return x;
};
const startOfMonth = (d: Date) => {
  const x = startOfToday(d);
  x.setDate(1);
  return x;
};
const UZ_MONTHS_SHORT = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const fmtUz = (d: Date) => `${d.getDate()} ${UZ_MONTHS_SHORT[d.getMonth()]}`;
const fmtTime = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ── Recharts custom tooltip ───────────────────────────────────────────
const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-[12px] shadow-xl" style={{ background: "var(--chart-tooltip-bg,#131319)", border: "1px solid var(--chart-tooltip-border,#1f1f2a)" }}>
      <div className="font-semibold mb-1" style={{ color: "var(--chart-tooltip-text,#f5f5f7)" }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span style={{ color: "var(--text-secondary,#a1a1b5)" }}>{p.name}:</span>
          <span className="font-semibold" style={{ color: "var(--chart-tooltip-text,#f5f5f7)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

// ── Raqamli KPI tile ──────────────────────────────────────────────────
const StatTile: React.FC<{ icon: React.ReactNode; label: string; value: string; sub?: string; color: string }> = ({
  icon, label, value, sub, color,
}) => (
  <div className="rounded-xl p-4 flex flex-col" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
    <div className="flex items-center gap-2 mb-2.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1f`, color }}>
        {icon}
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary,#a1a1b5)" }}>{label}</span>
    </div>
    <div className="text-[28px] font-bold leading-none" style={{ color: "var(--text-primary,#f5f5f7)" }}>{value}</div>
    {sub && <div className="text-[12px] mt-1.5" style={{ color: "var(--text-muted,#64748b)" }}>{sub}</div>}
  </div>
);

// ── Menejer (ism) KPI tile ────────────────────────────────────────────
const PersonTile: React.FC<{ label: string; name: string | null; photo?: string | null; count: number | null; color: string; sign: string }> = ({
  label, name, photo, count, color, sign,
}) => (
  <div className="rounded-xl p-4 flex flex-col" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
    <span className="text-[11px] font-semibold uppercase tracking-wide mb-2.5" style={{ color: "var(--text-secondary,#a1a1b5)" }}>{label}</span>
    {name ? (
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={name} src={photo || undefined} color={managerColor(name)} size={34} />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold truncate leading-tight" style={{ color: "var(--text-primary,#f5f5f7)" }}>{name}</div>
          <div className="text-[12px] mt-0.5 font-semibold" style={{ color }}>{sign}{count} ta lead</div>
        </div>
      </div>
    ) : (
      <span className="text-[14px]" style={{ color: "var(--text-muted,#64748b)" }}>—</span>
    )}
  </div>
);

// ── Ism qisqartmasi: "Robiya Muhammedova" → "Robiya M." (to'liq ism hoverda) ──
const shortName = (n: string): string => {
  if (!n) return "";
  if (n.includes("#")) return n; // "User #531" — placeholder, to'liq qoldiramiz
  const parts = n.trim().split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
};

// ── Menejer chip: avatar (rasm yoki rang) + qisqa ism (to'liq ism title'da) ──
const NameChip: React.FC<{ name: string; photo?: string | null; size?: number; strong?: boolean }> = ({
  name, photo, size = 22, strong,
}) => (
  <span className="flex items-center gap-1.5 min-w-0" title={name}>
    <Avatar name={name} src={photo || undefined} color={managerColor(name)} size={size} />
    <span
      className="text-[13px] truncate"
      style={{ color: strong ? "var(--text-primary,#f5f5f7)" : "var(--text-secondary,#a1a1b5)", fontWeight: strong ? 600 : 500 }}
    >
      {shortName(name)}
    </span>
  </span>
);

// ── Yo'nalish: kimdan → kimga (avatar + qisqa ism) ──
const FlowPair: React.FC<{ from: string; to: string; fromPhoto?: string | null; toPhoto?: string | null; size?: number }> = ({
  from, to, fromPhoto, toPhoto, size = 22,
}) => (
  <div className="flex items-center gap-1.5 min-w-0 flex-1">
    <NameChip name={from} photo={fromPhoto} size={size} />
    <ArrowRight size={14} strokeWidth={2.5} style={{ color: GIVEN, flexShrink: 0 }} />
    <NameChip name={to} photo={toPhoto} size={size} strong />
  </div>
);

// ── Recent'ni kun bo'yicha guruhlash (timeline) ──
const groupByDay = (recent: TransferRecent[]): { day: string; items: TransferRecent[] }[] => {
  const groups: { day: string; items: TransferRecent[] }[] = [];
  for (const r of recent) {
    const day = fmtUz(new Date(r.at));
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(r);
    else groups.push({ day, items: [r] });
  }
  return groups;
};

const LeadTransfersSection: React.FC = () => {
  const [filter, setFilter] = useState<FilterKey>("month");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);

  const calRef = useRef<HTMLDivElement>(null);
  const filtRef = useRef<HTMLDivElement>(null);

  // Popoverlarni tashqariga bosishda yopish
  useEffect(() => {
    if (!calendarOpen && !filterOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (calendarOpen && calRef.current && !calRef.current.contains(t)) setCalendarOpen(false);
      if (filterOpen && filtRef.current && !filtRef.current.contains(t)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [calendarOpen, filterOpen]);

  const params = useMemo(() => {
    const today = new Date();
    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    if (filter === "custom" && range?.from) {
      dateFrom = toLocalDateStr(range.from);
      dateTo = toLocalDateStr(range.to || range.from);
    } else if (filter === "today") {
      dateFrom = toLocalDateStr(today);
      dateTo = dateFrom;
    } else if (filter === "week") {
      dateFrom = toLocalDateStr(startOfWeek(today));
      dateTo = toLocalDateStr(today);
    } else if (filter === "month") {
      dateFrom = toLocalDateStr(startOfMonth(today));
      dateTo = toLocalDateStr(today);
    }
    return {
      dateFrom,
      dateTo,
      managerIds: selectedManagers.length ? selectedManagers.join(",") : undefined,
    };
  }, [filter, range, selectedManagers]);

  const { data, isLoading } = useQuery<LeadTransferReport>({
    queryKey: ["analytics-lead-transfers", params],
    queryFn: () => analyticsService.leadTransfers(params),
  });

  const chartData = (data?.perManager || []).map((m) => ({ name: m.name, photo: m.photo, received: m.received, given: m.given }));
  const scrolls = chartData.length > VISIBLE_ROWS;
  const fullHeight = chartData.length * ROW_H + 16;
  const recentGroups = data ? groupByDay(data.recent) : [];
  // Ism → rasm (perManager flows/recent dagi barcha menejerlarni qamraydi)
  const photoByName = new Map<string, string | null>((data?.perManager || []).map((m) => [m.name, m.photo]));

  // YAxis custom tick — avatar (rasm/rang) + qisqa ism (foreignObject ichida HTML)
  const renderAvatarTick = ({ x, y, payload }: any) => {
    const name = String(payload.value);
    const photo = photoByName.get(name);
    return (
      <foreignObject x={x - 148} y={y - 13} width={146} height={26}>
        <div className="flex items-center gap-2 h-full pr-2" title={name}>
          <Avatar name={name} src={photo || undefined} color={managerColor(name)} size={26} />
          <span className="text-[12px] truncate" style={{ color: "var(--text-primary,#f5f5f7)" }}>{shortName(name)}</span>
        </div>
      </foreignObject>
    );
  };

  const periodBtns: { key: FilterKey; label: string }[] = [
    { key: "month", label: "Bu oy" },
    { key: "week", label: "Bu hafta" },
    { key: "today", label: "Bugun" },
  ];

  const rangeLabel =
    filter === "custom" && range?.from
      ? `${fmtUz(range.from)}${range.to ? ` – ${fmtUz(range.to)}` : ""}`
      : "";

  return (
    <Card
      title="Lead transfer tarixi (kim → kim)"
      subtitle="Lead bir menejerdan boshqasiga o'tgan holatlar — qabul qilingan va berilgan bo'yicha"
    >
      {/* ── Filter bar: period + calendar + manager filter ── */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-xl border"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}
        >
          {periodBtns.map((b) => {
            const active = filter === b.key;
            return (
              <button
                key={b.key}
                onClick={() => { setFilter(b.key); setRange(undefined); }}
                className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all"
                style={{ backgroundColor: active ? ACCENT : "transparent", color: active ? "#fff" : "var(--text-secondary)" }}
              >
                {b.label}
              </button>
            );
          })}

          <div className="w-px self-stretch mx-1" style={{ backgroundColor: "var(--color-border)" }} />

          {/* Calendar */}
          <div className="relative" ref={calRef}>
            <button
              onClick={() => { setCalendarOpen((v) => !v); setFilterOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={{ backgroundColor: filter === "custom" ? ACCENT : "transparent", color: filter === "custom" ? "#fff" : "var(--text-secondary)" }}
              title="Sana oralig'i"
            >
              <CalendarIcon size={15} />
              {rangeLabel && <span className="hidden sm:inline">{rangeLabel}</span>}
            </button>
            {calendarOpen && (
              <div
                className="absolute left-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden"
                style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)", minWidth: 320 }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Sana oralig'i</span>
                  <button onClick={() => setCalendarOpen(false)} className="p-1 rounded hover:opacity-70" style={{ color: "var(--text-secondary)" }}>
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
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--color-border)" }}>
                  <button onClick={() => { setRange(undefined); setFilter("month"); setCalendarOpen(false); }} className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                    Tozalash
                  </button>
                  <button
                    onClick={() => { if (range?.from) { setFilter("custom"); setCalendarOpen(false); } }}
                    disabled={!range?.from}
                    className="px-4 py-1.5 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40"
                    style={{ backgroundColor: ACCENT, color: "#fff" }}
                  >
                    Qo'llash
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="w-px self-stretch mx-1" style={{ backgroundColor: "var(--color-border)" }} />

          {/* Manager filter */}
          <div className="relative" ref={filtRef}>
            <button
              onClick={() => { setFilterOpen((v) => !v); setCalendarOpen(false); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all"
              style={{ backgroundColor: selectedManagers.length ? ACCENT : "transparent", color: selectedManagers.length ? "#fff" : "var(--text-secondary)" }}
            >
              <FilterIcon size={15} />
              <span>Filter</span>
              {selectedManagers.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(255,255,255,0.25)", color: "#fff" }}>
                  {selectedManagers.length}
                </span>
              )}
            </button>
            {filterOpen && (
              <div
                className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden"
                style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)", minWidth: 280 }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Menejer bo'yicha</span>
                  <button
                    onClick={() => setSelectedManagers([])}
                    className="text-[12px] font-medium disabled:opacity-40"
                    style={{ color: "var(--text-secondary)" }}
                    disabled={!selectedManagers.length}
                  >
                    Tozalash
                  </button>
                </div>
                <ManagerDeptFilter
                  selectedManagerIds={selectedManagers}
                  onChange={setSelectedManagers}
                  accentColor={ACCENT}
                  maxHeight={300}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data || data.total === 0 ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: "var(--ds-bg-overlay,#22222d)" }}>
            <ArrowLeftRight size={22} style={{ color: "var(--text-muted,#64748b)" }} />
          </div>
          <p className="text-[14px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>Tanlangan davrda transfer topilmadi</p>
          <p className="text-[12px] mt-1" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Lead bir menejerdan boshqasiga o'tganda bu yerda ko'rinadi</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* KPI band */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile icon={<ArrowLeftRight size={15} />} color="#4f46e5" label="Jami transfer" value={data.total.toLocaleString()} sub={`${data.uniqueLeads} ta lead bo'yicha`} />
            <StatTile icon={<Users size={15} />} color="#8b5cf6" label="Qatnashgan menejer" value={data.managersInvolved.toLocaleString()} />
            <PersonTile label="Eng ko'p qabul qilgan" name={data.topReceiver?.name ?? null} photo={data.topReceiver ? photoByName.get(data.topReceiver.name) : null} count={data.topReceiver?.count ?? null} color={RECEIVED} sign="+" />
            <PersonTile label="Eng ko'p bergan" name={data.topGiver?.name ?? null} photo={data.topGiver ? photoByName.get(data.topGiver.name) : null} count={data.topGiver?.count ?? null} color={GIVEN} sign="−" />
          </div>

          {/* Menejer kesimida — gorizontal bar (scroll, 10 default) */}
          <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
            <h4 className="text-[13px] font-semibold mb-0.5" style={{ color: "var(--text-primary,#f5f5f7)" }}>Menejer kesimida</h4>
            <p className="text-[12px] mb-3" style={{ color: "var(--text-muted,#64748b)" }}>Har bir menejer nechta lead qabul qilgan va boshqaga bergan</p>
            <div style={{ maxHeight: scrolls ? VISIBLE_ROWS * ROW_H : undefined, overflowY: scrolls ? "auto" : "visible" }}>
              <ResponsiveContainer width="100%" height={fullHeight}>
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 28, left: 0, bottom: 0 }} barCategoryGap="22%" barGap={4}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={156} interval={0} axisLine={false} tickLine={false} tick={renderAvatarTick} />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <Bar dataKey="received" name="Qabul qilingan" fill={RECEIVED} radius={[0, 8, 8, 0]} maxBarSize={16}>
                    <LabelList dataKey="received" position="right" fontSize={11} fontWeight={600} fill="#cbd5e1" formatter={(v: number) => (v > 0 ? v : "")} />
                  </Bar>
                  <Bar dataKey="given" name="Berilgan" fill={GIVEN} radius={[0, 8, 8, 0]} maxBarSize={16}>
                    <LabelList dataKey="given" position="right" fontSize={11} fontWeight={600} fill="#cbd5e1" formatter={(v: number) => (v > 0 ? v : "")} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Yagona legend — chart pastida */}
            <div className="flex items-center gap-4 mt-3 pt-3 text-[12px]" style={{ borderTop: "1px solid var(--color-border,#1f1f2a)" }}>
              <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary,#a1a1b5)" }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: RECEIVED }} /> Qabul qilingan
              </span>
              <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary,#a1a1b5)" }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: GIVEN }} /> Berilgan
              </span>
            </div>
          </div>

          {/* Yo'nalishlar + so'nggi transferlar */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Flows — chastota reytingi (nisbiy bar bilan) */}
            <div className="rounded-xl p-3" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <div className="flex items-baseline justify-between mb-2.5 px-2">
                <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>Eng faol transferlar</h4>
                <span className="text-[11px]" style={{ color: "var(--text-muted,#64748b)" }}>kimdan → kimga</span>
              </div>
              {data.flows.length === 0 ? (
                <p className="text-[12px] px-2 py-2" style={{ color: "var(--text-muted,#64748b)" }}>Ma'lumot yo'q</p>
              ) : (
                <div className="space-y-1.5 overflow-y-auto pr-0.5" style={{ maxHeight: 480 }}>
                  {data.flows.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2.5"
                      style={{ background: "rgba(79,70,229,0.12)" }}
                      title={`${f.fromName} → ${f.toName}`}
                    >
                      <FlowPair from={f.fromName} to={f.toName} fromPhoto={photoByName.get(f.fromName)} toPhoto={photoByName.get(f.toName)} />
                      <div className="flex items-baseline gap-1 flex-shrink-0">
                        <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--text-primary,#f5f5f7)" }}>{f.count}</span>
                        <span className="text-[10px]" style={{ color: "var(--text-muted,#64748b)" }}>marta</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent — kun bo'yicha guruhlangan timeline */}
            <div className="rounded-xl p-3" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <div className="flex items-baseline justify-between mb-2.5 px-2">
                <h4 className="text-[13px] font-semibold" style={{ color: "var(--text-primary,#f5f5f7)" }}>So'nggi transferlar</h4>
                <span className="text-[11px]" style={{ color: "var(--text-muted,#64748b)" }}>vaqt bo'yicha</span>
              </div>
              {data.recent.length === 0 ? (
                <p className="text-[12px] px-2 py-2" style={{ color: "var(--text-muted,#64748b)" }}>Ma'lumot yo'q</p>
              ) : (
                <div className="overflow-y-auto pr-0.5" style={{ maxHeight: 480 }}>
                  {recentGroups.map((g, gi) => (
                    <div key={gi}>
                      <div
                        className="sticky top-0 z-10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                        style={{ background: "var(--ds-bg-base,#0b0b0f)", color: "var(--text-muted,#64748b)" }}
                      >
                        {g.day}
                      </div>
                      {g.items.map((r, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1.5"
                          style={{ background: "rgba(79,70,229,0.12)" }}
                          title={`Mijoz: ${r.phone}`}
                        >
                          <span className="text-[11px] tabular-nums flex-shrink-0 w-9" style={{ color: "var(--text-muted,#64748b)" }}>{fmtTime(r.at)}</span>
                          <FlowPair from={r.fromName} to={r.toName} fromPhoto={photoByName.get(r.fromName)} toPhoto={photoByName.get(r.toName)} size={20} />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {data.note && (
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>
          )}
        </div>
      )}
    </Card>
  );
};

export default LeadTransfersSection;
