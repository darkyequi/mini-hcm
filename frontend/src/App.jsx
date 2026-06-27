import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";

// Pages
import Welcome from "./pages/Welcome";
import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import UserDashboard from "./pages/user/Dashboard";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ScheduleManagement from "./pages/admin/ScheduleManagement";

// Components
import ProtectedRoute from "./components/ProtectedRoute";

function AppRoutes() {
  const { currentUser, userData } = useAuth();

  return (
    <Routes>
      <Route 
        path="/" 
        element={
          currentUser && userData ? (
            <Navigate to={userData.role === "admin" ? "/admin/dashboard" : "/user/dashboard"} />
          ) : (
            <Welcome />
          )
        } 
      />
      <Route 
        path="/login" 
        element={
          currentUser && userData ? (
            <Navigate to={userData.role === "admin" ? "/admin/dashboard" : "/user/dashboard"} />
          ) : (
            <Login />
          )
        } 
      />
      <Route 
        path="/register" 
        element={
          currentUser && userData ? (
            <Navigate to={userData.role === "admin" ? "/admin/dashboard" : "/user/dashboard"} />
          ) : (
            <Register />
          )
        } 
      />
      
      {/* User Routes */}
      <Route
        path="/user/dashboard"
        element={
          <ProtectedRoute requiredRole="user">
            <UserDashboard />
          </ProtectedRoute>
        }
      />
      
      {/* Admin Routes */}
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/schedule-management"
        element={
          <ProtectedRoute requiredRole="admin">
            <ScheduleManagement />
          </ProtectedRoute>
        }
      />

      {/* Catch all fallback */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
}

export default App;
