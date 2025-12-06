// backend/routes/auditRoutes.js
import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";
import { requireRole } from "../middleware/authorizeMiddleware.js";

const router = express.Router();

/**
 * GET /api/audit/recent?limit=10
 * Recent audit activity (global)
 * Role: Admin or Manager
 */
router.get(
  "/recent",
  protect,
  requireRole(["Admin", "Manager"]),
  async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit || "10", 10), 50);

    try {
      const { rows } = await pool.query(
        `
        SELECT 
          a.id,
          a.document_id,
          a.actor_id,
          a.action,
          a.note,
          a.created_at,
          d.title AS document_title,
          u.email AS actor_email
        FROM document_audit_log a
        LEFT JOIN documents d ON d.id = a.document_id
        LEFT JOIN users u     ON u.id = a.actor_id
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT $1
        `,
        [limit]
      );

      res.json(rows);
    } catch (err) {
      console.error("GET /api/audit/recent error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * GET /api/audit/document/:id
 * Per-document audit trail
 */
router.get("/document/:id", protect, async (req, res) => {
  const docId = +req.params.id;
  if (Number.isNaN(docId)) {
    return res.status(400).json({ message: "Invalid id" });
  }

  try {
    const { rows } = await pool.query(
      `
      SELECT 
        a.id,
        a.document_id,
        a.actor_id,
        a.action,
        a.note,
        a.created_at,
        u.email AS actor_email
      FROM document_audit_log a
      LEFT JOIN users u ON u.id = a.actor_id
      WHERE a.document_id = $1
      ORDER BY a.created_at DESC, a.id DESC
      `,
      [docId]
    );

    res.json(rows);
  } catch (err) {
    console.error("GET /api/audit/document/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
