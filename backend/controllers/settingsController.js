// backend/controllers/settingsController.js
import pool from "../config/db.js";

/**
 * GET /settings/system
 * Returns the current system settings, or sensible defaults if none are stored.
 */
export const getSystemSettings = async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        default_retention_years,
        due_soon_days,
        default_access_request_role,
        library_page_size
      FROM system_settings
      ORDER BY id ASC
      LIMIT 1
      `
    );

    if (result.rows.length === 0) {
      return res.json({
        default_retention_years: 10,
        due_soon_days: 30,
        default_access_request_role: "Clerk",
        library_page_size: 50,
      });
    }

    const row = result.rows[0];
    return res.json({
      default_retention_years: row.default_retention_years,
      due_soon_days: row.due_soon_days,
      default_access_request_role: row.default_access_request_role,
      library_page_size: row.library_page_size,
    });
  } catch (err) {
    console.error("getSystemSettings error:", err);
    return res
      .status(500)
      .json({ error: "Failed to load system settings" });
  }
};

/**
 * PUT /settings/system
 * Body: {
 *   default_retention_years: number,
 *   due_soon_days: number,
 *   default_access_request_role: "Clerk" | "Admin",
 *   library_page_size: number
 * }
 */
export const updateSystemSettings = async (req, res) => {
  try {
    let {
      default_retention_years,
      due_soon_days,
      default_access_request_role,
      library_page_size,
    } = req.body;

    // Normalise & validate numbers
    default_retention_years = Number(default_retention_years);
    due_soon_days = Number(due_soon_days);
    library_page_size = Number(library_page_size);

    if (!Number.isFinite(default_retention_years) || default_retention_years < 0) {
      return res
        .status(400)
        .json({ error: "Default retention (years) must be a non-negative number." });
    }

    if (!Number.isFinite(due_soon_days) || due_soon_days < 0) {
      return res
        .status(400)
        .json({ error: "Due soon threshold (days) must be a non-negative number." });
    }

    if (!Number.isFinite(library_page_size) || library_page_size <= 0) {
      return res
        .status(400)
        .json({ error: "Library page size must be a positive number." });
    }

    // Restrict role to known values
    if (
      !default_access_request_role ||
      !["Clerk", "Admin"].includes(default_access_request_role)
    ) {
      return res.status(400).json({
        error: "Default access request role must be either 'Clerk' or 'Admin'.",
      });
    }

    // Check if we already have a row
    const existing = await pool.query(
      `SELECT id FROM system_settings ORDER BY id ASC LIMIT 1`
    );

    if (existing.rows.length === 0) {
      // Insert first row
      await pool.query(
        `
        INSERT INTO system_settings (
          default_retention_years,
          due_soon_days,
          default_access_request_role,
          library_page_size
        )
        VALUES ($1, $2, $3, $4)
        `,
        [
          default_retention_years,
          due_soon_days,
          default_access_request_role,
          library_page_size,
        ]
      );
    } else {
      // Update existing row
      const id = existing.rows[0].id;
      await pool.query(
        `
        UPDATE system_settings
        SET
          default_retention_years = $1,
          due_soon_days = $2,
          default_access_request_role = $3,
          library_page_size = $4,
          updated_at = NOW()
        WHERE id = $5
        `,
        [
          default_retention_years,
          due_soon_days,
          default_access_request_role,
          library_page_size,
          id,
        ]
      );
    }

    // Return the fresh values back to the client
    return res.json({
      default_retention_years,
      due_soon_days,
      default_access_request_role,
      library_page_size,
    });
  } catch (err) {
    console.error("updateSystemSettings error:", err);
    return res
      .status(500)
      .json({ error: "Failed to save system settings" });
  }
};
