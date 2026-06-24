import React, { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import adminApi from "../../services/admin.service";
import Button from "../../components/ui/Button";
import { SkeletonForm } from "../../components/ui/Skeleton";

const AdminAmoCrmPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [domain, setDomain] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [authorizationCode, setAuthorizationCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [exchangeLoading, setExchangeLoading] = useState(false);

  const { data: company, isLoading: isFetching } = useQuery({
    queryKey: ["admin-company", id],
    queryFn: () => adminApi.getCompanyDetail(id!),
    enabled: !!id,
  });

  React.useEffect(() => {
    if (company?.amocrm) {
      const amo = company.amocrm;
      setDomain(amo.domain || "");
      setClientId(amo.clientId || "");
      setClientSecret(amo.clientSecret || "");
      setRedirectUri(amo.redirectUri || "");
    }
  }, [company]);

  const isConnected = !!(company?.amocrm?.accessToken);
  const tokenExpiresAt = company?.amocrm?.tokenExpiresAt;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await adminApi.setAmoCrm(id!, {
        domain,
        clientId,
        clientSecret,
        redirectUri,
      });
      toast.success("AmoCRM sozlamalari saqlandi");
      queryClient.invalidateQueries({ queryKey: ["admin-company", id] });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Xatolik yuz berdi";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleExchangeToken = async () => {
    if (!authorizationCode.trim()) {
      toast.error("Integratsiya kodini kiriting");
      return;
    }
    setExchangeLoading(true);

    try {
      await adminApi.exchangeAmoCrmToken(id!, {
        domain,
        clientId,
        clientSecret,
        redirectUri,
        authorizationCode,
      });
      toast.success("Tokenlar muvaffaqiyatli olindi");
      setAuthorizationCode("");
      queryClient.invalidateQueries({ queryKey: ["admin-company", id] });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data
          ?.error || "Token olishda xatolik yuz berdi";
      toast.error(message);
    } finally {
      setExchangeLoading(false);
    }
  };

  if (isFetching) {
    return <SkeletonForm fields={5} />;
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-secondary mb-6">
        <button
          onClick={() => navigate("/admin")}
          className="hover:text-white transition-colors"
        >
          Admin
        </button>
        <span>/</span>
        <span className="hover:text-white transition-colors">
          {company?.name || "Kompaniya"}
        </span>
        <span>/</span>
        <span className="text-white">AmoCRM sozlamalari</span>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            AmoCRM sozlamalari
          </h2>
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
              isConnected
                ? "bg-green-500/20 text-green-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {isConnected ? "Ulangan" : "Ulanmagan"}
          </span>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              AmoCRM domeni
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
              placeholder="mycompany.amocrm.ru"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Client ID
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
              placeholder="Client ID"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Client Secret
            </label>
            <input
              type="text"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
              placeholder="Client Secret"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Redirect URI
            </label>
            <input
              type="text"
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
              placeholder="https://example.com/callback"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button type="submit" loading={loading}>
              Saqlash
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate("/admin")}
            >
              Bekor qilish
            </Button>
          </div>
        </form>

        {/* Token exchange section */}
        <div className="mt-8 pt-6 border-t border-border">
          <h3 className="text-lg font-semibold text-white mb-4">
            Tokenlarni olish
          </h3>

          <div className="mb-4">
            <label className="block text-sm font-medium text-secondary mb-1">
              Integratsiya kodi
            </label>
            <input
              type="text"
              value={authorizationCode}
              onChange={(e) => setAuthorizationCode(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
              placeholder="Integratsiya kodini kiriting"
            />
            <p className="text-xs text-secondary mt-1.5">
              AmoCRM dan olingan integratsiya kodini kiriting. Tokenlar avtomatik olinadi.
            </p>
          </div>

          <Button
            onClick={handleExchangeToken}
            loading={exchangeLoading}
          >
            Tokenlarni olish
          </Button>

          {/* Connection status */}
          <div className="mt-4 p-4 bg-primary border border-border rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  isConnected ? "bg-green-400" : "bg-red-400"
                }`}
              />
              <span className="text-sm text-white font-medium">
                {isConnected ? "Ulangan" : "Ulanmagan"}
              </span>
            </div>
            {isConnected && tokenExpiresAt && (
              <p className="text-xs text-secondary">
                Token muddati:{" "}
                {new Date(tokenExpiresAt).toLocaleString("uz-UZ", {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            )}
            {!isConnected && (
              <p className="text-xs text-secondary">
                Ulanish uchun yuqoridagi maydonlarni to'ldiring va integratsiya kodini kiriting.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminAmoCrmPage;
