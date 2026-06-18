import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import BloodGroupBadge from '../components/shared/BloodGroupBadge';
import UrgencyChip from '../components/shared/UrgencyChip';
import TrustBadge from '../components/shared/TrustBadge';
import LoadingSpinner from '../components/shared/LoadingSpinner';
import { MapPin, Phone, User, Calendar, ShieldAlert, Clock, Share2, Clipboard, MessageCircle, Check, AlertTriangle, Loader2, Heart, CheckCircle, Eye, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ChatDrawer from '../components/request/ChatDrawer';

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
  const [isReserveModalOpen, setIsReserveModalOpen] = useState(false);
  const [reserveEta, setReserveEta] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  /**
   * Stores the phone numbers returned by the reveal API so we can display
   * them in the UI after OTP verification. The API returns patientPhone
   * and donorPhone in the confirmReveal / revealContact response — but
   * these are not stored on the request object itself, only returned once
   * at the moment of reveal. We cache them in state for the session.
   */
  const [revealedContacts, setRevealedContacts] = useState(null);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const getDocumentUrl = (path) => {
    if (!path) return '';
    const origin = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1').replace('/api/v1', '');
    return `${origin}${path}`;
  };

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

  // Group interests for requester visualization
  const activeCoordinations = interests.filter(i => 
    ['RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED', 'DONATED'].includes(i.status)
  );

  const pendingVolunteers = interests.filter(i => i.status === 'INTERESTED');

  const resolvedNonDonations = interests.filter(i => 
    ['TURNED_AWAY', 'NO_SHOW', 'DECLINED', 'WITHDRAWN'].includes(i.status)
  );

  const unitsRemaining = request ? request.unitsNeeded - (request.unitsConfirmed || 0) : 0;

  const isOwner = user && request && request.requesterId?._id === user.id;
  const isAdmin = user?.role === 'ADMIN';

  // Check if current user is an interested donor
  const myInterest = user && interests.find(i => i.donorId?._id === user.id);
  const showConfirmDonationBox = myInterest && myInterest.requesterOutcome === 'DONATED' && !myInterest.donorOutcome;

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

  const reserveMutation = useMutation({
    mutationFn: (data) => api(`/requests/${request?._id}/reserve`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      toast.success('Request reserved successfully! You have 1 hour to coordinate.');
      setIsReserveModalOpen(false);
    },
    onError: (err) => toast.error(err.message || 'Failed to reserve request'),
  });

  const initiateRevealMutation = useMutation({
    mutationFn: (interestId) => api(`/requests/${request?._id}/interest/${interestId}/reveal`, { method: 'POST' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['request', id || token] });
      if (data?.otpSent) {
        toast.success('OTP sent to donor! Check console logs.');
      } else {
        toast.success('Emergency Bypass: Contact revealed instantly!');
      }
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
      // Store revealed contacts from API response for display
      if (data?.patientPhone || data?.donorPhone) {
        setRevealedContacts({
          patientPhone: data.patientPhone,
          donorPhone: data.donorPhone,
        });
      }
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
    const url = `${window.location.origin}/request/${request._id}`;
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

  const steps = [
    { label: 'Matching', desc: 'Finding compatible donors' },
    { label: 'Contact Reveal', desc: 'Exchanging contact details' },
    { label: 'ETA Set', desc: 'Donor coordinating travel' },
    { label: 'Donation Completed', desc: 'Blood delivered & verified' }
  ];

  const getStepperStep = () => {
    if (request?.status === 'FULFILLED') {
      return 3;
    }

    let status = 'INTERESTED';
    if (!isOwner && !isAdmin) {
      if (myInterest) {
        status = myInterest.status;
      } else {
        return 0; // Matching
      }
    } else {
      if (interests.length === 0) {
        return 0; // Matching
      }
      // Find the most advanced interest status
      const statuses = interests.map(i => i.status);
      if (statuses.includes('DONATED') || statuses.includes('CONFIRMED')) {
        status = 'DONATED';
      } else if (statuses.includes('CONTACT_REVEALED')) {
        status = 'CONTACT_REVEALED';
      } else if (statuses.includes('REVEAL_PENDING')) {
        status = 'REVEAL_PENDING';
      } else {
        status = 'INTERESTED';
      }
    }

    switch (status) {
      case 'INTERESTED':
        return 0; // Matching
      case 'REVEAL_PENDING':
        return 1; // Contact Reveal
      case 'CONTACT_REVEALED':
        return 2; // ETA Set
      case 'CONFIRMED':
      case 'DONATED':
        return 3; // Donation Completed
      default:
        return 0;
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

  const currentStep = getStepperStep();

  return (
    <div className="fadeIn" style={{ maxWidth: '800px', margin: '0 auto' }}>
      
      {/* Top action bar */}
      <div className="flex justify-between align-center m-b-6 flex-wrap gap-2">
        <Link to="/home" className="btn btn-secondary btn-sm">
          ← Back to Feed
        </Link>
        <div className="flex gap-2">
          {((isOwner || isAdmin) && interests.some(i => ['INTERESTED', 'RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED', 'DONATED'].includes(i.status))) && (
            <button onClick={() => setIsChatOpen(true)} className="btn btn-primary btn-sm flex align-center gap-1">
              <MessageCircle size={14} />
              <span>Open Coordination Chat</span>
            </button>
          )}
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

      {/* Progress Stepper */}
      <div className="card m-b-6" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="flex justify-between align-center" style={{ width: '100%', position: 'relative' }}>
          {/* Connecting line behind dots */}
          <div style={{
            position: 'absolute',
            left: '50px',
            right: '50px',
            top: '20px',
            height: '2px',
            backgroundColor: 'var(--border-color)',
            zIndex: 0
          }} />
          <div style={{
            position: 'absolute',
            left: '50px',
            width: `calc(${(currentStep / 3) * 100}% - 100px * ${(currentStep / 3) - 0.5})`, // Adjust line width nicely between circles
            maxWidth: 'calc(100% - 100px)',
            top: '20px',
            height: '2px',
            backgroundColor: 'var(--success-color)',
            transition: 'width 0.4s ease',
            zIndex: 0
          }} />

          {steps.map((step, idx) => {
            const isCompleted = idx < currentStep;
            const isActive = idx === currentStep;
            return (
              <div key={idx} className="flex flex-col align-center text-center" style={{ flex: 1, zIndex: 1 }}>
                <div style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: isCompleted ? 'var(--success-color)' : isActive ? 'var(--primary-color)' : 'var(--surface-color)',
                  border: `2px solid ${isCompleted ? 'var(--success-color)' : isActive ? 'var(--primary-color)' : 'var(--border-color)'}`,
                  color: isCompleted || isActive ? '#fff' : 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  boxShadow: isActive ? '0 0 10px var(--primary-glow)' : 'none',
                  transition: 'all 0.3s ease',
                  marginBottom: '0.5rem'
                }}>
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: isActive ? 700 : 500, color: isActive || isCompleted ? '#fff' : 'var(--text-secondary)' }}>
                    {step.label}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', maxWidth: '120px', margin: '0 auto' }}>
                    {step.desc}
                  </div>
                </div>
              </div>
            );
          })}
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

            {/* Medical Proof Document Section */}
            {request.documentPath ? (
              <div className="flex align-center gap-3" style={{ backgroundColor: 'rgba(59, 130, 246, 0.05)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                <ShieldAlert size={20} color="var(--primary-color)" />
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontWeight: 600, color: '#fff', fontSize: '0.875rem' }}>Medical Verification</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    Verification document is available.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPreviewModalOpen(true)}
                  className="btn btn-secondary btn-sm flex align-center gap-1"
                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                >
                  <Eye size={12} />
                  <span>Preview</span>
                </button>
              </div>
            ) : (
              <div className="flex align-center gap-3" style={{ backgroundColor: 'rgba(245, 158, 11, 0.05)', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(245, 158, 11, 0.2)' }}>
                <AlertTriangle size={20} color="var(--warning-color)" />
                <div style={{ flex: 1 }}>
                  <h4 style={{ fontWeight: 600, color: '#fff', fontSize: '0.875rem' }}>Unverified Request</h4>
                  <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                    No medical proof document was uploaded.
                  </p>
                </div>
              </div>
            )}

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
          {isOwner && ['ACTIVE', 'PARTIALLY_FULFILLED'].includes(request.status) && (
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
            {myInterest && ['INTERESTED', 'RESERVED', 'REVEAL_PENDING', 'CONTACT_REVEALED', 'CONFIRMED', 'DONATED'].includes(myInterest.status) && (
              <button 
                onClick={() => setIsChatOpen(true)}
                className="btn btn-primary"
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
              >
                <MessageCircle size={16} />
                <span>Open Coordination Chat</span>
              </button>
            )}

            {showConfirmDonationBox && (
              <div className="card text-center flex flex-col align-center gap-4" style={{ borderColor: 'var(--success-color)' }}>
                <CheckCircle size={36} color="var(--success-color)" style={{ margin: '0 auto' }} />
                <h3 style={{ fontWeight: 700, color: '#fff' }}>Confirm Your Donation</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  The requester has marked that you donated successfully. Please confirm to verify and complete the coordination.
                </p>
                <div className="flex gap-3" style={{ width: '100%' }}>
                  <button 
                    onClick={() => {
                      reportOutcomeMutation.mutate({ 
                        interestId: myInterest._id, 
                        outcome: 'DONATED', 
                        outcomeReason: '' 
                      });
                    }}
                    className="btn btn-success flex-1"
                    disabled={reportOutcomeMutation.isPending}
                  >
                    Yes, I Donated
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedInterestForOutcome(myInterest._id);
                      setOutcomeModalOpen(true);
                    }}
                    className="btn btn-secondary flex-1"
                    style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}
                    disabled={reportOutcomeMutation.isPending}
                  >
                    Something Else
                  </button>
                </div>
              </div>
            )}
            
            {/* Express Interest & Reservations */}
            {!myInterest && ['ACTIVE', 'PARTIALLY_FULFILLED'].includes(request.status) && (
              <>
                {request.isReserved ? (
                  <div className="card text-center flex flex-col align-center gap-4" style={{ borderColor: 'var(--warning-color)' }}>
                    <Clock size={36} color="var(--warning-color)" />
                    <h3 style={{ fontWeight: 700, color: '#fff' }}>⚠️ Temporarily Reserved</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      Another donor has temporarily reserved this request to coordinate travel. You cannot express interest or reserve at this moment.
                    </p>
                  </div>
                ) : (
                  <div className="card text-center flex flex-col align-center gap-4">
                    <Heart size={36} color="var(--primary-color)" />
                    <h3 style={{ fontWeight: 700, color: '#fff' }}>Can you donate?</h3>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                      By expressing interest, you confirm you are available and match the criteria. Contact details will be revealed after patient confirmation.
                    </p>
                    <div className="flex gap-3" style={{ width: '100%' }}>
                      <button 
                        onClick={() => {
                          if (!isAuthenticated) {
                            toast.error('Please login to express interest in this request.');
                            navigate('/login', { state: { from: `/request/${request._id}` } });
                          } else {
                            setIsInterestModalOpen(true);
                          }
                        }}
                        className="btn btn-primary flex-1"
                      >
                        I Can Donate
                      </button>
                      <button 
                        onClick={() => {
                          if (!isAuthenticated) {
                            toast.error('Please login to reserve this request.');
                            navigate('/login', { state: { from: `/request/${request._id}` } });
                          } else {
                            setIsReserveModalOpen(true);
                          }
                        }}
                        className="btn btn-secondary flex-1"
                        style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)' }}
                      >
                        Reserve
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Interest Status: Reserved by current user */}
            {myInterest && myInterest.status === 'RESERVED' && !showConfirmDonationBox && (
              <div className="card text-center flex flex-col align-center gap-4" style={{ borderColor: 'var(--primary-color)' }}>
                <Clock size={36} color="var(--primary-color)" />
                <h3 style={{ fontWeight: 700, color: '#fff' }}>Request Reserved by You</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  You have temporarily reserved this request. Other donors cannot express interest or reserve it for 1 hour while you coordinate travel.
                </p>
                <button 
                  onClick={() => setIsInterestModalOpen(true)}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  Confirm Availability & Share Contact
                </button>
                
                {/* Pending outcomes display for donor */}
                {(myInterest.donorOutcome || myInterest.requesterOutcome) && !['DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED'].includes(myInterest.status) && (
                  <div style={{ 
                    fontSize: '0.8125rem', 
                    padding: '0.75rem', 
                    borderRadius: 'var(--radius-sm)', 
                    backgroundColor: 'rgba(245, 158, 11, 0.05)', 
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    color: 'var(--warning-color)',
                    marginTop: '0.5rem',
                    textAlign: 'left'
                  }}>
                    {myInterest.donorOutcome && !myInterest.requesterOutcome && (
                      <span>⏳ You reported: <strong>{myInterest.donorOutcome.replace('_', ' ')}</strong>. Waiting for requester to confirm.</span>
                    )}
                    {!myInterest.donorOutcome && myInterest.requesterOutcome && (
                      <div>
                        <span>⏳ Requester reported: <strong>{myInterest.requesterOutcome.replace('_', ' ')}</strong>. Pending your confirmation.</span>
                        <button 
                          onClick={() => {
                            setSelectedInterestForOutcome(myInterest._id);
                            setOutcomeModalOpen(true);
                          }}
                          className="btn btn-success btn-sm"
                          style={{ width: '100%', marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          Confirm & Report Outcome
                        </button>
                      </div>
                    )}
                    {myInterest.donorOutcome && myInterest.requesterOutcome && myInterest.donorOutcome !== myInterest.requesterOutcome && (
                      <span>⚠️ Conflict! You reported: <strong>{myInterest.donorOutcome.replace('_', ' ')}</strong>, Requester reported: <strong>{myInterest.requesterOutcome.replace('_', ' ')}</strong>.</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Interest Expressed - Pending Reveal */}
            {myInterest && myInterest.status === 'INTERESTED' && !showConfirmDonationBox && (
              <div className="card text-center flex flex-col align-center gap-4">
                <Clock size={36} color="var(--warning-color)" />
                <h3 style={{ fontWeight: 700, color: '#fff' }}>Interest Registered</h3>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                  Waiting for the patient/requester to review your details and initiate contact exchange. You will receive an SMS OTP when they trigger the reveal.
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Your ETA: {myInterest.eta ? new Date(myInterest.eta).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Not specified'}
                </p>

                {/* Pending outcomes display for donor */}
                {(myInterest.donorOutcome || myInterest.requesterOutcome) && !['DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED'].includes(myInterest.status) && (
                  <div style={{ 
                    fontSize: '0.8125rem', 
                    padding: '0.75rem', 
                    borderRadius: 'var(--radius-sm)', 
                    backgroundColor: 'rgba(245, 158, 11, 0.05)', 
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    color: 'var(--warning-color)',
                    marginTop: '0.5rem',
                    textAlign: 'left'
                  }}>
                    {myInterest.donorOutcome && !myInterest.requesterOutcome && (
                      <span>⏳ You reported: <strong>{myInterest.donorOutcome.replace('_', ' ')}</strong>. Waiting for requester to confirm.</span>
                    )}
                    {!myInterest.donorOutcome && myInterest.requesterOutcome && (
                      <div>
                        <span>⏳ Requester reported: <strong>{myInterest.requesterOutcome.replace('_', ' ')}</strong>. Pending your confirmation.</span>
                        <button 
                          onClick={() => {
                            setSelectedInterestForOutcome(myInterest._id);
                            setOutcomeModalOpen(true);
                          }}
                          className="btn btn-success btn-sm"
                          style={{ width: '100%', marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          Confirm & Report Outcome
                        </button>
                      </div>
                    )}
                    {myInterest.donorOutcome && myInterest.requesterOutcome && myInterest.donorOutcome !== myInterest.requesterOutcome && (
                      <span>⚠️ Conflict! You reported: <strong>{myInterest.donorOutcome.replace('_', ' ')}</strong>, Requester reported: <strong>{myInterest.requesterOutcome.replace('_', ' ')}</strong>.</span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* OTP Verification entry for Donor */}
            {myInterest && myInterest.status === 'REVEAL_PENDING' && !showConfirmDonationBox && (
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
            {myInterest && ['CONTACT_REVEALED', 'CONFIRMED', 'DONATED'].includes(myInterest.status) && !showConfirmDonationBox && (
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
                    <span>
                      {/* patientPhone is returned by the reveal API and stored in revealedContacts state.
                          It is NOT a field on the request object — it is only returned once at reveal time.
                          Fallback chain: revealedContacts > guardianPhoneOverride > requester's phone */}
                      {revealedContacts?.patientPhone
                        || request?.guardianPhoneOverride
                        || request?.requesterId?.phone
                        || 'Contact available after OTP verification'}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => setIsChatOpen(true)}
                  className="btn btn-primary"
                  style={{ width: '100%', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <MessageCircle size={16} />
                  <span>Open Coordination Chat</span>
                </button>

                {/* Pending outcomes display for donor */}
                {(myInterest.donorOutcome || myInterest.requesterOutcome) && !['DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED'].includes(myInterest.status) && (
                  <div style={{ 
                    fontSize: '0.8125rem', 
                    padding: '0.75rem', 
                    borderRadius: 'var(--radius-sm)', 
                    backgroundColor: 'rgba(245, 158, 11, 0.05)', 
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    color: 'var(--warning-color)',
                    marginTop: '0.5rem',
                    textAlign: 'left'
                  }}>
                    {myInterest.donorOutcome && !myInterest.requesterOutcome && (
                      <span>⏳ You reported: <strong>{myInterest.donorOutcome.replace('_', ' ')}</strong>. Waiting for requester to confirm.</span>
                    )}
                    {!myInterest.donorOutcome && myInterest.requesterOutcome && (
                      <div>
                        <span>⏳ Requester reported: <strong>{myInterest.requesterOutcome.replace('_', ' ')}</strong>. Pending your confirmation.</span>
                        <button 
                          onClick={() => {
                            setSelectedInterestForOutcome(myInterest._id);
                            setOutcomeModalOpen(true);
                          }}
                          className="btn btn-success btn-sm"
                          style={{ width: '100%', marginTop: '0.5rem', padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                        >
                          Confirm & Report Outcome
                        </button>
                      </div>
                    )}
                    {myInterest.donorOutcome && myInterest.requesterOutcome && myInterest.donorOutcome !== myInterest.requesterOutcome && (
                      <span>⚠️ Conflict! You reported: <strong>{myInterest.donorOutcome.replace('_', ' ')}</strong>, Requester reported: <strong>{myInterest.requesterOutcome.replace('_', ' ')}</strong>.</span>
                    )}
                  </div>
                )}

                {/* Outcome Reporting trigger */}
                {!myInterest.donorOutcome && !['DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED'].includes(myInterest.status) && (
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
        <div className="flex flex-col gap-6 m-y-6">
          
          {/* Active Donation Slots Section */}
          <div className="card">
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1.25rem' }} className="flex align-center gap-2">
              <CheckCircle size={18} color="var(--success-color)" />
              <span>Unit Coordination Slots ({activeCoordinations.length} / {request.unitsNeeded} Filled)</span>
            </h3>
            
            <div className="grid grid-cols-2 gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
              {Array.from({ length: request.unitsNeeded }).map((_, idx) => {
                const coordination = activeCoordinations[idx];
                
                if (coordination) {
                  const statusColors = {
                    RESERVED: 'var(--primary-color)',
                    REVEAL_PENDING: 'var(--warning-color)',
                    CONTACT_REVEALED: 'var(--success-color)',
                    CONFIRMED: 'var(--success-color)',
                    DONATED: 'var(--success-color)'
                  };

                  return (
                    <div 
                      key={coordination._id} 
                      className="card flex flex-col justify-between gap-4" 
                      style={{ 
                        backgroundColor: 'rgba(15, 23, 42, 0.4)', 
                        borderColor: statusColors[coordination.status] || 'var(--border-color)',
                        padding: '1.25rem'
                      }}
                    >
                      <div className="flex justify-between align-center">
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Slot {idx + 1}
                        </span>
                        <span style={{ 
                          fontSize: '0.75rem', 
                          fontWeight: 700, 
                          color: statusColors[coordination.status],
                          textTransform: 'uppercase'
                        }}>
                          {coordination.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex align-center gap-3">
                        <div className="flex align-center justify-center" style={{
                          width: '38px',
                          height: '38px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--border-color)',
                          color: '#fff',
                          fontWeight: 800,
                          fontSize: '0.875rem'
                        }}>
                          {coordination.donorId?.fullName?.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <h4 style={{ fontWeight: 700, color: '#fff', fontSize: '0.9375rem' }}>
                            {coordination.donorId?.fullName}
                          </h4>
                          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            ETA: {coordination.eta ? new Date(coordination.eta).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Not specified'}
                          </p>
                        </div>
                      </div>

                      {/* Pending outcomes display for owner */}
                      {(coordination.donorOutcome || coordination.requesterOutcome) && !['DONATED', 'TURNED_AWAY', 'NO_SHOW', 'DECLINED'].includes(coordination.status) && (
                        <div style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.5rem', 
                          borderRadius: 'var(--radius-sm)', 
                          backgroundColor: 'rgba(245, 158, 11, 0.05)', 
                          border: '1px solid rgba(245, 158, 11, 0.2)',
                          color: 'var(--warning-color)',
                          marginBottom: '0.5rem'
                        }}>
                          {coordination.donorOutcome && !coordination.requesterOutcome && (
                            <span>⏳ Donor reported: <strong>{coordination.donorOutcome}</strong>. Pending your confirmation.</span>
                          )}
                          {!coordination.donorOutcome && coordination.requesterOutcome && (
                            <span>⏳ You reported: <strong>{coordination.requesterOutcome}</strong>. Pending donor confirmation.</span>
                          )}
                          {coordination.donorOutcome && coordination.requesterOutcome && coordination.donorOutcome !== coordination.requesterOutcome && (
                            <span>⚠️ Conflict! You reported: <strong>{coordination.requesterOutcome}</strong>, Donor reported: <strong>{coordination.donorOutcome}</strong>.</span>
                          )}
                        </div>
                      )}

                      {/* Phone Display and Actions */}
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }} className="flex flex-col gap-2">
                        {['RESERVED', 'INTERESTED'].includes(coordination.status) && (
                          <div className="flex gap-2">
                            <button 
                              onClick={() => {
                                setSelectedInterest(coordination._id);
                                setRevealModalOpen(true);
                              }}
                              className="btn btn-primary btn-sm flex-1"
                            >
                              Reveal Contact
                            </button>
                            <button 
                              onClick={() => {
                                setSelectedInterestForOutcome(coordination._id);
                                setOutcomeModalOpen(true);
                              }}
                              className="btn btn-secondary btn-sm flex-1"
                              style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}
                            >
                              Resolve
                            </button>
                          </div>
                        )}

                        {coordination.status === 'REVEAL_PENDING' && (
                          <span style={{ fontSize: '0.8125rem', color: 'var(--warning-color)', display: 'block', textAlign: 'center' }}>
                            ⏳ Waiting for donor to enter OTP...
                          </span>
                        )}

                        {['CONTACT_REVEALED', 'CONFIRMED', 'DONATED'].includes(coordination.status) && (
                          <div className="flex justify-between align-center flex-wrap gap-2">
                            <span className="flex align-center gap-1" style={{ fontWeight: 600, color: 'var(--success-color)', fontSize: '0.875rem' }}>
                              <Phone size={12} />
                              <span>{coordination.donorId?.phone || 'Revealed'}</span>
                            </span>
                            
                            {coordination.status !== 'DONATED' && (
                              <button 
                                onClick={() => {
                                  setSelectedInterestForOutcome(coordination._id);
                                  setOutcomeModalOpen(true);
                                }}
                                className="btn btn-success btn-sm"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                              >
                                Resolve Slot
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Empty Slot Placeholder
                return (
                  <div 
                    key={`empty-${idx}`} 
                    className="card flex flex-col justify-center align-center text-center gap-2" 
                    style={{ 
                      backgroundColor: 'rgba(15, 23, 42, 0.1)', 
                      border: '2px dashed var(--border-color)',
                      padding: '1.5rem',
                      minHeight: '130px'
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                      Slot {idx + 1}: Unassigned
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', maxWidth: '200px' }}>
                      Reveal contact for an interested volunteer below to fill this slot.
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Volunteer Queue Section */}
          <div className="card">
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1.25rem' }} className="flex align-center gap-2">
              <User size={18} color="var(--primary-color)" />
              <span>Interested Volunteers Queue ({pendingVolunteers.length})</span>
            </h3>

            {pendingVolunteers.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                No active volunteers in queue. Share the WhatsApp link to recruit donors!
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                {pendingVolunteers.map((interest) => {
                  const isQueueLocked = activeCoordinations.filter(c => c.status !== 'DONATED').length >= unitsRemaining;
                  
                  return (
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
                          {(interest.donorOutcome || interest.requesterOutcome) && (
                            <div style={{ 
                              fontSize: '0.72rem', 
                              padding: '0.35rem 0.5rem', 
                              borderRadius: 'var(--radius-sm)', 
                              backgroundColor: 'rgba(245, 158, 11, 0.05)', 
                              border: '1px solid rgba(245, 158, 11, 0.2)',
                              color: 'var(--warning-color)',
                              marginTop: '0.5rem'
                            }}>
                              {interest.donorOutcome && !interest.requesterOutcome && (
                                <span>⏳ Donor reported: <strong>{interest.donorOutcome.replace('_', ' ')}</strong>. Pending your confirmation.</span>
                              )}
                              {!interest.donorOutcome && interest.requesterOutcome && (
                                <span>⏳ You reported: <strong>{interest.requesterOutcome.replace('_', ' ')}</strong>. Pending donor confirmation.</span>
                              )}
                              {interest.donorOutcome && interest.requesterOutcome && interest.donorOutcome !== interest.requesterOutcome && (
                                <span>⚠️ Conflict! You reported: <strong>{interest.requesterOutcome.replace('_', ' ')}</strong>, Donor reported: <strong>{interest.donorOutcome.replace('_', ' ')}</strong>.</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col gap-1 align-end">
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setSelectedInterest(interest._id);
                              setRevealModalOpen(true);
                            }}
                            className="btn btn-primary btn-sm"
                            disabled={isQueueLocked}
                            title={isQueueLocked ? 'All available coordination slots are currently occupied' : 'Initiate contact reveal'}
                          >
                            Reveal Contact
                          </button>
                          <button 
                            onClick={() => {
                              setSelectedInterestForOutcome(interest._id);
                              setOutcomeModalOpen(true);
                            }}
                            className="btn btn-secondary btn-sm"
                            style={{ borderColor: 'var(--danger-color)', color: 'var(--danger-color)' }}
                          >
                            Resolve
                          </button>
                        </div>
                        {isQueueLocked && (
                          <span style={{ display: 'block', fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.25rem', textAlign: 'right' }}>
                            Slots full
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Historical/Past Outcome Logs */}
          {resolvedNonDonations.length > 0 && (
            <div className="card" style={{ opacity: 0.7 }}>
              <h3 style={{ fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }} className="flex align-center gap-2">
                <span>History / Past Coordination Attempts ({resolvedNonDonations.length})</span>
              </h3>
              <div className="flex flex-col gap-2">
                {resolvedNonDonations.map((interest) => (
                  <div 
                    key={interest._id} 
                    className="flex justify-between align-center p-3 flex-wrap gap-2"
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      fontSize: '0.8125rem'
                    }}
                  >
                    <span style={{ color: 'var(--text-secondary)' }}>
                      Donor: <strong>{interest.donorId?.fullName}</strong>
                    </span>
                    <span style={{ 
                      fontWeight: 600, 
                      color: interest.status === 'NO_SHOW' ? 'var(--danger-color)' : 'var(--text-muted)' 
                    }}>
                      Status: {interest.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
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

      {/* 2b. Modal: Reserve Request Confirmation */}
      {isReserveModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content card" style={{ backgroundColor: 'var(--surface-color)' }}>
            <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1rem' }} className="flex align-center gap-2">
              <Clock color="var(--primary-color)" />
              <span>Reserve Blood Request</span>
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
              Reserving this request locks it for 1 hour so you can coordinate travel. Other donors will be temporarily blocked from expressing interest.
            </p>
            <div className="form-group">
              <label className="form-label">Estimated Time of Arrival (ETA) (Optional)</label>
              <input 
                type="datetime-local" 
                className="form-input" 
                value={reserveEta}
                onChange={e => setReserveEta(e.target.value)}
                min={new Date().toISOString().substring(0, 16)}
              />
            </div>
            <div className="flex gap-3" style={{ marginTop: '1.5rem' }}>
              <button onClick={() => setIsReserveModalOpen(false)} className="btn btn-secondary flex-1">
                Cancel
              </button>
              <button 
                onClick={() => reserveMutation.mutate({ eta: reserveEta })} 
                className="btn btn-primary flex-1"
                disabled={reserveMutation.isPending}
              >
                {reserveMutation.isPending ? 'Reserving...' : 'Confirm Reservation'}
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

      <ChatDrawer 
        isOpen={isChatOpen} 
        onClose={() => setIsChatOpen(false)} 
        requestId={request?._id} 
        currentUser={user} 
      />

      {/* 4. Modal: Medical Document Preview */}
      {isPreviewModalOpen && request.documentPath && (
        <div className="modal-overlay" style={{ zIndex: 1100 }}>
          <div className="modal-content card" style={{ maxWidth: '600px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: '1rem', backgroundColor: 'var(--surface-color)' }}>
            <div className="flex justify-between align-center" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
              <h3 style={{ fontWeight: 700, color: '#fff' }}>Medical Verification Document</h3>
              <button 
                onClick={() => setIsPreviewModalOpen(false)} 
                className="btn btn-secondary btn-sm" 
                style={{ padding: '0', borderRadius: '50%', minWidth: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <X size={16} />
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '300px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-sm)' }}>
              {request.documentPath.toLowerCase().endsWith('.pdf') ? (
                <iframe 
                  src={getDocumentUrl(request.documentPath)} 
                  title="Medical Verification Document" 
                  style={{ width: '100%', height: '500px', border: 'none' }}
                />
              ) : (
                <img 
                  src={getDocumentUrl(request.documentPath)} 
                  alt="Medical Verification" 
                  style={{ maxWidth: '100%', maxHeight: '500px', objectFit: 'contain' }}
                />
              )}
            </div>

            <div className="flex justify-end gap-3" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <a 
                href={getDocumentUrl(request.documentPath)} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="btn btn-secondary flex align-center gap-1"
                style={{ fontSize: '0.875rem' }}
              >
                Open in New Tab
              </a>
              <button onClick={() => setIsPreviewModalOpen(false)} className="btn btn-primary" style={{ fontSize: '0.875rem' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
