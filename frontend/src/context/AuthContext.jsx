// frontend/src/context/AuthContext.jsx
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
} from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const storedUser = localStorage.getItem("user");
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch {
        localStorage.removeItem("user");
      }
    }
    setLoading(false);
  }, []);

  /**
   * Normal login flow.
   * - On success: stores user + token and navigates to /library
   * - On error: lets the error bubble to the caller (Login.jsx)
   */
  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    const { user: u, token } = res.data;

    // save auth
    localStorage.setItem("user", JSON.stringify(u));
    localStorage.setItem("token", token);
    setUser(u);

    // go to library
    navigate("/library", { replace: true });
  };

  const logout = () => {
    // clear auth
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("pendingUserId");
    setUser(null);

    // navigate to login
    navigate("/", { replace: true });

    // hard redirect as backup
    setTimeout(() => {
      if (window.location.pathname !== "/") {
        window.location.replace("/");
      }
    }, 0);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

/**
 * Custom hook so other files can do:
 *   const { user, login, logout } = useAuth();
 */
export const useAuth = () => useContext(AuthContext);
