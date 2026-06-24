import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import adminApi from "../../services/admin.service";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { SkeletonTable } from "../../components/ui/Skeleton";

const AdminDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: companies, isLoading } = useQuery<any[]>({
    queryKey: ["admin-companies"],
    queryFn: () => adminApi.getCompanies(),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => adminApi.toggleCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Holat o'zgartirildi");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-companies"] });
      toast.success("Kompaniya o'chirildi");
    },
    onError: () => toast.error("Xatolik yuz berdi"),
  });

  const handleDelete = (id: string, name: string) => {
    if (window.confirm(`"${name}" kompaniyasini o'chirmoqchimisiz?`)) {
      deleteMutation.mutate(id);
    }
  };

  if (isLoading) {
    return <SkeletonTable rows={6} cols={5} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Kompaniyalar boshqaruvi</h2>
        <Button onClick={() => navigate("/admin/companies/create")}>Yangi kompaniya</Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-secondary font-medium">Nomi</th>
                <th className="text-left px-4 py-3 text-secondary font-medium">Username</th>
                <th className="text-left px-4 py-3 text-secondary font-medium">Holati</th>
                <th className="text-left px-4 py-3 text-secondary font-medium">Menejerlar</th>
                <th className="text-left px-4 py-3 text-secondary font-medium">Audio</th>
                <th className="text-left px-4 py-3 text-secondary font-medium">Umumiy limit</th>
                <th className="text-left px-4 py-3 text-secondary font-medium">Yaratilgan</th>
                <th className="text-right px-4 py-3 text-secondary font-medium">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {companies && companies.length > 0 ? (
                companies.map((c: any) => (
                  <tr key={c.id} className="border-b border-border last:border-b-0 hover:bg-primary/50 transition-colors">
                    <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-secondary">{c.username}</td>
                    <td className="px-4 py-3">
                      <Badge variant={c.isActive ? "success" : "danger"}>
                        {c.isActive ? "Faol" : "Faolsiz"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-secondary">
                      {c.managersCount ?? 0} / {c.managerLimit ?? 20}
                    </td>
                    <td className="px-4 py-3 text-secondary">{c.audioCount ?? 0}</td>
                    <td className="px-4 py-3 text-secondary">{c.totalLimitHours ?? 500} soat</td>
                    <td className="px-4 py-3 text-secondary">
                      {new Date(c.createdAt).toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => navigate(`/admin/companies/${c.id}/edit`)} className="text-xs text-accent hover:underline">
                          Tahrirlash
                        </button>
                        <button onClick={() => navigate(`/admin/companies/${c.id}/amocrm`)} className="text-xs text-info hover:underline">
                          AmoCRM
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate(c.id)}
                          className={`text-xs hover:underline ${c.isActive ? "text-warning" : "text-success"}`}
                        >
                          {c.isActive ? "To'xtatish" : "Faollashtirish"}
                        </button>
                        <button onClick={() => handleDelete(c.id, c.name)} className="text-xs text-danger hover:underline">
                          O'chirish
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-secondary">
                    Kompaniyalar topilmadi
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboardPage;
