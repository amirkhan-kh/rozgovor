import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Monitor, Users } from "lucide-react";
import toast from "react-hot-toast";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Skeleton from "../../components/ui/Skeleton";
import { managersService } from "../../services/managers.service";

interface FormData {
  name: string;
  email: string;
  password: string;
  canViewDashboard: boolean;
  canViewAll: boolean;
  isActive: boolean;
}

const EditManagerPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>({
    name: "",
    email: "",
    password: "",
    canViewDashboard: true,
    canViewAll: false,
    isActive: true,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data: managers, isLoading } = useQuery({
    queryKey: ["managers"],
    queryFn: managersService.getAll,
  });

  const manager = managers?.find((m) => m.id === id);

  useEffect(() => {
    if (manager && !loaded) {
      setForm({
        name: manager.name,
        email: manager.email,
        password: "",
        canViewDashboard: (manager as any).canViewDashboard ?? true,
        canViewAll: (manager as any).canViewAll ?? false,
        isActive: manager.isActive,
      });
      setLoaded(true);
    }
  }, [manager, loaded]);

  const updateMutation = useMutation({
    mutationFn: (payload: any) => managersService.update(id!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Menejer yangilandi");
      navigate("/managers");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const payload: any = {
      name: form.name,
      email: form.email,
      canViewDashboard: form.canViewDashboard,
      canViewAll: form.canViewAll,
    };
    if (form.password) payload.password = form.password;
    updateMutation.mutate(payload);
  };

  const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: () => void }) => (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? "bg-accent" : "bg-border"}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${enabled ? "translate-x-5" : ""}`} />
    </button>
  );

  if (isLoading) {
    return (
      <div>
        {/* Breadcrumb */}
        <div className="mb-1">
          <Skeleton className="h-4 w-40" />
        </div>
        {/* Title */}
        <Skeleton className="h-8 w-56 mb-6" />
        {/* Card */}
        <div className="border rounded-xl p-6 space-y-6" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
          {/* 2-column: name + email */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Skeleton className="h-3 w-10 mb-2" />
              <Skeleton className="h-10 w-full" rounded="xl" />
            </div>
            <div>
              <Skeleton className="h-3 w-14 mb-2" />
              <Skeleton className="h-10 w-full" rounded="xl" />
            </div>
          </div>
          {/* 2-column: password + empty */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Skeleton className="h-3 w-20 mb-2" />
              <Skeleton className="h-10 w-full" rounded="xl" />
            </div>
          </div>
          {/* 3 toggle switches */}
          <div className="space-y-4">
            <Skeleton className="h-4 w-28 mb-2" />
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-start gap-4 p-4 rounded-xl border" style={{ backgroundColor: "var(--color-card-bg)", borderColor: "var(--color-border)" }}>
                <Skeleton className="w-11 h-6" rounded="full" />
                <div className="flex-1 space-y-1">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-64" />
                </div>
              </div>
            ))}
          </div>
          {/* Active toggle */}
          <div className="flex items-center gap-3">
            <Skeleton className="w-11 h-6" rounded="full" />
            <div className="space-y-1">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-56" />
            </div>
          </div>
          {/* Save + Cancel buttons */}
          <div className="flex items-center gap-3 pt-4 border-t" style={{ borderColor: "var(--color-border)" }}>
            <Skeleton className="h-9 w-24" rounded="xl" />
            <Skeleton className="h-9 w-28" rounded="xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!manager) {
    return (
      <div className="text-center py-12">
        <p className="text-secondary">Menejer topilmadi</p>
        <Button variant="secondary" className="mt-4" onClick={() => navigate("/managers")}>Orqaga qaytish</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1">
        <span className="text-sm text-secondary">
          <button onClick={() => navigate("/managers")} className="hover:text-white transition-colors">Menejerlar</button>
          {" / "}Tahrirlash
        </span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">Menejerni tahrirlash</h1>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-secondary mb-1">Ism <span className="text-danger">*</span></label>
              <input type="text" name="name" value={form.name} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:outline-none focus:border-accent transition-colors"
                required />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">Username <span className="text-danger">*</span></label>
              <input type="text" name="email" value={form.email} onChange={handleChange}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:outline-none focus:border-accent transition-colors"
                required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-secondary mb-1">Parol <span className="text-xs text-secondary">(o'zgartirish uchun)</span></label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} name="password" value={form.password} onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:outline-none focus:border-accent transition-colors pr-12"
                  placeholder="Yangi parol (ixtiyoriy)" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-white transition-colors">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Access toggles */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Kirish huquqlari</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-4 p-4 bg-primary border border-border rounded-xl">
                <div className="pt-0.5">
                  <Toggle enabled={form.canViewDashboard} onChange={() => setForm((prev) => ({ ...prev, canViewDashboard: !prev.canViewDashboard }))} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor size={16} className="text-accent" />
                    <span className="text-white font-medium text-sm">O'z dashboardini ko'rish</span>
                  </div>
                  <p className="text-secondary text-xs">Faqat o'ziga tegishli qo'ng'iroqlar, tahlillar va audio fayllar ko'rinadi.</p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-primary border border-border rounded-xl">
                <div className="pt-0.5">
                  <Toggle enabled={form.canViewAll} onChange={() => setForm((prev) => ({ ...prev, canViewAll: !prev.canViewAll }))} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={16} className="text-green-400" />
                    <span className="text-white font-medium text-sm">Jamoa dashboardini ko'rish</span>
                  </div>
                  <p className="text-secondary text-xs">Barcha menejerlarning umumiy dashboard, statistika va solishtirish imkoniyati.</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Toggle enabled={form.isActive} onChange={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))} />
            <div>
              <span className="text-white text-sm">Faol</span>
              <p className="text-secondary text-xs">Faol bo'lmagan menejerlar tizimga kira olmaydi</p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button type="submit" loading={updateMutation.isPending}>Saqlash</Button>
            <Button variant="secondary" onClick={() => navigate("/managers")}>Bekor qilish</Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default EditManagerPage;
