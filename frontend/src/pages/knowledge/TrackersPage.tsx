import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Trash2, Target, X } from "lucide-react";
import Card from "../../components/ui/Card";
import Skeleton from "../../components/ui/Skeleton";
import { knowledgeService } from "../../services/knowledge.service";

const TrackersPage: React.FC = () => {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["smart-trackers"],
    queryFn: () => knowledgeService.getTrackers(),
  });

  const createMut = useMutation({
    mutationFn: () => knowledgeService.createTracker(form),
    onSuccess: () => {
      toast.success("Tracker qo'shildi");
      setShowModal(false);
      setForm({ name: "", description: "" });
      qc.invalidateQueries({ queryKey: ["smart-trackers"] });
    },
    onError: () => toast.error("Xatolik"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => knowledgeService.deleteTracker(id),
    onSuccess: () => {
      toast.success("O'chirildi");
      qc.invalidateQueries({ queryKey: ["smart-trackers"] });
    },
  });

  return (
    <div className="px-4 md:px-6 py-4 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            🎯 Smart Trackers
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Tabiiy tilda kuzatgichlar — tizim har qo'ng'iroqda tekshiradi
          </p>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ backgroundColor: "#3b5ef5", color: "#fff" }}
        >
          <Plus size={16} />
          Yangi tracker
        </button>
      </div>

      <div className="flex gap-2 flex-wrap text-sm">
        <Link
          to="/knowledge/objections"
          className="px-3 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: "var(--color-border)", color: "var(--text-secondary)" }}
        >
          ← E'tirozlar kutubxonasi
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      ) : !data?.trackers || data.trackers.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <Target size={32} className="mx-auto mb-2 opacity-40" style={{ color: "var(--text-secondary)" }} />
            <p className="text-secondary">Trackerlar hali yo'q</p>
            <p className="text-xs mt-2 text-secondary">
              Misol: "Mijoz CEO bilan gaplashishni so'raganda"
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.trackers.map((t) => (
            <Card key={t.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                    <Target size={16} style={{ color: "#3b5ef5" }} />
                    {t.name}
                  </h3>
                  <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                    {t.description}
                  </p>
                  <p className="text-xs mt-2" style={{ color: "var(--text-secondary)" }}>
                    Yaratilgan: {new Date(t.createdAt).toLocaleDateString("uz-UZ")}
                    {t.hitCount !== undefined && ` · ${t.hitCount} marta topildi`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`"${t.name}" trackerini o'chirmoqchimisiz?`)) {
                      deleteMut.mutate(t.id);
                    }
                  }}
                  className="p-2 rounded-lg hover:bg-red-500/10 transition-colors"
                  style={{ color: "#e64545" }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                Yangi tracker
              </h3>
              <button onClick={() => setShowModal(false)}>
                <X size={20} style={{ color: "var(--text-secondary)" }} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Nom
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Masalan: CEO so'rovi"
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                  style={{
                    backgroundColor: "var(--color-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div>
                <label className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Tavsif (tabiiy tilda)
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Masalan: Mijoz CEO bilan uchrashish yoki direktor bilan gaplashishni so'raganda"
                  rows={4}
                  className="w-full mt-1 px-3 py-2 rounded-lg border text-sm"
                  style={{
                    backgroundColor: "var(--color-bg)",
                    borderColor: "var(--color-border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <button
                onClick={() => createMut.mutate()}
                disabled={!form.name.trim() || !form.description.trim() || createMut.isPending}
                className="w-full py-2 rounded-lg font-medium disabled:opacity-50"
                style={{ backgroundColor: "#3b5ef5", color: "#fff" }}
              >
                {createMut.isPending ? "Qo'shilmoqda..." : "Qo'shish"}
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TrackersPage;
