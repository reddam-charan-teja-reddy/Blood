import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import RequestCard from '../components/request/RequestCard';
import BloodGroupBadge from '../components/shared/BloodGroupBadge';
import TrustBadge from '../components/shared/TrustBadge';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { Search, SlidersHorizontal, Heart, MapPin, Award, PlusCircle, CheckCircle, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';

export default function HomePage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('donate'); // 'donate' or 'find'
  const [selectedDonorForRequest, setSelectedDonorForRequest] = useState(null);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);

  // Fetch donor profile to get default filters (city, bloodGroup)
  const { data: profile } = useQuery({
    queryKey: ['donorProfile'],
    queryFn: () => api('/donors/profile'),
    enabled: user?.role === 'INDIVIDUAL',
  });

  // Fetch user's own requests to associate with contact requests
  const { data: myRequests = [] } = useQuery({
    queryKey: ['myRequests'],
    queryFn: () => api('/auth/history/requests'),
    enabled: !!user,
  });

  const myActiveRequests = myRequests.filter(r => ['ACTIVE', 'PARTIALLY_FULFILLED'].includes(r.status));

  const maskName = (fullName) => {
    return fullName || '';
  };

  const requestDonorMutation = useMutation({
    mutationFn: ({ requestId, donorUserId }) => api(`/requests/${requestId}/request-donor/${donorUserId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donors'] });
      queryClient.invalidateQueries({ queryKey: ['myRequests'] });
      toast.success('Contact request sent! Donor will be notified.');
      setIsRequestModalOpen(false);
      setSelectedDonorForRequest(null);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to send contact request');
    }
  });

  const handleRequestContact = (donor) => {
    if (myActiveRequests.length === 0) {
      toast.error('You must post an active blood request first to request donor contact.');
      return;
    }

    if (myActiveRequests.length === 1) {
      requestDonorMutation.mutate({
        requestId: myActiveRequests[0]._id,
        donorUserId: donor.userId._id
      });
    } else {
      setSelectedDonorForRequest(donor);
      setIsRequestModalOpen(true);
    }
  };

  // Request Filters state
  const [bloodGroup, setBloodGroup] = useState('');
  const [city, setCity] = useState('');
  const [component, setComponent] = useState('');
  const [urgency, setUrgency] = useState('');
  const [sortBy, setSortBy] = useState('urgency');
  const [compatibleOnly, setCompatibleOnly] = useState(true);

  // Set default city and bloodGroup from donor profile once loaded
  useEffect(() => {
    if (profile) {
      if (profile.city) setCity(profile.city);
      if (profile.bloodGroup) setBloodGroup(profile.bloodGroup);
    }
  }, [profile]);

  // Query Requests
  const { data: requestsData, isLoading: requestsLoading } = useQuery({
    queryKey: ['requests', bloodGroup, city, component, urgency, sortBy, compatibleOnly],
    queryFn: () => {
      const params = new URLSearchParams();
      if (bloodGroup) params.append('bloodGroup', bloodGroup);
      if (city) params.append('city', city);
      if (component) params.append('component', component);
      if (urgency) params.append('urgency', urgency);
      if (sortBy) params.append('sortBy', sortBy);
      params.append('compatibleOnly', compatibleOnly ? 'true' : 'false');
      
      return api(`/requests?${params.toString()}`);
    },
    refetchInterval: 30000, // 30s polling for live updates
  });

  // Query Available Donors (Only matches active request city if individual)
  const { data: donorsData, isLoading: donorsLoading } = useQuery({
    queryKey: ['donors', bloodGroup, city],
    queryFn: () => {
      const params = new URLSearchParams();
      // Filters for matching donors
      if (bloodGroup) params.append('bloodGroup', bloodGroup);
      if (city) params.append('city', city);
      params.append('available', 'true');
      return api(`/donors?${params.toString()}`);
    },
    enabled: activeTab === 'find',
  });

  const requests = requestsData?.requests || [];
  const donors = donorsData?.donors || [];

  return (
    <div className="fadeIn">
      {/* Home Navigation Tabs */}
      <div className="tabs-header">
        <button 
          onClick={() => setActiveTab('donate')}
          className={`tab-btn ${activeTab === 'donate' ? 'active' : ''}`}
        >
          Donate Blood (Requests Feed)
        </button>
        <button 
          onClick={() => setActiveTab('find')}
          className={`tab-btn ${activeTab === 'find' ? 'active' : ''}`}
        >
          Find Donors (Available Nearby)
        </button>
      </div>

      {/* FILTER BAR PANEL */}
      <div className="glass-panel p-6 m-b-6 flex flex-col gap-4">
        <div className="flex align-center gap-2" style={{ fontWeight: 700, color: '#fff' }}>
          <SlidersHorizontal size={18} color="var(--primary-color)" />
          <span>Filter & Search Criteria</span>
        </div>

        <div className="grid grid-cols-4 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
          {/* City search */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">City</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                <Search size={16} />
              </span>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Search city..." 
                value={city}
                onChange={(e) => setCity(e.target.value)}
                style={{ paddingLeft: '2.3rem' }}
              />
            </div>
          </div>

          {/* Blood group */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Blood Group</label>
            <select 
              className="form-select"
              value={bloodGroup}
              onChange={(e) => setBloodGroup(e.target.value)}
            >
              <option value="">All Blood Groups</option>
              {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          {/* Component */}
          {activeTab === 'donate' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Component</label>
              <select 
                className="form-select"
                value={component}
                onChange={(e) => setComponent(e.target.value)}
              >
                <option value="">All Components</option>
                <option value="WHOLE_BLOOD">Whole Blood</option>
                <option value="PLATELETS">Platelets</option>
                <option value="PLASMA">Plasma</option>
                <option value="RBC">Double RBC</option>
              </select>
            </div>
          )}

          {/* Urgency */}
          {activeTab === 'donate' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Urgency</label>
              <select 
                className="form-select"
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
              >
                <option value="">All Urgencies</option>
                <option value="EMERGENCY">Emergency</option>
                <option value="HIGH">High</option>
                <option value="NORMAL">Normal</option>
              </select>
            </div>
          )}

          {/* Sorting */}
          {activeTab === 'donate' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Sort By</label>
              <select 
                className="form-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="urgency">Urgency First</option>
                <option value="newest">Newest Posted</option>
                <option value="expiringSoon">Expiring Soon</option>
              </select>
            </div>
          )}
        </div>

        {/* Compatibility toggle checkbox */}
        {activeTab === 'donate' && bloodGroup && (
          <div className="flex align-center gap-2" style={{ marginTop: '0.5rem' }}>
            <input 
              type="checkbox" 
              id="compat-check"
              checked={compatibleOnly}
              onChange={(e) => setCompatibleOnly(e.target.checked)}
              style={{ accentColor: 'var(--primary-color)', cursor: 'pointer' }}
            />
            <label htmlFor="compat-check" style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Show compatible requests matching O-/O+/A/B compatibility matrix (recommended)
            </label>
          </div>
        )}
      </div>

      {/* DONATE TAB CONTENTS */}
      {activeTab === 'donate' && (
        <div>
          {requestsLoading ? (
            <LoadingSpinner fullPage />
          ) : requests.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)'
            }} className="flex flex-col align-center justify-center gap-4">
              <Heart size={48} color="var(--primary-color)" />
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>No Active Blood Requests</h3>
              <p style={{ maxWidth: '450px', fontSize: '0.875rem' }}>
                There are no open requests matching your search filters in {city || 'your area'}. Try adjusting filters or posting a request.
              </p>
              <Link to="/request/new" className="btn btn-primary flex align-center gap-1">
                <PlusCircle size={16} />
                <span>Post Blood Request</span>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {requests.map(request => (
                <RequestCard key={request._id} request={request} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* FIND DONORS TAB CONTENTS */}
      {activeTab === 'find' && (
        <div>
          {donorsLoading ? (
            <LoadingSpinner fullPage />
          ) : donorsData?.message ? (
            /* Locked state if no active requests */
            <div style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)'
            }} className="flex flex-col align-center justify-center gap-4">
              <XCircle size={48} color="var(--danger-color)" />
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>Find Donors Feature Locked</h3>
              <p style={{ maxWidth: '450px', fontSize: '0.875rem' }}>
                {donorsData.message} To preserve donor privacy, you can only browse available donors' profiles if you have an active request in their city.
              </p>
              <Link to="/request/new" className="btn btn-primary flex align-center gap-1">
                <PlusCircle size={16} />
                <span>Post Blood Request First</span>
              </Link>
            </div>
          ) : donors.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '4rem 2rem',
              borderRadius: 'var(--radius-lg)',
              backgroundColor: 'var(--surface-color)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-secondary)'
            }} className="flex flex-col align-center justify-center gap-4">
              <Heart size={48} color="var(--text-muted)" />
              <h3 style={{ color: '#fff', fontSize: '1.25rem', fontWeight: 700 }}>No Available Donors</h3>
              <p style={{ maxWidth: '450px', fontSize: '0.875rem' }}>
                No registered available donors found in {city || 'your area'} matching the criteria. We notify matching registered donors immediately when requests go live.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {donors.map(donor => (
                <div key={donor._id} className="card flex flex-col justify-between gap-4">
                  <div className="flex align-center gap-3">
                    <div className="flex align-center justify-center" style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--border-color)',
                      color: '#fff',
                      fontWeight: 800
                    }}>
                      {maskName(donor.userId?.fullName).substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex align-center gap-2">
                        <h4 style={{ fontWeight: 700, color: '#fff' }}>
                          {maskName(donor.userId?.fullName)}
                        </h4>
                        <span style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--success-color)',
                          display: 'inline-block'
                        }} title="Available Now" />
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }} className="flex align-center gap-1">
                        <MapPin size={12} />
                        <span>{donor.city}, {donor.state}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between align-center p-3" style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.4)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-color)'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Blood Group</p>
                      <BloodGroupBadge group={donor.bloodGroup} />
                    </div>
                    
                    <div style={{ textAlign: 'center', borderLeft: '1px solid var(--border-color)', paddingLeft: '1rem' }}>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Donations</p>
                      <span className="flex align-center gap-1" style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem', justifyContent: 'center' }}>
                        <Award size={14} color="var(--success-color)" />
                        <span>{donor.totalDonations}</span>
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2" style={{
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '0.75rem'
                  }}>
                    <div className="flex justify-between align-center" style={{ fontSize: '0.8125rem' }}>
                      <TrustBadge verified={donor.bloodGroupVerified} totalDonations={donor.totalDonations} />
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Active nearby</span>
                    </div>
                    {donor.contactRequested ? (
                      <button 
                        className="btn btn-secondary btn-sm"
                        style={{ width: '100%', marginTop: '0.25rem', cursor: 'not-allowed' }}
                        disabled
                      >
                        Requested
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleRequestContact(donor)}
                        className="btn btn-primary btn-sm"
                        style={{ width: '100%', marginTop: '0.25rem' }}
                        disabled={requestDonorMutation.isPending}
                      >
                        Request Contact
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Request Donor Selection Modal */}
      {isRequestModalOpen && selectedDonorForRequest && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ backgroundColor: 'var(--surface-color)', maxWidth: '450px' }}>
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>Select Blood Request</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Select which of your active requests you would like to invite <strong>{maskName(selectedDonorForRequest.userId?.fullName)}</strong> to help with:
            </p>
            <div className="flex flex-col gap-3" style={{ marginBottom: '1.5rem' }}>
              {myActiveRequests.map((req) => (
                <button
                  key={req._id}
                  type="button"
                  onClick={() => {
                    requestDonorMutation.mutate({
                      requestId: req._id,
                      donorUserId: selectedDonorForRequest.userId._id
                    });
                  }}
                  className="btn btn-secondary"
                  style={{ justifyContent: 'flex-start', padding: '1rem', width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}
                  disabled={requestDonorMutation.isPending}
                >
                  <div style={{ fontWeight: 700, color: '#fff' }}>{req.bloodGroup} Needed ({req.component})</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Hospital: {req.hospitalName}</div>
                </button>
              ))}
            </div>
            <button 
              onClick={() => {
                setIsRequestModalOpen(false);
                setSelectedDonorForRequest(null);
              }} 
              className="btn btn-secondary" 
              style={{ width: '100%' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
