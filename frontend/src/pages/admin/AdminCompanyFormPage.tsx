import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Users, Shield, Clock } from "lucide-react";
import adminApi from "../../services/admin.service";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { SkeletonForm } from "../../components/ui/Skeleton";

const AdminCompanyFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totalLimitHours, setTotalLimitHours] = useState(500);
  const [managerLimit, setManagerLimit] = useState(20);
  const [audioLimitPerManager, setAudioLimitPerManager] = useState(100);
  const [loading, setLoading] = useState(false);

  const { data: company, isLoading: isFetching } = useQuery({
    queryKey: ["admin-company", id],
    queryFn: () => adminApi.getCompanyDetail(id!),
    enabled: isEdit,
  });

  useEffect(() => {
    if (company) {
      setName(company.name || "");
      setUsername(company.username || "");
      setTotalLimitHours(company.totalLimitHours ?? 500);
      setManagerLimit(company.managerLimit ?? 20);
      setAudioLimitPerManager(company.audioLimitPerManager ?? 100);
    }
  }, [company]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isEdit) {
        await adminApi.updateCompany(id!, {
          name,
          username,
          totalLimitHours,
          managerLimit,
          audioLimitPerManager,
        });
        toast.success("Kompaniya yangilandi");
      } else {
        await adminApi.createCompany({
          name,
          username,
          password,
          totalLimitHours,
          managerLimit,
        });
        toast.success("Kompaniya yaratildi");
      }
      navigate("/admin");
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Xatolik yuz berdi";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (isEdit && isFetching) {
    return <SkeletonForm fields={6} />;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-secondary mb-6">
        <button onClick={() => navigate("/admin")} className="hover:text-white transition-colors">
          Admin
        </button>
        <span>/</span>
        <span className="text-white">{isEdit ? "Tahrirlash" : "Kompaniya yaratish"}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-6">
            {isEdit ? "Kompaniyani tahrirlash" : "Yangi kompaniya yaratish"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Nomi</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
                  placeholder="Kompaniya nomi"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
                  placeholder="kompaniya_username"
                  required
                />
              </div>
            </div>

            {!isEdit && (
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">Parol</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
                  placeholder="••••••••"
                  required
                />
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Clock size={14} className="inline mr-1" />
                  Umumiy limit (soat)
                </label>
                <input
                  type="number"
                  value={totalLimitHours}
                  onChange={(e) => setTotalLimitHours(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:border-accent transition-colors"
                  min={0}
                />
                <p className="text-xs text-secondary mt-1">Transkripsiya + tahlil</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Users size={14} className="inline mr-1" />
                  Menejer limiti
                </label>
                <input
                  type="number"
                  value={managerLimit}
                  onChange={(e) => setManagerLimit(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:border-accent transition-colors"
                  min={0}
                />
                <p className="text-xs text-secondary mt-1">Maks menejerlar soni</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-secondary mb-1">
                  <Users size={14} className="inline mr-1" />
                  Audio/menejer
                </label>
                <input
                  type="number"
                  value={audioLimitPerManager}
                  onChange={(e) => setAudioLimitPerManager(Number(e.target.value))}
                  className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white focus:border-accent transition-colors"
                  min={0}
                />
                <p className="text-xs text-secondary mt-1">Har bir menejer limiti</p>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button type="submit" loading={loading}>
                {isEdit ? "Saqlash" : "Yaratish"}
              </Button>
              <Button variant="secondary" onClick={() => navigate("/admin")}>
                Bekor qilish
              </Button>
            </div>
          </form>
        </div>

        {/* Right panel — Edit rejimda menejerlar ro'yxati */}
        {isEdit && company && (
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Menejerlar</h3>
              <span className="text-xs text-secondary">
                {company.managersCount || 0} / {managerLimit}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 bg-primary rounded-full mb-4 overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${Math.min(((company.managersCount || 0) / managerLimit) * 100, 100)}%` }}
              />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-primary rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-white">{company.audioCount || 0}</div>
                <div className="text-xs text-secondary">Audio fayllar</div>
              </div>
              <div className="bg-primary rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-white">{company.analysisCount || 0}</div>
                <div className="text-xs text-secondary">Tahlillar</div>
              </div>
            </div>

            {/* Managers list */}
            <div className="space-y-2">
              {company.managers?.map((m: any) => (
                <div key={m.id} className={`flex items-center justify-between p-2.5 rounded-lg ${m.isActive ? "bg-primary" : "bg-primary/50 opacity-50"}`}>
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs text-accent font-bold">
                      {m.name?.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm text-white">{m.name}</div>
                      <div className="text-xs text-secondary">{m.email} · {m.audioCount || 0} audio</div>
                    </div>
                  </div>
                  <Badge variant={m.isActive ? "success" : "default"} size="sm">
                    {m.isActive ? "Faol" : "Nofaol"}
                  </Badge>
                </div>
              ))}
              {(!company.managers || company.managers.length === 0) && (
                <p className="text-sm text-secondary text-center py-4">Menejerlar yo'q</p>
              )}
            </div>

            {/* AmoCRM status */}
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield size={14} className="text-secondary" />
                  <span className="text-sm text-secondary">AmoCRM</span>
                </div>
                {company.amocrm ? (
                  <Badge variant="success" size="sm">Ulangan</Badge>
                ) : (
                  <Badge variant="default" size="sm">Ulanmagan</Badge>
                )}
              </div>
              {!company.amocrm && (
                <button
                  onClick={() => navigate(`/admin/companies/${id}/amocrm`)}
                  className="text-accent text-xs mt-2 hover:underline"
                >
                  AmoCRM ulash →
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminCompanyFormPage;
