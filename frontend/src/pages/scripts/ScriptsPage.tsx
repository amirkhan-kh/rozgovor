import React, { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { criteriaService } from "../../services/criteria.service";
import { CriteriaCategory, Criteria } from "../../types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";

/* ── Progress Circle ─────────────────────────────────────── */
const ProgressCircle: React.FC<{ percent: number; size?: number }> = ({
  percent,
  size = 64,
}) => {
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--color-border)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#3b5ef5"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        fill="var(--text-primary)"
        className="text-xs font-semibold"
      >
        {Math.round(percent)}%
      </text>
    </svg>
  );
};

/* ── Parse description into bullet list ───────────────────── */
function parseDescription(desc: string): string[] {
  // Strip HTML tags, then split by newlines or bullet markers
  const stripped = desc
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  return stripped
    .split(/\n|(?:^|\s)[-•]\s*/g)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ── Main page ─────────────────────────────────────────────── */
const ScriptsPage: React.FC = () => {
  const { data: categories, isLoading } = useQuery<CriteriaCategory[]>({
    queryKey: ["criteria"],
    queryFn: criteriaService.getAll,
  });

  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);

  // Set the first category as active when data loads
  useEffect(() => {
    if (categories && categories.length > 0 && !activeCategoryId) {
      setActiveCategoryId(categories[0].id);
    }
  }, [categories, activeCategoryId]);

  const activeCategory = useMemo(
    () => categories?.find((c) => c.id === activeCategoryId) ?? null,
    [categories, activeCategoryId]
  );

  const steps: Criteria[] = activeCategory?.criteria ?? [];
  const totalSteps = steps.length;
  const currentCriteria = steps[currentStep] ?? null;
  const progressPercent = totalSteps > 0 ? Math.round(((currentStep + 1) / totalSteps) * 100) : 0;

  const handleCategoryChange = (id: string) => {
    setActiveCategoryId(id);
    setCurrentStep(0);
  };

  const handlePrev = () => setCurrentStep((s) => Math.max(0, s - 1));
  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  /* ── Loading state ───────────────────────────────────────── */
  if (isLoading) {
    return (
      <div className="flex flex-col md:flex-row gap-6 p-3 md:p-6 min-h-[calc(100vh-4rem)]">
        <div className="w-full md:w-72 shrink-0 flex flex-col gap-6">
          <div className="bg-card border border-border rounded-xl p-4 space-y-3">
            <Skeleton className="h-3 w-24 mb-3" />
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" rounded="lg" />
            ))}
          </div>
          <div className="bg-card border border-border rounded-xl p-4 space-y-4 flex-1">
            <Skeleton className="h-3 w-28 mb-3" />
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-3 h-3" rounded="full" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 bg-card border border-border rounded-xl p-6 md:p-8 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-1/2" />
            </div>
            <Skeleton className="w-16 h-16" rounded="full" />
          </div>
          <div className="space-y-3 mt-6">
            <Skeleton className="h-3 w-16 mb-3" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="w-2 h-2 mt-1.5" rounded="full" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!categories || categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <p className="text-secondary text-sm">Hech qanday kriteriya topilmadi.</p>
      </div>
    );
  }

  const isFirst = currentStep === 0;
  const isLast = currentStep === totalSteps - 1;

  return (
    <div className="flex flex-col md:flex-row gap-6 p-3 md:p-6 min-h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── Left column ───────────────────────────────────── */}
      <div className="w-full md:w-72 shrink-0 flex flex-col gap-6">
        {/* Script type card */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">
            Ssenariy turi
          </h3>
          <div className="space-y-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  cat.id === activeCategoryId
                    ? "bg-accent/10 text-accent"
                    : "text-secondary hover:bg-accent/5 hover:text-accent"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Process map card */}
        <div className="bg-card border border-border rounded-xl p-4 flex-1">
          <h3 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-4">
            Jarayon xaritasi
          </h3>
          <div className="relative">
            {steps.map((step, idx) => {
              const isCurrent = idx === currentStep;
              const isCompleted = idx < currentStep;

              return (
                <button
                  key={step.id}
                  onClick={() => setCurrentStep(idx)}
                  className="flex items-start gap-3 w-full text-left group mb-0"
                >
                  {/* Dot + line column */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 transition-colors ${
                        isCurrent
                          ? "bg-accent border-accent"
                          : isCompleted
                          ? "bg-accent/60 border-accent/60"
                          : "bg-transparent border-secondary/40"
                      }`}
                    />
                    {idx < steps.length - 1 && (
                      <div
                        className={`w-0.5 h-8 transition-colors ${
                          isCompleted ? "bg-accent/40" : "bg-border"
                        }`}
                      />
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className={`text-sm leading-tight pt-px transition-colors ${
                      isCurrent
                        ? "text-accent font-medium"
                        : isCompleted
                        ? "text-secondary"
                        : "text-secondary/60 group-hover:text-secondary"
                    }`}
                  >
                    {step.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Right column — main content ───────────────────── */}
      <div className="flex-1 flex flex-col">
        {currentCriteria ? (
          <div className="bg-card border border-border rounded-xl flex flex-col flex-1">
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-8 py-4 md:py-6 border-b border-border">
              <div>
                <p className="text-xs text-secondary uppercase tracking-wider mb-1">
                  Bosqich {currentStep + 1} / {totalSteps}
                </p>
                <h2 className="text-xl font-bold text-white">
                  {currentCriteria.name}
                </h2>
              </div>
              <ProgressCircle percent={progressPercent} size={64} />
            </div>

            {/* Content */}
            <div className="flex-1 px-4 md:px-8 py-4 md:py-6 overflow-y-auto">
              <h4 className="text-sm font-semibold text-secondary uppercase tracking-wider mb-4">
                Qoidalar:
              </h4>
              <ul className="space-y-3">
                {parseDescription(currentCriteria.description).map(
                  (line, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />
                      <span className="text-white/90 text-sm leading-relaxed">
                        {line}
                      </span>
                    </li>
                  )
                )}
              </ul>

              {currentCriteria.weight > 0 && (
                <div className="mt-6 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium">
                  Vazn: {currentCriteria.weight}%
                </div>
              )}
            </div>

            {/* Footer navigation */}
            <div className="flex items-center justify-between px-4 md:px-8 py-4 border-t border-border">
              <button
                onClick={handlePrev}
                disabled={isFirst}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isFirst
                    ? "text-secondary/40 cursor-not-allowed"
                    : "text-secondary hover:text-accent hover:bg-accent/10"
                }`}
              >
                <ChevronLeft size={16} />
                Ortga
              </button>

              <button
                onClick={handleNext}
                disabled={isLast && false}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-accent hover:bg-accent/90 transition-colors"
                style={{ color: "#ffffff" }}
              >
                {isLast ? "Tugatish" : "Keyingi bosqich"}
                {!isLast && <ChevronRight size={16} />}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl flex-1 flex items-center justify-center">
            <p className="text-secondary text-sm">
              Bu kategoriyada kriteriyalar mavjud emas.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ScriptsPage;
