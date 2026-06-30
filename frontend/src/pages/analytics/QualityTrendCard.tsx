import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus, Calendar as CalendarIcon, Filter as FilterIcon, X } from "lucide-react";
import { DayPicker, DateRange } from "react-day-picker";
import { uz } from "date-fns/locale";
import "react-day-picker/style.css";
import { analyticsService, QualityMonth } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import ManagerDeptFilter from "../../components/filters/ManagerDeptFilter";

const SIFATSIZ = "#ef4444";
const QAYTA = "#f59e0b";
const ACCENT = "#22c55e";
const GOOD = "#10b981";
const BAD = "#ef4444";

type Mode = "cohort" | "transition";
type FilterKey = "all" | "today" | "week" | "month" | "custom";

const toLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const startOfToday = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const startOfWeek = (d: Date) => { const x = startOfToday(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const startOfMonth = (d: Date) => { const x = startOfToday(d); x.setDate(1); return x; };
const UZ_M = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avg", "sen", "okt", "noy", "dek"];
const fmtUz = (d: Date) => `${d.getDate()} ${UZ_M[d.getMonth()]}`;

const ChartTooltip: React.FC<any> = ({ active, payload, label, mode }) => {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as QualityMonth;
  const isCohort = mode === "cohort";
  return (
    <div className="rounded-lg px-3 py-2 text-[12px] shadow-xl" style={{ background: "var(--chart-tooltip-bg,#131319)", border: "1px solid var(--chart-tooltip-border,#1f1f2a)" }}>
      <div className="font-semibold mb-1.5" style={{ color: "var(--chart-tooltip-text,#f5f5f7)" }}>{label} {String(row.year).slice(2)}{isCohort && row.total ? ` · ${row.total.toLocaleString()} lead` : ""}</div>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="w-2 h-2 rounded-full" style={{ background: SIFATSIZ }} />
        <span style={{ color: "var(--text-secondary,#a1a1b5)" }}>Sifatsiz:</span>
        <span className="font-semibold" style={{ color: "var(--chart-tooltip-text,#f5f5f7)" }}>{isCohort ? `${row.sifatsizPct}%` : row.sifatsizCount}</span>
        {isCohort && <span style={{ color: "var(--text-muted,#64748b)" }}>({row.sifatsizCount})</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: QAYTA }} />
        <span style={{ color: "var(--text-secondary,#a1a1b5)" }}>Qayta:</span>
        <span className="font-semibold" style={{ color: "var(--chart-tooltip-text,#f5f5f7)" }}>{isCohort ? `${row.qaytaPct}%` : row.qaytaCount}</span>
        {isCohort && <span style={{ color: "var(--text-muted,#64748b)" }}>({row.qaytaCount})</span>}
      </div>
    </div>
  );
};

const TrendTile: React.FC<{ label: string; value: string; delta: number | null; deltaSuffix: string; dot: string }> = ({ label, value, delta, deltaSuffix, dot }) => {
  const improved = delta != null && delta < 0;
  const worsened = delta != null && delta > 0;
  const dColor = improved ? GOOD : worsened ? BAD : "var(--text-muted,#64748b)";
  const DIcon = improved ? ArrowDownRight : worsened ? ArrowUpRight : Minus;
  return (
    <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
      <div className="flex items-center gap-2 mb-2">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: dot }} />
        <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary,#a1a1b5)" }}>{label}</span>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-[28px] font-bold leading-none" style={{ color: "var(--text-primary,#f5f5f7)" }}>{value}</span>
        {delta != null && delta !== 0 && (
          <span className="flex items-center gap-0.5 text-[12px] font-semibold mb-0.5" style={{ color: dColor }}>
            <DIcon size={14} strokeWidth={2.5} />{Math.abs(delta)}{deltaSuffix}
          </span>
        )}
      </div>
      <div className="text-[11px] mt-1.5" style={{ color: "var(--text-muted,#64748b)" }}>oxirgi oy · oldingi oyga nisbatan</div>
    </div>
  );
};

const QualityTrendCard: React.FC = () => {
  const [mode, setMode] = useState<Mode>("cohort");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [range, setRange] = useState<DateRange | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const calRef = useRef<HTMLDivElement>(null);
  const filtRef = useRef<HTMLDivElement>(null);

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
    if (filter === "custom" && range?.from) { dateFrom = toLocalDateStr(range.from); dateTo = toLocalDateStr(range.to || range.from); }
    else if (filter === "today") { dateFrom = toLocalDateStr(today); dateTo = dateFrom; }
    else if (filter === "week") { dateFrom = toLocalDateStr(startOfWeek(today)); dateTo = toLocalDateStr(today); }
    else if (filter === "month") { dateFrom = toLocalDateStr(startOfMonth(today)); dateTo = toLocalDateStr(today); }
    return { mode, dateFrom, dateTo, managerIds: mode === "cohort" && selectedManagers.length ? selectedManagers.join(",") : undefined };
  }, [mode, filter, range, selectedManagers]);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics-quality-trend", params],
    queryFn: () => analyticsService.qualityTrend(params),
  });

  const isCohort = mode === "cohort";
  const periodBtns: { key: FilterKey; label: string }[] = [
    { key: "all", label: "Hammasi" }, { key: "month", label: "Bu oy" }, { key: "week", label: "Bu hafta" }, { key: "today", label: "Bugun" },
  ];
  const rangeLabel = filter === "custom" && range?.from ? `${fmtUz(range.from)}${range.to ? ` – ${fmtUz(range.to)}` : ""}` : "";

  return (
    <Card title="Sifatsiz / Qayta obrabotka — oyma-oy" subtitle="Lead sifati oydan-oyga (kelgan oy foizi yoki o'tkazilgan oy soni)">
      {/* Toggle: A (foiz) / B (soni) */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
          {([["cohort", "Foiz · kelgan oy"], ["transition", "Soni · o'tkazilgan oy"]] as [Mode, string][]).map(([k, lbl]) => (
            <button key={k} onClick={() => setMode(k)} className="px-3 py-1 rounded-md text-[12px] font-semibold transition-all" style={{ background: mode === k ? "var(--color-accent,#4f46e5)" : "transparent", color: mode === k ? "#fff" : "var(--text-secondary,#a1a1b5)" }}>{lbl}</button>
          ))}
        </div>

        {/* Filter bar: period + calendar + (cohort) manager */}
        <div className="inline-flex items-center gap-1 p-1 rounded-xl border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}>
          {periodBtns.map((b) => (
            <button key={b.key} onClick={() => { setFilter(b.key); setRange(undefined); }} className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all" style={{ backgroundColor: filter === b.key ? ACCENT : "transparent", color: filter === b.key ? "#fff" : "var(--text-secondary)" }}>{b.label}</button>
          ))}
          <div className="w-px self-stretch mx-0.5" style={{ backgroundColor: "var(--color-border)" }} />
          <div className="relative" ref={calRef}>
            <button onClick={() => { setCalendarOpen((v) => !v); setFilterOpen(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all" style={{ backgroundColor: filter === "custom" ? ACCENT : "transparent", color: filter === "custom" ? "#fff" : "var(--text-secondary)" }} title="Sana oralig'i">
              <CalendarIcon size={15} />{rangeLabel && <span className="hidden sm:inline">{rangeLabel}</span>}
            </button>
            {calendarOpen && (
              <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)", minWidth: 320 }}>
                <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                  <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Sana oralig'i</span>
                  <button onClick={() => setCalendarOpen(false)} style={{ color: "var(--text-secondary)" }}><X size={16} /></button>
                </div>
                <div className="p-3"><DayPicker mode="range" selected={range} onSelect={setRange} locale={uz} weekStartsOn={1} numberOfMonths={1} className="sales-daypicker" /></div>
                <div className="flex items-center justify-between gap-2 px-4 py-3 border-t" style={{ borderColor: "var(--color-border)" }}>
                  <button onClick={() => { setRange(undefined); setFilter("all"); setCalendarOpen(false); }} className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>Tozalash</button>
                  <button onClick={() => { if (range?.from) { setFilter("custom"); setCalendarOpen(false); } }} disabled={!range?.from} className="px-4 py-1.5 rounded-lg text-[13px] font-semibold disabled:opacity-40" style={{ backgroundColor: ACCENT, color: "#fff" }}>Qo'llash</button>
                </div>
              </div>
            )}
          </div>
          {isCohort && (
            <>
              <div className="w-px self-stretch mx-0.5" style={{ backgroundColor: "var(--color-border)" }} />
              <div className="relative" ref={filtRef}>
                <button onClick={() => { setFilterOpen((v) => !v); setCalendarOpen(false); }} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all" style={{ backgroundColor: selectedManagers.length ? ACCENT : "transparent", color: selectedManagers.length ? "#fff" : "var(--text-secondary)" }}>
                  <FilterIcon size={15} /><span>Filter</span>
                  {selectedManagers.length > 0 && <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: "rgba(255,255,255,0.25)", color: "#fff" }}>{selectedManagers.length}</span>}
                </button>
                {filterOpen && (
                  <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl border overflow-hidden" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)", minWidth: 280 }}>
                    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
                      <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>Menejer bo'yicha</span>
                      <button onClick={() => setSelectedManagers([])} disabled={!selectedManagers.length} className="text-[12px] font-medium disabled:opacity-40" style={{ color: "var(--text-secondary)" }}>Tozalash</button>
                    </div>
                    <ManagerDeptFilter selectedManagerIds={selectedManagers} onChange={setSelectedManagers} accentColor={ACCENT} maxHeight={300} />
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data || data.months.length === 0 ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <TrendTile label="Sifatsiz" value={isCohort ? `${data.latest?.sifatsizPct ?? 0}%` : `${data.latest?.sifatsizCount ?? 0}`} delta={data.delta?.sifatsiz ?? null} deltaSuffix={isCohort ? " pp" : ""} dot={SIFATSIZ} />
            <TrendTile label="Qayta obrabotka" value={isCohort ? `${data.latest?.qaytaPct ?? 0}%` : `${data.latest?.qaytaCount ?? 0}`} delta={data.delta?.qayta ?? null} deltaSuffix={isCohort ? " pp" : ""} dot={QAYTA} />
          </div>

          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data.months} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid,#1f1f2a)" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: "#a1a1b5", fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => (isCohort ? `${v}%` : `${v}`)} tick={{ fill: "#a1a1b5", fontSize: 11 }} axisLine={false} tickLine={false} width={isCohort ? 44 : 40} domain={[0, "auto"]} allowDecimals={false} />
              <Tooltip content={<ChartTooltip mode={mode} />} />
              <Line type="monotone" dataKey={isCohort ? "sifatsizPct" : "sifatsizCount"} name="Sifatsiz" stroke={SIFATSIZ} strokeWidth={2.5} dot={{ r: 4, fill: SIFATSIZ }} activeDot={{ r: 6 }} />
              <Line type="monotone" dataKey={isCohort ? "qaytaPct" : "qaytaCount"} name="Qayta" stroke={QAYTA} strokeWidth={2.5} dot={{ r: 4, fill: QAYTA }} activeDot={{ r: 6 }} />
            </LineChart>
          </ResponsiveContainer>

          <div className="flex items-center gap-4 text-[12px] pt-1">
            <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary,#a1a1b5)" }}><span className="w-2.5 h-2.5 rounded-sm" style={{ background: SIFATSIZ }} /> Sifatsiz</span>
            <span className="flex items-center gap-1.5" style={{ color: "var(--text-secondary,#a1a1b5)" }}><span className="w-2.5 h-2.5 rounded-sm" style={{ background: QAYTA }} /> Qayta obrabotka</span>
          </div>
          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default QualityTrendCard;
