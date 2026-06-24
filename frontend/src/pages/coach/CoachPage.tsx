import React, { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { coachService, ChatSession } from "../../services/coach.service";
import { ArrowUp, Sparkles, Plus, Trash2, ArrowLeft, PanelLeft, Search, X, Sun, Moon } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const formatMarkdown = (text: string): string => {
  return text
    .replace(/```([\s\S]*?)```/g, '<pre style="background: var(--color-primary-bg); padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 13px; margin: 8px 0;">$1</pre>')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color: var(--text-primary, #fff)">$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<h3 style="color: var(--text-primary, #fff); font-size: 0.95rem; font-weight: 600; margin-top: 12px; margin-bottom: 4px;">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="color: var(--text-primary, #fff); font-size: 1.05rem; font-weight: 700; margin-top: 16px; margin-bottom: 4px;">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="color: var(--text-primary, #fff); font-size: 1.15rem; font-weight: 700; margin-top: 20px; margin-bottom: 6px;">$1</h1>')
    .replace(/^- (.+)$/gm, '<div style="display: flex; gap: 6px; margin-left: 8px;"><span style="color: #3b5ef5;">•</span><span>$1</span></div>')
    .replace(/^(\d+)\. (.+)$/gm, '<div style="display: flex; gap: 6px; margin-left: 8px;"><span style="color: #3b5ef5; font-weight: 600;">$1.</span><span>$2</span></div>')
    .replace(/^---$/gm, '<hr style="border: none; border-top: 1px solid var(--color-border); margin: 16px 0;" />')
    .replace(/\|.+\|/g, "")
    .replace(/\n\n/g, '<div style="height: 12px;"></div>')
    .replace(/\n/g, "<br/>");
};

const QUICK_PROMPTS = [
  { label: "Jamoa tahlili", prompt: "Jamoaning umumiy holatini tahlil qilib, eng zaif va eng kuchli menejerlarni ko'rsat" },
  { label: "Haftalik reja", prompt: "Bu hafta uchun jamoa treningi rejasini tayyorla" },
  { label: "Eng zaif menejer", prompt: "Eng past natija ko'rsatayotgan menejerni aniqlab, unga shaxsiy trening tayyorla" },
  { label: "E'tirozlarga javob", prompt: "Eng ko'p uchraydigan e'tirozlarga javob berish bo'yicha trening tayyorla" },
];

const timeAgo = (dateStr: string): string => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "hozirgina";
  if (mins < 60) return `${mins} daq oldin`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} kun oldin`;
  return new Date(dateStr).toLocaleDateString("uz");
};

const CoachPage: React.FC = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedManager, setSelectedManager] = useState<string>("all");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomInputRef = useRef<HTMLTextAreaElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    const root = document.documentElement;
    root.classList.remove("dark", "light");
    root.classList.add(next);
  };

  useQuery({ queryKey: ["coach-overview"], queryFn: coachService.getOverview });
  const { data: sessions, refetch: refetchSessions } = useQuery({ queryKey: ["chat-sessions"], queryFn: coachService.getSessions });

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (searchMode) searchInputRef.current?.focus();
  }, [searchMode]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const sendMessage = async (text?: string) => {
    const content = text || input.trim();
    if (!content || loading) return;
    let sessionId = activeSessionId;
    if (!sessionId) {
      const session = await coachService.createSession(selectedManager !== "all" ? selectedManager : undefined);
      sessionId = session.id;
      setActiveSessionId(sessionId);
    }
    const userMessage: ChatMessage = { role: "user", content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    if (inputRef.current) inputRef.current.style.height = "auto";
    if (bottomInputRef.current) bottomInputRef.current.style.height = "auto";
    setLoading(true);
    try {
      const { reply } = await coachService.chat(newMessages, selectedManager !== "all" ? selectedManager : undefined);
      const finalMessages = [...newMessages, { role: "assistant" as const, content: reply }];
      setMessages(finalMessages);
      await coachService.updateSession(sessionId!, { messages: finalMessages, title: content.substring(0, 50) });
      refetchSessions();
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Xatolik yuz berdi. Qayta urinib ko'ring." }]);
    } finally { setLoading(false); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const loadSession = async (session: ChatSession) => {
    setActiveSessionId(session.id);
    const full = await coachService.getSession(session.id);
    const msgs = typeof full.messages === "string" ? JSON.parse(full.messages) : full.messages;
    setMessages(msgs);
    setSelectedManager(full.managerId || "all");
    setSidebarOpen(false);
    setSearchMode(false);
    setSearchQuery("");
  };

  const startNewChat = () => { setActiveSessionId(null); setMessages([]); setInput(""); setSearchMode(false); };
  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await coachService.deleteSession(id);
    if (activeSessionId === id) startNewChat();
    refetchSessions();
  };

  const hasMessages = messages.length > 0;
  const activeTitle = sessions?.find((s) => s.id === activeSessionId)?.title;
  const filteredSessions = sessions?.filter((s) => !searchQuery || s.title.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="h-screen flex" style={{ backgroundColor: "var(--color-primary-bg)" }}>

      {/* ===== SIDEBAR ===== */}
      {sidebarOpen && <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setSidebarOpen(false)} />}

      <div
        className={`fixed right-0 top-0 z-50 h-full flex flex-col shrink-0 transition-[width,transform] duration-300 ease-in-out overflow-hidden ${
          sidebarOpen ? "w-64 translate-x-0" : "w-0 translate-x-full"
        }`}
        style={{ backgroundColor: "var(--color-card-bg)", borderLeft: sidebarOpen ? "1px solid var(--color-border)" : "none" }}
      >
        <div className="w-64 h-full flex flex-col">
          {/* Sidebar top */}
          <div className="flex items-center justify-between p-3 shrink-0">
            <span className="text-sm font-semibold px-1" style={{ color: "var(--text-primary)" }}>Suhbatlar</span>
            <div className="flex items-center gap-1">
              <button onClick={() => { setSearchMode(true); setSidebarOpen(false); }} className="p-2 rounded-lg hover:bg-accent/10 transition-colors" style={{ color: "var(--color-secondary)" }} title="Qidirish">
                <Search size={18} />
              </button>
              <button onClick={() => setSidebarOpen(false)} className="p-2 rounded-lg hover:bg-accent/10 transition-colors" style={{ color: "var(--color-secondary)" }}>
                <X size={18} />
              </button>
            </div>
          </div>

          {/* New chat */}
          <div className="px-3 mb-2">
            <button onClick={() => { startNewChat(); setSidebarOpen(false); }} className="flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm transition-colors hover:bg-accent/5" style={{ color: "var(--text-primary)" }}>
              <Plus size={16} className="text-accent" />
              Yangi suhbat
            </button>
          </div>

          {/* Sessions */}
          <div className="flex-1 overflow-y-auto px-2">
            <p className="px-2 mb-2 text-[11px] font-medium uppercase tracking-wider" style={{ color: "var(--color-secondary)" }}>Suhbatlar</p>
            {sessions?.map((s) => (
              <div
                key={s.id}
                onClick={() => loadSession(s)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-colors group mb-0.5 ${activeSessionId === s.id ? "bg-accent/10" : "hover:bg-primary/50"}`}
              >
                <p className={`text-sm truncate flex-1 ${activeSessionId === s.id ? "font-medium text-accent" : ""}`} style={{ color: activeSessionId === s.id ? undefined : "var(--text-primary)" }}>{s.title}</p>
                <button onClick={(e) => deleteSession(s.id, e)} className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all hover:bg-danger/10" style={{ color: "var(--color-secondary)" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {(!sessions || sessions.length === 0) && (
              <div className="text-center py-6 px-2">
                <p className="text-xs" style={{ color: "var(--color-secondary)" }}>
                  Hali suhbat boshlanmagan
                </p>
                <p className="text-2xs mt-1" style={{ color: "var(--color-secondary)", opacity: 0.7 }}>
                  Yuqoridagi "Yangi suhbat" tugmasini bosing
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===== MAIN AREA ===== */}
      <div className="flex-1 flex flex-col h-full min-w-0">

        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b shrink-0" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate("/")} className="p-2 rounded-lg transition-colors hover:bg-accent/10" style={{ color: "var(--color-secondary)" }}>
              <ArrowLeft size={18} />
            </button>
            <Sparkles size={18} className="text-accent" />
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>AI Maslahatchi</span>
          </div>
          {activeTitle && <span className="text-xs truncate max-w-[200px] hidden sm:block" style={{ color: "var(--color-secondary)" }}>{activeTitle}</span>}
          <div className="flex items-center gap-1">
            <button onClick={toggleTheme} className="p-2 rounded-lg transition-colors hover:bg-accent/10" style={{ color: "var(--color-secondary)" }} title={theme === "dark" ? "Light mode" : "Dark mode"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={startNewChat} className="p-2 rounded-lg transition-colors hover:bg-accent/10" style={{ color: "var(--color-secondary)" }} title="Yangi suhbat">
              <Plus size={18} />
            </button>
            {!sidebarOpen && (
              <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg transition-colors hover:bg-accent/10" style={{ color: "var(--color-secondary)" }} title="Suhbat tarixi">
                <PanelLeft size={18} />
              </button>
            )}
          </div>
        </div>

        {/* ===== SEARCH MODE ===== */}
        {searchMode ? (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto px-4 py-8">
              <h2 className="text-2xl font-semibold mb-6" style={{ color: "var(--text-primary)" }}>Qidirish</h2>

              <div className="flex items-center gap-3 border rounded-full px-5 py-3 mb-6" style={{ borderColor: "var(--color-border)" }}>
                <Search size={18} style={{ color: "var(--color-secondary)" }} />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Suhbatlarni qidirish..."
                  className="flex-1 bg-transparent text-sm outline-none"
                  style={{ color: "var(--text-primary)" }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} style={{ color: "var(--color-secondary)" }}>
                    <X size={16} />
                  </button>
                )}
              </div>

              {/* Results */}
              <p className="text-sm font-medium mb-3" style={{ color: "var(--text-primary)" }}>
                {searchQuery ? "Natijalar" : "So'nggi suhbatlar"}
              </p>
              <div className="space-y-0.5">
                {filteredSessions?.map((s) => (
                  <div
                    key={s.id}
                    onClick={() => loadSession(s)}
                    className="flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-colors group"
                    style={{ backgroundColor: "transparent" }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--color-card-bg)"}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
                  >
                    <span className="text-sm truncate flex-1 mr-4" style={{ color: "var(--text-primary)" }}>{s.title}</span>
                    <span className="text-xs shrink-0" style={{ color: "var(--color-secondary)" }}>{timeAgo(s.updatedAt)}</span>
                  </div>
                ))}
                {filteredSessions?.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: "var(--color-secondary)" }}>
                    {searchQuery ? `"${searchQuery}" bo'yicha natija topilmadi` : "Suhbatlar yo'q"}
                  </p>
                )}
              </div>

              <button onClick={() => { setSearchMode(false); setSearchQuery(""); }} className="mt-6 text-sm text-accent hover:underline">
                Orqaga
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ===== CHAT CONTENT ===== */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto">
              <div className="max-w-3xl mx-auto px-4 h-full">
                {!hasMessages ? (
                  <div className="flex flex-col items-center justify-center max-w-2xl mx-auto" style={{ minHeight: "calc(100vh - 8rem)" }}>
                    <div className="mb-8 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <Sparkles size={24} className="text-accent" />
                        <span className="text-lg" style={{ color: "var(--color-secondary)" }}>Salom</span>
                      </div>
                      <h2 className="text-3xl md:text-4xl font-medium" style={{ color: "var(--text-primary, #fff)" }}>Qanday yordam bera olaman?</h2>
                    </div>

                    <div onClick={() => inputRef.current?.focus()} className="flex items-center gap-3 rounded-full px-5 py-3.5 mb-5 shadow-lg border w-full max-w-2xl cursor-text" style={{ borderColor: "var(--color-border)" }}>
                      <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} placeholder="Savolingizni yozing..." rows={1} className="flex-1 bg-transparent text-sm resize-none outline-none max-h-[120px]" style={{ color: "var(--text-primary, #fff)" }} />
                      <button onClick={() => sendMessage()} disabled={!input.trim()} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${input.trim() ? "bg-accent text-white" : "opacity-20"}`}>
                        <ArrowUp size={20} strokeWidth={2.5} />
                      </button>
                    </div>

                    <div className="flex flex-wrap justify-center gap-2 w-full max-w-2xl">
                      {QUICK_PROMPTS.map((qp) => (
                        <button key={qp.label} onClick={() => sendMessage(qp.prompt)} className="px-4 py-2.5 text-sm rounded-full border transition-all hover:shadow-md" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)", color: "var(--text-primary, #fff)" }}>
                          {qp.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="py-6 pb-32 space-y-8 max-w-2xl mx-auto">
                    {messages.map((msg, i) => (
                      <div key={i}>
                        {msg.role === "user" ? (
                          <div className="flex justify-end">
                            <div className="px-5 py-3 rounded-2xl text-sm max-w-[80%]" style={{ backgroundColor: "var(--color-card-bg)", color: "var(--text-primary, #fff)" }}>{msg.content}</div>
                          </div>
                        ) : (
                          <div className="flex gap-4">
                            <div className="shrink-0 mt-1"><Sparkles size={20} className="text-accent" /></div>
                            <div className="text-sm leading-relaxed flex-1" style={{ color: "var(--text-primary, #fff)", opacity: 0.85 }} dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }} />
                          </div>
                        )}
                      </div>
                    ))}
                    {loading && (
                      <div className="flex gap-4">
                        <div className="shrink-0 mt-1"><Sparkles size={20} className="text-accent" /></div>
                        <div className="flex items-center gap-1.5 py-2">
                          <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-2 h-2 rounded-full bg-accent animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ===== BOTTOM INPUT ===== */}
            {hasMessages && (
              <div className="py-3 px-4 shrink-0">
                <div className="max-w-2xl mx-auto">
                  <div onClick={() => bottomInputRef.current?.focus()} className="flex items-center gap-3 rounded-full px-5 py-3 shadow-lg border border-border cursor-text">
                    <textarea ref={bottomInputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} placeholder="Savolingizni yozing..." rows={1} className="flex-1 bg-transparent text-sm resize-none outline-none max-h-[120px]" style={{ color: "var(--text-primary, #fff)" }} />
                    <button onClick={() => sendMessage()} disabled={!input.trim() || loading} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all shrink-0 ${input.trim() && !loading ? "bg-accent text-white" : "opacity-20"}`}>
                      <ArrowUp size={20} strokeWidth={2.5} />
                    </button>
                  </div>
                  <p className="text-[10px] text-secondary text-center mt-2">AI xato qilishi mumkin. Ma'lumotlarni tekshiring.</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CoachPage;
