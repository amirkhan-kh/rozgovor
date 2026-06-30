import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Network, Phone } from "lucide-react";
import { analyticsService } from "../../services/analytics.service";
import Card from "../../components/ui/Card";
import LoadingSpinner from "../../components/ui/LoadingSpinner";
import { StatTile, NameChip, ManagerBars } from "./shared";

const PbxMappingCard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-pbx-mapping"],
    queryFn: () => analyticsService.pbxMapping(),
  });

  return (
    <Card title="PBX / extension mapping" subtitle="Menejer ↔ Bitrix user ID bog'lanishi (statik) va qo'ng'iroq faolligi">
      {isLoading ? (
        <div className="py-12 flex justify-center"><LoadingSpinner /></div>
      ) : !data ? (
        <p className="text-[13px] py-8 text-center" style={{ color: "var(--text-secondary,#a1a1b5)" }}>Ma'lumot yo'q</p>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatTile icon={<Network size={15} />} color="#4f46e5" label="Jami menejer" value={data.total.toLocaleString()} />
            <StatTile icon={<Network size={15} />} color="#10b981" label="ID bog'langan" value={data.mapped.toLocaleString()} sub="bitrix_<USER_ID>" />
            <StatTile icon={<Phone size={15} />} color="#8b5cf6" label="Qo'ng'iroq activity" value={data.rows.reduce((s, r) => s + r.callActivities, 0).toLocaleString()} />
          </div>

          {/* Qo'ng'iroq hajmi — top menejerlar */}
          {data.rows.some((r) => r.callActivities > 0) && (
            <div className="rounded-xl p-4" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
              <h4 className="text-[13px] font-semibold mb-2" style={{ color: "var(--text-primary,#f5f5f7)" }}>Qo'ng'iroq hajmi — menejer kesimida</h4>
              <ManagerBars
                data={data.rows.filter((r) => r.callActivities > 0).slice(0, 12).map((r) => ({ name: r.name, photo: r.photo, value: r.callActivities }))}
                barColor="#8b5cf6"
                valueFormatter={(v) => `${v} ta`}
                rowHeight={46}
                maxVisible={8}
              />
            </div>
          )}

          <div className="rounded-xl overflow-hidden" style={{ background: "var(--ds-bg-base, #0b0b0f)", border: "1px solid var(--color-border, #1f1f2a)" }}>
            <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted,#64748b)", borderBottom: "1px solid var(--color-border,#1f1f2a)" }}>
              <span>Menejer</span>
              <span className="text-right w-24">Bitrix ID</span>
              <span className="text-right w-20">Qo'ng'iroq</span>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 420 }}>
              {data.rows.map((r) => (
                <div key={r.managerId} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2.5" style={{ borderBottom: "1px solid var(--color-border,#15151c)" }}>
                  <div className="min-w-0">
                    <NameChip name={r.name} photo={r.photo} size={24} strong />
                    {r.department && <span className="text-[11px] ml-8 block -mt-0.5" style={{ color: "var(--text-muted,#64748b)" }}>{r.department}</span>}
                  </div>
                  <span className="text-right w-24 text-[12px] font-mono tabular-nums" style={{ color: r.bitrixUserId ? "var(--text-secondary,#a1a1b5)" : "var(--text-muted,#64748b)" }}>
                    {r.bitrixUserId || "—"}
                  </span>
                  <span className="text-right w-20 text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-primary,#f5f5f7)" }}>{r.callActivities}</span>
                </div>
              ))}
            </div>
          </div>

          {data.note && <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted,#64748b)" }}>{data.note}</p>}
        </div>
      )}
    </Card>
  );
};

export default PbxMappingCard;
