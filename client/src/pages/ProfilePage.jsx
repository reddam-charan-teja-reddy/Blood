import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { computeEligibility } from '../lib/eligibility';
import { User, MapPin, Scale, Heart, Shield, ToggleLeft, ToggleRight, Award, Calendar, Check, AlertTriangle, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, updateUser } = useAuthStore();
  const queryClient = useQueryClient();

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

  // Mutation to update donor profile
  const updateProfileMutation = useMutation({
    mutationFn: (data) => api('/donors/profile', { method: 'PUT', body: JSON.stringify(data) }),
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
                  >
                    <option value="">Not Set</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    In MVP mode, self-selecting your blood group marks it verified immediately.
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
              <input 
                type="text" 
                className="form-input" 
                value={profile.state || ''}
                onChange={(e) => handleUpdateField('state', e.target.value)}
              />
            </div>
          </div>

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
    </div>
  );
}
