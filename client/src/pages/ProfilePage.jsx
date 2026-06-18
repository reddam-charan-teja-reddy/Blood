import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { computeEligibility } from '../lib/eligibility';
import { User, MapPin, Scale, Heart, Shield, ToggleLeft, ToggleRight, Award, Calendar, Check, AlertTriangle, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { INDIAN_STATES } from '../utils/indianStates';

export default function ProfilePage() {
  const { user, updateUser, clearAuth } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState('requests');
  const [showDisputeModal, setShowDisputeModal] = React.useState(false);
  const [selectedInterestForDispute, setSelectedInterestForDispute] = React.useState(null);
  const [disputeReason, setDisputeReason] = React.useState('');
  const [disputeEvidence, setDisputeEvidence] = React.useState('');

  // Fetch request history
  const { data: requestHistoryData, isLoading: isRequestHistoryLoading } = useQuery({
    queryKey: ['requestHistory'],
    queryFn: () => api('/auth/history/requests'),
  });

  // Fetch donation history (individual only)
  const { data: donationHistoryData, isLoading: isDonationHistoryLoading } = useQuery({
    queryKey: ['donationHistory'],
    queryFn: () => api('/auth/history/donations'),
    enabled: user?.role === 'INDIVIDUAL',
  });

  // Mutation to delete account
  const deleteAccountMutation = useMutation({
    mutationFn: () => api('/auth/me', { method: 'DELETE' }),
    onSuccess: () => {
      clearAuth();
      toast.success('Your account has been deleted successfully');
      navigate('/');
    },
    onError: (err) => toast.error(err.message || 'Failed to delete account'),
  });

  const disputeMutation = useMutation({
    mutationFn: ({ interestId, reason, evidence }) => api(`/donors/interests/${interestId}/dispute`, {
      method: 'POST',
      body: JSON.stringify({ reason, evidence }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['donationHistory'] });
      toast.success('Dispute filed successfully! Administration will review your claim.');
      setShowDisputeModal(false);
      setDisputeReason('');
      setDisputeEvidence('');
    },
    onError: (err) => toast.error(err.message || 'Failed to file dispute'),
  });

  // Fetch complete profile details (/auth/me returns user details + populated profile)
  const { data: meData, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api('/auth/me'),
  });

  // Fetch eligibility details (individual only)
  const { data: eligibilityData } = useQuery({
    queryKey: ['eligibility'],
    queryFn: () => api('/donors/eligibility'),
    enabled: user?.role === 'INDIVIDUAL' && meData?.profile?.bloodGroupVerified,
  });

  const profile = meData?.profile || {};

  const [isLoadingUpload, setIsLoadingUpload] = React.useState(false);

  const getDocumentUrl = (path) => {
    if (!path) return '';
    const origin = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace('/api/v1', '');
    return `${origin}${path}`;
  };

  const handleDonorProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('document', file);

    setIsLoadingUpload(true);
    try {
      await api('/donors/profile', {
        method: 'PUT',
        body: formData,
      });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Proof card uploaded successfully! Pending Admin review.');
    } catch (err) {
      toast.error(err.message || 'Failed to upload proof card');
    } finally {
      setIsLoadingUpload(false);
    }
  };

  const handleOrgLicenseUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('document', file);

    setIsLoadingUpload(true);
    try {
      await api('/orgs/profile', {
        method: 'PUT',
        body: formData,
      });
      queryClient.invalidateQueries({ queryKey: ['me'] });
      toast.success('Hospital license uploaded successfully! Pending Admin verification.');
    } catch (err) {
      toast.error(err.message || 'Failed to upload hospital license');
    } finally {
      setIsLoadingUpload(false);
    }
  };

  // Mutation to update donor profile
  const updateProfileMutation = useMutation({
    mutationFn: (data) => {
      const endpoint = user?.role === 'ORG' ? '/orgs/profile' : '/donors/profile';
      return api(endpoint, { method: 'PUT', body: JSON.stringify(data) });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      queryClient.invalidateQueries({ queryKey: ['eligibility'] });
      toast.success('Profile updated successfully');
    },
    onError: (err) => toast.error(err.message || 'Failed to update profile'),
  });

  // Mutation to toggle availability
  const toggleAvailabilityMutation = useMutation({
    mutationFn: (available) => api('/donors/availability', { method: 'PUT', body: JSON.stringify({ available }) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['me'] });
      if (data.available) {
        toast.success('You are now active as an available donor!');
      } else {
        toast.success('Availability turned off');
      }
    },
    onError: (err) => toast.error(err.message || 'Failed to toggle availability'),
  });

  const handleUpdateField = (field, val) => {
    updateProfileMutation.mutate({ [field]: val });
  };

  const handleToggleAvailability = () => {
    const nextVal = !profile.available;
    
    if (nextVal) {
      // Client-side quick check first before calling API
      const check = computeEligibility(profile, 'WHOLE_BLOOD');
      if (!check.eligible) {
        toast.error(check.message, { duration: 5000 });
        return;
      }
    }
    
    toggleAvailabilityMutation.mutate(nextVal);
  };

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '5rem' }}><Loader2 className="animate-spin" size={32} color="#ef4444" /></div>;
  }

  return (
    <div className="fadeIn" style={{ maxWidth: '850px', margin: '0 auto' }}>
      
      {/* Profile Header */}
      <div className="glass-panel p-6 m-b-6 flex align-center justify-between flex-wrap gap-4">
        <div className="flex align-center gap-4">
          <div className="flex align-center justify-center" style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: user?.role === 'ADMIN' ? 'var(--warning-color)' : 'var(--primary-color)',
            color: '#fff',
            fontWeight: 800,
            fontSize: '1.5rem',
            boxShadow: '0 4px 14px rgba(239, 68, 68, 0.3)'
          }}>
            {user?.fullName?.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>
              {user?.fullName}
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              Phone: {user?.phone} | Role: <strong style={{ color: 'var(--primary-color)' }}>{user?.role}</strong>
            </p>
          </div>
        </div>

        {/* Action tags */}
        {user?.role === 'ORG' && (
          <span className={`badge ${profile.verificationStatus === 'VERIFIED' ? 'badge-success' : 'badge-high'}`}>
            {profile.verificationStatus === 'VERIFIED' ? '✓ Verified Hospital' : '⏳ Verification Pending'}
          </span>
        )}

        {user?.role === 'INDIVIDUAL' && profile.bloodGroupVerified && (
          <span className="badge badge-success">
            ✓ Verified Blood Group ({profile.bloodGroup})
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6" style={{ gridTemplateColumns: user?.role === 'ORG' ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
        
        {/* Left Column: Profile Settings & Info */}
        <div className="flex flex-col gap-6">
          <div className="card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }} className="flex align-center gap-2">
              <User size={18} color="var(--primary-color)" />
              <span>Personal Settings</span>
            </h3>

            {user?.role === 'INDIVIDUAL' && (
              <>
                {/* Blood Group Setup */}
                <div className="form-group">
                  <label className="form-label">Blood Group</label>
                  <select 
                    className="form-select"
                    value={profile.bloodGroup || ''}
                    onChange={(e) => handleUpdateField('bloodGroup', e.target.value)}
                    disabled={!!profile.bloodGroup}
                  >
                    <option value="">Not Set</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {profile.bloodGroup ? "Blood group is locked once selected. Contact admin to request changes." : "In MVP mode, self-selecting your blood group marks it verified immediately."}
                  </p>
                </div>

                {/* Weight Input */}
                <div className="form-group">
                  <label className="form-label">Weight (Kg)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                      <Scale size={16} />
                    </span>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={profile.weightKg || ''}
                      onChange={(e) => handleUpdateField('weightKg', parseFloat(e.target.value) || '')}
                      style={{ paddingLeft: '2.5rem' }}
                      placeholder="e.g. 70"
                    />
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Must be at least 45 kg to toggle available for donations.
                  </p>
                </div>

                {/* Platelet Opt In */}
                <div className="form-group" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
                  <div>
                    <label className="form-label" style={{ marginBottom: 0 }}>Platelet Donor Opt-In</label>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', maxWidth: '240px' }}>
                      Opt-in to allow matching for single-donor platelets (apheresis).
                    </p>
                  </div>
                  <button 
                    onClick={() => handleUpdateField('plateletEligible', !profile.plateletEligible)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    {profile.plateletEligible ? (
                      <ToggleRight size={38} color="var(--primary-color)" />
                    ) : (
                      <ToggleLeft size={38} color="var(--text-muted)" />
                    )}
                  </button>
                </div>
              </>
            )}

            {/* Address fields */}
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">City</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                  <MapPin size={16} />
                </span>
                <input 
                  type="text" 
                  className="form-input" 
                  value={profile.city || ''}
                  onChange={(e) => handleUpdateField('city', e.target.value)}
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">State</label>
              <select 
                className="form-select"
                value={profile.state || ''}
                onChange={(e) => handleUpdateField('state', e.target.value)}
              >
                <option value="">Choose State...</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Geolocation update — enables geospatial donor matching */}
            <div className="form-group" style={{ marginTop: '0.5rem' }}>
              <label className="form-label">Location for Matching</label>
              <div style={{
                padding: '0.875rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                backgroundColor: 'rgba(15, 23, 42, 0.3)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
              }}>
                <div>
                  <p style={{ fontWeight: 600, color: profile.location?.coordinates?.length ? 'var(--success-color)' : '#fff', fontSize: '0.875rem' }}>
                    {profile.location?.coordinates?.length
                      ? `📍 Location set (${profile.location.coordinates[1].toFixed(3)}°N, ${profile.location.coordinates[0].toFixed(3)}°E)`
                      : '📍 Location not set'}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {profile.location?.coordinates?.length
                      ? 'Geospatial matching active — you\'ll be found by donors near your area.'
                      : 'Set your GPS location to get matched with blood requests nearby.'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ whiteSpace: 'nowrap' }}
                  onClick={() => {
                    if (!navigator.geolocation) {
                      toast.error('Geolocation not supported by your browser');
                      return;
                    }
                    navigator.geolocation.getCurrentPosition(
                      (pos) => {
                        updateProfileMutation.mutate({
                          latitude: pos.coords.latitude,
                          longitude: pos.coords.longitude,
                        });
                      },
                      () => toast.error('Could not get location. Please allow location access.'),
                      { timeout: 8000 }
                    );
                  }}
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Update Location'}
                </button>
              </div>
            </div>
          </div>


          {/* Hospital Verification Document Card */}
          {user?.role === 'ORG' && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }} className="flex align-center gap-2">
                <Shield size={18} color="var(--primary-color)" />
                <span>Hospital License Verification</span>
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Please upload a copy of your hospital registration license or NGO certificate to verify your account.
              </p>
              
              {profile.documentPath ? (
                <div style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem'
                }} className="flex justify-between align-center">
                  <div>
                    <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>✓ License Uploaded</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Verification Status: <strong>{profile.verificationStatus}</strong>
                    </p>
                  </div>
                  <a 
                    href={getDocumentUrl(profile.documentPath)} 
                    target="_blank" 
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    View Uploaded File
                  </a>
                </div>
              ) : (
                <div style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(245, 158, 11, 0.05)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem',
                  color: 'var(--warning-color)',
                  fontWeight: 500
                }}>
                  ⚠️ No license document uploaded yet.
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Upload License (PDF or Image)</label>
                <input 
                  type="file" 
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="form-input" 
                  onChange={handleOrgLicenseUpload}
                  disabled={isLoadingUpload}
                />
              </div>
            </div>
          )}

          {/* Blood Group Verification Proof Card */}
          {user?.role === 'INDIVIDUAL' && profile.bloodGroup && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }} className="flex align-center gap-2">
                <Shield size={18} color="var(--primary-color)" />
                <span>Blood Group Verification Proof</span>
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                Upload an official medical report or donor card showing your blood group to get verified.
              </p>

              {profile.documentPath ? (
                <div style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem'
                }} className="flex justify-between align-center">
                  <div>
                    <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>✓ Proof Uploaded</span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      Verification Status: <strong>{profile.bloodGroupVerified ? 'Verified' : 'Pending Review'}</strong>
                    </p>
                  </div>
                  <a 
                    href={getDocumentUrl(profile.documentPath)} 
                    target="_blank" 
                    rel="noreferrer"
                    className="btn btn-secondary btn-sm"
                  >
                    View Uploaded File
                  </a>
                </div>
              ) : (
                <div style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(245, 158, 11, 0.05)',
                  border: '1px solid rgba(245, 158, 11, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  marginBottom: '1rem',
                  color: 'var(--warning-color)',
                  fontWeight: 500
                }}>
                  ⚠️ No proof document uploaded yet.
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Upload Proof Card (PDF or Image)</label>
                <input 
                  type="file" 
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="form-input" 
                  onChange={handleDonorProofUpload}
                  disabled={isLoadingUpload}
                />
              </div>
            </div>
          )}

          {/* Individual Availability & Reputation */}
          {user?.role === 'INDIVIDUAL' && (
            <div className="card">
              <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }} className="flex align-center gap-2">
                <Shield size={18} color="var(--primary-color)" />
                <span>Donor Dashboard</span>
              </h3>

              {/* Availability Toggle */}
              <div className="flex justify-between align-center p-4" style={{
                backgroundColor: 'rgba(15, 23, 42, 0.4)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-color)',
                marginBottom: '1.5rem'
              }}>
                <div>
                  <h4 style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>Active Availability Status</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '240px' }}>
                    Turn on to appear in emergency searches and receive SMS alerts.
                  </p>
                </div>
                <button 
                  onClick={handleToggleAvailability}
                  style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                  disabled={toggleAvailabilityMutation.isPending}
                >
                  {profile.available ? (
                    <ToggleRight size={44} color="var(--success-color)" />
                  ) : (
                    <ToggleLeft size={44} color="var(--text-muted)" />
                  )}
                </button>
              </div>

              {/* Reputation Statistics */}
              <div className="grid grid-cols-2 gap-4">
                <div style={{
                  backgroundColor: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  textAlign: 'center'
                }}>
                  <Award size={20} color="var(--success-color)" style={{ margin: '0 auto 0.25rem' }} />
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{profile.totalDonations || 0}</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Donations Completed</p>
                </div>

                <div style={{
                  backgroundColor: profile.noShowCount > 0 ? 'rgba(244, 63, 94, 0.05)' : 'rgba(100, 116, 139, 0.05)',
                  border: profile.noShowCount > 0 ? '1px solid rgba(244, 63, 94, 0.2)' : '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1rem',
                  textAlign: 'center'
                }}>
                  <AlertTriangle size={20} color={profile.noShowCount > 0 ? 'var(--danger-color)' : 'var(--text-secondary)'} style={{ margin: '0 auto 0.25rem' }} />
                  <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>{profile.noShowCount || 0}</span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>No-Show Flags</p>
                </div>
              </div>
            </div>
          )}
          {/* Delete Account Card */}
          <div className="card" style={{ borderColor: 'rgba(239, 68, 68, 0.2)', backgroundColor: 'rgba(239, 68, 68, 0.02)', marginTop: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--danger-color)' }} className="flex align-center gap-2">
              <Trash2 size={18} color="var(--danger-color)" />
              <span>Danger Zone</span>
            </h3>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Once you delete your account, all your profile details, requests history, and donation records will be permanently removed.
            </p>
            <button 
              onClick={() => setShowDeleteModal(true)} 
              className="btn btn-danger" 
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
            >
              <Trash2 size={16} />
              <span>Delete My Account</span>
            </button>
          </div>
        </div>

        {/* Right Column: Eligibility Status (Individual Only) */}
        {user?.role === 'INDIVIDUAL' && (
          <div className="card">
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }} className="flex align-center gap-2">
              <Calendar size={18} color="var(--primary-color)" />
              <span>Eligibility Panel</span>
            </h3>

            {!profile.bloodGroupVerified ? (
              <div style={{
                padding: '1.5rem',
                textAlign: 'center',
                backgroundColor: 'rgba(245, 158, 11, 0.05)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--warning-color)'
              }} className="flex flex-col align-center gap-2">
                <AlertCircle size={28} />
                <h4 style={{ fontWeight: 700 }}>Blood Group Not Verified</h4>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  Please select your blood group in the personal settings first to activate your donor capabilities and see eligibility rules.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {eligibilityData ? (
                  Object.keys(eligibilityData).map((comp) => {
                    const status = eligibilityData[comp];
                    const label = comp === 'WHOLE_BLOOD' ? 'Whole Blood' 
                                : comp === 'PLATELETS' ? 'Platelets' 
                                : comp === 'PLASMA' ? 'Plasma' : 'Double RBC';
                    
                    return (
                      <div 
                        key={comp} 
                        style={{
                          backgroundColor: 'rgba(15, 23, 42, 0.3)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          padding: '1rem',
                        }}
                      >
                        <div className="flex justify-between align-center m-b-2">
                          <h4 style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>{label}</h4>
                          <span className={`badge ${status.eligible ? 'badge-success' : 'badge-high'}`}>
                            {status.eligible ? 'Eligible' : 'Ineligible'}
                          </span>
                        </div>
                        <p style={{ fontSize: '0.78125rem', color: status.eligible ? 'var(--success-color)' : 'var(--text-secondary)' }} className="flex align-center gap-1">
                          {status.eligible ? (
                            <>
                              <Check size={14} />
                              <span>{status.message || 'You can donate this component now!'}</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle size={14} color="var(--warning-color)" />
                              <span>{status.message || 'Rest period or opt-in constraint applies.'}</span>
                            </>
                          )}
                        </p>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>
                    Loading eligibility calculations...
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* History Sections */}
      <div className="card m-t-6" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
        <div className="flex gap-4 border-b m-b-4" style={{ borderColor: 'var(--border-color)', paddingBottom: '0.5rem', marginBottom: '1.5rem' }}>
          <button 
            onClick={() => setActiveTab('requests')}
            style={{ 
              background: 'none', 
              border: 'none', 
              color: activeTab === 'requests' ? 'var(--primary-color)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              paddingBottom: '0.25rem',
              borderBottom: activeTab === 'requests' ? '2px solid var(--primary-color)' : 'none'
            }}
          >
            My Requests ({requestHistoryData?.length || 0})
          </button>
          {user?.role === 'INDIVIDUAL' && (
            <button 
              onClick={() => setActiveTab('donations')}
              style={{ 
                background: 'none', 
                border: 'none', 
                color: activeTab === 'donations' ? 'var(--primary-color)' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                paddingBottom: '0.25rem',
                borderBottom: activeTab === 'donations' ? '2px solid var(--primary-color)' : 'none'
              }}
            >
              My Donations ({donationHistoryData?.length || 0})
            </button>
          )}
        </div>

        {activeTab === 'requests' && (
          <div>
            {isRequestHistoryLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="animate-spin" size={24} color="var(--primary-color)" /></div>
            ) : !requestHistoryData || requestHistoryData.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No requests created yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {requestHistoryData.map((req) => (
                  <div 
                    key={req._id} 
                    className="flex justify-between align-center p-4 glass-panel flex-wrap gap-2"
                    style={{ cursor: 'pointer', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                    onClick={() => navigate(`/request/${req._id}`)}
                  >
                    <div>
                      <h4 style={{ fontWeight: 700, color: '#fff' }}>
                        {req.bloodGroup} Blood Needed ({req.component})
                      </h4>
                      <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                        Hospital: {req.hospitalName}, {req.hospitalCity} | Required: {new Date(req.requiredBy).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex align-center gap-3">
                      <span className={`badge ${
                        req.status === 'ACTIVE' ? 'badge-success' : 
                        req.status === 'FULFILLED' ? 'badge-success' : 'badge-high'
                      }`}>
                        {req.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'donations' && user?.role === 'INDIVIDUAL' && (
          <div>
            {isDonationHistoryLoading ? (
              <div style={{ padding: '2rem', textAlign: 'center' }}><Loader2 className="animate-spin" size={24} color="var(--primary-color)" /></div>
            ) : !donationHistoryData || donationHistoryData.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '2rem' }}>No donation interests logged yet.</p>
            ) : (
              <div className="flex flex-col gap-4">
                {donationHistoryData.map((interest) => {
                  const req = interest.requestId;
                  if (!req) return null;
                  return (
                    <div 
                      key={interest._id} 
                      className="flex justify-between align-center p-4 glass-panel flex-wrap gap-2"
                      style={{ cursor: 'pointer', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)' }}
                      onClick={() => navigate(`/request/${req._id}`)}
                    >
                      <div>
                        <h4 style={{ fontWeight: 700, color: '#fff' }}>
                          Interested in helping with {req.bloodGroup} ({req.component})
                        </h4>
                        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                          Hospital: {req.hospitalName}, {req.hospitalCity} | ETA: {interest.eta ? new Date(interest.eta).toLocaleString() : 'Not set'}
                        </p>
                      </div>
                      <div className="flex align-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <span className={`badge ${
                          interest.status === 'DONATED' ? 'badge-success' : 
                          interest.status === 'NO_SHOW' ? 'badge-high' : 'badge-low'
                        }`}>
                          {interest.status}
                        </span>
                        {interest.status === 'NO_SHOW' && (
                          <button 
                            onClick={() => {
                              setSelectedInterestForDispute(interest._id);
                              setShowDisputeModal(true);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem', borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}
                          >
                            Dispute Penalty
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ borderColor: 'var(--danger-color)' }}>
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1rem' }} className="flex align-center gap-2">
              <AlertTriangle color="var(--danger-color)" />
              <span>Confirm Permanent Account Deletion</span>
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Are you absolutely sure you want to delete your account? This action is irreversible and will permanently purge all your data from the Blood Network platform.
            </p>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowDeleteModal(false)} 
                className="btn btn-secondary flex-1"
                disabled={deleteAccountMutation.isPending}
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteAccountMutation.mutate()} 
                className="btn btn-danger flex-1"
                disabled={deleteAccountMutation.isPending}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                {deleteAccountMutation.isPending ? (
                  <>
                    <Loader2 className="animate-spin" size={16} />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={16} />
                    <span>Yes, Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {showDisputeModal && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ backgroundColor: 'var(--surface-color)', maxWidth: '500px' }}>
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1rem' }} className="flex align-center gap-2">
              <AlertCircle color="var(--primary-color)" />
              <span>File Dispute claim</span>
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              If you were marked as a no-show but actually donated, were rejected for medical reasons, or couldn't reach the venue due to an emergency, please file a claim below. Admin will review it.
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              disputeMutation.mutate({
                interestId: selectedInterestForDispute,
                reason: disputeReason,
                evidence: disputeEvidence
              });
            }} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label">Reason details (Mandatory)</label>
                <textarea 
                  className="form-input" 
                  rows={4}
                  placeholder="Explain exactly what happened..."
                  value={disputeReason}
                  onChange={e => setDisputeReason(e.target.value)}
                  style={{ resize: 'vertical' }}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Supporting Evidence / Text (Optional)</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Donation receipt details or links to evidence"
                  value={disputeEvidence}
                  onChange={e => setDisputeEvidence(e.target.value)}
                />
              </div>

              <div className="flex gap-3" style={{ marginTop: '0.5rem' }}>
                <button 
                  type="button"
                  onClick={() => setShowDisputeModal(false)} 
                  className="btn btn-secondary flex-1"
                  disabled={disputeMutation.isPending}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary flex-1"
                  disabled={disputeMutation.isPending}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  {disputeMutation.isPending ? (
                    <>
                      <Loader2 className="animate-spin" size={16} />
                      <span>Filing...</span>
                    </>
                  ) : (
                    <span>Submit Dispute</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
