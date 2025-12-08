// frontend/src/pages/Register.jsx
// Acts as the "Request Access" page
import React, { useState } from "react";
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Stack,
} from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import api from "../api/axiosConfig";

export default function RequestAccess() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    try {
      setSubmitting(true);

      await api.post("/auth/request-access", {
        full_name: fullName.trim() || null,
        email: email.trim(),
      });

      setSuccess(
        "Your request has been submitted. An administrator will review it."
      );
      setFullName("");
      setEmail("");
    } catch (err) {
      console.error("Request access failed:", err);
      setError(
        err?.response?.data?.message ||
          "Failed to submit access request. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          mt: 8,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Typography variant="h4" gutterBottom>
          Request Access
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ mb: 2, textAlign: "center" }}
        >
          Enter your details below and an administrator will review your request.
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2, width: "100%" }}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 2, width: "100%" }}>
            {success}
          </Alert>
        )}

        <TextField
          label="Full Name"
          fullWidth
          margin="normal"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />

        <TextField
          label="Email"
          fullWidth
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Button
          type="submit"
          variant="contained"
          color="primary"
          fullWidth
          sx={{ mt: 2 }}
          disabled={submitting}
        >
          {submitting ? "Sending..." : "Submit Request"}
        </Button>

        {/* Back to Login */}
        <Stack sx={{ mt: 3 }} alignItems="center">
          <Button
            component={RouterLink}
            to="/"          
            variant="text"
            size="small"
          >
            Back to Login
          </Button>
        </Stack>
      </Box>
    </Container>
  );
}
