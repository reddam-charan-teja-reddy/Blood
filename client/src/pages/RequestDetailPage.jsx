import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import BloodGroupBadge from '../components/shared/BloodGroupBadge';
import UrgencyChip from '../components/shared/UrgencyChip';
import TrustBadge from '../components/shared/TrustBadge';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { MapPin, Phone, User, Calendar, ShieldAlert, Clock, Share2, Clipboard, MessageCircle, Check, AlertTriangle, Loader2, Heart } from 'lucide-react';
import toast from 'react-hot-toast';

export default function RequestDetailPage() {
  const { id, token } = useParams(); // URL params could be :id or share :token
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuthStore();

  const [eta, setEta] = useState('');
  const [otp, setOtp] = useState('');
  const [isInterestModalOpen, setIsInterestModalOpen] = useState(false);
  const [revealModalOpen, setRevealModalOpen] = useState(false);
  const [selectedInterest, setSelectedInterest] = useState(null);
  
  // Outcome reporting states
  const [outcomeModalOpen, setOutcomeModalOpen] = useState(false);
  const [selectedInterestForOutcome, setSelectedInterestForOutcome] = useState(null);
  const [outcome, setOutcome] = useState('DONATED');
  const [outcomeReason, setOutcomeReason] = useState('');

  const [isActionLoading, setIsActionLoading] = useState(false);

  // 1. Query request details
  const { data: requestDetails, isLoading, error } = useQuery({
    queryKey: ['request', id || token],
    queryFn: () => {
      if (token) {
        return api(`/requests/r/${token}`);
      }
      return api(`/requests/${id}`);
    },
    enabled: !!(id || token),
  });

  const request = requestDetails?.request;
  const interests = requestDetails?.interests || [];

  const isOwner = user && request && request.requesterId?._id === user.id;
  const isAdmin = user?.role === 'ADMIN';

  // Check if current user is an interested donor
  const myInterest = user && interests.find(i => i.donorId?._id === user.id);

  // Mutations
  const expressInterestMutation = useMutation({
    mutationFn: (data) => api(`/requests/${request?._id}/interest`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      toast.success('Interest expressed successfully!');
      setIsInterestModalOpen(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to express interest'),
  });

  const initiateRevealMutation = useMutation({
    mutationFn: (interestId) => api(`/requests/${request?._id}/interest/${interestId}/reveal`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      toast.success('OTP sent to donor! Check console logs.');
      setRevealModalOpen(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to initiate reveal'),
  });

  const confirmRevealMutation = useMutation({
    mutationFn: ({ interestId, otp }) => api(`/requests/${request?._id}/interest/${interestId}/reveal/confirm`, {
      method: 'POST',
      body: JSON.stringify({ otp }),
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      toast.success('OTP verified! Contact details unlocked.');
      setOtp('');
    },
    onError: (err) => toast.error(err.message || 'Invalid verification OTP code'),
  });

  const reportOutcomeMutation = useMutation({
    mutationFn: ({ interestId, outcome, outcomeReason }) => api(`/requests/${request?._id}/interest/${interestId}/outcome`, {
      method: 'POST',
      body: JSON.stringify({ outcome, outcomeReason }),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      toast.success('Donation outcome reported successfully!');
      setOutcomeModalOpen(false);
      setOutcome('DONATED');
      setOutcomeReason('');
    },
    onError: (err) => toast.error(err.message || 'Failed to report outcome'),
  });

  const extendMutation = useMutation({
    mutationFn: () => api(`/requests/${request?._id}/extend`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      toast.success('Request expiry extended by 24 hours');
    },
    onError: (err) => toast.error(err.message || 'Failed to extend request'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api(`/requests/${request?._id}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      toast.success('Request cancelled');
      navigate('/home');
    },
    onError: (err) => toast.error(err.message || 'Failed to cancel request'),
  });

  const fulfilMutation = useMutation({
    mutationFn: () => api(`/requests/${request?._id}/fulfil`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      toast.success('Request marked fulfilled successfully!');
    },
    onError: (err) => toast.error(err.message || 'Failed to fulfil request'),
  });

  const flagMutation = useMutation({
    mutationFn: () => api(`/requests/${request?._id}/flag`, { method: 'POST' }),
    onSuccess: () => {
      toast.success('Request reported. Administration will review.');
    },
  });

  const handleShare = () => {
    const url = `${window.location.origin}/r/${request.shareToken}`;
    navigator.clipboard.writeText(url);
    toast.success('Share link copied to clipboard!');
    
    // Attempt opening WhatsApp share window
    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(`⚠️ EMERGENCY: ${request.bloodGroup} ${getComponentLabel(request.component)} needed at ${request.hospitalName}, ${request.hospitalCity}. Open link to help: ${url}`)}`;
    window.open(waUrl, '_blank');
  };

  const getComponentLabel = (comp) => {
    switch (comp) {
      case 'WHOLE_BLOOD': return 'Whole Blood';
      case 'PLATELETS': return 'Platelets';
      case 'PLASMA': return 'Plasma';
      case 'RBC': return 'Double RBC';
      default: return comp || '';
    }
  };

  if (isLoading) return <LoadingSpinner fullPage />;
  if (error || !request) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <h2>Request Not Found</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '1rem' }}>
          This blood request link may have expired or is invalid.
        </p>
        <Link to="/home" className="btn btn-primary" style={{ marginTop: '1.5rem' }}>Back to Home</Link>
      </div>
    );
  }

  return (
    <div className="fadeIn" style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      {/* Top action bar */}
      <div className="flex justify-between align-center m-b-6 flex-wrap gap-2">
        <Link to="/home" className="btn btn-secondary btn-sm">
          ← Back to Feed
        </Link>
        <div className="flex gap-2">
          <button onClick={handleShare} className="btn btn-secondary btn-sm flex align-center gap-1">
            <Share2 size={14} />
            <span>Share to WhatsApp</span>
          </button>
          {!isOwner && isAuthenticated && (
            <button onClick={() => flagMutation.mutate()} className="btn btn-secondary btn-sm flex align-center gap-1" style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}>
              <AlertTriangle size={14} />
              <span>Report Request</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6" style={{ gridTemplateColumns: isOwner || isAdmin ? '1fr' : 'repeat(2, minmax(0, 1fr))' }}>
        
        {/* Core Request Details Card */}
        <div className="card flex flex-col gap-6" style={{ height: 'fit-content' }}>
          <div>
            <div className="flex justify-between align-center m-b-4">
              <div className="flex align-center gap-2">
                <BloodGroupBadge group={request.bloodGroup} />
                <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {getComponentLabel(request.component)}
                </span>
              </div>
              <UrgencyChip urgency={request.urgency} />
            </div>

            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>
              {request.unitsNeeded} Units Required
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Status: <strong style={{ color: request.status === 'ACTIVE' ? 'var(--primary-color)' : 'var(--success-color)' }}>{request.status}</strong>
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem' }} className="flex flex-col gap-4">
            <div className="flex align-center gap-3">
              <MapPin size={20} color="var(--primary-color)" />
              <div>
                <h4 style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>Hospital Destination</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {request.hospitalName}, {request.hospitalCity}, {request.hospitalState}
                </p>
              </div>
            </div>

            <div className="flex align-center gap-3">
              <Clock size={20} color="var(--primary-color)" />
              <div>
                <h4 style={{ fontWeight: 600, color: '#fff', fontSize: '0.9375rem' }}>Required By Time</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  {new Date(request.requiredBy).toLocaleString('en-IN')}
                </p>
              </div>
            </div>

            {/* Unlocked fields */}
            {request.wardNumber && (
              <div className="flex align-center gap-3" style={{ backgroundColor: 'rgba(16, 185, 129, 0.05)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                <Check size={20} color="var(--success-color)" />
                <div>
                  <h4 style={{ fontWeight: 600, color: '#fff', fontSize: '0.875rem' }}>Ward Details (Unlocked)</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    Ward/Room: {request.wardNumber} {request.attendingDoctor && `| Doctor: ${request.attendingDoctor}`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Owner options */}
          {isOwner && request.status === 'ACTIVE' && (
            <div className="flex flex-col gap-2" style={{ marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
              <h4 style={{ fontWeight: 600, color: '#fff', fontSize: '0.875rem', marginBottom: '0.25rem' }}>Requester Actions</h4>
              <div className="flex gap-2">
                <button onClick={() => extendMutation.mutate()} className="btn btn-secondary flex-1" style={{ fontSize: '0.8125rem' }}>
                  Extend 24h
                </button>
                <button onClick={() => fulfilMutation.mutate()} className="btn btn-success flex-1" style={{ fontSize: '0.8125rem' }}>
                  Mark Fulfilled
                </button>
                <button onClick={() => cancelMutation.mutate()} className="btn btn-danger flex-1" style={{ fontSize: '0.8125rem' }}>
                  Cancel Request
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Variant B: Donor Actions & Reveal Panel */}
        {!isOwner && !isAdmin && (
          <div className="flex flex-col gap-6">
            
            {/* Express Interest */}
            {!myInterest && request.status === 'ACTIVE' && (
              <div className="card text-center flex flex-col align-center gap-4">
                <Heart size={36} color="var(--primary-color)" />
                <h3 style={{ fontWeight: 700, color: '#fff' }}>Can you donate?</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  By expressing interest, you confirm you are available and match the criteria. Contact details will be revealed after patient confirmation.
                </p>
                <button 
                  onClick={() => setIsInterestModalOpen(true)}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  I Can Donate
                </button>
              </div>
            )}

            {/* Interest Expressed - Pending Reveal */}
            {myInterest && myInterest.status === 'INTERESTED' && (
              <div className="card text-center flex flex-col align-center gap-4">
                <Clock size={36} color="var(--warning-color)" />
                <h3 style={{ fontWeight: 700, color: '#fff' }}>Interest Registered</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Waiting for the patient/requester to review your details and initiate contact exchange. You will receive an SMS OTP when they trigger the reveal.
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Your ETA: {myInterest.eta ? new Date(myInterest.eta).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Not specified'}
                </p>
              </div>
            )}

            {/* OTP Verification entry for Donor */}
            {myInterest && myInterest.status === 'REVEAL_PENDING' && (
              <div className="card flex flex-col gap-4" style={{ borderColor: 'var(--warning-color)' }}>
                <div className="flex align-center gap-2" style={{ color: 'var(--warning-color)', fontWeight: 700 }}>
                  <ShieldAlert size={20} />
                  <span>Verify Contact Reveal OTP</span>
                </div>
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                  The patient has initiated a contact exchange. Please enter the 6-digit OTP code sent to your phone.
                </p>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  confirmRevealMutation.mutate({ interestId: myInterest._id, otp });
                }} className="flex flex-col gap-3">
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Enter 6-digit OTP"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    style={{ textAlign: 'center', fontSize: '1.25rem', letterSpacing: '0.2em' }}
                    required
                  />
                  <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={confirmRevealMutation.isPending}>
                    {confirmRevealMutation.isPending ? 'Verifying...' : 'Confirm OTP & Reveal Contacts'}
                  </button>
                </form>
              </div>
            )}

            {/* Contact Unlocked state */}
            {myInterest && ['CONTACT_REVEALED', 'CONFIRMED', 'DONATED'].includes(myInterest.status) && (
              <div className="card flex flex-col gap-4" style={{ borderColor: 'var(--success-color)' }}>
                <h3 style={{ fontWeight: 700, color: '#fff' }} className="flex align-center gap-2">
                  <Check size={20} color="var(--success-color)" />
                  <span>Contacts Exchanged!</span>
                </h3>
                
                <div style={{
                  padding: '1rem',
                  backgroundColor: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: 'var(--radius-sm)'
                }} className="flex flex-col gap-2">
                  <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    Reach out to coordinate donation details:
                  </p>
                  <div className="flex align-center gap-2" style={{ marginTop: '0.5rem', fontWeight: 700, fontSize: '1.125rem', color: '#fff' }}>
                    <Phone size={18} color="var(--success-color)" />
                    <span>{requestDetails.patientPhone || 'Revealed Phone'}</span>
                  </div>
                </div>

                {/* Outcome Reporting trigger */}
                {myInterest.status !== 'DONATED' && (
                  <button 
                    onClick={() => {
                      setSelectedInterestForOutcome(myInterest._id);
                      setOutcomeModalOpen(true);
                    }}
                    className="btn btn-success"
                    style={{ width: '100%', marginTop: '0.5rem' }}
                  >
                    Report Donation Outcome
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Variant A: Owner (Requester) Slots list */}
      {(isOwner || isAdmin) && (
        <div className="card m-y-4">
          <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1rem' }} className="flex align-center gap-2">
            <User size={18} color="var(--primary-color)" />
            <span>Interested Donors ({interests.length})</span>
          </h3>

          {interests.length === 0 ? (
            <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              No donors have expressed interest yet. Sharing your request helps spread awareness!
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {interests.map((interest) => (
                <div 
                  key={interest._id} 
                  className="flex justify-between align-center p-4 flex-wrap gap-4" 
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.3)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)'
                  }}
                >
                  <div className="flex align-center gap-3">
                    <div className="flex align-center justify-center" style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--border-color)',
                      color: '#fff',
                      fontWeight: 800
                    }}>
                      {interest.donorId?.fullName?.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 700, color: '#fff' }}>
                        {interest.donorId?.fullName}
                      </h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        ETA: <strong style={{ color: '#fff' }}>{interest.eta ? new Date(interest.eta).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Not specified'}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Actions column based on slot status */}
                  <div>
                    {interest.status === 'INTERESTED' && (
                      <button 
                        onClick={() => {
                          setSelectedInterest(interest._id);
                          setRevealModalOpen(true);
                        }}
                        className="btn btn-primary btn-sm"
                      >
                        Reveal Contact
                      </button>
                    )}

                    {interest.status === 'REVEAL_PENDING' && (
                      <span style={{ fontSize: '0.8125rem', color: 'var(--warning-color)', fontWeight: 600 }}>
                        ⏳ Waiting for OTP...
                      </span>
                    )}

                    {interest.status === 'CONTACT_REVEALED' && (
                      <div className="flex align-center gap-4">
                        <span className="flex align-center gap-1" style={{ fontWeight: 600, color: 'var(--success-color)', fontSize: '0.875rem' }}>
                          <Phone size={14} />
                          <span>{interest.donorId?.phone}</span>
                        </span>
                        <button 
                          onClick={() => {
                            setSelectedInterestForOutcome(interest._id);
                            setOutcomeModalOpen(true);
                          }}
                          className="btn btn-success btn-sm"
                        >
                          Report Outcome
                        </button>
                      </div>
                    )}

                    {['DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED'].includes(interest.status) && (
                      <span className="badge badge-success">
                        Outcome: {interest.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 1. Modal: ETA Input for expressing interest */}
      {isInterestModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ backgroundColor: 'var(--surface-color)' }}>
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>Enter Arrival ETA</h3>
            <div className="form-group">
              <label className="form-label">Estimated Time of Arrival (ETA)</label>
              <input 
                type="datetime-local" 
                className="form-input" 
                value={eta}
                onChange={e => setEta(e.target.value)}
                min={new Date().toISOString().substring(0, 16)}
                required
              />
            </div>
            <div className="flex gap-3" style={{ marginTop: '1rem' }}>
              <button onClick={() => setIsInterestModalOpen(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button 
                onClick={() => expressInterestMutation.mutate({ eta })} 
                className="btn btn-primary flex-1"
                disabled={expressInterestMutation.isPending}
              >
                {expressInterestMutation.isPending ? 'Submitting...' : 'Submit Interest'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Modal: Contact Reveal Confirmation Warning */}
      {revealModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1rem' }} className="flex align-center gap-1">
              <ShieldAlert color="var(--primary-color)" />
              <span>Confirm Contact Exchange</span>
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              By continuing, a verification OTP will be sent to the donor. Once they verify, your phone number and ward details will be shared with them, and their phone number will be shared with you.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setRevealModalOpen(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button 
                onClick={() => initiateRevealMutation.mutate(selectedInterest)} 
                className="btn btn-primary flex-1"
                disabled={initiateRevealMutation.isPending}
              >
                Send OTP & Exchange
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal: Outcome Reporting Form */}
      {outcomeModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content card">
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1.25rem' }}>Report Donation Outcome</h3>
            
            <div className="form-group">
              <label className="form-label">What happened?</label>
              <select className="form-select" value={outcome} onChange={e => setOutcome(e.target.value)}>
                <option value="DONATED">Donated successfully</option>
                <option value="TURNED_AWAY">Rejected at hospital (Medical reasons)</option>
                <option value="NO_SHOW">Donor did not arrive (No-show)</option>
                <option value="DECLINED">Donor withdrew interest / backed out</option>
              </select>
            </div>

            {(outcome === 'TURNED_AWAY' || outcome === 'DECLINED') && (
              <div className="form-group">
                <label className="form-label">Reason Details</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. Hemoglobin was low / unexpected emergency" 
                  value={outcomeReason}
                  onChange={e => setOutcomeReason(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="flex gap-3" style={{ marginTop: '1.5rem' }}>
              <button onClick={() => setOutcomeModalOpen(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button 
                onClick={() => reportOutcomeMutation.mutate({ 
                  interestId: selectedInterestForOutcome, 
                  outcome, 
                  outcomeReason 
                })} 
                className="btn btn-success flex-1"
                disabled={reportOutcomeMutation.isPending}
              >
                Submit Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
