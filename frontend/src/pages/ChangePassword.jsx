// frontend/src/pages/ChangePassword.jsx
import React, { useState, useEffect } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Stack,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";

const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

export default function ChangePassword() {
  const navigate = useNavigate();

  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pendingUserId = localStorage.getItem("pendingUserId");

  // If no token and no pending user, there is no reason to be here
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token && !pendingUserId) {
      navigate("/", { replace: true });
    }
  }, [navigate, pendingUserId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!pwd || pwd.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (pwd !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setBusy(true);

      const token = localStorage.getItem("token");

      if (token) {
        // Normal logged-in user changing their own password
        await api.post("/auth/change-password", {
          new_password: pwd,
        });
      } else if (pendingUserId) {
        // 🔐 Forced-reset flow (no token, but we have pendingUserId)
        await api.post("/auth/complete-reset", {
          userId: Number(pendingUserId),
          new_password: pwd,
        });
      } else {
        throw new Error("No password reset in progress.");
      }

      // Clean up and send user back to login
      localStorage.removeItem("pendingUserId");
      localStorage.removeItem("user");
      localStorage.removeItem("token");

      alert("Password updated. Please log in with your new password.");
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to update password."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box
      sx={{
        ml: `${SIDEBAR_WIDTH}px`,
        pt: `${HEADER_HEIGHT + 16}px`,
        pr: 3,
        pl: 3,
        pb: 3,
        minHeight: "100vh",
        boxSizing: "border-box",
        backgroundColor: "background.default",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <Paper sx={{ p: 3, maxWidth: 480, width: "100%" }}>
        <Typography variant="h5" sx={{ mb: 2 }}>
          Set New Password
        </Typography>

        {pendingUserId && !localStorage.getItem("token") && (
          <Typography variant="body2" sx={{ mb: 2 }} color="text.secondary">
            Your password was reset by an administrator. Please set a new
            password to continue.
          </Typography>
        )}

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit}>
          <Stack spacing={2}>
            <TextField
              label="New password"
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              required
            />
            <TextField
              label="Confirm password"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            <Button
              type="submit"
              variant="contained"
              disabled={busy}
            >
              {busy ? "Saving…" : "Update Password"}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
