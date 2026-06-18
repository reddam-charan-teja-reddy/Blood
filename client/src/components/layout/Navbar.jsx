import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Activity, User as UserIcon, LogOut, Menu, X, PlusCircle, Bell } from 'lucide-react';
import toast from 'react-hot-toast';

export default function Navbar() {
  const { user, isAuthenticated, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch unread notification count (poll every 60s)
  const { data: notifData } = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: () => api('/notifications?unreadOnly=true'),
    enabled: isAuthenticated && user?.role !== 'ADMIN',
    refetchInterval: 60000,
    staleTime: 30000,
  });
  const unreadCount = notifData?.unreadCount || 0;


  const handleLogout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
      clearAuth();
      toast.success('Logged out successfully');
      navigate('/');
    } catch (error) {
      clearAuth();
      navigate('/');
    }
  };

  const isActive = (path) => location.pathname === path;

  return (
    <nav className="glass-panel" style={{
      borderRadius: '0 0 var(--radius-md) var(--radius-md)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      borderTop: 'none',
      borderLeft: 'none',
      borderRight: 'none',
      backgroundColor: 'rgba(15, 23, 42, 0.85)'
    }}>
      <div className="container flex justify-between align-center" style={{ height: '70px' }}>
        {/* Logo */}
        <Link to="/" className="flex align-center gap-2" style={{ fontWeight: 800, fontSize: '1.25rem', color: '#fff' }}>
          <Activity size={24} color="#ef4444" style={{ filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.6))' }} />
          <span>BLOOD<span style={{ color: '#ef4444' }}>NETWORK</span></span>
        </Link>

        {/* Desktop Navigation */}
        <div className="flex align-center gap-6">
          {isAuthenticated ? (
            <>
              {/* Role specific links */}
              {user?.role === 'INDIVIDUAL' && (
                <>
                  <Link to="/home" className={`nav-link ${isActive('/home') ? 'active' : ''}`}>Donate & Find</Link>
                  <Link to="/profile" className={`nav-link ${isActive('/profile') ? 'active' : ''}`}>My Profile</Link>
                </>
              )}

              {user?.role === 'ORG' && (
                <>
                  <Link to="/org/dashboard" className={`nav-link ${isActive('/org/dashboard') ? 'active' : ''}`}>Org Dashboard</Link>
                  <Link to="/profile" className={`nav-link ${isActive('/profile') ? 'active' : ''}`}>Org Profile</Link>
                </>
              )}

              {user?.role === 'ADMIN' && (
                <>
                  <Link to="/admin/dashboard" className={`nav-link ${isActive('/admin/dashboard') ? 'active' : ''}`}>Admin Console</Link>
                </>
              )}

              {/* Create Request CTA for Indiv and Orgs */}
              {user?.role !== 'ADMIN' && (
                <Link to="/request/new" className="btn btn-primary btn-sm flex align-center gap-1" style={{ padding: '0.4rem 0.8rem', fontSize: '0.875rem' }}>
                  <PlusCircle size={16} />
                  <span>Request Blood</span>
                </Link>
              )}

              {/* Notification Bell */}
              {user?.role !== 'ADMIN' && (
                <Link
                  to="/notifications"
                  title="Notifications"
                  style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                >
                  <Bell size={20} color={unreadCount > 0 ? '#ef4444' : 'var(--text-secondary)'} />
                  {unreadCount > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-6px',
                      right: '-8px',
                      background: '#ef4444',
                      color: '#fff',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>
              )}

              {/* User display & logout */}
              <div className="flex align-center gap-4" style={{ marginLeft: '1rem', borderLeft: '1px solid var(--border-color)', paddingLeft: '1.5rem' }}>
                <span className="flex align-center gap-2" style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  <span className="flex align-center justify-center" style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    backgroundColor: user?.role === 'ADMIN' ? 'var(--warning-color)' : 'var(--border-color)',
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: '0.75rem'
                  }}>
                    {user?.fullName?.substring(0, 2).toUpperCase()}
                  </span>
                  <span>{user?.fullName?.split(' ')[0]}</span>
                </span>
                <button onClick={handleLogout} className="btn btn-secondary btn-sm" style={{ padding: '0.4rem', borderRadius: '50%' }} title="Logout">
                  <LogOut size={16} color="#ef4444" />
                </button>
              </div>
            </>
          ) : (
            <>
              <Link to="/login" className="nav-link">Login</Link>
              <Link to="/register" className="btn btn-primary" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>Register</Link>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="btn btn-secondary btn-icon" style={{ display: 'none' /* handled via CSS */ }} id="mobile-toggle">
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="glass-panel fadeIn" style={{
          position: 'absolute',
          top: '75px',
          left: '1rem',
          right: '1rem',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          border: '1px solid var(--border-color)',
          backgroundColor: 'var(--surface-color)',
          zIndex: 99
        }}>
          {isAuthenticated ? (
            <>
              <div style={{ paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-color)' }}>
                <p style={{ fontWeight: 600, color: '#fff' }}>{user?.fullName}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Role: {user?.role}</p>
              </div>

              {user?.role === 'INDIVIDUAL' && (
                <>
                  <Link to="/home" onClick={() => setMobileMenuOpen(false)} className="nav-link">Donate & Find</Link>
                  <Link to="/profile" onClick={() => setMobileMenuOpen(false)} className="nav-link">My Profile</Link>
                </>
              )}

              {user?.role === 'ORG' && (
                <>
                  <Link to="/org/dashboard" onClick={() => setMobileMenuOpen(false)} className="nav-link">Org Dashboard</Link>
                  <Link to="/profile" onClick={() => setMobileMenuOpen(false)} className="nav-link">Org Profile</Link>
                </>
              )}

              {user?.role === 'ADMIN' && (
                <>
                  <Link to="/admin/dashboard" onClick={() => setMobileMenuOpen(false)} className="nav-link">Admin Console</Link>
                </>
              )}

              {user?.role !== 'ADMIN' && (
                <Link to="/request/new" onClick={() => setMobileMenuOpen(false)} className="btn btn-primary flex align-center justify-center gap-1">
                  <PlusCircle size={16} />
                  <span>Request Blood</span>
                </Link>
              )}

              <button onClick={() => { handleLogout(); setMobileMenuOpen(false); }} className="btn btn-danger flex align-center justify-center gap-1">
                <LogOut size={16} />
                <span>Logout</span>
              </button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="btn btn-secondary flex justify-center">Login</Link>
              <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="btn btn-primary flex justify-center">Register</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
