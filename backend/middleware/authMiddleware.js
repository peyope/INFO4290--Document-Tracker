// backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import pool from "../config/db.js";

// Protect routes – requires a valid JWT
export async function protect(req, res, next) {
  try {
    let token = null;

    // 1) Normal case: Authorization: Bearer <token>
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer ")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // 2) Fallback for file downloads: ?token=...
    if (!token && req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({ message: "Not authorized, no token" });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Look up user
    const { rows } = await pool.query(
      "SELECT id, email, full_name, is_active FROM users WHERE id = $1",
      [decoded.id]
    );
    const user = rows[0];

    if (!user) {
      return res.status(401).json({ message: "Not authorized, user not found" });
    }

    if (user.is_active === false) {
      return res.status(401).json({ message: "Account is inactive" });
    }

    // Attach to req for downstream handlers
    req.user = {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      is_active: user.is_active,
    };

    next();
  } catch (err) {
    console.error("Auth error:", err);
    return res.status(401).json({ message: "Not authorized, token failed" });
  }
}
