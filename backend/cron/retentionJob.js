// backend/cron/retentionJob.js
import cron from "node-cron";
import pool from "../config/db.js";
import { logAudit } from "../utils/auditLogger.js";

/**
 * Daily retention check based on retention_date.
 *
 * For each document where:
 *   - retention_date IS NOT NULL
 *   - retention_date <= CURRENT_DATE  (due or overdue)
 *   - retention_notified is FALSE or NULL
 *
 * We:
 *   - write an audit entry ("retention_due")
 *   - set retention_notified = TRUE
 */
export function startRetentionJob() {
  // Every day at 8:00 AM server time
  cron.schedule("0 8 * * *", async () => {
    console.log("[RetentionJob] Running retention check…");

    try {
      // Find docs whose retention date has arrived or passed,
      // and which we haven't already notified on.
      const { rows } = await pool.query(
        `
        SELECT
          id,
          title,
          retention_date
        FROM documents
        WHERE retention_date IS NOT NULL
          AND retention_date <= CURRENT_DATE
          AND (retention_notified IS NULL OR retention_notified = FALSE)
        `
      );

      if (!rows.length) {
        console.log("[RetentionJob] No documents due for retention.");
        return;
      }

      for (const doc of rows) {
        try {
          // Write an audit entry
          await logAudit({
            documentId: doc.id,
            userId: null, // system job
            action: "retention_due",
            note: `Retention date reached (${doc.retention_date}) for "${doc.title}"`,
          });

          // Mark as notified so we don't keep repeating
          await pool.query(
            `
            UPDATE documents
            SET retention_notified = TRUE
            WHERE id = $1
            `,
            [doc.id]
          );
        } catch (err) {
          console.error(
            `[RetentionJob] Error processing document ${doc.id}:`,
            err
          );
        }
      }

      console.log(`[RetentionJob] Processed ${rows.length} document(s).`);
    } catch (err) {
      console.error("[RetentionJob] Error during retention check:", err);
    }
  });
}
