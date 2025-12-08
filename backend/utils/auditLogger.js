// backend/utils/auditLogger.js
import pool from "../config/db.js";

/**
 * Normalize values so we can compare them reliably for audit diffs.
 * - Dates -> ISO string
 * - Empty strings -> null
 * - Undefined -> null
 */
function normalizeForDiff(field, value) {
  if (value === undefined) return null;

  // Treat empty strings as "no value"
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return null;
    return trimmed;
  }

  // Date objects from pg -> ISO string
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

/**
 * Helper: convert an employee id to "First Last".
 * Falls back to "ID 123" if not found.
 */
async function employeeIdToName(id) {
  if (id === null || id === undefined) return null;

  try {
    const res = await pool.query(
      `SELECT first_name, last_name FROM employees WHERE id = $1`,
      [id]
    );
    if (res.rows.length === 0) {
      return `ID ${id}`;
    }
    const row = res.rows[0];
    const full = [row.first_name, row.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();
    return full || `ID ${id}`;
  } catch (err) {
    console.error("employeeIdToName lookup failed:", err);
    return `ID ${id}`;
  }
}

/**
 * Given a diff object of the form:
 *   { field: { from, to }, ... }
 * convert owner_id / holder_id entries into
 *   owner_name / holder_name with full names.
 */
async function buildHumanReadableDiff(diff) {
  if (!diff || typeof diff !== "object") return diff;

  const human = { ...diff };

  // owner_id → owner_name
  if (Object.prototype.hasOwnProperty.call(diff, "owner_id")) {
    const { from, to } = diff.owner_id || {};
    const fromName =
      from !== null && from !== undefined
        ? await employeeIdToName(from)
        : null;
    const toName =
      to !== null && to !== undefined ? await employeeIdToName(to) : null;

    human.owner_name = { from: fromName, to: toName };
    delete human.owner_id;
  }

  // holder_id → holder_name
  if (Object.prototype.hasOwnProperty.call(diff, "holder_id")) {
    const { from, to } = diff.holder_id || {};
    const fromName =
      from !== null && from !== undefined
        ? await employeeIdToName(from)
        : null;
    const toName =
      to !== null && to !== undefined ? await employeeIdToName(to) : null;

    human.holder_name = { from: fromName, to: toName };
    delete human.holder_id;
  }

  return human;
}

/**
 * Log a document-level audit entry.
 *
 * Params:
 *  - documentId: number
 *  - userId:     number | null
 *  - action:     string
 *  - before:     row object BEFORE change 
 *  - after:      row object AFTER change  
 *  - trackedFields: array of field names to diff 
 *  - note:       string ( if omitted and trackedFields provided, we auto-build JSON diff)
 */
export async function logAudit({
  documentId,
  userId,
  action,
  before,
  after,
  trackedFields = [],
  note,
}) {
  try {
    let finalNote = note || null;

    // Build a diff JSON only if caller didn't provide a custom note
    if (!finalNote && before && after && trackedFields.length > 0) {
      const diff = {};

      for (const field of trackedFields) {
        const beforeHasField = Object.prototype.hasOwnProperty.call(
          before,
          field
        );
        const afterHasField = Object.prototype.hasOwnProperty.call(
          after,
          field
        );

        const rawBefore = beforeHasField ? before[field] : null;
        const rawAfter = afterHasField ? after[field] : null;

        const beforeVal = normalizeForDiff(field, rawBefore);
        const afterVal = normalizeForDiff(field, rawAfter);

        // Skip if both null/empty
        const bothEmpty =
          (beforeVal === null || beforeVal === undefined) &&
          (afterVal === null || afterVal === undefined);
        if (bothEmpty) continue;

        // Skip if unchanged
        if (beforeVal === afterVal) continue;

        diff[field] = { from: beforeVal, to: afterVal };
      }

      // Convert owner_id / holder_id to names
      const humanDiff = await buildHumanReadableDiff(diff);

      if (humanDiff && Object.keys(humanDiff).length > 0) {
        finalNote = JSON.stringify(humanDiff);
      }
    }

    await pool.query(
      `
      INSERT INTO document_audit_log (document_id, actor_id, action, note)
      VALUES ($1, $2, $3, $4)
      `,
      [documentId, userId, action, finalNote]
    );
  } catch (err) {
    console.error("Audit logging failed:", err);
  }
}
