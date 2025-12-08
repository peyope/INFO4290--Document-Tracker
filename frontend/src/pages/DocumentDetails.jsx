// frontend/src/pages/DocumentDetails.jsx
import React, { useState, useEffect, useContext } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  CircularProgress,
  Alert,
  Divider,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
} from "@mui/material";
import Autocomplete from "@mui/material/Autocomplete";
import { useParams, useNavigate } from "react-router-dom";

import {
  getDocument,
  updateDocument,
  deleteDocument,
  uploadDocumentFile,
  deleteDocumentFile,
} from "../services/documents";
import { listEmployees, formatEmployeeName } from "../services/employees";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axiosConfig";

const SITE_OPTIONS = ["Onsite", "Offsite"];

/* ---------- Audit helpers ---------- */

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
  destruction_approved_at: "Destruction Approved",
  destruction_completed_at: "Destruction Completed",
  retention_action: "Retention Action",
};

const AUDIT_DATE_FIELDS = new Set([
  "file_closed_date",
  "due_at",
  "retention_date",
  "destruction_approved_at",
  "destruction_completed_at",
]);

const STATUS_LABELS = {
  Available: "Available",
  CheckedOut: "Checked Out",
  Destroyed: "Destroyed",
};

function formatAuditValue(field, raw) {
  if (raw === null || raw === undefined || raw === "") return "";

  if (AUDIT_DATE_FIELDS.has(field)) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString();
    }
  }

  if (field === "status") {
    return STATUS_LABELS[raw] || String(raw);
  }

  if (field === "retention_action") {
    return String(raw).replace(/-/g, " ");
  }

  return String(raw);
}

function formatAuditDetails(entry) {
  const action = (entry.action || "").toLowerCase();
  const note = entry.note;

  if (note && typeof note === "string") {
    try {
      const parsed = JSON.parse(note);

      // If it's diff object (field -> { from, to })
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
            lines.push(
              `${field}: ${
                typeof change === "string" ? change : JSON.stringify(change)
              }`
            );
          }
        }

        if (lines.length > 0) {
          return lines.join("\n");
        }
      }

      if (typeof parsed === "string") return parsed;
      return JSON.stringify(parsed);
    } catch {
      // Not JSON, show raw note
      return note;
    }
  }

  if (action === "create") return "Document created";
  if (action === "update") return "Document details updated";
  if (action === "delete") return "Document deleted";
  if (action === "retention-decision") return "Retention decision updated";
  if (action === "destroyed")
    return "Destruction confirmed and digital files removed.";

  return "—";
}

/* ---------- Component ---------- */

export default function DocumentDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [documentData, setDocumentData] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const [editMode, setEditMode] = useState(false);

  const [employees, setEmployees] = useState([]);

  const [form, setForm] = useState({
    title: "",
    location: "",
    site: "",
    status: "",
    description: "",
    retention_date: "",
    file_closed_date: "",
    owner_id: null,
    holder_id: null,
  });

  const [selectedOwner, setSelectedOwner] = useState(null);
  const [selectedHolder, setSelectedHolder] = useState(null);

  const [fileUploadLoading, setFileUploadLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [retentionYears, setRetentionYears] = useState(10);

  const [audit, setAudit] = useState([]);

  // Retention decision dialog state
  const [retentionDialogOpen, setRetentionDialogOpen] = useState(false);
  const [retentionDecision, setRetentionDecision] = useState("");
  const [retentionNote, setRetentionNote] = useState("");
  const [retentionNewDate, setRetentionNewDate] = useState("");
  const [savingRetention, setSavingRetention] = useState(false);

  // Confirm destruction dialog state
  const [confirmDestroyOpen, setConfirmDestroyOpen] = useState(false);
  const [confirmDestroyLoading, setConfirmDestroyLoading] = useState(false);

  // Helper: add N years to YYYY-MM-DD
  const addYearsToDate = (dateString, years) => {
    if (!dateString) return "";
    const parts = dateString.split("-");
    if (parts.length !== 3) return dateString;

    const baseYear = parseInt(parts[0], 10);
    const yrOffset = Number(years) || 0;
    if (!Number.isFinite(baseYear)) return dateString;

    const year = baseYear + yrOffset;
    const month = parts[1];
    const day = parts[2];

    return `${year}-${month}-${day}`;
  };

  // Load retention years from settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await api.get("/settings/system");
        const rawYears = res?.data?.default_retention_years;
        const num = Number(rawYears);
        if (Number.isFinite(num) && num >= 0) {
          setRetentionYears(num);
        }
      } catch (e) {
        console.warn(
          "Could not load retention settings, using default",
          e?.message
        );
      }
    }
    loadSettings();
  }, []);

  // Reload audit separately (fallback / refresh)
  const reloadAudit = async () => {
    try {
      const { data } = await api.get(`/audit/document/${id}`);
      setAudit(Array.isArray(data) ? data : []);
    } catch (e) {
      console.warn("Failed to load audit log", e?.message);
    }
  };

  /**
   * Normalize server response from getDocument / updateDocument
   * so the component always has:
   *  - documentData: document row + files[]
   *  - audit: audit entries
   *  - form + selected owner/holder set
   */
  const applyDocumentResponse = (data, employeesList = null) => {
    if (!data) return;

    let doc = data.document || data;
    const files = Array.isArray(data.files) ? data.files : [];
    const auditFromRoute = Array.isArray(data.audit) ? data.audit : [];

    doc = { ...doc, files };

    setDocumentData(doc);
    if (auditFromRoute.length) {
      setAudit(auditFromRoute);
    }

    const list = employeesList || employees;

    if (list && list.length) {
      const ownerEmp = list.find((e) => e.id === doc.owner_id) || null;
      const holderEmp = list.find((e) => e.id === doc.holder_id) || null;
      setSelectedOwner(ownerEmp);
      setSelectedHolder(holderEmp);
    }

    setForm({
      title: doc.title || "",
      location: doc.location || "",
      site: doc.site || "",
      status: doc.status || "",
      description: doc.description || "",
      retention_date: doc.retention_date
        ? String(doc.retention_date).split("T")[0]
        : "",
      file_closed_date: doc.file_closed_date
        ? String(doc.file_closed_date).split("T")[0]
        : "",
      owner_id: doc.owner_id || null,
      holder_id: doc.holder_id || null,
    });

    // Pre-fill retention dialog with current values
    setRetentionDecision(doc.retention_action || "");
    setRetentionNewDate(
      doc.retention_date ? String(doc.retention_date).split("T")[0] : ""
    );
    setRetentionNote("");
  };

  // Load employees + document (+ audit)
  useEffect(() => {
    async function fetchData() {
      try {
        const empList = await listEmployees({ includeInactive: false });
        setEmployees(empList);

        const data = await getDocument(id);
        if (!data) {
          setError("Document not found.");
          setLoading(false);
          return;
        }

        applyDocumentResponse(data, empList);

        if (!data.audit || !data.audit.length) {
          reloadAudit();
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load document.");
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    
  }, [id]);

  const handleChange = (field) => (e) => {
    setForm((prev) => ({
      ...prev,
      [field]: e.target.value,
    }));
  };

  // File Closed Date change → auto retention date + clear when empty
  const handleClosedDateChange = (e) => {
    const value = e.target.value;

    setForm((prev) => {
      if (!value) {
        return {
          ...prev,
          file_closed_date: "",
          retention_date: "",
        };
      }

      const autoRetention = addYearsToDate(value, retentionYears);

      return {
        ...prev,
        file_closed_date: value,
        retention_date: autoRetention,
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSuccessMsg("");

    try {
      const payload = {
        ...form,
        owner_id: selectedOwner ? selectedOwner.id : null,
        holder_id: selectedHolder ? selectedHolder.id : null,
      };

      const updated = await updateDocument(id, payload);
      applyDocumentResponse(updated);

      setEditMode(false);
      setSuccessMsg("Document updated successfully");

      reloadAudit();
    } catch (err) {
      console.error(err);
      setError("Failed to update document.");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileUploadLoading(true);
    setError("");

    try {
      await uploadDocumentFile(id, file);
      const refreshed = await getDocument(id);
      applyDocumentResponse(refreshed);
    } catch (err) {
      console.error(err);
      setError("Failed to upload file.");
    } finally {
      setFileUploadLoading(false);
    }
  };

  const handleDeleteFile = async (fileId) => {
    try {
      await deleteDocumentFile(id, fileId);
      const refreshed = await getDocument(id);
      applyDocumentResponse(refreshed);
    } catch (err) {
      console.error(err);
      setError("Failed to delete file.");
    }
  };

  const handleDeleteDocument = async () => {
    try {
      await deleteDocument(id);
      navigate("/library");
    } catch (err) {
      console.error(err);
      setError("Failed to delete document.");
    }
  };

  // Open retention decision dialog
  const openRetentionDialog = () => {
    setRetentionDialogOpen(true);
    setSuccessMsg("");
  };

  // Save retention decision
  const handleSaveRetentionDecision = async () => {
    setSavingRetention(true);
    setError("");
    setSuccessMsg("");

    try {
      if (retentionDecision === "Extend" && !retentionNewDate) {
        setError(
          "Please select a new retention date when choosing 'Extend'."
        );
        setSavingRetention(false);
        return;
      }

      const payload = {
        decision: retentionDecision || null,
        note: retentionNote || null,
        new_retention_date:
          retentionDecision === "Extend" ? retentionNewDate || null : null,
      };

      const { data } = await api.post(
        `/documents/${id}/retention-decision`,
        payload
      );

      applyDocumentResponse(data);
      setSuccessMsg("Retention decision saved.");
      setRetentionDialogOpen(false);
      reloadAudit();
    } catch (err) {
      console.error(err);
      setError("Failed to save retention decision.");
    } finally {
      setSavingRetention(false);
    }
  };

  // Confirm destruction
  const handleConfirmDestruction = async () => {
    setConfirmDestroyLoading(true);
    setError("");
    setSuccessMsg("");

    try {
      const { data } = await api.post(
        `/documents/${id}/confirm-destruction`
      );

      applyDocumentResponse(data);
      setSuccessMsg("Destruction confirmed and files removed.");
      setConfirmDestroyOpen(false);
      reloadAudit();
    } catch (err) {
      console.error(err);
      setError("Failed to confirm destruction.");
    } finally {
      setConfirmDestroyLoading(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ mt: 10, textAlign: "center" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!documentData) {
    return (
      <Box sx={{ mt: 10, textAlign: "center" }}>
        <Typography color="error">Document not found.</Typography>
      </Box>
    );
  }

  const canManage =
    user?.roles?.includes("Admin") ||
    user?.roles?.includes("Manager") ||
    user?.roles?.includes("Clerk") ||
    user?.roles?.includes("SuperAdmin");

  const downloadToken = window.localStorage.getItem("token") || "";

  const ownerDisplay = selectedOwner
    ? formatEmployeeName(selectedOwner)
    : documentData.owner_name || "None";

  const holderDisplay = selectedHolder
    ? formatEmployeeName(selectedHolder)
    : documentData.holder_name || "None";

  const isDestroyAction = documentData.retention_action === "Destroy";
  const destructionCompletedAt = documentData.destruction_completed_at;
  const isDestroyed =
    !!destructionCompletedAt || documentData.status === "Destroyed";

  return (
    <Box sx={{ ml: { xs: 0, md: "240px" }, mt: "72px", p: 3 }}>
      <Paper sx={{ p: 3 }}>
        <Stack direction="row" justifyContent="space-between">
          <Typography variant="h5">Document Details</Typography>

          {canManage && !editMode && (
            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                onClick={openRetentionDialog}
                disabled={isDestroyed}
              >
                Retention Decision
              </Button>

              {isDestroyAction && !isDestroyed && (
                <Button
                  variant="contained"
                  color="error"
                  onClick={() => setConfirmDestroyOpen(true)}
                >
                  Confirm Destruction Completed
                </Button>
              )}

              <Button
                variant="contained"
                onClick={() => setEditMode(true)}
                disabled={isDestroyed}
              >
                Edit
              </Button>

              <Button
                variant="outlined"
                color="error"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete
              </Button>
            </Stack>
          )}
        </Stack>

        <Divider sx={{ my: 2 }} />

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {successMsg && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {successMsg}
          </Alert>
        )}

        {/* VIEW MODE */}
        {!editMode ? (
          <Box>
            <Typography variant="h6" gutterBottom>
              {documentData.title}
            </Typography>

            <Typography>
              <strong>Location:</strong> {documentData.location || "—"}
            </Typography>
            <Typography>
              <strong>Site:</strong> {documentData.site || "—"}
            </Typography>
            <Typography>
              <strong>Status:</strong>{" "}
              {STATUS_LABELS[documentData.status] || documentData.status}
            </Typography>
            <Typography sx={{ mt: 1 }}>
              <strong>Description:</strong> {documentData.description || "—"}
            </Typography>

            <Typography sx={{ mt: 1 }}>
              <strong>Retention Date:</strong>{" "}
              {documentData.retention_date
                ? String(documentData.retention_date).split("T")[0]
                : "—"}
            </Typography>

            <Typography sx={{ mt: 1 }}>
              <strong>File Closed Date:</strong>{" "}
              {documentData.file_closed_date
                ? String(documentData.file_closed_date).split("T")[0]
                : "—"}
            </Typography>

            <Typography sx={{ mt: 1 }}>
              <strong>Retention Action:</strong>{" "}
              {documentData.retention_action
                ? String(documentData.retention_action).replace(/-/g, " ")
                : "—"}
            </Typography>

            <Typography sx={{ mt: 1 }}>
              <strong>Destruction Approved:</strong>{" "}
              {documentData.destruction_approved_at
                ? new Date(
                    documentData.destruction_approved_at
                  ).toLocaleDateString()
                : "—"}
            </Typography>

            <Typography sx={{ mt: 1 }}>
              <strong>Destruction Completed:</strong>{" "}
              {documentData.destruction_completed_at
                ? new Date(
                    documentData.destruction_completed_at
                  ).toLocaleDateString()
                : "—"}
            </Typography>

            <Typography sx={{ mt: 1 }}>
              <strong>File Lead:</strong> {ownerDisplay}
            </Typography>

            <Typography sx={{ mt: 1 }}>
              <strong>Checked-Out By:</strong> {holderDisplay}
            </Typography>

            {/* Files */}
            <Typography variant="h6" sx={{ mt: 3 }}>
              Files
            </Typography>

            {documentData.files && documentData.files.length > 0 ? (
              documentData.files.map((file) => (
                <Stack
                  key={file.id}
                  direction="row"
                  spacing={2}
                  alignItems="center"
                  sx={{ mt: 1 }}
                >
                  <a
                    href={`http://localhost:5000/api/documents/${documentData.id}/files/${file.id}?token=${encodeURIComponent(
                      downloadToken
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {file.file_name}
                  </a>

                  {canManage && !isDestroyed && (
                    <Button
                      size="small"
                      color="error"
                      onClick={() => handleDeleteFile(file.id)}
                    >
                      Delete
                    </Button>
                  )}
                </Stack>
              ))
            ) : (
              <Typography>No files uploaded.</Typography>
            )}

            {canManage && !isDestroyed && (
              <Box sx={{ mt: 2 }}>
                <Button variant="contained" component="label">
                  Upload File
                  <input hidden type="file" onChange={handleFileUpload} />
                </Button>
                {fileUploadLoading && (
                  <CircularProgress size={20} sx={{ ml: 1 }} />
                )}
              </Box>
            )}
          </Box>
        ) : (
          // EDIT MODE
          <Box>
            <Stack spacing={2} sx={{ mt: 1 }}>
              <TextField
                label="Title"
                fullWidth
                value={form.title}
                onChange={handleChange("title")}
              />

              <TextField
                label="Location"
                fullWidth
                value={form.location}
                onChange={handleChange("location")}
              />

              <TextField
                select
                label="Site"
                fullWidth
                value={form.site}
                onChange={handleChange("site")}
              >
                {SITE_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label="Description"
                fullWidth
                multiline
                rows={3}
                value={form.description}
                onChange={handleChange("description")}
              />

              <Stack direction="row" spacing={2}>
                <TextField
                  type="date"
                  label="Retention Date"
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  value={form.retention_date || ""}
                  onChange={handleChange("retention_date")}
                />

                <TextField
                  type="date"
                  label="File Closed Date"
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                  value={form.file_closed_date || ""}
                  onChange={handleClosedDateChange}
                />
              </Stack>

              <Autocomplete
                options={employees}
                getOptionLabel={(opt) => formatEmployeeName(opt)}
                value={selectedOwner}
                onChange={(e, v) => setSelectedOwner(v)}
                renderInput={(params) => (
                  <TextField {...params} label="File Lead" placeholder="None" />
                )}
                isOptionEqualToValue={(opt, val) => opt.id === val?.id}
              />

              <Autocomplete
                options={employees}
                getOptionLabel={(opt) => formatEmployeeName(opt)}
                value={selectedHolder}
                onChange={(e, v) => setSelectedHolder(v)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Checked-Out By"
                    placeholder="None"
                  />
                )}
                isOptionEqualToValue={(opt, val) => opt.id === val?.id}
              />

              <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Saving..." : "Save"}
                </Button>

                <Button variant="outlined" onClick={() => setEditMode(false)}>
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </Box>
        )}
      </Paper>

      {/* Retention Decision Dialog */}
      <Dialog
        open={retentionDialogOpen}
        onClose={() => !savingRetention && setRetentionDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Retention Decision</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Record what should happen when this file reaches its retention end
            date.
          </Typography>

          <Stack spacing={2}>
            <TextField
              select
              label="Decision"
              fullWidth
              value={retentionDecision}
              onChange={(e) => setRetentionDecision(e.target.value)}
            >
              <MenuItem value="">No decision</MenuItem>
              <MenuItem value="Destroy">Destroy / Dispose</MenuItem>
              <MenuItem value="Extend">Extend retention</MenuItem>
              <MenuItem value="Archive">Archive / Keep</MenuItem>
            </TextField>

            {retentionDecision === "Extend" && (
              <TextField
                type="date"
                label="New retention date"
                InputLabelProps={{ shrink: true }}
                fullWidth
                value={retentionNewDate || ""}
                onChange={(e) => setRetentionNewDate(e.target.value)}
              />
            )}

            <TextField
              label="Notes (optional)"
              fullWidth
              multiline
              minRows={2}
              value={retentionNote}
              onChange={(e) => setRetentionNote(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setRetentionDialogOpen(false)}
            disabled={savingRetention}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSaveRetentionDecision}
            variant="contained"
            disabled={savingRetention}
          >
            {savingRetention ? "Saving…" : "Save decision"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Destruction Dialog */}
      <Dialog
        open={confirmDestroyOpen}
        onClose={() => !confirmDestroyLoading && setConfirmDestroyOpen(false)}
      >
        <DialogTitle>Confirm Destruction Completed</DialogTitle>
        <DialogContent>
          This will permanently remove all digital files for this document and
          mark it as <strong>Destroyed</strong> in the system. Physical
          destruction should already have taken place.
          <br />
          <br />
          Are you sure you want to continue?
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setConfirmDestroyOpen(false)}
            disabled={confirmDestroyLoading}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirmDestruction}
            color="error"
            variant="contained"
            disabled={confirmDestroyLoading}
          >
            {confirmDestroyLoading ? "Processing…" : "Yes, confirm destruction"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* AUDIT LOG */}
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="h6" sx={{ mb: 1.5 }}>
          Audit Log
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Shows recent changes made to this document&apos;s details.
        </Typography>

        {!audit.length ? (
          <Typography variant="body2" color="text.secondary">
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

      {/* Delete document dialog */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Delete Document?</DialogTitle>
        <DialogContent>
          Are you sure you want to permanently delete this document? This action
          cannot be undone.
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteDocument}
            variant="contained"
            color="error"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
