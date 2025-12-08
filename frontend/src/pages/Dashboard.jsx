// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState, useContext, useMemo } from "react";
import {
  Box,
  Paper,
  Typography,
  Stack,
  Grid,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import api from "../api/axiosConfig";
import { AuthContext } from "../context/AuthContext";

const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

function formatDate(dateString) {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function formatDateTime(dateString) {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

/* ---------- Document audit helpers (for dashboard) ---------- */

const DOC_AUDIT_FIELD_LABELS = {
  title: "Title",
  site: "Site",
  location: "Storage Location",
  status: "Status",
  description: "Description",
  file_closed_date: "File Closed Date",
  due_at: "Due Date",
  retention_date: "Retention Date",
  owner_name: "File Lead",
  owner_email: "File Lead Email",
  holder_name: "Checked-Out By",
  holder_email: "Checked-Out By Email",
};

const DOC_AUDIT_DATE_FIELDS = new Set([
  "file_closed_date",
  "due_at",
  "retention_date",
]);

const STATUS_LABELS = {
  Available: "Available",
  CheckedOut: "Checked Out",
  Destroyed: "Destroyed",
};

function formatDocAuditValue(field, raw) {
  if (raw === null || raw === undefined || raw === "") return "";

  if (DOC_AUDIT_DATE_FIELDS.has(field)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString();
    }
  }

  if (field === "status") {
    return STATUS_LABELS[raw] || String(raw);
  }

  return String(raw);
}

// Turns the note JSON into a multi-line human-readable summary
function formatDocAuditDetails(note) {
  if (!note) return "";

  let obj = note;
  if (typeof note === "string") {
    try {
      obj = JSON.parse(note);
    } catch {
      // Not JSON – just show the raw note
      return note;
    }
  }

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    if (typeof obj === "string") return obj;
    return "";
  }

  const lines = [];

  for (const [field, change] of Object.entries(obj)) {
    if (
      change &&
      typeof change === "object" &&
      "from" in change &&
      "to" in change
    ) {
      const label = DOC_AUDIT_FIELD_LABELS[field] || field;

      const fromVal = formatDocAuditValue(field, change.from);
      const toVal = formatDocAuditValue(field, change.to);

      const fromDisplay = fromVal === "" ? "—" : fromVal;
      const toDisplay = toVal === "" ? "—" : toVal;

      lines.push(`${label}: "${fromDisplay}" → "${toDisplay}"`);
    } else if (
      change !== null &&
      change !== undefined &&
      change !== "" &&
      !(Array.isArray(change) && change.length === 0)
    ) {
      const label = DOC_AUDIT_FIELD_LABELS[field] || field;
      lines.push(
        `${label}: ${
          typeof change === "string" ? change : JSON.stringify(change)
        }`
      );
    }
  }

  return lines.join("\n");
}

/* ---------- Admin activity helpers (for dashboard) ---------- */

const ADMIN_FIELD_LABELS = {
  email: "Email",
  full_name: "Name",
  role: "Role",
  new_role: "New Role",
  old_role: "Old Role",
  new_roles: "New Roles",
  old_roles: "Old Roles",
  status: "Status",
  request_id: "Request ID",
  note: "Note",
};

function formatAdminDetails(details) {
  if (!details) return "";

  let obj = details;
  if (typeof details === "string") {
    try {
      obj = JSON.parse(details);
    } catch {
      return details;
    }
  }

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    if (typeof obj === "string") return obj;
    return "";
  }

  const lines = [];

  for (const [key, rawVal] of Object.entries(obj)) {
    if (
      rawVal === null ||
      rawVal === undefined ||
      rawVal === "" ||
      (Array.isArray(rawVal) && rawVal.length === 0)
    ) {
      continue;
    }

    const label = ADMIN_FIELD_LABELS[key] || key;
    let value = rawVal;

    if (Array.isArray(value)) {
      value = value.join(", ");
    } else if (typeof value === "object") {
      value = JSON.stringify(value);
    }

    lines.push(`${label}: ${value}`);
  }

  return lines.join("\n");
}

/* ---------- Component ---------- */

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const roles = user?.roles || [];

  // Who can see audit panels (Clerk excluded)
  const canSeeAudit = roles.some((r) =>
    ["Admin", "Manager", "SuperAdmin"].includes(r)
  );

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState(null);

  async function loadSummary() {
    setLoading(true);
    setErr("");
    try {
      const { data } = await api.get("/dashboard/summary");
      setSummary(data || null);
    } catch (e) {
      console.error("Failed to load dashboard summary", e);
      setErr(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Failed to load dashboard data."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSummary();
  }, []);

  const totals = summary?.totals || {};
  const retention = summary?.retention || {};
  const checkouts = summary?.checkouts || {};
  const activity = summary?.activity || {};
  const settings = summary?.settings || {};

  const needsDecision = retention.needs_decision || [];
  const checkoutItems = checkouts.items || [];
  const docEvents = activity.document_events || [];
  const adminEvents = activity.admin_events || [];

  const overdueCount = totals.overdue_retention || 0;
  const dueSoonCount = totals.due_soon_retention || 0;
  const pendingAccess = totals.pending_access_requests || 0;

  const retentionHeadline = useMemo(() => {
    if (!overdueCount && !dueSoonCount) {
      return "All retention dates are up to date.";
    }
    const parts = [];
    if (overdueCount) parts.push(`${overdueCount} overdue`);
    if (dueSoonCount) parts.push(`${dueSoonCount} due soon`);
    return parts.join(", ");
  }, [overdueCount, dueSoonCount]);

  if (loading && !summary) {
    return (
      <Box
        sx={{
          ml: { xs: 0, md: `${SIDEBAR_WIDTH}px` },
          mt: `${HEADER_HEIGHT + 32}px`,
          p: 3,
          textAlign: "center",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        ml: { xs: 0, md: `${SIDEBAR_WIDTH + 16}px` },
        mt: `${HEADER_HEIGHT + 8}px`,
        p: 3,
      }}
    >
      <Typography variant="h5" sx={{ mb: 2 }}>
        Dashboard
      </Typography>

      {err && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      {/* Top summary tiles */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Active Files
            </Typography>
            <Typography variant="h4">
              {totals.total_active ?? 0}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Checked-Out
            </Typography>
            <Typography variant="h4">
              {totals.checked_out ?? 0}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Retention Issues
            </Typography>
            <Typography variant="h4">
              {(overdueCount || 0) + (dueSoonCount || 0)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {retentionHeadline}
            </Typography>
          </Paper>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Paper sx={{ p: 2 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Pending Access Requests
            </Typography>
            <Typography variant="h4">
              {pendingAccess ?? 0}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* ROW 1: Retention + Checked-out */}
      <Grid container spacing={2}>
        {/* Retention decisions (read-only) */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Stack
              direction="row"
              alignItems="center"
              justifyContent="space-between"
              sx={{ mb: 1 }}
            >
              <Typography variant="h6">Retention Decisions</Typography>
            </Stack>

            <Typography variant="body2" color="text.secondary">
              Files approaching or past their retention date. Click a file to
              review its retention plan.
            </Typography>

            {needsDecision.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 1 }}
              >
                No files require a retention decision right now.
              </Typography>
            ) : (
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Retention Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {needsDecision.map((doc) => (
                    <TableRow
                      key={doc.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => navigate(`/documents/${doc.id}`)}
                    >
                      <TableCell>{doc.title}</TableCell>
                      <TableCell>{formatDate(doc.retention_date)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {settings?.due_soon_days != null && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
              >
                “Due soon” means within {settings.due_soon_days} days.
              </Typography>
            )}
          </Paper>
        </Grid>

        {/* Checked-out files */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 0.5 }}>
              Checked-Out Files
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Currently signed-out documents and their holders.
            </Typography>

            {checkoutItems.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 2 }}
              >
                No files are currently checked out.
              </Typography>
            ) : (
              <Table size="small" sx={{ mt: 1 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Holder</TableCell>
                    <TableCell>Days Out</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {checkoutItems.map((c) => (
                    <TableRow
                      key={c.id}
                      hover
                      sx={{ cursor: "pointer" }}
                      onClick={() => navigate(`/documents/${c.id}`)}
                    >
                      <TableCell>{c.title}</TableCell>
                      <TableCell>{c.holder_name || "—"}</TableCell>
                      <TableCell>
                        {c.days_out != null ? c.days_out : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}

            {checkouts.longest_open_days != null && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1, display: "block" }}
              >
                Longest open check-out: {checkouts.longest_open_days} days.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>

      {/* ROW 2: Audit panels (hidden for Clerk) */}
      {canSeeAudit && (
        <Grid container spacing={2} sx={{ mt: 8 }}>
          {/* Recent Document Activity */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: "100%" }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Recent Document Activity
              </Typography>
              {docEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent document changes.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {docEvents.map((ev) => {
                    const detailsText = formatDocAuditDetails(ev.note);
                    return (
                      <Box
                        key={ev.id}
                        sx={{
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          pb: 0.5,
                        }}
                      >
                        <Typography variant="body2">
                          <strong>{ev.action}</strong>{" "}
                          {ev.actor_email && (
                            <>
                              by <em>{ev.actor_email}</em>
                            </>
                          )}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block" }}
                        >
                          {formatDateTime(ev.created_at)}
                        </Typography>
                        {detailsText && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: "block",
                              whiteSpace: "pre-wrap",
                              mt: 0.25,
                            }}
                          >
                            {detailsText}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Paper>
          </Grid>

          {/* Recent Admin Activity */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 2, height: "100%" }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Recent Admin Activity
              </Typography>
              {adminEvents.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No recent admin changes.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {adminEvents.map((ev) => {
                    const detailsText = formatAdminDetails(ev.details);
                    return (
                      <Box
                        key={ev.id}
                        sx={{
                          borderBottom: "1px solid",
                          borderColor: "divider",
                          pb: 0.5,
                        }}
                      >
                        <Typography variant="body2">
                          <strong>{ev.action_type}</strong>{" "}
                          {ev.actor_email && (
                            <>
                              by <em>{ev.actor_email}</em>
                            </>
                          )}
                          {ev.target_email && (
                            <>
                              {" "}
                              on <em>{ev.target_email}</em>
                            </>
                          )}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: "block" }}
                        >
                          {formatDateTime(ev.created_at)}
                        </Typography>
                        {detailsText && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              display: "block",
                              whiteSpace: "pre-wrap",
                              mt: 0.25,
                            }}
                          >
                            {detailsText}
                          </Typography>
                        )}
                      </Box>
                    );
                  })}
                </Stack>
              )}
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
