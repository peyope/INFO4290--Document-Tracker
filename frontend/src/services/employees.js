// frontend/src/services/employees.js
import api from "../api/axiosConfig";

/**
 * GET /api/employees
 */
export async function listEmployees({ includeInactive = false } = {}) {
  const { data } = await api.get("/employees", {
    params: { includeInactive: includeInactive ? "true" : "false" },
  });
  return data || [];
}

/**
 * GET /api/employees/:id
 */
export async function getEmployee(id) {
  const { data } = await api.get(`/employees/${id}`);
  return data;
}

/**
 * POST /api/employees
 */
export async function createEmployee(payload) {
  const { data } = await api.post("/employees", payload);
  return data;
}

/**
 * PUT /api/employees/:id
 */
export async function updateEmployee(id, payload) {
  const { data } = await api.put(`/employees/${id}`, payload);
  return data;
}

/**
 * DELETE /api/employees/:id
 * (Soft delete: sets status = 'Inactive')
 */
export async function deleteEmployee(id) {
  await api.delete(`/employees/${id}`);
}

/**
 * Helper for consistent display
 */
export function formatEmployeeName(emp) {
  if (!emp) return "";
  const first = emp.first_name?.trim() || "";
  const last = emp.last_name?.trim() || "";
  return `${first} ${last}`.trim();
}
