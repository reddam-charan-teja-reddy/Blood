import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import BloodGroupBadge from '../../components/shared/BloodGroupBadge';
import UrgencyChip from '../../components/shared/UrgencyChip';
import LoadingSpinner from '../../components/shared/LoadingSpinner';
import { Link } from 'react-router-dom';
import { LayoutDashboard, Database, PlusCircle, CheckCircle, Clock, AlertTriangle, Loader2 } from 'lucide-react';
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
        
        {/* Recent postings table */}
        <div className="card">
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }}>Recent Postings</h3>
          
          {recentRequests.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', padding: '2rem 0', textAlign: 'center' }}>
              No requests posted yet. Use the button above to request blood.
            </p>
          ) : (
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
                  {recentRequests.map(req => (
                    <tr key={req._id}>
                      <td><BloodGroupBadge group={req.bloodGroup} /></td>
                      <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        {req.component === 'WHOLE_BLOOD' ? 'Whole Blood' : req.component === 'PLATELETS' ? 'Platelets' : 'Plasma'}
                      </td>
                      <td style={{ fontSize: '0.8125rem' }}>{new Date(req.requiredBy).toLocaleDateString('en-IN')}</td>
                      <td><UrgencyChip urgency={req.urgency} /></td>
                      <td>
                        <span className={`badge ${req.status === 'ACTIVE' ? 'badge-high' : 'badge-success'}`}>
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

      </div>
    </div>
  );
}
