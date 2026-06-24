// Custdev yaratish — title/description + drag-drop savollar list
// Drag-drop: @dnd-kit/sortable
import React, { useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { custdevService } from "../../services/custdev.service";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}

interface DraftQuestion {
  id: string; // client-side uuid
  text: string;
}

const makeId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Har bir draggable savol item
const QuestionItem: React.FC<{
  q: DraftQuestion;
  onChange: (text: string) => void;
  onRemove: () => void;
}> = ({ q, onChange, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: "transparent",
        border: "1px solid var(--color-border)",
      }}
      className="flex items-center gap-2 rounded-xl p-2.5"
    >
      <button
        {...attributes}
        {...listeners}
        type="button"
        className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-black/10"
        style={{ color: "var(--text-secondary)" }}
        aria-label="Saqlab surish"
      >
        <GripVertical size={16} />
      </button>
      <input
        type="text"
        value={q.text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Savol matni..."
        className="flex-1 focus:outline-none text-sm"
        style={{ color: "var(--text-primary)", backgroundColor: "transparent" }}
      />
      <button
        type="button"
        onClick={onRemove}
        className="p-1.5 rounded-lg transition-colors hover:bg-red-500/10"
        style={{ color: "#ef4444" }}
        aria-label="Savolni o'chirish"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
};

const CustdevCreateModal: React.FC<Props> = ({ isOpen, onClose, onCreated }) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [questions, setQuestions] = useState<DraftQuestion[]>([
    { id: makeId(), text: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const resetForm = (): void => {
    setTitle("");
    setDescription("");
    setQuestions([{ id: makeId(), text: "" }]);
    setErr(null);
  };

  const handleClose = (): void => {
    if (saving) return;
    resetForm();
    onClose();
  };

  const addQuestion = (): void => {
    setQuestions((prev) => [...prev, { id: makeId(), text: "" }]);
  };

  const updateQuestion = (id: string, text: string): void => {
    setQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, text } : q)));
  };

  const removeQuestion = (id: string): void => {
    setQuestions((prev) => (prev.length > 1 ? prev.filter((q) => q.id !== id) : prev));
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setQuestions((prev) => {
      const oldIdx = prev.findIndex((q) => q.id === active.id);
      const newIdx = prev.findIndex((q) => q.id === over.id);
      if (oldIdx === -1 || newIdx === -1) return prev;
      return arrayMove(prev, oldIdx, newIdx);
    });
  };

  const handleSubmit = async (): Promise<void> => {
    setErr(null);
    if (!title.trim()) {
      setErr("Sarlavha majburiy");
      return;
    }
    const cleanQs = questions.map((q) => q.text.trim()).filter(Boolean);
    setSaving(true);
    try {
      const created = await custdevService.create({
        title: title.trim(),
        description: description.trim() || undefined,
        questions: cleanQs.length > 0 ? cleanQs : undefined,
      });
      resetForm();
      onCreated(created.id);
    } catch (e: any) {
      setErr(
        e?.response?.data?.error || e?.message || "Xatolik yuz berdi"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Yangi Custdev loyihasi" size="lg">
      <div className="space-y-4">
        <div>
          <label
            className="block text-xs font-semibold mb-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Sarlavha *
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Masalan, 'Yangi mijozlar uchun onboarding'"
            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none"
            style={{
              backgroundColor: "var(--ds-bg-overlay, rgba(0,0,0,0.03))",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
          />
        </div>

        <div>
          <label
            className="block text-xs font-semibold mb-1.5"
            style={{ color: "var(--text-secondary)" }}
          >
            Tavsif (ixtiyoriy)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Loyihaning maqsadi, qamrovi va mijozlar segmenti"
            rows={3}
            className="w-full px-3 py-2.5 rounded-xl text-sm focus:outline-none resize-none"
            style={{
              backgroundColor: "var(--ds-bg-overlay, rgba(0,0,0,0.03))",
              color: "var(--text-primary)",
              border: "1px solid var(--color-border)",
            }}
          />
        </div>

        <div>
          <label
            className="block text-xs font-semibold mb-2"
            style={{ color: "var(--text-secondary)" }}
          >
            Savollarni tuzing (drag bilan qayta tartiblang)
          </label>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={questions.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {questions.map((q) => (
                  <QuestionItem
                    key={q.id}
                    q={q}
                    onChange={(text) => updateQuestion(q.id, text)}
                    onRemove={() => removeQuestion(q.id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          <button
            type="button"
            onClick={addQuestion}
            className="mt-2 w-full inline-flex items-center justify-center gap-1 text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
            style={{
              backgroundColor: "#8b5cf615",
              color: "#8b5cf6",
              border: "1px dashed #8b5cf655",
            }}
          >
            <Plus size={13} />
            Savol qo'shish
          </button>
        </div>

        {err && (
          <div
            className="text-xs px-3 py-2 rounded-lg"
            style={{
              backgroundColor: "#ef444411",
              color: "#ef4444",
              border: "1px solid #ef444433",
            }}
          >
            {err}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{
              color: "var(--text-secondary)",
              backgroundColor: "transparent",
              border: "1px solid var(--color-border)",
            }}
          >
            <X size={14} className="inline -mt-0.5 mr-1" />
            Bekor
          </button>
          <Button onClick={handleSubmit} loading={saving} disabled={saving}>
            <Plus size={14} />
            Yaratish
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default CustdevCreateModal;
