// backend/routes/dashboardRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getDashboardSummary } from "../controllers/dashboardController.js";

const router = express.Router();

// All dashboard endpoints are under /api/dashboard
router.get("/summary", protect, getDashboardSummary);

export default router;
