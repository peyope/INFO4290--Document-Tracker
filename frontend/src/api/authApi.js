// frontend/src/api/authApi.js
import axios from "axios";

const authApi = axios.create({
  baseURL: "http://localhost:5000/auth", // no /api prefix here
  headers: { "Content-Type": "application/json" },
});

authApi.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default authApi;
