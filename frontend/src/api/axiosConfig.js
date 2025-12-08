// frontend/src/api/axiosConfig.js
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:5000/api",  // backend routes all start with /api
  headers: {
    "Content-Type": "application/json",
  },
});

// Automatically add JWT token to every request
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Allow file uploads (FormData) without forcing JSON header
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Global error handling 
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      console.warn("Unauthorized — token expired or invalid.");
      // redirect to login
      // window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);

export default api;
