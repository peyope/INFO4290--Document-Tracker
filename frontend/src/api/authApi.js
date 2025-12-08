// frontend/src/api/authApi.js
import axios from "axios";

// Auth API uses the same backend route prefix as the main API
const authApi = axios.create({
  baseURL: "http://localhost:5000/api/auth",
  headers: {
    "Content-Type": "application/json",
  },
});

// Attach token automatically when available
authApi.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Allow FormData for profile image upload or future endpoints
    if (config.data instanceof FormData) {
      delete config.headers["Content-Type"];
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Centralized error handling for login errors
authApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;

    if (status === 401) {
      console.warn("Auth 401 — Token expired or invalid.");
    }

    if (status === 403) {
      console.warn("Auth 403 — Access denied.");
    }

    return Promise.reject(error);
  }
);

export default authApi;
