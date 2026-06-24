import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type NodeProps,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import toast from "react-hot-toast";
import dagre from "dagre";
import {
  Sparkles,
  Loader2,
  LayoutGrid,
  Save,
  Edit2,
  Check,
  X,
  Maximize2,
  Minimize2,
  FileText,
} from "lucide-react";
import {
  scenariosService,
  Scenario,
  ScenarioCategory,
  ScenarioSection,
} from "../../services/scenarios.service";

const CATEGORY_META: Record<
  ScenarioCategory,
  { label: string; emoji: string; color: string; description: string }
> = {
  presale: {
    label: "1-qo'ng'iroq (Pre Sale)",
    emoji: "📞",
    color: "#3b82f6",
    description: "Birinchi aloqa — kvalifikatsiya va uchrashuv belgilash",
  },
  qayta: {
    label: "Qayta qo'ng'iroq",
    emoji: "🔄",
    color: "#a855f7",
    description: "O'ylab ko'raman degan mijozga qaytadan murojaat",
  },
  sotuv: {
    label: "Sotuv (uchrashuv)",
    emoji: "💼",
    color: "#22c55e",
    description: "Uchrashuvdagi taqdimot, e'tirozlar va kelishuv",
  },
  aftersale: {
    label: "After Sale",
    emoji: "🎁",
    color: "#f59e0b",
    description: "Sotuvdan keyin g'amxo'rlik qo'ng'irog'i",
  },
};

type NodeKind = "stage" | "manager" | "client";

type LocatorMain = {
  kind: "sectionTitle" | "managerScript";
  secIndex: number;
};
type LocatorBranch = {
  kind: "clientResponse" | "managerReply";
  secIndex: number;
  brIndex: number;
};
type Locator = LocatorMain | LocatorBranch;

interface NodeData extends Record<string, unknown> {
  label: string;
  content: string;
  kind: NodeKind;
  locator: Locator;
  onEdit: (locator: Locator, content: string) => void;
}

const NODE_WIDTH = 320;

// Matn ichida **bold** va "- bullet" qatorlarni HTML-ga aylantiramiz
function formatInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**") && p.length > 4) {
      return <strong key={i}>{p.slice(2, -2)}</strong>;
    }
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}

function renderFormattedContent(text: string): React.ReactNode {
  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = () => {
    if (bullets.length > 0) {
      blocks.push(
        <ul
          key={`ul-${blocks.length}`}
          className="list-disc list-inside space-y-1 my-1 pl-1"
        >
          {bullets.map((b, i) => (
            <li key={i} className="text-sm leading-snug">
              {formatInline(b)}
            </li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const m = line.match(/^\s*[-*•]\s+(.+)$/);
    if (m) {
      bullets.push(m[1]);
    } else {
      flush();
      if (line.length === 0) {
        blocks.push(<div key={`br-${blocks.length}`} className="h-1" />);
      } else {
        blocks.push(
          <p
            key={`p-${blocks.length}`}
            className="text-sm leading-relaxed my-0.5"
          >
            {formatInline(line)}
          </p>
        );
      }
    }
  }
  flush();
  return <div>{blocks}</div>;
}

// Node balandligini matn uzunligi bo'yicha taxminlash (dagre layoutga aniq size berish uchun)
function estimateNodeHeight(kind: NodeKind, content: string): number {
  const headerH = 32;
  const vPadding = 26;
  if (kind === "stage") return headerH + 24;

  const avgCharsPerLine = 38;
  let logicalLines = 0;
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) {
      logicalLines += 0.5;
      continue;
    }
    logicalLines += Math.max(1, Math.ceil(line.length / avgCharsPerLine));
  }
  return headerH + vPadding + Math.ceil(logicalLines * 20);
}

function sectionsToGraph(
  sections: ScenarioSection[],
  onEdit: (locator: Locator, content: string) => void
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const nodes: Node<NodeData>[] = [];
  const edges: Edge[] = [];
  let lastStageId: string | null = null;

  sections.forEach((sec, i) => {
    // Stage — sarlavha
    const stageId = `s${i}-stage`;
    nodes.push({
      id: stageId,
      type: "custom",
      position: { x: 0, y: 0 },
      data: {
        label: `${i + 1}. Bosqich`,
        content: sec.title,
        kind: "stage",
        locator: { kind: "sectionTitle", secIndex: i },
        onEdit,
      },
    });
    if (lastStageId) {
      edges.push({
        id: `e-${lastStageId}-${stageId}`,
        source: lastStageId,
        target: stageId,
        style: { stroke: "#64748b", strokeWidth: 2, strokeDasharray: "5 5" },
        animated: false,
      });
    }

    // Manager script
    const managerId = `s${i}-mgr`;
    nodes.push({
      id: managerId,
      type: "custom",
      position: { x: 0, y: 0 },
      data: {
        label: "Menejer gapi",
        content: sec.managerScript,
        kind: "manager",
        locator: { kind: "managerScript", secIndex: i },
        onEdit,
      },
    });
    edges.push({
      id: `e-${stageId}-${managerId}`,
      source: stageId,
      target: managerId,
      style: { stroke: "#3b82f6", strokeWidth: 2 },
    });

    // Branches — mijoz javob variantlari
    (sec.branches || []).forEach((br, j) => {
      const clientId = `s${i}-br${j}-client`;
      const replyId = `s${i}-br${j}-reply`;
      nodes.push({
        id: clientId,
        type: "custom",
        position: { x: 0, y: 0 },
        data: {
          label: "Mijoz javobi",
          content: br.clientResponse,
          kind: "client",
          locator: { kind: "clientResponse", secIndex: i, brIndex: j },
          onEdit,
        },
      });
      nodes.push({
        id: replyId,
        type: "custom",
        position: { x: 0, y: 0 },
        data: {
          label: "Menejer javobi",
          content: br.managerReply,
          kind: "manager",
          locator: { kind: "managerReply", secIndex: i, brIndex: j },
          onEdit,
        },
      });
      edges.push({
        id: `e-${managerId}-${clientId}`,
        source: managerId,
        target: clientId,
        label: j === 0 ? "javob variantlari" : undefined,
        style: { stroke: "#a855f7", strokeWidth: 1.5 },
      });
      edges.push({
        id: `e-${clientId}-${replyId}`,
        source: clientId,
        target: replyId,
        style: { stroke: "#3b82f6", strokeWidth: 1.5 },
      });
    });

    lastStageId = stageId;
  });

  return applyDagreLayout(nodes, edges);
}

function applyDagreLayout(
  nodes: Node<NodeData>[],
  edges: Edge[]
): { nodes: Node<NodeData>[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", nodesep: 80, ranksep: 100, edgesep: 40 });

  nodes.forEach((n) => {
    const h = estimateNodeHeight(n.data.kind, n.data.content);
    g.setNode(n.id, { width: NODE_WIDTH, height: h });
  });
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);

  return {
    nodes: nodes.map((n) => {
      const pos = g.node(n.id);
      const h = estimateNodeHeight(n.data.kind, n.data.content);
      return {
        ...n,
        position: {
          x: (pos?.x ?? 0) - NODE_WIDTH / 2,
          y: (pos?.y ?? 0) - h / 2,
        },
      };
    }),
    edges,
  };
}

// ═══ Custom Node (stage / manager / client) ════════════════════════
const KIND_STYLE: Record<
  NodeKind,
  { bg: string; border: string; labelBg: string; emoji: string }
> = {
  stage: {
    bg: "linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)",
    border: "#f59e0b",
    labelBg: "#f59e0b",
    emoji: "🏁",
  },
  manager: {
    bg: "linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%)",
    border: "#3b82f6",
    labelBg: "#3b82f6",
    emoji: "🧑‍💼",
  },
  client: {
    bg: "linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)",
    border: "#a855f7",
    labelBg: "#a855f7",
    emoji: "👤",
  },
};

const CustomNode: React.FC<NodeProps> = ({ data }) => {
  const d = data as NodeData;
  const style = KIND_STYLE[d.kind];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.content);

  useEffect(() => {
    if (!editing) setDraft(d.content);
  }, [d.content, editing]);

  const save = () => {
    d.onEdit(d.locator, draft);
    setEditing(false);
  };
  const cancel = () => {
    setDraft(d.content);
    setEditing(false);
  };

  return (
    <div
      className="rounded-xl shadow-md border-2 overflow-hidden"
      style={{
        width: NODE_WIDTH,
        background: style.bg,
        borderColor: style.border,
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: style.border }} />

      {/* Label */}
      <div
        className="px-3 py-1.5 flex items-center justify-between gap-2"
        style={{ backgroundColor: style.labelBg }}
      >
        <div className="flex items-center gap-1.5">
          <span className="text-sm">{style.emoji}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-white">
            {d.label}
          </span>
        </div>
        {!editing && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditing(true);
            }}
            className="p-0.5 rounded hover:bg-white/20 transition-colors"
            title="Tahrirlash"
          >
            <Edit2 size={12} className="text-white" />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-3">
        {editing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") cancel();
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
              }}
              className="w-full text-sm p-2 rounded border focus:outline-none focus:ring-2 resize-none"
              style={{
                backgroundColor: "#fff",
                borderColor: style.border,
                minHeight: 80,
                color: "#1e293b",
              }}
              autoFocus
            />
            <div className="flex gap-1 justify-end">
              <button
                onClick={cancel}
                className="p-1 rounded hover:opacity-70"
                style={{ color: "#64748b" }}
                title="Bekor qilish (Esc)"
              >
                <X size={14} />
              </button>
              <button
                onClick={save}
                className="p-1 rounded text-white"
                style={{ backgroundColor: style.border }}
                title="Saqlash (Ctrl+Enter)"
              >
                <Check size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div
            className={d.kind === "stage" ? "font-bold" : ""}
            style={{ color: "#1e293b" }}
          >
            {renderFormattedContent(d.content)}
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: style.border }} />
    </div>
  );
};

const nodeTypes = { custom: CustomNode };

// localStorage helperlar — har scenario uchun qo'l bilan joylashtirilgan layout
const layoutKey = (scenarioId: string) => `scenario-layout-${scenarioId}`;

function loadLayout(
  scenarioId: string
): Record<string, { x: number; y: number }> | null {
  try {
    const raw = localStorage.getItem(layoutKey(scenarioId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLayout(
  scenarioId: string,
  positions: Record<string, { x: number; y: number }>
): void {
  localStorage.setItem(layoutKey(scenarioId), JSON.stringify(positions));
}

function clearLayout(scenarioId: string): void {
  localStorage.removeItem(layoutKey(scenarioId));
}

// ═══ Flow for single category ══════════════════════════════════════
const ScenarioFlow: React.FC<{
  scenario: Scenario;
  onSectionsChange: (sections: ScenarioSection[]) => void;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}> = ({ scenario, onSectionsChange, fullscreen, onToggleFullscreen }) => {
  const [sections, setSections] = useState<ScenarioSection[]>(
    scenario.sections || []
  );
  const [dirtyLayout, setDirtyLayout] = useState(false);

  useEffect(() => {
    setSections(scenario.sections || []);
  }, [scenario.sections]);

  const applyEdit = useCallback(
    (locator: Locator, content: string) => {
      setSections((prev) => {
        const next = JSON.parse(JSON.stringify(prev)) as ScenarioSection[];
        if (locator.kind === "sectionTitle") {
          next[locator.secIndex].title = content;
        } else if (locator.kind === "managerScript") {
          next[locator.secIndex].managerScript = content;
        } else if (locator.kind === "clientResponse") {
          const br = next[locator.secIndex].branches?.[locator.brIndex];
          if (br) br.clientResponse = content;
        } else if (locator.kind === "managerReply") {
          const br = next[locator.secIndex].branches?.[locator.brIndex];
          if (br) br.managerReply = content;
        }
        onSectionsChange(next);
        return next;
      });
    },
    [onSectionsChange]
  );

  // Graph — dagre avtomatik yoki localStorage'dan qayta tiklanadi
  const graph = useMemo(() => {
    const g = sectionsToGraph(sections, applyEdit);
    const saved = loadLayout(scenario.id);
    if (saved) {
      g.nodes = g.nodes.map((n) =>
        saved[n.id] ? { ...n, position: saved[n.id] } : n
      );
    }
    return g;
  }, [sections, applyEdit, scenario.id]);

  const [nodes, setNodes] = useState<Node<NodeData>[]>(graph.nodes);
  const [edges, setEdges] = useState<Edge[]>(graph.edges);

  useEffect(() => {
    setNodes(graph.nodes);
    setEdges(graph.edges);
  }, [graph]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => applyNodeChanges(changes, nds) as Node<NodeData>[]);
    // position'ni user sudragan bo'lsa, dirtyLayout'ni yoqamiz
    if (changes.some((c) => c.type === "position" && c.dragging)) {
      setDirtyLayout(true);
    }
  }, []);
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const relayout = () => {
    clearLayout(scenario.id);
    const laidOut = applyDagreLayout(graph.nodes, graph.edges);
    setNodes(laidOut.nodes);
    setEdges(laidOut.edges);
    setDirtyLayout(false);
    toast.success("Avto-tartiblandi");
  };

  const saveLayoutNow = () => {
    const positions: Record<string, { x: number; y: number }> = {};
    nodes.forEach((n) => {
      positions[n.id] = { x: n.position.x, y: n.position.y };
    });
    saveLayout(scenario.id, positions);
    setDirtyLayout(false);
    toast.success("Joylashuv saqlandi");
  };

  return (
    <div
      style={
        fullscreen
          ? { position: "fixed", inset: 0, zIndex: 100, height: "100vh", marginTop: 0 }
          : { height: "calc(100vh - 240px)", minHeight: 600, }
      }
      className={
        fullscreen
          ? "overflow-hidden relative bg-white"
          : "rounded-xl border overflow-hidden relative"
      }
    >
      <ReactFlowProvider>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.15}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} color="var(--color-border)" />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as NodeData | undefined;
              if (!d?.kind) return "#64748b";
              return KIND_STYLE[d.kind].border;
            }}
            style={{ backgroundColor: "var(--color-card-bg)" }}
          />
        </ReactFlow>
      </ReactFlowProvider>

      {/* Floating buttons */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {dirtyLayout && (
          <button
            onClick={saveLayoutNow}
            className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg font-semibold text-sm text-white transition-all"
            style={{ backgroundColor: "#22c55e" }}
            title="Joriy joylashuvni saqlash"
          >
            <Save size={14} />
            Joylashuvni saqlash
          </button>
        )}
        <button
          onClick={relayout}
          className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg font-semibold text-sm transition-all"
          style={{
            backgroundColor: "var(--color-card-bg)",
            color: "var(--text-primary)",
            border: "1px solid var(--color-border)",
          }}
          title="Avtomatik tartiblash (saqlangan layout o'chadi)"
        >
          <LayoutGrid size={14} />
          Avto-tartiblash
        </button>
        <button
          onClick={onToggleFullscreen}
          className="flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg font-semibold text-sm transition-all"
          style={{
            backgroundColor: "var(--color-card-bg)",
            color: "var(--text-primary)",
            border: "1px solid var(--color-border)",
          }}
          title={
            fullscreen ? "Oddiy ko'rinish (ESC)" : "To'liq ekran rejimi"
          }
        >
          {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {fullscreen ? "Chiqish" : "To'liq ekran"}
        </button>
      </div>
    </div>
  );
};

// ═══ Main Page ═════════════════════════════════════════════════════
const ScenarioPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ScenarioCategory>("presale");
  const [draftSections, setDraftSections] = useState<
    Partial<Record<string, ScenarioSection[]>>
  >({});
  const [fullscreen, setFullscreen] = useState(false);
  const qc = useQueryClient();

  // ESC bilan fullscreen'dan chiqish + body scroll lock
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  const { data: scenarios, isLoading } = useQuery({
    queryKey: ["scenarios"],
    queryFn: () => scenariosService.list(),
  });

  const generateMutation = useMutation({
    mutationFn: () => scenariosService.generateAll(),
    onSuccess: (result) => {
      if (result.generated === 4) {
        toast.success(`Barchasi tayyor (${result.generated}/4)`);
      } else {
        toast.error(`${result.generated}/4 tayyor, ${result.failed} xatolik`);
        result.errors.forEach((e) => console.error("Scenario error:", e));
      }
      setDraftSections({});
      qc.invalidateQueries({ queryKey: ["scenarios"] });
    },
    onError: (err: Error) => toast.error(err.message || "Yaratishda xatolik"),
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, sections }: { id: string; sections: ScenarioSection[] }) =>
      scenariosService.update(id, { sections }),
    onSuccess: (_data, variables) => {
      toast.success("Saqlandi");
      setDraftSections((prev) => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["scenarios"] });
    },
    onError: (err: Error) => toast.error(err.message || "Saqlashda xatolik"),
  });

  const byCategory = useMemo(() => {
    const map: Partial<Record<ScenarioCategory, Scenario>> = {};
    (scenarios || []).forEach((s) => {
      map[s.category] = s;
    });
    return map;
  }, [scenarios]);

  const active = byCategory[activeTab];
  const hasUnsaved = active && draftSections[active.id] !== undefined;

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const handleDownloadDocx = useCallback(async (scenario: Scenario) => {
    try {
      setDownloadingId(scenario.id);
      const baseName =
        (scenario.title || CATEGORY_META[scenario.category]?.label || "scenario")
          .replace(/[^\p{L}\p{N}\s-]/gu, "")
          .trim()
          .replace(/\s+/g, "-") || "scenario";
      await scenariosService.downloadDocx(scenario.id, baseName);
      toast.success("DOCX yuklab olindi");
    } catch (err) {
      console.error("DOCX download error:", err);
      toast.error("DOCX yuklashda xatolik");
    } finally {
      setDownloadingId(null);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-black flex items-center gap-2"
            style={{ color: "var(--text-primary)" }}
          >
            <Sparkles size={22} style={{ color: "#f59e0b" }} />
            Oltin Senariylar
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: "var(--text-secondary)" }}
          >
            Har qadamni alohida karta qilib ko'ring · tahrirlash · Ctrl+Enter bilan saqlash
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsaved && active && (
            <button
              onClick={() =>
                saveMutation.mutate({
                  id: active.id,
                  sections: draftSections[active.id]!,
                })
              }
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-white transition-all disabled:opacity-60"
              style={{ backgroundColor: "#22c55e" }}
            >
              {saveMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              O'zgarishlarni saqlash
            </button>
          )}
          {active && (
            <button
              onClick={() => handleDownloadDocx(active)}
              disabled={downloadingId === active.id || hasUnsaved}
              title={
                hasUnsaved
                  ? "Avval o'zgarishlarni saqlang"
                  : "Bu senariyni .docx fayl qilib yuklab olish"
              }
              className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold transition-all disabled:opacity-60"
              style={{
                backgroundColor: "var(--color-card-bg)",
                color: "var(--text-primary)",
                border: "1px solid var(--color-border)",
              }}
            >
              {downloadingId === active.id ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Yuklanmoqda...
                </>
              ) : (
                <>
                  <FileText size={16} />
                  DOCX yuklab olish
                </>
              )}
            </button>
          )}
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-white transition-all disabled:opacity-60"
            style={{
              background:
                "linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)",
            }}
          >
            {generateMutation.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Yaratilmoqda...
              </>
            ) : (
              <>
                <Sparkles size={16} />
                AI bilan qayta yaratish
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl border overflow-x-auto"
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        {(Object.keys(CATEGORY_META) as ScenarioCategory[]).map((cat) => {
          const meta = CATEGORY_META[cat];
          const isActive = activeTab === cat;
          const exists = !!byCategory[cat];
          const dirty = byCategory[cat] && draftSections[byCategory[cat]!.id];
          return (
            <button
              key={cat}
              onClick={() => setActiveTab(cat)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-all whitespace-nowrap"
              style={{
                backgroundColor: isActive ? meta.color : "transparent",
                color: isActive
                  ? "#fff"
                  : exists
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
                opacity: exists ? 1 : 0.6,
              }}
            >
              <span>{meta.emoji}</span>
              <span>{meta.label}</span>
              {dirty && (
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" title="Saqlanmagan" />
              )}
              {!exists && (
                <span className="text-[10px] opacity-70">(yo'q)</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Qanday ishlash ko'rsatmasi — boshlang'ich foydalanuvchi uchun */}
      <div
        className="rounded-xl border p-4"
        style={{
          backgroundColor: "var(--color-card-bg)",
          borderColor: "var(--color-border)",
        }}
      >
        <h3
          className="font-bold text-sm mb-3 flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <span>ℹ️</span> Bu sahifa qanday ishlaydi?
        </h3>
        <p
          className="text-xs leading-relaxed mb-3"
          style={{ color: "var(--text-secondary)" }}
        >
          AI sizning real qo'ng'iroqlaringiz va ProSales namunasidan 4 ta batafsil
          sotuv senariysi tuzadi. Har senariy "kartalar zanjiri" ko'rinishida —
          har karta nima qilish kerakligini aniq ko'rsatadi. Kartani bosib
          tahrirlashingiz, sichqoncha bilan sudrab joylashtirishingiz va
          joylashuvni saqlashingiz mumkin.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {[
            {
              emoji: "🏁",
              color: "#f59e0b",
              label: "Bosqich",
              desc: "Suhbatning qaysi qismi: Tanishuv, Kvalifikatsiya, Taqdimot, Narx, E'tiroz, Yakun…",
            },
            {
              emoji: "🧑‍💼",
              color: "#3b82f6",
              label: "Menejer gapi",
              desc: "Sotuvchi aynan nima deyishi kerak — so'zma-so'z skript",
            },
            {
              emoji: "👤",
              color: "#a855f7",
              label: "Mijoz javobi",
              desc: "Mijozning ehtimoliy javob variantlari (\"Ha\", \"Yo'q\", \"Qimmat\", …)",
            },
            {
              emoji: "🧑‍💼",
              color: "#3b82f6",
              label: "Menejer javobi",
              desc: "Har mijoz javobiga qarab qanday qarshi reaksiya bildirish",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="rounded-lg border-l-4 p-2 flex items-start gap-2"
              style={{
                backgroundColor: "var(--color-primary-bg)",
                borderColor: item.color,
              }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-sm"
                style={{ backgroundColor: `${item.color}22` }}
              >
                {item.emoji}
              </div>
              <div className="min-w-0">
                <div
                  className="text-xs font-bold mb-0.5"
                  style={{ color: item.color }}
                >
                  {item.label}
                </div>
                <div
                  className="text-[11px] leading-snug"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Active scenario info */}
      {active && (
        <div
          className="flex items-center justify-between flex-wrap gap-2 px-4 py-3 rounded-xl border"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <div>
            <h2
              className="font-bold text-base"
              style={{ color: "var(--text-primary)" }}
            >
              {active.title}
            </h2>
            <p
              className="text-xs mt-0.5"
              style={{ color: "var(--text-secondary)" }}
            >
              {(draftSections[active.id] || active.sections)?.length || 0} ta bosqich ·{" "}
              {active.isEdited ? "Tahrirlangan" : "AI yaratgan"} ·{" "}
              {new Date(active.generatedAt).toLocaleDateString("uz-UZ")}
            </p>
          </div>
          <p
            className="text-xs italic max-w-md"
            style={{ color: "var(--text-secondary)" }}
          >
            {CATEGORY_META[activeTab].description}
          </p>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div
          className="flex items-center justify-center py-20 rounded-xl border"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : !active ? (
        <div
          className="flex flex-col items-center justify-center py-20 rounded-xl border text-center"
          style={{
            backgroundColor: "var(--color-card-bg)",
            borderColor: "var(--color-border)",
          }}
        >
          <Sparkles size={48} style={{ color: "#f59e0b" }} className="mb-4" />
          <h3
            className="text-lg font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            Senariy hali yaratilmagan
          </h3>
          <p
            className="text-sm mb-4 max-w-md"
            style={{ color: "var(--text-secondary)" }}
          >
            "AI bilan qayta yaratish" tugmasini bosing — AI sizning real
            qo'ng'iroqlar asosida batafsil senariy tuzadi.
          </p>
        </div>
      ) : (
        <ScenarioFlow
          key={active.id}
          scenario={
            draftSections[active.id]
              ? { ...active, sections: draftSections[active.id]! }
              : active
          }
          onSectionsChange={(sections) =>
            setDraftSections((prev) => ({ ...prev, [active.id]: sections }))
          }
          fullscreen={fullscreen}
          onToggleFullscreen={() => setFullscreen((v) => !v)}
        />
      )}
    </div>
  );
};

export default ScenarioPage;
