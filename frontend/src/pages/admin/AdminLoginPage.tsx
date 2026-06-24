import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import adminApi from "../../services/admin.service";
import Button from "../../components/ui/Button";

const AdminLoginPage: React.FC = () => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await adminApi.login(username, password);
      localStorage.setItem("admin_token", result.token);
      toast.success("Admin paneliga xush kelibsiz!");
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

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-accent">SalesAI Admin</h1>
          <p className="text-secondary mt-2">Admin paneliga kirish</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
              placeholder="Username kiriting"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary mb-1">
              Parol
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 bg-primary border border-border rounded-xl text-white placeholder-secondary focus:border-accent transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          <Button type="submit" loading={loading} className="w-full" size="lg">
            Kirish
          </Button>
        </form>
      </div>
    </div>
  );
};

export default AdminLoginPage;
