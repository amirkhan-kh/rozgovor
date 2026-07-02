import React, { useState } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { Flag } from "lucide-react";
import Card from "../../../components/ui/Card";
import { LostVerdicts, LostVerdictStatus } from "../../../services/audit.service";

interface LostVerdictPieProps {
  data: LostVerdicts;
}

// Verdict ranglari — AudioDetailPage verdictStyle bilan mos
const VERDICT_COLOR: Record<LostVerdictStatus, string> = {
  right: "#22c55e",
  wrong: "#ef4444",
  unclear: "#f59e0b",
};

const LostVerdictPie: React.FC<LostVerdictPieProps> = ({ data }) => {
  const [active, setActive] = useState<number | null>(null);

  const total = data.total;
  // 0 bo'lmagan bo'laklar (bo'sh slice pie'ni buzmasligi uchun)
  const slices = data.breakdown.filter((b) => b.count > 0);
  // §6.1b — "wrong" (Manager noxaq) = noto'g'ri junk qilingan real lidlar → qaytarish mumkin.
  // Yangi so'rov shart emas — mavjud breakdown'dagi wrong sonidan olinadi.
  const recoverable = data.breakdown.find((b) => b.key === "wrong")?.count || 0;

  if (total === 0 || slices.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}
          >
            <Flag size={16} />
          </div>
          <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            Yo'qotilgan lidlar — manager bahosi
          </h3>
        </div>
        <div className="py-8 text-center text-xs" style={{ color: "var(--text-secondary)" }}>
          Yo'qotilgan lid topilmadi
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: "rgba(239,68,68,0.1)", color: "#ef4444" }}
        >
          <Flag size={16} />
        </div>
        <h3 className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
          Yo'qotilgan lidlar — manager bahosi
        </h3>
        <span className="text-xs ml-auto" style={{ color: "var(--text-secondary)" }}>
          {total.toLocaleString("ru-RU")} ta
        </span>
      </div>

      {recoverable > 0 && (
        <div
          className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg"
          style={{ backgroundColor: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.28)" }}
        >
          <span className="text-sm font-bold" style={{ color: "#22c55e" }}>
            ♻️ Qaytariladigan lidlar: {recoverable.toLocaleString("ru-RU")}
          </span>
          <span className="text-[11px]" style={{ color: "var(--text-secondary)" }}>
            Noto'g'ri junk qilingan — qaytarib ishlansa bo'ladi
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
        {/* Pie */}
        <div className="relative sm:col-span-2 min-h-[200px]">
          <ResponsiveContainer width="99%" height={200}>
            <PieChart>
              <Pie
                data={slices}
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={80}
                paddingAngle={2}
                dataKey="count"
                stroke="none"
                startAngle={90}
                endAngle={-270}
                onMouseEnter={(_, i) => setActive(i)}
                onMouseLeave={() => setActive(null)}
              >
                {slices.map((s) => (
                  <Cell
                    key={s.key}
                    fill={VERDICT_COLOR[s.key]}
                    style={{
                      filter:
                        active === null || slices[active]?.key === s.key
                          ? "none"
                          : "opacity(0.4)",
                      transition: "filter 0.2s",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              {active !== null && slices[active] ? (
                <>
                  <div
                    className="text-xs font-medium truncate max-w-[110px] mx-auto"
                    style={{ color: VERDICT_COLOR[slices[active].key] }}
                  >
                    {slices[active].label}
                  </div>
                  <div
                    className="text-xl font-bold leading-none mt-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {((slices[active].count / total) * 100).toFixed(1)}%
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    {slices[active].count} ta
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold leading-none" style={{ color: "var(--text-primary)" }}>
                    {total.toLocaleString("ru-RU")}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: "var(--text-secondary)" }}>
                    Jami
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="sm:col-span-3 space-y-1">
          {slices.map((s, i) => {
            const pct = total > 0 ? (s.count / total) * 100 : 0;
            const color = VERDICT_COLOR[s.key];
            return (
              <div
                key={s.key}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                className="flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all"
                style={{
                  backgroundColor: active === i ? `${color}15` : "transparent",
                }}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: color }}
                />
                <div className="flex-1 min-w-0">
                  <span
                    className="text-xs truncate block"
                    style={{ color: "var(--text-primary)" }}
                    title={s.label}
                  >
                    {s.label}
                  </span>
                  {s.key === "wrong" && (
                    <span className="text-[10px] truncate block" style={{ color: "var(--text-secondary)" }}>
                      Noto'g'ri junk qilingan — qaytarish mumkin
                    </span>
                  )}
                </div>
                <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>
                  {s.count}
                </span>
                <span
                  className="text-[10px] font-medium"
                  style={{ color: "var(--text-secondary)", minWidth: 40, textAlign: "right" }}
                >
                  {pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

export default LostVerdictPie;
