import React, { useEffect, useState } from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Chip,
  CircularProgress,
  Alert,
  Divider,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  IconButton,
  Menu,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import api from "../api/axiosConfig";

const ROLE_OPTIONS = ["SuperAdmin", "Admin", "Manager", "Clerk"];

const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

// Friendly labels for activity JSON fields
const ACTIVITY_FIELD_LABELS = {
  email: "Email",
  full_name: "Full Name",
  role: "Role",
  request_id: "Request ID",
  status: "Status",
  note: "Note",
  new_role: "New Role",
  old_role: "Old Role",
  new_roles: "New Roles",
  old_roles: "Old Roles",
  new_email: "New Email",
  old_email: "Old Email",
  new_full_name: "New Name",
  old_full_name: "Old Name",
  new_is_active: "New Status",
  old_is_active: "Old Status",
};

function formatBooleanField(key, value) {
  if (key === "new_is_active" || key === "old_is_active") {
    return value ? "Active" : "Inactive";
  }
  return value;
}


function formatActivityDetails(details) {
  if (!details) return "";

  // If backend already sent a structured object
  let obj = details;
  if (typeof details === "string") {
    try {
      obj = JSON.parse(details);
    } catch {
      // Not JSON – just return as is
      return details;
    }
  }

  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    return String(details);
  }

  const lines = [];

  for (const [key, rawVal] of Object.entries(obj)) {
    // Skip completely empty values
    if (
      rawVal === null ||
      rawVal === undefined ||
      rawVal === "" ||
      (Array.isArray(rawVal) && rawVal.length === 0)
    ) {
      continue;
    }

    const label = ACTIVITY_FIELD_LABELS[key] || key;

    let value = formatBooleanField(key, rawVal);

    if (Array.isArray(value)) {
      value = value.join(", ");
    } else if (typeof value === "object") {
      value = JSON.stringify(value);
    }

    lines.push(`${label}: ${value}`);
  }

  return lines.join("\n");
}

/* simple confirm dialog hook */
function useConfirm() {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState({ title: "", message: "" });
  const [onConfirm, setOnConfirm] = useState(() => () => {});

  const ask = ({ title, message, onYes }) => {
    setContent({ title, message });
    setOnConfirm(() => onYes);
    setOpen(true);
  };
  const yes = () => {
    setOpen(false);
    onConfirm?.();
  };
  const no = () => setOpen(false);

  const dialog = (
    <Dialog open={open} onClose={no}>
      <DialogTitle>{content.title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{content.message}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={no}>Cancel</Button>
        <Button onClick={yes} variant="contained" color="error">
          Continue
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { ask, dialog };
}

/* reset password dialog */
function useResetPassword() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(null);
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const openFor = (user) => {
    setTarget(user);
    setPwd("");
    setConfirm("");
    setErr("");
    setOpen(true);
  };
  const close = () => setOpen(false);

  const dialog = (
    <Dialog open={open} onClose={busy ? undefined : close}>
      <DialogTitle>Reset Password</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <DialogContentText>
          Set a new temporary password for <strong>{target?.email}</strong>.
        </DialogContentText>
        {err && <Alert severity="error">{err}</Alert>}
        <TextField
          label="New password"
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          autoFocus
        />
        <TextField
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <DialogContentText variant="caption" sx={{ color: "text.secondary" }}>
          • At least 8 characters.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={close} disabled={busy}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            setErr("");
            if (!pwd || pwd.length < 8)
              return setErr("Password must be at least 8 characters.");
            if (pwd !== confirm) return setErr("Passwords do not match.");
            try {
              setBusy(true);
              await api.post(`/admin/users/${target.id}/reset-password`, {
                new_password: pwd,
              });
              close();
              alert("Password reset successfully.");
            } catch (e) {
              setErr(
                e?.response?.data?.message ||
                  e?.response?.data?.error ||
                  "Failed to reset password"
              );
            } finally {
              setBusy(false);
            }
          }}
          variant="contained"
          disabled={busy}
        >
          Reset
        </Button>
      </DialogActions>
    </Dialog>
  );

  return { openFor, dialog };
}

export default function AdminUsers() {
  // users
  const [users, setUsers] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [fetchErr, setFetchErr] = useState("");

  // access requests
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsErr, setRequestsErr] = useState("");
  const [busyRequestId, setBusyRequestId] = useState(null);

  // user activity history
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityErr, setActivityErr] = useState("");

  // create user modal
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    roleName: "Clerk",
  });
  const [creating, setCreating] = useState(false);
  const [createErr, setCreateErr] = useState("");

  // edit user modal
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    roleName: "Clerk",
  });
  const [editErr, setEditErr] = useState("");
  const [editing, setEditing] = useState(false);

  // generic busy id for user row actions
  const [busyUserId, setBusyUserId] = useState(null);

  // history dialog
  const [historyOpen, setHistoryOpen] = useState(false);

  // kebab menu
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuUser, setMenuUser] = useState(null);

  // system settings
  const [settings, setSettings] = useState({
    default_retention_years: 10,
    due_soon_days: 30,
    default_access_request_role: "Clerk",
    library_page_size: 50,
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsErr, setSettingsErr] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);

  const { ask, dialog } = useConfirm();
  const resetPwd = useResetPassword();

  // --- data loaders ---

  async function loadUsers() {
    setFetching(true);
    setFetchErr("");
    try {
      const { data } = await api.get("/admin/users");
      setUsers(data || []);
    } catch (e) {
      setFetchErr(e?.response?.data?.message || "Failed to fetch users");
    } finally {
      setFetching(false);
    }
  }

  async function loadRequests() {
    setRequestsLoading(true);
    setRequestsErr("");
    try {
      const { data } = await api.get("/admin/access-requests");
      setRequests(data || []);
    } catch (e) {
      setRequestsErr(
        e?.response?.data?.message || "Failed to fetch access requests"
      );
    } finally {
      setRequestsLoading(false);
    }
  }

  async function loadActivity() {
    setActivityLoading(true);
    setActivityErr("");
    try {
      const { data } = await api.get("/admin/user-activity");
      setActivity(data || []);
    } catch (e) {
      setActivityErr(
        e?.response?.data?.message || "Failed to fetch user activity"
      );
    } finally {
      setActivityLoading(false);
    }
  }

  async function loadSettings() {
    setSettingsLoading(true);
    setSettingsErr("");
    try {
      const { data } = await api.get("/settings/system");
      setSettings({
        default_retention_years: data?.default_retention_years ?? 10,
        due_soon_days: data?.due_soon_days ?? 30,
        default_access_request_role:
          data?.default_access_request_role ?? "Clerk",
        library_page_size: data?.library_page_size ?? 50,
      });
    } catch (e) {
      setSettingsErr(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Failed to load system settings"
      );
    } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => {
    loadUsers();
    loadRequests();
    loadActivity();
    loadSettings();
  }, []);

  // --- create user ---

  function resetCreateForm() {
    setForm({
      email: "",
      firstName: "",
      lastName: "",
      password: "",
      roleName: "Clerk",
    });
    setCreateErr("");
  }

  async function handleCreateSubmit() {
    setCreateErr("");

    if (!form.email || !form.password) {
      setCreateErr("Email and temporary password are required.");
      return;
    }

    const full_name = [form.firstName, form.lastName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");

    setCreating(true);
    try {
      await api.post("/admin/users", {
        email: form.email,
        full_name: full_name || null,
        password: form.password,
        roleName: form.roleName,
      });

      resetCreateForm();
      setCreateOpen(false);
      await loadUsers();
      await loadActivity();
    } catch (e) {
      setCreateErr(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Create failed"
      );
    } finally {
      setCreating(false);
    }
  }

  // --- edit user ---

  function openEditDialog(user) {
    const fullName = user.full_name || "";
    const [firstName, ...rest] = fullName.split(" ");
    const lastName = rest.join(" ");

    const currentRole = (user.roles && user.roles[0]) || user.role || "Clerk";

    setEditUser(user);
    setEditForm({
      email: user.email || "",
      firstName: firstName || "",
      lastName: lastName || "",
      roleName: currentRole,
    });
    setEditErr("");
    setEditOpen(true);
  }

  function closeEdit() {
    setEditOpen(false);
    setEditUser(null);
  }

  async function handleEditSubmit() {
    if (!editUser) return;

    setEditErr("");
    if (!editForm.email) {
      setEditErr("Email is required.");
      return;
    }

    const full_name = [editForm.firstName, editForm.lastName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ");

    setEditing(true);
    try {
      await api.put(`/admin/users/${editUser.id}`, {
        email: editForm.email,
        full_name: full_name || null,
        roleName: editForm.roleName,
      });

      closeEdit();
      await loadUsers();
      await loadActivity();
    } catch (e) {
      setEditErr(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Failed to update user"
      );
    } finally {
      setEditing(false);
    }
  }

  // --- status and deletion ---

  function updateActive(user, isActive) {
    setBusyUserId(user.id);
    return api
      .patch(`/admin/users/${user.id}/status`, { is_active: isActive })
      .then(async () => {
        await loadUsers();
        await loadActivity();
      })
      .catch((e) => {
        alert(
          e?.response?.data?.message ||
            e?.response?.data?.error ||
            "Failed to update status"
        );
      })
      .finally(() => setBusyUserId(null));
  }

  async function toggleActive(user) {
    if (user.is_active && (user.roles || []).includes("SuperAdmin")) {
      alert("You cannot deactivate a SuperAdmin account.");
      return;
    }
    if (user.is_active && (user.roles || []).includes("Admin")) {
      ask({
        title: "Deactivate Admin account?",
        message:
          "You are deactivating a user who currently has the Admin role. Ensure at least one active Admin or SuperAdmin remains.",
        onYes: () => updateActive(user, false),
      });
      return;
    }
    updateActive(user, !user.is_active);
  }

  function removeUser(user) {
    if ((user.roles || []).includes("SuperAdmin")) {
      alert("You cannot delete a SuperAdmin account.");
      return;
    }
    setBusyUserId(user.id);
    return api
      .delete(`/admin/users/${user.id}`)
      .then(async () => {
        await loadUsers();
        await loadActivity();
      })
      .catch((e) => {
        alert(
          e?.response?.data?.message ||
            e?.response?.data?.error ||
            "Failed to delete user"
        );
      })
      .finally(() => setBusyUserId(null));
  }

  // --- access requests approve/deny ---

  async function setRequestStatus(id, status) {
    setBusyRequestId(id);
    try {
      await api.patch(`/admin/access-requests/${id}`, { status });
      await loadRequests();
      await loadUsers();
      await loadActivity();
    } catch (e) {
      alert(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Failed to update request"
      );
    } finally {
      setBusyRequestId(null);
    }
  }

  // --- system settings save ---

  async function handleSaveSettings() {
    setSavingSettings(true);
    setSettingsErr("");
    try {
      await api.put("/settings/system", settings);
    } catch (e) {
      setSettingsErr(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Failed to save system settings"
      );
    } finally {
      setSavingSettings(false);
    }
  }

  // --- computed subsets ---

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const hasHistory = requests.length > 0 || activity.length > 0;

  // --- kebab menu handlers ---

  const openMenu = (event, user) => {
    setMenuAnchor(event.currentTarget);
    setMenuUser(user);
  };

  const closeMenu = () => {
    setMenuAnchor(null);
    setMenuUser(null);
  };

  const handleMenuEdit = () => {
    if (menuUser) openEditDialog(menuUser);
    closeMenu();
  };

  const handleMenuResetPassword = () => {
    if (menuUser) resetPwd.openFor(menuUser);
    closeMenu();
  };

  const handleMenuToggleActive = () => {
    if (menuUser) toggleActive(menuUser);
    closeMenu();
  };

  const handleMenuDelete = () => {
    if (menuUser) {
      const hasAdmin = (menuUser.roles || []).includes("Admin");
      const hasSuperAdmin = (menuUser.roles || []).includes("SuperAdmin");
      ask({
        title: "Delete user?",
        message: hasSuperAdmin
          ? "You cannot delete a SuperAdmin account."
          : hasAdmin
          ? "This user currently has the Admin role. Deleting may remove critical access. Continue?"
          : "This will permanently delete the user. Continue?",
        onYes: () => {
          if (!hasSuperAdmin) removeUser(menuUser);
        },
      });
    }
    closeMenu();
  };

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
      {dialog}
      {resetPwd.dialog}

      {/* Create User dialog */}
      <Dialog
        open={createOpen}
        onClose={creating ? undefined : () => setCreateOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Create User</DialogTitle>
        <DialogContent>
          {createErr && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {createErr}
            </Alert>
          )}
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label="Email"
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              fullWidth
            />
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                label="First name"
                value={form.firstName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, firstName: e.target.value }))
                }
                fullWidth
              />
              <TextField
                label="Last name"
                value={form.lastName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, lastName: e.target.value }))
                }
                fullWidth
              />
            </Box>
            <TextField
              label="Temporary password"
              value={form.password}
              onChange={(e) =>
                setForm((f) => ({ ...f, password: e.target.value }))
              }
              fullWidth
            />
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Role
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {ROLE_OPTIONS.map((r) => (
                  <Chip
                    key={r}
                    label={r}
                    color={form.roleName === r ? "primary" : "default"}
                    onClick={() =>
                      setForm((f) => ({ ...f, roleName: r }))
                    }
                    variant={
                      form.roleName === r ? "filled" : "outlined"
                    }
                    size="small"
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              setCreateOpen(false);
              resetCreateForm();
            }}
            disabled={creating}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleCreateSubmit}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit User dialog */}
      <Dialog
        open={editOpen}
        onClose={editing ? undefined : closeEdit}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit User</DialogTitle>
        <DialogContent>
          {editErr && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editErr}
            </Alert>
          )}
          <Stack spacing={1.5} sx={{ mt: 1 }}>
            <TextField
              label="Email"
              value={editForm.email}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, email: e.target.value }))
              }
              fullWidth
            />
            <Box sx={{ display: "flex", gap: 1 }}>
              <TextField
                label="First name"
                value={editForm.firstName}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    firstName: e.target.value,
                  }))
                }
                fullWidth
              />
              <TextField
                label="Last name"
                value={editForm.lastName}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    lastName: e.target.value,
                  }))
                }
                fullWidth
              />
            </Box>
            <Box>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                Role
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {ROLE_OPTIONS.map((r) => (
                  <Chip
                    key={r}
                    label={r}
                    color={editForm.roleName === r ? "primary" : "default"}
                    onClick={() =>
                      setEditForm((f) => ({ ...f, roleName: r }))
                    }
                    variant={
                      editForm.roleName === r ? "filled" : "outlined"
                    }
                    size="small"
                  />
                ))}
              </Stack>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit} disabled={editing}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleEditSubmit}
            disabled={editing}
          >
            {editing ? "Saving..." : "Save changes"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Kebab menu for each user row */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={closeMenu}
      >
        <MenuItem onClick={handleMenuEdit}>Edit user</MenuItem>
        <MenuItem onClick={handleMenuResetPassword}>
          Reset password
        </MenuItem>
        <MenuItem onClick={handleMenuToggleActive}>
          {menuUser?.is_active ? "Deactivate" : "Activate"}
        </MenuItem>
        <MenuItem onClick={handleMenuDelete}>Delete</MenuItem>
      </Menu>

      {/* Header with Create User + View History */}
      <Box
        sx={{
          mb: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 2,
        }}
      >
        <Typography variant="h5">Admin • Users</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setHistoryOpen(true)}
            disabled={!hasHistory || (requestsLoading && activityLoading)}
          >
            View History
          </Button>
          <Button
            variant="contained"
            size="small"
            onClick={() => setCreateOpen(true)}
          >
            Create User
          </Button>
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      {/* Users list */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          All Users
        </Typography>

        {fetchErr && <Alert severity="error">{fetchErr}</Alert>}

        {fetching ? (
          <Box sx={{ p: 3, display: "flex", justifyContent: "center" }}>
            <CircularProgress />
          </Box>
        ) : users.length === 0 ? (
          <Box sx={{ p: 2, color: "text.secondary" }}>No users found.</Box>
        ) : (
          <>
            {/* Column headers */}
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: {
                  xs: "1fr auto",
                  sm: "250px 150px 150px 120px 100px auto",
                },
                gap: 1,
                mb: 1,
                px: 0.5,
              }}
            >
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: "text.secondary" }}
              >
                Email
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: "text.secondary" }}
              >
                First Name
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: "text.secondary" }}
              >
                Last Name
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: "text.secondary",
                  textAlign: "center", // centered role header
                }}
              >
                Role
              </Typography>
              <Typography
                variant="caption"
                sx={{ fontWeight: 600, color: "text.secondary" }}
              >
                Status
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  color: "text.secondary",
                  textAlign: "right",
                }}
              >
                Actions
              </Typography>
            </Box>

            <Stack spacing={1.5}>
              {users.map((u) => {
                const fullName = u.full_name || "";
                const [firstName, ...rest] = fullName.split(" ");
                const lastName = rest.join(" ");

                const primaryRole =
                  (u.roles && u.roles[0]) || u.role || "Clerk";

                return (
                  <Paper key={u.id} sx={{ p: 1.5 }}>
                    <Box
                      sx={{
                        display: "grid",
                        gridTemplateColumns: {
                          xs: "1fr auto",
                          sm: "250px 150px 150px 120px 100px auto",
                        },
                        gap: 1,
                        alignItems: "center",
                      }}
                    >
                      {/* Email */}
                      <Typography>
                        <strong>{u.email}</strong>
                      </Typography>

                      {/* First Name */}
                      <Typography>{firstName || "—"}</Typography>

                      {/* Last Name */}
                      <Typography>{lastName || "—"}</Typography>

                      {/* Role */}
                      <Box
                        sx={{
                          display: "flex",
                          justifyContent: "center", // centered role chip
                        }}
                      >
                        <Chip label={primaryRole} size="small" />
                      </Box>

                      {/* Status */}
                      <Typography
                        variant="body2"
                        color={u.is_active ? "success.main" : "error.main"}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </Typography>

                      {/* 3-dot menu */}
                      <Box sx={{ textAlign: "right" }}>
                        <IconButton
                          onClick={(e) => openMenu(e, u)}
                          disabled={busyUserId === u.id}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </Box>
                    </Box>
                  </Paper>
                );
              })}
            </Stack>
          </>
        )}
      </Paper>

      {/* Access Requests (pending only) */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          Access Requests
        </Typography>

        {requestsErr && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {requestsErr}
          </Alert>
        )}

        {requestsLoading ? (
          <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
            <CircularProgress size={24} />
          </Box>
        ) : pendingRequests.length === 0 ? (
          <Box sx={{ p: 2, color: "text.secondary" }}>
            No pending access requests.
          </Box>
        ) : (
          <Stack spacing={1.5}>
            {pendingRequests.map((r) => (
              <Paper key={r.id} sx={{ p: 1.5 }}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 2,
                    flexWrap: "wrap",
                  }}
                >
                  <Box>
                    <Typography>
                      <strong>{r.email}</strong>
                      {r.full_name ? ` — ${r.full_name}` : ""}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Requested:{" "}
                      {r.created_at
                        ? new Date(r.created_at).toLocaleString()
                        : "-"}
                    </Typography>
                    <Box sx={{ mt: 0.5 }}>
                      <Chip label="Pending" size="small" />
                    </Box>
                  </Box>

                  <Stack
                    direction="row"
                    spacing={1}
                    useFlexGap
                    flexWrap="wrap"
                  >
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => setRequestStatus(r.id, "approved")}
                      disabled={busyRequestId === r.id}
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      variant="outlined"
                      onClick={() => setRequestStatus(r.id, "denied")}
                      disabled={busyRequestId === r.id}
                    >
                      Deny
                    </Button>
                  </Stack>
                </Box>
              </Paper>
            ))}
          </Stack>
        )}
      </Paper>

      {/* System Settings */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>
          System Settings
        </Typography>

        {settingsErr && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {settingsErr}
          </Alert>
        )}

        {settingsLoading ? (
          <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack
            spacing={2}
            component="form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveSettings();
            }}
          >
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label="Default retention (years)"
                type="number"
                value={settings.default_retention_years}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    default_retention_years: Number(e.target.value) || 0,
                  }))
                }
                sx={{ minWidth: 220 }}
              />
            </Box>

            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
              <TextField
                label="Due soon threshold (days)"
                type="number"
                value={settings.due_soon_days}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    due_soon_days: Number(e.target.value) || 0,
                  }))
                }
                sx={{ minWidth: 220 }}
              />

              <FormControl sx={{ minWidth: 220 }}>
                <InputLabel id="default-access-role-label">
                  Default access request role
                </InputLabel>
                <Select
                  labelId="default-access-role-label"
                  label="Default access request role"
                  value={settings.default_access_request_role}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      default_access_request_role: e.target.value,
                    }))
                  }
                >
                  <MenuItem value="Clerk">Clerk</MenuItem>
                  <MenuItem value="Admin">Admin</MenuItem>
                </Select>
              </FormControl>

              <TextField
                label="Library page size"
                type="number"
                value={settings.library_page_size}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    library_page_size: Number(e.target.value) || 0,
                  }))
                }
                sx={{ minWidth: 220 }}
              />
            </Box>

            <Box>
              <Button
                type="submit"
                variant="contained"
                disabled={savingSettings}
              >
                {savingSettings ? "Saving…" : "Save Settings"}
              </Button>
            </Box>
          </Stack>
        )}
      </Paper>

      {/* History dialog: access requests + user activity */}
      <Dialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>Admin Activity History</DialogTitle>
        <DialogContent dividers>
          {/* User activity section */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            User Changes
          </Typography>
          {activityLoading ? (
            <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
              <CircularProgress size={20} />
            </Box>
          ) : activityErr ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {activityErr}
            </Alert>
          ) : activity.length === 0 ? (
            <Box sx={{ mb: 2, color: "text.secondary" }}>
              No user changes recorded yet.
            </Box>
          ) : (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {activity.map((a) => (
                <Paper key={a.id} sx={{ p: 1.5 }}>
                  <Typography variant="body2">
                    <strong>{a.action_type}</strong>{" "}
                    {a.actor_email && (
                      <>
                        by <em>{a.actor_email}</em>
                      </>
                    )}
                    {a.target_email && (
                      <>
                        {" "}
                        on <em>{a.target_email}</em>
                      </>
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {a.created_at
                      ? new Date(a.created_at).toLocaleString()
                      : ""}
                  </Typography>
                  {a.details && (
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        mt: 0.5,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {formatActivityDetails(a.details)}
                    </Typography>
                  )}
                </Paper>
              ))}
            </Stack>
          )}

          <Divider sx={{ my: 1.5 }} />

          {/* Access requests section */}
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Access Requests
          </Typography>
          {requestsLoading ? (
            <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
              <CircularProgress size={20} />
            </Box>
          ) : requests.length === 0 ? (
            <Box sx={{ color: "text.secondary" }}>
              No access request history yet.
            </Box>
          ) : (
            <Stack spacing={1.5} sx={{ mt: 1 }}>
              {requests.map((r) => (
                <Paper key={r.id} sx={{ p: 1.5 }}>
                  <Typography>
                    <strong>{r.email}</strong>
                    {r.full_name ? ` — ${r.full_name}` : ""}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Requested:{" "}
                    {r.created_at
                      ? new Date(r.created_at).toLocaleString()
                      : "-"}
                  </Typography>
                  {r.decided_at && (
                    <Typography variant="body2" color="text.secondary">
                      {r.status === "approved" ? "Approved" : "Denied"}{" "}
                      {new Date(r.decided_at).toLocaleString()}
                      {r.decided_by_email
                        ? ` by ${r.decided_by_email}`
                        : ""}
                    </Typography>
                  )}
                  <Box sx={{ mt: 0.5 }}>
                    <Chip
                      label={
                        r.status === "approved"
                          ? "Approved"
                          : r.status === "denied"
                          ? "Denied"
                          : "Pending"
                      }
                      size="small"
                      color={
                        r.status === "approved"
                          ? "success"
                          : r.status === "denied"
                          ? "error"
                          : "default"
                      }
                    />
                  </Box>
                </Paper>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setHistoryOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
