/**
 * PermissionsTab — super admin uchun menejer ruxsatlarini boshqarish.
 *
 * Har rol uchun alohida tab (Manager / ROP):
 *   - Shu rolidagi menejerlar ro'yxati (card grid)
 *   - Kartochkaga bosilsa → modal ochiladi, ruxsatlar tahrir qilinadi
 *
 * Ruxsatlar modali:
 *   - Har sahifa ― kollapsable row
 *   - "view" toggle — butun sahifani ochish/yopish
 *   - Ichki action'lar — alohida toggle'lar
 *   - Default holat rol default'idan keladi, custom o'zgarishlar override bo'ladi
 */

import React, { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Users, ShieldCheck, ChevronDown, ChevronRight, Check, X as XIcon, UsersRound } from "lucide-react";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";
import {
  permissionsService,
  ManagerPermissionsResponse,
  PermissionEntry,
  PageKey,
} from "../../../services/permissions.service";

interface PermissionsTabProps {
  role: "manager" | "rop";
}

// Sahifa nomlarini chiroyli ko'rsatish
const PAGE_LABELS: Record<string, string> = {
  sales: "Sotuv",
  audit: "Audit",
  clients: "Mijozlar",
  managers: "Menejerlar",
  rating: "Reyting",
  lessons: "Darsliklar",
  audio: "Audio",
  custdev: "Custdev",
  scenario: "Oltin senariy",
  rivals: "Raqobatchilar",
  profile: "Profil",
};

// Action nomlarini chiroyli ko'rsatish
const ACTION_LABELS: Record<string, string> = {
  view: "Ko'rish",
  edit: "Tahrirlash",
  delete: "O'chirish",
  export: "Eksport",
  edit_plan: "Plan o'zgartirish",
  upload: "Yuklash",
  upload_audio: "Audio yuklash",
  assign: "Biriktirish",
  create: "Yaratish",
  manage: "Boshqarish",
};

const labelPage = (key: string): string => PAGE_LABELS[key] || key;
const labelAction = (key: string): string => ACTION_LABELS[key] || key;

const PermissionsTab: React.FC<PermissionsTabProps> = ({ role }) => {
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["permissions-managers", role],
    queryFn: () => permissionsService.getManagersByRole(role),
  });

  const managers = data?.managers || [];

  return (
    <div>
      {/* Sarlavha */}
      <div
        className="rounded-xl border p-4 mb-4"
        style={{
          borderColor: "var(--color-border)",
          backgroundColor: "var(--color-card-bg)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} style={{ color: "var(--color-accent, #3b5ef5)" }} />
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {role === "rop" ? "ROP ruxsatlari" : "Manager ruxsatlari"}
          </h3>
        </div>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Har menejer uchun rol default'lari ustida custom ruxsatlarni sozlang.
          Kartochkaga bosib ruxsatlar panelini oching.
        </p>
        {managers.length > 0 && (
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => setBulkOpen(true)}
            >
              <UsersRound size={14} className="mr-1.5 inline" />
              Hammasini bir vaqtda o'zgartirish ({managers.length})
            </Button>
          </div>
        )}
      </div>

      {/* Ro'yxat */}
      {isLoading ? (
        <div
          className="py-12 text-center text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Yuklanmoqda...
        </div>
      ) : managers.length === 0 ? (
        <div
          className="py-12 text-center rounded-xl border"
          style={{
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-card-bg)",
          }}
        >
          <Users size={36} className="mx-auto mb-2 opacity-50" style={{ color: "var(--text-secondary)" }} />
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Hali {role === "rop" ? "ROP" : "Manager"} roli berilgan foydalanuvchi yo'q
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {managers.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedManager(m.id)}
              className="text-left rounded-xl border p-4 transition-all hover:shadow-md focus:outline-none focus:ring-2"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-card-bg)",
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                  style={{
                    background:
                      role === "rop"
                        ? "linear-gradient(135deg, #f59e0b, #d97706)"
                        : "linear-gradient(135deg, #3b5ef5, #8b5cf6)",
                    color: "#ffffff",
                  }}
                >
                  {m.name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="text-sm font-medium truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {m.name}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {m.email}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Ruxsatlar modali */}
      {selectedManager && (
        <PermissionsPanel
          managerId={selectedManager}
          onClose={() => setSelectedManager(null)}
        />
      )}

      {/* Bulk modal — barcha managerlar uchun bir vaqtda */}
      {bulkOpen && managers.length > 0 && (
        <BulkPermissionsPanel
          role={role}
          managerIds={managers.map((m) => m.id)}
          onClose={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
};

// ─── Ruxsatlar paneli (modal) ──────────────────────────────────────────

interface PanelProps {
  managerId: string;
  onClose: () => void;
}

const PermissionsPanel: React.FC<PanelProps> = ({ managerId, onClose }) => {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  // Local draft state: { "page|action": boolean }
  const [draft, setDraft] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ["permissions-manager", managerId],
    queryFn: () => permissionsService.getManagerPermissions(managerId),
  });

  const { data: rolesInfo } = useQuery({
    queryKey: ["permissions-roles"],
    queryFn: () => permissionsService.getRolesDefaults(),
  });

  // Data yuklangach draft'ni initialize qilish
  useEffect(() => {
    if (!data) return;
    const d: Record<string, boolean> = {};
    for (const [pageKey, actions] of Object.entries(data.matrix)) {
      for (const [actionKey, allowed] of Object.entries(actions)) {
        d[`${pageKey}|${actionKey}`] = allowed;
      }
    }
    setDraft(d);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!data || !rolesInfo) return;
      const entries = buildEntries(data, rolesInfo, draft);
      if (entries.length === 0) return;
      await permissionsService.updateManagerPermissions(managerId, entries);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions-manager", managerId] });
      // Joriy foydalanuvchining cached ruxsatlari ham o'zgarishi mumkin bo'lgani uchun
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
      toast.success("Ruxsatlar saqlandi");
      onClose();
    },
    onError: () => {
      toast.error("Saqlashda xatolik");
    },
  });

  const resetToDefaults = () => {
    if (!data || !rolesInfo) return;
    const roleDefaults = rolesInfo.defaults[data.manager.role];
    const d: Record<string, boolean> = {};
    for (const [pageKey, actions] of Object.entries(roleDefaults)) {
      for (const [actionKey, allowed] of Object.entries(actions)) {
        d[`${pageKey}|${actionKey}`] = allowed;
      }
    }
    setDraft(d);
  };

  const setValue = (pageKey: string, actionKey: string, allowed: boolean) => {
    setDraft((prev) => {
      const next = { ...prev, [`${pageKey}|${actionKey}`]: allowed };
      // view o'chirilsa → barcha action'lar ham o'chadi
      if (actionKey === "view" && !allowed) {
        const actions = rolesInfo?.actions[pageKey as keyof typeof rolesInfo.actions] || [];
        for (const a of actions) {
          if (a !== "view") next[`${pageKey}|${a}`] = false;
        }
      }
      return next;
    });
  };

  const pages = useMemo(() => {
    if (!rolesInfo) return [];
    return rolesInfo.pages;
  }, [rolesInfo]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={data ? `Ruxsatlar — ${data.manager.name}` : "Ruxsatlar"}
      size="lg"
    >
      {isLoading || !data || !rolesInfo ? (
        <div
          className="py-8 text-center text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Yuklanmoqda...
        </div>
      ) : (
        <div className="space-y-3">
          {/* Rol infosi */}
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "var(--text-secondary)",
            }}
          >
            Rol: <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {data.manager.role.toUpperCase()}
            </span>
            {" • "}
            <button
              type="button"
              onClick={resetToDefaults}
              className="underline"
              style={{ color: "var(--color-accent, #3b5ef5)" }}
            >
              Default'ga qaytarish
            </button>
          </div>

          {/* Sahifa qatorlari */}
          <div
            className="rounded-xl border divide-y"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-card-bg)",
            }}
          >
            {pages.map((pageKey) => {
              const actions = rolesInfo.actions[pageKey] || [];
              const viewKey = `${pageKey}|view`;
              const viewAllowed = draft[viewKey] ?? false;
              const isExpanded = expanded[pageKey];
              const hasExtraActions = actions.some((a) => a !== "view");

              return (
                <div key={pageKey} className="p-3" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        hasExtraActions
                          ? setExpanded((p) => ({ ...p, [pageKey]: !p[pageKey] }))
                          : undefined
                      }
                      className="flex-1 flex items-center gap-2 text-left"
                      disabled={!hasExtraActions}
                    >
                      {hasExtraActions ? (
                        isExpanded ? (
                          <ChevronDown size={16} style={{ color: "var(--text-secondary)" }} />
                        ) : (
                          <ChevronRight size={16} style={{ color: "var(--text-secondary)" }} />
                        )
                      ) : (
                        <span className="w-4" />
                      )}
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {labelPage(pageKey)}
                      </span>
                    </button>
                    <Toggle
                      checked={viewAllowed}
                      onChange={(v) => setValue(pageKey, "view", v)}
                      label="Ko'rish"
                    />
                  </div>

                  {/* Kollaps — action'lar */}
                  {isExpanded && hasExtraActions && (
                    <div
                      className="mt-3 ml-6 pl-3 border-l space-y-2"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {actions
                        .filter((a) => a !== "view")
                        .map((actionKey) => (
                          <div
                            key={actionKey}
                            className="flex items-center justify-between gap-3"
                          >
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-secondary)" }}
                            >
                              {labelAction(actionKey)}
                            </span>
                            <Toggle
                              checked={draft[`${pageKey}|${actionKey}`] ?? false}
                              onChange={(v) => setValue(pageKey, actionKey, v)}
                              disabled={!viewAllowed}
                              label={labelAction(actionKey)}
                            />
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Tugmalar */}
          <div
            className="flex items-center justify-end gap-2 pt-3 border-t"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Button variant="secondary" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
            >
              Saqlash
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── Toggle komponenti (light/dark mode mos) ──────────────────────────

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label: string;
}> = ({ checked, onChange, disabled, label }) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2"
      style={{
        backgroundColor: checked ? "#22c55e" : "var(--color-border)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full shadow transition-transform"
        style={{
          backgroundColor: "#ffffff",
          transform: checked ? "translateX(24px)" : "translateX(4px)",
        }}
      >
        {/* Kichik ikonka agar kerak bo'lsa */}
        {checked ? (
          <Check size={10} className="m-0.5" style={{ color: "#22c55e" }} />
        ) : (
          <XIcon size={10} className="m-0.5" style={{ color: "var(--text-secondary)" }} />
        )}
      </span>
    </button>
  );
};

// ─── Diff hisoblash: faqat default'dan farqli yozuvlarni entry qilish ─

function buildEntries(
  data: ManagerPermissionsResponse,
  rolesInfo: { defaults: Record<string, Record<string, Record<string, boolean>>> },
  draft: Record<string, boolean>
): PermissionEntry[] {
  const role = data.manager.role;
  const defaults = rolesInfo.defaults[role] || {};
  const entries: PermissionEntry[] = [];

  // Hamma draft entry'larni ko'rib chiqamiz va default bilan taqqoslaymiz
  const pageKeys = new Set<string>();
  for (const k of Object.keys(draft)) pageKeys.add(k.split("|")[0]);

  for (const pageKey of pageKeys) {
    const defaultActions = defaults[pageKey] || {};
    const actions = new Set<string>([...Object.keys(defaultActions)]);
    for (const k of Object.keys(draft)) {
      const [pk, ak] = k.split("|");
      if (pk === pageKey) actions.add(ak);
    }
    for (const actionKey of actions) {
      const key = `${pageKey}|${actionKey}`;
      const draftVal = draft[key];
      const defaultVal = defaultActions[actionKey] ?? false;
      if (draftVal === undefined) continue;
      if (draftVal === defaultVal) {
        // Default bilan mos — override'ni olib tashlash (agar oldin bor bo'lsa)
        const hadOverride = data.overrides.some(
          (o) => o.pageKey === pageKey && (o.actionKey ?? "view") === actionKey
        );
        if (hadOverride) {
          entries.push({ pageKey, actionKey: actionKey === "view" ? null : actionKey, allowed: null });
        }
      } else {
        // Default'dan farqli — override saqlash
        entries.push({
          pageKey,
          actionKey: actionKey === "view" ? null : actionKey,
          allowed: draftVal,
        });
      }
    }
  }

  return entries;
}

// ─── Bulk paneli — bir vaqtda hamma managerlarga override qo'llash ────

interface BulkPanelProps {
  role: "manager" | "rop";
  managerIds: string[];
  onClose: () => void;
}

const BulkPermissionsPanel: React.FC<BulkPanelProps> = ({ role, managerIds, onClose }) => {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draft, setDraft] = useState<Record<string, boolean>>({});
  const [initialDraft, setInitialDraft] = useState<Record<string, boolean>>({});

  const { data: rolesInfo } = useQuery({
    queryKey: ["permissions-roles"],
    queryFn: () => permissionsService.getRolesDefaults(),
  });

  // Rol default'idan boshlash — manager bulk uchun "manager" defaults, rop uchun "rop"
  useEffect(() => {
    if (!rolesInfo) return;
    const roleDefaults = rolesInfo.defaults[role];
    const d: Record<string, boolean> = {};
    for (const [pageKey, actions] of Object.entries(roleDefaults)) {
      for (const [actionKey, allowed] of Object.entries(actions)) {
        d[`${pageKey}|${actionKey}`] = allowed;
      }
    }
    setDraft(d);
    setInitialDraft(d);
  }, [rolesInfo, role]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!rolesInfo) return;
      // Faqat user o'zgartirgan yacheykalarni entry'ga aylantiramiz.
      // Boshqalari default holicha qoladi — har menejerda alohida tekshirilmaydi.
      const entries: PermissionEntry[] = [];
      for (const key of Object.keys(draft)) {
        if (draft[key] === initialDraft[key]) continue;
        const [pageKey, actionKey] = key.split("|");
        entries.push({
          pageKey,
          actionKey: actionKey === "view" ? null : actionKey,
          allowed: draft[key],
        });
      }
      if (entries.length === 0) {
        toast("O'zgarish yo'q");
        return;
      }
      await permissionsService.bulkUpdateManagerPermissions(managerIds, entries);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["permissions-manager"] });
      queryClient.invalidateQueries({ queryKey: ["my-permissions"] });
      toast.success(`${managerIds.length} ta menejerga qo'llandi`);
      onClose();
    },
    onError: () => {
      toast.error("Saqlashda xatolik");
    },
  });

  const setValue = (pageKey: string, actionKey: string, allowed: boolean) => {
    setDraft((prev) => {
      const next = { ...prev, [`${pageKey}|${actionKey}`]: allowed };
      if (actionKey === "view" && !allowed) {
        const actions = rolesInfo?.actions[pageKey as PageKey] || [];
        for (const a of actions) {
          if (a !== "view") next[`${pageKey}|${a}`] = false;
        }
      }
      return next;
    });
  };

  const pages = useMemo(() => rolesInfo?.pages || [], [rolesInfo]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Bulk ruxsatlar — ${managerIds.length} ta ${role === "rop" ? "ROP" : "menejer"}`}
      size="lg"
    >
      {!rolesInfo ? (
        <div className="py-8 text-center text-sm" style={{ color: "var(--text-secondary)" }}>
          Yuklanmoqda...
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className="rounded-lg px-3 py-2 text-xs"
            style={{
              backgroundColor: "var(--color-primary)",
              color: "var(--text-secondary)",
            }}
          >
            Bu o'zgarishlar <span className="font-medium" style={{ color: "var(--text-primary)" }}>
              {managerIds.length} ta {role === "rop" ? "ROP" : "menejer"}
            </span>ga bir vaqtda qo'llanadi.
            Faqat siz qo'lda almashtirgan toggle'lar yuboriladi — qolganlari o'zining default'ida qoladi.
          </div>

          <div
            className="rounded-xl border divide-y"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-card-bg)",
            }}
          >
            {pages.map((pageKey) => {
              const actions = rolesInfo.actions[pageKey] || [];
              const viewKey = `${pageKey}|view`;
              const viewAllowed = draft[viewKey] ?? false;
              const isExpanded = expanded[pageKey];
              const hasExtraActions = actions.some((a) => a !== "view");

              return (
                <div key={pageKey} className="p-3" style={{ borderColor: "var(--color-border)" }}>
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        hasExtraActions
                          ? setExpanded((p) => ({ ...p, [pageKey]: !p[pageKey] }))
                          : undefined
                      }
                      className="flex-1 flex items-center gap-2 text-left"
                      disabled={!hasExtraActions}
                    >
                      {hasExtraActions ? (
                        isExpanded ? (
                          <ChevronDown size={16} style={{ color: "var(--text-secondary)" }} />
                        ) : (
                          <ChevronRight size={16} style={{ color: "var(--text-secondary)" }} />
                        )
                      ) : (
                        <span className="w-4" />
                      )}
                      <span
                        className="text-sm font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {labelPage(pageKey)}
                      </span>
                      {draft[viewKey] !== initialDraft[viewKey] && (
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded ml-1"
                          style={{
                            backgroundColor: "var(--color-accent, #3b5ef5)",
                            color: "#fff",
                          }}
                        >
                          o'zgartirildi
                        </span>
                      )}
                    </button>
                    <Toggle
                      checked={viewAllowed}
                      onChange={(v) => setValue(pageKey, "view", v)}
                      label="Ko'rish"
                    />
                  </div>

                  {isExpanded && hasExtraActions && (
                    <div
                      className="mt-3 ml-6 pl-3 border-l space-y-2"
                      style={{ borderColor: "var(--color-border)" }}
                    >
                      {actions
                        .filter((a) => a !== "view")
                        .map((actionKey) => {
                          const k = `${pageKey}|${actionKey}`;
                          const changed = draft[k] !== initialDraft[k];
                          return (
                            <div
                              key={actionKey}
                              className="flex items-center justify-between gap-3"
                            >
                              <span
                                className="text-xs flex items-center gap-1.5"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                {labelAction(actionKey)}
                                {changed && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded"
                                    style={{
                                      backgroundColor: "var(--color-accent, #3b5ef5)",
                                      color: "#fff",
                                    }}
                                  >
                                    o'zgartirildi
                                  </span>
                                )}
                              </span>
                              <Toggle
                                checked={draft[k] ?? false}
                                onChange={(v) => setValue(pageKey, actionKey, v)}
                                disabled={!viewAllowed}
                                label={labelAction(actionKey)}
                              />
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div
            className="flex items-center justify-end gap-2 pt-3 border-t"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Button variant="secondary" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              loading={saveMutation.isPending}
            >
              {managerIds.length} ta menejerga qo'llash
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default PermissionsTab;
