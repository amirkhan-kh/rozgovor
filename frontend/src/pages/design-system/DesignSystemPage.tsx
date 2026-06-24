import React from "react";
import { Target, Phone, TrendingUp, Headphones, Mic, Users } from "lucide-react";
import {
  StatCard,
  TrendIndicator,
  Sparkline,
  ScoreBadge,
  InsightBanner,
  EmptyState,
  SectionHeader,
  ProgressRing,
} from "../../components/ui/stats";

/**
 * Vizual smoke test — Design System v2 barcha komponentlari bir joyda.
 *
 * /design-system route'ida ochiladi. Dev uchun.
 * Production'ga chiqarmaslik mumkin (keyinroq feature flag qo'shish).
 */
const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="mb-10">
    <h2 className="text-xl font-bold mb-4" style={{ color: "var(--ds-text-primary)" }}>
      {title}
    </h2>
    <div
      className="p-6 rounded-2xl"
      style={{
        background: "var(--ds-bg-surface)",
        border: "1px solid var(--ds-border-default)",
      }}
    >
      {children}
    </div>
  </section>
);

const DesignSystemPage: React.FC = () => {
  return (
    <div
      className="min-h-screen p-6 md:p-10"
      style={{ background: "var(--ds-bg-base)", color: "var(--ds-text-primary)" }}
    >
      <div className="max-w-6xl mx-auto">
        <header className="mb-10">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--ds-text-primary)" }}>
            SalesAI Design System v2
          </h1>
          <p className="text-base" style={{ color: "var(--ds-text-secondary)" }}>
            Linear · Vercel · Gong uslubida qurilgan. Dark/Light themada ishlaydi.
          </p>
        </header>

        {/* ─── Colors ─────────────────────────────────────── */}
        <Section title="Rang palitrasi">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { name: "Primary", token: "--ds-primary", hex: "#4f46e5" },
              { name: "Success", token: "--ds-success", hex: "#10b981" },
              { name: "Warning", token: "--ds-warning", hex: "#f59e0b" },
              { name: "Danger", token: "--ds-danger", hex: "#f43f5e" },
              { name: "Info", token: "--ds-info", hex: "#0ea5e9" },
              { name: "Gold", token: "--ds-gold", hex: "#facc15" },
            ].map((c) => (
              <div key={c.name} className="flex flex-col gap-2">
                <div className="h-16 rounded-lg" style={{ background: `var(${c.token})` }} />
                <div>
                  <p className="text-sm font-semibold">{c.name}</p>
                  <p className="text-2xs font-mono opacity-60">{c.hex}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ─── Typography ─────────────────────────────────── */}
        <Section title="Typography scale">
          <div className="space-y-3">
            <p className="ds-hero-value">Hero — 44px, -0.02em</p>
            <p className="ds-metric-value">Metric — 28px, -0.01em</p>
            <p className="text-2xl font-bold">2xl — 28px — font-bold</p>
            <p className="text-xl font-bold">xl — 22px — page title</p>
            <p className="text-lg font-semibold">lg — 18px — section title</p>
            <p className="text-base">base — 14px — body default</p>
            <p className="text-sm" style={{ color: "var(--ds-text-secondary)" }}>
              sm — 13px — secondary text
            </p>
            <p className="text-xs" style={{ color: "var(--ds-text-muted)" }}>
              xs — 12px — captions
            </p>
            <p className="ds-metric-label">METRIC LABEL — 11px uppercase</p>
          </div>
        </Section>

        {/* ─── StatCard variations ───────────────────────── */}
        <Section title="StatCard — 4 qatlamli KPI (Hero)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <StatCard
              hero
              label="O'rtacha ball"
              value={72}
              unit="/100"
              variant="warning"
              trend={{ value: 5, format: "number", positiveDirection: "up" }}
              comparison={{ label: "Jamoa", value: 68 }}
              sparkline={[62, 65, 68, 70, 72]}
              icon={<TrendingUp size={18} />}
              insight="Davronga 8 ball qolgan — bu hafta Looping texnikasini qo'llang"
            />
            <StatCard
              hero
              label="Konversiya"
              value={17}
              unit="%"
              variant="success"
              trend={{ value: 2.4, format: "percent", positiveDirection: "up" }}
              comparison={{ label: "O'tgan hafta", value: "14.6%" }}
              target={20}
              icon={<Target size={18} />}
              insight="Maqsadgacha 3% qoldi — har hafta +0.8% o'sib boryapsiz"
            />
          </div>
        </Section>

        <Section title="StatCard — kichik variant (4 cols)">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              label="Qo'ng'iroqlar"
              value={1760}
              variant="primary"
              trend={{ value: 12, format: "percent", positiveDirection: "up" }}
              icon={<Phone size={16} />}
            />
            <StatCard
              label="Audio soat"
              value={235}
              unit="soat"
              variant="info"
              icon={<Headphones size={16} />}
            />
            <StatCard
              label="Menejerlar"
              value={10}
              variant="neutral"
              icon={<Users size={16} />}
            />
            <StatCard
              label="Taslim stavka"
              value={42}
              unit="%"
              variant="danger"
              trend={{ value: -3, format: "percent", positiveDirection: "down" }}
              icon={<Mic size={16} />}
            />
          </div>
        </Section>

        {/* ─── TrendIndicator ────────────────────────────── */}
        <Section title="TrendIndicator — 3 xil yo'nalish">
          <div className="flex flex-wrap items-center gap-4">
            <TrendIndicator value={12} format="percent" positiveDirection="up" size="lg" />
            <TrendIndicator value={-5} format="percent" positiveDirection="up" size="lg" />
            <TrendIndicator value={0} format="percent" positiveDirection="up" size="lg" />
            <TrendIndicator value={12} format="percent" positiveDirection="down" size="lg" />
            <TrendIndicator value={3} format="number" size="md" />
            <TrendIndicator value={-2} format="number" size="sm" />
          </div>
        </Section>

        {/* ─── ScoreBadge ────────────────────────────────── */}
        <Section title="ScoreBadge — 72/100 + interpretatsiya">
          <div className="flex flex-wrap items-center gap-3">
            <ScoreBadge score={95} size="lg" />
            <ScoreBadge score={82} size="lg" />
            <ScoreBadge score={71} size="lg" />
            <ScoreBadge score={62} size="lg" />
            <ScoreBadge score={48} size="lg" />
            <ScoreBadge score={32} size="lg" />
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <ScoreBadge score={75} size="md" />
            <ScoreBadge score={75} size="sm" showLabel={false} />
          </div>
        </Section>

        {/* ─── Sparkline ─────────────────────────────────── */}
        <Section title="Sparkline — mini chartlar">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {(["primary", "success", "warning", "danger", "info"] as const).map((v) => (
              <div key={v} className="flex flex-col gap-2">
                <p className="text-2xs ds-metric-label">{v}</p>
                <Sparkline data={[20, 35, 30, 45, 60, 55, 70]} variant={v} width={120} height={40} showDots />
              </div>
            ))}
          </div>
        </Section>

        {/* ─── ProgressRing ──────────────────────────────── */}
        <Section title="ProgressRing — doiraviy progress">
          <div className="flex flex-wrap items-center gap-6">
            <ProgressRing value={92} label="92" sublabel="A'lo" />
            <ProgressRing value={75} label="75" sublabel="Yaxshi" />
            <ProgressRing value={62} label="62" sublabel="O'rta" />
            <ProgressRing value={40} label="40" sublabel="Zaif" />
            <ProgressRing value={85} label="17%" sublabel="Conv" size={80} strokeWidth={6} />
          </div>
        </Section>

        {/* ─── InsightBanner ─────────────────────────────── */}
        <Section title="InsightBanner — narrative + CTA">
          <div className="space-y-3">
            <InsightBanner
              kind="goal"
              title="Bugun nima qilish kerak"
              message="Siz maqsaddan 8 bitim ortda. Ustuvor 3 ta aktiv lead bor — bugun ularga qo'ng'iroq qiling va 'ha yoki yo'q' javobini oling."
              action={{ label: "Leadlarni ko'rish", onClick: () => alert("Navigate") }}
            />
            <InsightBanner
              kind="warning"
              title="Diqqat"
              message="Jamoaning 58%i 'qimmat' e'tirozida taslim bo'lyapti. Davron esa 0% — uning Looping texnikasini o'rganing."
            />
            <InsightBanner
              kind="tip"
              title="Sinab ko'ring"
              message="Narxni aytishdan oldin 30 soniya qiymat uchun gap bering. Bu usul Davronning konversiyasini 22% ga chiqargan."
              action={{ label: "Mashq qilish", onClick: () => {} }}
            />
            <InsightBanner
              kind="success"
              title="Ajoyib"
              message="Bu hafta o'rtacha ball +5 ball o'sdi va konversiya +2.4% oshdi. Davom eting!"
            />
          </div>
        </Section>

        {/* ─── EmptyState ────────────────────────────────── */}
        <Section title="EmptyState — ma'lumot yo'q tugun holati">
          <EmptyState
            title="Hali qo'ng'iroq yuklanmagan"
            message="Audio faylni yuklab, AI tahlilini boshlang. Birinchi qo'ng'iroq tahlili 2-3 daqiqada tayyor bo'ladi."
            action={{ label: "Audio yuklash", onClick: () => {} }}
          />
        </Section>

        {/* ─── SectionHeader ─────────────────────────────── */}
        <Section title="SectionHeader — bo'lim sarlavhalari">
          <SectionHeader
            eyebrow="Jamoa"
            title="Eng ko'p xatolar"
            subtitle="Oxirgi 30 kun · 10 menejer"
            icon={<Target size={18} />}
            actions={
              <button className="text-sm text-secondary hover:underline">Ko'proq</button>
            }
          />
          <SectionHeader
            title="Voronka sizishlari"
            subtitle="Qaysi bosqichda bitimlar yo'qolyapti"
            icon={<TrendingUp size={18} />}
          />
        </Section>
      </div>
    </div>
  );
};

export default DesignSystemPage;
