// backend/controllers/adminController.js
import pool from "../config/db.js";
import { logAudit } from "../utils/auditLogger.js";
import bcrypt from "bcryptjs";

/* ---------------------------------------------------------
   Helper: log admin user activity
   Writes to admin_user_activity table
--------------------------------------------------------- */
async function logAdminUserActivity({
  actorUserId,
  targetUserId,
  actionType,
  details = null,
}) {
  try {
    await pool.query(
      `
      INSERT INTO admin_user_activity (actor_user_id, target_user_id, action_type, details)
      VALUES ($1, $2, $3, $4)
      `,
      [
        actorUserId || null,
        targetUserId || null,
        actionType,
        details ? JSON.stringify(details) : null,
      ]
    );
  } catch (err) {
    console.error("Admin activity logging failed:", err);
  }
}

/* ---------------------------------------------------------
   CREATE USER (Admin panel "Create User" modal)
   Frontend: POST /admin/users
   Body: { email, full_name, password, roleName }
--------------------------------------------------------- */
export const createUser = async (req, res) => {
  try {
    const {
      email,
      full_name,

      first_name,
      firstName,
      last_name,
      lastName,

      temp_password,
      tempPassword,
      password,

      role,
      roleName,
      selectedRole,
    } = req.body;

    const finalFirstName = first_name || firstName || null;
    const finalLastName = last_name || lastName || null;
    const finalTempPassword = temp_password || tempPassword || password;
    const finalRole = role || roleName || selectedRole;

    let finalFullName = full_name || null;
    if (!finalFullName && (finalFirstName || finalLastName)) {
      finalFullName = [finalFirstName, finalLastName]
        .filter(Boolean)
        .join(" ");
    }

    // Only require email + password + role 
    if (!email || !finalTempPassword || !finalRole) {
      return res.status(400).json({
        error: "Email, password and role are required.",
      });
    }

    if (!email.includes("@")) {
      return res.status(400).json({ error: "Email must be valid." });
    }

    if (finalTempPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters." });
    }

    // Ensure unique email
    const existing = await pool.query(`SELECT id FROM users WHERE email=$1`, [
      email,
    ]);
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "A user with this email already exists." });
    }

    const fullNameToSave = finalFullName
      ? finalFullName.trim()
      : `${finalFirstName || ""} ${finalLastName || ""}`.trim() || null;

    const hash = await bcrypt.hash(finalTempPassword, 10);

    const userRes = await pool.query(
      `
      INSERT INTO users (email, password, full_name, is_active, must_change_password)
      VALUES ($1, $2, $3, TRUE, TRUE)
      RETURNING id, email, full_name, is_active, must_change_password
      `,
      [email.trim(), hash, fullNameToSave]
    );

    const user = userRes.rows[0];

    // Look up role id
    const roleRes = await pool.query(`SELECT id FROM roles WHERE name=$1`, [
      finalRole,
    ]);
    if (roleRes.rows.length === 0) {
      return res.status(400).json({ error: `Invalid role: ${finalRole}` });
    }
    const roleId = roleRes.rows[0].id;

    await pool.query(
      `
      INSERT INTO user_roles (user_id, role_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      `,
      [user.id, roleId]
    );

    // document audit logger (no-op when documentId=null but safe)
    await logAudit({
      documentId: null,
      userId: req.user.id,
      action: "admin-create-user",
      note: `Created user ${email} with role ${finalRole}`,
    });

    // admin user activity log
    await logAdminUserActivity({
      actorUserId: req.user.id,
      targetUserId: user.id,
      actionType: "create-user",
      details: {
        email: user.email,
        full_name: user.full_name,
        role: finalRole,
      },
    });

    res.status(201).json({
      ...user,
      roles: [finalRole],
    });
  } catch (err) {
    console.error("createUser error:", err);
    res.status(500).json({ error: "Failed to create user" });
  }
};

/* ---------------------------------------------------------
   UPDATE USER
   Frontend: PUT /admin/users/:id
   Body: { email, full_name, roleName }
--------------------------------------------------------- */
export const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const { email, full_name, roleName, role, selectedRole } = req.body;

    const finalRole = roleName || role || selectedRole;

    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }

    // Check email format
    if (!email.includes("@")) {
      return res.status(400).json({ error: "Email must be valid." });
    }

    // Check unique email (excluding this user)
    const existing = await pool.query(
      `SELECT id FROM users WHERE email=$1 AND id <> $2`,
      [email, userId]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ error: "Another user with this email already exists." });
    }

    // Load current user (for audit + diff)
    const beforeRes = await pool.query(
      `
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.is_active,
        ARRAY(
          SELECT r.name 
          FROM user_roles ur 
          JOIN roles r ON r.id = ur.role_id 
          WHERE ur.user_id = u.id
        ) AS roles
      FROM users u
      WHERE u.id=$1
      `,
      [userId]
    );

    if (beforeRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const before = beforeRes.rows[0];

    // Update basic fields
    const userRes = await pool.query(
      `
      UPDATE users
      SET email=$1,
          full_name=$2
      WHERE id=$3
      RETURNING id, email, full_name, is_active, must_change_password
      `,
      [email.trim(), full_name || null, userId]
    );

    const updatedUser = userRes.rows[0];

    // If role provided, replace existing roles with this one
    let newRoles = before.roles || [];
    if (finalRole) {
      const roleRes = await pool.query(`SELECT id FROM roles WHERE name=$1`, [
        finalRole,
      ]);
      if (roleRes.rows.length === 0) {
        return res.status(400).json({ error: `Invalid role: ${finalRole}` });
      }
      const roleId = roleRes.rows[0].id;

      await pool.query(`DELETE FROM user_roles WHERE user_id=$1`, [userId]);
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
        [userId, roleId]
      );
      newRoles = [finalRole];
    }

    await logAudit({
      documentId: null,
      userId: req.user.id,
      action: "admin-update-user",
      note: `Updated user ${email}`,
    });

    // Build change details for admin_user_activity
    const changes = {};
    if (before.email !== updatedUser.email) {
      changes.old_email = before.email;
      changes.new_email = updatedUser.email;
    }
    if ((before.full_name || null) !== (updatedUser.full_name || null)) {
      changes.old_full_name = before.full_name || null;
      changes.new_full_name = updatedUser.full_name || null;
    }
    const beforePrimaryRole = (before.roles && before.roles[0]) || null;
    if (finalRole && finalRole !== beforePrimaryRole) {
      changes.old_role = beforePrimaryRole;
      changes.new_role = finalRole;
    }

    await logAdminUserActivity({
      actorUserId: req.user.id,
      targetUserId: Number(userId),
      actionType: "update-user",
      details:
        Object.keys(changes).length > 0
          ? { email: updatedUser.email, ...changes }
          : { email: updatedUser.email },
    });

    res.json({
      ...updatedUser,
      roles: newRoles,
    });
  } catch (err) {
    console.error("updateUser error:", err);
    res.status(500).json({ error: "Failed to update user" });
  }
};

/* ---------------------------------------------------------
   RESET USER PASSWORD
   Frontend: POST /admin/users/:id/reset-password
   Body: { new_password }
--------------------------------------------------------- */
export const resetUserPassword = async (req, res) => {
  try {
    const userId = req.params.id;
    const { new_password } = req.body;

    if (!new_password || new_password.length < 8) {
      return res.status(400).json({
        error: "New password must be at least 8 characters.",
      });
    }

    const hash = await bcrypt.hash(new_password, 10);

    const result = await pool.query(
      `
      UPDATE users
      SET password = $1,
          must_change_password = TRUE,
          password_changed_at = NOW()
      WHERE id=$2
      RETURNING id, email
      `,
      [hash, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const updated = result.rows[0];

    await logAudit({
      documentId: null,
      userId: req.user.id,
      action: "admin-reset-password",
      note: `Reset password for user ${updated.email}`,
    });

    await logAdminUserActivity({
      actorUserId: req.user.id,
      targetUserId: updated.id,
      actionType: "reset-password",
      details: { email: updated.email },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("resetUserPassword error:", err);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

/* ---------------------------------------------------------
   LIST ALL USERS
   Frontend: GET /admin/users
--------------------------------------------------------- */
export const listUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id,
        u.email,
        u.full_name,
        u.is_active,
        u.must_change_password,
        ARRAY(
          SELECT r.name 
          FROM user_roles ur 
          JOIN roles r ON r.id = ur.role_id 
          WHERE ur.user_id = u.id
        ) AS roles
      FROM users u
      ORDER BY u.id ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("listUsers error:", err);
    res.status(500).json({ error: "Failed to load users" });
  }
};

/* ---------------------------------------------------------
   ACTIVATE / DEACTIVATE USER
   Frontend: PATCH /admin/users/:id/status
   Body: { is_active: boolean }
--------------------------------------------------------- */
export const setUserActiveStatus = async (req, res) => {
  try {
    const userId = req.params.id;
    const { is_active } = req.body;

    if (typeof is_active !== "boolean") {
      return res.status(400).json({
        error: "is_active must be a boolean",
      });
    }

    // Get current state first for logging
    const beforeRes = await pool.query(
      `SELECT id, email, is_active FROM users WHERE id=$1`,
      [userId]
    );
    if (beforeRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }
    const before = beforeRes.rows[0];

    const result = await pool.query(
      `
      UPDATE users
      SET is_active = $1
      WHERE id = $2
      RETURNING id, email, is_active
      `,
      [is_active, userId]
    );

    const updated = result.rows[0];

    await logAudit({
      documentId: null,
      userId: req.user.id,
      action: "admin-user-status",
      note: `User ${userId} set active=${is_active}`,
    });

    await logAdminUserActivity({
      actorUserId: req.user.id,
      targetUserId: updated.id,
      actionType: "update-status",
      details: {
        email: updated.email,
        old_is_active: before.is_active,
        new_is_active: updated.is_active,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("setUserActiveStatus error:", err);
    res.status(500).json({ error: "Failed to update user status" });
  }
};

/* ---------------------------------------------------------
   DELETE USER
   Frontend: DELETE /admin/users/:id
--------------------------------------------------------- */
export const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Load user + roles (for safety & logging)
    const userRes = await pool.query(
      `
      SELECT 
        u.id,
        u.email,
        ARRAY(
          SELECT r.name 
          FROM user_roles ur 
          JOIN roles r ON r.id = ur.role_id 
          WHERE ur.user_id = u.id
        ) AS roles
      FROM users u
      WHERE u.id=$1
      `,
      [userId]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    const user = userRes.rows[0];
    const roles = user.roles || [];

    // Extra safety: do not delete SuperAdmin
    if (roles.includes("SuperAdmin")) {
      return res
        .status(400)
        .json({ error: "You cannot delete a SuperAdmin account." });
    }

    // Log admin activity BEFORE delete, and do NOT FK to the soon-to-be-deleted user
    await logAdminUserActivity({
      actorUserId: req.user.id,
      targetUserId: null, // avoid FK constraint after delete
      actionType: "delete-user",
      details: {
        user_id: user.id,
        email: user.email,
        roles,
      },
    });

    // Remove roles then user
    await pool.query(`DELETE FROM user_roles WHERE user_id=$1`, [userId]);
    await pool.query(`DELETE FROM users WHERE id=$1`, [userId]);

    await logAudit({
      documentId: null,
      userId: req.user.id,
      action: "admin-delete-user",
      note: `Deleted user ${user.email}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("deleteUser error:", err);
    res.status(500).json({ error: "Failed to delete user" });
  }
};

/* ---------------------------------------------------------
   USER ACTIVITY FEED FOR ADMIN HISTORY DIALOG
   Frontend: GET /admin/user-activity
--------------------------------------------------------- */
export const listUserActivity = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.action_type,
        a.details,
        a.created_at,
        actor.email  AS actor_email,
        target.email AS target_email
      FROM admin_user_activity a
      LEFT JOIN users actor  ON actor.id  = a.actor_user_id
      LEFT JOIN users target ON target.id = a.target_user_id
      ORDER BY a.created_at DESC
      LIMIT 200
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("listUserActivity error:", err);
    res.status(500).json({ error: "Failed to fetch user activity" });
  }
};

/* ---------------------------------------------------------
   ACCESS REQUESTS (list + update status)
--------------------------------------------------------- */

// List all access requests (for cards + history dialog)
export const listAccessRequests = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM access_requests
      ORDER BY created_at DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("listAccessRequests error:", err);
    res.status(500).json({ error: "Failed to fetch access requests" });
  }
};

// Update status: PATCH /admin/access-requests/:id  { status: "approved" | "denied" }
export const updateAccessRequestStatus = async (req, res) => {
  try {
    const requestId = req.params.id;
    const { status } = req.body;

    if (!status || !["approved", "denied"].includes(status)) {
      return res
        .status(400)
        .json({ error: "Status must be 'approved' or 'denied'." });
    }

    const reqRes = await pool.query(
      `SELECT * FROM access_requests WHERE id=$1`,
      [requestId]
    );

    if (reqRes.rows.length === 0) {
      return res.status(404).json({ error: "Request not found." });
    }

    const requestRow = reqRes.rows[0];

    // If approving: create a user account automatically (if one doesn't already exist)
    if (status === "approved") {
      const email = requestRow.email;
      const full_name = requestRow.full_name;

      // Generate a random temporary password
      const pwd = Math.random().toString(36).slice(-10);
      const hash = await bcrypt.hash(pwd, 10);

      // If user already exists, skip creating; otherwise create
      let userId = null;
      const existingUser = await pool.query(
        `SELECT id FROM users WHERE email=$1`,
        [email]
      );
      if (existingUser.rows.length > 0) {
        userId = existingUser.rows[0].id;
      } else {
        const userRes = await pool.query(
          `
          INSERT INTO users (email, password, full_name, is_active, must_change_password)
          VALUES ($1, $2, $3, TRUE, TRUE)
          RETURNING id
          `,
          [email, hash, full_name]
        );
        userId = userRes.rows[0].id;

        // Get default role from system_settings (falls back to Clerk)
        let defaultRole = "Clerk";
        try {
          const settingsRes = await pool.query(
            `SELECT default_access_request_role FROM system_settings LIMIT 1`
          );
          if (
            settingsRes.rows.length > 0 &&
            settingsRes.rows[0].default_access_request_role
          ) {
            defaultRole = settingsRes.rows[0].default_access_request_role;
          }
        } catch (e) {
          // ignore; use Clerk
        }

        const roleRes = await pool.query(
          `SELECT id FROM roles WHERE name=$1`,
          [defaultRole]
        );
        if (roleRes.rows.length > 0) {
          await pool.query(
            `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)`,
            [userId, roleRes.rows[0].id]
          );
        }

        // log admin activity about new user from request
        await logAdminUserActivity({
          actorUserId: req.user.id,
          targetUserId: userId,
          actionType: "approve-access-request",
          details: {
            email,
            full_name,
            created_from_request_id: requestId,
            role: defaultRole,
          },
        });
      }
    }

    // Update the request row itself
    await pool.query(
      `
      UPDATE access_requests
      SET status=$1,
          decided_at = NOW(),
          decided_by = $2
      WHERE id=$3
      `,
      [status, req.user.id || null, requestId]
    );

    await logAudit({
      documentId: null,
      userId: req.user.id,
      action:
        status === "approved"
          ? "admin-approve-access"
          : "admin-deny-access",
      note: `Access request ${requestId} set to ${status}`,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("updateAccessRequestStatus error:", err);
    res.status(500).json({ error: "Failed to update request" });
  }
};
