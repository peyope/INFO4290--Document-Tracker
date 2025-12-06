// backend/utils/auditLogger.js
import pool from "../config/db.js";

/**
 * Write an entry into document_audit_log.
 * Schema: id, document_id, actor_id, action, note, created_at.
 *
 * Supports either:
 *  - explicit `note` (string), OR
 *  - `before` + `after` objects, from which it will build a diff JSON and
 *    store it in `note`.
 */
export async function logAudit({
  documentId,
  userId = null,
  action,
  note = null,
  before = null,
  after = null,
}) {
  try {
    const a = String(action).toLowerCase();

    let finalNote = note;

    // If no explicit note was provided but we have before/after,
    // build a simple field diff object and JSON.stringify it.
    if (!finalNote && before && after) {
      // Fields we care about for document updates
      // NOTE: due_at removed (not used in UI anymore)
      const watchedFields = [
        "title",
        "site",
        "location",
        "status",
        "description",
        "file_closed_date",
        "retention_date",
        "owner_name",
        // owner_email, holder_email intentionally NOT watched
        "holder_name",
      ];

      const normalize = (v) => {
        // Treat undefined / null / "" as the same
        if (v === undefined || v === null) return null;
        if (typeof v === "string") {
          const trimmed = v.trim();
          if (trimmed === "") return null;
          return trimmed;
        }
        // If it's a Date object from node-postgres, compare by value
        if (v instanceof Date) {
          return v.toISOString(); // full timestamp
        }
        return v;
      };

      const changes = {};

      for (const key of watchedFields) {
        const beforeVal = normalize(before[key]);
        const afterVal = normalize(after[key]);

        if (beforeVal !== afterVal) {
          changes[key] = {
            from: beforeVal,
            to: afterVal,
          };
        }
      }

      if (Object.keys(changes).length > 0) {
        // Only store a note if at least one watched field changed
        finalNote = JSON.stringify(changes);
      } else if (a === "update") {
        // No actual field changes for an update: skip logging entirely
        return;
      }
    }

    await pool.query(
      `INSERT INTO document_audit_log (document_id, actor_id, action, note)
       VALUES ($1, $2, $3, $4)`,
      [documentId, userId, a, finalNote]
    );
  } catch (err) {
    console.error("⚠️ Audit insert failed:", err.message);
  }
}
