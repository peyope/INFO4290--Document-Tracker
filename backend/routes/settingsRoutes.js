// backend/routes/settingsRoutes.js
import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/authorizeMiddleware.js";

const router = express.Router();

// Keys used in the `settings` table
const LIBRARY_COLUMNS_KEY = "library_columns";
const SYSTEM_SETTINGS_KEY = "system_settings";

// Default set of columns (id + label + visible)
const DEFAULT_COLUMNS = [
  { id: "id", label: "ID", visible: true },
  { id: "title", label: "Title", visible: true },
  { id: "site", label: "Site", visible: true },
  { id: "location", label: "Location", visible: true },
  { id: "status", label: "Status", visible: true },
  { id: "retention_date", label: "Retention Date", visible: true },
  { id: "owner_name", label: "Owner", visible: true },
  { id: "holder_name", label: "Holder", visible: true },
];

// Default system settings
const DEFAULT_SYSTEM_SETTINGS = {
  default_retention_years: 10,
  due_soon_days: 30,
  default_access_request_role: "Clerk", // only Clerk/Admin allowed
  library_page_size: 50,
};

/**
 * Helper to fetch a settings row by key.
 */
async function getSettingsRow(key) {
  const { rows } = await pool.query(
    `SELECT key, value FROM settings WHERE key = $1 LIMIT 1`,
    [key]
  );
  return rows[0] || null;
}

/**
 * Helper to upsert settings row.
 */
async function upsertSettingsRow(key, value) {
  await pool.query(
    `
      INSERT INTO settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key)
      DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `,
    [key, value]
  );
}

/* =====================================================
   LIBRARY COLUMNS SETTINGS
   -----------------------------------------------------
   GET  /api/settings/library-columns
   PUT  /api/settings/library-columns   (SuperAdmin only)
===================================================== */

/**
 * Get current library column configuration.
 * Anyone logged-in can read; only SuperAdmin can modify.
 */
router.get("/library-columns", protect, async (_req, res) => {
  try {
    const row = await getSettingsRow(LIBRARY_COLUMNS_KEY);

    if (!row || !row.value || !Array.isArray(row.value.columns)) {
      // If missing or malformed, return defaults (do not write yet).
      return res.json({ columns: DEFAULT_COLUMNS });
    }

    return res.json({ columns: row.value.columns });
  } catch (err) {
    console.error("Error fetching library columns settings:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * Save library column configuration.
 * Only SuperAdmin can update.
 * Body: { columns: [{ id, label, visible }, ...] }
 */
router.put(
  "/library-columns",
  protect,
  requireRole("SuperAdmin"),
  async (req, res) => {
    try {
      const { columns } = req.body;

      if (!Array.isArray(columns)) {
        return res
          .status(400)
          .json({ message: "columns must be an array of column configs" });
      }

      const sanitized = columns.map((c) => ({
        id: String(c.id),
        label: c.label ? String(c.label) : String(c.id),
        visible: Boolean(c.visible),
      }));

      await upsertSettingsRow(LIBRARY_COLUMNS_KEY, { columns: sanitized });

      return res.json({ columns: sanitized });
    } catch (err) {
      console.error("Error saving library columns settings:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* =====================================================
   SYSTEM SETTINGS
   -----------------------------------------------------
   GET  /api/settings/system
   PUT  /api/settings/system          (SuperAdmin only)
===================================================== */

/**
 * Merge row.value with defaults and return a clean object.
 */
function mergeSystemSettings(rowValue) {
  const value = rowValue && typeof rowValue === "object" ? rowValue : {};
  return {
    default_retention_years:
      Number.isFinite(Number(value.default_retention_years))
        ? Number(value.default_retention_years)
        : DEFAULT_SYSTEM_SETTINGS.default_retention_years,
    due_soon_days:
      Number.isFinite(Number(value.due_soon_days))
        ? Number(value.due_soon_days)
        : DEFAULT_SYSTEM_SETTINGS.due_soon_days,
    default_access_request_role:
      value.default_access_request_role === "Admin" ||
      value.default_access_request_role === "Clerk"
        ? value.default_access_request_role
        : DEFAULT_SYSTEM_SETTINGS.default_access_request_role,
    library_page_size:
      Number.isFinite(Number(value.library_page_size))
        ? Number(value.library_page_size)
        : DEFAULT_SYSTEM_SETTINGS.library_page_size,
  };
}

/**
 * GET /api/settings/system
 * Anyone logged-in can read system settings.
 */
router.get("/system", protect, async (_req, res) => {
  try {
    const row = await getSettingsRow(SYSTEM_SETTINGS_KEY);

    const merged = mergeSystemSettings(row?.value);
    // Optionally upsert to ensure it exists in DB
    if (!row) {
      await upsertSettingsRow(SYSTEM_SETTINGS_KEY, merged);
    }

    return res.json(merged);
  } catch (err) {
    console.error("Error fetching system settings:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * PUT /api/settings/system
 * Only SuperAdmin can update system settings.
 * Body: {
 *   default_retention_years: number,
 *   due_soon_days: number,
 *   default_access_request_role: "Admin" | "Clerk",
 *   library_page_size: number
 * }
 */
router.put(
  "/system",
  protect,
  requireRole("SuperAdmin"),
  async (req, res) => {
    try {
      const {
        default_retention_years,
        due_soon_days,
        default_access_request_role,
        library_page_size,
      } = req.body || {};

      const errors = [];

      const retentionYearsNum = Number(default_retention_years);
      if (!Number.isFinite(retentionYearsNum) || retentionYearsNum <= 0) {
        errors.push("default_retention_years must be a positive number");
      }

      const dueSoonNum = Number(due_soon_days);
      if (!Number.isFinite(dueSoonNum) || dueSoonNum <= 0) {
        errors.push("due_soon_days must be a positive number");
      }

      const pageSizeNum = Number(library_page_size);
      if (!Number.isFinite(pageSizeNum) || pageSizeNum <= 0) {
        errors.push("library_page_size must be a positive number");
      }

      if (
        default_access_request_role !== "Admin" &&
        default_access_request_role !== "Clerk"
      ) {
        errors.push("default_access_request_role must be 'Admin' or 'Clerk'");
      }

      if (errors.length) {
        return res.status(400).json({ message: errors.join("; ") });
      }

      const newSettings = {
        default_retention_years: retentionYearsNum,
        due_soon_days: dueSoonNum,
        default_access_request_role,
        library_page_size: pageSizeNum,
      };

      await upsertSettingsRow(SYSTEM_SETTINGS_KEY, newSettings);

      return res.json(newSettings);
    } catch (err) {
      console.error("Error saving system settings:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
