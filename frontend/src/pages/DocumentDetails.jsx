// frontend/src/pages/DocumentDetails.js
import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  Stack,
  Alert,
  Breadcrumbs,
  Link as MLink,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Chip,
} from "@mui/material";
import { Link, useParams } from "react-router-dom";
import api from "../api/axiosConfig";
import {
  getDocument,
  updateDocument,
  uploadDocumentFile,
  deleteDocumentFile,
  getDocumentFileUrl,
} from "../services/documents";
import { getLibraryColumns } from "../services/settings";

const SITE_OPTIONS = ["Onsite", "Offsite"];
const STATUS_OPTIONS = ["Available", "CheckedOut"];

// layout offsets (match your sidebar + header)
const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

// default retention window (years)
const DEFAULT_RETENTION_YEARS = 10;

/* ---------- helpers ---------- */

// Nice labels for audit field names
const AUDIT_FIELD_LABELS = {
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

// Fields we should treat as dates for audit formatting
const AUDIT_DATE_FIELDS = new Set([
  "file_closed_date",
  "due_at",
  "retention_date",
]);

// Status labels
const STATUS_LABELS = {
  Available: "Available",
  CheckedOut: "Checked Out",
};

function getStatusChip(status) {
  if (!status) return <Chip label="Unknown" size="small" />;
  if (status === "CheckedOut") {
    return (
      <Chip
        label="Checked Out"
        color="warning"
        size="small"
        variant="filled"
      />
    );
  }
  return (
    <Chip label="Available" color="success" size="small" variant="filled" />
  );
}

// Retention chip uses retention_date
function getRetentionChip(doc) {
  if (!doc?.retention_date) {
    return (
      <Chip
        label="Retention not set"
        size="small"
        variant="outlined"
        color="default"
      />
    );
  }

  const due = new Date(doc.retention_date);
  if (Number.isNaN(due.getTime())) {
    return (
      <Chip
        label="Invalid retention date"
        size="small"
        variant="outlined"
        color="default"
      />
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffMs = due - today;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <Chip
        label={`Overdue (${Math.abs(diffDays)}d)`}
        size="small"
        color="error"
        variant="filled"
      />
    );
  }
  if (diffDays <= 30) {
    return (
      <Chip
        label={`Due soon (${diffDays}d`}
        size="small"
        color="warning"
        variant="filled"
      />
    );
  }
  return (
    <Chip
      label={`Due in ${diffDays}d`}
      size="small"
      color="success"
      variant="outlined"
    />
  );
}

// Add N years to a YYYY-MM-DD string
function addYearsToDateString(dateStr, years) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

/**
 * Format a single value for audit display based on field type.
 */
function formatAuditValue(field, raw) {
  if (raw === null || raw === undefined || raw === "") return "";

  // Date-like fields
  if (AUDIT_DATE_FIELDS.has(field)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      // Show local date only (no long GMT string)
      return d.toLocaleDateString();
    }
  }

  // Status
  if (field === "status") {
    return STATUS_LABELS[raw] || String(raw);
  }

  return String(raw);
}

/**
 * Format audit.details (entry.note) into human-readable multi-line text.
 * Handles JSON diffs created by logAudit (field -> { from, to }),
 * plain strings, and generic fallbacks.
 */
function formatAuditDetails(entry) {
  const action = (entry.action || "").toLowerCase();
  const note = entry.note;

  if (note && typeof note === "string") {
    try {
      const parsed = JSON.parse(note);

      // If it's our diff object (field -> { from, to })
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const lines = [];

        for (const [field, change] of Object.entries(parsed)) {
          if (
            change &&
            typeof change === "object" &&
            "from" in change &&
            "to" in change
          ) {
            const label = AUDIT_FIELD_LABELS[field] || field;

            const fromVal = formatAuditValue(field, change.from);
            const toVal = formatAuditValue(field, change.to);

            const fromDisplay = fromVal === "" ? "—" : fromVal;
            const toDisplay = toVal === "" ? "—" : toVal;

            lines.push(`${label}: "${fromDisplay}" → "${toDisplay}"`);
          } else {
            const label = AUDIT_FIELD_LABELS[field] || field;
            lines.push(`${label}: ${String(change)}`);
          }
        }

        if (lines.length > 0) {
          return lines.join("\n");
        }
      }

      // If it's just a JSON string or something else, fallback
      if (typeof parsed === "string") return parsed;
      return JSON.stringify(parsed);
    } catch {
      // Not JSON, show raw note
      return note;
    }
  }

  // No note – generic descriptions by action
  if (action === "create") return "Document created";
  if (action === "update") return "Document details updated";
  if (action === "delete") return "Document deleted";

  return "—";
}

export default function DocumentDetails() {
  const { id } = useParams();

  const [doc, setDoc] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    title: "",
    site: "Onsite",
    location: "",
    status: "Available",
    description: "",
    file_closed_date: "",
    retention_date: "",
    owner_name: "",
    owner_email: "",
    holder_name: "",
    holder_email: "",
  });

  const [files, setFiles] = useState([]);
  const [fileErr, setFileErr] = useState("");
  const [fileBusy, setFileBusy] = useState(false);
  const [retentionYears, setRetentionYears] = useState(DEFAULT_RETENTION_YEARS);
  const [columnVisibility, setColumnVisibility] = useState(null);

  const createdAt = useMemo(
    () => (doc?.created_at ? new Date(doc.created_at) : null),
    [doc]
  );
  const updatedAt = useMemo(
    () => (doc?.updated_at ? new Date(doc.updated_at) : null),
    [doc]
  );

  /* ---------- data loading ---------- */

  async function reloadAudit() {
    try {
      const { data } = await api.get(`/audit/document/${id}`);
      setAudit(Array.isArray(data) ? data : []);
    } catch {
      setAudit([]);
    }
  }

  async function load() {
    setErr("");
    setLoading(true);
    try {
      const { document, audit: fromRoute } = await getDocument(id);
      if (!document) {
        setErr("Document not found");
        setDoc(null);
        setAudit([]);
        setFiles([]);
        return;
      }

      setDoc(document);
      setFiles(Array.isArray(document.files) ? document.files : []);

      setForm({
        title: document.title || "",
        site: document.site || "Onsite",
        location: document.location || "",
        status: document.status || "Available",
        description: document.description || "",
        file_closed_date: document.file_closed_date
          ? document.file_closed_date.substring(0, 10)
          : "",
        retention_date: document.retention_date
          ? document.retention_date.substring(0, 10)
          : "",
        owner_name: document.owner_name || "",
        owner_email: document.owner_email || "",
        holder_name: document.holder_name || "",
        holder_email: document.holder_email || "",
      });

      if (Array.isArray(fromRoute) && fromRoute.length) {
        setAudit(fromRoute);
      } else {
        await reloadAudit();
      }
    } catch (e) {
      console.error("Load document error:", e);
      setErr(e?.response?.data?.message || "Failed to load document.");
      setDoc(null);
      setAudit([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadColumnSettings() {
    try {
      const data = await getLibraryColumns();
      const cols = Array.isArray(data?.columns) ? data.columns : [];
      const visibility = {};
      for (const col of cols) {
        visibility[col.id] = col.visible !== false;
      }
      setColumnVisibility(visibility);
    } catch (e) {
      console.error("Failed to load library column settings:", e);
      setColumnVisibility(null);
    }
  }

  async function loadSystemSettings() {
    try {
      const { data } = await api.get("/settings/system");
      if (data && typeof data.default_retention_years === "number") {
        setRetentionYears(data.default_retention_years);
      }
    } catch (e) {
      console.error("Failed to load system settings:", e);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    loadColumnSettings();
    loadSystemSettings();
  }, []);

  /* ---------- save / check in-out ---------- */

  const onSave = async () => {
    try {
      setErr("");

      const holderName = form.holder_name.trim();
      const status = holderName ? "CheckedOut" : "Available";

      const payload = {
        title: form.title.trim(),
        site: form.site,
        location: form.location.trim(),
        status,
        description: form.description.trim(),
        file_closed_date: form.file_closed_date || null,
        retention_date: form.retention_date || null,
        owner_name: form.owner_name.trim(),
        owner_email: form.owner_email.trim(), // preserved, just not edited in UI
        holder_name: holderName,
        holder_email: form.holder_email.trim(), // preserved, just not edited in UI
      };

      const saved = await updateDocument(id, payload);
      setDoc(saved);
      setEditing(false);
      await reloadAudit();
    } catch (e) {
      console.error("Save document error:", e);
      setErr(e?.response?.data?.message || "Failed to save changes.");
    }
  };

  /* ---------- digital file handlers ---------- */

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileErr("");
    setFileBusy(true);
    try {
      const uploaded = await uploadDocumentFile(id, file);
      setFiles((prev) => [uploaded, ...prev]);
      await reloadAudit();
    } catch (e) {
      console.error("Upload file error:", e);
      setFileErr(
        e?.response?.data?.message || "Failed to upload digital document file."
      );
    } finally {
      setFileBusy(false);
      event.target.value = "";
    }
  };

  const handleFileDelete = async (fileId) => {
    if (!window.confirm("Remove this digital file?")) return;
    setFileErr("");
    setFileBusy(true);
    try {
      await deleteDocumentFile(id, fileId);
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      await reloadAudit();
    } catch (e) {
      console.error("Delete file error:", e);
      setFileErr(
        e?.response?.data?.message || "Failed to delete digital file."
      );
    } finally {
      setFileBusy(false);
    }
  };

  const handleDownload = (fileId) => {
    const url = getDocumentFileUrl(id, fileId);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  /* ---------- retention helpers ---------- */

  // Always recompute retention date when file closed date changes,
  // using the retentionYears loaded from system settings.
  const handleFileClosedChange = (value) => {
    setForm((prev) => {
      const updated = { ...prev, file_closed_date: value };

      if (value) {
        const auto = addYearsToDateString(value, retentionYears);
        if (auto) {
          updated.retention_date = auto;
        }
      } else {
        // if file closed date is cleared, also clear retention date
        updated.retention_date = "";
      }

      return updated;
    });
  };

  const isColumnVisible = (id) => {
    if (!columnVisibility) return true; // if settings fail to load, show everything
    const v = columnVisibility[id];
    return v === undefined ? true : v;
  };

  /* ---------- render ---------- */

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
      }}
    >
      {/* Breadcrumbs */}
      <Breadcrumbs sx={{ mb: 1 }}>
        <MLink
          component={Link}
          to="/dashboard"
          underline="hover"
          color="inherit"
        >
          Home
        </MLink>
        <MLink
          component={Link}
          to="/library"
          underline="hover"
          color="inherit"
        >
          Document Library
        </MLink>
        <Typography color="text.primary">
          {doc?.title || (loading ? "Loading…" : "Document")}
        </Typography>
      </Breadcrumbs>

      {/* Error */}
      {err && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      <Stack spacing={3}>
        {/* HEADER CARD */}
        <Paper sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
            spacing={1.5}
          >
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography variant="h5">
                  {doc?.title || `Document #${doc?.id ?? ""}`}
                </Typography>
                {doc && isColumnVisible("status") && getStatusChip(doc.status)}
                {doc &&
                  isColumnVisible("retention") &&
                  getRetentionChip(doc)}
              </Stack>
              {/* ID / Site line removed per your request */}
            </Box>

            <Stack direction="row" spacing={1}>
              <Button
                variant={editing ? "outlined" : "contained"}
                onClick={() => setEditing((v) => !v)}
                disabled={loading || !doc}
              >
                {editing ? "Cancel Editing" : "Edit Document"}
              </Button>
            </Stack>
          </Stack>
        </Paper>

        {/* DETAILS CARD */}
        <Paper sx={{ p: 2.5 }}>
          {!editing ? (
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: { xs: "1fr", sm: "220px 1fr" },
                rowGap: 1.25,
                columnGap: 2,
                alignItems: "flex-start",
              }}
            >
              <Typography color="text.secondary">Document ID</Typography>
              <Typography>{doc?.id ?? "-"}</Typography>

              {isColumnVisible("location") && (
                <>
                  <Typography color="text.secondary">
                    Storage Location
                  </Typography>
                  <Typography>{doc?.location || "—"}</Typography>
                </>
              )}

              {isColumnVisible("site") && (
                <>
                  <Typography color="text.secondary">Site</Typography>
                  <Typography>{doc?.site || "—"}</Typography>
                </>
              )}

              {isColumnVisible("status") && (
                <>
                  <Typography color="text.secondary">Status</Typography>
                  <Typography>{doc?.status || "—"}</Typography>
                </>
              )}

              {isColumnVisible("owner") && (
                <>
                  <Typography color="text.secondary">File Lead</Typography>
                  <Typography>{doc?.owner_name || "—"}</Typography>
                </>
              )}

              {isColumnVisible("holder") && (
                <>
                  <Typography color="text.secondary">Checked-Out By</Typography>
                  <Typography>{doc?.holder_name || "—"}</Typography>
                </>
              )}

              <Typography color="text.secondary">File Closed Date</Typography>
              <Typography>
                {doc?.file_closed_date
                  ? new Date(doc.file_closed_date).toLocaleDateString()
                  : "Not set"}
              </Typography>

              {isColumnVisible("retention") && (
                <>
                  <Typography color="text.secondary">Retention Date</Typography>
                  <Typography>
                    {doc?.retention_date
                      ? new Date(doc.retention_date).toLocaleDateString()
                      : "Not set"}
                  </Typography>
                </>
              )}

              <Typography color="text.secondary">Description</Typography>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>
                {doc?.description || "—"}
              </Typography>

              <Typography color="text.secondary">Created</Typography>
              <Typography>
                {createdAt ? createdAt.toLocaleString() : "—"}
              </Typography>

              <Typography color="text.secondary">Last Updated</Typography>
              <Typography>
                {updatedAt ? updatedAt.toLocaleString() : "—"}
              </Typography>
            </Box>
          ) : (
            <Box component="form" onSubmit={(e) => e.preventDefault()}>
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "220px 1fr" },
                  rowGap: 1.5,
                  columnGap: 2,
                  alignItems: "center",
                }}
              >
                <Typography color="text.secondary">Title</Typography>
                <TextField
                  value={form.title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, title: e.target.value }))
                  }
                  fullWidth
                />

                {isColumnVisible("location") && (
                  <>
                    <Typography color="text.secondary">
                      Storage Location
                    </Typography>
                    <TextField
                      value={form.location}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, location: e.target.value }))
                      }
                      fullWidth
                    />
                  </>
                )}

                {isColumnVisible("site") && (
                  <>
                    <Typography color="text.secondary">Site</Typography>
                    <FormControl fullWidth>
                      <InputLabel id="site-label">Site</InputLabel>
                      <Select
                        labelId="site-label"
                        label="Site"
                        value={form.site}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, site: e.target.value }))
                        }
                      >
                        {SITE_OPTIONS.map((s) => (
                          <MenuItem key={s} value={s}>
                            {s}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </>
                )}

                {isColumnVisible("owner") && (
                  <>
                    <Typography color="text.secondary">File Lead</Typography>
                    <TextField
                      value={form.owner_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, owner_name: e.target.value }))
                      }
                      fullWidth
                    />
                  </>
                )}

                {isColumnVisible("holder") && (
                  <>
                    <Typography color="text.secondary">
                      Checked-Out By
                    </Typography>
                    <TextField
                      value={form.holder_name}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, holder_name: e.target.value }))
                      }
                      fullWidth
                    />
                  </>
                )}

                <Typography color="text.secondary">File Closed Date</Typography>
                <TextField
                  type="date"
                  value={form.file_closed_date}
                  onChange={(e) => handleFileClosedChange(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />

                {isColumnVisible("retention") && (
                  <>
                    <Typography color="text.secondary">
                      Retention Date
                    </Typography>
                    <TextField
                      type="date"
                      value={form.retention_date}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          retention_date: e.target.value,
                        }))
                      }
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </>
                )}

                <Typography color="text.secondary">Description</Typography>
                <TextField
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  multiline
                  minRows={3}
                  fullWidth
                />
              </Box>

              <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={onSave}
                  disabled={loading}
                >
                  Save Changes
                </Button>
                <Button
                  variant="outlined"
                  onClick={() => setEditing(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </Stack>
            </Box>
          )}
        </Paper>

        {/* DIGITAL FILES */}
        <Paper sx={{ p: 2.5 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            alignItems={{ xs: "flex-start", sm: "center" }}
            justifyContent="space-between"
            sx={{ mb: 1.5 }}
            spacing={1.5}
          >
            <Typography variant="h6">Digital Files</Typography>
            <Button
              variant="outlined"
              component="label"
              disabled={fileBusy || !doc}
            >
              Upload File
              <input
                type="file"
                hidden
                onChange={handleFileChange}
                disabled={fileBusy || !doc}
              />
            </Button>
          </Stack>

          {fileErr && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {fileErr}
            </Alert>
          )}

          {files.length === 0 ? (
            <Typography color="text.secondary">
              No digital files attached.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>File Name</TableCell>
                  <TableCell>Uploaded At</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {files.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.filename}</TableCell>
                    <TableCell>
                      {f.uploaded_at
                        ? new Date(f.uploaded_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell align="right">
                      <Stack
                        direction="row"
                        spacing={1}
                        justifyContent="flex-end"
                      >
                        <Button
                          size="small"
                          onClick={() => handleDownload(f.id)}
                        >
                          Download
                        </Button>
                        <Button
                          size="small"
                          color="error"
                          onClick={() => handleFileDelete(f.id)}
                          disabled={fileBusy}
                        >
                          Delete
                        </Button>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {/* AUDIT LOG */}
        <Paper sx={{ p: 2.5, mb: 4 }}>
          <Typography variant="h6" sx={{ mb: 1.5 }}>
            Audit Log
          </Typography>
          {audit.length === 0 ? (
            <Typography color="text.secondary">
              No audit entries recorded yet.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>By</TableCell>
                  <TableCell>Action</TableCell>
                  <TableCell>Details</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {audit.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {entry.created_at
                        ? new Date(entry.created_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {entry.actor_email || entry.actor_name || "—"}
                    </TableCell>
                    <TableCell>{entry.action}</TableCell>
                    <TableCell sx={{ whiteSpace: "pre-wrap" }}>
                      {formatAuditDetails(entry)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>
      </Stack>
    </Box>
  );
}
