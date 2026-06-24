import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Edit2, Archive, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { managersService } from "../../services/managers.service";

interface Props {
  managerId: string;
  managerName: string;
}

const ManagerActions: React.FC<Props> = ({ managerId, managerName }) => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const archiveMutation = useMutation({
    mutationFn: () => managersService.archive(managerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers-sales"] });
      qc.invalidateQueries({ queryKey: ["managers-audit"] });
      qc.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Arxivlandi");
    },
    onError: () => toast.error("Xatolik"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => managersService.remove(managerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["managers-sales"] });
      qc.invalidateQueries({ queryKey: ["managers-audit"] });
      qc.invalidateQueries({ queryKey: ["managers"] });
      toast.success("O'chirildi");
      setConfirmDelete(false);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        "Xatolik";
      toast.error(msg);
    },
  });

  // Theme-aware button — saytning oq/qora modega mos keladi
  return (
    <>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/managers/${managerId}/edit`);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-colors hover:bg-accent/10"
          style={{
            backgroundColor: "transparent",
            color: "var(--text-primary)",
            border: "1px solid var(--color-border)",
          }}
          title="Tahrirlash"
        >
          <Edit2 size={12} strokeWidth={2.5} />
          Tahrir
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            archiveMutation.mutate();
          }}
          disabled={archiveMutation.isPending}
          className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
          style={{
            backgroundColor: "rgba(245,158,11,0.1)",
            color: "#d97706",
            border: "1px solid rgba(245,158,11,0.3)",
          }}
          title="Arxivlash"
        >
          <Archive size={12} strokeWidth={2.5} />
          Arxiv
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDelete(true);
          }}
          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:brightness-110"
          style={{
            backgroundColor: "rgba(239,68,68,0.1)",
            color: "#dc2626",
            border: "1px solid rgba(239,68,68,0.3)",
          }}
          title="O'chirish"
        >
          <Trash2 size={12} strokeWidth={2.5} />
        </button>
      </div>

      <Modal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Menejerni o'chirish"
        size="sm"
      >
        <p className="text-secondary mb-4">
          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
            {managerName}
          </span>
          {" "}menejerini o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setConfirmDelete(false)}>
            Yo'q
          </Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
          >
            Ha, o'chirish
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default ManagerActions;
