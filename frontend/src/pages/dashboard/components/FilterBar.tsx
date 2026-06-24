import React from "react";
import { useQuery } from "@tanstack/react-query";
import CustomSelect from "../../../components/ui/CustomSelect";
import ManagerDeptFilterTrigger from "../../../components/filters/ManagerDeptFilterTrigger";
import { voronkaService } from "../../../services/voronka.service";

interface Manager {
  id: string;
  name: string;
  isActive: boolean;
}

interface FilterBarProps {
  period: string;
  setPeriod: (v: string) => void;
  managerId: string;
  setManagerId: (v: string) => void;
  compareEnabled: boolean;
  setCompareEnabled: (v: boolean) => void;
  managerA: string;
  setManagerA: (v: string) => void;
  managerB: string;
  setManagerB: (v: string) => void;
  managers: Manager[];
  dateFrom?: string;
  setDateFrom?: (v: string) => void;
  dateTo?: string;
  setDateTo?: (v: string) => void;
  hideManagerSelector?: boolean;
  category?: string;
  setCategory?: (v: string) => void;
  pipeline?: string;
  setPipeline?: (v: string) => void;
}

const dateInputClass =
  "px-3 py-2.5 bg-primary border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-accent";

const labelClass = "text-xs font-medium text-secondary uppercase tracking-wide mb-1";

const periodOptions = [
  { value: "today", label: "Bugun" },
  { value: "yesterday", label: "Kecha" },
  { value: "week", label: "Bu hafta" },
  { value: "month", label: "Bu oy" },
  { value: "quarter", label: "Bu chorak" },
  { value: "year", label: "Bu yil" },
  { value: "custom", label: "Boshqa" },
];

const categoryOptions = [
  { value: "", label: "Barchasi" },
  { value: "sotuv", label: "1-Qo'ng'iroq" },
  { value: "qayta", label: "Qayta qo'ng'iroq" },
  { value: "boshqa", label: "Boshqa" },
];

const FilterBar: React.FC<FilterBarProps> = ({
  period,
  setPeriod,
  managerId,
  setManagerId,
  compareEnabled,
  setCompareEnabled,
  managerA,
  setManagerA,
  managerB,
  setManagerB,
  managers,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  hideManagerSelector,
  category,
  setCategory,
  pipeline,
  setPipeline,
}) => {
  const activeManagers = managers.filter((m) => m.isActive);

  const { data: pipelines } = useQuery({
    queryKey: ["voronkalar", "filter"],
    queryFn: () => voronkaService.getAll(false),
    staleTime: 5 * 60 * 1000,
  });

  const pipelineOptions = [
    { value: "", label: "Barchasi" },
    ...(pipelines || [])
      .filter((p) => !p.isArchived)
      .map((p) => ({ value: p.name, label: p.name })),
  ];

  const compareOptions = [
    { value: "", label: "Tanlang" },
    ...activeManagers.map((m) => ({ value: m.id, label: m.name })),
  ];

  return (
    <div>
      <div className="flex flex-col gap-3">
        {/* Davr */}
        <div className="flex flex-col">
          <label className={labelClass}>Davr</label>
          <CustomSelect value={period} onChange={setPeriod} options={periodOptions} />
        </div>

        {/* Kategoriya */}
        {setCategory && (
          <div className="flex flex-col">
            <label className={labelClass}>Kategoriya</label>
            <CustomSelect value={category || ""} onChange={setCategory} options={categoryOptions} />
          </div>
        )}

        {/* Voronka */}
        {setPipeline && (
          <div className="flex flex-col">
            <label className={labelClass}>Voronka</label>
            <CustomSelect value={pipeline || ""} onChange={setPipeline} options={pipelineOptions} />
          </div>
        )}

        {/* Custom date range */}
        {period === "custom" && (
          <>
            <div className="flex flex-col">
              <label className={labelClass}>Dan</label>
              <input
                type="date"
                value={dateFrom || ""}
                onChange={(e) => setDateFrom?.(e.target.value)}
                className={dateInputClass}
                style={{ color: "var(--text-primary, #fff)" }}
              />
            </div>
            <div className="flex flex-col">
              <label className={labelClass}>Gacha</label>
              <input
                type="date"
                value={dateTo || ""}
                onChange={(e) => setDateTo?.(e.target.value)}
                className={dateInputClass}
                style={{ color: "var(--text-primary, #fff)" }}
              />
            </div>
          </>
        )}

        {/* Menejer — bo'lim bo'yicha dropdown */}
        {!hideManagerSelector && (
          <div className="flex flex-col">
            <label className={labelClass}>Menejer</label>
            <ManagerDeptFilterTrigger
              selected={managerId === "all" ? [] : [managerId]}
              onChange={(ids) => setManagerId(ids[0] || "all")}
              fallbackManagers={activeManagers.map((m) => ({ id: m.id, name: m.name }))}
              mode="single"
              emptyLabel="Barcha"
              size="md"
            />
          </div>
        )}

        {/* Solishtirish */}
        {!hideManagerSelector && (
          <div className="flex flex-col">
            <label className={labelClass}>Solishtirish</label>
            <button
              onClick={() => setCompareEnabled(!compareEnabled)}
              className="relative w-11 h-6 rounded-full transition-colors"
              style={{ backgroundColor: compareEnabled ? "#3b5ef5" : "var(--color-border, #27272a)" }}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  compareEnabled ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>
        )}

        {/* Compare dropdowns */}
        {compareEnabled && (
          <>
            <div className="flex flex-col">
              <label className={labelClass}>Menejer A</label>
              <CustomSelect value={managerA} onChange={setManagerA} options={compareOptions} />
            </div>
            <div className="flex flex-col">
              <label className={labelClass}>Menejer B</label>
              <CustomSelect value={managerB} onChange={setManagerB} options={compareOptions} />
            </div>
          </>
        )}

      </div>
    </div>
  );
};

export default FilterBar;
