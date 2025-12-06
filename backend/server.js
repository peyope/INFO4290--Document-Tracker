// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./config/db.js";

import statsRoutes from "./routes/statsRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";

import { startRetentionJob } from "./cron/retentionJob.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 🧪 DB test
app.get("/api/db-test", async (_req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ message: "Database connected ✅", time: result.rows[0].now });
  } catch (err) {
    console.error("Database connection error:", err);
    res.status(500).json({ message: "Database connection failed ❌" });
  }
});

// ✅ Routes (all under /api)
app.use("/api/auth", authRoutes);          // <-- /api/auth
app.use("/api/documents", documentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/uploads", express.static("uploads"));

// 🧩 Default
app.get("/", (_req, res) => {
  res.send("📦 Document Tracker API is running...");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);

  // 🔔 Start scheduled retention job once the server is up
  startRetentionJob();
});
