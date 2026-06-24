import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ChevronDown, Building2 } from "lucide-react";
import api from "../../services/api";
import { ApiResponse } from "../../types";

// ── Backend response format (from /api/departments) ──
interface DeptManager {
  id: string;
  name: string;
  role: string | null;
  photoUrl: string | null;
  departmentId: string | null;
}

interface Department {
  id: string;
  name: string;
  parentId: string | null;
  managers: DeptManager[];
}

interface DepartmentsResponse {
  departments: Department[];
  topLevel: { id: string; name: string; parentId: string | null }[];
}

// ── Group: top-level department bilan uning barcha (direct + child) managerlarini ──
interface DeptGroup {
  dept: { id: string; name: string };
  managers: DeptManager[];
}

const fetchDepartments = async (): Promise<DepartmentsResponse> => {
  const { data } = await api.get<ApiResponse<DepartmentsResponse>>(
    "/departments"
  );
  return data.data;
};

export interface ManagerDeptFilterProps {
  /** Tanlangan menejer ID'lari (flat ro'yxat) */
  selectedManagerIds: string[];
  /** Tanlanganlarni yangilash */
  onChange: (ids: string[]) => void;
  /** Accent rangi — Sotuv=#22c55e, Audit=#8b5cf6 va hk. */
  accentColor?: string;
  /** Ro'yxat balandligi (maxHeight) — default 320px */
  maxHeight?: number;
  /** Agar backenddan kelmagan/bo'sh bo'lsa fallback uchun managerlar ro'yxati */
  fallbackManagers?: { id: string; name: string }[];
}

const ManagerDeptFilter: React.FC<ManagerDeptFilterProps> = ({
  selectedManagerIds,
  onChange,
  accentColor = "#22c55e",
  maxHeight = 320,
  fallbackManagers,
}) => {
  const [search, setSearch] = useState("");
  // Dept ID -> expand holati. Default: barchasi ochiq.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["manager-dept-filter"],
    queryFn: fetchDepartments,
    staleTime: 60 * 1000,
    refetchOnMount: true,
  });

  // Top-level departmentlar uchun tegishli managerlarni yig'amiz
  // (o'zi + child department managerlari).
  const groups: DeptGroup[] = useMemo(() => {
    if (!data) return [];
    const topLevelIds = new Set(
      data.topLevel.map((t) => t.id)
    );
    // parentId -> top-level root ga map (child ham o'z rootiga biriktiriladi)
    const rootById = new Map<string, string>();
    for (const d of data.departments) {
      if (topLevelIds.has(d.id)) {
        rootById.set(d.id, d.id);
      }
    }
    for (const d of data.departments) {
      if (!topLevelIds.has(d.id) && d.parentId && rootById.has(d.parentId)) {
        rootById.set(d.id, rootById.get(d.parentId)!);
      }
    }

    // Root -> managers mapping
    const byRoot = new Map<string, DeptManager[]>();
    for (const d of data.departments) {
      const root = rootById.get(d.id);
      if (!root) continue;
      if (!byRoot.has(root)) byRoot.set(root, []);
      byRoot.get(root)!.push(...d.managers);
    }

    // Top-level tartibida ro'yxat
    const result: DeptGroup[] = data.topLevel
      .map((t) => {
        const raw = byRoot.get(t.id) || [];
        // Dedup by id
        const seen = new Set<string>();
        const unique: DeptManager[] = [];
        for (const m of raw) {
          if (seen.has(m.id)) continue;
          seen.add(m.id);
          unique.push(m);
        }
        unique.sort((a, b) => a.name.localeCompare(b.name));
        return { dept: { id: t.id, name: t.name }, managers: unique };
      })
      .filter((g) => g.managers.length > 0);

    // Orphan menejerlar — fallbackManagers (sales data'dan keladi) ichidan
    // hech qaysi bo'limga tushmaganlar. Backend /departments faqat departmentId
    // bor menejerlarni qaytaradi, lekin Bitrix'dan kelgan ba'zi menejerlarning
    // bo'limi yo'q bo'lishi mumkin (masalan Muslima). Ularni "Bo'lim tayinlanmagan"
    // virtual guruh sifatida pastga qo'shamiz.
    if (fallbackManagers && fallbackManagers.length > 0) {
      const inDept = new Set<string>();
      for (const g of result) for (const m of g.managers) inDept.add(m.id);
      const orphans = fallbackManagers.filter((m) => !inDept.has(m.id));
      if (orphans.length > 0) {
        const orphanMgrs: DeptManager[] = orphans
          .slice()
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((m) => ({
            id: m.id,
            name: m.name,
            role: null,
            photoUrl: null,
            departmentId: null,
          }));
        result.push({
          dept: { id: "__no_department__", name: "Bo'lim tayinlanmagan" },
          managers: orphanMgrs,
        });
      }
    }
    return result;
  }, [data, fallbackManagers]);

  const allSelectedIds = new Set(selectedManagerIds);

  // Qidiruv filtri — har group ichida managerlarni filtrlaydi
  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        dept: g.dept,
        managers: g.managers.filter((m) =>
          m.name.toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.managers.length > 0);
  }, [groups, search]);

  const toggleManager = (id: string) => {
    if (allSelectedIds.has(id)) {
      onChange(selectedManagerIds.filter((x) => x !== id));
    } else {
      onChange([...selectedManagerIds, id]);
    }
  };

  const toggleDept = (g: DeptGroup) => {
    const ids = g.managers.map((m) => m.id);
    const allOn = ids.every((id) => allSelectedIds.has(id));
    if (allOn) {
      // Barchasini olib tashlash
      onChange(selectedManagerIds.filter((x) => !ids.includes(x)));
    } else {
      // Hammani qo'shish (dubllarsiz)
      const merged = new Set(selectedManagerIds);
      for (const id of ids) merged.add(id);
      onChange([...merged]);
    }
  };

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({
      ...prev,
      [id]: prev[id] === undefined ? false : !prev[id],
    }));
  };

  const isExpanded = (id: string): boolean =>
    expanded[id] === undefined ? true : expanded[id];

  const Checkbox: React.FC<{
    checked: boolean;
    indeterminate?: boolean;
  }> = ({ checked, indeterminate }) => (
    <span
      className="shrink-0 w-4 h-4 rounded border flex items-center justify-center"
      style={{
        backgroundColor:
          checked || indeterminate ? accentColor : "transparent",
        borderColor:
          checked || indeterminate ? accentColor : "var(--color-border)",
      }}
    >
      {indeterminate && !checked && (
        <span
          className="block"
          style={{
            width: 8,
            height: 2,
            backgroundColor: "#fff",
            borderRadius: 1,
          }}
        />
      )}
      {checked && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path
            d="M1 5L4 8L9 2"
            stroke="#fff"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );

  // Barcha mavjud menejer ID'lari (filter natijasi bo'yicha — qidiruv hisobga olinadi)
  const allVisibleIds = useMemo(() => {
    if (groups.length === 0) {
      const q = search.trim().toLowerCase();
      return (fallbackManagers ?? [])
        .filter((m) =>
          q === "" ? true : m.name.toLowerCase().includes(q)
        )
        .map((m) => m.id);
    }
    const ids = new Set<string>();
    for (const g of filteredGroups) {
      for (const m of g.managers) ids.add(m.id);
    }
    return [...ids];
  }, [groups, filteredGroups, fallbackManagers, search]);

  const visibleSelectedCount = allVisibleIds.filter((id) =>
    allSelectedIds.has(id)
  ).length;
  const allVisibleSelected =
    allVisibleIds.length > 0 && visibleSelectedCount === allVisibleIds.length;

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      // Hammasini bekor qilish (faqat ko'rinib turganlarini)
      const visibleSet = new Set(allVisibleIds);
      onChange(selectedManagerIds.filter((id) => !visibleSet.has(id)));
    } else {
      const merged = new Set(selectedManagerIds);
      for (const id of allVisibleIds) merged.add(id);
      onChange([...merged]);
    }
  };

  // Click event'larini ushlash — popover tashqi-click handlerga taralib yopilmasligi uchun
  const stop = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
  };

  // Top bar: search + select-all + counter
  const TopBar = (
    <div
      className="px-3 py-2 border-b space-y-2"
      style={{ borderColor: "var(--color-border)" }}
      onMouseDown={stop}
      onClick={stop}
    >
      <div className="relative">
        <Search
          size={13}
          className="absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-secondary)" }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Menejer qidirish..."
          className="w-full h-8 pl-7 pr-2 rounded-md border text-xs focus:outline-none"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onMouseDown={stop}
          onClick={(e) => {
            stop(e);
            toggleAllVisible();
          }}
          disabled={allVisibleIds.length === 0}
          className="text-[11px] font-semibold px-2 py-1 rounded-md transition-colors disabled:opacity-40"
          style={{
            color: accentColor,
            backgroundColor: `${accentColor}14`,
          }}
        >
          {allVisibleSelected ? "Hammasini bekor qilish" : "Hammasini tanlash"}
        </button>
        <span
          className="text-[11px] font-medium tabular-nums"
          style={{ color: "var(--text-secondary)" }}
        >
          {selectedManagerIds.length > 0
            ? `${selectedManagerIds.length} tanlangan`
            : `${allVisibleIds.length} ta`}
        </span>
      </div>
    </div>
  );

  // Backend yo'q / bo'sh bo'lsa — fallback flat ro'yxat
  if (!isLoading && groups.length === 0) {
    const mgrs = (fallbackManagers ?? []).filter((m) =>
      search.trim() === ""
        ? true
        : m.name.toLowerCase().includes(search.trim().toLowerCase())
    );
    return (
      <div className="flex flex-col" onMouseDown={stop} onClick={stop}>
        {TopBar}
        <div
          className="overflow-y-auto py-1"
          style={{ maxHeight }}
          onMouseDown={stop}
          onClick={stop}
        >
          {mgrs.length === 0 ? (
            <div
              className="py-8 text-center text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Menejerlar topilmadi
            </div>
          ) : (
            mgrs.map((m) => {
              const active = allSelectedIds.has(m.id);
              return (
                <button
                  type="button"
                  key={m.id}
                  onMouseDown={stop}
                  onClick={(e) => {
                    stop(e);
                    toggleManager(m.id);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-left text-sm transition-colors hover:bg-white/5"
                  style={{ color: "var(--text-primary)" }}
                >
                  <Checkbox checked={active} />
                  <span className="truncate">{m.name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col" onMouseDown={stop} onClick={stop}>
      {TopBar}

      {/* Dept tree */}
      <div
        className="overflow-y-auto py-1"
        style={{ maxHeight }}
        onMouseDown={stop}
        onClick={stop}
      >
        {isLoading ? (
          <div
            className="py-8 text-center text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Yuklanmoqda...
          </div>
        ) : filteredGroups.length === 0 ? (
          <div
            className="py-8 text-center text-xs"
            style={{ color: "var(--text-secondary)" }}
          >
            Hech narsa topilmadi
          </div>
        ) : (
          filteredGroups.map((g) => {
            const ids = g.managers.map((m) => m.id);
            const selectedCount = ids.filter((id) =>
              allSelectedIds.has(id)
            ).length;
            const allOn = selectedCount === ids.length && ids.length > 0;
            const partial = selectedCount > 0 && !allOn;
            const open = isExpanded(g.dept.id);
            const hasSel = selectedCount > 0;

            return (
              <div
                key={g.dept.id}
                className="mb-2 rounded-xl overflow-hidden border transition-all"
                style={{
                  borderColor: hasSel
                    ? `${accentColor}55`
                    : "var(--color-border)",
                  background: hasSel
                    ? `${accentColor}0a`
                    : "var(--color-card-bg)",
                }}
              >
                {/* Dept header — clickable dropdown trigger */}
                <button
                  type="button"
                  onMouseDown={stop}
                  onClick={(e) => {
                    stop(e);
                    toggleExpand(g.dept.id);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
                  style={{ color: "var(--text-primary)" }}
                >
                  {/* Checkbox — alohida click area, dept hammasini toggle qiladi */}
                  <span
                    role="button"
                    tabIndex={-1}
                    onMouseDown={stop}
                    onClick={(e) => {
                      stop(e);
                      toggleDept(g);
                    }}
                    className="shrink-0 -m-1 p-1 rounded cursor-pointer"
                    title={
                      allOn
                        ? "Bo'limdagi hammasini bekor qilish"
                        : "Bo'limdagi hammasini tanlash"
                    }
                  >
                    <Checkbox checked={allOn} indeterminate={partial} />
                  </span>
                  <Building2
                    size={14}
                    className="shrink-0"
                    style={{ color: hasSel ? accentColor : "var(--text-secondary)" }}
                  />
                  <span
                    className="truncate text-sm font-semibold flex-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {g.dept.name}
                  </span>
                  <span
                    className="text-[11px] shrink-0 font-semibold tabular-nums px-1.5 py-0.5 rounded"
                    style={{
                      color: hasSel ? accentColor : "var(--text-secondary)",
                      backgroundColor: hasSel
                        ? `${accentColor}1a`
                        : "transparent",
                    }}
                  >
                    {hasSel ? `${selectedCount}/${ids.length}` : `${ids.length} kishi`}
                  </span>
                  <ChevronDown
                    size={16}
                    className="shrink-0 transition-transform"
                    style={{
                      color: "var(--text-secondary)",
                      transform: open ? "rotate(0deg)" : "rotate(-90deg)",
                    }}
                  />
                </button>

                {/* Dropdown body — managers */}
                {open && (
                  <div
                    className="border-t py-1"
                    style={{ borderColor: "var(--color-border)" }}
                  >
                    {g.managers.length === 0 ? (
                      <div
                        className="py-3 text-center text-[11px]"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Bo'limda menejer yo'q
                      </div>
                    ) : (
                      g.managers.map((m) => {
                        const active = allSelectedIds.has(m.id);
                        return (
                          <button
                            type="button"
                            key={m.id}
                            onMouseDown={stop}
                            onClick={(e) => {
                              stop(e);
                              toggleManager(m.id);
                            }}
                            className="w-full flex items-center gap-2 pl-10 pr-3 py-1.5 text-left text-sm transition-colors hover:bg-white/5"
                            style={{
                              color: "var(--text-primary)",
                              backgroundColor: active
                                ? `${accentColor}10`
                                : "transparent",
                            }}
                          >
                            <Checkbox checked={active} />
                            <span className="truncate">{m.name}</span>
                            {m.role && (
                              <span
                                className="ml-auto text-[10px] shrink-0"
                                style={{
                                  color: "var(--text-secondary)",
                                  opacity: 0.7,
                                }}
                              >
                                {m.role}
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ManagerDeptFilter;
