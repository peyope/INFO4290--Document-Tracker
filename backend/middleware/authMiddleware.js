// backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

/**
 * Extracts token from:
 * - Authorization: Bearer <token>
 * - Query string (token)
 * - Body.token (fallback)
 */
function extractToken(req) {
  let token = null;

  // Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  // Query param (needed for file downloads)
  if (!token && req.query.token) {
    token = req.query.token;
  }

  // Body fallback
  if (!token && req.body?.token) {
    token = req.body.token;
  }

  return token;
}

/**
 * Middleware: ensure request is authenticated.
 * Adds req.user = { id, email, roles }
 */
export const protect = async (req, res, next) => {
  try {
    const token = extractToken(req);

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token provided" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Token invalid or expired" });
    }

    // Fetch user from DB
    const userRes = await pool.query(
      `SELECT id, email, is_active
         FROM users
        WHERE id = $1`,
      [decoded.id]
    );

    const user = userRes.rows[0];

    if (!user) {
      return res.status(401).json({ message: "User does not exist" });
    }

    if (user.is_active === false) {
      return res.status(403).json({ message: "User account is deactivated" });
    }

    // Load roles
    const rolesRes = await pool.query(
      `SELECT r.name
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1`,
      [user.id]
    );

    const roles = rolesRes.rows.map((r) => r.name);

    // Attach user object to request
    req.user = {
      id: user.id,
      email: user.email,
      roles,
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    res.status(500).json({ message: "Authentication failed" });
  }
};

/**
 * Restrict route to only certain roles.
 * Usage:
 *    router.get("/admin-only", protect, authorize("Admin"), handler);
 */
export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user?.roles) {
      return res.status(403).json({ message: "Access denied" });
    }

    const userRoles = req.user.roles;

    const hasAccess = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasAccess) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }

    next();
  };
};
