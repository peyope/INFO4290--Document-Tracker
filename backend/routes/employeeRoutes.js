// backend/routes/employeeRoutes.js
import express from "express";
import {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../controllers/employeeController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ---------------------------------------------------------
   EMPLOYEE ROUTES
--------------------------------------------------------- */

// Get employee list (active only by default)
router.get("/", protect, listEmployees);

// Get single employee
router.get("/:id", protect, getEmployee);

// Create new employee (ADMIN ONLY)
router.post("/", protect, authorize("Admin", "SuperAdmin"), createEmployee);

// Update employee
router.put(
  "/:id",
  protect,
  authorize("Admin", "Manager", "SuperAdmin"),
  updateEmployee
);

// Delete employee
router.delete(
  "/:id",
  protect,
  authorize("Admin", "SuperAdmin"),
  deleteEmployee
);

export default router;
