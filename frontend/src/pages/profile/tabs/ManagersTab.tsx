import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Archive, Trash2, ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import EditIcon from "../../../components/icons/EditIcon";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { managersService } from "../../../services/managers.service";

const ITEMS_PER_PAGE = 5;

const allColumns = [
  { key: "name", label: "Nomi" },
  { key: "email", label: "Username" },
  { key: "role", label: "Rol" },
  { key: "status", label: "Status" },
  { key: "active", label: "Faol" },
];

const ManagersTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editManager, setEditManager] = useState<{ id: string; name: string; email: string } | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    allColumns.map((c) => c.key)
  );

  const { data: managers, isLoading } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });

  // Paginatsiya
  const totalItems = managers?.length || 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE));
  const paginatedManagers = useMemo(() => {
    if (!managers) return [];
    const start = (page - 1) * ITEMS_PER_PAGE;
    return managers.slice(start, start + ITEMS_PER_PAGE);
  }, [managers, page]);

  const createMutation = useMutation({
    mutationFn: managersService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Menejer qo'shildi");
      setShowAddModal(false);
      setNewName("");
      setNewEmail("");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name: string; email: string }) =>
      managersService.update(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Menejer yangilandi");
      setEditManager(null);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const archiveMutation = useMutation({
    mutationFn: managersService.archive,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Menejer arxivlandi");
      setArchiveId(null);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const deleteMutation = useMutation({
    mutationFn: managersService.remove,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Menejer o'chirildi");
      setDeleteId(null);
    },
    onError: (err) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Xatolik yuz berdi";
      toast.error(message);
      setDeleteId(null);
    },
  });

  const toggleColumn = (key: string) => {
    setVisibleColumns((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  if (isLoading) {
    return <SkeletonTable rows={5} cols={5} />;
  }

  return (
    <div>
      {/* Header */}
      <div className="bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-lg font-semibold text-white">Menejerlar</h3>
          <div className="flex items-center gap-2">
            {/* Ustun filtr */}
            <div className="relative">
              <button
                onClick={() => setShowColumnFilter(!showColumnFilter)}
                className="p-2 text-secondary hover:text-white transition-colors rounded-lg hover:bg-primary"
              >
                <Settings2 size={18} />
              </button>
              {showColumnFilter && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowColumnFilter(false)}
                  />
                  <div className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-xl shadow-xl z-20 p-3">
                    <p className="text-xs text-secondary font-medium mb-2 uppercase">Ustunlar</p>
                    {allColumns.map((col) => (
                      <label
                        key={col.key}
                        className="flex items-center gap-2 py-1.5 cursor-pointer text-sm text-white hover:text-accent"
                      >
                        <input
                          type="checkbox"
                          checked={visibleColumns.includes(col.key)}
                          onChange={() => toggleColumn(col.key)}
                          className="accent-accent rounded"
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button onClick={() => setShowAddModal(true)} size="sm">
              <Plus size={14} />
              Yangisini qo'shish
            </Button>
          </div>
        </div>

        {/* Jadval */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {visibleColumns.includes("name") && (
                  <th className="text-left py-3 px-4 text-xs text-secondary font-medium uppercase">Nomi</th>
                )}
                {visibleColumns.includes("email") && (
                  <th className="text-left py-3 px-4 text-xs text-secondary font-medium uppercase">Username</th>
                )}
                {visibleColumns.includes("role") && (
                  <th className="text-left py-3 px-4 text-xs text-secondary font-medium uppercase">Rol</th>
                )}
                {visibleColumns.includes("status") && (
                  <th className="text-left py-3 px-4 text-xs text-secondary font-medium uppercase">Status</th>
                )}
                {visibleColumns.includes("active") && (
                  <th className="text-left py-3 px-4 text-xs text-secondary font-medium uppercase">Faol</th>
                )}
                <th className="text-right py-3 px-4 text-xs text-secondary font-medium uppercase"></th>
              </tr>
            </thead>
            <tbody>
              {paginatedManagers.map((manager) => (
                <tr key={manager.id} className="border-b border-border/50 hover:bg-primary/30 transition-colors">
                  {visibleColumns.includes("name") && (
                    <td className="py-3 px-4 text-sm text-white">{manager.name}</td>
                  )}
                  {visibleColumns.includes("email") && (
                    <td className="py-3 px-4 text-sm text-secondary">{manager.email}</td>
                  )}
                  {visibleColumns.includes("role") && (
                    <td className="py-3 px-4">
                      <Badge variant="info" size="sm">Menejer</Badge>
                    </td>
                  )}
                  {visibleColumns.includes("status") && (
                    <td className="py-3 px-4">
                      <Badge variant={manager.isActive ? "success" : "warning"} size="sm">
                        {manager.isActive ? "Faol" : "Arxiv"}
                      </Badge>
                    </td>
                  )}
                  {visibleColumns.includes("active") && (
                    <td className="py-3 px-4">
                      <Badge variant={manager.isActive ? "success" : "danger"} size="sm">
                        {manager.isActive ? "Ha" : "Yo'q"}
                      </Badge>
                    </td>
                  )}
                  <td className="py-3 px-4">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditManager({ id: manager.id, name: manager.name, email: manager.email })}
                        className="px-2 py-1 text-xs text-secondary hover:text-accent transition-colors flex items-center gap-1"
                      >
                        <EditIcon size={14} />
                        Tahrirlash
                      </button>
                      <button
                        onClick={() => setArchiveId(manager.id)}
                        className="px-2 py-1 text-xs text-secondary hover:text-warning transition-colors flex items-center gap-1"
                      >
                        <Archive size={12} />
                        Arxivlash
                      </button>
                      <button
                        onClick={() => setDeleteId(manager.id)}
                        className="px-2 py-1 text-xs text-secondary hover:text-danger transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        O'chirish
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {totalItems === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-secondary text-sm">
                    Hali menejer qo'shilmagan
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Paginatsiya */}
        {totalItems > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <div className="text-sm text-secondary">
              Umumiy natijalar soni: {totalItems}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-sm text-secondary mr-2">
                Har bir sahifada: {ITEMS_PER_PAGE}
              </span>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg text-secondary hover:text-white hover:bg-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    page === p
                      ? "bg-accent text-white"
                      : "text-secondary hover:text-white hover:bg-primary"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg text-secondary hover:text-white hover:bg-primary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Yangi menejer modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Yangi menejer">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createMutation.mutate({ name: newName, email: newEmail });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm text-secondary mb-1">Ism</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Username</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white"
              required
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              Bekor qilish
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Qo'shish
            </Button>
          </div>
        </form>
      </Modal>

      {/* Tahrirlash modal */}
      <Modal isOpen={!!editManager} onClose={() => setEditManager(null)} title="Menejerni tahrirlash">
        {editManager && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateMutation.mutate(editManager);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm text-secondary mb-1">Ism</label>
              <input
                type="text"
                value={editManager.name}
                onChange={(e) => setEditManager({ ...editManager, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Username</label>
              <input
                type="email"
                value={editManager.email}
                onChange={(e) => setEditManager({ ...editManager, email: e.target.value })}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white"
                required
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditManager(null)}>
                Bekor qilish
              </Button>
              <Button type="submit" loading={updateMutation.isPending}>
                Saqlash
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Arxivlash tasdiqlash modal */}
      <Modal isOpen={!!archiveId} onClose={() => setArchiveId(null)} title="Menejerni arxivlash" size="sm">
        <p className="text-secondary mb-6 text-sm">
          Ushbu menejerni haqiqatan ham arxivlashni xohlaysizmi?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setArchiveId(null)}>
            Bekor qilish
          </Button>
          <Button
            loading={archiveMutation.isPending}
            onClick={() => archiveId && archiveMutation.mutate(archiveId)}
          >
            Arxivlash
          </Button>
        </div>
      </Modal>

      {/* O'chirish tasdiqlash modal */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Menejerni o'chirish" size="sm">
        <p className="text-secondary mb-6 text-sm">
          Haqiqatan ham bu menejerni o'chirmoqchimisiz?
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => setDeleteId(null)}>
            Bekor qilish
          </Button>
          <Button
            variant="danger"
            loading={deleteMutation.isPending}
            onClick={() => deleteId && deleteMutation.mutate(deleteId)}
          >
            O'chirish
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default ManagersTab;
