import React, { useContext, useEffect, useMemo, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Checkbox,
  FormControlLabel,
  IconButton,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { useNavigate } from "react-router-dom";
import { listDocuments, createDocument } from "../services/documents";
import { AuthContext } from "../context/AuthContext";
import { getLibraryColumns, saveLibraryColumns } from "../services/settings";

const SITE_OPTIONS = ["Onsite", "Offsite"];
const STATUS_OPTIONS = ["Available", "CheckedOut"];

// retention filter options
const RETENTION_FILTERS = [
  { value: "all", label: "All retention" },
  { value: "overdue", label: "Overdue" },
  { value: "soon", label: "Due in 30 days" },
  { value: "none", label: "No retention date" },
];

// column definitions (id + label). Visibility/order is stored in settings.
const DEFAULT_COLUMN_DEFS = [
  { id: "id", label: "ID" },
  { id: "title", label: "Title" },
  { id: "site", label: "Site" },
  { id: "location", label: "Location" },
  { id: "owner", label: "File Lead" },
  { id: "holder", label: "Checked-Out By" },
  { id: "status", label: "Status" },
  { id: "retention", label: "Retention" },
];

// === layout offsets (must match Header + LeftNav) ===
const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

// ---- retention status helper (for display) ----
function getRetentionStatus(doc) {
  if (!doc.due_at) {
    return { label: "Not set", color: "text.secondary" };
  }

  const due = new Date(doc.due_at);
  if (Number.isNaN(due.getTime())) {
    return { label: "Invalid date", color: "error.main" };
  }

  const today = new Date();
  // compare by date only
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffMs = due - today;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      label: `Overdue (${Math.abs(diffDays)}d)`,
      color: "error.main",
    };
  }
  if (diffDays <= 30) {
    return {
      label: `Due soon (${diffDays}d)`,
      color: "warning.main",
    };
  }
  return {
    label: `Due in ${diffDays}d`,
    color: "success.main",
  };
}

// ---- retention bucket helper (for filtering) ----
function getRetentionBucket(doc) {
  if (!doc.due_at) return "none";

  const due = new Date(doc.due_at);
  if (Number.isNaN(due.getTime())) return "none";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffMs = due - today;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "overdue";
  if (diffDays <= 30) return "soon";
  return "future";
}

// merge backend columns with defaults (preserve order, labels)
function mergeColumnConfig(configColumns) {
  const fallback = DEFAULT_COLUMN_DEFS.map((c) => ({ ...c, visible: true }));

  if (!Array.isArray(configColumns) || configColumns.length === 0) {
    return fallback;
  }

  const byId = new Map(DEFAULT_COLUMN_DEFS.map((c) => [c.id, c]));
  const out = [];

  for (const col of configColumns) {
    const base = byId.get(col.id);
    if (!base) continue;
    out.push({
      ...base,
      visible: typeof col.visible === "boolean" ? col.visible : true,
    });
    byId.delete(col.id);
  }

  // append any default columns not present
  for (const remaining of byId.values()) {
    out.push({ ...remaining, visible: true });
  }

  return out;
}

export default function Library() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);
  const roles = user?.roles || [];
  const isSuperAdmin = roles.includes("SuperAdmin");

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // search + filters
  const [q, setQ] = useState("");
  const [retentionFilter, setRetentionFilter] = useState("all");

  // New File dialog
  const [open, setOpen] = useState(false);
  const [nfTitle, setNfTitle] = useState("");
  const [nfSite, setNfSite] = useState("Onsite");
  const [nfLocation, setNfLocation] = useState("");
  const [nfStatus, setNfStatus] = useState("Available");
  const [saving, setSaving] = useState(false);

  // Column settings state
  const [columns, setColumns] = useState(
    DEFAULT_COLUMN_DEFS.map((c) => ({ ...c, visible: true }))
  );
  const [columnsDialogOpen, setColumnsDialogOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState([]);
  const [savingColumns, setSavingColumns] = useState(false);
  const [columnsError, setColumnsError] = useState("");

  const fetchDocs = async () => {
    setErr("");
    setLoading(true);
    try {
      const data = await listDocuments();
      setDocs(data || []);
    } catch (e) {
      console.error("GET /documents failed:", e);
      setErr(e?.response?.data?.message || "Failed to fetch documents.");
    } finally {
      setLoading(false);
    }
  };

  const loadColumns = async () => {
    try {
      const data = await getLibraryColumns();
      const merged = mergeColumnConfig(data?.columns);
      setColumns(merged);
    } catch (e) {
      console.error("GET /settings/library-columns failed:", e);
      // keep defaults; no user-facing error needed
    }
  };

  useEffect(() => {
    fetchDocs();
    loadColumns();
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return docs.filter((d) => {
      // title search
      if (needle && !(d.title || "").toLowerCase().includes(needle)) {
        return false;
      }

      // retention filter
      const bucket = getRetentionBucket(d);
      if (retentionFilter === "all") return true;
      if (retentionFilter === "overdue") return bucket === "overdue";
      if (retentionFilter === "soon") return bucket === "soon";
      if (retentionFilter === "none") return bucket === "none";

      return true;
    });
  }, [docs, q, retentionFilter]);

  const onCreate = async (e) => {
    e?.preventDefault?.();
    setErr("");

    if (!nfTitle.trim()) {
      setErr("Title is required.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: nfTitle.trim(),
        site: nfSite,
        location: nfLocation.trim() || null,
        status: nfStatus,
      };
      const created = await createDocument(payload);
      setDocs((prev) => [created, ...prev]);

      setOpen(false);
      setNfTitle("");
      setNfSite("Onsite");
      setNfLocation("");
      setNfStatus("Available");
    } catch (e2) {
      console.error("POST /documents failed:", e2);
      setErr(e2?.response?.data?.message || "Failed to create document.");
    } finally {
      setSaving(false);
    }
  };

  // ---- column dialog handlers ----
  const handleOpenColumnsDialog = () => {
    setColumnsError("");
    setDraftColumns(columns.map((c) => ({ ...c })));
    setColumnsDialogOpen(true);
  };

  const handleCloseColumnsDialog = () => {
    setColumnsDialogOpen(false);
  };

  const handleToggleColumnVisible = (id) => {
    setDraftColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
    );
  };

  const moveColumn = (id, direction) => {
    setDraftColumns((prev) => {
      const index = prev.findIndex((c) => c.id === id);
      if (index === -1) return prev;
      const swapWith = direction === "up" ? index - 1 : index + 1;
      if (swapWith < 0 || swapWith >= prev.length) return prev;

      const next = [...prev];
      const temp = next[index];
      next[index] = next[swapWith];
      next[swapWith] = temp;
      return next;
    });
  };

  const handleSaveColumns = async () => {
    if (!draftColumns.some((c) => c.visible)) {
      setColumnsError("At least one column must be visible.");
      return;
    }

    setSavingColumns(true);
    setColumnsError("");
    try {
      const { columns: saved } = await saveLibraryColumns(draftColumns);
      const merged = mergeColumnConfig(saved);
      setColumns(merged);
      setColumnsDialogOpen(false);
    } catch (e) {
      console.error("PUT /settings/library-columns failed:", e);
      setColumnsError(
        e?.response?.data?.message || "Failed to save column settings."
      );
    } finally {
      setSavingColumns(false);
    }
  };

  const visibleColumns = columns.filter((c) => c.visible);

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
      {/* Header row */}
      <Box
        sx={{
          mb: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
        }}
      >
        <Typography variant="h5">Document Library</Typography>

        <Stack direction="row" spacing={1} alignItems="center">
          <TextField
            size="small"
            placeholder="Search by title..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="retention-filter-label">Retention</InputLabel>
            <Select
              labelId="retention-filter-label"
              label="Retention"
              value={retentionFilter}
              onChange={(e) => setRetentionFilter(e.target.value)}
            >
              {RETENTION_FILTERS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {isSuperAdmin && (
            <Button variant="outlined" onClick={handleOpenColumnsDialog}>
              Customize Columns
            </Button>
          )}

          <Button variant="contained" onClick={() => setOpen(true)}>
            New File
          </Button>
        </Stack>
      </Box>

      {err && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {err}
        </Alert>
      )}

      <Paper>
        <Table>
          <TableHead>
            <TableRow>
              {visibleColumns.map((col) => (
                <TableCell key={col.id}>{col.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length}>
                  Loading…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length}>
                  No documents found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((d) => {
                const retention = getRetentionStatus(d);
                const fileLeadDisplay =
                  d.owner_name || d.owner_email || "—";
                const holderDisplay =
                  d.holder_name || d.holder_email || "—";

                return (
                  <TableRow
                    key={d.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/documents/${d.id}`)}
                  >
                    {visibleColumns.map((col) => {
                      switch (col.id) {
                        case "id":
                          return <TableCell key="id">{d.id}</TableCell>;
                        case "title":
                          return <TableCell key="title">{d.title}</TableCell>;
                        case "site":
                          return <TableCell key="site">{d.site}</TableCell>;
                        case "location":
                          return (
                            <TableCell key="location">
                              {d.location || "-"}
                            </TableCell>
                          );
                        case "owner":
                          return (
                            <TableCell key="owner">
                              {fileLeadDisplay}
                            </TableCell>
                          );
                        case "holder":
                          return (
                            <TableCell key="holder">
                              {holderDisplay}
                            </TableCell>
                          );
                        case "status":
                          return (
                            <TableCell key="status">{d.status}</TableCell>
                          );
                        case "retention":
                          return (
                            <TableCell
                              key="retention"
                              sx={{ color: retention.color }}
                            >
                              {retention.label}
                            </TableCell>
                          );
                        default:
                          return null;
                      }
                    })}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* Column settings dialog */}
      <Dialog
        open={columnsDialogOpen}
        onClose={handleCloseColumnsDialog}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Customize Columns</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          {columnsError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {columnsError}
            </Alert>
          )}

          <Stack spacing={1}>
            {draftColumns.map((col, index) => (
              <Box
                key={col.id}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={col.visible}
                      onChange={() => handleToggleColumnVisible(col.id)}
                    />
                  }
                  label={col.label}
                />
                <Box>
                  <IconButton
                    size="small"
                    onClick={() => moveColumn(col.id, "up")}
                    disabled={index === 0}
                  >
                    <ArrowUpwardIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => moveColumn(col.id, "down")}
                    disabled={index === draftColumns.length - 1}
                  >
                    <ArrowDownwardIcon fontSize="inherit" />
                  </IconButton>
                </Box>
              </Box>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseColumnsDialog}>Cancel</Button>
          <Button
            onClick={handleSaveColumns}
            variant="contained"
            disabled={savingColumns}
          >
            {savingColumns ? "Saving…" : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* New File dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>New File</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              label="Title *"
              value={nfTitle}
              onChange={(e) => setNfTitle(e.target.value)}
              fullWidth
              autoFocus
              required
            />

            <FormControl fullWidth required>
              <InputLabel id="site-label">Site</InputLabel>
              <Select
                labelId="site-label"
                label="Site"
                value={nfSite}
                onChange={(e) => setNfSite(e.target.value)}
              >
                {SITE_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Location"
              value={nfLocation}
              onChange={(e) => setNfLocation(e.target.value)}
              fullWidth
            />

            <FormControl fullWidth required>
              <InputLabel id="status-label">Status</InputLabel>
              <Select
                labelId="status-label"
                label="Status"
                value={nfStatus}
                onChange={(e) => setNfStatus(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={onCreate} variant="contained" disabled={saving}>
            {saving ? "Saving…" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
