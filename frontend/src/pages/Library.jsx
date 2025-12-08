// frontend/src/pages/Library.jsx
import React, { useEffect, useMemo, useState, useContext } from "react";
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
  FormGroup,
  FormControlLabel,
  Checkbox,
  IconButton,
  Menu,
  TableSortLabel,
  TablePagination,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import { useNavigate } from "react-router-dom";
import {
  listDocuments,
  createDocument,
  deleteDocument,
} from "../services/documents";
import { AuthContext } from "../context/AuthContext";
import api from "../api/axiosConfig";

const SITE_OPTIONS = ["Onsite", "Offsite"];
const STATUS_OPTIONS = ["Available", "CheckedOut"];

const RETENTION_FILTERS = [
  { value: "all", label: "All retention" },
  { value: "overdue", label: "Overdue" },
  // label for "soon" will be overridden at render-time using dueSoonDays
  { value: "soon", label: "Due soon" },
  { value: "none", label: "No retention date" },
];

// filter by retention decision (action)
const RETENTION_ACTION_FILTERS = [
  { value: "all", label: "All decisions" },
  { value: "none", label: "No decision recorded" },
  { value: "Destroy", label: "Destroy / Dispose" },
  { value: "Extend", label: "Extend retention" },
  { value: "Archive", label: "Archive / Keep" },
];

// NEW: status filter options for active/destroyed/all
const STATUS_FILTER_OPTIONS = [
  { value: "active", label: "Active Files" },
  { value: "destroyed", label: "Destroyed Files" },
  { value: "all", label: "All Files" },
];

const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

/**
 * Compute retention status string + color.
 * Uses system "due soon" threshold (dueSoonDays).
 */
function getRetentionStatus(doc, dueSoonDays) {
  if (!doc.retention_date) {
    return { label: "Not set", color: "text.secondary" };
  }

  const due = new Date(doc.retention_date);
  if (Number.isNaN(due.getTime())) {
    return { label: "Invalid date", color: "error.main" };
  }

  const today = new Date();
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
  if (diffDays <= dueSoonDays) {
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

/**
 * Bucket used for retention filter.
 */
function getRetentionBucket(doc, dueSoonDays) {
  if (!doc.retention_date) return "none";

  const due = new Date(doc.retention_date);
  if (Number.isNaN(due.getTime())) return "none";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffMs = due - today;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "overdue";
  if (diffDays <= dueSoonDays) return "soon";
  return "future";
}

const DEFAULT_COLUMN_CONFIG = {
  id: { key: "id", label: "ID", visible: true },
  title: { key: "title", label: "Title", visible: true },
  site: { key: "site", label: "Site", visible: true },
  location: { key: "location", label: "Location", visible: true },
  owner: { key: "owner", label: "Owner", visible: true },
  status: { key: "status", label: "Status", visible: true },
  retention: { key: "retention", label: "Retention", visible: true },
};

export default function Library() {
  const navigate = useNavigate();
  const { user } = useContext(AuthContext);

  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [q, setQ] = useState("");
  const [retentionFilter, setRetentionFilter] = useState("all");
  const [retentionActionFilter, setRetentionActionFilter] = useState("all");

  // NEW: status filter (default: active → hides destroyed)
  const [statusFilter, setStatusFilter] = useState("active");

  // System settings driven
  const [dueSoonDays, setDueSoonDays] = useState(30);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  // Table pagination & sorting
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState("id");
  const [sortDir, setSortDir] = useState("asc");

  const [open, setOpen] = useState(false);
  const [nfTitle, setNfTitle] = useState("");
  const [nfSite, setNfSite] = useState("Onsite");
  const [nfLocation, setNfLocation] = useState("");
  const [nfStatus, setNfStatus] = useState("Available");
  const [saving, setSaving] = useState(false);

  const [openCustomize, setOpenCustomize] = useState(false);
  const [columnConfig, setColumnConfig] = useState(DEFAULT_COLUMN_CONFIG);

  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuDocId, setMenuDocId] = useState(null);

  const canManage =
    user?.roles?.includes("Admin") ||
    user?.roles?.includes("Manager") ||
    user?.roles?.includes("Clerk") ||
    user?.roles?.includes("SuperAdmin");

  // Load persisted column config
  useEffect(() => {
    try {
      const raw = localStorage.getItem("libraryColumnConfig");
      if (raw) {
        const parsed = JSON.parse(raw);
        setColumnConfig((prev) => ({
          ...prev,
          ...parsed,
        }));
      }
    } catch {
      // ignore
    }
  }, []);

  const persistColumnConfig = (next) => {
    setColumnConfig(next);
    try {
      localStorage.setItem("libraryColumnConfig", JSON.stringify(next));
    } catch {
      // ignore
    }
  };

  // Load system settings (due soon + page size)
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await api.get("/settings/system");
        const days = Number(res?.data?.due_soon_days);
        if (Number.isFinite(days) && days > 0) {
          setDueSoonDays(days);
        }
        const size = Number(res?.data?.library_page_size);
        if (Number.isFinite(size) && size > 0) {
          setRowsPerPage(size);
          setPage(0);
        }
      } catch (e) {
        console.warn("Failed to load system settings for library", e?.message);
      }
    }
    loadSettings();
  }, []);

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

  useEffect(() => {
    fetchDocs();
  }, []);

  // Reset to first page when filters/search change
  useEffect(() => {
    setPage(0);
  }, [q, retentionFilter, retentionActionFilter, statusFilter]);

  // --- filtering ---
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();

    return docs.filter((d) => {
      // NEW: status filter logic
      if (statusFilter === "active" && d.status === "Destroyed") {
        return false;
      }
      if (statusFilter === "destroyed" && d.status !== "Destroyed") {
        return false;
      }

      if (needle) {
        const title = (d.title || "").toLowerCase();
        if (!title.includes(needle)) {
          return false;
        }
      }

      // retention-date bucket filter
      const bucket = getRetentionBucket(d, dueSoonDays);
      if (retentionFilter === "overdue" && bucket !== "overdue") return false;
      if (retentionFilter === "soon" && bucket !== "soon") return false;
      if (retentionFilter === "none" && bucket !== "none") return false;

      // retention decision filter
      const action = d.retention_action || null;
      if (retentionActionFilter === "none" && action) return false;
      if (
        retentionActionFilter !== "all" &&
        retentionActionFilter !== "none" &&
        action !== retentionActionFilter
      ) {
        return false;
      }

      return true;
    });
  }, [docs, q, retentionFilter, retentionActionFilter, statusFilter, dueSoonDays]);

  // --- sorting ---
  const sorted = useMemo(() => {
    const items = [...filtered];

    const getSortValue = (d, field) => {
      switch (field) {
        case "id":
          return d.id ?? 0;
        case "title":
          return (d.title || "").toLowerCase();
        case "site":
          return d.site || "";
        case "location":
          return d.location || "";
        case "owner":
          return (d.owner_name || d.owner_email || "").toLowerCase();
        case "status":
          return d.status || "";
        case "retention":
          if (!d.retention_date) return Number.POSITIVE_INFINITY;
          const t = new Date(d.retention_date).getTime();
          return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
        default:
          return "";
      }
    };

    items.sort((a, b) => {
      const va = getSortValue(a, sortField);
      const vb = getSortValue(b, sortField);

      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return items;
  }, [filtered, sortField, sortDir]);

  // --- pagination ---
  const pagedDocs = useMemo(() => {
    const start = page * rowsPerPage;
    return sorted.slice(start, start + rowsPerPage);
  }, [sorted, page, rowsPerPage]);

  // proper toggle: click column → asc, click again → desc
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  };

  const onCreate = async (e) => {
    e?.preventDefault?.();
    setErr("");

    if (!nfTitle.trim()) {
      setErr("Title is required.");
      return;
    }
    if (!SITE_OPTIONS.includes(nfSite)) {
      setErr("Site must be Onsite or Offsite.");
      return;
    }
    if (!STATUS_OPTIONS.includes(nfStatus)) {
      setErr("Status must be Available or CheckedOut.");
      return;
    }

    try {
      setSaving(true);
      await createDocument({
        title: nfTitle.trim(),
        site: nfSite,
        location: nfLocation.trim() || undefined,
        status: nfStatus,
      });
      setOpen(false);
      setNfTitle("");
      setNfLocation("");
      setNfSite("Onsite");
      setNfStatus("Available");
      await fetchDocs();
    } catch (e) {
      console.error("POST /documents failed:", e);
      setErr(e?.response?.data?.message || "Failed to save document.");
    } finally {
      setSaving(false);
    }
  };

  const orderedColumns = [
    columnConfig.id,
    columnConfig.title,
    columnConfig.site,
    columnConfig.location,
    columnConfig.owner,
    columnConfig.status,
    columnConfig.retention,
  ];

  const visibleColumnCount =
    orderedColumns.filter((c) => c.visible).length + (canManage ? 1 : 0);

  const handleOpenMenu = (event, docId) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setMenuDocId(docId);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
    setMenuDocId(null);
  };

  const handleDeleteDocument = async () => {
    if (!menuDocId) return;
    try {
      await deleteDocument(menuDocId);
      await fetchDocs();
    } catch (e) {
      console.error("DELETE /documents failed:", e);
      setErr(e?.response?.data?.message || "Failed to delete document.");
    } finally {
      handleCloseMenu();
    }
  };

  // Label for "Due soon" option based on system setting
  const dueSoonLabel = `Due in ${dueSoonDays} days`;

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
      <Box
        sx={{
          mb: 2,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 2,
          flexWrap: "wrap",
        }}
      >
        <Typography variant="h5">Document Library</Typography>

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            placeholder="Search by title…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />

          {/* NEW: status filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="status-filter-label">Status</InputLabel>
            <Select
              labelId="status-filter-label"
              label="Status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              {STATUS_FILTER_OPTIONS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

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
                  {opt.value === "soon" ? dueSoonLabel : opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* retention decision filter */}
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="retention-action-filter-label">
              Decision
            </InputLabel>
            <Select
              labelId="retention-action-filter-label"
              label="Decision"
              value={retentionActionFilter}
              onChange={(e) => setRetentionActionFilter(e.target.value)}
            >
              {RETENTION_ACTION_FILTERS.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Button variant="outlined" onClick={() => setOpenCustomize(true)}>
            Customize columns
          </Button>

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
              {orderedColumns
                .filter((col) => col.visible)
                .map((col) => (
                  <TableCell
                    key={col.key}
                    sortDirection={sortField === col.key ? sortDir : false}
                  >
                    <TableSortLabel
                      active={sortField === col.key}
                      direction={sortField === col.key ? sortDir : "asc"}
                      onClick={() => handleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              {canManage && <TableCell />}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount}>
                  Loading…
                </TableCell>
              </TableRow>
            ) : pagedDocs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumnCount}>
                  No documents found.
                </TableCell>
              </TableRow>
            ) : (
              pagedDocs.map((d) => {
                const retention = getRetentionStatus(d, dueSoonDays);
                const ownerDisplay = d.owner_name || d.owner_email || "—";

                return (
                  <TableRow
                    key={d.id}
                    hover
                    sx={{ cursor: "pointer" }}
                    onClick={() => navigate(`/documents/${d.id}`)}
                  >
                    {orderedColumns
                      .filter((col) => col.visible)
                      .map((col) => {
                        switch (col.key) {
                          case "id":
                            return <TableCell key="id">{d.id}</TableCell>;
                          case "title":
                            return (
                              <TableCell key="title">{d.title}</TableCell>
                            );
                          case "site":
                            return (
                              <TableCell key="site">{d.site}</TableCell>
                            );
                          case "location":
                            return (
                              <TableCell key="location">
                                {d.location || "-"}
                              </TableCell>
                            );
                          case "owner":
                            return (
                              <TableCell key="owner">
                                {ownerDisplay}
                              </TableCell>
                            );
                          case "status":
                            return (
                              <TableCell key="status">
                                {d.status}
                              </TableCell>
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
                    {canManage && (
                      <TableCell key="actions" align="right">
                        <IconButton
                          size="small"
                          onClick={(e) => handleOpenMenu(e, d.id)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* pagination bar */}
        <TablePagination
          component="div"
          count={sorted.length}
          page={page}
          onPageChange={(_e, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            const value = parseInt(e.target.value, 10) || 10;
            setRowsPerPage(value);
            setPage(0);
          }}
          rowsPerPageOptions={[5, 10, 25, 50, 100]}
        />
      </Paper>

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

      {/* Customize columns dialog */}
      <Dialog
        open={openCustomize}
        onClose={() => setOpenCustomize(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Customize Columns</DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Show or hide columns and optionally rename the labels. These
            settings are saved in your browser only.
          </Typography>

          <FormGroup>
            {orderedColumns.map((col) => (
              <Box
                key={col.key}
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 2,
                  mb: 1.5,
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={columnConfig[col.key].visible}
                      onChange={(e) => {
                        const next = {
                          ...columnConfig,
                          [col.key]: {
                            ...columnConfig[col.key],
                            visible: e.target.checked,
                          },
                        };
                        persistColumnConfig(next);
                      }}
                    />
                  }
                  label="Visible"
                />
                <TextField
                  size="small"
                  label="Column label"
                  value={columnConfig[col.key].label}
                  onChange={(e) => {
                    const next = {
                      ...columnConfig,
                      [col.key]: {
                        ...columnConfig[col.key],
                        label: e.target.value,
                      },
                    };
                    persistColumnConfig(next);
                  }}
                />
              </Box>
            ))}
          </FormGroup>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenCustomize(false)}>Close</Button>
          <Button
            onClick={() => {
              persistColumnConfig(DEFAULT_COLUMN_CONFIG);
            }}
          >
            Reset to defaults
          </Button>
        </DialogActions>
      </Dialog>

      {/* Actions menu for each document */}
      <Menu
        anchorEl={menuAnchorEl}
        open={Boolean(menuAnchorEl)}
        onClose={handleCloseMenu}
      >
        <MenuItem
          onClick={() => {
            if (menuDocId) navigate(`/documents/${menuDocId}`);
            handleCloseMenu();
          }}
        >
          View
        </MenuItem>
        {canManage && (
          <MenuItem onClick={handleDeleteDocument} sx={{ color: "error.main" }}>
            Delete
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
