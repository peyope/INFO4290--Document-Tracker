// frontend/src/App.js
import React from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  useLocation,
} from "react-router-dom";

import { AuthProvider } from "./context/AuthContext";
import Header from "./components/Header";
import LeftNav from "./components/LeftNav";
import ProtectedRoute from "./components/ProtectedRoute";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Library from "./pages/Library";
import DocumentDetails from "./pages/DocumentDetails";
import AdminUsers from "./pages/AdminUsers";
import ChangePassword from "./pages/ChangePassword";

// Wrapper that decides when to show the sidebar
function RouterWithChrome() {
  const location = useLocation();

  // routes that should NOT show the left nav (auth screens)
  const isAuthRoute =
    location.pathname === "/" || location.pathname === "/register";

  return (
    <>
      {/* Always show header */}
      <Header />

      {/* Show sidebar only on “inside app” routes */}
      {!isAuthRoute && <LeftNav />}

      {/* Main route content; individual pages handle their own margins
          (they already use ml: 240px and pt: 64px) */}
      <Routes>
        {/* Public / auth routes */}
        <Route path="/" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected app routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/library"
          element={
            <ProtectedRoute>
              <Library />
            </ProtectedRoute>
          }
        />
        <Route
          path="/documents/:id"
          element={
            <ProtectedRoute>
              <DocumentDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute requireRoles={["Admin", "SuperAdmin"]}>
              <AdminUsers />
            </ProtectedRoute>
          }
        />
        <Route
          path="/change-password"
          element={
            <ProtectedRoute>
              <ChangePassword />
            </ProtectedRoute>
          }
        />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <RouterWithChrome />
      </AuthProvider>
    </Router>
  );
}
