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
  color: active ? "primary.main" : "text.primary",
  backgroundColor: active ? "action.selected" : "transparent",
  "&:hover": { backgroundColor: "action.hover" },
  width: "100%",
});

export default function LeftNav() {
  const { user } = useContext(AuthContext);
  const location = useLocation();
  const roles = user?.roles || [];

  const isSuperAdmin = roles.includes("SuperAdmin");
  const isAdmin = roles.includes("Admin");
  const isManager = roles.includes("Manager");
  const isClerk = roles.includes("Clerk");

  // Per your spec: Managers & Clerks → only library
  const canSeeDashboard = isSuperAdmin || isAdmin;
  const canSeeAdmin = isSuperAdmin || isAdmin;

  return (
    <Box
      sx={(theme) => ({
        width: SIDEBAR_WIDTH,
        position: "fixed",
        top: HEADER_HEIGHT,
        bottom: 0,
        left: 0,
        backgroundColor: theme.palette.background.paper,
        borderRight: `1px solid ${theme.palette.divider}`,
        zIndex: theme.zIndex.appBar + 1,
        px: 2,
        py: 2,
        overflowY: "auto",
      })}
    >
      <Typography variant="subtitle2" sx={{ mb: 2, color: "text.secondary" }}>
        Navigation
      </Typography>
      <Stack spacing={1}>
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
