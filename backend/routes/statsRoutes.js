// backend/routes/statsRoutes.js
import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/authorizeMiddleware.js"; // assumes you have this

const router = express.Router();

/**
 * GET /api/stats
 * Returns counts for dashboard cards + retention alert
 * Role: Admin or Manager
 */
router.get(
  "/",
  protect,
  requireRole(["Admin", "Manager"]),
  async (_req, res) => {
    try {
      const { rows: totalRows } = await pool.query(
        "SELECT COUNT(*)::int AS total FROM documents"
      );
      const { rows: checkedOutRows } = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM documents WHERE status='CheckedOut'"
      );
      const { rows: availableRows } = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM documents WHERE status='Available'"
      );
      const { rows: offsiteRows } = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM documents WHERE site='Offsite'"
      );

      // ✅ New: documents whose retention date is within the next 30 days
      // (includes overdue documents as well since they are <= now + 30 days)
      const { rows: dueSoonRows } = await pool.query(
        `
        SELECT COUNT(*)::int AS cnt
        FROM documents
        WHERE due_at IS NOT NULL
          AND due_at::date <= (CURRENT_DATE + INTERVAL '30 days')
        `
      );

      res.json({
        total: totalRows[0]?.total ?? 0,
        checkedOut: checkedOutRows[0]?.cnt ?? 0,
        available: availableRows[0]?.cnt ?? 0,
        offsite: offsiteRows[0]?.cnt ?? 0,
        dueSoon: dueSoonRows[0]?.cnt ?? 0, // 👈 used for the alert
      });
    } catch (err) {
      console.error("GET /api/stats error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
