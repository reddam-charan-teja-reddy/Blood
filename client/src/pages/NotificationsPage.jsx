import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, AlertCircle, Heart, Building2, ShieldCheck } from 'lucide-react';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import toast from 'react-hot-toast';

const TYPE_META = {
  EMERGENCY_REQUEST:   { icon: <AlertCircle size={18} color="#ef4444" />, color: '#ef4444' },
  NEW_REQUEST_MATCH:   { icon: <Heart size={18} color="#f97316" />, color: '#f97316' },
  CONTACT_REVEALED:    { icon: <CheckCheck size={18} color="#22c55e" />, color: '#22c55e' },
  OUTCOME_REPORTED:    { icon: <CheckCheck size={18} color="#22c55e" />, color: '#22c55e' },
  ORG_VERIFIED:        { icon: <ShieldCheck size={18} color="#22c55e" />, color: '#22c55e' },
  ORG_REJECTED:        { icon: <ShieldCheck size={18} color="#ef4444" />, color: '#ef4444' },
  PROOF_APPROVED:      { icon: <ShieldCheck size={18} color="#22c55e" />, color: '#22c55e' },
  PROOF_REJECTED:      { icon: <ShieldCheck size={18} color="#ef4444" />, color: '#ef4444' },
  GENERAL:             { icon: <Bell size={18} color="var(--text-muted)" />, color: 'var(--text-muted)' },
};

export default function NotificationsPage() {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api('/notifications'),
    staleTime: 10000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      toast.success(`Marked ${data.modifiedCount} notification(s) as read`);
    },
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  if (isLoading) return <LoadingSpinner />;
  if (error) return <p style={{ color: '#ef4444', padding: '2rem' }}>Failed to load notifications.</p>;

  return (
    <div className="fadeIn" style={{ maxWidth: '720px', margin: '0 auto' }}>
      {/* Header */}
      <div className="glass-panel p-6 m-b-6 flex justify-between align-center">
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>Notifications</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            className="btn btn-secondary btn-sm flex align-center gap-2"
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
          >
            <CheckCheck size={16} />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {/* Notification List */}
      {notifications.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <Bell size={48} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
          <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '0.5rem' }}>No notifications yet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            When a new blood request matches your blood group and location, you'll be notified here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {notifications.map((notif) => {
            const meta = TYPE_META[notif.type] || TYPE_META.GENERAL;
            return (
              <div
                key={notif._id}
                className="card"
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  opacity: notif.isRead ? 0.65 : 1,
                  borderLeft: `3px solid ${notif.isRead ? 'var(--border-color)' : meta.color}`,
                  padding: '1rem 1.25rem',
                  cursor: notif.link ? 'pointer' : 'default',
                  transition: 'opacity 0.2s ease',
                }}
                onClick={() => {
                  if (!notif.isRead) markReadMutation.mutate(notif._id);
                }}
              >
                {/* Icon */}
                <div style={{ marginTop: '2px', flexShrink: 0 }}>
                  {meta.icon}
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div className="flex justify-between align-center">
                    <p style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>{notif.title}</p>
                    {!notif.isRead && (
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: meta.color, flexShrink: 0,
                      }} />
                    )}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                    {notif.message}
                  </p>
                  <div className="flex justify-between align-center" style={{ marginTop: '0.5rem' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(notif.createdAt).toLocaleString('en-IN', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                    {notif.link && (
                      <Link
                        to={notif.link}
                        onClick={(e) => e.stopPropagation()}
                        style={{ fontSize: '0.8125rem', color: 'var(--primary-color)', fontWeight: 600 }}
                      >
                        View →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
