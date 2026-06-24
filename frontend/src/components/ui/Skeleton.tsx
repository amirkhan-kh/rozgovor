import React from "react";

interface SkeletonProps {
  className?: string;
  rounded?: "sm" | "md" | "lg" | "xl" | "full";
}

const roundedMap = {
  sm: "rounded-sm",
  md: "rounded-md",
  lg: "rounded-lg",
  xl: "rounded-xl",
  full: "rounded-full",
};

const Skeleton: React.FC<SkeletonProps> = ({ className = "", rounded = "lg" }) => (
  <div
    className={`animate-pulse ${roundedMap[rounded]} ${className}`}
    style={{ backgroundColor: "var(--color-border)" }}
  />
);

/* ---- Reusable skeleton patterns ---- */

export const SkeletonText: React.FC<{ lines?: number; className?: string }> = ({
  lines = 3,
  className = "",
}) => (
  <div className={`space-y-2 ${className}`}>
    {Array.from({ length: lines }).map((_, i) => (
      <Skeleton
        key={i}
        className={`h-3 ${i === lines - 1 ? "w-2/3" : "w-full"}`}
      />
    ))}
  </div>
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = "" }) => (
  <div
    className={`border rounded-xl p-5 space-y-3 ${className}`}
    style={{
      backgroundColor: "var(--color-card-bg)",
      borderColor: "var(--color-border)",
    }}
  >
    <div className="flex items-center gap-3 mb-2">
      <Skeleton className="w-10 h-10" rounded="xl" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
    </div>
    <div className="grid grid-cols-3 gap-2">
      <Skeleton className="h-12" rounded="lg" />
      <Skeleton className="h-12" rounded="lg" />
      <Skeleton className="h-12" rounded="lg" />
    </div>
    <Skeleton className="h-3 w-full" />
    <Skeleton className="h-2 w-full" rounded="full" />
  </div>
);

export const SkeletonKPI: React.FC = () => (
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    {[1, 2, 3, 4].map((i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

export const SkeletonChart: React.FC<{ height?: string }> = ({ height = "h-[280px]" }) => (
  <div
    className="border rounded-xl p-5"
    style={{
      backgroundColor: "var(--color-card-bg)",
      borderColor: "var(--color-border)",
    }}
  >
    <Skeleton className="h-4 w-1/4 mb-2" />
    <Skeleton className="h-3 w-1/3 mb-4" />
    <Skeleton className={`w-full ${height}`} rounded="xl" />
  </div>
);

export const SkeletonTable: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 5,
}) => (
  <div
    className="border rounded-xl overflow-hidden"
    style={{
      backgroundColor: "var(--color-card-bg)",
      borderColor: "var(--color-border)",
    }}
  >
    {/* Toolbar */}
    <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-8 w-32" rounded="xl" />
    </div>
    {/* Table Header */}
    <div className="flex gap-4 px-4 py-3 border-b" style={{ borderColor: "var(--color-border)" }}>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-3 flex-1" />
      ))}
    </div>
    {/* Rows */}
    {Array.from({ length: rows }).map((_, r) => (
      <div
        key={r}
        className="flex gap-4 px-4 py-3 border-b"
        style={{ borderColor: "var(--color-border)", opacity: 0.15 + (1 - r / rows) * 0.3 }}
      >
        {Array.from({ length: cols }).map((_, c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

export const SkeletonCardGrid: React.FC<{ count?: number; cols?: string }> = ({
  count = 6,
  cols = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
}) => (
  <div className="space-y-4">
    {/* Toolbar */}
    <div className="flex items-center justify-between">
      <div className="flex gap-2">
        <Skeleton className="h-9 w-20" rounded="xl" />
        <Skeleton className="h-9 w-16" rounded="xl" />
        <Skeleton className="h-9 w-24" rounded="xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-9" rounded="lg" />
        <Skeleton className="h-9 w-9" rounded="lg" />
        <Skeleton className="h-9 w-28" rounded="xl" />
      </div>
    </div>
    <div className={`grid ${cols} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  </div>
);

export const SkeletonForm: React.FC<{ fields?: number }> = ({ fields = 4 }) => (
  <div className="space-y-4">
    {Array.from({ length: fields }).map((_, i) => (
      <div key={i}>
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-10 w-full" rounded="xl" />
      </div>
    ))}
  </div>
);

export const SkeletonProfile: React.FC = () => (
  <div className="space-y-6">
    {/* Tabs */}
    <div className="flex gap-3 border-b" style={{ borderColor: "var(--color-border)" }}>
      <Skeleton className="h-4 w-14 mb-3" />
      <Skeleton className="h-4 w-28 mb-3" />
      <Skeleton className="h-4 w-24 mb-3" />
    </div>
    <div
      className="border rounded-xl p-6"
      style={{
        backgroundColor: "var(--color-card-bg)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="flex flex-col items-center py-6">
        <Skeleton className="w-20 h-20 mb-4" rounded="xl" />
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  </div>
);

export const SkeletonToolbar: React.FC = () => (
  <div className="flex items-center justify-between gap-3 py-3">
    <div className="flex gap-2">
      <Skeleton className="h-10 w-24" rounded="xl" />
      <Skeleton className="h-10 w-20" rounded="xl" />
    </div>
    <div className="flex gap-2">
      <Skeleton className="h-10 w-10" rounded="lg" />
      <Skeleton className="h-10 w-10" rounded="lg" />
      <Skeleton className="h-10 w-10" rounded="lg" />
    </div>
  </div>
);

export const SkeletonDashboard: React.FC = () => (
  <div className="space-y-6">
    <SkeletonToolbar />
    <SkeletonKPI />
    <SkeletonChart height="h-[200px]" />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SkeletonChart />
      <SkeletonChart />
    </div>
    <SkeletonChart height="h-[250px]" />
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SkeletonChart />
      <SkeletonChart />
    </div>
  </div>
);

export const SkeletonDetail: React.FC = () => (
  <div className="space-y-6">
    {/* Back button + title */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8" rounded="lg" />
        <Skeleton className="h-6 w-48" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" rounded="xl" />
        <Skeleton className="h-9 w-20" rounded="xl" />
      </div>
    </div>
    {/* Main info card */}
    <div
      className="border rounded-xl p-6"
      style={{
        backgroundColor: "var(--color-card-bg)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="flex items-center gap-4 mb-4">
        <Skeleton className="w-12 h-12" rounded="xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
      <SkeletonText lines={4} />
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <SkeletonChart />
      <SkeletonChart />
    </div>
  </div>
);

export const SkeletonCriteria: React.FC = () => (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <div
      className="border rounded-xl p-4 space-y-2"
      style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}
    >
      <Skeleton className="h-4 w-24 mb-3" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full" rounded="xl" />
      ))}
    </div>
    <div
      className="lg:col-span-2 border rounded-xl p-4 space-y-3"
      style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}
    >
      <Skeleton className="h-4 w-32 mb-3" />
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-20 w-full" rounded="xl" />
      ))}
    </div>
  </div>
);

export default Skeleton;
