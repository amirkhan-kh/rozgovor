import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Monitor, Users } from "lucide-react";
import toast from "react-hot-toast";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { managersService } from "../../services/managers.service";

interface FormData {
  name: string;
  email: string;
  password: string;
  canViewDashboard: boolean;
  canViewAll: boolean;
  isActive: boolean;
}

const initialForm: FormData = {
  name: "",
  email: "",
  password: "",
  canViewDashboard: true,
  canViewAll: false,
  isActive: true,
};

const CreateManagerPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormData>(initialForm);
  const [showPassword, setShowPassword] = useState(false);

  const createMutation = useMutation({
    mutationFn: managersService.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managers"] });
      toast.success("Menejer yaratildi");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent, stayOnPage: boolean = false) => {
    e.preventDefault();
    createMutation.mutate(
      {
        name: form.name,
        email: form.email,
        password: form.password,
        canViewDashboard: form.canViewDashboard,
        canViewAll: form.canViewAll,
      },
      {
        onSuccess: () => {
          if (stayOnPage) {
            setForm(initialForm);
          } else {
            navigate("/managers");
          }
        },
      }
    );
  };

  const Toggle = ({
    enabled,
    onChange,
  }: {
    enabled: boolean;
    onChange: () => void;
  }) => (
    <button
      type="button"
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? "bg-accent" : "bg-border"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          enabled ? "translate-x-5" : ""
        }`}
      />
    </button>
  );

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-1">
        <span className="text-sm text-secondary">
          <button onClick={() => navigate("/managers")} className="hover:text-white transition-colors">
            Menejerlar
          </button>
          {" / "}Yaratish
        </span>
      </div>

      <h1 className="text-2xl font-bold text-white mb-6">Yangi Manager yaratish</h1>

      <Card>
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
          {/* Ism va Username */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-secondary mb-1">
                Ism <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:outline-none focus:border-accent transition-colors"
                placeholder="Ism kiriting"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-secondary mb-1">
                Username <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="email"
                value={form.email}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:outline-none focus:border-accent transition-colors"
                placeholder="username kiriting"
                required
              />
            </div>
          </div>

          {/* Parol */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm text-secondary mb-1">
                Parol <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  name="password"
                  value={form.password}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:outline-none focus:border-accent transition-colors pr-12"
                  placeholder="Parolni kiriting"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-secondary hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          </div>

          {/* Access toggles */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">Kirish huquqlari</h3>
            <div className="space-y-4">
              {/* O'z dashboardi */}
              <div className="flex items-start gap-4 p-4 bg-primary border border-border rounded-xl">
                <div className="pt-0.5">
                  <Toggle
                    enabled={form.canViewDashboard}
                    onChange={() => setForm((prev) => ({ ...prev, canViewDashboard: !prev.canViewDashboard }))}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Monitor size={16} className="text-accent" />
                    <span className="text-white font-medium text-sm">O'z dashboardini ko'rish</span>
                  </div>
                  <p className="text-secondary text-xs leading-relaxed">
                    Menejer tizimga kirganda faqat o'ziga tegishli ma'lumotlarni ko'radi: o'z qo'ng'iroqlari, tahlillari, reytingi va audio fayllari. Boshqa menejerlarning ma'lumotlari ko'rinmaydi.
                  </p>
                </div>
              </div>

              {/* Jamoa dashboardi */}
              <div className="flex items-start gap-4 p-4 bg-primary border border-border rounded-xl">
                <div className="pt-0.5">
                  <Toggle
                    enabled={form.canViewAll}
                    onChange={() => setForm((prev) => ({ ...prev, canViewAll: !prev.canViewAll }))}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Users size={16} className="text-green-400" />
                    <span className="text-white font-medium text-sm">Jamoa dashboardini ko'rish</span>
                  </div>
                  <p className="text-secondary text-xs leading-relaxed">
                    Menejer barcha menejerlarning umumiy dashboard ini ko'ra oladi: jamoa statistikasi, barcha qo'ng'iroqlar tahlili, reyting va solishtirish. Bu odatda supervisor yoki team lead uchun yoqiladi.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Faol */}
          <div className="flex items-center gap-3">
            <Toggle
              enabled={form.isActive}
              onChange={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
            />
            <div>
              <span className="text-white text-sm">Faol</span>
              <p className="text-secondary text-xs">Faol bo'lmagan menejerlar tizimga kira olmaydi</p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button type="submit" loading={createMutation.isPending}>
              Yaratish
            </Button>
            <Button
              variant="secondary"
              loading={createMutation.isPending}
              onClick={() => handleSubmit(new Event("submit") as unknown as React.FormEvent, true)}
            >
              Yaratish va yana boshqa yaratish
            </Button>
            <Button variant="secondary" onClick={() => navigate("/managers")}>
              Bekor qilish
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
};

export default CreateManagerPage;
