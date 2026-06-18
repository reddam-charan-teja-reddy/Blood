import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import RoleSelector from '../components/auth/RoleSelector';
import { User, Phone, Lock, Mail, MapPin, Scale, ChevronRight, ChevronLeft, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { INDIAN_STATES } from '../utils/indianStates';

export default function RegisterPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [step, setStep] = useState(1); // 1: Role selector, 2: Form, 3: OTP verify
  const [role, setRole] = useState('INDIVIDUAL'); // INDIVIDUAL or ORG

  // Form states
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+91');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [bloodGroup, setBloodGroup] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [weightKg, setWeightKg] = useState('');

  // OTP states
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Geolocation — captured silently on form submit
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);

  const handleNextStep = (e) => {
    e.preventDefault();
    if (step === 1) {
      setStep(2);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();

    if (!phone.match(/^\+91[6-9]\d{9}$/)) {
      toast.error('Invalid Indian phone number. Format must be +91XXXXXXXXXX');
      return;
    }

    if (role === 'ORG' && (!password || password.length < 8)) {
      toast.error('Password must be at least 8 characters for hospital accounts');
      return;
    }

    setIsLoading(true);

    // Silently try to capture geolocation for geospatial matching
    let lat = latitude;
    let lng = longitude;
    if (!lat && !lng && navigator.geolocation) {
      try {
        const pos = await new Promise((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
        );
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
        setLatitude(lat);
        setLongitude(lng);
      } catch {
        // User denied or unavailable — proceed without location
      }
    }

    try {
      const payload = {
        fullName,
        phone,
        email: email || undefined,
        role,
        password: password || undefined,
        city,
        state,
        bloodGroup: role === 'INDIVIDUAL' && bloodGroup ? bloodGroup : undefined,
        weightKg: role === 'INDIVIDUAL' && weightKg ? parseFloat(weightKg) : undefined,
        latitude: lat || undefined,
        longitude: lng || undefined,
      };

      const res = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      await api('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });

      setStep(3);
      toast.success('Registration request submitted! Verification OTP sent.');
    } catch (error) {
      toast.error(error.message || 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error('Enter 6-digit verification code');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, otp }),
      });

      setAuth(res.user, res.accessToken);
      toast.success(`Account verified! Welcome, ${res.user.fullName}.`);

      if (res.user.role === 'ORG') {
        navigate('/org/dashboard');
      } else {
        navigate('/home');
      }
    } catch (error) {
      toast.error(error.message || 'Invalid or expired OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex justify-center align-center fadeIn" style={{ minHeight: '80vh', padding: '1rem' }}>
      <div className="glass-panel p-6" style={{ width: '100%', maxWidth: step === 1 ? '600px' : '480px' }}>
        
        {/* Step progress header */}
        <div className="flex justify-between align-center m-b-6" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff' }}>
              Create Account
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
              {step === 1 && 'Select account role'}
              {step === 2 && 'Fill details form'}
              {step === 3 && 'Verify phone number'}
            </p>
          </div>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--primary-color)' }}>
            Step {step} of 3
          </span>
        </div>

        {/* STEP 1: Role Selection */}
        {step === 1 && (
          <div className="fadeIn">
            <RoleSelector selectedRole={role} onSelectRole={setRole} />
            <div className="flex justify-between" style={{ marginTop: '2rem' }}>
              <Link to="/login" className="btn btn-secondary flex align-center">
                Already registered? Login
              </Link>
              <button onClick={handleNextStep} className="btn btn-primary flex align-center gap-1">
                <span>Continue</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Detail Form */}
        {step === 2 && (
          <form onSubmit={handleRegister} className="fadeIn">
            <div className="form-group">
              <label className="form-label">
                {role === 'ORG' ? 'Hospital / Bank Name' : 'Full Name'}
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                  <User size={18} />
                </span>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder={role === 'ORG' ? 'Apollo Blood Bank' : 'Ravi Kumar'}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  style={{ paddingLeft: '2.5rem' }}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number (Indian format)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                  <Phone size={18} />
                </span>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="+919876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ paddingLeft: '2.5rem' }}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Email Address (Optional)</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                  <Mail size={18} />
                </span>
                <input 
                  type="email" 
                  className="form-input" 
                  placeholder="contact@hospital.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ paddingLeft: '2.5rem' }}
                />
              </div>
            </div>

            {/* Location Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label">City</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                    <MapPin size={16} />
                  </span>
                  <input 
                    type="text" 
                    className="form-input" 
                    placeholder="Vijayawada"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    style={{ paddingLeft: '2.3rem' }}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <select 
                  className="form-select"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  required
                >
                  <option value="">Choose State...</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Role Specific Fields */}
            {role === 'INDIVIDUAL' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Blood Group (Optional)</label>
                  <select 
                    className="form-select" 
                    value={bloodGroup}
                    onChange={(e) => setBloodGroup(e.target.value)}
                  >
                    <option value="">Choose...</option>
                    {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((group) => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Weight (Kg) (Optional)</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                      <Scale size={16} />
                    </span>
                    <input 
                      type="number" 
                      className="form-input" 
                      placeholder="70"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      style={{ paddingLeft: '2.3rem' }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">Organization Account Password</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                    <Lock size={18} />
                  </span>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingLeft: '2.5rem' }}
                    required
                  />
                </div>
              </div>
            )}

            {role === 'INDIVIDUAL' && (
              <div className="form-group">
                <label className="form-label">Password (Optional - for logging in without OTP)</label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                    <Lock size={18} />
                  </span>
                  <input 
                    type="password" 
                    className="form-input" 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingLeft: '2.5rem' }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-between" style={{ marginTop: '2rem' }}>
              <button type="button" onClick={() => setStep(1)} className="btn btn-secondary flex align-center gap-1">
                <ChevronLeft size={16} />
                <span>Back</span>
              </button>
              <button type="submit" className="btn btn-primary flex align-center gap-1" disabled={isLoading}>
                {isLoading ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <>
                    <span>Register Account</span>
                    <ChevronRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 3: OTP Verification */}
        {step === 3 && (
          <form onSubmit={handleVerifyOtp} className="fadeIn">
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                We sent a 6-digit verification code to <strong style={{ color: '#fff' }}>{phone}</strong>.
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                (Mock OTP code is logged in browser console/server console logs)
              </p>
            </div>

            <div className="form-group">
              <label className="form-label" style={{ textAlign: 'center' }}>Verification Code</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="123456"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                style={{ 
                  textAlign: 'center', 
                  fontSize: '1.5rem', 
                  letterSpacing: '0.35em', 
                  padding: '0.5rem' 
                }}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1.5rem' }} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="animate-spin" size={18} />
              ) : (
                'Verify & Activate Account'
              )}
            </button>
          </form>
        )}

        <div className="text-center" style={{ marginTop: '1.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Already have an account? </span>
          <Link to="/login" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
            Login here
          </Link>
        </div>
      </div>
    </div>
  );
}
