// backend/controllers/auditController.js
import pool from "../config/db.js";

/**
 * GET /api/audit/document/:id
 *
 * Returns audit log entries for a single document.
 * Shape matches the `audit` array returned by loadFullDocument()
 * in documentController (id, document_id, action, note, actor_email, created_at).
 */
export const getDocumentAudit = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ message: "Document id is required" });
    }

    const { rows } = await pool.query(
      `
      SELECT
        dal.id,
        dal.document_id,
        dal.action,
        dal.note,
        u.email AS actor_email,
        dal.created_at AS created_at
      FROM document_audit_log dal
      LEFT JOIN users u ON u.id = dal.actor_id
      WHERE dal.document_id = $1
      ORDER BY dal.created_at DESC
      `,
      [id]
    );

    return res.json(rows);
  } catch (err) {
    console.error("getDocumentAudit error:", err);
    return res
      .status(500)
      .json({ message: "Failed to load document audit log" });
  }
};
