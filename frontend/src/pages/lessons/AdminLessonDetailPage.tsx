import React, { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Edit2,
  Save,
  X,
  UserPlus,
  UserMinus,
  Upload,
  Clock,
  HardDrive,
  Search,
  Circle,
  ArrowLeftCircle,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import {
  lessonsService,
  LessonDetailAdmin,
  TestQuestion,
  LessonProgressRow,
} from "../../services/lessons.service";
import { managersService } from "../../services/managers.service";

const fmtDuration = (sec: number): string => {
  if (!sec) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}` : `${m} daq`;
};

const StatusLabel: React.FC<{ status: string }> = ({ status }) => {
  const cfg =
    status === "ready"
      ? { Icon: CheckCircle2, color: "#10b981", text: "Tayyor" }
      : status === "processing"
      ? { Icon: Loader2, color: "#f59e0b", text: "Tayyorlanmoqda" }
      : { Icon: AlertCircle, color: "#ef4444", text: "Xato" };
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold"
      style={{ color: cfg.color, backgroundColor: `${cfg.color}1a` }}
    >
      <cfg.Icon size={12} className={status === "processing" ? "animate-spin" : ""} />
      {cfg.text}
    </span>
  );
};

const TestQuestionEditor: React.FC<{
  q: TestQuestion;
  idx: number;
  onChange: (q: TestQuestion) => void;
  onRemove: () => void;
}> = ({ q, idx, onChange, onRemove }) => {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        backgroundColor: "var(--color-primary-bg)",
        border: "1px solid var(--color-border)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "#3b82f622",
            color: "#3b82f6",
          }}
        >
          Savol #{idx + 1}
        </span>
        <button
          onClick={onRemove}
          className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10"
          title="O'chirish"
        >
          <X size={14} />
        </button>
      </div>
      <textarea
        value={q.q}
        onChange={(e) => onChange({ ...q, q: e.target.value })}
        rows={2}
        className="w-full mb-2 px-2 py-1.5 rounded text-sm focus:outline-none focus:border-blue-500"
        style={{
          backgroundColor: "var(--color-card-bg)",
          color: "var(--text-primary)",
          border: "1px solid var(--color-border)",
        }}
      />
      <div className="space-y-2">
        {q.options.map((opt, i) => {
          const isCorrect = q.correctIdx === i;
          return (
            <div
              key={i}
              className="flex items-center gap-2 rounded-lg transition-colors cursor-pointer p-1.5"
              onClick={() => onChange({ ...q, correctIdx: i })}
              style={{
                backgroundColor: isCorrect ? "#10b98111" : "transparent",
                border: `1px solid ${isCorrect ? "#10b98155" : "transparent"}`,
              }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange({ ...q, correctIdx: i });
                }}
                className="flex items-center justify-center flex-shrink-0"
                title="To'g'ri javob deb belgilash"
              >
                {isCorrect ? (
                  <CheckCircle2 size={22} style={{ color: "#10b981" }} />
                ) : (
                  <Circle size={22} style={{ color: "var(--text-secondary)" }} />
                )}
              </button>
              <input
                value={opt}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  const next = [...q.options];
                  next[i] = e.target.value;
                  onChange({ ...q, options: next });
                }}
                className="flex-1 px-2 py-1.5 rounded text-sm focus:outline-none focus:border-blue-500"
                style={{
                  backgroundColor: "var(--color-card-bg)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--color-border)",
                }}
              />
            </div>
          );
        })}
      </div>
      <textarea
        value={q.explanation || ""}
        onChange={(e) => onChange({ ...q, explanation: e.target.value })}
        placeholder="Izoh (to'g'ri javob sababi)"
        rows={2}
        className="w-full mt-2 px-2 py-1.5 rounded text-xs focus:outline-none resize-y"
        style={{
          backgroundColor: "var(--color-card-bg)",
          color: "var(--text-secondary)",
          border: "1px solid var(--color-border)",
          wordBreak: "break-word",
        }}
      />
    </div>
  );
};

const AssignPanel: React.FC<{ lessonId: string; existing: LessonDetailAdmin["assignments"] }> = ({
  lessonId,
  existing,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: managers } = useQuery({
    queryKey: ["managers-for-assign"],
    queryFn: () => managersService.getAll(),
  });

  const assignedIds = new Set(existing.map((a) => a.managerId));

  const assignMutation = useMutation({
    mutationFn: (managerIds: string[]) => lessonsService.assign(lessonId, managerIds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-lesson", lessonId] }),
  });
  const unassignMutation = useMutation({
    mutationFn: (mgrId: string) => lessonsService.unassign(lessonId, mgrId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-lesson", lessonId] }),
  });

  // Faqat faol managerlarni ko'rsatamiz
  const activeMgrs = (managers || []).filter((m: any) => m.isActive !== false);
  const candidates = activeMgrs.filter((m: any) =>
    search ? m.name?.toLowerCase().includes(search.toLowerCase()) : true
  );
  const assignedCount = existing.length;
  const totalCount = activeMgrs.length;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-lg" style={{ color: "var(--text-primary)" }}>
          Tayinlash
        </h3>
        <span
          className="text-xs px-2 py-1 rounded-full font-semibold"
          style={{
            backgroundColor: assignedCount === totalCount && totalCount > 0
              ? "#10b98122"
              : "#3b82f622",
            color: assignedCount === totalCount && totalCount > 0 ? "#10b981" : "#3b82f6",
          }}
        >
          {assignedCount} / {totalCount}
        </span>
      </div>

      {totalCount > 0 && (
        <button
          onClick={() => {
            const unassigned = activeMgrs.filter((m: any) => !assignedIds.has(m.id)).map((m: any) => m.id);
            if (unassigned.length > 0) assignMutation.mutate(unassigned);
          }}
          disabled={assignedCount === totalCount || assignMutation.isPending}
          className="w-full mb-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: "#10b981", color: "#fff" }}
        >
          <UserPlus size={14} className="inline mr-1" />
          Barchasiga tayinlash
        </button>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search
          size={14}
          className="absolute left-2.5 top-1/2 -translate-y-1/2"
          style={{ color: "var(--text-secondary)" }}
        />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Qidirish..."
          className="w-full pl-8 pr-3 py-2 rounded-lg text-sm focus:outline-none focus:border-blue-500"
          style={{
            backgroundColor: "var(--color-primary-bg)",
            color: "var(--text-primary)",
            border: "1px solid var(--color-border)",
          }}
        />
      </div>

      {/* Managers list */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {candidates.length === 0 && (
          <p className="text-sm text-center py-4" style={{ color: "var(--text-secondary)" }}>
            {activeMgrs.length === 0 ? "Aktiv manager yo'q" : "Topilmadi"}
          </p>
        )}
        {candidates.map((m: any) => {
          const already = assignedIds.has(m.id);
          return (
            <div
              key={m.id}
              className="flex items-center justify-between p-3 rounded-xl transition-all"
              style={{
                border: `1px solid ${already ? "#3b82f655" : "var(--color-border)"}`,
                backgroundColor: already ? "#3b82f611" : "var(--color-primary-bg)",
              }}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                {m.photoUrl ? (
                  <img
                    src={m.photoUrl}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ backgroundColor: "#3b82f633", color: "#3b82f6" }}
                  >
                    {(m.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div
                    className="text-sm font-semibold truncate"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {m.name}
                  </div>
                  <div
                    className="text-xs truncate"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {m.role}
                    {already && " · tayinlangan"}
                  </div>
                </div>
              </div>
              {already ? (
                <button
                  onClick={() => unassignMutation.mutate(m.id)}
                  className="flex items-center justify-center w-8 h-8 rounded-lg transition-transform hover:scale-110"
                  style={{ backgroundColor: "#ef444422", color: "#ef4444" }}
                  title="Bekor qilish"
                >
                  <UserMinus size={15} />
                </button>
              ) : (
                <button
                  onClick={() => assignMutation.mutate([m.id])}
                  className="flex items-center justify-center w-8 h-8 rounded-lg transition-transform hover:scale-110"
                  style={{ backgroundColor: "#10b98122", color: "#10b981" }}
                  title="Tayinlash"
                >
                  <UserPlus size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ProgressTable: React.FC<{ lessonId: string }> = ({ lessonId }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["lesson-progress", lessonId],
    queryFn: () => lessonsService.progress(lessonId),
    refetchInterval: 10000,
  });

  if (isLoading)
    return <p className="text-sm" style={{ color: "var(--text-secondary)" }}>Yuklanmoqda...</p>;
  const rows = data?.rows || [];
  if (rows.length === 0)
    return (
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Hali hech kim tayinlanmagan
      </p>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr
            className="text-left text-xs"
            style={{
              color: "var(--text-secondary)",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <th className="py-2">Manager</th>
            <th className="py-2">Video</th>
            <th className="py-2">Test</th>
            <th className="py-2">AI</th>
            <th className="py-2">Yakuniy</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r: LessonProgressRow) => (
            <tr
              key={r.managerId}
              style={{ borderBottom: "1px solid var(--color-border)" }}
            >
              <td className="py-2" style={{ color: "var(--text-primary)" }}>
                {r.managerName}
              </td>
              <td className="py-2">
                {r.videoCompleted ? (
                  <span style={{ color: "#10b981" }}>✓</span>
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>—</span>
                )}
              </td>
              <td className="py-2">
                {r.testPassed ? (
                  <span style={{ color: "#10b981" }}>
                    {r.testBestScore != null ? `${Math.round(r.testBestScore)}%` : "✓"}
                  </span>
                ) : r.testBestScore != null ? (
                  <span style={{ color: "#f59e0b" }}>{Math.round(r.testBestScore)}%</span>
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>—</span>
                )}
              </td>
              <td className="py-2">
                {r.aiScore != null ? (
                  <span style={{ color: "var(--text-primary)" }}>{Math.round(r.aiScore)}%</span>
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>{r.aiStatus}</span>
                )}
              </td>
              <td className="py-2 font-bold">
                {r.finalScore != null ? (
                  <span style={{ color: r.finalScore >= 85 ? "#10b981" : "#f59e0b" }}>
                    {Math.round(r.finalScore)}%
                  </span>
                ) : (
                  <span style={{ color: "var(--text-secondary)" }}>—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const AdminLessonDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingTests, setEditingTests] = useState(false);
  const [draftTests, setDraftTests] = useState<TestQuestion[]>([]);
  const [replaceProgress, setReplaceProgress] = useState(0);
  const replaceInput = useRef<HTMLInputElement | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [cancelEditModalOpen, setCancelEditModalOpen] = useState(false);
  const [hasEditChanges, setHasEditChanges] = useState(false);

  const { data: lesson, isLoading, isError } = useQuery({
    queryKey: ["admin-lesson", id],
    queryFn: () => lessonsService.get(id!),
    enabled: !!id,
    refetchInterval: (query) => {
      const d = query.state.data as LessonDetailAdmin | undefined;
      return d?.status === "processing" ? 5000 : false;
    },
  });

  const saveTestsMutation = useMutation({
    mutationFn: (testQuestions: TestQuestion[]) =>
      lessonsService.update(id!, { testQuestions }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-lesson", id] });
      setEditingTests(false);
    },
  });

  const reprocessMutation = useMutation({
    mutationFn: () => lessonsService.reprocess(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-lesson", id] }),
  });
  const deleteMutation = useMutation({
    mutationFn: () => lessonsService.remove(id!),
    onSuccess: () => navigate("/admin/lessons"),
  });

  const replaceMutation = useMutation({
    mutationFn: (file: File) =>
      lessonsService.replaceVideo(id!, file, (p) => setReplaceProgress(p)),
    onSuccess: () => {
      setReplaceProgress(0);
      queryClient.invalidateQueries({ queryKey: ["admin-lesson", id] });
    },
  });

  if (isLoading)
    return (
      <div className="p-6 text-sm" style={{ color: "var(--text-secondary)" }}>
        Yuklanmoqda...
      </div>
    );
  if (isError || !lesson)
    return <div className="p-6 text-sm text-red-400">Darslik topilmadi</div>;

  const tests: TestQuestion[] = lesson.testQuestions || [];

  return (
    <div className="max-w-7xl mx-auto">
      <button
        onClick={() => navigate("/admin/lessons")}
        className="inline-flex items-center gap-2 text-sm mb-3 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-secondary)" }}
      >
        <ArrowLeft size={16} />
        Darsliklar
      </button>

      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-5 gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <h1
              className="text-xl md:text-2xl font-bold break-words"
              style={{ color: "var(--text-primary)" }}
            >
              {lesson.title}
            </h1>
            <StatusLabel status={lesson.status} />
          </div>
          {lesson.description && (
            <p className="text-sm max-w-3xl mb-2" style={{ color: "var(--text-secondary)" }}>
              {lesson.description}
            </p>
          )}
          <div
            className="flex items-center gap-3 text-xs flex-wrap"
            style={{ color: "var(--text-secondary)" }}
          >
            <span
              className="px-2 py-1 rounded-md font-mono font-semibold"
              style={{
                backgroundColor: "#3b82f622",
                color: "#3b82f6",
              }}
            >
              #{lesson.sortOrder + 1}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock size={12} />
              {fmtDuration(lesson.videoDurationSec)}
            </span>
            <span className="inline-flex items-center gap-1">
              <HardDrive size={12} />
              {(Number(lesson.videoSizeBytes) / 1024 / 1024).toFixed(0)} MB
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap md:flex-nowrap">
          {lesson.status === "ready" && (
            <>
              <input
                ref={replaceInput}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f && window.confirm(
                    "Videoni almashtirasizmi? Test va progress ma'lumotlari qayta yaratiladi."
                  )) {
                    replaceMutation.mutate(f);
                  }
                }}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => replaceInput.current?.click()}
                loading={replaceMutation.isPending}
              >
                <Upload size={14} />
                Video almashtirish
              </Button>
            </>
          )}
          {lesson.status === "failed" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => reprocessMutation.mutate()}
              loading={reprocessMutation.isPending}
            >
              <RefreshCw size={14} />
              Qayta boshlash
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={() => setDeleteModalOpen(true)}
            loading={deleteMutation.isPending}
          >
            <Trash2 size={14} />
            O'chirish
          </Button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteModalOpen}
        onClose={() => setDeleteModalOpen(false)}
        title="Darslikni o'chirish"
        size="sm"
      >
        <div>
          <div
            className="flex items-start gap-3 p-3 rounded-lg mb-4"
            style={{ backgroundColor: "#ef444411", border: "1px solid #ef444433" }}
          >
            <AlertCircle
              size={20}
              className="flex-shrink-0 mt-0.5"
              style={{ color: "#ef4444" }}
            />
            <div>
              <p className="font-medium text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                Bu amalni qaytarib bo'lmaydi
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                "<strong>{lesson.title}</strong>" darsligi, video fayl, testlar va
                barcha managerlar progressi o'chiriladi.
              </p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteModalOpen(false)}>
              Bekor qilish
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                deleteMutation.mutate();
                setDeleteModalOpen(false);
              }}
              loading={deleteMutation.isPending}
            >
              <Trash2 size={14} />
              Ha, o'chirish
            </Button>
          </div>
        </div>
      </Modal>

      {/* Cancel edit confirmation modal */}
      <Modal
        isOpen={cancelEditModalOpen}
        onClose={() => setCancelEditModalOpen(false)}
        title="Tahrirni bekor qilish"
        size="sm"
      >
        <div>
          <p className="text-sm mb-4" style={{ color: "var(--text-primary)" }}>
            Saqlanmagan o'zgarishlar yo'qoladi va savollar AI yaratgan holiga qaytadi. Davom etasizmi?
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={() => setCancelEditModalOpen(false)}>
              Yo'q, davom etaman
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setEditingTests(false);
                setHasEditChanges(false);
                setCancelEditModalOpen(false);
              }}
            >
              <ArrowLeftCircle size={14} />
              Ha, bekor qilish
            </Button>
          </div>
        </div>
      </Modal>

      {replaceMutation.isPending && (
        <div
          className="mb-4 p-3 rounded-lg border-l-4"
          style={{ backgroundColor: "#3b82f611", borderColor: "#3b82f6" }}
        >
          <div className="flex items-center justify-between text-sm mb-1" style={{ color: "#3b82f6" }}>
            <span>Video yuklanmoqda...</span>
            <span className="font-mono">{replaceProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/10 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{ width: `${replaceProgress}%`, backgroundColor: "#3b82f6" }}
            />
          </div>
        </div>
      )}

      {lesson.status === "processing" && (
        <div
          className="mb-4 p-4 rounded-xl border-l-4 flex items-center gap-3"
          style={{
            backgroundColor: "#f59e0b11",
            borderColor: "#f59e0b",
            color: "#f59e0b",
          }}
        >
          <Loader2 size={20} className="animate-spin" />
          <div>
            <div className="font-medium">Tayyorlanmoqda...</div>
            <div className="text-xs opacity-70">
              STT + test generatsiyasi 5-20 daq oladi. Sahifa avtomatik yangilanadi.
            </div>
          </div>
        </div>
      )}

      {lesson.status === "failed" && lesson.processingError && (
        <div
          className="mb-4 p-3 rounded-lg border-l-4 text-sm"
          style={{
            backgroundColor: "#ef444411",
            borderColor: "#ef4444",
            color: "#ef4444",
          }}
        >
          <div className="font-semibold mb-1">Xatolik:</div>
          {lesson.processingError}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          {/* Video preview */}
          {lesson.status === "ready" && (
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--color-card-bg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h3
                className="font-semibold text-lg mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Video preview
              </h3>
              <video
                src={lessonsService.adminVideoStreamUrl(
                  id!,
                  localStorage.getItem("token") || ""
                )}
                controls
                preload="metadata"
                className="w-full max-h-[50vh] rounded-lg bg-black/40"
              />
            </div>
          )}

          {/* Testlar */}
          <div
            className="rounded-xl p-4"
            style={{
              backgroundColor: "var(--color-card-bg)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h3
                className="font-semibold text-lg"
                style={{ color: "var(--text-primary)" }}
              >
                Testlar{" "}
                <span
                  className="text-xs font-normal ml-1 px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: "#3b82f622",
                    color: "#3b82f6",
                  }}
                >
                  {tests.length}
                </span>
              </h3>
              {lesson.status === "ready" && tests.length > 0 && (
                editingTests ? (
                  <div className="flex gap-1.5 flex-wrap">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        if (hasEditChanges) {
                          setCancelEditModalOpen(true);
                        } else {
                          setEditingTests(false);
                        }
                      }}
                    >
                      <ArrowLeftCircle size={14} />
                      Orqaga
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => {
                        saveTestsMutation.mutate(draftTests);
                        setHasEditChanges(false);
                      }}
                      loading={saveTestsMutation.isPending}
                      disabled={!hasEditChanges}
                    >
                      <Save size={14} />
                      Saqlash
                    </Button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setDraftTests(JSON.parse(JSON.stringify(tests)));
                      setHasEditChanges(false);
                      setEditingTests(true);
                    }}
                  >
                    <Edit2 size={14} />
                    Tahrirlash
                  </Button>
                )
              )}
            </div>
            {tests.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {lesson.status === "ready"
                  ? "Test yo'q. Qayta tayyorlashga urinib ko'ring."
                  : "Testlar tayyorlanmoqda..."}
              </p>
            ) : editingTests ? (
              <div className="space-y-2">
                {draftTests.map((q, i) => (
                  <TestQuestionEditor
                    key={i}
                    q={q}
                    idx={i}
                    onChange={(newQ) => {
                      const next = [...draftTests];
                      next[i] = newQ;
                      setDraftTests(next);
                      setHasEditChanges(true);
                    }}
                    onRemove={() => {
                      setDraftTests(draftTests.filter((_, idx) => idx !== i));
                      setHasEditChanges(true);
                    }}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {tests.map((q, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3 text-sm"
                    style={{
                      backgroundColor: "var(--color-primary-bg)",
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    <div
                      className="font-medium mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      <span
                        className="font-mono text-xs mr-2 px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: "#3b82f622",
                          color: "#3b82f6",
                        }}
                      >
                        #{i + 1}
                      </span>
                      {q.q}
                    </div>
                    <div className="space-y-1.5">
                      {q.options.map((opt, j) => {
                        const isCorrect = q.correctIdx === j;
                        return (
                          <div
                            key={j}
                            className="flex items-start gap-2 p-1.5 rounded-lg"
                            style={{
                              backgroundColor: isCorrect ? "#10b98111" : "transparent",
                              border: `1px solid ${isCorrect ? "#10b98133" : "transparent"}`,
                            }}
                          >
                            {isCorrect ? (
                              <CheckCircle2
                                size={20}
                                style={{ color: "#10b981" }}
                                className="flex-shrink-0 mt-0.5"
                              />
                            ) : (
                              <Circle
                                size={20}
                                style={{ color: "var(--text-secondary)" }}
                                className="flex-shrink-0 mt-0.5"
                              />
                            )}
                            <span
                              className="text-sm"
                              style={{
                                color: isCorrect ? "#10b981" : "var(--text-primary)",
                                fontWeight: isCorrect ? 600 : 400,
                                wordBreak: "break-word",
                              }}
                            >
                              {opt}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {q.explanation && (
                      <div
                        className="mt-3 pt-2 text-xs"
                        style={{
                          borderTop: "1px solid var(--color-border)",
                          color: "var(--text-secondary)",
                          wordBreak: "break-word",
                          whiteSpace: "pre-wrap",
                          lineHeight: 1.6,
                        }}
                      >
                        <span style={{ fontWeight: 600, color: "#3b82f6" }}>💡 Izoh: </span>
                        {q.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Progress */}
          {lesson.status === "ready" && (
            <div
              className="rounded-xl p-4"
              style={{
                backgroundColor: "var(--color-card-bg)",
                border: "1px solid var(--color-border)",
              }}
            >
              <h3
                className="font-semibold text-lg mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Managerlar progressi
              </h3>
              <ProgressTable lessonId={id!} />
            </div>
          )}
        </div>

        {/* Right column — assign (sticky, matches left height) */}
        <div
          className="lg:sticky rounded-xl p-4 flex flex-col"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "1px solid var(--color-border)",
            top: "1rem",
            maxHeight: "calc(100vh - 2rem)",
          }}
        >
          <AssignPanel lessonId={id!} existing={lesson.assignments} />
        </div>
      </div>
    </div>
  );
};

export default AdminLessonDetailPage;
