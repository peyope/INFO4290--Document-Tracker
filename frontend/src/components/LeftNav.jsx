// frontend/src/components/LeftNav.jsx
import React, { useContext } from "react";
import { Box, Button, Stack, Typography } from "@mui/material";
import { NavLink, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

const SIDEBAR_WIDTH = 240;
const HEADER_HEIGHT = 64;

const linkSx = (active) => ({
  justifyContent: "flex-start",
  textTransform: "none",
  fontWeight: active ? 600 : 500,
  borderRadius: 12,
  px: 2,
  py: 1.25,
  width: "100%",
  justifyItems: "flex-start",
});

export default function LeftNav() {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const roles = user?.roles || [];

  const isSuperAdmin = roles.includes("SuperAdmin");
  const isAdmin = roles.includes("Admin");
  const isManager = roles.includes("Manager");
  const isClerk = roles.includes("Clerk");

  // Managers & Clerks → only library,
  // Admins & SuperAdmins → dashboard + admin.
  const canSeeDashboard = isSuperAdmin || isAdmin ||isClerk || isManager;
  const canSeeAdmin = isSuperAdmin || isAdmin;

  // Everyone with a role can see Employees + Library.
  const canSeeEmployees =
    isSuperAdmin || isAdmin || isManager || isClerk;

  return (
    <Box
      sx={{
        position: "fixed",
        top: HEADER_HEIGHT,
        left: 0,
        width: SIDEBAR_WIDTH,
        bottom: 0,
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "background.paper",
        px: 2,
        py: 3,
      }}
    >
      <Stack spacing={2} alignItems="flex-start">
        <Typography variant="overline" color="text.secondary">
          Navigation
        </Typography>

        {canSeeDashboard && (
          <Button
            component={NavLink}
            to="/dashboard"
            sx={linkSx(location.pathname.startsWith("/dashboard"))}
          >
            Dashboard
          </Button>
        )}

        <Button
          component={NavLink}
          to="/library"
          sx={linkSx(location.pathname.startsWith("/library"))}
        >
          Document Library
        </Button>

        {canSeeEmployees && (
          <Button
            component={NavLink}
            to="/employees"
            sx={linkSx(location.pathname.startsWith("/employees"))}
          >
            Employees
          </Button>
        )}

        {canSeeAdmin && (
          <Button
            component={NavLink}
            to="/admin/users"
            sx={linkSx(location.pathname.startsWith("/admin"))}
          >
            Admin Settings
          </Button>
        )}
      </Stack>
    </Box>
  );
}
