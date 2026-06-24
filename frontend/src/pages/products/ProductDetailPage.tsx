import React, { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Package, ShoppingCart, Headphones, FileText,
  Edit3, Save, Loader2, Calendar as CalendarIcon,
} from "lucide-react";
import toast from "react-hot-toast";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { productsService } from "../../services/products.service";
import { dashboardService } from "../../services/dashboard.service";
import SalesStatsBlock from "../dashboard/components/SalesStatsBlock";
import SalesTrendChart from "../dashboard/components/SalesTrendChart";
import CriteriaTeamChart from "../dashboard/components/CriteriaTeamChart";
import CriteriaManagersTable from "../dashboard/components/CriteriaManagersTable";

type TabKey = "sotuv" | "audit" | "info";
type Period = "today" | "week" | "month" | "all";

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: "sotuv", label: "Sotuv", icon: <ShoppingCart size={14} /> },
  { key: "audit", label: "Audit", icon: <Headphones size={14} /> },
  { key: "info", label: "Ma'lumot", icon: <FileText size={14} /> },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Bugun" },
  { key: "week", label: "Bu hafta" },
  { key: "month", label: "Bu oy" },
  { key: "all", label: "Barchasi" },
];

const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("sotuv");
  const [period, setPeriod] = useState<Period>("month");

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => productsService.get(id!),
    enabled: !!id,
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="px-4 md:px-6 py-4 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-32" rounded="xl" />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="px-4 md:px-6 py-12 max-w-5xl mx-auto text-center">
        <Package size={32} className="mx-auto mb-2 opacity-40" />
        <p className="text-sm text-secondary">Mahsulot topilmadi</p>
        <button onClick={() => navigate("/products")} className="mt-4 text-sm text-violet-500 hover:underline">
          Ro'yxatga qaytish
        </button>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-6xl mx-auto">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate("/products")}
        className="flex items-center gap-1.5 text-xs text-secondary hover:opacity-80"
      >
        <ArrowLeft size={14} />
        Mahsulotlar
      </button>

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Package size={28} className="text-violet-500" />
            {product.name}
          </h1>
          {product.description && (
            <p className="text-sm text-secondary mt-1 max-w-2xl">{product.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <Stat label="Sotuv lidi" value={product._count.salesLeads} />
          <Stat label="Lid" value={product._count.leads} />
          <Stat label="Audio" value={product._count.audioFiles} />
          <Stat label="Hujjat" value={product._count.documents} />
        </div>
      </div>

      {/* Tab + Period filter row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 p-1 rounded-xl border w-fit overflow-x-auto"
          style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  active ? "bg-accent !text-white" : "text-secondary hover:opacity-80"
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Davr filter — info tabida ko'rinmaydi */}
        {tab !== "info" && (
          <div className="flex items-center gap-1 p-1 rounded-xl border"
            style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}>
            <CalendarIcon size={14} className="ml-2 text-secondary" />
            {PERIODS.map((p) => {
              const active = period === p.key;
              return (
                <button
                  key={p.key}
                  onClick={() => setPeriod(p.key)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    active ? "bg-accent !text-white" : "text-secondary hover:opacity-80"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tab content */}
      {tab === "sotuv" && id && <SotuvTab productId={id} period={period} />}
      {tab === "audit" && id && <AuditTab productId={id} period={period} />}
      {tab === "info" && <InfoTab productId={product.id} initialKB={product.knowledgeBase || ""} />}
    </div>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="px-3 py-1.5 rounded-lg border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--color-card-bg)" }}>
    <div className="text-[10px] uppercase tracking-wider text-secondary">{label}</div>
    <div className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{value}</div>
  </div>
);

/* ─── Sotuv tab — line chart bo'yicha sotuv trendi ─── */
const SotuvTab: React.FC<{ productId: string; period: Period }> = ({ productId, period }) => {
  const filters = useMemo(() => ({
    period: period === "all" ? undefined : period,
    productIds: productId,
  }), [productId, period]);

  const { data: salesStats, isLoading: l1 } = useQuery({
    queryKey: ["product-sales-stats", productId, period],
    queryFn: () => dashboardService.getSalesStats(filters),
    staleTime: 30_000,
  });
  const { data: salesTrend, isLoading: l2 } = useQuery({
    queryKey: ["product-sales-trend", productId, period],
    queryFn: () => dashboardService.getSalesTrend(filters),
    staleTime: 30_000,
  });

  if (l1 || l2) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32" rounded="xl" />
        <Skeleton className="h-72" rounded="xl" />
      </div>
    );
  }

  const hasData = salesTrend && salesTrend.length > 0;

  return (
    <div className="space-y-4">
      {salesStats && <SalesStatsBlock data={salesStats} />}
      {hasData ? (
        <SalesTrendChart data={salesTrend!} />
      ) : (
        <Card>
          <div className="py-16 text-center text-sm text-secondary">
            <ShoppingCart size={32} className="mx-auto mb-2 opacity-40" />
            Bu mahsulot uchun sotuv ma'lumotlari yo'q
          </div>
        </Card>
      )}
    </div>
  );
};

/* ─── Audit tab — mezonlar radar ─── */
const AuditTab: React.FC<{ productId: string; period: Period }> = ({ productId, period }) => {
  const filters = useMemo(() => ({
    period: period === "all" ? undefined : period,
    productIds: productId,
  }), [productId, period]);

  const { data: criteria, isLoading } = useQuery({
    queryKey: ["product-criteria", productId, period],
    queryFn: () => dashboardService.getCriteria(filters),
    staleTime: 30_000,
  });

  if (isLoading) {
    return <Skeleton className="h-96" rounded="xl" />;
  }

  const hasSotuv = criteria?.sotuv?.team && Object.keys(criteria.sotuv.team).length > 0;
  const hasQayta = criteria?.qayta?.team && Object.keys(criteria.qayta.team).length > 0;

  if (!hasSotuv && !hasQayta) {
    return (
      <Card>
        <div className="py-16 text-center text-sm text-secondary">
          <Headphones size={32} className="mx-auto mb-2 opacity-40" />
          Bu mahsulot uchun hali audio tahlili yo'q
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {criteria && <CriteriaTeamChart data={criteria} />}
      {criteria && <CriteriaManagersTable data={criteria} />}
    </div>
  );
};

/* ─── Ma'lumot tab — knowledge base CRUD ─── */
const InfoTab: React.FC<{ productId: string; initialKB: string }> = ({ productId, initialKB }) => {
  const [kb, setKb] = useState(initialKB);
  const [editing, setEditing] = useState(false);
  const qc = useQueryClient();

  const updateMut = useMutation({
    mutationFn: (newKb: string) => productsService.update(productId, { knowledgeBase: newKb }),
    onSuccess: () => {
      toast.success("Saqlandi");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["product", productId] });
    },
    onError: () => toast.error("Saqlashda xatolik"),
  });

  return (
    <Card>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-base">Mahsulot bilim bazasi</h3>
          <p className="text-xs text-secondary mt-0.5">
            Markdown formatda. AI har audio tahlilida shu kontekstni ishlatadi.
          </p>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80 flex items-center gap-1.5"
            style={{ borderColor: "var(--color-border)" }}
          >
            <Edit3 size={12} /> Tahrirlash
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditing(false); setKb(initialKB); }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border hover:opacity-80"
              style={{ borderColor: "var(--color-border)" }}
              disabled={updateMut.isPending}
            >
              Bekor
            </button>
            <button
              onClick={() => updateMut.mutate(kb)}
              disabled={updateMut.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent !text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50"
            >
              {updateMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Saqlash
            </button>
          </div>
        )}
      </div>

      {editing ? (
        <textarea
          value={kb}
          onChange={(e) => setKb(e.target.value)}
          placeholder="Mahsulot haqida ma'lumot — narx, modullar, foydalar, qoidalar, e'tirozlar..."
          className="w-full min-h-[400px] p-3 rounded-lg border text-sm font-mono bg-transparent focus:outline-none focus:ring-1 focus:ring-accent resize-y"
          style={{ borderColor: "var(--color-border)", color: "var(--text-primary)" }}
        />
      ) : kb.trim() ? (
        <pre
          className="text-sm whitespace-pre-wrap break-words p-3 rounded-lg border"
          style={{
            color: "var(--text-primary)",
            borderColor: "var(--color-border)",
            backgroundColor: "var(--color-primary, rgba(0,0,0,0.02))",
          }}
        >
          {kb}
        </pre>
      ) : (
        <div className="py-12 text-center text-sm text-secondary">
          Bilim bazasi bo'sh. "Tahrirlash" tugmasini bosib qo'shing.
        </div>
      )}
    </Card>
  );
};

export default ProductDetailPage;
