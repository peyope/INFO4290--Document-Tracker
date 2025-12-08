// backend/routes/authRoutes.js
import express from "express";
import {
  registerUser, // optional / internal
  loginUser,
  changePassword,
  requestAccess,
} from "../controllers/authController.js";

const router = express.Router();

// Public: access request form
router.post("/request-access", requestAccess);

// (Optional) direct registration – not used by your UI right now
// router.post("/register", registerUser);

// Public: normal login
router.post("/login", loginUser);

// Public: forced password change after admin reset
// NO protect() here – user does NOT have a token yet
router.post("/change-password", changePassword);

export default router;
