import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArchiveRestore, Trash2, User } from "lucide-react";
import Skeleton from "../../components/ui/Skeleton";
import { managersService } from "../../services/managers.service";

const ManagersArchivedTab: React.FC = () => {
  const qc = useQueryClient();

  const { data: all, isLoading } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });

  const archived = (all || []).filter((m: any) => !m.isActive);

  const unarchiveMutation = useMutation({
    mutationFn: (id: string) => managersService.archive(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      qc.invalidateQueries({ queryKey: ["managers-sales"] });
      qc.invalidateQueries({ queryKey: ["managers-audit"] });
      toast.success("Tiklandi");
    },
    onError: () => toast.error("Xatolik"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => managersService.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers"] });
      toast.success("O'chirildi");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Xatolik";
      toast.error(msg);
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-32" rounded="xl" />
        ))}
      </div>
    );
  }

  if (archived.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center py-16 rounded-2xl border"
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        <User size={36} style={{ color: "var(--text-secondary)", opacity: 0.5 }} />
        <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          Arxivlangan menejerlar yo'q
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {archived.map((m: any) => (
        <div
          key={m.id}
          className="p-4 rounded-2xl border"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <div className="flex items-center gap-3 mb-3">
            {m.photoUrl ? (
              <img
                src={m.photoUrl}
                alt={m.name}
                className="w-12 h-12 rounded-full object-cover"
              />
            ) : (
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-base font-bold"
                style={{
                  backgroundColor: "rgba(156,163,175,0.18)",
                  color: "#9ca3af",
                }}
              >
                {m.name?.charAt(0) || "?"}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div
                className="font-semibold truncate"
                style={{ color: "var(--text-primary)" }}
              >
                {m.name}
              </div>
              {m.email && (
                <div className="text-xs text-secondary truncate">{m.email}</div>
              )}
              {m._count?.audioFiles != null && (
                <div className="text-[11px] text-secondary opacity-70 mt-0.5">
                  {m._count.audioFiles} qo'ng'iroq
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => unarchiveMutation.mutate(m.id)}
              disabled={unarchiveMutation.isPending}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              style={{
                backgroundColor: "rgba(34,197,94,0.1)",
                color: "#16a34a",
                border: "1px solid rgba(34,197,94,0.3)",
              }}
              title="Tiklash"
            >
              <ArchiveRestore size={13} strokeWidth={2.5} />
              Tiklash
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`${m.name} menejerini butunlay o'chirmoqchimisiz?`)) {
                  deleteMutation.mutate(m.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:brightness-110 disabled:opacity-50"
              style={{
                backgroundColor: "rgba(239,68,68,0.1)",
                color: "#dc2626",
                border: "1px solid rgba(239,68,68,0.3)",
              }}
              title="O'chirish"
            >
              <Trash2 size={13} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ManagersArchivedTab;
