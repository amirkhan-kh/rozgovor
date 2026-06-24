import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Copy, ExternalLink } from "lucide-react";
import Skeleton from "../../../components/ui/Skeleton";
import { profileService } from "../../../services/profile.service";
import { useAuth } from "../../../store/authStore";

const BOT_NAME = "targethisobotasositbot";

const NotificationsTab: React.FC = () => {
  const queryClient = useQueryClient();
  const { userRole, managerUser } = useAuth();
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [sendEachAnalysis, setSendEachAnalysis] = useState(false);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: profileService.getProfile,
  });

  React.useEffect(() => {
    if (profile && !initialized) {
      setTelegramEnabled(profile.telegramEnabled);
      setSendEachAnalysis(profile.sendEachAnalysis);
      setDailySummaryEnabled(profile.dailySummaryEnabled);
      setInitialized(true);
    }
  }, [profile, initialized]);

  const updateMutation = useMutation({
    mutationFn: profileService.updateNotifications,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Bildirishnomalar yangilandi");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const connectMutation = useMutation({
    mutationFn: profileService.connectTelegram,
    onSuccess: (data) => {
      window.open(data.link, "_blank");
      toast.success("Telegram bot ochildi");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const disconnectMutation = useMutation({
    mutationFn: profileService.disconnectTelegram,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Telegram uzildi");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  // Manager / ROP — bot link (profile API'dan managerProfile.id olish)
  const managerId = managerUser?.id || (profile as any)?.managerProfile?.id;
  if (userRole === "manager" && managerId) {
    const botLink = `https://t.me/${BOT_NAME}?start=mgr_${managerId}`;
    return (
      <div className="bg-card border border-border rounded-xl">
        <div className="p-5 border-b border-border">
          <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Telegram bildirishnomalar</h3>
        </div>
        <div className="p-5">
          <p className="text-sm text-secondary mb-4">
            Quyidagi link orqali Telegram botga ulaning. Har bir audio tahlil natijangiz avtomatik shu yerga yuboriladi.
          </p>
          <div className="flex items-center gap-2 p-3 bg-primary border border-border rounded-xl mb-4">
            <code className="text-xs flex-1 truncate" style={{ color: "var(--text-primary)" }}>{botLink}</code>
            <button
              onClick={() => { navigator.clipboard.writeText(botLink); toast.success("Nusxalandi"); }}
              className="p-1.5 hover:opacity-70 text-secondary"
            >
              <Copy size={14} />
            </button>
          </div>
          <a
            href={botLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent rounded-xl text-sm font-medium hover:opacity-90 transition-opacity"
            style={{ color: "#ffffff" }}
          >
            <ExternalLink size={14} />
            Telegram botni ochish
          </a>
        </div>
      </div>
    );
  }
  // Manager lekin ID hali yuklanmagan
  if (userRole === "manager" && !managerId && isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3"></div>
        <p className="text-sm text-secondary">Yuklanmoqda...</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="border rounded-xl" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
        {/* Header */}
        <div className="p-5 border-b" style={{ borderColor: "var(--color-border)" }}>
          <Skeleton className="h-5 w-36" />
        </div>
        {/* Telegram status section */}
        <div className="p-5 border-b" style={{ borderColor: "var(--color-border)" }}>
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex items-center gap-2">
              <Skeleton className="w-2.5 h-2.5" rounded="full" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-9 w-36" rounded="xl" />
          </div>
        </div>
        {/* 3 toggle rows */}
        <div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--color-border)" }}>
              <Skeleton className="h-4 w-56" />
              <Skeleton className="w-12 h-7" rounded="full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const isConnected = !!profile?.telegramId;

  const handleToggle = (
    setter: React.Dispatch<React.SetStateAction<boolean>>,
    currentValue: boolean,
    field: "telegramEnabled" | "sendEachAnalysis" | "dailySummaryEnabled"
  ) => {
    const newValue = !currentValue;
    setter(newValue);
    const payload = {
      telegramEnabled: field === "telegramEnabled" ? newValue : telegramEnabled,
      sendEachAnalysis: field === "sendEachAnalysis" ? newValue : sendEachAnalysis,
      dailySummaryEnabled: field === "dailySummaryEnabled" ? newValue : dailySummaryEnabled,
    };
    updateMutation.mutate(payload);
  };

  const ToggleSwitch: React.FC<{
    checked: boolean;
    onChange: () => void;
  }> = ({ checked, onChange }) => (
    <button
      onClick={onChange}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${
        checked ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );

  return (
    <div className="bg-card border border-border rounded-xl">
      {/* Header */}
      <div className="p-5 border-b border-border">
        <h3 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Bildirishnomalar</h3>
      </div>

      {/* Telegram holati */}
      <div className="p-5 border-b border-border">
        <div className="flex flex-col items-center gap-3 py-4">
          {isConnected ? (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-success" />
                <span className="text-sm text-success font-medium">Telegram ulangan</span>
              </div>
              <button
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="px-4 py-2 text-sm bg-danger/10 text-danger border border-danger/20 rounded-xl hover:bg-danger/20 transition-colors"
              >
                Telegram xabarlarni to'xtatish
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary" />
                <span className="text-sm text-secondary font-medium">Telegram ulanmagan</span>
              </div>
              <button
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
                className="px-4 py-2 text-sm bg-accent text-white rounded-xl hover:bg-accent/80 transition-colors"
              >
                Telegram ulash
              </button>
            </>
          )}
        </div>
      </div>

      {/* Toggle sozlamalari */}
      <div className="divide-y divide-border">
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>Telegram bildirishnomalarni yoqish</span>
          <ToggleSwitch
            checked={telegramEnabled}
            onChange={() => handleToggle(setTelegramEnabled, telegramEnabled, "telegramEnabled")}
          />
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>Har bir tahlil natijasini yuborish</span>
          <ToggleSwitch
            checked={sendEachAnalysis}
            onChange={() => handleToggle(setSendEachAnalysis, sendEachAnalysis, "sendEachAnalysis")}
          />
        </div>
        <div className="flex items-center justify-between px-5 py-4">
          <span className="text-sm" style={{ color: "var(--text-primary)" }}>Kunlik xulosa yuborish</span>
          <ToggleSwitch
            checked={dailySummaryEnabled}
            onChange={() => handleToggle(setDailySummaryEnabled, dailySummaryEnabled, "dailySummaryEnabled")}
          />
        </div>
      </div>
    </div>
  );
};

export default NotificationsTab;
