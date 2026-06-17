import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import BloodGroupBadge from '../components/shared/BloodGroupBadge';
import UrgencyChip from '../components/shared/UrgencyChip';
import { Heart, MapPin, Phone, User, Calendar, Check, ShieldAlert, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function CreateRequestPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const [step, setStep] = useState(1);

  // Form states
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [component, setComponent] = useState('WHOLE_BLOOD');
  const [unitsNeeded, setUnitsNeeded] = useState(1);
  const [urgency, setUrgency] = useState('NORMAL');
  const [requiredByDate, setRequiredByDate] = useState('');
  const [requiredByTime, setRequiredByTime] = useState('');

  const [hospitalName, setHospitalName] = useState('');
  const [hospitalCity, setHospitalCity] = useState('');
  const [hospitalState, setHospitalState] = useState('');
  const [wardNumber, setWardNumber] = useState('');
  const [attendingDoctor, setAttendingDoctor] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');

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
    mutationFn: (data) => api('/requests', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['requests'] });
      toast.success('Request posted successfully! Matching donors are being alerted.');
      navigate(`/request/${data._id}`);
    },
    onError: (err) => {
      toast.error(err.message || 'Failed to submit request');
      setIsLoading(false);
    },
  });

  const getRequiredByISOString = () => {
    if (!requiredByDate || !requiredByTime) return null;
    const date = new Date(`${requiredByDate}T${requiredByTime}`);
    return date.toISOString();
  };

  const handleNextStep = (e) => {
    e.preventDefault();

    if (step === 1) {
      if (!requiredByDate || !requiredByTime) {
        toast.error('Please select both required date and time');
        return;
      }
      
      const reqBy = new Date(`${requiredByDate}T${requiredByTime}`);
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

      setStep(3);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);

    const requiredBy = getRequiredByISOString();
    const payload = {
      bloodGroup,
      component,
      unitsNeeded: parseInt(unitsNeeded, 10),
      urgency,
      requiredBy,
      hospitalName,
      hospitalCity,
      hospitalState,
      wardNumber: wardNumber || undefined,
      attendingDoctor: attendingDoctor || undefined,
      guardianName: guardianName || undefined,
      guardianPhone: guardianPhone || undefined,
      guardianPhoneOverride: guardianPhone || undefined,
    };

    createRequestMutation.mutate(payload);
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
    <div className="fadeIn" style={{ maxWidth: '650px', margin: '0 auto' }}>
      
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

          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Required By Date</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type="date" 
                  className="form-input" 
                  value={requiredByDate}
                  onChange={e => setRequiredByDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Required By Time</label>
              <input 
                type="time" 
                className="form-input" 
                value={requiredByTime}
                onChange={e => setRequiredByTime(e.target.value)}
                required
              />
            </div>
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
              <input 
                type="text" 
                className="form-input" 
                placeholder="Andhra Pradesh"
                value={hospitalState}
                onChange={e => setHospitalState(e.target.value)}
                required
              />
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
              <p>Required By: <strong style={{ color: '#fff' }}>{new Date(`${requiredByDate}T${requiredByTime}`).toLocaleString('en-IN')}</strong></p>
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
  );
}
