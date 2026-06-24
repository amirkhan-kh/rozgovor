import React, { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { ArrowLeft, Building2, FileText, Eye, EyeOff, Camera, Loader2 } from "lucide-react";
import Button from "../../../components/ui/Button";
import Skeleton from "../../../components/ui/Skeleton";
import Avatar from "../../../components/ui/Avatar";
import { profileService } from "../../../services/profile.service";
import { managerVideosService } from "../../../services/manager-videos.service";
import { useAuth } from "../../../store/authStore";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Aqlli kompaniya ma'lumoti renderer — HTML (Quill) va Markdown ikkalasini ham qabul qiladi.
// Markdown belgilarini (## ## **bold** -, *) aniqlasak Markdown sifatida; HTML tag bo'lsa HTML.
const CompanyInfoView: React.FC<{ content: string }> = ({ content }) => {
  const trimmed = content.trim();
  // HTML deb hisoblaymiz agar tag bilan boshlansa yoki ko'p HTML tagi bo'lsa
  const looksLikeHtml = /^\s*<[a-z]/i.test(trimmed) ||
    /<\/(p|div|h[1-6]|ul|ol|li|strong|em|br)>/i.test(trimmed);

  const cssVars: Record<string, string> = {
    "--text-primary": "var(--text-primary)",
    "--text-secondary": "var(--text-secondary)",
  };

  if (looksLikeHtml) {
    return (
      <div
        className="company-info-html text-sm leading-relaxed"
        style={{ color: "var(--text-primary)", ...cssVars }}
        dangerouslySetInnerHTML={{ __html: content }}
      />
    );
  }

  // Markdown
  return (
    <div className="text-sm leading-relaxed" style={{ color: "var(--text-primary)" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-4 mb-2" style={{ color: "var(--text-primary)" }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold mt-4 mb-2" style={{ color: "var(--text-primary)" }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-3 mb-1.5" style={{ color: "var(--text-primary)" }}>{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-sm font-semibold mt-2 mb-1" style={{ color: "var(--text-primary)" }}>{children}</h4>
          ),
          p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc list-outside ml-5 my-2 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-outside ml-5 my-2 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-bold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80" style={{ color: "var(--color-accent, #22c55e)" }}>
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: "var(--ds-bg-overlay)" }}>
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <pre className="p-3 rounded-lg overflow-x-auto text-xs my-3" style={{ backgroundColor: "var(--ds-bg-overlay)" }}>
              {children}
            </pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="pl-4 my-2 italic" style={{ borderLeft: "3px solid var(--color-border)", color: "var(--text-secondary)" }}>
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-3" style={{ borderColor: "var(--color-border)" }} />,
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="px-2 py-1.5 text-left font-semibold border" style={{ borderColor: "var(--color-border)", backgroundColor: "var(--ds-bg-overlay)" }}>
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-2 py-1.5 border" style={{ borderColor: "var(--color-border)" }}>{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

// Telegram uslubidagi avatar yuklovchi — yumaloq rasm, hover'da Camera ikonkasi.
// Bosgan zahoti fayl tanlash; yuklanayotganda spinner.
const ProfileAvatarUploader: React.FC<{
  managerId: string;
  src: string | null;
  name: string;
  onUploaded: () => void;
}> = ({ managerId, src, name, onUploaded }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handlePick = () => fileRef.current?.click();

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // qayta tanlash uchun reset
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Faqat rasm fayli qabul qilinadi");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Rasm hajmi 8MB dan oshmasin");
      return;
    }
    try {
      setUploading(true);
      await managerVideosService.uploadPhoto(managerId, file);
      toast.success("Profil rasmi yangilandi");
      onUploaded();
    } catch {
      toast.error("Yuklashda xatolik");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="relative" style={{ width: 96, height: 96 }}>
      <button
        type="button"
        onClick={handlePick}
        className="group relative rounded-full overflow-hidden focus:outline-none"
        style={{ width: 96, height: 96 }}
        title="Profil rasmini o'zgartirish"
      >
        <Avatar src={src} name={name} size={96} />
        <div
          className="absolute inset-0 flex items-center justify-center rounded-full transition-opacity"
          style={{
            backgroundColor: "rgba(0,0,0,0.45)",
            opacity: uploading ? 1 : 0,
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.opacity = "1")}
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLDivElement).style.opacity = uploading ? "1" : "0")
          }
        >
          {uploading ? (
            <Loader2 size={28} className="text-white animate-spin" />
          ) : (
            <Camera size={28} className="text-white" />
          )}
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
};

const ProfileTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { userRole, checkAuth } = useAuth();
  const isManager = userRole === "manager";
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [about, setAbout] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: profileService.getProfile,
  });

  React.useEffect(() => {
    if (profile && !initialized) {
      setName(profile.name);
      setEmail(profile.email || "");
      setAbout((profile as any).courseInfo || "");
      // Manager uchun Ism/Familyani ajratamiz
      const mp = (profile as any).managerProfile;
      if (mp?.name) {
        const parts = String(mp.name).trim().split(/\s+/);
        setFirstName(parts[0] || "");
        setLastName(parts.slice(1).join(" "));
      }
      setInitialized(true);
    }
  }, [profile, initialized]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      await profileService.updateProfile({ name, email, courseInfo: about });
      if (newPassword && newPassword.length >= 4) {
        await profileService.changePassword(newPassword);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profil yangilandi");
      setNewPassword("");
      setIsEditing(false);
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Profile card */}
        <div className="border rounded-xl p-6" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
          {/* Header with edit button */}
          <div className="flex items-center justify-between mb-6">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-8 w-36" rounded="xl" />
          </div>
          {/* Avatar + company name */}
          <div className="flex flex-col items-center py-6 border-b mb-6" style={{ borderColor: "var(--color-border)" }}>
            <Skeleton className="w-20 h-20 mb-4" rounded="xl" />
            <Skeleton className="h-6 w-40 mb-2" />
            <Skeleton className="h-3 w-28 mb-1" />
            <Skeleton className="h-3 w-36" />
          </div>
          {/* TARIF VA FOYDALANISH section header */}
          <Skeleton className="h-3 w-36 mb-4" />
          {/* 3 cards row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border rounded-xl p-4 space-y-2" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-16" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
            ))}
          </div>
          {/* Second 3 cards row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border rounded-xl p-4 space-y-2" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        </div>
        {/* Kompaniya haqida card */}
        <div className="border rounded-xl p-6" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
          <Skeleton className="h-3 w-28 mb-4" />
          <div className="flex flex-col items-center py-8">
            <Skeleton className="w-8 h-8 mb-2" rounded="lg" />
            <Skeleton className="h-4 w-32 mb-1" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const mp = (profile as any).managerProfile;

  // Manager / ROP profil
  if (isManager && mp) {
    if (isEditing) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setIsEditing(false)} className="p-2 text-secondary hover:opacity-70">
                <ArrowLeft size={20} />
              </button>
              <h2 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Profilni tahrirlash</h2>
            </div>
            <Button onClick={async () => {
              try {
                const fn = firstName.trim();
                const ln = lastName.trim();
                if (!fn && !ln) {
                  toast.error("Ism yoki familya bo'sh bo'lmasin");
                  return;
                }
                await profileService.updateProfile({
                  firstName: fn,
                  lastName: ln,
                });
                if (newPassword && newPassword.length >= 4) {
                  await profileService.changePassword(newPassword);
                }
                queryClient.invalidateQueries({ queryKey: ["profile"] });
                toast.success("Saqlandi");
                setNewPassword("");
                setIsEditing(false);
              } catch { toast.error("Xatolik"); }
            }}>Saqlash</Button>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-secondary mb-1">Ism</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Ism"
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl"
                  style={{ color: "var(--text-primary)" }}
                />
              </div>
              <div>
                <label className="block text-sm text-secondary mb-1">Familya</label>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Familya"
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl"
                  style={{ color: "var(--text-primary)" }}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Username</label>
              <input type="text" value={mp.email} disabled
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl opacity-60 cursor-not-allowed"
                style={{ color: "var(--text-primary)" }} />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Yangi parol</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yangi parol kiriting"
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl pr-10"
                  style={{ color: "var(--text-primary)" }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:opacity-70">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    const avatarSrc = mp.customPhotoUrl || mp.photoUrl || null;
    return (
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-base font-medium" style={{ color: "var(--text-primary)" }}>Profil</h3>
            <Button onClick={() => setIsEditing(true)} size="sm">
              <FileText size={14} /> Tahrirlash
            </Button>
          </div>
          <div className="flex flex-col items-center py-6 border-b border-border mb-6">
            <ProfileAvatarUploader
              managerId={mp.id}
              src={avatarSrc}
              name={mp.name}
              onUploaded={() => {
                queryClient.invalidateQueries({ queryKey: ["profile"] });
                checkAuth(); // Header'dagi avatar ham yangilansin
              }}
            />
            <h2 className="text-xl font-bold mt-4" style={{ color: "var(--text-primary)" }}>{mp.name}</h2>
            <p className="text-sm text-secondary mt-1">{mp.email}</p>
            <p className="text-xs text-secondary mt-0.5">{mp.role === "rop" ? "ROP" : "Manager"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-primary border border-border rounded-xl p-4 text-center">
              <div className="text-xs text-secondary mb-1">Tahlil qilingan</div>
              <div className="text-2xl font-bold text-accent">{mp.totalAudios || 0}</div>
            </div>
            <div className="bg-primary border border-border rounded-xl p-4 text-center">
              <div className="text-xs text-secondary mb-1">O'rtacha ball</div>
              <div className="text-2xl font-bold" style={{
                color: (mp.avgScore || 0) >= 70 ? "#2fcc6e" : (mp.avgScore || 0) >= 50 ? "#e6a020" : "#e64545"
              }}>{mp.avgScore || 0}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const activeManagers = profile.activeManagers || 0;
  const inactiveManagers = profile.inactiveManagers || 0;
  const totalManagers = activeManagers + inactiveManagers;

  // Tahrirlash rejimi
  if (isEditing) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsEditing(false)} className="p-2 text-secondary hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-xl font-bold text-white">Profilni tahrirlash</h2>
          </div>
          <div className="flex gap-3">
            <Button onClick={() => updateMutation.mutate()} loading={updateMutation.isPending}>Saqlash</Button>
            <Button variant="secondary" onClick={() => setIsEditing(false)}>Bekor qilish</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm text-secondary mb-1">Kompaniya nomi</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl" style={{ color: "var(--text-primary)" }} />
          </div>
          <div>
            <label className="block text-sm text-secondary mb-1">Username</label>
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl" style={{ color: "var(--text-primary)" }} />
          </div>
        </div>

        <div>
          <label className="block text-sm text-secondary mb-1">Yangi parol (ixtiyoriy)</label>
          <div className="relative max-w-md">
            <input
              type={showPassword ? "text" : "password"}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="O'zgartirmasangiz bo'sh qoldiring"
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl pr-10"
              style={{ color: "var(--text-primary)" }}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:opacity-70">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-secondary">Kompaniya haqida ma'lumot</label>
          </div>
          <div className="quill-dark">
            <ReactQuill
              theme="snow"
              value={about}
              onChange={setAbout}
              placeholder="Kompaniya haqida ma'lumot kiriting..."
              modules={{
                toolbar: [
                  [{ header: [2, 3, false] }],
                  ["bold", "italic", "underline"],
                  [{ list: "ordered" }, { list: "bullet" }],
                  ["link"],
                  ["clean"],
                ],
              }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profil ma'lumotlari */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-base font-medium text-white">Profil ma'lumotlari</h3>
          <Button onClick={() => setIsEditing(true)} size="sm">
            <FileText size={14} />
            Profilni tahrirlash
          </Button>
        </div>

        <div className="flex flex-col items-center py-6 border-b border-border mb-6">
          <div className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mb-4">
            <Building2 size={36} className="text-accent" />
          </div>
          <h2 className="text-xl font-bold text-white">{profile.name}</h2>
          <p className="text-sm text-secondary mt-1">{profile.name?.toLowerCase()}</p>
          <p className="text-sm text-secondary">{profile.email}</p>
        </div>

        {/* STATISTIKA */}
        <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-4">
          Umumiy statistika
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-primary border border-border rounded-xl p-4">
            <div className="text-xs text-secondary mb-1">Jami menejerlar</div>
            <div className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{totalManagers}</div>
            <div className="text-xs mt-1">
              <span className="text-accent">{activeManagers} faol</span>
              <span className="text-secondary"> · {inactiveManagers} arxiv</span>
            </div>
          </div>

          <div className="bg-primary border border-border rounded-xl p-4">
            <div className="text-xs text-secondary mb-1">Voronkalar</div>
            <div className="text-2xl font-bold text-accent">{profile.voronkaCount || 0}</div>
          </div>

          <div className="bg-primary border border-border rounded-xl p-4">
            <div className="text-xs text-secondary mb-1">Tahlil qilingan</div>
            <div className="text-2xl font-bold text-success">{profile.analyzedAudioFiles || 0}</div>
          </div>
        </div>
      </div>

      {/* KOMPANIYA HAQIDA */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h4 className="text-xs font-semibold text-secondary uppercase tracking-wider mb-4">
          Kompaniya va kurs haqida
        </h4>
        {(profile as any).courseInfo && (profile as any).courseInfo.trim() ? (
          <CompanyInfoView content={(profile as any).courseInfo as string} />
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-secondary">
            <FileText size={32} className="mb-2 text-secondary/50" />
            <p className="text-sm">Ma'lumot kiritilmagan</p>
            <p className="text-xs text-secondary/70 mt-1">
              "Profilni tahrirlash" tugmasini bosib kompaniya va kurs ma'lumotini qo'shing —
              bu ma'lumot AI tahlillarda ishlatiladi (fakt-check)
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileTab;
