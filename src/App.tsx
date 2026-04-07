/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useAppStore } from './store';
import Layout from './components/Layout';
import { ToastProvider } from './components/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import { canView, getUserRole } from './lib/permissions';
import { PageKey } from './types';

// Helper: retry a dynamic import once with a cache-bust, then hard-reload.
// Fixes "Failed to fetch dynamically imported module" after Vercel deploys.
function lazyRetry(factory: () => Promise<{ default: React.ComponentType<any> }>) {
  return lazy(() =>
    factory().catch(() => {
      // First retry — append a timestamp to bust the browser cache
      return factory().catch(() => {
        // If still failing, the whole app bundle is stale — hard reload once
        const reloaded = sessionStorage.getItem('chunk_reload');
        if (!reloaded) {
          sessionStorage.setItem('chunk_reload', '1');
          window.location.reload();
        }
        // If we already reloaded and it still fails, let ErrorBoundary handle it
        return factory();
      });
    })
  );
}

// Lazy-loaded page components — each produces a separate JS chunk, reducing
// the initial bundle that users must download before seeing the app.
const Dashboard        = lazyRetry(() => import('./pages/Dashboard'));
const Inventory        = lazyRetry(() => import('./pages/Inventory'));
const CarLoading       = lazyRetry(() => import('./pages/CarLoading'));
const Sales            = lazyRetry(() => import('./pages/Sales'));
const Customers        = lazyRetry(() => import('./pages/Customers'));
const CustomerDetail   = lazyRetry(() => import('./pages/CustomerDetail'));
const Payments         = lazyRetry(() => import('./pages/Payments'));
const Expenses         = lazyRetry(() => import('./pages/Expenses'));
const Salaries         = lazyRetry(() => import('./pages/Salaries'));
const GeneralTransfers = lazyRetry(() => import('./pages/GeneralTransfers'));
const Capital          = lazyRetry(() => import('./pages/Capital'));
const AccountTransfers = lazyRetry(() => import('./pages/AccountTransfers'));
const Ledger           = lazyRetry(() => import('./pages/Ledger'));
const Reports          = lazyRetry(() => import('./pages/Reports'));
const Settings         = lazyRetry(() => import('./pages/Settings'));

// Clear stale reload flag on successful app boot
if (typeof window !== 'undefined') sessionStorage.removeItem('chunk_reload');

// Simple fallback shown while a lazy chunk is loading
function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-[#14b8a6] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

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
  // Track whether the user has ever been authenticated in this session.
  // This prevents the Layout from unmounting (and losing sidebar state)
  // when currentUser briefly flickers to null during cloud sync / realtime.
  const wasAuthenticated = useRef(false);
  if (state.currentUser) wasAuthenticated.current = true;

  // Show Login only when the user has genuinely never logged in or explicitly logged out.
  // A brief null during sync won't pass this guard because wasAuthenticated stays true
  // and localStorage still has the session marker.
  const hasSessionMarker = typeof window !== 'undefined' && !!localStorage.getItem('astreda_current_user');
  if (!state.currentUser && !wasAuthenticated.current && !hasSessionMarker) {
    return <Login />;
  }
  if (!state.currentUser && !hasSessionMarker) {
    return <Login />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
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
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <ToastProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </ToastProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}

