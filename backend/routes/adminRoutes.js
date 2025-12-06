// backend/routes/adminRoutes.js
import express from "express";
import pool from "../config/db.js";
import { protect } from "../middleware/authMiddleware.js";
import { requirePermission } from "../middleware/authorizeMiddleware.js";
import bcrypt from "bcryptjs";

const router = express.Router();

/** Helper: generate a simple temporary password */
function generateTempPassword() {
  return "Temp-" + Math.random().toString(36).slice(-8);
}

/** Helper: log admin/user activity into admin_user_activity table */
async function logUserActivity(actorUserId, targetUserId, actionType, details = null) {
  try {
    await pool.query(
      `
      INSERT INTO admin_user_activity (actor_user_id, target_user_id, action_type, details)
      VALUES ($1, $2, $3, $4)
      `,
      [actorUserId || null, targetUserId || null, actionType, details]
    );
  } catch (err) {
    // Do not crash the main request if logging fails
    console.error("logUserActivity error:", err.message);
  }
}

/**
 * GET /api/admin/users
 * List all users with their roles (requires user:read)
 */
router.get(
  "/users",
  protect,
  requirePermission("user:read"),
  async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT
          u.id,
          u.email,
          u.full_name,
          u.is_active,
          COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
        FROM users u
        LEFT JOIN user_roles ur ON ur.user_id = u.id
        LEFT JOIN roles r       ON r.id = ur.role_id
        GROUP BY u.id
        ORDER BY u.id;
      `);
      res.json(rows);
    } catch (err) {
      console.error("Error fetching users:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * POST /api/admin/users
 * Create a user and assign a single primary role (but still accepts roleNames for compatibility)
 * body: { email, full_name?, password, roleName?: "Clerk", roleNames?: ["Clerk"] }
 */
router.post(
  "/users",
  protect,
  requirePermission("user:create"),
  async (req, res) => {
    const { email, full_name, password, roleName, roleNames = [] } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email & password required" });
    }

    // Enforce single role: prefer roleName, fallback to first in roleNames array, default "Clerk"
    const effectiveRoleName =
      roleName ||
      (Array.isArray(roleNames) && roleNames.length > 0 ? roleNames[0] : "Clerk");

    try {
      const hashed = await bcrypt.hash(password, 10);

      // Create the user (active by default)
      const created = (
        await pool.query(
          `INSERT INTO users (email, full_name, password, is_active)
           VALUES ($1,$2,$3, TRUE)
           ON CONFLICT (email) DO NOTHING
           RETURNING id, email, full_name, is_active`,
          [email, full_name || null, hashed]
        )
      ).rows[0];

      if (!created) {
        return res.status(409).json({ error: "Email already exists" });
      }

      // Assign single primary role by name
      if (effectiveRoleName) {
        const role = (
          await pool.query(`SELECT id FROM roles WHERE name=$1`, [effectiveRoleName])
        ).rows[0];
        if (role) {
          // Remove any existing roles (shouldn't be any for new user, but keep consistent)
          await pool.query(`DELETE FROM user_roles WHERE user_id=$1`, [created.id]);
          await pool.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [created.id, role.id]
          );
        }
      }

      // Log activity
      await logUserActivity(req.user.id, created.id, "create_user", {
        email: created.email,
        full_name: created.full_name,
        role: effectiveRoleName,
      });

      res.status(201).json(created);
    } catch (err) {
      console.error("Create user error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * PUT /api/admin/users/:id
 * Edit user (email, full_name, primary role)
 * body: { email, full_name?, roleName }
 */
router.put(
  "/users/:id",
  protect,
  requirePermission("user:update"),
  async (req, res) => {
    const userId = +req.params.id;
    const { email, full_name, roleName } = req.body;

    if (Number.isNaN(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    try {
      await pool.query("BEGIN");

      // Fetch current state for logging & admin protections
      const currentUser = (
        await pool.query(
          `
          SELECT u.id, u.email, u.full_name, u.is_active,
                 COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id
          LEFT JOIN roles r       ON r.id = ur.role_id
          WHERE u.id = $1
          GROUP BY u.id
        `,
          [userId]
        )
      ).rows[0];

      if (!currentUser) {
        await pool.query("ROLLBACK");
        return res.sendStatus(404);
      }

      // Prevent editing a SuperAdmin into something else (role change away from SuperAdmin)
      const hadSuperAdmin = (currentUser.roles || []).includes("SuperAdmin");
      if (hadSuperAdmin && roleName && roleName !== "SuperAdmin") {
        await pool.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "You cannot change the role of a SuperAdmin." });
      }

      // Update user core fields
      const updated = (
        await pool.query(
          `
          UPDATE users
             SET email=$1,
                 full_name=$2
           WHERE id=$3
           RETURNING id, email, full_name, is_active
        `,
          [email, full_name || null, userId]
        )
      ).rows[0];

      if (!updated) {
        await pool.query("ROLLBACK");
        return res.sendStatus(404);
      }

      let finalRole = null;

      if (roleName) {
        // If roleName is Admin and this user is currently one of the admins,
        // we might need to ensure at least one Admin remains if removing Admin.
        // For simplicity, we only enforce SuperAdmin immutability here
        const roleRow = (
          await pool.query(`SELECT id FROM roles WHERE name=$1`, [roleName])
        ).rows[0];

        if (roleRow) {
          // Replace roles with single primary role
          await pool.query(`DELETE FROM user_roles WHERE user_id=$1`, [userId]);
          await pool.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [userId, roleRow.id]
          );
          finalRole = roleName;
        }
      }

      await pool.query("COMMIT");

      // Log activity
      await logUserActivity(req.user.id, updated.id, "update_user", {
        old_email: currentUser.email,
        new_email: updated.email,
        old_full_name: currentUser.full_name,
        new_full_name: updated.full_name,
        old_roles: currentUser.roles,
        new_role: finalRole || (currentUser.roles && currentUser.roles[0]) || null,
      });

      res.json(updated);
    } catch (err) {
      console.error("Update user error:", err);
      try {
        await pool.query("ROLLBACK");
      } catch {}
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.post(
  "/users/:id/reset-password",
  protect,
  requirePermission("user:password_reset"),
  async (req, res) => {
    const targetUserId = +req.params.id;
    const actingUserId = req.user.id;
    const { new_password } = req.body;

    if (Number.isNaN(targetUserId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }
    if (!new_password || typeof new_password !== "string") {
      return res.status(400).json({ message: "new_password is required" });
    }

    // Basic policy example (adjust as you like)
    const tooShort = new_password.length < 8;
    if (tooShort) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }

    if (targetUserId === actingUserId) {
      return res.status(400).json({
        message: "Use your own change-password flow, not admin reset.",
      });
    }

    try {
      // ensure user exists & is active (optional)
      const { rows } = await pool.query(
        `SELECT id, email, is_active FROM users WHERE id=$1`,
        [targetUserId]
      );
      const user = rows[0];
      if (!user) return res.sendStatus(404);
      if (!user.is_active) {
        return res.status(400).json({ message: "User is deactivated" });
      }

      const hash = await bcrypt.hash(new_password, 10);

      await pool.query(
        `UPDATE users
           SET password = $1,
               must_change_password = TRUE,
               password_changed_at = NULL
         WHERE id = $2`,
        [hash, targetUserId]
      );

      await logUserActivity(actingUserId, targetUserId, "reset_password", {
        email: user.email,
      });

      return res
        .status(200)
        .json({ ok: true, message: "Password reset successfully." });
    } catch (err) {
      console.error("Reset password error:", err);
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * PUT /api/admin/users/:id/roles
 * Replace all roles for a user with the provided list (requires user:update)
 * body: { roleNames: ["Admin"] }
 *
 * NOTE: This route still supports multi-role arrays for compatibility,
 * but your UI should only send a SINGLE role to enforce the new model.
 */
router.put(
  "/users/:id/roles",
  protect,
  requirePermission("user:update"),
  async (req, res) => {
    const userId = +req.params.id;
    const { roleNames = [] } = req.body;

    try {
      // 🧠 Prevent removing the last Admin
      const adminRole = await pool.query(
        `SELECT id FROM roles WHERE name='Admin'`
      );
      const adminRoleId = adminRole.rows[0]?.id;

      // Check if this user is currently an Admin
      const isCurrentlyAdmin =
        (
          await pool.query(
            `SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id=$2`,
            [userId, adminRoleId]
          )
        ).rowCount > 0;

      // Count total active Admins
      const totalAdmins = (
        await pool.query(
          `SELECT COUNT(*) FROM user_roles ur
           JOIN users u ON ur.user_id = u.id
           WHERE ur.role_id=$1 AND u.is_active = TRUE`,
          [adminRoleId]
        )
      ).rows[0].count;

      // 🚫 Block removal if this is the last active Admin
      if (
        isCurrentlyAdmin &&
        !roleNames.includes("Admin") &&
        parseInt(totalAdmins) === 1
      ) {
        return res.status(400).json({
          message:
            "Operation not allowed. At least one active Admin must remain assigned.",
        });
      }

      // Get old roles for logging
      const oldRolesRes = await pool.query(
        `
        SELECT r.name
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1
      `,
        [userId]
      );
      const oldRoles = oldRolesRes.rows.map((r) => r.name);

      // ✅ Proceed with replacing roles
      await pool.query(`DELETE FROM user_roles WHERE user_id=$1`, [userId]);

      for (const name of roleNames) {
        const role = (
          await pool.query(`SELECT id FROM roles WHERE name=$1`, [name])
        ).rows[0];
        if (role) {
          await pool.query(
            `INSERT INTO user_roles (user_id, role_id)
             VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [userId, role.id]
          );
        }
      }

      await logUserActivity(req.user.id, userId, "replace_roles", {
        old_roles: oldRoles,
        new_roles: roleNames,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("Replace roles error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * PATCH /api/admin/users/:id/status
 * Activate/deactivate a user (requires user:deactivate)
 * body: { is_active: true|false }
 */
router.patch(
  "/users/:id/status",
  protect,
  requirePermission("user:deactivate"),
  async (req, res) => {
    const userId = +req.params.id;
    const { is_active } = req.body;

    try {
      // Fetch user + roles to enforce SuperAdmin rules
      const current = (
        await pool.query(
          `
          SELECT u.id, u.email, u.is_active,
                 COALESCE(ARRAY_AGG(r.name) FILTER (WHERE r.name IS NOT NULL), '{}') AS roles
          FROM users u
          LEFT JOIN user_roles ur ON ur.user_id = u.id
          LEFT JOIN roles r       ON r.id = ur.role_id
          WHERE u.id = $1
          GROUP BY u.id
        `,
          [userId]
        )
      ).rows[0];

      if (!current) {
        return res.sendStatus(404);
      }

      const isSuperAdmin = (current.roles || []).includes("SuperAdmin");
      if (isSuperAdmin && is_active === false) {
        return res
          .status(400)
          .json({ message: "You cannot deactivate a SuperAdmin account." });
      }

      const { rows } = await pool.query(
        `UPDATE users SET is_active=$1
          WHERE id=$2
       RETURNING id, email, is_active`,
        [!!is_active, userId]
      );
      if (!rows[0]) return res.sendStatus(404);

      await logUserActivity(req.user.id, userId, "set_status", {
        email: current.email,
        old_is_active: current.is_active,
        new_is_active: !!is_active,
      });

      res.json(rows[0]);
    } catch (err) {
      console.error("Set status error:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

router.delete(
  "/users/:id",
  protect,
  requirePermission("user:delete"),
  async (req, res) => {
    const targetUserId = +req.params.id;
    const actingUserId = req.user.id;

    if (Number.isNaN(targetUserId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (targetUserId === actingUserId) {
      return res
        .status(400)
        .json({ message: "You cannot delete your own account." });
    }

    try {
      await pool.query("BEGIN");

      // Get roles for target user (Admin / SuperAdmin checks)
      const rolesRes = await pool.query(
        `
        SELECT r.name
          FROM user_roles ur
          JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = $1
      `,
        [targetUserId]
      );
      const targetRoles = rolesRes.rows.map((r) => r.name);
      const isTargetSuperAdmin = targetRoles.includes("SuperAdmin");

      if (isTargetSuperAdmin) {
        await pool.query("ROLLBACK");
        return res
          .status(400)
          .json({ message: "You cannot delete a SuperAdmin account." });
      }

      // Is target an Admin?
      const { rows: adminRoleRows } = await pool.query(
        `SELECT id FROM roles WHERE name='Admin' LIMIT 1`
      );
      const adminRoleId = adminRoleRows[0]?.id ?? null;

      let isTargetAdmin = false;
      if (adminRoleId) {
        const { rowCount } = await pool.query(
          `SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id=$2`,
          [targetUserId, adminRoleId]
        );
        isTargetAdmin = rowCount > 0;
      }

      // How many active Admins exist?
      let totalActiveAdmins = 0;
      if (adminRoleId) {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS cnt
             FROM user_roles ur
             JOIN users u ON u.id = ur.user_id
            WHERE ur.role_id=$1 AND u.is_active = TRUE`,
          [adminRoleId]
        );
        totalActiveAdmins = rows[0].cnt;
      }

      // Prevent deleting the last active Admin
      if (isTargetAdmin && totalActiveAdmins === 1) {
        await pool.query("ROLLBACK");
        return res.status(400).json({
          message:
            "Operation not allowed. At least one active Admin must remain assigned.",
        });
      }

      // Get email before delete for logging
      const { rows: userRows } = await pool.query(
        `SELECT email FROM users WHERE id=$1`,
        [targetUserId]
      );
      const targetEmail = userRows[0]?.email || null;

      // Clear FK references from documents if applicable
      await pool.query(
        `UPDATE documents
            SET checked_out_by = NULL,
                checked_out_at = NULL,
                status = CASE WHEN status='CheckedOut' THEN 'Available' ELSE status END
          WHERE checked_out_by = $1`,
        [targetUserId]
      );

      // Remove role mappings (if no ON DELETE CASCADE)
      await pool.query(`DELETE FROM user_roles WHERE user_id=$1`, [targetUserId]);

      // Finally delete the user
      const { rowCount: deleted } = await pool.query(
        `DELETE FROM users WHERE id=$1`,
        [targetUserId]
      );

      await pool.query("COMMIT");

      if (!deleted) return res.sendStatus(404);

      await logUserActivity(actingUserId, targetUserId, "delete_user", {
        email: targetEmail,
        roles: targetRoles,
      });

      return res.sendStatus(204);
    } catch (err) {
      console.error("Delete user error:", err);
      try {
        await pool.query("ROLLBACK");
      } catch {}
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------------------------------------------
   Access Request admin endpoints (with auto-create user on approve)
   ------------------------------------------------------------------ */

/**
 * GET /api/admin/access-requests
 * List all access requests for review (requires user:read)
 */
router.get(
  "/access-requests",
  protect,
  requirePermission("user:read"),
  async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT 
          ar.id,
          ar.email,
          ar.full_name,
          ar.status,
          ar.created_at,
          ar.decided_at,
          ar.note,
          ar.decided_by,
          u.email AS decided_by_email
        FROM access_requests ar
        LEFT JOIN users u ON u.id = ar.decided_by
        ORDER BY ar.created_at DESC
        `
      );
      res.json(rows);
    } catch (err) {
      console.error("Error fetching access requests:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

/**
 * PATCH /api/admin/access-requests/:id
 * Approve or deny an access request.
 * If approved and the user doesn't exist yet, automatically create it
 * with a temporary password and default "Clerk" role.
 *
 * body: { status: "approved" | "denied", note?: string }
 */
router.patch(
  "/access-requests/:id",
  protect,
  requirePermission("user:create"),
  async (req, res) => {
    const id = +req.params.id;
    const { status, note } = req.body;

    if (Number.isNaN(id)) {
      return res.status(400).json({ message: "Invalid request id" });
    }

    if (!["approved", "denied"].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    try {
      await pool.query("BEGIN");

      // Lock the request row so we don't race double approvals
      const { rows: reqRows } = await pool.query(
        `SELECT * FROM access_requests WHERE id = $1 FOR UPDATE`,
        [id]
      );
      const accessReq = reqRows[0];
      if (!accessReq) {
        await pool.query("ROLLBACK");
        return res.sendStatus(404);
      }

      // Update status / decision info
      await pool.query(
        `
        UPDATE access_requests
           SET status     = $1,
               decided_at = NOW(),
               decided_by = $2,
               note       = COALESCE($3, note)
         WHERE id = $4
        `,
        [status, req.user.id, note ?? null, id]
      );

      let createdUser = null;

      // Only auto-create a user if this decision is "approved"
      if (status === "approved") {
        const email = accessReq.email;
        const fullName = accessReq.full_name || null;

        // See if a user already exists with this email
        const { rows: userRows } = await pool.query(
          `SELECT id, email FROM users WHERE email = $1`,
          [email]
        );
        let userId = userRows[0]?.id || null;

        if (!userId) {
          // Create a new user with a temp password
          const tempPassword = generateTempPassword();
          const hash = await bcrypt.hash(tempPassword, 10);

          const { rows: newUserRows } = await pool.query(
            `
            INSERT INTO users (email, full_name, password, is_active, must_change_password)
            VALUES ($1, $2, $3, TRUE, TRUE)
            RETURNING id, email, full_name, is_active
            `,
            [email, fullName, hash]
          );

          const newUser = newUserRows[0];
          userId = newUser.id;

          // Assign default "Clerk" role if it exists
          const { rows: roleRows } = await pool.query(
            `SELECT id FROM roles WHERE name = 'Clerk'`
          );
          if (roleRows[0]) {
            await pool.query(
              `
              INSERT INTO user_roles (user_id, role_id)
              VALUES ($1, $2)
              ON CONFLICT DO NOTHING
              `,
              [userId, roleRows[0].id]
            );
          }

          createdUser = {
            id: newUser.id,
            email: newUser.email,
            full_name: newUser.full_name,
            is_active: newUser.is_active,
            tempPassword, // so an admin can share this with the requester
          };

          await logUserActivity(req.user.id, newUser.id, "create_user_from_request", {
            email: newUser.email,
            full_name: newUser.full_name,
          });
        }
      }

      await logUserActivity(req.user.id, null, "access_request_decision", {
        request_id: accessReq.id,
        email: accessReq.email,
        status,
        note: note ?? null,
      });

      await pool.query("COMMIT");
      return res.json({ ok: true, createdUser });
    } catch (err) {
      console.error("Update access request error:", err);
      try {
        await pool.query("ROLLBACK");
      } catch {}
      return res.status(500).json({ message: "Server error" });
    }
  }
);

/* ------------------------------------------------------------------
   User Activity History endpoint
   ------------------------------------------------------------------ */

/**
 * GET /api/admin/user-activity
 * Returns recent user/admin activity for history dialog
 */
router.get(
  "/user-activity",
  protect,
  requirePermission("user:read"),
  async (_req, res) => {
    try {
      const { rows } = await pool.query(
        `
        SELECT
          aua.id,
          aua.action_type,
          aua.details,
          aua.created_at,
          actor.email  AS actor_email,
          target.email AS target_email
        FROM admin_user_activity aua
        LEFT JOIN users actor  ON actor.id  = aua.actor_user_id
        LEFT JOIN users target ON target.id = aua.target_user_id
        ORDER BY aua.created_at DESC
        LIMIT 200
        `
      );
      res.json(rows);
    } catch (err) {
      console.error("Error fetching user activity:", err);
      res.status(500).json({ message: "Server error" });
    }
  }
);

export default router;
