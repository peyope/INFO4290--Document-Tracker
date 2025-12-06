// backend/routes/authRoutes.js
import express from "express";
import {
  registerUser,    // kept in case you ever want to use it internally
  loginUser,
  changePassword,
  requestAccess,
} from "../controllers/authController.js";

const router = express.Router();

// 🔓 Public: request access instead of self-registration
router.post("/request-access", requestAccess);

// (Optional) If you really want to keep direct registration for internal use,
// you could keep this, but for your current requirement we're not exposing it.
// router.post("/register", registerUser);

// Standard login
router.post("/login", loginUser);

// When a user must change password after admin reset
router.post("/change-password", changePassword);

export default router;
