import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { compressImage } from '../utils/compression';
import BloodGroupBadge from '../components/shared/BloodGroupBadge';
import UrgencyChip from '../components/shared/UrgencyChip';
import { INDIAN_STATES } from '../utils/indianStates';
import { Heart, MapPin, Phone, User, Calendar, Check, ShieldAlert, ChevronLeft, ChevronRight, Loader2, Navigation } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreateRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [step, setStep] = useState(1);
  // Geolocation state — captured when user proceeds from step 2
  const [hospitalLatitude, setHospitalLatitude] = useState(null);
  const [hospitalLongitude, setHospitalLongitude] = useState(null);
  const [isGeoCapturing, setIsGeoCapturing] = useState(false);

  // Form states
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [component, setComponent] = useState('WHOLE_BLOOD');
  const [unitsNeeded, setUnitsNeeded] = useState(1);
  const [urgency, setUrgency] = useState('NORMAL');
  const [requiredBy, setRequiredBy] = useState('');
  const [documentFile, setDocumentFile] = useState(null);

  const [hospitalName, setHospitalName] = useState('');
  const [hospitalCity, setHospitalCity] = useState('');
  const [hospitalState, setHospitalState] = useState('');
  const [wardNumber, setWardNumber] = useState('');
  const [attendingDoctor, setAttendingDoctor] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('+91');

  const [isLoading, setIsLoading] = useState(false);

  // Set default city and state from user profile details if available
  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        const me = await api('/auth/me');
        if (me?.profile) {
          if (me.profile.city) setHospitalCity(me.profile.city);
          if (me.profile.state) setHospitalState(me.profile.state);
        }
      } catch (err) {}
    };
    fetchProfile();
  }, []);

  const createRequestMutation = useMutation({
    mutationFn: (formData) => api('/requests', { method: 'POST', body: formData }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('Request posted! Matching donors in your area are being notified.');
      navigate(`/request/${data._id}`);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to submit request');
      setIsLoading(false);
    },
  });

  const handleNextStep = (e) => {
    e.preventDefault();

    if (step === 1) {
      if (!requiredBy) {
        toast.error('Please select both required date and time');
        return;
      }
      
      const reqBy = new Date(requiredBy);
      const now = new Date();
      const diffH = (reqBy.getTime() - now.getTime()) / 3600000;
      
      if (diffH <= 0.5) {
        toast.error('Required time must be at least 30 minutes in the future');
        return;
      }
      
      if (urgency === 'EMERGENCY' || urgency === 'HIGH') {
        if (diffH > 72) {
          toast.error('Emergency/High urgency requests must expire within 72 hours from now');
          return;
        }
      } else {
        if (diffH > 168) {
          toast.error('Normal urgency requests must expire within 7 days (168 hours) from now');
          return;
        }
      }

      setStep(2);
    } else if (step === 2) {
      if (!hospitalName || !hospitalCity || !hospitalState) {
        toast.error('Please fill in all hospital location fields');
        return;
      }

      if (guardianPhone && !guardianPhone.match(/^\+91[6-9]\d{9}$/)) {
        toast.error('Guardian phone number must be a valid Indian format (+91XXXXXXXXXX)');
        return;
      }

      // Capture hospital geolocation while user reviews details on step 3
      captureHospitalLocation();
      setStep(3);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    const requiredByValue = new Date(requiredBy).toISOString();
    const formData = new FormData();
    formData.append('bloodGroup', bloodGroup);
    formData.append('component', component);
    formData.append('unitsNeeded', unitsNeeded);
    formData.append('urgency', urgency);
    formData.append('requiredBy', requiredByValue);
    formData.append('hospitalName', hospitalName);
    formData.append('hospitalCity', hospitalCity);
    formData.append('hospitalState', hospitalState);
    if (wardNumber) formData.append('wardNumber', wardNumber);
    if (attendingDoctor) formData.append('attendingDoctor', attendingDoctor);
    if (guardianName) formData.append('guardianName', guardianName);
    if (guardianPhone) {
      formData.append('guardianPhone', guardianPhone);
      formData.append('guardianPhoneOverride', guardianPhone);
    }
    if (documentFile) formData.append('document', documentFile);

    // Append geolocation if captured (used for geospatial donor matching)
    if (hospitalLatitude != null) formData.append('hospitalLatitude', hospitalLatitude);
    if (hospitalLongitude != null) formData.append('hospitalLongitude', hospitalLongitude);

    createRequestMutation.mutate(formData);
  };

  // Try to capture hospital geolocation when moving from step 2 to step 3
  const captureHospitalLocation = () => {
    if (!navigator.geolocation) return;
    setIsGeoCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHospitalLatitude(pos.coords.latitude);
        setHospitalLongitude(pos.coords.longitude);
        setIsGeoCapturing(false);
      },
      () => {
        // User denied or unavailable — silently skip, city-string fallback active
        setIsGeoCapturing(false);
      },
      { timeout: 5000, maximumAge: 60000 }
    );
  };

  const getComponentLabel = (comp) => {
    switch (comp) {
      case 'WHOLE_BLOOD': return 'Whole Blood';
      case 'PLATELETS': return 'Platelets';
      case 'PLASMA': return 'Plasma';
      case 'RBC': return 'Double RBC';
      default: return comp;
    }
  };

  return (
    <div className="fadeIn" style={{ maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* Wizard Header Progress */}
      <div className="glass-panel p-6 m-b-6 flex justify-between align-center" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>Post Blood Request</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
            {step === 1 && 'Step 1: Blood & Urgency Details'}
            {step === 2 && 'Step 2: Hospital & Contact Information'}
            {step === 3 && 'Step 3: Review Details & Submit'}
          </p>
        </div>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--primary-color)' }}>
          Step {step} of 3
        </span>
      </div>

      <div className="grid grid-cols-2 gap-6" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
        {/* Left Column: Wizard Form */}
        <div>
          {/* STEP 1 FORM */}
          {step === 1 && (
            <form onSubmit={handleNextStep} className="card fadeIn">
              <div className="form-group">
                <label className="form-label">Blood Group Needed</label>
                <div className="grid grid-cols-4 gap-3">
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setBloodGroup(g)}
                      style={{
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 800,
                        fontSize: '1.125rem',
                        border: '1px solid',
                        cursor: 'pointer',
                        borderColor: bloodGroup === g ? 'var(--primary-color)' : 'var(--border-color)',
                        backgroundColor: bloodGroup === g ? 'var(--primary-color)' : 'rgba(15, 23, 42, 0.4)',
                        color: '#fff',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Component Required</label>
                  <select className="form-select" value={component} onChange={e => setComponent(e.target.value)}>
                    <option value="WHOLE_BLOOD">Whole Blood</option>
                    <option value="PLATELETS">Platelets</option>
                    <option value="PLASMA">Plasma</option>
                    <option value="RBC">Double RBC</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Units Needed (1 to 10)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    min={1} 
                    max={10} 
                    value={unitsNeeded} 
                    onChange={e => setUnitsNeeded(e.target.value)} 
                    required 
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Urgency Level</label>
                <div className="flex gap-4">
                  {['EMERGENCY', 'HIGH', 'NORMAL'].map(u => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUrgency(u)}
                      style={{
                        flex: 1,
                        padding: '0.625rem',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        fontSize: '0.8125rem',
                        border: '1px solid',
                        cursor: 'pointer',
                        borderColor: urgency === u 
                          ? (u === 'EMERGENCY' ? 'var(--danger-color)' : u === 'HIGH' ? 'var(--warning-color)' : 'var(--primary-color)') 
                          : 'var(--border-color)',
                        backgroundColor: urgency === u 
                          ? (u === 'EMERGENCY' ? 'rgba(244, 63, 94, 0.15)' : u === 'HIGH' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.05)') 
                          : 'rgba(15, 23, 42, 0.4)',
                        color: urgency === u 
                          ? (u === 'EMERGENCY' ? 'var(--danger-color)' : u === 'HIGH' ? 'var(--warning-color)' : 'var(--text-primary)') 
                          : 'var(--text-secondary)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Required By Date & Time</label>
                <input 
                  type="datetime-local" 
                  className="form-input" 
                  value={requiredBy}
                  onChange={e => setRequiredBy(e.target.value)}
                  min={new Date().toISOString().substring(0, 16)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Upload Medical Proof Document (Optional)</label>
                <input 
                  type="file" 
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="form-input" 
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (file) {
                      const compressed = await compressImage(file);
                      setDocumentFile(compressed);
                    } else {
                      setDocumentFile(null);
                    }
                  }}
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Upload doctor requisition, hospital letter, or test report verifying this emergency blood need.
                </p>
              </div>

              <div className="flex justify-end" style={{ marginTop: '1.5rem' }}>
                <button type="submit" className="btn btn-primary flex align-center gap-1">
                  <span>Next Steps</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 2 FORM */}
          {step === 2 && (
            <form onSubmit={handleNextStep} className="card fadeIn">
              <div className="form-group">
                <label className="form-label">Hospital Name</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                    <MapPin size={16} />
                  </span>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Apollo Hospital Vijayawada"
                    value={hospitalName}
                    onChange={e => setHospitalName(e.target.value)}
                    style={{ paddingLeft: '2.5rem' }}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Hospital City</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Vijayawada"
                    value={hospitalCity}
                    onChange={e => setHospitalCity(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Hospital State</label>
                  <select 
                    className="form-select" 
                    value={hospitalState}
                    onChange={e => setHospitalState(e.target.value)}
                    required
                  >
                    <option value="">Choose State...</option>
                    {INDIAN_STATES.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Ward / Room Number (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="ICU Room 304"
                    value={wardNumber}
                    onChange={e => setWardNumber(e.target.value)}
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Visible only to matching donors who confirm contact reveal.
                  </p>
                </div>
                <div className="form-group">
                  <label className="form-label">Attending Doctor (Optional)</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Dr. Srinivas Rao"
                    value={attendingDoctor}
                    onChange={e => setAttendingDoctor(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1.25rem', marginTop: '0.5rem' }}>
                <div className="form-group">
                  <label className="form-label">Guardian / Patient Contact Name</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                      <User size={16} />
                    </span>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder={user?.fullName || 'Priya Sharma'}
                      value={guardianName}
                      onChange={e => setGuardianName(e.target.value)}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Guardian Phone (+91 Indian format)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                      <Phone size={16} />
                    </span>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder={user?.phone || '+919000000004'}
                      value={guardianPhone}
                      onChange={e => setGuardianPhone(e.target.value)}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between" style={{ marginTop: '1.5rem' }}>
                <button type="button" onClick={() => setStep(1)} className="btn btn-secondary flex align-center gap-1">
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
                <button type="submit" className="btn btn-primary flex align-center gap-1">
                  <span>Review Details</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* STEP 3 REVIEW & SUBMIT */}
          {step === 3 && (
            <form onSubmit={handleSubmit} className="card fadeIn">
              <h3 style={{ fontWeight: 700, color: '#fff', marginBottom: '1.25rem' }}>Summary Details Review</h3>

              <div className="glass-panel p-4 m-b-6 flex flex-col gap-4" style={{ backgroundColor: 'rgba(15, 23, 42, 0.4)' }}>
                <div className="flex justify-between align-center" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                  <span className="flex align-center gap-2">
                    <BloodGroupBadge group={bloodGroup} />
                    <strong style={{ color: '#fff' }}>{getComponentLabel(component)}</strong>
                  </span>
                  <UrgencyChip urgency={urgency} />
                </div>

                <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }} className="flex flex-col gap-2">
                  <p>Units Required: <strong style={{ color: '#fff' }}>{unitsNeeded} Units</strong></p>
                  <p>Required By: <strong style={{ color: '#fff' }}>{requiredBy ? new Date(requiredBy).toLocaleString('en-IN') : 'Not selected'}</strong></p>
                  <p>Hospital: <strong style={{ color: '#fff' }}>{hospitalName} ({hospitalCity}, {hospitalState})</strong></p>
                  {wardNumber && <p>Ward/Room: <strong style={{ color: '#fff' }}>{wardNumber}</strong> (Hidden until confirmed)</p>}
                  {guardianPhone && <p>Guardian Contact: <strong style={{ color: '#fff' }}>{guardianName || 'Self'} ({guardianPhone})</strong></p>}
                </div>
              </div>

              {/* Consent / abuse warning box */}
              <div style={{
                padding: '1rem',
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                border: '1px solid rgba(239, 68, 68, 0.15)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                fontSize: '0.8125rem',
                marginBottom: '1.5rem'
              }} className="flex gap-2">
                <ShieldAlert size={20} color="var(--danger-color)" style={{ flexShrink: 0 }} />
                <div>
                  <strong style={{ color: '#fff' }}>Consent & Abuse Warning:</strong>
                  <p style={{ marginTop: '0.25rem' }}>
                    Posting fake blood requests is a serious offence. This request will be instantly pushed to registered available donors in {hospitalCity}. Your contact phone number will be shared with donors only after mutual verification.
                  </p>
                </div>
              </div>

              <div className="flex justify-between">
                <button type="button" onClick={() => setStep(2)} className="btn btn-secondary flex align-center gap-1" disabled={isLoading}>
                  <ChevronLeft size={16} />
                  <span>Back</span>
                </button>
                
                <button type="submit" className="btn btn-danger flex align-center gap-1" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="animate-spin" size={18} />
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <Check size={18} />
                      <span>Confirm & Post Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right column: Live Preview Card */}
        <div style={{ height: 'fit-content', position: 'sticky', top: '2rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff', marginBottom: '1rem' }}>Live Request Preview</h3>
          <div className="card flex flex-col gap-4" style={{ border: '1px solid var(--primary-color)' }}>
            <div className="flex justify-between align-center">
              <div className="flex align-center gap-2">
                <BloodGroupBadge group={bloodGroup} />
                <span style={{ fontSize: '1.125rem', fontWeight: 700, color: '#fff' }}>
                  {getComponentLabel(component)}
                </span>
              </div>
              <UrgencyChip urgency={urgency} />
            </div>

            <div>
              <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
                {unitsNeeded} Units Needed
              </h4>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                Required: {requiredBy ? new Date(requiredBy).toLocaleString('en-IN') : 'Not selected'}
              </p>
            </div>

            <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }} className="flex flex-col gap-3">
              <div className="flex align-center gap-2" style={{ fontSize: '0.875rem' }}>
                <MapPin size={16} color="var(--primary-color)" />
                <span style={{ color: 'var(--text-primary)' }}>
                  {hospitalName || 'Hospital Name'}
                </span>
              </div>
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', paddingLeft: '1.5rem' }}>
                {hospitalCity || 'City'}, {hospitalState || 'State'}
              </div>
              {documentFile && (
                <div style={{ fontSize: '0.8125rem', color: 'var(--success-color)', display: 'flex', alignItems: 'center', gap: '0.25rem', paddingLeft: '1.5rem' }}>
                  <Check size={14} />
                  <span>Document Selected: {documentFile.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
