import React from "react";
import { useQuery } from "@tanstack/react-query";
import { plansService, PlanFact } from "../../../services/plans.service";
import { Target } from "lucide-react";

const PlanFactBlock: React.FC = () => {
  const { data } = useQuery<PlanFact>({
    queryKey: ["plan-fact"],
    queryFn: plansService.getPlanFact,
  });

  if (!data) return null;

  const items = [
    { label: "Kunlik", ...data.daily, color: "#3b5ef5" },
    { label: "Haftalik", ...data.weekly, color: "#2fcc6e" },
    { label: "Oylik", ...data.monthly, color: "#e6a020" },
  ];

  const hasPlans = items.some((i) => i.plan > 0);

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-accent" />
          <h4 className="text-sm font-semibold text-white">Sotuv: Plan va Fakt</h4>
        </div>
        {!hasPlans && (
          <a href="/profile" className="text-xs text-accent hover:underline">
            Plan o'rnating →
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.label} className="bg-primary/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-secondary">{item.label}</span>
              <span
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  color: item.percent >= 100 ? "#2fcc6e" : item.percent >= 50 ? "#e6a020" : "#e64545",
                  backgroundColor: item.percent >= 100 ? "rgba(47,204,110,0.1)" : item.percent >= 50 ? "rgba(230,160,32,0.1)" : "rgba(230,69,69,0.1)",
                }}
              >
                {item.percent}%
              </span>
            </div>

            <div className="flex items-end gap-1 mb-2">
              <span className="text-2xl font-bold" style={{ color: item.color }}>
                {item.fact}
              </span>
              <span className="text-sm text-secondary mb-0.5">/ {item.plan}</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-primary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(item.percent, 100)}%`,
                  backgroundColor: item.percent >= 100 ? "#2fcc6e" : item.percent >= 50 ? "#e6a020" : "#e64545",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PlanFactBlock;
