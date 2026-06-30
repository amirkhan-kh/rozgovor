import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import Card from "../../../components/ui/Card";
import Skeleton from "../../../components/ui/Skeleton";
import { plansService } from "../../../services/plans.service";

interface DailyTalkTimeBlockProps {
  period: string;
  dateFrom?: string;
  dateTo?: string;
  managerId?: string;
  managerIds?: string;
}

const formatMinutes = (mins: number): string => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}s ${m}m` : `${h}s`;
};

const percentColor = (percent: number, actual: number): string => {
  if (actual === 0) return "var(--text-secondary)";
  if (percent >= 100) return "#22c55e";
  if (percent >= 50) return "#f59e0b";
  return "#ef4444";
};

// Har bir menejerning kunlik gaplashish vaqti — kunma-kun, kunlik target
// (standart 2 soat) bilan solishtirilgan jadval
const DailyTalkTimeBlock: React.FC<DailyTalkTimeBlockProps> = ({
  period,
  dateFrom,
  dateTo,
  managerId,
  managerIds,
}) => {
  const { data, isLoading } = useQuery({
    queryKey: ["daily-talk-trend", { period, dateFrom, dateTo, managerId, managerIds }],
    queryFn: () =>
      plansService.getDailyTalkTrend({ period, dateFrom, dateTo, managerId, managerIds }),
  });

  if (isLoading) {
    return <Skeleton className="h-48" rounded="xl" />;
  }

  if (!data || data.managers.length === 0 || data.days.length === 0) return null;

  const dayLabel = (dateStr: string): string =>
    new Date(dateStr + "T00:00:00").toLocaleDateString("uz-UZ", {
      day: "numeric",
      month: "short",
    });

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 px-1">
        <Clock size={20} style={{ color: "#8b5cf6" }} />
        <h2 className="text-base font-bold" style={{ color: "var(--text-primary)" }}>
          Kunlik gaplashish vaqti
        </h2>
        <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
          (kunlik maqsad: {formatMinutes(data.target)})
        </span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ minWidth: data.days.length * 64 + 220 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                <th
                  className="text-left py-2 px-2 font-medium sticky left-0 z-10"
                  style={{ color: "var(--text-secondary)", backgroundColor: "var(--color-card-bg)" }}
                >
                  Menejer
                </th>
                {data.days.map((d) => (
                  <th
                    key={d}
                    className="text-center py-2 px-2 font-medium whitespace-nowrap"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {dayLabel(d)}
                  </th>
                ))}
                <th
                  className="text-right py-2 px-2 font-semibold whitespace-nowrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  Jami
                </th>
              </tr>
            </thead>
            <tbody>
              {data.managers.map((m) => {
                const totalPercent =
                  m.totalTargetMinutes > 0
                    ? Math.round((m.totalActualMinutes / m.totalTargetMinutes) * 100)
                    : 0;
                return (
                  <tr key={m.managerId} style={{ borderBottom: "1px solid var(--color-border)" }}>
                    <td
                      className="py-2 px-2 font-medium whitespace-nowrap sticky left-0 z-10"
                      style={{ color: "var(--text-primary)", backgroundColor: "var(--color-card-bg)" }}
                    >
                      {m.name}
                    </td>
                    {m.days.map((day) => (
                      <td
                        key={day.date}
                        className="text-center py-2 px-2 whitespace-nowrap font-semibold"
                        style={{ color: percentColor(day.percent, day.actualMinutes) }}
                        title={`${dayLabel(day.date)}: ${formatMinutes(day.actualMinutes)} / ${formatMinutes(day.targetMinutes)} (${day.percent}%)`}
                      >
                        {day.actualMinutes > 0 ? formatMinutes(day.actualMinutes) : "—"}
                      </td>
                    ))}
                    <td className="text-right py-2 px-2 whitespace-nowrap">
                      <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                        {formatMinutes(m.totalActualMinutes)}
                      </span>
                      <span
                        className="ml-1 font-semibold"
                        style={{ color: percentColor(totalPercent, m.totalActualMinutes) }}
                      >
                        ({totalPercent}%)
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px]" style={{ color: "var(--text-secondary)" }}>
          Ish soatlari ({data.workStartHour ?? 9}:00–{data.workEndHour ?? 18}:00) ichidagi
          qo'ng'iroqlar yig'indisi. Yashil — maqsad bajarilgan, sariq — 50%+, qizil — 50% dan past.
        </p>
      </Card>
    </div>
  );
};

export default DailyTalkTimeBlock;
