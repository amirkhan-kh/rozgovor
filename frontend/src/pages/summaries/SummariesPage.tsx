import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, ChevronLeft, ChevronRight, FileText, Clock, CheckCircle, AlertCircle, Trash2 } from "lucide-react";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import { summariesService } from "../../services/summaries.service";

const formatMarkdown = (text: string): string => {
  // 1. Avval jadvallarni qayta ishlash (ularni placeholder bilan almashtirib, keyin qaytarish)
  const tables: string[] = [];
  const processedForTables = text.replace(
    /((?:^\|.+\|\s*\n)+)/gm,
    (block) => {
      const lines = block.trim().split("\n").filter(Boolean);
      if (lines.length < 2) return block;

      // Parsing: har qator | cell | cell | shaklida
      const parseRow = (line: string): string[] =>
        line
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());

      const headerCells = parseRow(lines[0]);
      const separatorCells = parseRow(lines[1]);
      // Tekshirish: separator qatori "---" yoki ":---" bo'lishi kerak
      const isSeparator = separatorCells.every((c) => /^:?-+:?$/.test(c));
      if (!isSeparator) return block;

      const bodyRows = lines.slice(2).map(parseRow);

      const thead = `<thead><tr>${headerCells
        .map(
          (h) =>
            `<th style="padding:10px 12px;text-align:left;font-weight:700;font-size:13px;border-bottom:2px solid var(--color-border);background:rgba(59,94,245,0.06);color:var(--text-primary,#fff)">${inlineFormat(h)}</th>`
        )
        .join("")}</tr></thead>`;

      const tbody = `<tbody>${bodyRows
        .map(
          (row) =>
            `<tr style="border-bottom:1px solid var(--color-border)">${row
              .map(
                (cell) =>
                  `<td style="padding:10px 12px;font-size:13px;vertical-align:top;color:var(--text-secondary)">${inlineFormat(cell)}</td>`
              )
              .join("")}</tr>`
        )
        .join("")}</tbody>`;

      const tableHtml = `<div style="margin:14px 0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;border:1px solid var(--color-border);border-radius:8px;overflow:hidden">${thead}${tbody}</table></div>`;
      tables.push(tableHtml);
      return `\u0000TABLE${tables.length - 1}\u0000`;
    }
  );

  // 2. Inline formatlash (bold, italic va h.k.)
  function inlineFormat(s: string): string {
    return s
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color: var(--text-primary, #fff)">$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  }

  // 3. Qolgan formatlash
  let html = processedForTables
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: var(--text-primary, #fff)">$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:16px;font-weight:700;margin:16px 0 8px;color:var(--text-primary,#fff)">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:18px;font-weight:700;margin:20px 0 8px;color:var(--text-primary,#fff)">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:20px;font-weight:700;margin:20px 0 8px;color:var(--text-primary,#fff)">$1</h1>')
    .replace(/^(\d+)\.\s+(.+)$/gm, '<div style="display:flex;gap:8px;margin:6px 0;padding-left:4px"><span style="color:#3b5ef5;font-weight:600;min-width:20px">$1.</span><span>$2</span></div>')
    .replace(/^[-*]\s+(.+)$/gm, '<div style="display:flex;gap:8px;margin:4px 0;padding-left:8px"><span style="color:#3b5ef5">•</span><span>$1</span></div>')
    .replace(/\n\n/g, '<div style="height:12px"></div>')
    .replace(/\n/g, '<br/>');

  // 4. Jadvallarni qaytarish
  html = html.replace(/\u0000TABLE(\d+)\u0000/g, (_, idx) => tables[Number(idx)]);

  return html;
};

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  done: { icon: <CheckCircle size={14} />, label: "Tayyor", color: "#10b981" },
  pending: { icon: <Clock size={14} />, label: "Kutilmoqda", color: "#f59e0b" },
  error: { icon: <AlertCircle size={14} />, label: "Xatolik", color: "#ef4444" },
};

const typeLabels: Record<string, string> = {
  bugungi: "Bugungi",
  haftalik: "Haftalik",
  oylik: "Oylik",
  boshqa: "Maxsus davr",
};

const SummariesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState("bugungi");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: summaries, isLoading } = useQuery({
    queryKey: ["summaries"],
    queryFn: summariesService.getAll,
  });

  const { data: selectedSummary } = useQuery({
    queryKey: ["summary", selectedId],
    queryFn: () => summariesService.getOne(selectedId!),
    enabled: !!selectedId,
    refetchInterval: (query) =>
      query.state.data?.status === "pending" ? 3000 : false,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => summariesService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summaries"] });
      toast.success("Xulosa o'chirildi");
      if (selectedId === deleteId) setSelectedId(null);
      setDeleteId(null);
    },
    onError: () => toast.error("O'chirishda xatolik"),
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      summariesService.generate({ type, periodFrom, periodTo }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["summaries"] });
      toast.success("Xulosa yaratish boshlandi");
      setShowModal(false);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const handleSelect = (id: string) => setSelectedId(id);
  const handleBack = () => setSelectedId(null);

  // Mobile: list yoki detail ko'rsatish
  const showDetailMobile = !!selectedId;

  return (
    <div className="space-y-4 overflow-hidden pb-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Tahlil Xulosalari</h3>
          <p className="text-xs text-secondary mt-0.5">{summaries?.length || 0} ta xulosa</p>
        </div>
        <Button onClick={() => setShowModal(true)} className="gap-1.5">
          <Plus size={16} />
          <span className="hidden sm:inline">Yangi xulosa</span>
          <span className="sm:hidden">Yangi</span>
        </Button>
      </div>

      {/* Main content: Desktop = side by side, Mobile = toggle */}
      <div className="flex gap-4" style={{ minHeight: "calc(100vh - 200px)" }}>

        {/* ── List panel ────────────────────────────── */}
        <div className={`w-full lg:w-80 xl:w-96 flex-shrink-0 ${showDetailMobile ? "hidden lg:block" : "block"}`}>
          <Card className="h-full">
            {isLoading ? (
              <div className="space-y-2 p-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="p-3 rounded-xl" style={{ opacity: 1 - i * 0.15 }}>
                    <Skeleton className="h-4 w-28 mb-2" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                ))}
              </div>
            ) : summaries && summaries.length > 0 ? (
              <div className="space-y-1 p-1">
                {summaries.map((s) => {
                  const sc = statusConfig[s.status] || statusConfig.pending;
                  const isSelected = selectedId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSelect(s.id)}
                      className={`group w-full text-left p-3 rounded-xl transition-all ${
                        isSelected
                          ? "bg-accent/10 border border-accent/30"
                          : "hover:bg-accent/5 border border-transparent"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0">
                          <FileText size={16} className="text-accent" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">
                              {typeLabels[s.type] || s.type} xulosa
                            </span>
                            <span
                              className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ color: sc.color, backgroundColor: `${sc.color}15` }}
                            >
                              {sc.icon}
                              {sc.label}
                            </span>
                          </div>
                          <div className="text-xs text-secondary mt-0.5">
                            {s.periodFrom} — {s.periodTo}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}
                            className="p-1 text-secondary hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                            title="O'chirish"
                          >
                            <Trash2 size={14} />
                          </button>
                          <ChevronRight size={16} className="text-secondary lg:hidden" />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FileText size={40} className="text-secondary/30 mb-3" />
                <p className="text-secondary text-sm">Xulosalar topilmadi</p>
                <p className="text-secondary/60 text-xs mt-1">Yangi xulosa yarating</p>
              </div>
            )}
          </Card>
        </div>

        {/* ── Detail panel ──────────────────────────── */}
        <div className={`flex-1 min-w-0 ${showDetailMobile ? "block" : "hidden lg:block"}`}>
          <Card className="h-full">
            {/* Mobile back button */}
            {showDetailMobile && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 text-accent text-sm mb-3 lg:hidden hover:underline"
              >
                <ChevronLeft size={16} />
                Ortga
              </button>
            )}

            {selectedSummary?.status === "done" && selectedSummary.content ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-base font-semibold">
                    {typeLabels[selectedSummary.type] || selectedSummary.type} xulosa
                  </h4>
                  <span className="text-xs text-secondary">
                    {selectedSummary.periodFrom} — {selectedSummary.periodTo}
                  </span>
                </div>
                <div
                  className="text-secondary text-sm leading-relaxed break-words overflow-hidden max-w-full"
                  dangerouslySetInnerHTML={{ __html: formatMarkdown(selectedSummary.content) }}
                />
              </div>
            ) : selectedSummary?.status === "pending" ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-10 h-10 border-2 border-accent/30 border-t-accent rounded-full animate-spin mb-4" />
                <p className="text-secondary text-sm">Xulosa yaratilmoqda...</p>
                <p className="text-secondary/50 text-xs mt-1">Bu 1-2 daqiqa olishi mumkin</p>
              </div>
            ) : selectedSummary?.status === "error" ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <AlertCircle size={40} className="text-red-500/50 mb-3" />
                <p className="text-red-400 text-sm">Xulosa yaratishda xatolik yuz berdi</p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <FileText size={48} className="text-secondary/20 mb-3" />
                <p className="text-secondary text-sm">Xulosani tanlang</p>
                <p className="text-secondary/50 text-xs mt-1">Chap paneldan birini bosing</p>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{marginTop: 0}}>
          <div className="rounded-2xl shadow-xl max-w-sm w-full p-6" style={{ backgroundColor: "var(--color-card-bg)" }}>
            <div className="flex flex-col items-center text-center gap-3">
              <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
                <Trash2 size={24} className="text-red-500" />
              </div>
              <h3 className="text-lg font-semibold">Xulosani o'chirish</h3>
              <p className="text-sm text-secondary">Bu xulosani o'chirishni xohlaysizmi? Bu amalni qaytarib bo'lmaydi.</p>
              <div className="flex gap-3 mt-2 w-full">
                <Button variant="secondary" onClick={() => setDeleteId(null)} className="flex-1">
                  Bekor qilish
                </Button>
                <button
                  onClick={() => deleteMutation.mutate(deleteId)}
                  disabled={deleteMutation.isPending}
                  className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                  style={{ color: "#ffffff" }}
                >
                  {deleteMutation.isPending ? "O'chirilmoqda..." : "O'chirish"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Yangi xulosa yaratish" size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const now = new Date();
            let from = periodFrom;
            let to = periodTo;

            if (type === "bugungi") {
              from = now.toISOString().split("T")[0];
              to = from;
            } else if (type === "haftalik") {
              const weekAgo = new Date(now);
              weekAgo.setDate(weekAgo.getDate() - 7);
              from = weekAgo.toISOString().split("T")[0];
              to = now.toISOString().split("T")[0];
            } else if (type === "oylik") {
              const monthAgo = new Date(now);
              monthAgo.setMonth(monthAgo.getMonth() - 1);
              from = monthAgo.toISOString().split("T")[0];
              to = now.toISOString().split("T")[0];
            }

            setPeriodFrom(from);
            setPeriodTo(to);
            generateMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm text-secondary mb-2">Xulosa turi</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "bugungi", label: "Bugungi" },
                { value: "haftalik", label: "Haftalik" },
                { value: "oylik", label: "Oylik" },
                { value: "boshqa", label: "Boshqa" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    type === opt.value
                      ? "bg-accent border-accent"
                      : "bg-primary border-border text-secondary hover:border-accent/50"
                  }`}
                  style={type === opt.value ? { color: "#ffffff" } : undefined}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {type === "boshqa" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-secondary mb-1">Dan</label>
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">Gacha</label>
                <input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white text-sm"
                  required
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setShowModal(false)}>Bekor qilish</Button>
            <Button type="submit" loading={generateMutation.isPending}>Yaratish</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SummariesPage;
