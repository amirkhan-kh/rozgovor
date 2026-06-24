// Custdev loyihalari ro'yxati — karta grid
// "Yangi Custdev" tugma → modal; karta ustiga bosilsa → detail sahifa
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  MessageCircle,
  Mic,
  ListChecks,
  Sparkles,
  Calendar as CalendarIcon,
} from "lucide-react";
import {
  custdevService,
  CustdevListItem,
} from "../../services/custdev.service";
import CustdevCreateModal from "./CustdevCreateModal";

const UZ_MONTHS_SHORT = [
  "yan",
  "fev",
  "mar",
  "apr",
  "may",
  "iyn",
  "iyl",
  "avg",
  "sen",
  "okt",
  "noy",
  "dek",
];
const fmtUzDate = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getDate()} ${UZ_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};

const GRADIENTS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
];

// Karta — light/dark fon holati uchun ichki matn ranglari CSS var bilan
const CustdevCard: React.FC<{
  item: CustdevListItem;
  index: number;
  onClick: () => void;
}> = ({ item, index, onClick }) => {
  const gradient = GRADIENTS[index % GRADIENTS.length];

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer transition-transform hover:-translate-y-1"
    >
      <div
        className="rounded-2xl overflow-hidden transition-shadow group-hover:shadow-xl"
        style={{
          backgroundColor: "var(--color-card-bg)",
          border: "1px solid var(--color-border)",
          boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        }}
      >
        {/* Gradient hero — oq matn (doim to'q gradient ustida) */}
        <div className="relative p-4" style={{ background: gradient }}>
          <div
            className="absolute -top-8 -right-8 w-28 h-28 rounded-full opacity-20"
            style={{ backgroundColor: "#fff" }}
          />
          <div className="relative flex items-start gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: "rgba(255,255,255,0.22)",
                backdropFilter: "blur(6px)",
              }}
            >
              <MessageCircle size={22} color="#fff" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-80" style={{ color: "#fff" }}>
                CUSTDEV LOYIHASI
              </div>
              <h3
                className="font-bold text-base truncate"
                style={{ color: "#fff" }}
                title={item.title}
              >
                {item.title}
              </h3>
            </div>
          </div>
        </div>

        {/* Body — light/dark xavfsiz: CSS var */}
        <div className="p-4">
          {item.description ? (
            <p
              className="text-xs line-clamp-2 mb-3 min-h-[2rem]"
              style={{ color: "var(--ds-text-secondary)" }}
            >
              {item.description}
            </p>
          ) : (
            <div className="min-h-[2rem]" />
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <div
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold"
              style={{ backgroundColor: "#8b5cf615", color: "#8b5cf6" }}
            >
              <ListChecks size={12} />
              {item.questionCount} savol
            </div>
            <div
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold"
              style={{ backgroundColor: "#06b6d415", color: "#06b6d4" }}
            >
              <Mic size={12} />
              {item.interviewCount} intervyu
            </div>
            {item.aiSummary && (
              <div
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold"
                style={{ backgroundColor: "#10b98115", color: "#10b981" }}
              >
                <Sparkles size={12} />
                AI xulosa
              </div>
            )}
          </div>

          <div
            className="mt-3 pt-3 flex items-center gap-1.5 text-[11px]"
            style={{
              borderTop: "1px solid var(--color-border)",
              color: "var(--text-secondary)",
            }}
          >
            <CalendarIcon size={11} />
            {fmtUzDate(item.createdAt)}
          </div>
        </div>
      </div>
    </div>
  );
};

const CustdevListPage: React.FC = () => {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["custdev-list"],
    queryFn: () => custdevService.list(),
  });

  const items = data || [];

  return (
    <div className="max-w-7xl mx-auto pb-8">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl p-5 md:p-6 mb-6"
        style={{
          background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
        }}
      >
        <div
          className="absolute -top-16 -right-16 w-48 h-48 rounded-full opacity-20"
          style={{ backgroundColor: "#fff" }}
        />
        <div
          className="absolute -bottom-20 left-20 w-36 h-36 rounded-full opacity-10"
          style={{ backgroundColor: "#fff" }}
        />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundColor: "rgba(255,255,255,0.2)",
                backdropFilter: "blur(8px)",
              }}
            >
              <MessageCircle size={26} color="#fff" />
            </div>
            <div>
              <div
                className="text-xs font-semibold mb-1 opacity-80"
                style={{ color: "#fff" }}
              >
                BILIM VA COACHING / CUSTDEV
              </div>
              <h1
                className="text-2xl md:text-3xl font-bold text-white-imp"
                style={{ color: "#fff" }}
              >
                Customer Development
              </h1>
              <p
                className="text-sm mt-1 opacity-90"
                style={{ color: "#fff" }}
              >
                Mijoz intervyular, AI transkripsiya va savol-javob tahlil
              </p>
            </div>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all hover:scale-105 shadow-lg"
            style={{ backgroundColor: "#fff", color: "#667eea" }}
          >
            <Plus size={18} />
            Yangi Custdev
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div
          className="py-12 text-center text-sm"
          style={{ color: "var(--text-secondary)" }}
        >
          Yuklanmoqda...
        </div>
      )}

      {isError && (
        <div
          className="p-4 rounded-xl"
          style={{
            backgroundColor: "#ef444411",
            border: "1px solid #ef444444",
            color: "#ef4444",
          }}
        >
          Xatolik: {(error as Error).message}
        </div>
      )}

      {!isLoading && items.length === 0 && (
        <div
          className="py-16 text-center rounded-3xl"
          style={{
            backgroundColor: "var(--color-card-bg)",
            border: "2px dashed var(--color-border)",
          }}
        >
          <div
            className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              boxShadow: "0 8px 24px rgba(102,126,234,0.3)",
            }}
          >
            <MessageCircle size={32} color="#fff" />
          </div>
          <h3
            className="font-bold text-xl mb-1"
            style={{ color: "var(--text-primary)" }}
          >
            Hali Custdev loyihasi yo'q
          </h3>
          <p
            className="text-sm mb-5 max-w-md mx-auto"
            style={{ color: "var(--text-secondary)" }}
          >
            Mijoz intervyular uchun birinchi loyihani yarating — savollarni
            aniqlang, audiolarni yuklang, AI har intervyuni tahlil qiladi.
          </p>
          <button
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg"
            style={{
              background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
              color: "#fff",
            }}
          >
            <Sparkles size={14} />
            Birinchi Custdev yaratish
          </button>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c, i) => (
            <CustdevCard
              key={c.id}
              item={c}
              index={i}
              onClick={() => navigate(`/custdev/${c.id}`)}
            />
          ))}
        </div>
      )}

      <CustdevCreateModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={(id) => {
          setModalOpen(false);
          refetch();
          navigate(`/custdev/${id}`);
        }}
      />
    </div>
  );
};

export default CustdevListPage;
