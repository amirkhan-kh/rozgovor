import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { Company, ManagerUser } from "../types";
import { authService } from "../services/auth.service";

interface AuthState {
  user: Company | null;
  managerUser: ManagerUser | null;
  userRole: "company" | "manager" | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  managerLogin: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<Company | null>(null);
  const [managerUser, setManagerUser] = useState<ManagerUser | null>(null);
  const [userRole, setUserRole] = useState<"company" | "manager" | null>(
    localStorage.getItem("userRole") as "company" | "manager" | null
  );
  const [token, setToken] = useState<string | null>(
    localStorage.getItem("token")
  );
  const [isLoading, setIsLoading] = useState(true);

  const isAuthenticated = !!token && (!!user || !!managerUser);

  const checkAuth = useCallback(async () => {
    const storedToken = localStorage.getItem("token");
    if (!storedToken) {
      setIsLoading(false);
      return;
    }

    try {
      const meData = await authService.getMe();
      const meRole = (meData as any).role;
      if (meRole === "sotuvchi" || meRole === "rop" || meRole === "manager") {
        setManagerUser(meData as unknown as ManagerUser);
        setUserRole("manager");
      } else {
        setUser(meData as Company);
        setUserRole("company");
      }
      setToken(storedToken);
    } catch {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      localStorage.removeItem("userRole");
      setUser(null);
      setManagerUser(null);
      setUserRole(null);
      setToken(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (username: string, password: string) => {
    const result = await authService.login(username, password);
    localStorage.setItem("token", result.token);
    localStorage.setItem("userRole", result.role);

    if (result.role === "manager" && result.user) {
      localStorage.setItem("user", JSON.stringify(result.user));
      setManagerUser(result.user);
      setUserRole("manager");
    } else if (result.company) {
      localStorage.setItem("user", JSON.stringify(result.company));
      setUser(result.company);
      setUserRole("company");
    }
    setToken(result.token);
  };

  const managerLogin = async (username: string, password: string) => {
    await login(username, password);
  };

  const register = async (_name: string, _username: string, _password: string) => {
    throw new Error("Ro'yxatdan o'tish o'chirilgan");
  };

  const logout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("userRole");
    setToken(null);
    setUser(null);
    setManagerUser(null);
    setUserRole(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        managerUser,
        userRole,
        token,
        isAuthenticated,
        isLoading,
        login,
        managerLogin,
        register,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthState => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
