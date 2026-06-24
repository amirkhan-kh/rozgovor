import React from "react";
import { CategoryStatsData } from "../../../services/dashboard.service";

interface CategoryStatsBlockProps {
  data: CategoryStatsData;
}

const ALL_CATEGORIES = ["1-Qo'ng'iroq", "Qayta qo'ng'iroq", "Sotuv", "Boshqa"];

const CategoryStatsBlock: React.FC<CategoryStatsBlockProps> = ({ data }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {ALL_CATEGORIES.map((name) => {
        const cat = data.categories.find((c) => c.name === name);
        return (
          <div key={name} className="bg-card border border-border rounded-xl p-5">
            <div className="text-xs text-secondary mb-2">{name}</div>
            <div className="text-3xl font-bold" style={{ color: "var(--text-primary, #fff)" }}>
              {cat?.count || 0}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CategoryStatsBlock;
