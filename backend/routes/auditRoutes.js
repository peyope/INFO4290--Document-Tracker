// backend/routes/auditRoutes.js
import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { getDocumentAudit } from "../controllers/auditController.js";

const router = express.Router();

// GET /api/audit/document/:id
// Used by DocumentDetails.jsx to reload audit log
router.get("/document/:id", protect, getDocumentAudit);

export default router;
