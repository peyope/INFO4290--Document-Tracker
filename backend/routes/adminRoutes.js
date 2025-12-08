// backend/routes/adminRoutes.js
import express from "express";
import {
  createUser,
  updateUser,
  resetUserPassword,
  listUsers,
  setUserActiveStatus,
  deleteUser,
  listUserActivity,
  listAccessRequests,
  updateAccessRequestStatus,
} from "../controllers/adminController.js";

import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ---------------------------------------------------------
   USER MANAGEMENT
--------------------------------------------------------- */

// Create user
router.post(
  "/users",
  protect,
  authorize("Admin", "SuperAdmin"),
  createUser
);

// Edit user
router.put(
  "/users/:id",
  protect,
  authorize("Admin", "SuperAdmin"),
  updateUser
);

// Reset password
router.post(
  "/users/:id/reset-password",
  protect,
  authorize("Admin", "SuperAdmin"),
  resetUserPassword
);

// List all users
router.get(
  "/users",
  protect,
  authorize("Admin", "SuperAdmin"),
  listUsers
);

// Activate / deactivate user
router.patch(
  "/users/:id/status",
  protect,
  authorize("Admin", "SuperAdmin"),
  setUserActiveStatus
);

// Delete user
router.delete(
  "/users/:id",
  protect,
  authorize("Admin", "SuperAdmin"),
  deleteUser
);

// User activity feed for "View History" dialog
router.get(
  "/user-activity",
  protect,
  authorize("Admin", "SuperAdmin"),
  listUserActivity
);

/* ---------------------------------------------------------
   ACCESS REQUESTS
--------------------------------------------------------- */

// List access requests
router.get(
  "/access-requests",
  protect,
  authorize("Admin", "SuperAdmin"),
  listAccessRequests
);

// Update request status (approve / deny)
router.patch(
  "/access-requests/:id",
  protect,
  authorize("Admin", "SuperAdmin"),
  updateAccessRequestStatus
);

export default router;
