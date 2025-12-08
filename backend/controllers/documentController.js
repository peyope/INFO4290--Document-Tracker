// backend/controllers/documentController.js
import pool from "../config/db.js";
import fs from "fs";
import path from "path";
import { logAudit } from "../utils/auditLogger.js";

/* ---------------------------------------------------------
   Helper: Load full document + files + audit
--------------------------------------------------------- */
export async function loadFullDocument(id) {
  // Document row
  const docRes = await pool.query(`SELECT * FROM documents WHERE id = $1`, [
    id,
  ]);
  if (docRes.rows.length === 0) return null;
  const document = docRes.rows[0];

  // Files
  const filesRes = await pool.query(
    `
    SELECT 
      id,
      filename AS file_name,
      storage_path AS file_path,
      mime_type,
      size_bytes,
      uploaded_at
    FROM document_files
    WHERE document_id = $1
    ORDER BY uploaded_at DESC
    `,
    [id]
  );

  // Document audit entries (document_audit_log + users for email)
  const auditRes = await pool.query(
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

  return {
    document,
    files: filesRes.rows,
    audit: auditRes.rows,
  };
}

/* ---------------------------------------------------------
   GET ALL DOCUMENTS (library)
--------------------------------------------------------- */
export const getDocuments = async (req, res) => {
  try {
    const results = await pool.query(`
      SELECT
        d.*,
        COALESCE(o.first_name || ' ' || o.last_name, NULL) AS owner_name,
        COALESCE(h.first_name || ' ' || h.last_name, NULL) AS holder_name
      FROM documents d
      LEFT JOIN employees o ON o.id = d.owner_id
      LEFT JOIN employees h ON h.id = d.holder_id
      ORDER BY d.updated_at DESC, d.id DESC
    `);

    res.json(results.rows);
  } catch (err) {
    console.error("getDocuments error:", err);
    res.status(500).json({ error: "Failed to fetch documents" });
  }
};

/* ---------------------------------------------------------
   GET SINGLE DOCUMENT
--------------------------------------------------------- */
export const getDocument = async (req, res) => {
  try {
    const id = req.params.id;

    const full = await loadFullDocument(id);
    if (!full) return res.status(404).json({ error: "Document not found" });

    res.json(full);
  } catch (err) {
    console.error("getDocument error:", err);
    res.status(500).json({ error: "Failed to load document" });
  }
};

/* ---------------------------------------------------------
   CREATE DOCUMENT (used by Library "New File")
--------------------------------------------------------- */
export const createDocument = async (req, res) => {
  try {
    const { title, site, location, status } = req.body;
    const userId = req.user?.id || null;

    if (!title || !site || !status) {
      return res
        .status(400)
        .json({ error: "Title, site, and status are required" });
    }

    const insertRes = await pool.query(
      `
      INSERT INTO documents (
        title,
        site,
        location,
        status,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING *
      `,
      [title, site, location || null, status]
    );

    const newDoc = insertRes.rows[0];

    // Audit: create
    await logAudit({
      documentId: newDoc.id,
      userId,
      action: "create",
      note: `Document created from Library: "${newDoc.title}"`,
      trackedFields: [],
    });

    const full = await loadFullDocument(newDoc.id);
    res.status(201).json(full);
  } catch (err) {
    console.error("createDocument error:", err);
    res.status(500).json({ error: "Failed to create document" });
  }
};

/* ---------------------------------------------------------
   UPDATE DOCUMENT
--------------------------------------------------------- */
export const updateDocument = async (req, res) => {
  try {
    const docId = req.params.id;

    const oldRes = await pool.query(`SELECT * FROM documents WHERE id = $1`, [
      docId,
    ]);
    if (oldRes.rows.length === 0)
      return res.status(404).json({ error: "Document not found" });

    const oldDoc = oldRes.rows[0];

    const {
      title,
      location,
      site,
      description,
      retention_date,
      file_closed_date,
      owner_id,
      holder_id,
    } = req.body;

    const status = holder_id ? "CheckedOut" : "Available";

    const updateRes = await pool.query(
      `
      UPDATE documents
      SET 
        title = $1,
        location = $2,
        site = $3,
        description = $4,
        retention_date = $5,
        file_closed_date = $6,
        owner_id = $7,
        holder_id = $8,
        status = $9,
        updated_at = NOW()
      WHERE id = $10
      RETURNING *
      `,
      [
        title,
        location,
        site,
        description,
        retention_date || null,
        file_closed_date || null,
        owner_id || null,
        holder_id || null,
        status,
        docId,
      ]
    );

    const newDoc = updateRes.rows[0];

    await logAudit({
      documentId: docId,
      userId: req.user.id,
      action: "update",
      before: oldDoc,
      after: newDoc,
      trackedFields: [
        "title",
        "location",
        "site",
        "description",
        "retention_date",
        "file_closed_date",
        "owner_id",
        "holder_id",
        "status",
      ],
    });

    const full = await loadFullDocument(docId);
    res.json(full);
  } catch (err) {
    console.error("updateDocument error:", err);
    res.status(500).json({ error: "Update failed" });
  }
};

/* ---------------------------------------------------------
   DELETE DOCUMENT
--------------------------------------------------------- */
export const deleteDocument = async (req, res) => {
  try {
    const docId = req.params.id;

    // Load doc for audit
    const oldRes = await pool.query(`SELECT * FROM documents WHERE id = $1`, [
      docId,
    ]);
    const oldDoc = oldRes.rows[0] || null;

    // load files to delete them from disk
    const filePaths = await pool.query(
      `SELECT storage_path FROM document_files WHERE document_id = $1`,
      [docId]
    );

    // Delete files from disk
    filePaths.rows.forEach((f) => {
      const fullPath = path.join("uploads/documents", f.storage_path);
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    });

    // Delete DB rows
    await pool.query(`DELETE FROM document_files WHERE document_id = $1`, [
      docId,
    ]);
    await pool.query(`DELETE FROM documents WHERE id = $1`, [docId]);

    // Audit - only if document existed
    if (oldDoc) {
      await logAudit({
        documentId: docId,
        userId: req.user.id,
        action: "delete",
        note: "Document deleted",
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("deleteDocument error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
};

/* ---------------------------------------------------------
   UPLOAD FILE
--------------------------------------------------------- */
export const uploadFile = async (req, res) => {
  try {
    const docId = req.params.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const insertRes = await pool.query(
      `
      INSERT INTO document_files
        (document_id, filename, storage_path, mime_type, size_bytes, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING 
        id,
        filename AS file_name,
        storage_path AS file_path,
        mime_type,
        size_bytes,
        uploaded_at
      `,
      [
        docId,
        file.originalname,
        file.filename,
        file.mimetype,
        file.size,
        req.user.id,
      ]
    );

    await logAudit({
      documentId: docId,
      userId: req.user.id,
      action: "file-upload",
      note: `File uploaded: ${file.originalname}`,
    });

    res.json(insertRes.rows[0]);
  } catch (err) {
    console.error("uploadFile error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
};

/* ---------------------------------------------------------
   DELETE FILE
--------------------------------------------------------- */
export const deleteFile = async (req, res) => {
  try {
    const { id, fileId } = req.params;

    const fileRes = await pool.query(
      `SELECT filename, storage_path FROM document_files WHERE id = $1`,
      [fileId]
    );

    if (fileRes.rows.length === 0)
      return res.status(404).json({ error: "File not found" });

    const fileName = fileRes.rows[0].filename;
    const filePath = path.join(
      "uploads/documents",
      fileRes.rows[0].storage_path
    );

    // remove disk file
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    // remove DB row
    await pool.query(`DELETE FROM document_files WHERE id = $1`, [fileId]);

    await logAudit({
      documentId: id,
      userId: req.user.id,
      action: "file-delete",
      note: `File deleted: ${fileName}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("deleteFile error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
};

/* ---------------------------------------------------------
   DOWNLOAD FILE
--------------------------------------------------------- */
export const downloadFile = async (req, res) => {
  try {
    const { fileId } = req.params;

    const fileRes = await pool.query(
      `
      SELECT filename, storage_path, mime_type
      FROM document_files
      WHERE id = $1
      `,
      [fileId]
    );

    if (fileRes.rows.length === 0)
      return res.status(404).json({ error: "File not found" });

    const file = fileRes.rows[0];
    const fullPath = path.join("uploads/documents", file.storage_path);

    if (!fs.existsSync(fullPath))
      return res.status(404).json({ error: "File missing from server" });

    res.setHeader("Content-Type", file.mime_type);
    res.setHeader("Content-Disposition", `inline; filename="${file.filename}"`);

    return res.sendFile(path.resolve(fullPath));
  } catch (err) {
    console.error("downloadFile error:", err);
    res.status(500).json({ error: "Failed to download file" });
  }
};

/* ---------------------------------------------------------
   RETENTION DECISION (Stage 1)
--------------------------------------------------------- */
export const recordRetentionDecision = async (req, res) => {
  const docId = req.params.id;
  const userId = req.user.id;
  const { decision, note, new_retention_date } = req.body;

  if (!decision) {
    return res.status(400).json({ error: "Decision is required" });
  }

  try {
    // Load current document (for audit + defaults)
    const { rows } = await pool.query(
      `SELECT * FROM documents WHERE id = $1`,
      [docId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }
    const oldDoc = rows[0];

    let retentionDate = oldDoc.retention_date;
    if (new_retention_date !== undefined) {
      retentionDate = new_retention_date || null;
    }

    // If we approve destruction, stamp approval time.
    // If we move away from Destroy, clear it.
    let destructionApprovedAt = oldDoc.destruction_approved_at;
    if (decision === "Destroy") {
      destructionApprovedAt = new Date(); // stored via NOW() below
    } else {
      destructionApprovedAt = null;
    }

    const updateRes = await pool.query(
      `
      UPDATE documents
      SET
        retention_action = $1,
        retention_date = $2,
        destruction_approved_at = $3,
        updated_at = NOW()
      WHERE id = $4
      RETURNING *
      `,
      [decision, retentionDate, destructionApprovedAt, docId]
    );

    const newDoc = updateRes.rows[0];

    await logAudit({
      documentId: docId,
      userId,
      action: "retention-decision",
      before: oldDoc,
      after: newDoc,
      trackedFields: [
        "retention_action",
        "retention_date",
        "destruction_approved_at",
      ],
      note: note || null,
    });

    const full = await loadFullDocument(docId);
    return res.json(full);
  } catch (err) {
    console.error("recordRetentionDecision error:", err);
    return res.status(500).json({ error: "Failed to save retention decision" });
  }
};

/* ---------------------------------------------------------
   CONFIRM DESTRUCTION (Stage 2)
--------------------------------------------------------- */
export const confirmDestruction = async (req, res) => {
  const docId = req.params.id;
  const userId = req.user.id;

  try {
    // 1) Ensure document exists and is marked for destruction
    const { rows } = await pool.query(
      `SELECT * FROM documents WHERE id = $1`,
      [docId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Document not found" });
    }

    const oldDoc = rows[0];

    if (oldDoc.retention_action !== "Destroy") {
      return res.status(400).json({
        error:
          "Document is not currently marked for destruction. Set the retention decision to 'Destroy' first.",
      });
    }

    // 2) Load files so we can delete them from disk
    const filesRes = await pool.query(
      `SELECT id, storage_path, filename FROM document_files WHERE document_id = $1`,
      [docId]
    );

    for (const f of filesRes.rows) {
      if (!f.storage_path) continue;
      const filePath = path.join("uploads/documents", f.storage_path);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.warn("Failed to delete file from disk:", filePath, e.message);
        }
      }
    }

    // 3) Delete file rows from DB
    await pool.query(`DELETE FROM document_files WHERE document_id = $1`, [
      docId,
    ]);

    // 4) Mark the document as destroyed
    const updateRes = await pool.query(
      `
      UPDATE documents
      SET
        status = 'Destroyed',
        destruction_completed_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [docId]
    );
    const newDoc = updateRes.rows[0];

    // 5) Audit log
    await logAudit({
      documentId: docId,
      userId,
      action: "destroyed",
      before: oldDoc,
      after: newDoc,
      note: "Document destroyed and digital files removed.",
      trackedFields: ["status", "destruction_completed_at"],
    });

    // 6) Return updated full payload
    const full = await loadFullDocument(docId);
    return res.json(full);
  } catch (err) {
    console.error("confirmDestruction error:", err);
    return res.status(500).json({ error: "Failed to confirm destruction" });
  }
};
