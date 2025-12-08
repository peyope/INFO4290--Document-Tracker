// backend/server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./config/db.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import statsRoutes from "./routes/statsRoutes.js";
import auditRoutes from "./routes/auditRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import settingsRoutes from "./routes/settingsRoutes.js";
import employeeRoutes from "./routes/employeeRoutes.js";

import { startRetentionJob } from "./cron/retentionJob.js";

dotenv.config();

const app = express();

// Core middleware 
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// quick DB sanity check
pool
  .query("SELECT NOW()")
  .then(() => console.log("✅ Connected to PostgreSQL"))
  .catch((err) =>
    console.error("❌ PostgreSQL connection error:", err.message)
  );

// API routes (all under /api) 
app.use("/api/stats", statsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/auth", authRoutes);          
app.use("/api/documents", documentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/dashboard", dashboardRoutes);

// Static file serving for uploaded documents
app.use("/uploads", express.static("uploads"));

// Default/health route 
app.get("/", (_req, res) => {
  res.send("📦 Document Tracker API is running...");
});

// Start server + retention job 
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  startRetentionJob();
});



