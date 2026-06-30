import React, { useState, useRef, useEffect } from "react";
import {
  Send, X, Sparkles, Copy, RefreshCw,
  Zap, Target, Phone, AlertTriangle, CheckCircle, BookOpen, Maximize2, Minimize2,
} from "lucide-react";
import toast from "react-hot-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { audioService } from "../../services/audio.service";
import { ChatMessage, Analysis } from "../../types";

interface AIChatProps {
  audioId: string;
  analysis?: Analysis;
}

type SuggestedAction = {
  icon: React.ReactNode;
  label: string;
  prompt: string;
  color: string;
};

const AIChat: React.FC<AIChatProps> = ({ audioId, analysis }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Dynamic suggested questions based on analysis
  const suggestedActions: SuggestedAction[] = [
    {
      icon: <Target size={14} />,
      label: "Keyingi qadam",
      prompt: "Bu mijoz bilan keyingi qo'ng'iroqda nima qilish kerak? Aniq 3 ta qadam ayt va har biri uchun skript yoz.",
      color: "#3b5ef5",
    },
    {
      icon: <BookOpen size={14} />,
      label: "Yaxshiroq skript yoz",
      prompt: "Bu qo'ng'iroqdagi eng zaif 2 momentni topib, menejer o'rniga qanday gapirishi kerakligini aniq so'zlar bilan yoz.",
      color: "#2fcc6e",
    },
    {
      icon: <AlertTriangle size={14} />,
      label: "E'tirozga javob",
      prompt: "Mijoz bergan e'tirozlarga top performer qanday javob berishini ko'rsat — har biriga real ibora.",
      color: "#e6a020",
    },
    {
      icon: <Phone size={14} />,
      label: "Qayta qo'ng'iroq skripti",
      prompt: "Bu mijozga keyingi qayta qo'ng'iroq uchun to'liq skript yoz — salomlashishdan yakuniy qadamgacha.",
      color: "#8b5cf6",
    },
    {
      icon: <Zap size={14} />,
      label: "Nimani o'rganish kerak",
      prompt: "Bu qo'ng'iroqdan menejer nima o'rganishi kerak? 3 ta aniq dars va har biri uchun amaliy vazifa ber.",
      color: "#e64545",
    },
    {
      icon: <CheckCircle size={14} />,
      label: "Nimani to'g'ri qildi",
      prompt: "Bu qo'ng'iroqda menejer nimani yaxshi qildi? Kuchli tomonlarini ko'rsat va qaysi texnikani ishlatganini ayt.",
      color: "#06b6d4",
    },
  ];

  // Smart suggestions based on analysis issues
  const smartPrompts: string[] = [];
  if (analysis?.coachingInsights?.speechRatioAlert) {
    smartPrompts.push("Nima uchun men juda ko'p gapirib yubordim? Savol berish uslubimni qanday yaxshilash mumkin?");
  }
  if (analysis?.requiresFollowup) {
    smartPrompts.push("Mijoz 'o'ylayman' dedi — unga qanday follow-up qilishim kerak? Aniq skript va sana ayt.");
  }
  if (analysis?.coachingInsights?.surrenderedObjections && analysis.coachingInsights.surrenderedObjections > 0) {
    smartPrompts.push("Men e'tirozga javob bera olmadim. Top performer o'rnimda qanday javob bergan bo'lardi?");
  }
  if (analysis?.coachingInsights?.openEnding) {
    smartPrompts.push("Qo'ng'iroqni ochiq yakunladim. Keyingi safar qanday aniq tugatish kerak edi?");
  }
  if (analysis && (analysis.leadHeatScore ?? 0) >= 60 && analysis.leadQuality === "iliq") {
    smartPrompts.push("Bu lead issiq, lekin hali sotuv yo'q. Qaerda xato qildim va hozir nima qilishim mumkin?");
  }

  const sendMessage = async (text: string) => {
    if (!text.trim() || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const response = await audioService.chat(audioId, text, messages);
      const aiMsg: ChatMessage = { role: "assistant", content: response };
      setMessages((prev) => [...prev, aiMsg]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ Xatolik yuz berdi. Qayta urinib ko'ring." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback — eski brauzer yoki HTTPS bo'lmagan holat uchun
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      toast.success("Nusxa olindi");
    } catch {
      toast.error("Nusxalab bo'lmadi");
    }
  };

  const clearChat = () => {
    if (messages.length === 0 || confirm("Chat tarixini tozalashni xohlaysizmi?")) {
      setMessages([]);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        title="Bu qo'ng'iroq haqida AI dan so'rang"
        className="fixed bottom-6 right-6 px-5 py-3 rounded-xl flex items-center gap-3 shadow-2xl transition-all hover:scale-105 z-50 text-left"
        style={{
          background: "linear-gradient(135deg, #3b5ef5 0%, #8b5cf6 100%)",
          color: "#fff",
        }}
      >
        <Sparkles size={22} className="flex-shrink-0" />
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-sm">AI Chat</span>
          <span className="text-[10px] opacity-90 font-medium">
            Bu qo'ng'iroq haqida AI dan so'rang
          </span>
        </div>
        {(smartPrompts.length > 0 || analysis?.requiresFollowup) && (
          <span className="ml-1 px-1.5 py-0.5 bg-white/30 rounded-full text-xs font-bold">
            {smartPrompts.length || "!"}
          </span>
        )}
      </button>
    );
  }

  const containerClass = fullscreen
    ? "fixed inset-4 md:inset-8 z-50 flex flex-col rounded-2xl shadow-2xl"
    : "fixed bottom-6 right-6 w-[440px] h-[620px] md:w-[500px] md:h-[680px] z-50 flex flex-col rounded-2xl shadow-2xl";

  return (
    <div
      className={containerClass}
      style={{
        backgroundColor: "var(--color-card-bg)",
        border: "1px solid var(--color-border)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 rounded-t-2xl border-b"
        style={{
          background: "linear-gradient(135deg, rgba(59,94,245,0.1) 0%, rgba(139,92,246,0.1) 100%)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: "linear-gradient(135deg, #3b5ef5 0%, #8b5cf6 100%)",
              color: "#ffffff",
            }}
          >
            <Sparkles size={20} />
          </div>
          <div>
            <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>
              AI Chat
            </h3>
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Bu qo'ng'iroq haqida AI dan so'rang
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              title="Tozalash"
              className="p-2 rounded-lg hover:bg-black/10 transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <RefreshCw size={16} />
            </button>
          )}
          <button
            onClick={() => setFullscreen(!fullscreen)}
            title={fullscreen ? "Kichraytirish" : "Kattalashtirish"}
            className="p-2 rounded-lg hover:bg-black/10 transition-colors hidden md:block"
            style={{ color: "var(--text-secondary)" }}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-lg hover:bg-black/10 transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-4">
            {/* Welcome */}
            <div
              className="p-4 rounded-xl border"
              style={{
                backgroundColor: "rgba(59,94,245,0.05)",
                borderColor: "rgba(59,94,245,0.2)",
              }}
            >
              <div className="flex items-start gap-3">
                <Sparkles size={18} style={{ color: "#3b5ef5" }} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Salom! Men bu qo'ng'iroqning tahlilchisiman 👋
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    Transkripsiya, MEDDIC, top performer playbook — hammasini ko'rdim.
                    Savol bering yoki quyidagi tavsiyalardan birini tanlang.
                  </p>
                </div>
              </div>
            </div>

            {/* Smart prompts — based on actual issues */}
            {smartPrompts.length > 0 && (
              <div>
                <p
                  className="text-xs font-semibold mb-2 flex items-center gap-1"
                  style={{ color: "#e64545" }}
                >
                  <AlertTriangle size={12} />
                  SHU QONG'IROQDA AYNIQSA MUHIM:
                </p>
                <div className="space-y-2">
                  {smartPrompts.map((p, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(p)}
                      className="w-full text-left px-3 py-2.5 rounded-lg border text-xs transition-all hover:shadow-md"
                      style={{
                        backgroundColor: "rgba(230,69,69,0.05)",
                        borderColor: "rgba(230,69,69,0.3)",
                        color: "var(--text-primary)",
                      }}
                    >
                      🔥 {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div>
              <p
                className="text-xs font-semibold mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                TEZ HARAKATLAR:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {suggestedActions.map((a, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(a.prompt)}
                    className="text-left px-3 py-2 rounded-lg border text-xs transition-all hover:shadow-md"
                    style={{
                      backgroundColor: "var(--color-bg)",
                      borderColor: "var(--color-border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5" style={{ color: a.color }}>
                      {a.icon}
                      <span className="font-semibold">{a.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm relative group ${
                msg.role === "user" ? "rounded-br-sm" : "rounded-bl-sm"
              }`}
              style={
                msg.role === "user"
                  ? { background: "linear-gradient(135deg, #3b5ef5 0%, #8b5cf6 100%)", color: "#fff" }
                  : { backgroundColor: "var(--color-bg)", color: "var(--text-primary)", border: "1px solid var(--color-border)" }
              }
            >
              {msg.role === "user" ? (
                <div className="whitespace-pre-wrap">{msg.content}</div>
              ) : (
                <div className="chat-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>
              )}
              {msg.role === "assistant" && (
                <button
                  onClick={() => copyMessage(msg.content)}
                  className="absolute -top-2 -right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                  style={{ backgroundColor: "var(--color-card-bg)", border: "1px solid var(--color-border)" }}
                  title="Nusxa olish"
                >
                  <Copy size={12} style={{ color: "var(--text-secondary)" }} />
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="px-4 py-3 rounded-2xl rounded-bl-sm"
              style={{ backgroundColor: "var(--color-bg)", border: "1px solid var(--color-border)" }}
            >
              <div className="flex gap-1">
                <div
                  className="w-2 h-2 rounded-full animate-bounce"
                  style={{ backgroundColor: "#3b5ef5" }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-bounce [animation-delay:0.15s]"
                  style={{ backgroundColor: "#6366f1" }}
                />
                <div
                  className="w-2 h-2 rounded-full animate-bounce [animation-delay:0.3s]"
                  style={{ backgroundColor: "#8b5cf6" }}
                />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t" style={{ borderColor: "var(--color-border)" }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendMessage(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            placeholder="Savolingizni yozing... (Shift+Enter = yangi qator)"
            rows={1}
            className="flex-1 px-3 py-2 rounded-xl border text-sm resize-none max-h-32"
            style={{
              backgroundColor: "var(--color-bg)",
              borderColor: "var(--color-border)",
              color: "var(--text-primary)",
            }}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="p-3 rounded-xl disabled:opacity-50 transition-all hover:scale-105 disabled:scale-100"
            style={{
              background: "linear-gradient(135deg, #3b5ef5 0%, #8b5cf6 100%)",
              color: "#ffffff",
            }}
          >
            <Send size={16} />
          </button>
        </form>
        <p
          className="text-xs mt-2 text-center"
          style={{ color: "var(--text-secondary)" }}
        >
          💡 Aniq skript, keyingi qadam, e'tirozga javob so'rashingiz mumkin
        </p>
      </div>
    </div>
  );
};

export default AIChat;
