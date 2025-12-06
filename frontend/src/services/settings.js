// frontend/src/services/settings.js
import api from "../api/axiosConfig";

/**
 * Fetch the current library column configuration.
 * Returns: { columns: [{ id, label, visible }] }
 */
export async function getLibraryColumns() {
  const { data } = await api.get("/settings/library-columns");
  return data;
}

/**
 * Save the library column configuration.
 * columns: [{ id, label?, visible }]
 * Returns: { columns: [...] }
 */
export async function saveLibraryColumns(columns) {
  const { data } = await api.put("/settings/library-columns", { columns });
  return data;
}

/**
 * Fetch global system settings.
 * Returns:
 * {
 *   default_retention_years: number,
 *   due_soon_days: number,
 *   default_access_request_role: "Admin" | "Clerk",
 *   library_page_size: number
 * }
 */
export async function getSystemSettings() {
  const { data } = await api.get("/settings/system");
  return data;
}

/**
 * Save global system settings.
 * Accepts same shape as returned by getSystemSettings().
 */
export async function saveSystemSettings(settings) {
  const { data } = await api.put("/settings/system", settings);
  return data;
}
