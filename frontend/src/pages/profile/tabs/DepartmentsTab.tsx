import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Building2, Loader2, Save, Users } from "lucide-react";
import api from "../../../services/api";
import { ApiResponse } from "../../../types";

interface DeptRow {
  id: string;
  name: string;
  parentId: string | null;
  managerCount: number;
  activeManagerCount: number;
}

interface DeptsResp {
  departments: DeptRow[];
  activeDepartmentIds: string[];
}

const fetchAll = async (): Promise<DeptsResp> => {
  const { data } = await api.get<ApiResponse<DeptsResp>>("/departments/all");
  return data.data;
};

const saveActive = async (ids: string[]): Promise<string[]> => {
  const { data } = await api.put<
    ApiResponse<{ activeDepartmentIds: string[] }>
  >("/departments/active", { departmentIds: ids });
  return data.data.activeDepartmentIds;
};

const DepartmentsTab: React.FC = () => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["departments-all"],
    queryFn: fetchAll,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setSelected(new Set(data.activeDepartmentIds));
      setDirty(false);
    }
  }, [data?.activeDepartmentIds]);

  const mut = useMutation({
    mutationFn: saveActive,
    onSuccess: (ids) => {
      qc.invalidateQueries({ queryKey: ["departments-all"] });
      qc.invalidateQueries({ queryKey: ["manager-dept-filter"] });
      setSelected(new Set(ids));
      setDirty(false);
      toast.success("Saqlandi");
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || "Saqlashda xatolik"),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setDirty(true);
  };

  const selectAll = () => {
    if (!data) return;
    setSelected(new Set(data.departments.map((d) => d.id)));
    setDirty(true);
  };

  const clearAll = () => {
    setSelected(new Set());
    setDirty(true);
  };

  const save = () => {
    mut.mutate([...selected]);
  };

  if (isLoading) {
    return (
      <div className="py-12 flex flex-col items-center gap-3">
        <Loader2 size={28} className="animate-spin" style={{ color: "#22c55e" }} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Yuklanmoqda...
        </p>
      </div>
    );
  }

  if (!data || data.departments.length === 0) {
    return (
      <div className="py-12 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
        Bo'limlar topilmadi
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Aktiv bo'limlar
        </h2>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Filterlar va analitika faqat tanlangan bo'limlar bo'yicha ishlaydi.
          Hech narsa tanlanmagan bo'lsa — aktiv menejeri bor barcha bo'limlar avtomatik kiritiladi.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={selectAll}
            className="text-xs font-semibold px-3 py-1.5 rounded-md"
            style={{
              backgroundColor: "rgba(34,197,94,0.12)",
              color: "#22c55e",
            }}
          >
            Hammasini tanlash
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={selected.size === 0}
            className="text-xs font-semibold px-3 py-1.5 rounded-md disabled:opacity-40"
            style={{
              color: "var(--text-secondary)",
              border: "1px solid var(--color-border)",
            }}
          >
            Tozalash
          </button>
        </div>
        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          {selected.size} / {data.departments.length} tanlangan
        </span>
      </div>

      <div className="space-y-2">
        {data.departments.map((d) => {
          const checked = selected.has(d.id);
          return (
            <button
              type="button"
              key={d.id}
              onClick={() => toggle(d.id)}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left"
              style={{
                borderColor: checked ? "rgba(34,197,94,0.55)" : "var(--color-border)",
                backgroundColor: checked
                  ? "rgba(34,197,94,0.06)"
                  : "var(--color-card-bg)",
              }}
            >
              <span
                className="shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center"
                style={{
                  backgroundColor: checked ? "#22c55e" : "transparent",
                  borderColor: checked ? "#22c55e" : "var(--color-border)",
                }}
              >
                {checked && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6L5 9L10 3"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <Building2
                size={16}
                style={{ color: checked ? "#22c55e" : "var(--text-secondary)" }}
              />
              <span
                className="flex-1 font-semibold text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {d.name}
              </span>
              <span
                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  border: "1px solid var(--color-border)",
                  color: "var(--text-secondary)",
                }}
                title={`${d.activeManagerCount} aktiv / ${d.managerCount} jami`}
              >
                <Users size={11} />
                {d.activeManagerCount}/{d.managerCount}
              </span>
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-0 flex justify-end pt-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || mut.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
          style={{
            background: "linear-gradient(135deg,#22c55e,#10b981)",
            color: "#fff",
            boxShadow: "0 2px 12px rgba(34,197,94,0.35)",
          }}
        >
          {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Saqlash
        </button>
      </div>
    </div>
  );
};

export default DepartmentsTab;
