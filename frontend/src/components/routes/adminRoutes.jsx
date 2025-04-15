import React from "react";
import { Route } from "react-router-dom";
import ProtectedRoute from "../auth/ProtectedRoute";
import DashBoard from "../admin/Dashboard";

const adminRoutes = () => {
  return (
    <>
      <Route
        path="/admin/dashboard"
        element={
          <ProtectedRoute admin={true}>
            <DashBoard />
          </ProtectedRoute>
        }
      />
    </>
  );
};

export default adminRoutes;
