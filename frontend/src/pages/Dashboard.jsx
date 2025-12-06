// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { Box, Grid, Paper, Typography, Alert } from "@mui/material";
import api from "../api/axiosConfig";

// match these to your actual LeftNav/AppBar sizes
const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

function StatCard({ title, value }) {
  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2" color="text.secondary">
        {title}
      </Typography>
      <Typography variant="h4">
        {value ?? "—"}
      </Typography>
    </Paper>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    total: null,
    checkedOut: null,
    available: null,
    offsite: null,
    dueSoon: null,
  });

  const [error, setError] = useState("");

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setError("");
        const { data } = await api.get("/stats");
        setStats(data);
      } catch (e) {
        console.error("GET /api/stats failed:", e);
        setError(e?.response?.data?.message || "Failed to load dashboard stats.");
      }
    };

    fetchStats();
  }, []);

  const hasDueSoon =
    typeof stats.dueSoon === "number" && stats.dueSoon > 0;

  return (
    <Box
      sx={{
        ml: `${SIDEBAR_WIDTH + 16}px`,
        pt: `${HEADER_HEIGHT + 16}px`,
        pr: 3,
        pl: 3,
        pb: 3,
        minHeight: "100vh",
        boxSizing: "border-box",
        backgroundColor: "background.default",
        display: "grid",
        gap: 2,
      }}
    >
      <Typography variant="h5">Dashboard</Typography>

      {/* 🔔 Retention alert for Admin/Manager */}
      {error && (
        <Alert severity="error" sx={{ mb: 1 }}>
          {error}
        </Alert>
      )}

      {hasDueSoon && !error && (
        <Alert severity="warning" sx={{ mb: 1 }}>
          {stats.dueSoon === 1
            ? "1 document has a retention date within the next 30 days or is overdue."
            : `${stats.dueSoon} documents have retention dates within the next 30 days or are overdue.`}
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Total Documents" value={stats.total} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Checked Out" value={stats.checkedOut} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Available" value={stats.available} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Offsite" value={stats.offsite} />
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <StatCard title="Retention Due ≤ 30 days" value={stats.dueSoon} />
        </Grid>
      </Grid>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Recent Activity
        </Typography>
        <Typography color="text.secondary">Coming soon…</Typography>
      </Paper>
    </Box>
  );
}
