// backend/controllers/dashboardController.js
import pool from "../config/db.js";

/**
 * GET /api/dashboard/summary
 * Returns high-level stats for the dashboard:
 * - document counts
 * - retention situation
 * - check-outs
 * - recent activity
 * - pending access requests
 */
export const getDashboardSummary = async (req, res) => {
  try {
    // Load system settings (due soon days, etc.) 
    let defaultRetentionYears = 10;
    let dueSoonDays = 30;

    try {
      const settingsRes = await pool.query(
        `
        SELECT default_retention_years, due_soon_days
        FROM system_settings
        ORDER BY id
        LIMIT 1
        `
      );
      if (settingsRes.rows[0]) {
        if (settingsRes.rows[0].default_retention_years != null) {
          defaultRetentionYears = settingsRes.rows[0].default_retention_years;
        }
        if (settingsRes.rows[0].due_soon_days != null) {
          dueSoonDays = settingsRes.rows[0].due_soon_days;
        }
      }
    } catch (err) {
      console.warn(
        "Dashboard: system_settings not found, using defaults",
        err.message
      );
    }

    // Run all the core queries in parallel
    const [
      totalsRes,
      pendingReqRes,
      overdueRes,
      dueSoonRes,
      retentionNeedsRes,
      checkoutListRes,
      checkoutLongestRes,
      docEventsRes,
      adminEventsRes,
    ] = await Promise.all([
      // Overall document totals (hide Destroyed)
      pool.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE status <> 'Destroyed')::int AS total_active,
          COUNT(*) FILTER (WHERE status = 'CheckedOut')::int AS checked_out
        FROM documents
        `
      ),

      // Pending access requests
      pool.query(
        `
        SELECT COUNT(*)::int AS pending_requests
        FROM access_requests
        WHERE status = 'pending'
        `
      ),

      // Overdue retention (retention_date in the past, not destroyed)
      pool.query(
        `
        SELECT COUNT(*)::int AS overdue_retention
        FROM documents
        WHERE retention_date IS NOT NULL
          AND retention_date < CURRENT_DATE
          AND status <> 'Destroyed'
        `
      ),

      // Due soon retention (within dueSoonDays, not destroyed)
      pool.query(
        `
        SELECT COUNT(*)::int AS due_soon_retention
        FROM documents
        WHERE retention_date IS NOT NULL
          AND retention_date >= CURRENT_DATE
          AND retention_date <= CURRENT_DATE + ($1::int) * INTERVAL '1 day'
          AND status <> 'Destroyed'
        `,
        [dueSoonDays]
      ),

      // Documents that need a retention decision soon
      // NOTE: now we include any doc with a retention_date within the window,
      // even if it already has a retention_action (e.g., extended earlier).
      pool.query(
        `
        SELECT
          d.id,
          d.title,
          d.location,
          d.site,
          d.status,
          d.retention_date,
          d.retention_action
        FROM documents d
        WHERE d.status <> 'Destroyed'
          AND d.retention_date IS NOT NULL
          AND d.retention_date <= CURRENT_DATE + ($1::int) * INTERVAL '1 day'
        ORDER BY d.retention_date ASC
        LIMIT 5
        `,
        [dueSoonDays]
      ),

      // Top 5 current check-outs
      pool.query(
        `
        SELECT
          d.id,
          d.title,
          d.location,
          d.site,
          d.status,
          d.checked_out_at,
          d.updated_at,
          e.first_name,
          e.last_name
        FROM documents d
        LEFT JOIN employees e ON e.id = d.holder_id
        WHERE d.status = 'CheckedOut'
        ORDER BY d.checked_out_at ASC NULLS LAST, d.updated_at ASC NULLS LAST
        LIMIT 5
        `
      ),

      // Longest open check-out (in days) – still uses checked_out_at if present
      pool.query(
        `
        SELECT
          MAX(CURRENT_DATE - DATE(COALESCE(checked_out_at, updated_at)))::int AS longest_days
        FROM documents
        WHERE status = 'CheckedOut'
          AND COALESCE(checked_out_at, updated_at) IS NOT NULL
        `
      ),

      // Recent document audit events (from audit_log view)
      pool.query(
        `
        SELECT
          a.id,
          a.document_id,
          a.action,
          a.note,
          a.actor_email,
          a.ts AS created_at
        FROM audit_log a
        ORDER BY a.ts DESC
        LIMIT 10
        `
      ),

      // Recent admin user activity (join to users to get emails)
      pool.query(
        `
        SELECT
          aua.id,
          aua.action_type,
          actor.email AS actor_email,
          target.email AS target_email,
          aua.details,
          aua.created_at
        FROM admin_user_activity aua
        LEFT JOIN users actor ON actor.id = aua.actor_user_id
        LEFT JOIN users target ON target.id = aua.target_user_id
        ORDER BY aua.created_at DESC
        LIMIT 10
        `
      ),
    ]);

    const totalsRow = totalsRes.rows[0] || {
      total_active: 0,
      checked_out: 0,
    };
    const pendingRow = pendingReqRes.rows[0] || { pending_requests: 0 };
    const overdueRow = overdueRes.rows[0] || { overdue_retention: 0 };
    const dueSoonRow = dueSoonRes.rows[0] || { due_soon_retention: 0 };
    const longestRow = checkoutLongestRes.rows[0] || { longest_days: null };

    // Map check-outs to a simpler shape
    const checkoutItems = checkoutListRes.rows.map((row) => {
      let daysOut = null;

      const baseDateStr = row.checked_out_at || row.updated_at;
      if (baseDateStr) {
        const base = new Date(baseDateStr);
        if (!Number.isNaN(base.getTime())) {
          const now = new Date();
          const diffMs = now.getTime() - base.getTime();
          daysOut = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          if (daysOut < 0) daysOut = 0;
        }
      }

      const holderName =
        row.first_name || row.last_name
          ? [row.first_name, row.last_name].filter(Boolean).join(" ")
          : null;

      return {
        id: row.id,
        title: row.title,
        location: row.location,
        site: row.site,
        status: row.status,
        holder_name: holderName,
        checked_out_at: row.checked_out_at,
        days_out: daysOut,
      };
    });

    res.json({
      settings: {
        default_retention_years: defaultRetentionYears,
        due_soon_days: dueSoonDays,
      },
      totals: {
        total_active: totalsRow.total_active ?? 0,
        checked_out: totalsRow.checked_out ?? 0,
        overdue_retention: overdueRow.overdue_retention ?? 0,
        due_soon_retention: dueSoonRow.due_soon_retention ?? 0,
        pending_access_requests: pendingRow.pending_requests ?? 0,
      },
      retention: {
        needs_decision: retentionNeedsRes.rows,
      },
      checkouts: {
        items: checkoutItems,
        longest_open_days: longestRow.longest_days,
      },
      activity: {
        document_events: docEventsRes.rows,
        admin_events: adminEventsRes.rows,
      },
    });
  } catch (err) {
    console.error("getDashboardSummary error:", err);
    res.status(500).json({ error: "Failed to load dashboard summary" });
  }
};
