import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import BloodGroupBadge from '../../components/shared/BloodGroupBadge';
import UrgencyChip from '../../components/shared/UrgencyChip';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Database, PlusCircle, CheckCircle, Clock, AlertTriangle, Loader2, Search, Heart, Droplets } from 'lucide-react';
import toast from 'react-hot-toast';

export default function OrgDashboardPage() {
  const queryClient = useQueryClient();
  const [editingInventory, setEditingInventory] = useState(false);
  const [inventoryState, setInventoryState] = useState({});

  // Query org dashboard stats
  const { data: dashboard, isLoading, error } = useQuery({
    queryKey: ['orgDashboard'],
    queryFn: () => api('/orgs/dashboard'),
    refetchInterval: 30000,
  });

  // Query org requests
  const [requestSearch, setRequestSearch] = useState('');
  const [requestStatusFilter, setRequestStatusFilter] = useState('');
  const [requestPage, setRequestPage] = useState(1);
  const { data: requestsData } = useQuery({
    queryKey: ['orgRequests'],
    queryFn: () => api('/orgs/requests'),
  });

  // Query supply feed — public requests matching org inventory
  const { data: feedData, isLoading: feedLoading } = useQuery({
    queryKey: ['orgFeed'],
    queryFn: () => api('/orgs/feed'),
    staleTime: 30000,
  });

  // Query inventory logs
  const { data: inventoryLogs = [] } = useQuery({
    queryKey: ['orgInventoryLogs'],
    queryFn: () => api('/orgs/inventory/logs'),
    refetchInterval: 10000,
  });

  const allRequests = requestsData?.requests || [];
  const filteredRequests = allRequests.filter(req => {
    const matchesSearch = req.bloodGroup.toLowerCase().includes(requestSearch.toLowerCase()) || 
                          req.hospitalName.toLowerCase().includes(requestSearch.toLowerCase());
    const matchesStatus = requestStatusFilter ? req.status === requestStatusFilter : true;
    return matchesSearch && matchesStatus;
  });

  const PAGE_SIZE = 5;
  const totalRequestsPages = Math.ceil(filteredRequests.length / PAGE_SIZE) || 1;
  const paginatedRequests = filteredRequests.slice((requestPage - 1) * PAGE_SIZE, requestPage * PAGE_SIZE);

  // Mutation to update blood inventory
  const updateInventoryMutation = useMutation({
    mutationFn: (inventory) => api('/orgs/inventory', { method: 'PUT', body: JSON.stringify({ inventory }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgDashboard'] });
      toast.success('Inventory updated successfully');
      setEditingInventory(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to update inventory'),
  });

  // Mutation for org supply action
  const supplyMutation = useMutation({
    mutationFn: (requestId) => api(`/orgs/supply/${requestId}`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orgFeed'] });
      toast.success(data.message || 'Supply offer submitted! The requester will be notified.');
    },
    onError: (err) => toast.error(err.message || 'Failed to submit supply offer'),
  });

  const handleEditInventory = () => {
    setInventoryState(dashboard.inventory);
    setEditingInventory(true);
  };

  const handleInventoryChange = (bg, val) => {
    setInventoryState(prev => ({
      ...prev,
      [bg]: parseInt(val, 10) || 0
    }));
  };

  const handleSaveInventory = (e) => {
    e.preventDefault();
    updateInventoryMutation.mutate(inventoryState);
  };

  if (isLoading) return <LoadingSpinner fullPage />;
  if (error) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '4rem 2rem',
        borderRadius: 'var(--radius-lg)',
        backgroundColor: 'var(--surface-color)',
        border: '1px solid var(--border-color)',
        color: 'var(--text-secondary)'
      }} className="flex flex-col align-center justify-center gap-4">
        <AlertTriangle size={48} color="var(--warning-color)" />
        <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>Dashboard Locked</h3>
        <p style={{ maxWidth: '450px', fontSize: '0.875rem' }}>
          {error.message || 'Organization verification is pending. Please contact platform administration.'}
        </p>
      </div>
    );
  }

  const recentRequests = dashboard.recentRequests || [];

  return (
    <div className="fadeIn">
      {/* Dashboard Welcome Header */}
      <div className="flex justify-between align-center m-b-6 flex-wrap gap-4">
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }} className="flex align-center gap-2">
            <LayoutDashboard size={28} color="var(--primary-color)" />
            <span>Organization Command Center</span>
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Manage requests on behalf of patients and track live blood unit inventory.
          </p>
        </div>
        <Link to="/request/new" className="btn btn-primary flex align-center gap-1">
          <PlusCircle size={18} />
          <span>Request Blood</span>
        </Link>
      </div>

      {/* STATISTICS ROW */}
      <div className="grid grid-cols-3 gap-6 m-b-6">
        {/* Active requests */}
        <div className="card flex align-center gap-4">
          <div className="flex align-center justify-center" style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            color: 'var(--primary-color)'
          }}>
            <Clock size={24} />
          </div>
          <div>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>{dashboard.activeRequests}</span>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Active Requests</p>
          </div>
        </div>

        {/* Fulfilled Today */}
        <div className="card flex align-center gap-4">
          <div className="flex align-center justify-center" style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            color: 'var(--success-color)'
          }}>
            <CheckCircle size={24} />
          </div>
          <div>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>{dashboard.fulfilledToday}</span>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Fulfilled Today</p>
          </div>
        </div>

        {/* Pending reveals */}
        <div className="card flex align-center gap-4">
          <div className="flex align-center justify-center" style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            color: 'var(--warning-color)'
          }}>
            <Database size={24} />
          </div>
          <div>
            <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff' }}>{dashboard.pendingContacts}</span>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>Pending Contact Reveals</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
        
        {/* Recent postings table with Search, Filter & Pagination */}
        <div className="card flex flex-col gap-4">
          <div className="flex justify-between align-center flex-wrap gap-4">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff', marginBottom: 0 }}>Organization Postings</h3>
            
            <div className="flex gap-2 align-center flex-wrap">
              <div className="form-group" style={{ marginBottom: 0, width: '200px' }}>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                    <Search size={14} />
                  </span>
                  <input 
                    type="text" 
                    className="form-input form-input-sm" 
                    placeholder="Search hospital..." 
                    value={requestSearch}
                    onChange={e => { setRequestSearch(e.target.value); setRequestPage(1); }}
                    style={{ paddingLeft: '2.25rem', fontSize: '0.8125rem', height: '36px' }}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <select 
                  className="form-select form-select-sm"
                  value={requestStatusFilter}
                  onChange={e => { setRequestStatusFilter(e.target.value); setRequestPage(1); }}
                  style={{ fontSize: '0.8125rem', height: '36px' }}
                >
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PARTIALLY_FULFILLED">PARTIALLY FULFILLED</option>
                  <option value="FULFILLED">FULFILLED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>
          </div>
          
          {paginatedRequests.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
              No requests matching search criteria.
            </p>
          ) : (
            <>
              <div className="table-wrapper">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Blood</th>
                      <th>Component</th>
                      <th>Required By</th>
                      <th>Urgency</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRequests.map(req => (
                      <tr key={req._id}>
                        <td><BloodGroupBadge group={req.bloodGroup} /></td>
                        <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          {req.component === 'WHOLE_BLOOD' ? 'Whole Blood' : req.component === 'PLATELETS' ? 'Platelets' : req.component === 'PLASMA' ? 'Plasma' : 'RBC'}
                        </td>
                        <td style={{ fontSize: '0.8125rem' }}>{new Date(req.requiredBy).toLocaleDateString('en-IN')}</td>
                        <td><UrgencyChip urgency={req.urgency} /></td>
                        <td>
                          <span className={`badge ${
                            req.status === 'ACTIVE' ? 'badge-high' : 
                            req.status === 'PARTIALLY_FULFILLED' ? 'badge-warning' :
                            req.status === 'FULFILLED' ? 'badge-success' : 'badge-normal'
                          }`}>
                            {req.status}
                          </span>
                        </td>
                        <td>
                          <Link to={`/request/${req._id}`} className="btn btn-secondary btn-sm" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}>
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalRequestsPages > 1 && (
                <div className="flex justify-between align-center m-t-4" style={{ marginTop: '1rem' }}>
                  <button 
                    onClick={() => setRequestPage(p => Math.max(1, p - 1))}
                    disabled={requestPage === 1}
                    className="btn btn-secondary btn-sm"
                  >
                    ← Prev Page
                  </button>
                  <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    Page {requestPage} of {totalRequestsPages}
                  </span>
                  <button 
                    onClick={() => setRequestPage(p => Math.min(totalRequestsPages, p + 1))}
                    disabled={requestPage === totalRequestsPages}
                    className="btn btn-secondary btn-sm"
                  >
                    Next Page →
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Blood inventory tracker card */}
        <div className="card" style={{ height: 'fit-content' }}>
          <div className="flex justify-between align-center m-b-4">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }} className="flex align-center gap-2">
              <Database size={18} color="var(--primary-color)" />
              <span>Blood Units Inventory</span>
            </h3>
            {!editingInventory ? (
              <button onClick={handleEditInventory} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                Update
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={() => setEditingInventory(false)} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                  Cancel
                </button>
                <button onClick={handleSaveInventory} className="btn btn-success btn-sm" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }} disabled={updateInventoryMutation.isPending}>
                  Save
                </button>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveInventory}>
            <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {Object.keys(dashboard.inventory || {}).map((bg) => (
                <div 
                  key={bg} 
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.75rem',
                    textAlign: 'center'
                  }}
                >
                  <p style={{ fontWeight: 800, color: 'var(--primary-color)', fontSize: '0.875rem' }}>{bg}</p>
                  
                  {editingInventory ? (
                    <input 
                      type="number" 
                      className="form-input" 
                      min={0}
                      value={inventoryState[bg] || 0}
                      onChange={(e) => handleInventoryChange(bg, e.target.value)}
                      style={{ 
                        textAlign: 'center', 
                        padding: '0.25rem', 
                        fontSize: '0.875rem', 
                        marginTop: '0.25rem' 
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff', display: 'block', marginTop: '0.25rem' }}>
                      {dashboard.inventory[bg]}u
                    </span>
                  )}
                </div>
              ))}
            </div>
          </form>
        </div>

        {/* Supply Feed — public requests matching org inventory */}
        <div className="card" style={{ marginTop: '1.5rem' }}>
          <div className="flex justify-between align-center m-b-4">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }} className="flex align-center gap-2">
              <Droplets size={18} color="var(--primary-color)" />
              <span>Supply Feed — Requests You Can Help With</span>
            </h3>
            <div className="flex align-center gap-3">
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                Based on current inventory & location
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['orgFeed'] })}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}
              >
                Refresh
              </button>
            </div>
          </div>

          {feedLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-color)' }} />
            </div>
          ) : !feedData ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              <p>Failed to load supply feed.</p>
            </div>
          ) : feedData.requests?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
              <Heart size={32} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem' }} />
              <p style={{ fontWeight: 600, color: '#fff', marginBottom: '0.5rem' }}>No matching requests right now</p>
              <p style={{ fontSize: '0.875rem' }}>
                {feedData.message || 'Update your inventory or wait for new requests to be posted near your location.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {feedData.requests.map(req => (
                <div key={req._id} className="flex gap-3" style={{
                  backgroundColor: 'rgba(15, 23, 42, 0.4)',
                  borderRadius: 'var(--radius-sm)',
                  border: req.urgency === 'EMERGENCY' ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid var(--border-color)',
                  alignItems: 'flex-start',
                  padding: '1.25rem 1.25rem',
                }}>
                  {/* Left Column: Blood Group Badge */}
                  <div style={{ flexShrink: 0, marginTop: '2px', transform: 'scale(0.9)', transformOrigin: 'top left' }}>
                    <BloodGroupBadge group={req.bloodGroup} />
                  </div>

                  {/* Right Column: Info & Actions stacked vertically */}
                  <div className="flex-1 flex flex-col gap-2" style={{ minWidth: 0 }}>
                    <div>
                      <p style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem', lineHeight: '1.3' }}>
                        {req.unitsNeeded} unit(s) at {req.hospitalName}
                      </p>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        {req.hospitalCity}, {req.hospitalState} · Needed by {new Date(req.requiredBy).toLocaleDateString('en-IN')}
                      </p>
                    </div>

                    {/* Actions and Badges Row */}
                    <div className="flex align-center flex-wrap gap-2" style={{ marginTop: '0.25rem' }}>
                      <div style={{ transform: 'scale(0.9)', transformOrigin: 'left center', display: 'inline-flex' }}>
                        <UrgencyChip urgency={req.urgency} />
                      </div>
                      <div className="flex gap-2" style={{ marginLeft: 'auto' }}>
                        <Link to={`/request/${req._id}`} className="btn btn-secondary btn-sm" style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}>
                          Details
                        </Link>
                        <button
                          className="btn btn-primary btn-sm flex align-center gap-1"
                          style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                          onClick={() => supplyMutation.mutate(req._id)}
                          disabled={supplyMutation.isPending}
                        >
                          <Droplets size={14} />
                          Offer to Supply
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Inventory Logs Panel */}
        <div className="card" style={{ marginTop: '1.5rem', height: 'fit-content' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }} className="flex align-center gap-2">
            <Clock size={18} color="var(--primary-color)" />
            <span>Recent Inventory Logs</span>
          </h3>
          {inventoryLogs.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', padding: '1rem 0', textAlign: 'center' }}>
              No inventory adjustments logged yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '250px', overflowY: 'auto', paddingRight: '0.25rem' }}>
              {inventoryLogs.map(log => {
                const isPositive = log.delta > 0;
                return (
                  <div key={log._id} className="flex align-center justify-between p-2" style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.3)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8125rem'
                  }}>
                    <div className="flex align-center gap-2">
                      <span className="flex align-center justify-center" style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        backgroundColor: isPositive ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        color: isPositive ? 'var(--success-color)' : 'var(--primary-color)',
                        fontWeight: 700,
                        fontSize: '0.75rem'
                      }}>
                        {isPositive ? '+' : ''}{log.delta}
                      </span>
                      <div>
                        <strong style={{ color: '#fff' }}>{log.bloodGroup}</strong>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{log.reason}</p>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
