import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function ProtectedRoute({ children, requiredRole }) {
  const { currentUser, userData } = useAuth();

  if (!currentUser) {
    return <Navigate to="/login" />;
  }

  if (requiredRole && userData && userData.role !== requiredRole) {
    // Redirect user to their respective dashboard if they try to access unauthorized roles
    return <Navigate to={userData.role === "admin" ? "/admin/dashboard" : "/user/dashboard"} />;
  }

  return children;
}
