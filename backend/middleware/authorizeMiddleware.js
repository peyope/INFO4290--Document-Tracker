// backend/middleware/authorizeMiddleware.js
import pool from "../config/db.js";

/* ------------------------------------------------------------------ */
/*                             PERMISSIONS                             */
/* ------------------------------------------------------------------ */

/**
 * Return true if the user has the given permission (by permissions.name)
 */
export async function userHasPermission(userId, permissionName) {
  const { rows } = await pool.query(
    `
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id
    JOIN permissions p       ON p.id = rp.permission_id
    WHERE ur.user_id = $1
      AND p.name   = $2
    LIMIT 1;
    `,
    [userId, permissionName]
  );
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/*                                ROLES                                */
/* ------------------------------------------------------------------ */

/**
 * Get all role names for a user (["Admin","Manager",...])
 */
export async function getUserRoles(userId) {
  const { rows } = await pool.query(
    `
    SELECT r.name
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
    `,
    [userId]
  );
  return rows.map((r) => r.name);
}

/**
 * Return true if user has the given role (by roles.name)
 */
export async function userHasRole(userId, roleName) {
  const { rows } = await pool.query(
    `
    SELECT 1
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    WHERE ur.user_id = $1
      AND r.name     = $2
    LIMIT 1;
    `,
    [userId, roleName]
  );
  return rows.length > 0;
}

/**
 * Convenience: returns true if user is a SuperAdmin.
 */
async function isSuperAdmin(userId) {
  if (!userId) return false;
  return userHasRole(userId, "SuperAdmin");
}

/* ------------------------------------------------------------------ */
/*                         PERMISSION MIDDLEWARE                       */
/* ------------------------------------------------------------------ */

/**
 * Require a single permission.
 * Usage: router.get("/x", protect, requirePermission("user:read"), handler)
 *
 * NOTE: SuperAdmin automatically passes this check.
 */
export function requirePermission(permissionName) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // 🔓 SuperAdmin can do everything
      if (await isSuperAdmin(req.user.id)) {
        return next();
      }

      const ok = await userHasPermission(req.user.id, permissionName);
      if (!ok) {
        return res.status(403).json({
          message: "Forbidden: missing permission",
          missing: permissionName,
        });
      }
      next();
    } catch (err) {
      console.error("authorize middleware error:", err);
      res.status(500).json({ message: "Server error" });
    }
  };
}

/**
 * Require ANY of the listed permissions.
 * Example: requireAnyPermission(["docs:create","docs:update"])
 *
 * NOTE: SuperAdmin automatically passes this check.
 */
export function requireAnyPermission(permissionNames = []) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // 🔓 SuperAdmin bypass
      if (await isSuperAdmin(req.user.id)) {
        return next();
      }

      for (const p of permissionNames) {
        // eslint-disable-next-line no-await-in-loop
        const ok = await userHasPermission(req.user.id, p);
        if (ok) return next();
      }
      return res.status(403).json({
        message: "Forbidden: none of the required permissions present",
        missingAnyOf: permissionNames,
      });
    } catch (err) {
      console.error("authorize any-perm error:", err);
      res.status(500).json({ message: "Server error" });
    }
  };
}

/* ------------------------------------------------------------------ */
/*                             ROLE MIDDLEWARE                         */
/* ------------------------------------------------------------------ */

/**
 * Require the user to have ANY of the provided roles.
 * Accepts a string ("Admin") or array (["Admin","Manager"]).
 * Usage: router.get("/stats", protect, requireRole(["Admin","Manager"]), handler)
 *
 * NOTE: SuperAdmin automatically passes this check.
 */
export function requireRole(roles) {
  const need = Array.isArray(roles) ? roles : [roles];
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // 🔓 SuperAdmin bypass
      if (await isSuperAdmin(req.user.id)) {
        return next();
      }

      // If upstream protect already attached roles, use them; else query.
      let userRoles = req.user.roles;
      if (!Array.isArray(userRoles)) {
        userRoles = await getUserRoles(req.user.id);
        // Optionally hydrate for downstream
        req.user.roles = userRoles;
      }

      const ok = need.some((r) => userRoles.includes(r));
      if (!ok) {
        return res.status(403).json({
          message: "Access denied: missing role",
          requiredAnyOf: need,
          userRoles,
        });
      }

      next();
    } catch (err) {
      console.error("authorize role error:", err);
      res.status(500).json({ message: "Server error" });
    }
  };
}

/**
 * Require BOTH: (any role from roles) AND (any permission from permissions)
 * Optional helper if you ever need combined checks.
 * Usage: requireRoleAndPermission(["Admin","Manager"], ["user:read"])
 *
 * NOTE: SuperAdmin automatically passes this check.
 */
export function requireRoleAndPermission(roles = [], permissionNames = []) {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // 🔓 SuperAdmin bypass
      if (await isSuperAdmin(req.user.id)) {
        return next();
      }

      // roles
      let userRoles = req.user.roles;
      if (!Array.isArray(userRoles)) {
        userRoles = await getUserRoles(req.user.id);
        req.user.roles = userRoles;
      }
      const roleOK =
        roles.length === 0 || roles.some((r) => userRoles.includes(r));

      // permissions (ANY)
      let permOK = true;
      if (permissionNames.length > 0) {
        permOK = false;
        for (const p of permissionNames) {
          // eslint-disable-next-line no-await-in-loop
          if (await userHasPermission(req.user.id, p)) {
            permOK = true;
            break;
          }
        }
      }

      if (!roleOK || !permOK) {
        return res.status(403).json({
          message: "Access denied: missing role and/or permission",
          requiredRolesAnyOf: roles,
          requiredPermissionsAnyOf: permissionNames,
          userRoles,
        });
      }

      next();
    } catch (err) {
      console.error("authorize role+perm error:", err);
      res.status(500).json({ message: "Server error" });
    }
  };
}
