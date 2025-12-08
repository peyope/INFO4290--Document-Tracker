// backend/routes/documentRoutes.js
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";

import { protect } from "../middleware/authMiddleware.js";
import {
  getDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  uploadFile,
  deleteFile,
  downloadFile,
  recordRetentionDecision,
  confirmDestruction,
} from "../controllers/documentController.js";

const router = express.Router();

/* ---------------------------------------------------------
   FILE UPLOAD CONFIGURATION
--------------------------------------------------------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destPath = "uploads/documents";
    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
    cb(null, destPath);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

/* ---------------------------------------------------------
   ROUTES
--------------------------------------------------------- */

// List all documents (library)
router.get("/", protect, getDocuments);

// Create a new document (Library "New File")
router.post("/", protect, createDocument);

// Single document
router.get("/:id", protect, getDocument);
router.put("/:id", protect, updateDocument);
router.delete("/:id", protect, deleteDocument);

// Files
router.post("/:id/files", protect, upload.single("file"), uploadFile);
router.delete("/:id/files/:fileId", protect, deleteFile);
router.get("/:id/files/:fileId", protect, downloadFile);

// Retention decision & confirm destruction
router.post("/:id/retention-decision", protect, recordRetentionDecision);
router.post("/:id/confirm-destruction", protect, confirmDestruction);

export default router;
