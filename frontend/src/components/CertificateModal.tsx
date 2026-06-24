// Kurs to'liq tugaganda chiqadi. Ism/familiya olib backend'dan PDF generate qiladi.
import React, { useState } from "react";
import { Award, Download, X, Loader2, GraduationCap } from "lucide-react";
import api from "../services/api";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  courseName?: string;
}

const CertificateModal: React.FC<Props> = ({ isOpen, onClose, courseName }) => {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!isOpen) return null;

  const fullName = `${lastName.trim()} ${firstName.trim()}`.trim();

  const handleDownload = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true);
    try {
      const res = await api.post(
        "/certificates",
        { name: fullName },
        { responseType: "blob" }
      );
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Sertifikat-${fullName}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDone(true);
    } catch (e) {
      alert("PDF yuklab olishda xatolik");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 backdrop-blur-sm" style={{ backgroundColor: "rgba(0,0,0,0.7)" }} />

      {/* Confetti particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        {Array.from({ length: 60 }).map((_, i) => (
          <span
            key={i}
            className="absolute top-0"
            style={{
              left: `${Math.random() * 100}%`,
              width: 7 + (i % 5),
              height: 7 + (i % 5),
              backgroundColor: ["#7c3aed","#10b981","#f59e0b","#3b82f6","#ec4899","#f97316"][i % 6],
              borderRadius: i % 2 === 0 ? "50%" : "2px",
              animation: `certFall ${2.5 + (i % 3) * 0.7}s linear ${(i % 8) * 0.1}s infinite`,
            }}
          />
        ))}
      </div>

      {/* Modal */}
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        style={{
          background: "linear-gradient(160deg, #1e1b4b 0%, #312e81 50%, #4c1d95 100%)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(167,139,250,0.2)",
          animation: "certPop 0.5s cubic-bezier(0.34,1.56,0.64,1)",
        }}
      >
        {/* Header strip */}
        <div className="px-6 pt-6 pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full"
            style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
          >
            <X size={16} />
          </button>

          {/* Trophy icon */}
          <div className="flex justify-center mb-3">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{
                background: "radial-gradient(circle, rgba(250,204,21,0.25) 0%, rgba(250,204,21,0.05) 100%)",
                border: "2px solid rgba(250,204,21,0.4)",
                animation: "certGlow 2s ease-in-out infinite alternate",
              }}
            >
              <Award size={44} style={{ color: "#fde68a", filter: "drop-shadow(0 0 12px rgba(253,230,138,0.7))" }} />
            </div>
          </div>

          <div className="text-center mb-1">
            <div className="text-2xl font-extrabold tracking-tight" style={{ color: "#fff" }}>
              Tabriklaymiz!
            </div>
            <div className="text-sm mt-1" style={{ color: "rgba(196,181,253,0.9)" }}>
              {courseName ? `"${courseName}" kursini to'liq tugatdingiz!` : "Kursni muvaffaqiyatli yakunladingiz!"}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "0 24px" }} />

        {/* Form */}
        <div className="px-6 py-5 space-y-4">
          {!done ? (
            <>
              <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "rgba(196,181,253,0.9)" }}>
                <GraduationCap size={15} />
                Sertifikatingizga ism-familiyangizni kiriting
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: "rgba(196,181,253,0.7)" }}>
                    Familiya
                  </label>
                  <input
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Aliyev"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(167,139,250,0.3)",
                      color: "#fff",
                    }}
                    onFocus={e => { e.target.style.borderColor = "rgba(167,139,250,0.8)"; }}
                    onBlur={e => { e.target.style.borderColor = "rgba(167,139,250,0.3)"; }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block" style={{ color: "rgba(196,181,253,0.7)" }}>
                    Ism
                  </label>
                  <input
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="Jasur"
                    className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
                    style={{
                      background: "rgba(255,255,255,0.08)",
                      border: "1px solid rgba(167,139,250,0.3)",
                      color: "#fff",
                    }}
                    onFocus={e => { e.target.style.borderColor = "rgba(167,139,250,0.8)"; }}
                    onBlur={e => { e.target.style.borderColor = "rgba(167,139,250,0.3)"; }}
                    onKeyDown={e => { if (e.key === "Enter") handleDownload(); }}
                  />
                </div>
              </div>

              {/* Preview of name on certificate */}
              {fullName.length > 2 && (
                <div
                  className="px-4 py-3 rounded-xl text-center"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(167,139,250,0.2)",
                  }}
                >
                  <div className="text-[10px] uppercase tracking-widest mb-1" style={{ color: "rgba(196,181,253,0.5)" }}>
                    Sertifikatda ko'rinadi
                  </div>
                  <div
                    className="text-xl font-light italic"
                    style={{ color: "#e0d7ff", fontFamily: "Georgia, serif" }}
                  >
                    {fullName}
                  </div>
                </div>
              )}

              <button
                onClick={handleDownload}
                disabled={loading || !firstName.trim() || !lastName.trim()}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-sm transition-all"
                style={{
                  background: loading || !firstName.trim() || !lastName.trim()
                    ? "rgba(255,255,255,0.1)"
                    : "linear-gradient(135deg, #7c3aed, #9333ea)",
                  color: loading || !firstName.trim() || !lastName.trim()
                    ? "rgba(255,255,255,0.4)"
                    : "#fff",
                  boxShadow: !loading && firstName.trim() && lastName.trim()
                    ? "0 4px 20px rgba(124,58,237,0.5)"
                    : "none",
                  cursor: loading || !firstName.trim() || !lastName.trim() ? "not-allowed" : "pointer",
                }}
              >
                {loading ? (
                  <><Loader2 size={16} className="animate-spin" />PDF tayyorlanmoqda...</>
                ) : (
                  <><Download size={16} />Sertifikatni yuklab olish</>
                )}
              </button>
            </>
          ) : (
            /* Done state */
            <div className="py-4 text-center space-y-3">
              <div className="text-4xl">🎓</div>
              <div className="font-bold text-lg" style={{ color: "#fff" }}>Sertifikat yuklandi!</div>
              <div className="text-sm" style={{ color: "rgba(196,181,253,0.8)" }}>
                PDF faylingiz yuklab olindi. Omad!
              </div>
              <button
                onClick={() => { setDone(false); }}
                className="text-xs underline mt-2"
                style={{ color: "rgba(196,181,253,0.6)" }}
              >
                Yana yuklash
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes certFall {
          0% { transform: translateY(-5vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(105vh) rotate(540deg); opacity: 0.6; }
        }
        @keyframes certPop {
          0% { transform: scale(0.4) translateY(40px); opacity: 0; }
          70% { transform: scale(1.04) translateY(-4px); opacity: 1; }
          100% { transform: scale(1) translateY(0); opacity: 1; }
        }
        @keyframes certGlow {
          from { box-shadow: 0 0 12px rgba(253,230,138,0.3); }
          to   { box-shadow: 0 0 28px rgba(253,230,138,0.7); }
        }
      `}</style>
    </div>
  );
};

export default CertificateModal;
