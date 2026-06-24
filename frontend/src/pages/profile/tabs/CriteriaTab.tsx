import React, { useState, useRef } from "react";
import ReactQuill from "react-quill";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import EditIcon from "../../../components/icons/EditIcon";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { SkeletonCriteria } from "../../../components/ui/Skeleton";
import { criteriaService } from "../../../services/criteria.service";
import { CriteriaCategory, Criteria } from "../../../types";

const CriteriaTab: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [showCriteriaModal, setShowCriteriaModal] = useState(false);
  const [editCriteria, setEditCriteria] = useState<{ id: string; name: string; description: string; weight: number } | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categoryDesc, setCategoryDesc] = useState("");
  const [editCategory, setEditCategory] = useState<{ id: string; name: string; description: string } | null>(null);
  const [criteriaName, setCriteriaName] = useState("");
  const [criteriaDesc, setCriteriaDesc] = useState("");
  const [criteriaWeight, setCriteriaWeight] = useState(20);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [localCriteria, setLocalCriteria] = useState<Criteria[] | null>(null);

  const { data: categories, isLoading } = useQuery({
    queryKey: ["criteria"],
    queryFn: criteriaService.getAll,
    select: (data: CriteriaCategory[]) => {
      if (!selectedCategoryId && data.length > 0) {
        setSelectedCategoryId(data[0].id);
      }
      return data;
    },
  });

  const createCategoryMutation = useMutation({
    mutationFn: () => criteriaService.createCategory({ name: categoryName, description: categoryDesc }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
      toast.success("Kategoriya yaratildi");
      setShowCategoryModal(false);
      setCategoryName("");
      setCategoryDesc("");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: criteriaService.deleteCategory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
      toast.success("Kategoriya o'chirildi");
      setSelectedCategoryId(null);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, name, description }: { id: string; name: string; description: string }) =>
      criteriaService.updateCategory(id, { name, description }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
      toast.success("Kategoriya yangilandi");
      setEditCategory(null);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const createCriteriaMutation = useMutation({
    mutationFn: () =>
      criteriaService.createCriteria({
        categoryId: selectedCategoryId!,
        name: criteriaName,
        description: criteriaDesc,
        weight: criteriaWeight,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
      toast.success("Mezon qo'shildi");
      setShowCriteriaModal(false);
      setCriteriaName("");
      setCriteriaDesc("");
      setCriteriaWeight(20);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const updateCriteriaMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; name: string; description: string; weight: number }) =>
      criteriaService.updateCriteria(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
      toast.success("Mezon yangilandi");
      setEditCriteria(null);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const deleteCriteriaMutation = useMutation({
    mutationFn: criteriaService.deleteCriteria,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
      toast.success("Mezon o'chirildi");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  // Drag handlers
  const dragData = useRef<{ items: Criteria[]; fromIndex: number } | null>(null);

  const moveCategory = (index: number, direction: "up" | "down") => {
    if (!categories) return;
    const items = [...categories];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    [items[index], items[newIndex]] = [items[newIndex], items[index]];
    const ids = items.map((c) => c.id);
    criteriaService.reorder(ids, "category").then(() => {
      toast.success("Tartib saqlandi");
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
    }).catch(() => toast.error("Tartibni saqlashda xatolik"));
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    const items = [...(localCriteria || selectedCategory?.criteria || [])];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= items.length) return;
    [items[index], items[newIndex]] = [items[newIndex], items[index]];
    setLocalCriteria(items);
    const ids = items.map((c) => c.id);
    criteriaService.reorder(ids).then(() => {
      toast.success("Tartib saqlandi");
      queryClient.invalidateQueries({ queryKey: ["criteria"] });
    }).catch(() => toast.error("Tartibni saqlashda xatolik"));
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragIndex(index);
    const selected = categories?.find((c) => c.id === selectedCategoryId);
    if (selected) {
      const items = [...selected.criteria];
      if (localCriteria) items.splice(0, items.length, ...localCriteria);
      dragData.current = { items, fromIndex: index };
      setLocalCriteria(items);
    }
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndex === null || dragIndex === index) return;
    setOverIndex(index);

    if (dragData.current) {
      const items = [...dragData.current.items];
      const dragItem = items[dragIndex];
      items.splice(dragIndex, 1);
      items.splice(index, 0, dragItem);
      dragData.current.items = items;
      setLocalCriteria(items);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    const items = dragData.current?.items;
    setDragIndex(null);
    setOverIndex(null);
    if (items && items.length > 0) {
      const ids = items.map((c) => c.id);
      setLocalCriteria(items);
      criteriaService.reorder(ids).then(() => {
        toast.success("Tartib saqlandi");
        queryClient.invalidateQueries({ queryKey: ["criteria"] });
      }).catch(() => toast.error("Tartibni saqlashda xatolik"));
    }
    dragData.current = null;
  };

  if (isLoading) {
    return <SkeletonCriteria />;
  }

  const selectedCategory = categories?.find((c) => c.id === selectedCategoryId);
  const displayCriteria = localCriteria || selectedCategory?.criteria || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Chap panel - Kategoriyalar */}
      <div className="bg-card border border-border rounded-xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="text-base font-semibold text-white">Kategoriyalar</h3>
          <Button size="sm" onClick={() => setShowCategoryModal(true)}>
            <Plus size={14} />
            Yangi kategoriya
          </Button>
        </div>
        <div className="p-3 space-y-1">
          {categories?.map((cat, catIndex) => (
            <div
              key={cat.id}
              className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${
                selectedCategoryId === cat.id
                  ? "bg-accent/10 border border-accent/20"
                  : "hover:bg-primary/50"
              }`}
              onClick={() => {
                setSelectedCategoryId(cat.id);
                setLocalCriteria(null);
              }}
            >
              <div className="flex items-center gap-2">
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={(e) => { e.stopPropagation(); moveCategory(catIndex, "up"); }}
                    disabled={catIndex === 0}
                    className="p-0.5 text-secondary hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); moveCategory(catIndex, "down"); }}
                    disabled={catIndex === (categories?.length || 0) - 1}
                    className="p-0.5 text-secondary hover:text-white disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
                <div>
                  <div className="text-white text-sm font-medium">{cat.name}</div>
                  <div className="text-secondary text-xs">{cat.criteria.length} ta mezon</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditCategory({ id: cat.id, name: cat.name, description: cat.description || "" });
                  }}
                  className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
                  title="Tahrirlash"
                >
                  <EditIcon size={16} />
                </button>
                {cat.name !== "Boshqa" && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`"${cat.name}" kategoriyasini o'chirishni xohlaysizmi?`)) {
                        deleteCategoryMutation.mutate(cat.id);
                      }
                    }}
                    className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                    title="O'chirish"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
          {(!categories || categories.length === 0) && (
            <p className="text-sm text-secondary text-center py-4">Kategoriya yo'q</p>
          )}
        </div>
      </div>

      {/* O'ng panel - Mezonlar */}
      <div className="lg:col-span-2">
        <div className="bg-card border border-border rounded-xl">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h3 className="text-base font-semibold text-white">
              {selectedCategory ? `"${selectedCategory.name}" mezonlari` : "Kategoriya tanlang"}
            </h3>
            {selectedCategory && (
              <Button size="sm" onClick={() => setShowCriteriaModal(true)}>
                <Plus size={14} />
                Yangi mezon
              </Button>
            )}
          </div>

          <div className="p-4">
            {selectedCategory ? (
              <div className="space-y-3">
                {displayCriteria.map((c, index) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`bg-primary/50 rounded-xl p-4 cursor-grab active:cursor-grabbing transition-all border border-transparent hover:border-border ${
                      dragIndex === index ? "opacity-50 scale-[0.98]" : ""
                    } ${overIndex === index && dragIndex !== index ? "border-t-2 border-accent" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Move buttons */}
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); moveItem(index, "up"); }}
                          disabled={index === 0}
                          className="p-0.5 text-secondary hover:text-white disabled:opacity-20 transition-colors"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); moveItem(index, "down"); }}
                          disabled={index === displayCriteria.length - 1}
                          className="p-0.5 text-secondary hover:text-white disabled:opacity-20 transition-colors"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-accent font-bold text-sm">{index + 1}.</span>
                          <span className="text-white font-medium text-sm">{c.name}</span>
                        </div>
                        <div className="text-secondary text-sm leading-relaxed [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-white [&_h1]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-white [&_h2]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-white [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:text-white [&_strong]:font-semibold [&_a]:text-accent [&_a]:underline" dangerouslySetInnerHTML={{ __html: c.description }} />
                      </div>

                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() =>
                            setEditCriteria({
                              id: c.id,
                              name: c.name,
                              description: c.description,
                              weight: c.weight,
                            })
                          }
                          className="p-2 text-accent hover:bg-accent/10 rounded-lg transition-colors"
                          title="Tahrirlash"
                        >
                          <EditIcon size={18} />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`"${c.name}" mezonini o'chirishni xohlaysizmi?`)) {
                              deleteCriteriaMutation.mutate(c.id);
                            }
                          }}
                          className="p-2 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                          title="O'chirish"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {displayCriteria.length === 0 && (
                  <p className="text-sm text-secondary text-center py-8">Hali mezon qo'shilmagan</p>
                )}
              </div>
            ) : (
              <p className="text-secondary text-center py-8">Chap paneldan kategoriya tanlang</p>
            )}
          </div>
        </div>
      </div>

      {/* Kategoriya qo'shish modal */}
      <Modal isOpen={showCategoryModal} onClose={() => setShowCategoryModal(false)} title="Yangi kategoriya" size="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createCategoryMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm text-secondary mb-1">Nomi</label>
            <input
              type="text"
              value={categoryName}
              onChange={(e) => setCategoryName(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Tavsif</label>
            <textarea
              value={categoryDesc}
              onChange={(e) => setCategoryDesc(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white resize-none"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCategoryModal(false)}>Bekor qilish</Button>
            <Button type="submit" loading={createCategoryMutation.isPending}>Yaratish</Button>
          </div>
        </form>
      </Modal>

      {/* Mezon qo'shish modal */}
      <Modal isOpen={showCriteriaModal} onClose={() => setShowCriteriaModal(false)} title="Yangi mezon" size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            createCriteriaMutation.mutate();
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-sm text-secondary mb-1">Nomi</label>
            <input
              type="text"
              value={criteriaName}
              onChange={(e) => setCriteriaName(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Tavsif</label>
            <div className="quill-dark">
              <ReactQuill
                theme="snow"
                value={criteriaDesc}
                onChange={setCriteriaDesc}
                placeholder="Mezon tavsifini kiriting..."
                modules={{
                  toolbar: [
                    [{ header: [1, 2, 3, false] }],
                    ["bold", "italic", "underline"],
                    [{ list: "ordered" }, { list: "bullet" }],
                    ["link"],
                    ["clean"],
                  ],
                }}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Vazn: {criteriaWeight}%</label>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={criteriaWeight}
              onChange={(e) => setCriteriaWeight(Number(e.target.value))}
              className="w-full accent-accent"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowCriteriaModal(false)}>Bekor qilish</Button>
            <Button type="submit" loading={createCriteriaMutation.isPending}>Qo'shish</Button>
          </div>
        </form>
      </Modal>

      {/* Mezon tahrirlash modal */}
      <Modal isOpen={!!editCriteria} onClose={() => setEditCriteria(null)} title="Mezonni tahrirlash" size="lg">
        {editCriteria && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateCriteriaMutation.mutate(editCriteria);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm text-secondary mb-1">Nomi</label>
              <input
                type="text"
                value={editCriteria.name}
                onChange={(e) => setEditCriteria({ ...editCriteria, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Tavsif</label>
              <div className="quill-dark">
                <ReactQuill
                  theme="snow"
                  value={editCriteria.description}
                  onChange={(val) => setEditCriteria({ ...editCriteria, description: val })}
                  placeholder="Mezon tavsifini kiriting..."
                  modules={{
                    toolbar: [
                      ["bold", "italic", "underline"],
                      [{ list: "ordered" }, { list: "bullet" }],
                      ["clean"],
                    ],
                  }}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Vazn: {editCriteria.weight}%</label>
              <input
                type="range"
                min={5}
                max={100}
                step={5}
                value={editCriteria.weight}
                onChange={(e) => setEditCriteria({ ...editCriteria, weight: Number(e.target.value) })}
                className="w-full accent-accent"
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditCriteria(null)}>Bekor qilish</Button>
              <Button type="submit" loading={updateCriteriaMutation.isPending}>Saqlash</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Kategoriya tahrirlash modal */}
      <Modal isOpen={!!editCategory} onClose={() => setEditCategory(null)} title="Kategoriyani tahrirlash" size="sm">
        {editCategory && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateCategoryMutation.mutate(editCategory);
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm text-secondary mb-1">Nomi</label>
              <input
                type="text"
                value={editCategory.name}
                onChange={(e) => setEditCategory({ ...editCategory, name: e.target.value })}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Tavsif</label>
              <textarea
                value={editCategory.description}
                onChange={(e) => setEditCategory({ ...editCategory, description: e.target.value })}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white resize-none"
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setEditCategory(null)}>Bekor qilish</Button>
              <Button type="submit" loading={updateCategoryMutation.isPending}>Saqlash</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};

export default CriteriaTab;
