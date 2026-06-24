import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Clock, Save } from "lucide-react";
import Skeleton from "../../../components/ui/Skeleton";
import { profileService } from "../../../services/profile.service";
import { useAuth } from "../../../store/authStore";

interface ManagerRow {
  id: string;
  name: string;
  dailyReportTime: string | null;
  workStart: string | null;
  workEnd: string | null;
  reportEnabled: boolean;
  reportStyle: string | null;
}

const styleOptions: Array<{ value: string; label: string; sample: string }> = [
  {
    value: "compact",
    label: "Qisqa",
    sample: "🌇 KUN YAKUNI\n💰 5 sotuv  📋 12 lid  📞 30 q.",
  },
  {
    value: "detailed",
    label: "Batafsil",
    sample: "🌇 KUN YAKUNI — 2026-05-13\n💰 SOTUV\n  Sotuv: 5\n  Tushum: 12 000 000 so'm\n📋 LID\n  Yangi: 12 · Kval: 8\n📞 AUDIT — 30 ta, 78/100",
  },
  {
    value: "emoji",
    label: "Emoji bezakli",
    sample: "🌇✨ KUN YAKUNI ✨🌇\n🎯 5 sotuv | 📋 12 lid | 📞 30 q. | ⭐ 78",
  },
];

const BotScheduleTab: React.FC = () => {
  const qc = useQueryClient();
  const { userRole } = useAuth();
  const isAdmin = userRole === "company";

  const { data, isLoading } = useQuery({
    queryKey: ["bot-schedule"],
    queryFn: profileService.getBotSchedule,
  });

  // Admin state
  const [adminReportTime, setAdminReportTime] = useState("18:00");
  const [adminWorkStart, setAdminWorkStart] = useState("09:00");
  const [adminWorkEnd, setAdminWorkEnd] = useState("18:00");
  const [reportIncludeSales, setReportIncludeSales] = useState(true);
  const [reportIncludeLeads, setReportIncludeLeads] = useState(true);
  const [reportIncludeAudit, setReportIncludeAudit] = useState(true);
  const [reportStyle, setReportStyle] = useState("detailed");
  const [managers, setManagers] = useState<ManagerRow[]>([]);

  // Manager state
  const [myTime, setMyTime] = useState("");
  const [myWorkStart, setMyWorkStart] = useState("");
  const [myWorkEnd, setMyWorkEnd] = useState("");
  const [myEnabled, setMyEnabled] = useState(true);
  const [myStyle, setMyStyle] = useState("");

  useEffect(() => {
    if (!data) return;
    if (isAdmin) {
      const c = data.company || {};
      setAdminReportTime(c.adminReportTime || "18:00");
      setAdminWorkStart(c.adminWorkStart || "09:00");
      setAdminWorkEnd(c.adminWorkEnd || "18:00");
      setReportIncludeSales(c.reportIncludeSales !== false);
      setReportIncludeLeads(c.reportIncludeLeads !== false);
      setReportIncludeAudit(c.reportIncludeAudit !== false);
      setReportStyle(c.reportStyle || "detailed");
      setManagers(data.managers || []);
    } else {
      setMyTime(data.dailyReportTime || "");
      setMyWorkStart(data.workStart || "");
      setMyWorkEnd(data.workEnd || "");
      setMyEnabled(data.reportEnabled !== false);
      setMyStyle(data.reportStyle || "");
    }
  }, [data, isAdmin]);

  const save = useMutation({
    mutationFn: profileService.updateBotSchedule,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["bot-schedule"] });
      toast.success("Saqlandi");
    },
    onError: () => toast.error("Xatolik"),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="bg-card border border-border rounded-xl">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Clock size={18} />
          <h3 className="text-lg font-semibold">Bot va ish jadvalim</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field
              label="Bot hisobot vaqti"
              type="time"
              value={myTime}
              onChange={setMyTime}
              placeholder={data?.company?.adminReportTime || "18:00"}
            />
            <Field label="Ish boshlash" type="time" value={myWorkStart} onChange={setMyWorkStart} placeholder="09:00" />
            <Field label="Ish tugashi" type="time" value={myWorkEnd} onChange={setMyWorkEnd} placeholder="18:00" />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border border-border">
            <div>
              <div className="text-sm font-medium">Bot hisobotini olish</div>
              <div className="text-xs text-secondary">O'chirilsa hech qachon yubormaydi</div>
            </div>
            <Toggle checked={myEnabled} onChange={() => setMyEnabled(!myEnabled)} />
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Hisobot stili</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {styleOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMyStyle(opt.value)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    myStyle === opt.value
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <div className="text-sm font-medium mb-1">{opt.label}</div>
                  <pre className="text-[10px] whitespace-pre-wrap text-secondary leading-tight">{opt.sample}</pre>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() =>
              save.mutate({
                dailyReportTime: myTime || null,
                workStart: myWorkStart || null,
                workEnd: myWorkEnd || null,
                reportEnabled: myEnabled,
                reportStyle: myStyle || null,
              })
            }
            disabled={save.isPending}
            className="w-full md:w-auto inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl hover:opacity-90"
          >
            <Save size={16} /> Saqlash
          </button>
        </div>
      </div>
    );
  }

  // Admin
  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl">
        <div className="p-5 border-b border-border flex items-center gap-2">
          <Clock size={18} />
          <h3 className="text-lg font-semibold">Bot jadvali — admin</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Admin hisobot vaqti" type="time" value={adminReportTime} onChange={setAdminReportTime} />
            <Field label="Jamoa ish boshlash" type="time" value={adminWorkStart} onChange={setAdminWorkStart} />
            <Field label="Jamoa ish tugashi" type="time" value={adminWorkEnd} onChange={setAdminWorkEnd} />
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">Hisobotda nimalar bo'lsin</div>
            <CheckRow checked={reportIncludeSales} onChange={() => setReportIncludeSales(!reportIncludeSales)} label="Sotuvlar" />
            <CheckRow checked={reportIncludeLeads} onChange={() => setReportIncludeLeads(!reportIncludeLeads)} label="Lidlar" />
            <CheckRow checked={reportIncludeAudit} onChange={() => setReportIncludeAudit(!reportIncludeAudit)} label="Audit (qo'ng'iroq tahlili)" />
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Default hisobot stili</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {styleOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setReportStyle(opt.value)}
                  className={`text-left p-3 rounded-lg border transition-colors ${
                    reportStyle === opt.value
                      ? "border-accent bg-accent/5"
                      : "border-border hover:border-accent/50"
                  }`}
                >
                  <div className="text-sm font-medium mb-1">{opt.label}</div>
                  <pre className="text-[10px] whitespace-pre-wrap text-secondary leading-tight">{opt.sample}</pre>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl">
        <div className="p-5 border-b border-border">
          <h3 className="text-lg font-semibold">Menejerlar — shaxsiy jadval</h3>
          <p className="text-xs text-secondary mt-1">Bo'sh qoldirsangiz admin vaqtini ishlatadi</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-primary/50">
                <th className="text-left p-3 font-medium">Menejer</th>
                <th className="text-left p-3 font-medium">Hisobot vaqti</th>
                <th className="text-left p-3 font-medium">Ish boshl.</th>
                <th className="text-left p-3 font-medium">Ish tug.</th>
                <th className="text-left p-3 font-medium">Stil</th>
                <th className="text-left p-3 font-medium">Yoq.</th>
              </tr>
            </thead>
            <tbody>
              {managers.map((m, i) => (
                <tr key={m.id} className="border-b border-border">
                  <td className="p-3">{m.name}</td>
                  <td className="p-2">
                    <input
                      type="time"
                      value={m.dailyReportTime || ""}
                      onChange={(e) => {
                        const next = [...managers];
                        next[i] = { ...m, dailyReportTime: e.target.value || null };
                        setManagers(next);
                      }}
                      className="px-2 py-1 rounded border border-border bg-primary text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="time"
                      value={m.workStart || ""}
                      onChange={(e) => {
                        const next = [...managers];
                        next[i] = { ...m, workStart: e.target.value || null };
                        setManagers(next);
                      }}
                      className="px-2 py-1 rounded border border-border bg-primary text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <input
                      type="time"
                      value={m.workEnd || ""}
                      onChange={(e) => {
                        const next = [...managers];
                        next[i] = { ...m, workEnd: e.target.value || null };
                        setManagers(next);
                      }}
                      className="px-2 py-1 rounded border border-border bg-primary text-xs"
                    />
                  </td>
                  <td className="p-2">
                    <select
                      value={m.reportStyle || ""}
                      onChange={(e) => {
                        const next = [...managers];
                        next[i] = { ...m, reportStyle: e.target.value || null };
                        setManagers(next);
                      }}
                      className="px-2 py-1 rounded border border-border bg-primary text-xs"
                    >
                      <option value="">— default —</option>
                      <option value="compact">Qisqa</option>
                      <option value="detailed">Batafsil</option>
                      <option value="emoji">Emoji</option>
                    </select>
                  </td>
                  <td className="p-2">
                    <Toggle
                      checked={m.reportEnabled !== false}
                      onChange={() => {
                        const next = [...managers];
                        next[i] = { ...m, reportEnabled: !m.reportEnabled };
                        setManagers(next);
                      }}
                    />
                  </td>
                </tr>
              ))}
              {managers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-secondary text-sm">
                    Menejerlar yo'q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <button
        onClick={() =>
          save.mutate({
            adminReportTime,
            adminWorkStart,
            adminWorkEnd,
            reportIncludeSales,
            reportIncludeLeads,
            reportIncludeAudit,
            reportStyle,
            managerSchedule: managers.reduce((acc, m) => {
              acc[m.id] = {
                dailyReportTime: m.dailyReportTime,
                workStart: m.workStart,
                workEnd: m.workEnd,
                reportStyle: m.reportStyle,
                reportEnabled: m.reportEnabled,
              };
              return acc;
            }, {} as Record<string, any>),
          })
        }
        disabled={save.isPending}
        className="w-full md:w-auto inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-xl hover:opacity-90"
      >
        <Save size={16} /> Hammasini saqlash
      </button>
    </div>
  );
};

const Field: React.FC<{
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, type, value, onChange, placeholder }) => (
  <label className="block">
    <div className="text-xs text-secondary mb-1">{label}</div>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg border border-border bg-primary text-sm"
    />
  </label>
);

const Toggle: React.FC<{ checked: boolean; onChange: () => void }> = ({ checked, onChange }) => (
  <button
    onClick={onChange}
    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
      checked ? "bg-accent" : "bg-border"
    }`}
  >
    <span
      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
        checked ? "translate-x-5" : ""
      }`}
    />
  </button>
);

const CheckRow: React.FC<{ checked: boolean; onChange: () => void; label: string }> = ({
  checked,
  onChange,
  label,
}) => (
  <label className="flex items-center gap-2 cursor-pointer">
    <input type="checkbox" checked={checked} onChange={onChange} className="w-4 h-4 accent-accent" />
    <span className="text-sm">{label}</span>
  </label>
);

export default BotScheduleTab;
