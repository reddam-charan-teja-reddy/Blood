import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';

import { useAuthStore } from './store/authStore';
import { api } from './lib/api';
import Navbar from './components/layout/Navbar';
import EmergencyBanner from './components/layout/EmergencyBanner';
import LoadingSpinner from './components/shared/LoadingSpinner';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import HomePage from './pages/HomePage';
import ProfilePage from './pages/ProfilePage';
import CreateRequestPage from './pages/CreateRequestPage';
import RequestDetailPage from './pages/RequestDetailPage';
import OrgDashboardPage from './pages/org/OrgDashboardPage';
import AdminDashboardPage from './pages/admin/AdminDashboardPage';
import NotificationsPage from './pages/NotificationsPage';
import { useLocationSync } from './hooks/useLocationSync';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Protected Route wrapper
function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user } = useAuthStore();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // Redirect based on role
    if (user?.role === 'ADMIN') {
      return <Navigate to="/admin/dashboard" replace />;
    } else if (user?.role === 'ORG') {
      return <Navigate to="/org/dashboard" replace />;
    } else {
      return <Navigate to="/home" replace />;
    }
  }

  return children;
}

export default function App() {
  const { user, isAuthenticated, setAuth, clearAuth } = useAuthStore();
  const [isInitializing, setIsInitializing] = useState(!!user && !isAuthenticated);

  // Background location synchronization (every 10 minutes)
  useLocationSync();

  useEffect(() => {
    const restoreSession = async () => {
      if (user && !isAuthenticated) {
        try {
          const res = await api('/auth/refresh', { method: 'POST' });
          setAuth(res.user, res.accessToken);
        } catch (error) {
          console.error('Failed to restore session:', error);
          clearAuth();
        } finally {
          setIsInitializing(false);
        }
      } else {
        setIsInitializing(false);
      }
    };
    restoreSession();
  }, []);

  if (isInitializing) {
    return <LoadingSpinner fullPage />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <div className="flex flex-col min-h-screen">
          <EmergencyBanner />
          <Navbar />
          <main className="flex-1 container m-y-4">
            <Routes>
              {/* Public routes */}
              <Route path="/" element={
                isAuthenticated ? (
                  user?.role === 'ADMIN' ? <Navigate to="/admin/dashboard" replace /> :
                  user?.role === 'ORG' ? <Navigate to="/org/dashboard" replace /> :
                  <Navigate to="/home" replace />
                ) : (
                  <LandingPage />
                )
              } />
              <Route path="/login" element={
                isAuthenticated ? (
                  user?.role === 'ADMIN' ? <Navigate to="/admin/dashboard" replace /> :
                  user?.role === 'ORG' ? <Navigate to="/org/dashboard" replace /> :
                  <Navigate to="/home" replace />
                ) : (
                  <LoginPage />
                )
              } />
              <Route path="/register" element={
                isAuthenticated ? (
                  user?.role === 'ADMIN' ? <Navigate to="/admin/dashboard" replace /> :
                  user?.role === 'ORG' ? <Navigate to="/org/dashboard" replace /> :
                  <Navigate to="/home" replace />
                ) : (
                  <RegisterPage />
                )
              } />

              {/* Public or shared preview route */}
              <Route path="/r/:token" element={<RequestDetailPage />} />

              {/* Protected routes */}
              <Route path="/home" element={
                <ProtectedRoute allowedRoles={['INDIVIDUAL']}>
                  <HomePage />
                </ProtectedRoute>
              } />
              <Route path="/profile" element={
                <ProtectedRoute allowedRoles={['INDIVIDUAL', 'ORG']}>
                  <ProfilePage />
                </ProtectedRoute>
              } />
              <Route path="/request/new" element={
                <ProtectedRoute allowedRoles={['INDIVIDUAL', 'ORG']}>
                  <CreateRequestPage />
                </ProtectedRoute>
              } />
              <Route path="/request/:id" element={<RequestDetailPage />} />

              {/* Org routes */}
              <Route path="/org/dashboard" element={
                <ProtectedRoute allowedRoles={['ORG']}>
                  <OrgDashboardPage />
                </ProtectedRoute>
              } />

              {/* Notifications (all authenticated non-admin users) */}
              <Route path="/notifications" element={
                <ProtectedRoute allowedRoles={['INDIVIDUAL', 'ORG']}>
                  <NotificationsPage />
                </ProtectedRoute>
              } />

              {/* Admin routes */}
              <Route path="/admin/dashboard" element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <AdminDashboardPage />
                </ProtectedRoute>
              } />

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
          <Toaster 
            position="top-right" 
            toastOptions={{
              style: {
                background: '#151c2c',
                color: '#f8fafc',
                border: '1px solid #334155',
              },
            }}
          />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
