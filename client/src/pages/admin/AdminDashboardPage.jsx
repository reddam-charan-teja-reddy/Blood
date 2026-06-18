import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import BloodGroupBadge from '../../components/shared/BloodGroupBadge';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  LineChart, Line, CartesianGrid 
} from 'recharts';
import { 
  Activity, Users, Database, AlertTriangle, ShieldCheck, 
  Check, X, Ban, RefreshCw, Search, Heart, Loader2 
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview'); // overview, orgs, users, proofs, flags
  const [userSearch, setUserSearch] = useState('');
  const [previewPath, setPreviewPath] = useState(null);
  const [previewTitle, setPreviewTitle] = useState('');

  const getDocumentUrl = (path) => {
    if (!path) return '';
    const origin = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace('/api/v1', '');
    return `${origin}${path}`;
  };

  // 1. Query general stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['adminStats'],
    queryFn: () => api('/admin/stats'),
    refetchInterval: 30000,
  });

  // 2. Query chart history data
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['adminCharts'],
    queryFn: () => api('/admin/stats/history'),
    enabled: activeTab === 'overview',
  });

  // 3. Query pending orgs
  const { data: pendingOrgs = [], isLoading: orgsLoading } = useQuery({
    queryKey: ['pendingOrgs'],
    queryFn: () => api('/admin/orgs/pending'),
    enabled: activeTab === 'orgs',
  });

  // 4. Query users list
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['adminUsers', userSearch],
    queryFn: () => api(`/admin/users?search=${encodeURIComponent(userSearch)}`),
    enabled: activeTab === 'users',
  });

  // 5. Query pending blood group proofs
  const { data: pendingProofs = [], isLoading: proofsLoading } = useQuery({
    queryKey: ['pendingProofs'],
    queryFn: () => api('/admin/proofs/pending'),
    enabled: activeTab === 'proofs',
  });

  // 6. Query flagged requests
  const { data: flaggedRequests = [], isLoading: flagsLoading } = useQuery({
    queryKey: ['flaggedRequests'],
    queryFn: () => api('/admin/flags'),
    enabled: activeTab === 'flags',
  });

  // 7. Query disputes list
  const { data: disputes = [], isLoading: disputesLoading } = useQuery({
    queryKey: ['adminDisputes'],
    queryFn: () => api('/admin/disputes'),
    enabled: activeTab === 'disputes',
  });

  // 8. Query all requests for oversight feed (with search & pagination state)
  const [oversightPage, setOversightPage] = useState(1);
  const [oversightSearch, setOversightSearch] = useState('');
  const { data: oversightData, isLoading: oversightLoading } = useQuery({
    queryKey: ['adminOversight', oversightPage, oversightSearch],
    queryFn: () => api(`/admin/requests?page=${oversightPage}&limit=10&search=${encodeURIComponent(oversightSearch)}`),
    enabled: activeTab === 'oversight',
  });

  // MUTATIONS
  // Org verify / reject
  const verifyOrgMutation = useMutation({
    mutationFn: (id) => api(`/admin/orgs/${id}/verify`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingOrgs'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      toast.success('Organization approved successfully!');
    },
  });

  const rejectOrgMutation = useMutation({
    mutationFn: (id) => api(`/admin/orgs/${id}/reject`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingOrgs'] });
      toast.success('Organization verification rejected');
    },
  });

  // User suspend / unsuspend
  const suspendUserMutation = useMutation({
    mutationFn: ({ id, reason }) => api(`/admin/users/${id}/suspend`, {
      method: 'PUT',
      body: JSON.stringify({ reason }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast.success('User account suspended');
    },
  });

  const unsuspendUserMutation = useMutation({
    mutationFn: (id) => api(`/admin/users/${id}/unsuspend`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast.success('User account suspension lifted');
    },
  });

  const clearNoShowsMutation = useMutation({
    mutationFn: (id) => api(`/admin/users/${id}/clear-noshows`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast.success('No-shows flags cleared successfully');
    },
  });

  // Proof verify / reject
  const approveProofMutation = useMutation({
    mutationFn: (userId) => api(`/admin/proofs/${userId}/approve`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingProofs'] });
      toast.success('Blood group proof verified');
    },
  });

  const rejectProofMutation = useMutation({
    mutationFn: (userId) => api(`/admin/proofs/${userId}/reject`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingProofs'] });
      toast.success('Blood group proof rejected and reset');
    },
  });

  // Flagged request clear / cancel
  const clearFlagsMutation = useMutation({
    mutationFn: (requestId) => api(`/admin/flags/${requestId}/clear`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flaggedRequests'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      toast.success('Flags cleared successfully');
    },
  });

  const cancelFlaggedMutation = useMutation({
    mutationFn: (requestId) => api(`/admin/flags/${requestId}/cancel`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flaggedRequests'] });
      queryClient.invalidateQueries({ queryKey: ['adminStats'] });
      toast.success('Request force-cancelled');
    },
  });

  const resolveDisputeMutation = useMutation({
    mutationFn: ({ disputeId, status }) => api(`/admin/disputes/${disputeId}/resolve`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDisputes'] });
      toast.success('Dispute resolved successfully!');
    },
    onError: (err) => toast.error(err.message || 'Failed to resolve dispute'),
  });

  const cancelOversightRequestMutation = useMutation({
    mutationFn: (requestId) => api(`/requests/${requestId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminOversight'] });
      toast.success('Request cancelled successfully');
    },
    onError: (err) => toast.error(err.message || 'Failed to cancel request'),
  });

  return (
    <div className="fadeIn">
      {/* Welcome admin banner */}
      <div className="flex justify-between align-center m-b-6 flex-wrap gap-4">
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }} className="flex align-center gap-2">
            <Activity size={28} color="var(--primary-color)" />
            <span>Admin Control Panel</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Coordinate platform safety audits, verify hospital organizations, and review statistics.
          </p>
        </div>
      </div>

      {/* STATS OVERVIEW CARDS */}
      {statsLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="grid grid-cols-4 gap-6 m-b-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <div className="card flex align-center gap-3">
            <Heart size={20} color="var(--primary-color)" />
            <div>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{stats?.activeRequests}</span>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Active Requests</p>
            </div>
          </div>
          
          <div className="card flex align-center gap-3">
            <ShieldCheck size={20} color="var(--success-color)" />
            <div>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{stats?.fulfilledToday}</span>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Fulfilled Today</p>
            </div>
          </div>

          <div className="card flex align-center gap-3">
            <Users size={20} color="var(--info-color)" />
            <div>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{stats?.newUsersToday}</span>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>New Users Today</p>
            </div>
          </div>

          <div className="card flex align-center gap-3" style={{ borderColor: stats?.openReports > 0 ? 'var(--danger-color)' : 'var(--border-color)' }}>
            <AlertTriangle size={20} color="var(--danger-color)" />
            <div>
              <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{stats?.openReports}</span>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Flagged Open Reports</p>
            </div>
          </div>
        </div>
      )}

      {/* TABS HEADERS */}
      <div className="tabs-header">
        <button onClick={() => setActiveTab('overview')} className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}>
          Overview Analytics
        </button>
        <button onClick={() => setActiveTab('orgs')} className={`tab-btn ${activeTab === 'orgs' ? 'active' : ''}`}>
          Verify Orgs ({stats?.pendingOrgs || 0})
        </button>
        <button onClick={() => setActiveTab('users')} className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}>
          Manage Users
        </button>
        <button onClick={() => setActiveTab('proofs')} className={`tab-btn ${activeTab === 'proofs' ? 'active' : ''}`}>
          Donor Proofs
        </button>
        <button onClick={() => setActiveTab('flags')} className={`tab-btn ${activeTab === 'flags' ? 'active' : ''}`}>
          Flagged Requests
        </button>
        <button onClick={() => setActiveTab('disputes')} className={`tab-btn ${activeTab === 'disputes' ? 'active' : ''}`}>
          Disputes Queue
        </button>
        <button onClick={() => setActiveTab('oversight')} className={`tab-btn ${activeTab === 'oversight' ? 'active' : ''}`}>
          Oversight Feed
        </button>
      </div>

      {/* TAB 1: OVERVIEW ANALYTICS */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          {chartLoading ? (
            <LoadingSpinner fullPage />
          ) : (
            <>
              {/* Requests per blood group */}
              <div className="card flex flex-col gap-4">
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }}>Requests by Blood Group (Last 7 Days)</h3>
                <div style={{ width: '100%', height: '280px' }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData?.bloodGroupRequests}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="name" stroke="var(--text-secondary)" />
                      <YAxis stroke="var(--text-secondary)" />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }} />
                      <Bar dataKey="requests" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Fulfillment Rates */}
              <div className="card flex flex-col gap-4">
                <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }}>Daily Fulfillment Rate % (Last 30 Days)</h3>
                <div style={{ width: '100%', height: '280px' }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData?.fulfillmentRate}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="date" stroke="var(--text-secondary)" />
                      <YAxis stroke="var(--text-secondary)" unit="%" />
                      <Tooltip contentStyle={{ backgroundColor: 'var(--surface-color)', borderColor: 'var(--border-color)' }} />
                      <Line type="monotone" dataKey="rate" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 2: ORGS VERIFICATION */}
      {activeTab === 'orgs' && (
        <div className="card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>Pending Organization Approvals</h3>
          {orgsLoading ? (
            <LoadingSpinner />
          ) : (!Array.isArray(pendingOrgs) || pendingOrgs.length === 0) ? (
            <p style={{ color: 'var(--text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
              No organizations are currently pending verification.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Org Name</th>
                    <th>Reg Number</th>
                    <th>Type</th>
                    <th>City / State</th>
                    <th>Phone</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrgs.map(org => (
                    <tr key={org._id}>
                      <td style={{ color: '#fff', fontWeight: 600 }}>{org.orgName}</td>
                      <td>
                        <span className="flex align-center gap-2">
                          <span>{org.registrationNo}</span>
                          {org.documentPath && (
                            <button 
                              onClick={() => {
                                setPreviewPath(org.documentPath);
                                setPreviewTitle(`${org.orgName} License`);
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.125rem 0.375rem', fontSize: '0.75rem' }}
                            >
                              View License
                            </button>
                          )}
                        </span>
                      </td>
                      <td>{org.orgType}</td>
                      <td>{org.city}, {org.state}</td>
                      <td>{org.userId?.phone}</td>
                      <td className="flex gap-2">
                        <button 
                          onClick={() => verifyOrgMutation.mutate(org._id)}
                          className="btn btn-success btn-sm flex align-center gap-1"
                        >
                          <Check size={12} />
                          <span>Verify</span>
                        </button>
                        <button 
                          onClick={() => rejectOrgMutation.mutate(org._id)}
                          className="btn btn-danger btn-sm flex align-center gap-1"
                        >
                          <X size={12} />
                          <span>Reject</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: USER MANAGEMENT */}
      {activeTab === 'users' && (
        <div className="card flex flex-col gap-4">
          <div className="flex justify-between align-center flex-wrap gap-4">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }}>User Management Records</h3>
            
            {/* Search Input */}
            <div className="form-group" style={{ marginBottom: 0, width: '280px' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                  <Search size={16} />
                </span>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search name or phone..." 
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>
          </div>

          {usersLoading ? (
            <LoadingSpinner />
          ) : (!Array.isArray(users) || users.length === 0) ? (
            <p style={{ color: 'var(--text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
              No users found matching search criteria.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Phone</th>
                    <th>Role</th>
                    <th>Verified</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u._id}>
                      <td style={{ color: '#fff', fontWeight: 600 }}>{u.fullName}</td>
                      <td>{u.phone}</td>
                      <td>
                        <span className="badge" style={{
                          backgroundColor: u.role === 'ADMIN' ? 'var(--warning-glow)' : u.role === 'ORG' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255,255,255,0.05)',
                          color: u.role === 'ADMIN' ? 'var(--warning-color)' : u.role === 'ORG' ? 'var(--info-color)' : 'var(--text-secondary)'
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.phoneVerified ? 'badge-success' : 'badge-normal'}`}>
                          {u.phoneVerified ? 'Phone Verified' : 'Unverified'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.suspended ? 'badge-emergency' : 'badge-success'}`}>
                          {u.suspended ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td className="flex gap-2">
                        {u.role === 'INDIVIDUAL' && (
                          <button 
                            onClick={() => clearNoShowsMutation.mutate(u._id)}
                            className="btn btn-secondary btn-sm flex align-center gap-1"
                            title="Reset No Shows"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            <RefreshCw size={12} />
                            <span>Clear No-Shows</span>
                          </button>
                        )}
                        {u.suspended ? (
                          <button 
                            onClick={() => unsuspendUserMutation.mutate(u._id)}
                            className="btn btn-success btn-sm flex align-center gap-1"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                          >
                            <Check size={12} />
                            <span>Unsuspend</span>
                          </button>
                        ) : (
                          <button 
                            onClick={() => {
                              const reason = prompt('Please specify a suspension reason:');
                              if (reason) suspendUserMutation.mutate({ id: u._id, reason });
                            }}
                            className="btn btn-danger btn-sm flex align-center gap-1"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
                            disabled={u.role === 'ADMIN'}
                          >
                            <Ban size={12} />
                            <span>Suspend</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BLOOD GROUP PROOFS */}
      {activeTab === 'proofs' && (
        <div className="card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>Pending Blood Group Proof Approvals</h3>
          {proofsLoading ? (
            <LoadingSpinner />
          ) : (!Array.isArray(pendingProofs) || pendingProofs.length === 0) ? (
            <p style={{ color: 'var(--text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
              No donor blood group proof approvals pending review.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Donor Name</th>
                    <th>Phone</th>
                    <th>Self-Declared Group</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingProofs.map(proof => (
                    <tr key={proof._id}>
                      <td style={{ color: '#fff', fontWeight: 600 }}>{proof.userId?.fullName}</td>
                      <td>{proof.userId?.phone}</td>
                      <td>
                        <span className="flex align-center gap-2">
                          <BloodGroupBadge group={proof.bloodGroup} />
                          {proof.documentPath && (
                            <button 
                              onClick={() => {
                                setPreviewPath(proof.documentPath);
                                setPreviewTitle(`${proof.userId?.fullName} Proof`);
                              }}
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '0.125rem 0.375rem', fontSize: '0.75rem' }}
                            >
                              View Proof
                            </button>
                          )}
                        </span>
                      </td>
                      <td>{proof.city}, {proof.state}</td>
                      <td className="flex gap-2">
                        <button 
                          onClick={() => approveProofMutation.mutate(proof.userId._id)}
                          className="btn btn-success btn-sm flex align-center gap-1"
                        >
                          <Check size={12} />
                          <span>Approve Group</span>
                        </button>
                        <button 
                          onClick={() => rejectProofMutation.mutate(proof.userId._id)}
                          className="btn btn-danger btn-sm flex align-center gap-1"
                        >
                          <X size={12} />
                          <span>Reject</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: FLAGGED REQUESTS */}
      {activeTab === 'flags' && (
        <div className="card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>Abuse Audit Flagged Requests</h3>
          {flagsLoading ? (
            <LoadingSpinner />
          ) : (!Array.isArray(flaggedRequests) || flaggedRequests.length === 0) ? (
            <p style={{ color: 'var(--text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
              No active blood requests are flagged for abuse.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Requester</th>
                    <th>Phone</th>
                    <th>Required Details</th>
                    <th>Flags Count</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {flaggedRequests.map(req => (
                    <tr key={req._id}>
                      <td style={{ color: '#fff', fontWeight: 600 }}>{req.requesterId?.fullName}</td>
                      <td>{req.requesterId?.phone}</td>
                      <td>
                        <Link to={`/request/${req._id}`} className="flex align-center gap-2" style={{ textDecoration: 'none', color: 'inherit' }}>
                          <BloodGroupBadge group={req.bloodGroup} />
                          <span style={{ textDecoration: 'underline', color: 'var(--primary-color)' }}>{req.hospitalName} ({req.hospitalCity})</span>
                        </Link>
                      </td>
                      <td>
                        <span className="badge badge-emergency" style={{ animation: 'none' }}>
                          ⚠️ {req.flagCount} flags
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${req.status === 'ACTIVE' ? 'badge-high' : 'badge-success'}`}>
                          {req.status}
                        </span>
                      </td>
                      <td className="flex gap-2">
                        <Link to={`/request/${req._id}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                          View
                        </Link>
                        <button 
                          onClick={() => clearFlagsMutation.mutate(req._id)}
                          className="btn btn-success btn-sm flex align-center gap-1"
                        >
                          <Check size={12} />
                          <span>Clear Flags</span>
                        </button>
                        <button 
                          onClick={() => cancelFlaggedMutation.mutate(req._id)}
                          className="btn btn-danger btn-sm flex align-center gap-1"
                          disabled={req.status === 'CANCELLED'}
                        >
                          <Ban size={12} />
                          <span>Cancel Request</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: DISPUTES QUEUE */}
      {activeTab === 'disputes' && (
        <div className="card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>No-Show Penalties Disputes</h3>
          {disputesLoading ? (
            <LoadingSpinner />
          ) : (!Array.isArray(disputes) || disputes.length === 0) ? (
            <p style={{ color: 'var(--text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
              No active disputes pending review.
            </p>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Donor Name</th>
                    <th>Phone</th>
                    <th>Request Context</th>
                    <th>Reason details</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {disputes.map(disp => (
                    <tr key={disp._id}>
                      <td style={{ color: '#fff', fontWeight: 600 }}>{disp.filedById?.fullName}</td>
                      <td>{disp.filedById?.phone}</td>
                      <td>
                        {disp.interestId?.requestId ? (
                          <Link to={`/request/${disp.interestId.requestId._id}`} className="flex align-center gap-2" style={{ textDecoration: 'none', color: 'inherit' }}>
                            <BloodGroupBadge group={disp.interestId.requestId.bloodGroup} />
                            <span style={{ textDecoration: 'underline', color: 'var(--primary-color)' }}>{disp.interestId.requestId.hospitalName} ({disp.interestId.requestId.component})</span>
                          </Link>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Deleted Request</span>
                        )}
                      </td>
                      <td>
                        <div style={{ maxWidth: '250px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          <strong>Reason:</strong> {disp.reason}
                          {disp.evidence && <div style={{ marginTop: '0.25rem', color: 'var(--primary-color)' }}><strong>Evidence:</strong> {disp.evidence}</div>}
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${disp.status === 'OPEN' ? 'badge-emergency' : disp.status === 'OVERTURNED' ? 'badge-success' : 'badge-normal'}`}>
                          {disp.status}
                        </span>
                      </td>
                      <td className="flex gap-2">
                        {disp.status === 'OPEN' ? (
                          <>
                            <button 
                              onClick={() => resolveDisputeMutation.mutate({ disputeId: disp._id, status: 'OVERTURNED' })}
                              className="btn btn-success btn-sm flex align-center gap-1"
                            >
                              <Check size={12} />
                              <span>Overturn Penalty</span>
                            </button>
                            <button 
                              onClick={() => resolveDisputeMutation.mutate({ disputeId: disp._id, status: 'RESOLVED' })}
                              className="btn btn-danger btn-sm flex align-center gap-1"
                            >
                              <X size={12} />
                              <span>Uphold Penalty</span>
                            </button>
                          </>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 7: OVERSIGHT FEED */}
      {activeTab === 'oversight' && (
        <div className="card flex flex-col gap-4">
          <div className="flex justify-between align-center flex-wrap gap-4">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }}>Platform Oversight Control Feed</h3>
            
            {/* Search Input */}
            <div className="form-group" style={{ marginBottom: 0, width: '280px' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                  <Search size={16} />
                </span>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search city or hospital..." 
                  value={oversightSearch}
                  onChange={e => { setOversightSearch(e.target.value); setOversightPage(1); }}
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>
          </div>

          {oversightLoading ? (
            <LoadingSpinner />
          ) : (!oversightData?.requests || oversightData.requests.length === 0) ? (
            <p style={{ color: 'var(--text-secondary)', padding: '2rem 0', textAlign: 'center' }}>
              No requests found matching oversight criteria.
            </p>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Patient/Requester</th>
                      <th>Location / Hospital</th>
                      <th>Units Required</th>
                      <th>Urgency</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {oversightData.requests.map(req => (
                      <tr key={req._id}>
                        <td style={{ color: '#fff', fontWeight: 600 }}>
                          <div>{req.requesterId?.fullName || 'Anonymous User'}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{req.requesterId?.phone}</div>
                        </td>
                        <td>
                          <div>{req.hospitalName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{req.hospitalCity}, {req.hospitalState}</div>
                        </td>
                        <td>
                          <span className="flex align-center gap-2">
                            <BloodGroupBadge group={req.bloodGroup} />
                            <span>{req.unitsNeeded} units ({req.component})</span>
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${req.urgency === 'EMERGENCY' ? 'badge-emergency' : req.urgency === 'HIGH' ? 'badge-high' : 'badge-normal'}`}>
                            {req.urgency}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${
                            req.status === 'ACTIVE' ? 'badge-success' : 
                            req.status === 'FULFILLED' ? 'badge-success' : 
                            req.status === 'CANCELLED' ? 'badge-normal' : 'badge-high'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td>
                          <div className="flex gap-2">
                            <Link to={`/request/${req._id}`} className="btn btn-secondary btn-sm" style={{ textDecoration: 'none' }}>
                              View
                            </Link>
                            <button 
                              onClick={() => {
                                if (confirm('Are you sure you want to force-cancel this blood request?')) {
                                  cancelOversightRequestMutation.mutate(req._id);
                                }
                              }}
                              className="btn btn-danger btn-sm"
                              disabled={req.status === 'CANCELLED' || cancelOversightRequestMutation.isPending}
                            >
                              Cancel Request
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {oversightData.pagination?.pages > 1 && (
                <div className="flex justify-between align-center m-t-4" style={{ marginTop: '1rem' }}>
                  <button 
                    onClick={() => setOversightPage(p => Math.max(1, p - 1))}
                    disabled={oversightPage === 1}
                    className="btn btn-secondary btn-sm"
                  >
                    ← Previous Page
                  </button>
                  <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Page {oversightPage} of {oversightData.pagination.pages}
                  </span>
                  <button 
                    onClick={() => setOversightPage(p => Math.min(oversightData.pagination.pages, p + 1))}
                    disabled={oversightPage === oversightData.pagination.pages}
                    className="btn btn-secondary btn-sm"
                  >
                    Next Page →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Document Preview Modal */}
      {previewPath && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ maxWidth: '600px', backgroundColor: 'var(--surface-color)' }}>
            <div className="flex justify-between align-center m-b-4" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontWeight: 700, color: '#fff' }}>{previewTitle}</h3>
              <button 
                onClick={() => setPreviewPath(null)}
                className="btn btn-secondary btn-sm"
                style={{ minWidth: '40px', padding: '0.25rem 0.5rem' }}
              >
                ✕
              </button>
            </div>
            <div style={{ minHeight: '300px', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b0f19', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
              {previewPath.toLowerCase().endsWith('.pdf') ? (
                <iframe 
                  src={getDocumentUrl(previewPath)} 
                  title={previewTitle}
                  style={{ width: '100%', height: '500px', border: 'none' }}
                />
              ) : (
                <img 
                  src={getDocumentUrl(previewPath)} 
                  alt={previewTitle}
                  style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
