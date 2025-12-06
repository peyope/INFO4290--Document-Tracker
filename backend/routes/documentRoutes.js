// backend/routes/documentRoutes.js
import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";
import { logAudit } from "../utils/auditLogger.js";
import multer from "multer";
import path from "path";

const router = express.Router();

/* =====================================================
   Multer setup for digital file uploads
===================================================== */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/documents/");
  },
  filename: function (req, file, cb) {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);
    cb(null, uniqueName);
  },
});
const upload = multer({ storage });

/* =====================================================
   HELPER: Build filters
===================================================== */
function buildFilter({ q, site, status }) {
  let where = "WHERE 1=1";
  const vals = [];

  if (q) {
    vals.push(`%${q}%`);
    where += ` AND (title ILIKE $${vals.length})`;
  }

  if (site) {
    vals.push(site);
    where += ` AND site = $${vals.length}`;
  }

  if (status) {
    vals.push(status);
    where += ` AND status = $${vals.length}`;
  }

  return { where, vals };
}

/* =====================================================
   GET /api/documents  (LIST)
===================================================== */
router.get("/", protect, async (req, res) => {
  try {
    const { q, site, status } = req.query;
    const { where, vals } = buildFilter({ q, site, status });

    const sql = `
      SELECT
        id,
        title,
        site,
        location,
        status,
        description,
        created_at,
        updated_at,
        checked_out_by,
        checked_out_at,
        file_closed_date,
        due_at,
        retention_date,
        retention_notified,
        owner_name,
        owner_email,
        holder_name,
        holder_email
      FROM documents
      ${where}
      ORDER BY id DESC
    `;

    const { rows } = await pool.query(sql, vals);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching documents:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   POST /api/documents (CREATE)
===================================================== */
router.post("/", protect, async (req, res) => {
  const { title, site, location, status } = req.body;

  // Basic validation to match your Library.jsx expectations
  if (!title || !site || !status) {
    return res
      .status(400)
      .json({ message: "Title, site, and status are required." });
  }

  try {
    const insertRes = await pool.query(
      `
      INSERT INTO documents (title, site, location, status)
      VALUES ($1, $2, $3, $4)
      RETURNING
        id,
        title,
        site,
        location,
        status,
        description,
        created_at,
        updated_at,
        checked_out_by,
        checked_out_at,
        file_closed_date,
        due_at,
        retention_date,
        retention_notified,
        owner_name,
        owner_email,
        holder_name,
        holder_email
      `,
      [title.trim(), site, location || null, status]
    );

    const doc = insertRes.rows[0];

    // Log audit entry for creation
    await logAudit({
      documentId: doc.id,
      userId: req.user?.id,
      action: "create",
      note: "Document created",
    });

    res.status(201).json(doc);
  } catch (err) {
    console.error("Error creating document:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   GET /api/documents/:id (DETAIL WITH FILES + AUDIT)
===================================================== */
router.get("/:id", protect, async (req, res) => {
  const { id } = req.params;

  try {
    const docRes = await pool.query(
      `
      SELECT
        id,
        title,
        site,
        location,
        status,
        description,
        created_at,
        updated_at,
        checked_out_by,
        checked_out_at,
        file_closed_date,
        due_at,
        retention_date,
        retention_notified,
        owner_name,
        owner_email,
        holder_name,
        holder_email
      FROM documents
      WHERE id = $1
      `,
      [id]
    );

    const doc = docRes.rows[0];
    if (!doc) return res.sendStatus(404);

    // Digital files
    const filesRes = await pool.query(
      `
      SELECT
        id,
        filename,
        mime_type,
        size_bytes,
        uploaded_at
      FROM document_files
      WHERE document_id = $1
      ORDER BY uploaded_at DESC, id DESC
      `,
      [id]
    );

    // Audit log
    const auditRes = await pool.query(
      `
      SELECT
        l.id,
        l.action,
        l.note,
        l.created_at,
        u.email AS actor_email
      FROM document_audit_log l
      LEFT JOIN users u ON u.id = l.actor_id
      WHERE l.document_id = $1
      ORDER BY l.created_at DESC, l.id DESC
      LIMIT 200
      `,
      [id]
    );

    res.json({
      document: { ...doc, files: filesRes.rows },
      audit: auditRes.rows,
    });
  } catch (err) {
    console.error("Error fetching document:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   PUT /api/documents/:id (UPDATE)
===================================================== */
router.put("/:id", protect, async (req, res) => {
  const { id } = req.params;

  const {
    title,
    site,
    location,
    status,
    description,
    file_closed_date,
    due_at,
    retention_date,
    owner_name,
    owner_email,
    holder_name,
    holder_email,
  } = req.body;

  try {
    // Load current for audit
    const beforeRes = await pool.query(
      `
      SELECT
        id,
        title,
        site,
        location,
        status,
        description,
        file_closed_date,
        due_at,
        retention_date,
        owner_name,
        owner_email,
        holder_name,
        holder_email
      FROM documents
      WHERE id = $1
      `,
      [id]
    );
    const before = beforeRes.rows[0];
    if (!before) return res.sendStatus(404);

    // Update document
    const updateRes = await pool.query(
      `
      UPDATE documents
      SET
        title            = COALESCE($1, title),
        site             = COALESCE($2, site),
        location         = COALESCE($3, location),
        status           = COALESCE($4, status),
        description      = COALESCE($5, description),
        file_closed_date = COALESCE($6, file_closed_date),
        due_at           = COALESCE($7, due_at),
        retention_date   = COALESCE($8, retention_date),
        owner_name       = COALESCE($9, owner_name),
        owner_email      = COALESCE($10, owner_email),
        holder_name      = COALESCE($11, holder_name),
        holder_email     = COALESCE($12, holder_email),
        updated_at       = NOW()
      WHERE id = $13
      RETURNING
        id,
        title,
        site,
        location,
        status,
        description,
        created_at,
        updated_at,
        checked_out_by,
        checked_out_at,
        file_closed_date,
        due_at,
        retention_date,
        retention_notified,
        owner_name,
        owner_email,
        holder_name,
        holder_email
      `,
      [
        title ?? null,
        site ?? null,
        location ?? null,
        status ?? null,
        description ?? null,
        file_closed_date ?? null,
        due_at ?? null,
        retention_date ?? null,
        owner_name ?? null,
        owner_email ?? null,
        holder_name ?? null,
        holder_email ?? null,
        id,
      ]
    );

    const after = updateRes.rows[0];

    // Audit
    await logAudit({
      documentId: id,
      userId: req.user?.id,
      action: "update",
      before,
      after,
    });

    res.json(after);
  } catch (err) {
    console.error("Error updating document:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   FILE UPLOAD
===================================================== */
router.post("/:id/files", protect, upload.single("file"), async (req, res) => {
  try {
    const { filename, mimetype, size } = req.file;

    const { rows } = await pool.query(
      `
      INSERT INTO document_files (document_id, filename, mime_type, size_bytes)
      VALUES ($1, $2, $3, $4)
      RETURNING id, filename, mime_type, size_bytes, uploaded_at
      `,
      [req.params.id, filename, mimetype, size]
    );

    res.json(rows[0]);
  } catch (err) {
    console.error("Error uploading file:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   DOWNLOAD FILE
===================================================== */
router.get("/files/:fileId", protect, async (req, res) => {
  try {
    const { fileId } = req.params;

    const { rows } = await pool.query(
      `
      SELECT filename FROM document_files WHERE id = $1
      `,
      [fileId]
    );
    const file = rows[0];
    if (!file) return res.sendStatus(404);

    const filePath = path.join("uploads/documents", file.filename);
    res.download(filePath, file.filename);
  } catch (err) {
    console.error("Error downloading file:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =====================================================
   DELETE FILE
===================================================== */
router.delete("/files/:fileId", protect, async (req, res) => {
  try {
    const { fileId } = req.params;

    const { rowCount } = await pool.query(
      `
      DELETE FROM document_files
      WHERE id = $1
      `,
      [fileId]
    );

    if (rowCount === 0) return res.sendStatus(404);

    res.sendStatus(204);
  } catch (err) {
    console.error("Error deleting file:", err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
