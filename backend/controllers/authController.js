// backend/controllers/authController.js
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pool from "../config/db.js";
import dotenv from "dotenv";

dotenv.config();

/**
 * POST /auth/register
 * (You can disable this route if only admins should create users.)
 */
export const registerUser = async (req, res) => {
  const { email, password, full_name } = req.body;

  try {
    const exists = await pool.query(`SELECT id FROM users WHERE email=$1`, [email]);
    if (exists.rows.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    if (!password || password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }

    const hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (email, password, full_name, is_active, must_change_password)
       VALUES ($1,$2,$3, TRUE, FALSE)
       RETURNING id, email, full_name, is_active`,
      [email, hash, full_name || null]
    );

    return res.status(201).json({
      message: "User registered successfully",
      user: rows[0],
    });
  } catch (err) {
    console.error("Registration error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /auth/request-access
 * Public endpoint for users to request an account (no password yet).
 */
export const requestAccess = async (req, res) => {
  const { email, full_name } = req.body;

  if (!email || typeof email !== "string" || !email.trim()) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    // Optional: avoid duplicate pending requests for same email
    const existing = await pool.query(
      `SELECT id, status
         FROM access_requests
        WHERE email = $1
        ORDER BY created_at DESC
        LIMIT 1`,
      [email.trim()]
    );

    if (
      existing.rows[0] &&
      (existing.rows[0].status === "pending" || existing.rows[0].status === "approved")
    ) {
      return res.status(400).json({
        message:
          "There is already a recent request for this email. Please wait for an administrator to review it.",
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO access_requests (email, full_name)
       VALUES ($1, $2)
       RETURNING id, email, full_name, status, created_at`,
      [email.trim(), full_name?.trim() || null]
    );

    return res.status(201).json({
      message:
        "Your request has been submitted. An administrator will review it.",
      request: rows[0],
    });
  } catch (err) {
    console.error("Request access error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /auth/login
 * If user.must_change_password is TRUE, returns 403 with a flag so the UI
 * can redirect to /change-password.
 */
export const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const result = await pool.query(
      `SELECT id, email, password, is_active, must_change_password
         FROM users
        WHERE email = $1`,
      [email]
    );
    const user = result.rows[0];
    if (!user) return res.status(400).json({ message: "Invalid credentials" });

    if (user.is_active === false) {
      return res.status(403).json({ message: "Account is deactivated" });
    }

    // Force-change gate (admin has reset this account)
    if (user.must_change_password) {
      return res.status(403).json({
        message:
          "Password reset required. Please change your password before continuing.",
        must_change_password: true,
        userId: user.id,
      });
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    // Fetch roles to send to UI (authorization should still be enforced server-side)
    const rolesRes = await pool.query(
      `SELECT r.name
         FROM user_roles ur
         JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = $1`,
      [user.id]
    );
    const roles = rolesRes.rows.map((r) => r.name);

    // Sign JWT (id only; roles can change at any time)
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "8h",
    });

    return res.json({
      message: "Login successful",
      user: { id: user.id, email: user.email, roles },
      token,
    });
  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * POST /auth/change-password
 * Body: { userId, new_password }
 * Used by users who were forced to change password after an admin reset.
 */
export const changePassword = async (req, res) => {
  const { userId, new_password } = req.body;

  if (!userId) {
    return res.status(400).json({ message: "Missing userId" });
  }
  if (!new_password || typeof new_password !== "string" || new_password.length < 8) {
    return res
      .status(400)
      .json({ message: "Password must be at least 8 characters long" });
  }

  try {
    // Make sure user exists and is active
    const { rows: urows } = await pool.query(
      `SELECT id, is_active FROM users WHERE id=$1`,
      [userId]
    );
    const u = urows[0];
    if (!u) return res.status(404).json({ message: "User not found" });
    if (!u.is_active) return res.status(400).json({ message: "User is deactivated" });

    const hash = await bcrypt.hash(new_password, 10);

    await pool.query(
      `UPDATE users
          SET password = $1,
              must_change_password = FALSE,
              password_changed_at = NOW()
        WHERE id = $2`,
      [hash, userId]
    );

    return res.json({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
