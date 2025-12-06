// frontend/src/components/ProtectedRoute.jsx
import React, { useContext } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";

export default function ProtectedRoute({ children, requireRoles }) {
  const { user, loading } = useContext(AuthContext);
  const location = useLocation();

  if (loading) {
    return null; // or a spinner if you prefer
  }

  // Normal auth guard
  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }

  // Optional role check
  if (
    requireRoles &&
    (!user.roles || !user.roles.some((r) => requireRoles.includes(r)))
  ) {
    // user is logged in, but lacks required role
    return <Navigate to="/library" replace />;
  }

  return children;
}
