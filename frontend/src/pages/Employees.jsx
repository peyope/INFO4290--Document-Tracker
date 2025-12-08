// frontend/src/pages/Employees.jsx
import React, {
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Menu,
  TableSortLabel,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";

import { AuthContext } from "../context/AuthContext";
import {
  listEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
} from "../services/employees";

const STATUS_OPTIONS = ["Active", "Inactive"];

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  job_title: "",
  department: "",
  location: "",
  status: "Active",
};

export default function Employees() {
  const { user } = useContext(AuthContext);
  const roles = user?.roles || [];

  // Allow SuperAdmin, Admin, Manager, Clerk to manage employees 
  const canManage =
    roles.includes("SuperAdmin") ||
    roles.includes("Admin") ||
    roles.includes("Manager") ||
    roles.includes("Clerk");

  const [employees, setEmployees] = useState([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const [deletingId, setDeletingId] = useState(null);

  // Menu state for 3-dot actions
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);
  const [menuEmployee, setMenuEmployee] = useState(null);
  const menuOpen = Boolean(menuAnchorEl);

  
  // "name", "email", "job_title", "department", "location", "status"
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  // ------------- load employees -------------

  const loadEmployees = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await listEmployees({ includeInactive });
      setEmployees(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load employees", err);
      const msg =
        err?.response?.data?.message || "Failed to load employees.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [includeInactive]);

  // ------------- filtering -------------

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;

    return employees.filter((e) => {
      const fields = [
        e.first_name,
        e.last_name,
        e.full_name,
        e.email,
        e.job_title,
        e.department,
        e.location,
      ]
        .filter(Boolean)
        .map((v) => String(v).toLowerCase());

      return fields.some((v) => v.includes(q));
    });
  }, [employees, search]);

  // ------------- sorting helpers -------------

  const handleSort = (fieldKey) => {
    if (sortField === fieldKey) {
      const nextDirection = sortDirection === "asc" ? "desc" : "asc";
      setSortDirection(nextDirection);
    } else {
      setSortField(fieldKey);
      setSortDirection("asc");
    }
  };

  const compareStrings = (a, b) => {
    const sa = (a ?? "").toString().toLowerCase();
    const sb = (b ?? "").toString().toLowerCase();
    if (sa < sb) return -1;
    if (sa > sb) return 1;
    return 0;
  };

  const sortedEmployees = useMemo(() => {
    const rows = [...filteredEmployees];

    rows.sort((a, b) => {
      let result = 0;

      switch (sortField) {
        case "name": {
          // sort by last_name, then first_name
          const nameA = `${a.last_name || ""} ${a.first_name || ""}`;
          const nameB = `${b.last_name || ""} ${b.first_name || ""}`;
          result = compareStrings(nameA, nameB);
          break;
        }
        case "email":
          result = compareStrings(a.email, b.email);
          break;
        case "job_title":
          result = compareStrings(a.job_title, b.job_title);
          break;
        case "department":
          result = compareStrings(a.department, b.department);
          break;
        case "location":
          result = compareStrings(a.location, b.location);
          break;
        case "status":
          result = compareStrings(a.status, b.status);
          break;
        default:
          result = 0;
      }

      return sortDirection === "asc" ? result : -result;
    });

    return rows;
  }, [filteredEmployees, sortField, sortDirection]);

  // ------------- form helpers -------------

  const openCreateDialog = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (emp) => {
    setEditing(emp);
    setForm({
      first_name: emp.first_name || "",
      last_name: emp.last_name || "",
      email: emp.email || "",
      job_title: emp.job_title || "",
      department: emp.department || "",
      location: emp.location || "",
      status: emp.status || "Active",
    });
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    if (saving) return;
    setDialogOpen(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const handleFormChange = (field) => (event) => {
    setForm((prev) => ({
      ...prev,
      [field]: event.target.value,
    }));
  };

  // ------------- save (create / update) -------------

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError("First name and last name are required.");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      email: form.email.trim() || null,
      job_title: form.job_title.trim() || null,
      department: form.department.trim() || null,
      location: form.location.trim() || null,
      status: form.status || "Active",
    };

    try {
      if (editing) {
        await updateEmployee(editing.id, payload);
      } else {
        await createEmployee(payload);
      }

      await loadEmployees();
      handleDialogClose();
    } catch (err) {
      console.error("Failed to save employee", err);
      const msg =
        err?.response?.data?.message || "Failed to save employee.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ------------- 3-dot menu handlers -------------

  const handleMenuOpen = (event, emp) => {
    setMenuAnchorEl(event.currentTarget);
    setMenuEmployee(emp);
  };

  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuEmployee(null);
  };

  const handleMenuEdit = () => {
    if (menuEmployee) {
      openEditDialog(menuEmployee);
    }
    handleMenuClose();
  };

  const handleMenuDelete = async () => {
    if (!menuEmployee || !canManage) {
      handleMenuClose();
      return;
    }

    const emp = menuEmployee;
    const ok = window.confirm(
      `Permanently delete "${emp.first_name} ${emp.last_name}"?\nThis cannot be undone.`
    );
    if (!ok) {
      handleMenuClose();
      return;
    }

    setDeletingId(emp.id);
    setError("");

    try {
      await deleteEmployee(emp.id); 
      await loadEmployees();
    } catch (err) {
      console.error("Failed to delete employee", err);
      const msg =
        err?.response?.data?.message || "Failed to delete employee.";
      setError(msg);
    } finally {
      setDeletingId(null);
      handleMenuClose();
    }
  };

  // ------------- render -------------

  return (
    <Box
      sx={{
        ml: { xs: 0, md: "240px" }, // leave space for LeftNav
        mt: "72px", // below header
        p: 3,
      }}
    >
      <Paper sx={{ p: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
          justifyContent="space-between"
          alignItems={{ xs: "flex-start", sm: "center" }}
          mb={2}
        >
          <Box>
            <Typography variant="h5" gutterBottom>
              Employee Directory
            </Typography>
            <Typography variant="body2" color="text.secondary">
              These employees <strong>do not log in</strong> to the portal.
              They are used on documents for fields like{" "}
              <em>File Lead</em> and <em>Checked-Out By</em>.
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} alignItems="center">
            <TextField
              size="small"
              label="Search employees"
              placeholder="Name, email, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Checkbox
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              <Typography variant="body2">Include inactive</Typography>
            </Stack>
            {canManage && (
              <Button variant="contained" onClick={openCreateDialog}>
                Add Employee
              </Button>
            )}
          </Stack>
        </Stack>

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            onClose={() => setError("")}
          >
            {error}
          </Alert>
        )}

        {loading ? (
          <Box
            sx={{
              py: 6,
              display: "flex",
              justifyContent: "center",
            }}
          >
            <CircularProgress />
          </Box>
        ) : sortedEmployees.length === 0 ? (
          <Typography color="text.secondary">
            No employees found.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell
                    sortDirection={
                      sortField === "name" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortField === "name"}
                      direction={
                        sortField === "name" ? sortDirection : "asc"
                      }
                      onClick={() => handleSort("name")}
                    >
                      Name
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sortDirection={
                      sortField === "email" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortField === "email"}
                      direction={
                        sortField === "email" ? sortDirection : "asc"
                      }
                      onClick={() => handleSort("email")}
                    >
                      Email
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sortDirection={
                      sortField === "job_title" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortField === "job_title"}
                      direction={
                        sortField === "job_title"
                          ? sortDirection
                          : "asc"
                      }
                      onClick={() => handleSort("job_title")}
                    >
                      Job Title
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sortDirection={
                      sortField === "department" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortField === "department"}
                      direction={
                        sortField === "department"
                          ? sortDirection
                          : "asc"
                      }
                      onClick={() => handleSort("department")}
                    >
                      Department
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sortDirection={
                      sortField === "location" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortField === "location"}
                      direction={
                        sortField === "location"
                          ? sortDirection
                          : "asc"
                      }
                      onClick={() => handleSort("location")}
                    >
                      Location
                    </TableSortLabel>
                  </TableCell>
                  <TableCell
                    sortDirection={
                      sortField === "status" ? sortDirection : false
                    }
                  >
                    <TableSortLabel
                      active={sortField === "status"}
                      direction={
                        sortField === "status" ? sortDirection : "asc"
                      }
                      onClick={() => handleSort("status")}
                    >
                      Status
                    </TableSortLabel>
                  </TableCell>
                  {canManage && (
                    <TableCell align="right">Actions</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {sortedEmployees.map((emp) => (
                  <TableRow key={emp.id} hover>
                    <TableCell>
                      {emp.first_name} {emp.last_name}
                    </TableCell>
                    <TableCell>{emp.email || "—"}</TableCell>
                    <TableCell>{emp.job_title || "—"}</TableCell>
                    <TableCell>{emp.department || "—"}</TableCell>
                    <TableCell>{emp.location || "—"}</TableCell>
                    <TableCell>
                      <Typography
                        variant="body2"
                        color={
                          emp.status === "Active"
                            ? "success.main"
                            : "text.secondary"
                        }
                      >
                        {emp.status}
                      </Typography>
                    </TableCell>
                    {canManage && (
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          onClick={(e) => handleMenuOpen(e, emp)}
                        >
                          <MoreVertIcon />
                        </IconButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* 3-dot row menu */}
      <Menu
        anchorEl={menuAnchorEl}
        open={menuOpen}
        onClose={handleMenuClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
      >
        <MenuItem onClick={handleMenuEdit}>Edit</MenuItem>
        <MenuItem
          onClick={handleMenuDelete}
          disabled={deletingId === menuEmployee?.id}
          sx={{ color: "error.main" }}
        >
          {deletingId === menuEmployee?.id ? "Deleting..." : "Delete"}
        </MenuItem>
      </Menu>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onClose={handleDialogClose} fullWidth>
        <DialogTitle>
          {editing ? "Edit Employee" : "Add Employee"}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2} mt={1}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="First Name"
                value={form.first_name}
                onChange={handleFormChange("first_name")}
                fullWidth
                required
              />
              <TextField
                label="Last Name"
                value={form.last_name}
                onChange={handleFormChange("last_name")}
                fullWidth
                required
              />
            </Stack>

            <TextField
              label="Email"
              type="email"
              value={form.email}
              onChange={handleFormChange("email")}
              fullWidth
            />

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="Job Title"
                value={form.job_title}
                onChange={handleFormChange("job_title")}
                fullWidth
              />
              <TextField
                label="Department"
                value={form.department}
                onChange={handleFormChange("department")}
                fullWidth
              />
            </Stack>

            <TextField
              label="Location"
              value={form.location}
              onChange={handleFormChange("location")}
              fullWidth
            />

            <FormControl fullWidth>
              <InputLabel id="employee-status-label">Status</InputLabel>
              <Select
                labelId="employee-status-label"
                label="Status"
                value={form.status}
                onChange={handleFormChange("status")}
              >
                {STATUS_OPTIONS.map((s) => (
                  <MenuItem key={s} value={s}>
                    {s}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ pr: 3, pb: 2 }}>
          <Button onClick={handleDialogClose} disabled={saving}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
