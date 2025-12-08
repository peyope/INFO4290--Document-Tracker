// backend/routes/settingsRoutes.js
import express from "express";
import {
  getSystemSettings,
  updateSystemSettings,
} from "../controllers/settingsController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// GET current settings
router.get(
  "/system",
  protect,
  authorize("Admin", "SuperAdmin"),
  getSystemSettings
);

// UPDATE settings
router.put(
  "/system",
  protect,
  authorize("Admin", "SuperAdmin"),
  updateSystemSettings
);

export default router;
