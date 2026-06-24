import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Send, Sparkles, Users, User, Building2 } from "lucide-react";
import api from "../../services/api";
import { ApiResponse } from "../../types";
import { announcementsService, AnnouncementKind } from "../../services/announcements.service";
import { managersService } from "../../services/managers.service";
import TelegramEditor, { renderTelegramMarkdown } from "../../components/TelegramEditor";
import { useAuth } from "../../store/authStore";

const KIND_OPTIONS: Array<{ value: AnnouncementKind; label: string; color: string }> = [
  { value: "motivation", label: "Motivatsiya", color: "bg-amber-500" },
  { value: "encouragement", label: "Rag'bat", color: "bg-blue-500" },
  { value: "celebration", label: "Tabrik", color: "bg-emerald-500" },
  { value: "announcement", label: "E'lon", color: "bg-slate-500" },
];

const AnnouncementsPage: React.FC = () => {
  const qc = useQueryClient();
  const { userRole } = useAuth();
  const isAdmin = userRole === "company";

  const [kind, setKind] = useState<AnnouncementKind>("motivation");
  const [targetType, setTargetType] = useState<"manager" | "department" | "all">("all");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  const { data: managers } = useQuery({
    queryKey: ["managers-list"],
    queryFn: managersService.getAll,
    enabled: isAdmin,
  });

  const { data: depts } = useQuery({
    queryKey: ["departments-all"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ departments: Array<{ id: string; name: string }> }>>(
        "/departments/all",
      );
      return data.data.departments;
    },
    enabled: isAdmin,
  });

  const { data: history } = useQuery({
    queryKey: ["announcements"],
    queryFn: announcementsService.list,
  });

  const send = useMutation({
    mutationFn: () =>
      announcementsService.send({
        kind,
        targetType,
        targetId,
        title: title || undefined,
        body,
      }),
    onSuccess: (data) => {
      toast.success(`Yuborildi: ${data.recipients} ta menejer`);
      setTitle("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: () => toast.error("Xatolik"),
  });

  const aiGen = useMutation({
    mutationFn: () => announcementsService.aiGenerate({ kind, targetType, targetId }),
    onSuccess: (data) => {
      setBody(data.body);
      toast.success("AI matn tayyor");
    },
    onError: () => toast.error("AI generatsiya xato"),
  });

  if (!isAdmin) {
    return <AnnouncementFeed history={history || []} />;
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="text-2xl font-bold">Habarlar</h1>
        <p className="text-sm text-secondary mt-1">
          Saytdan va botdan menejerlarga motivatsiya, rag'bat yoki e'lon yuboring.
        </p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        {/* Kind */}
        <div>
          <div className="text-xs text-secondary mb-2">Habar turi</div>
          <div className="flex flex-wrap gap-2">
            {KIND_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setKind(opt.value)}
                className={`px-3 py-2 rounded-xl text-sm border transition-colors flex items-center gap-2 ${
                  kind === opt.value
                    ? "border-accent bg-accent/5"
                    : "border-border hover:border-accent/50"
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${opt.color}`} />
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target */}
        <div>
          <div className="text-xs text-secondary mb-2">Kimga</div>
          <div className="flex flex-wrap gap-2 mb-2">
            <TargetBtn
              icon={<Users size={14} />}
              label="Hammaga"
              active={targetType === "all"}
              onClick={() => {
                setTargetType("all");
                setTargetId(null);
              }}
            />
            <TargetBtn
              icon={<Building2 size={14} />}
              label="Bo'lim"
              active={targetType === "department"}
              onClick={() => {
                setTargetType("department");
                setTargetId(depts?.[0]?.id || null);
              }}
            />
            <TargetBtn
              icon={<User size={14} />}
              label="Bitta menejer"
              active={targetType === "manager"}
              onClick={() => {
                setTargetType("manager");
                setTargetId(managers?.[0]?.id || null);
              }}
            />
          </div>
          {targetType === "department" && (
            <select
              value={targetId || ""}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full md:w-80 px-3 py-2 rounded-lg border border-border bg-primary text-sm"
            >
              {(depts || []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          {targetType === "manager" && (
            <select
              value={targetId || ""}
              onChange={(e) => setTargetId(e.target.value)}
              className="w-full md:w-80 px-3 py-2 rounded-lg border border-border bg-primary text-sm"
            >
              {(managers || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Title */}
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sarlavha (ixtiyoriy)"
          className="w-full px-3 py-2 rounded-lg border border-border bg-primary text-sm font-medium"
        />

        {/* Body editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-secondary">Matn (Telegram Markdown qo'llab-quvvatlanadi)</div>
            <button
              onClick={() => aiGen.mutate()}
              disabled={aiGen.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-accent/10 text-accent hover:bg-accent/20"
            >
              <Sparkles size={12} />
              {aiGen.isPending ? "Generatsiya..." : "AI generatsiya"}
            </button>
          </div>
          <TelegramEditor value={body} onChange={setBody} placeholder="Matningiz..." />
        </div>

        {/* Preview */}
        {body && (
          <div>
            <div className="text-xs text-secondary mb-2">Ko'rinishi</div>
            <div
              className="p-4 border border-border rounded-xl bg-primary/30 text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderTelegramMarkdown(body) }}
            />
          </div>
        )}

        <button
          onClick={() => send.mutate()}
          disabled={!body.trim() || send.isPending}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-xl hover:opacity-90 disabled:opacity-50"
        >
          <Send size={16} />
          {send.isPending ? "Yuborilmoqda..." : "Saytda va botda yuborish"}
        </button>
      </div>

      {/* History */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <h3 className="text-lg font-semibold mb-3">Yuborilganlar</h3>
        <AnnouncementFeed history={history || []} compact />
      </div>
    </div>
  );
};

const TargetBtn: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}> = ({ icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 rounded-xl text-sm border transition-colors flex items-center gap-1.5 ${
      active ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
    }`}
  >
    {icon}
    {label}
  </button>
);

const AnnouncementFeed: React.FC<{ history: any[]; compact?: boolean }> = ({ history, compact }) => {
  if (history.length === 0) {
    return <div className="text-sm text-secondary p-4 text-center">Hozircha habar yo'q</div>;
  }
  return (
    <div className="space-y-3">
      {history.map((a) => {
        const opt = KIND_OPTIONS.find((o) => o.value === a.kind);
        return (
          <div
            key={a.id}
            className={`p-4 rounded-xl border ${compact ? "border-border" : "border-border"} bg-primary/30`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${opt?.color || "bg-slate-500"}`} />
                <span className="text-xs font-medium">{opt?.label || a.kind}</span>
                {a.isAI && (
                  <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded">AI</span>
                )}
              </div>
              <span className="text-[11px] text-secondary">
                {new Date(a.createdAt).toLocaleString("uz-UZ")}
              </span>
            </div>
            {a.title && <div className="font-semibold mb-1">{a.title}</div>}
            <div
              className="text-sm leading-relaxed"
              dangerouslySetInnerHTML={{ __html: renderTelegramMarkdown(a.body) }}
            />
            <div className="text-[11px] text-secondary mt-2">
              {a.targetType === "all"
                ? "Hammaga"
                : a.targetType === "department"
                ? "Bo'limga"
                : "Menejerga"}{" "}
              · {a.recipientIds.length} oluvchi
              {a.sentToTelegram ? " · Telegram ✓" : ""}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AnnouncementsPage;
