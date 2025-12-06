// frontend/src/pages/Login.jsx
import React, { useState, useContext } from "react";
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axiosConfig";

export default function Login() {
  const { login } = useContext(AuthContext);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // normal login error / success
  const [err, setErr] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // must-change-password flow
  const [mustChange, setMustChange] = useState(false);
  const [pendingUserId, setPendingUserId] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changeErr, setChangeErr] = useState("");
  const [changeLoading, setChangeLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setErr("");
    setSuccessMsg("");
    setChangeErr("");
    setMustChange(false);
    setPendingUserId(null);

    setLoading(true);
    try {
      // Normal login – if backend is happy, this will navigate to /library
      await login(email, password);
    } catch (e2) {
      const status = e2?.response?.status;
      const data = e2?.response?.data;

      // 🔐 Special case: admin reset → must change password
      if (status === 403 && data?.must_change_password && data?.userId) {
        setMustChange(true);
        setPendingUserId(data.userId);
        localStorage.setItem("pendingUserId", data.userId);

        // We rely on the popup, so no big error at the top
        setErr("");
      } else {
        setErr(data?.message || "Invalid email or password.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setChangeErr("");
    setSuccessMsg("");

    if (!newPassword || newPassword.length < 8) {
      setChangeErr("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setChangeErr("Passwords do not match.");
      return;
    }

    const userId = pendingUserId || localStorage.getItem("pendingUserId");
    if (!userId) {
      setChangeErr("Session expired. Please try logging in again.");
      setMustChange(false);
      return;
    }

    setChangeLoading(true);
    try {
      // ✅ Match your backend route + payload:
      // POST /api/auth/change-password
      await api.post("/auth/change-password", {
        userId: Number(userId),
        new_password: newPassword,
      });

      // Clean up pending state
      localStorage.removeItem("pendingUserId");
      setMustChange(false);
      setNewPassword("");
      setConfirmNewPassword("");
      setPassword(""); // clear old temp password

      // ✅ DO NOT auto-login.
      // Just tell the user to sign in with the new password.
      setSuccessMsg("Password updated. Please log in with your new password.");
    } catch (e2) {
      setChangeErr(
        e2?.response?.data?.message ||
          "Error changing password. Please try again."
      );
    } finally {
      setChangeLoading(false);
    }
  };

  return (
    <>
      <Container maxWidth="sm">
        <Box
          sx={{
            mt: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography variant="h4" gutterBottom>
            Login
          </Typography>

          {err && (
            <Alert severity="error" sx={{ width: "100%", mb: 2 }}>
              {err}
            </Alert>
          )}

          {successMsg && (
            <Alert severity="success" sx={{ width: "100%", mb: 2 }}>
              {successMsg}
            </Alert>
          )}

          {/* Standard login form */}
          <Box
            component="form"
            onSubmit={handleSubmit}
            sx={{ width: "100%" }}
          >
            <TextField
              label="Email"
              fullWidth
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              disabled={mustChange}
            />
            <TextField
              label="Password"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={mustChange}
            />
            <Button
              variant="contained"
              color="primary"
              fullWidth
              sx={{ mt: 2 }}
              type="submit"
              disabled={loading || mustChange}
            >
              {loading ? "Signing in..." : "Login"}
            </Button>

            {/* Request Access link */}
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              sx={{ mt: 2 }}
            >
              <Typography variant="body2" color="text.secondary">
                Don&apos;t have an account?
              </Typography>
              <Button
                component={RouterLink}
                to="/register"   // 🔁 changed from /request-access to /register
                variant="text"
                size="small"
              >
                Request Access
              </Button>
            </Stack>
          </Box>
        </Box>
      </Container>

      {/* 🔒 Forced password change modal */}
      <Dialog
        open={mustChange}
        onClose={() => {
          // keep it open until they complete the reset
        }}
        disableEscapeKeyDown
      >
        <DialogTitle>Set a New Password</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1, minWidth: 320 }}>
            <Typography variant="body2" color="text.secondary">
              Your password was reset by an administrator. Please choose a new
              password before continuing.
            </Typography>

            {changeErr && <Alert severity="error">{changeErr}</Alert>}

            <TextField
              label="New password"
              type="password"
              fullWidth
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <TextField
              label="Confirm new password"
              type="password"
              fullWidth
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={handleChangePassword}
            variant="contained"
            disabled={changeLoading}
          >
            {changeLoading ? "Updating…" : "Update Password"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
