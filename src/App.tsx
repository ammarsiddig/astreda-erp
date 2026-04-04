/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppStore } from './store';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import CarLoading from './pages/CarLoading';
import Sales from './pages/Sales';
import Customers from './pages/Customers';
import CustomerDetail from './pages/CustomerDetail';
import Payments from './pages/Payments';
import Expenses from './pages/Expenses';
import Salaries from './pages/Salaries';
import GeneralTransfers from './pages/GeneralTransfers';
import Capital from './pages/Capital';
import AccountTransfers from './pages/AccountTransfers';
import Ledger from './pages/Ledger';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { canView, getUserRole } from './lib/permissions';
import { PageKey } from './types';

function ProtectedRoute({ pageKey, children }: { pageKey: PageKey; children: React.ReactNode }) {
  const { state } = useAppStore();
  if (!canView(state.currentUser, state.roles, pageKey)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

function RoleLandingPage() {
  const { state } = useAppStore();
  const role = getUserRole(state.currentUser, state.roles);
  if (role?.isSalesperson) return <Navigate to="/sales" replace />;
  if (role?.id === 'role-warehouse') return <Navigate to="/inventory" replace />;
  return <Dashboard />;
}

function AppRoutes() {
  const { state } = useAppStore();

  if (!state.currentUser) {
    return <Login />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<RoleLandingPage />} />
        <Route path="inventory" element={<ProtectedRoute pageKey="inventory"><Inventory /></ProtectedRoute>} />
        <Route path="car-loading" element={<ProtectedRoute pageKey="carLoading"><CarLoading /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute pageKey="sales"><Sales /></ProtectedRoute>} />
        <Route path="customers" element={<ProtectedRoute pageKey="customers"><Customers /></ProtectedRoute>} />
        <Route path="customers/:id" element={<ProtectedRoute pageKey="customers"><CustomerDetail /></ProtectedRoute>} />
        <Route path="payments" element={<ProtectedRoute pageKey="payments"><Payments /></ProtectedRoute>} />
        <Route path="expenses" element={<ProtectedRoute pageKey="expenses"><Expenses /></ProtectedRoute>} />
        <Route path="salaries" element={<ProtectedRoute pageKey="salaries"><Salaries /></ProtectedRoute>} />
        <Route path="general-transfers" element={<ProtectedRoute pageKey="generalTransfers"><GeneralTransfers /></ProtectedRoute>} />
        <Route path="capital" element={<ProtectedRoute pageKey="capital"><Capital /></ProtectedRoute>} />
        <Route path="account-transfers" element={<ProtectedRoute pageKey="accountTransfers"><AccountTransfers /></ProtectedRoute>} />
        <Route path="ledger" element={<ProtectedRoute pageKey="ledger"><Ledger /></ProtectedRoute>} />
        <Route path="reports" element={<ProtectedRoute pageKey="reports"><Reports /></ProtectedRoute>} />
        <Route path="settings" element={<ProtectedRoute pageKey="settings"><Settings /></ProtectedRoute>} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
