import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { api } from '../lib/api';
import { Phone, Lock, Mail, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((state) => state.setAuth);

  const [identifierType, setIdentifierType] = useState('phone'); // 'phone' or 'email'
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  
  // OTP Mode state
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const payload = identifierType === 'phone' 
        ? { phone, password } 
        : { email, password };

      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.otpRequired) {
        setOtpSent(true);
        toast.success(res.message || 'OTP sent to your phone');
      } else {
        setAuth(res.user, res.accessToken);
        toast.success(`Welcome back, ${res.user.fullName}!`);
        
        // Redirect based on role
        if (res.user.role === 'ADMIN') {
          navigate('/admin/dashboard');
        } else if (res.user.role === 'ORG') {
          navigate('/org/dashboard');
        } else {
          navigate('/home');
        }
      }
    } catch (error) {
      toast.error(error.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!phone || !phone.match(/^\+91[6-9]\d{9}$/)) {
      toast.error('Please enter a valid Indian phone number (+91XXXXXXXXXX)');
      return;
    }

    setIsLoading(true);
    try {
      // Direct OTP login trigger by calling /auth/otp/send
      await api('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      setOtpSent(true);
      toast.success('Mock OTP sent to console! Check logs.');
    } catch (error) {
      toast.error(error.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp || otp.length !== 6) {
      toast.error('Please enter a 6-digit OTP code');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, otp }),
      });

      setAuth(res.user, res.accessToken);
      toast.success(`Welcome back, ${res.user.fullName}!`);

      if (res.user.role === 'ADMIN') {
        navigate('/admin/dashboard');
      } else if (res.user.role === 'ORG') {
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
      <div className="glass-panel p-6" style={{ width: '100%', maxWidth: '420px' }}>
        <div className="text-center m-b-6">
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', marginBottom: '0.25rem' }}>
            Welcome Back
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            {otpSent ? 'Enter verification code' : 'Access your Blood Network account'}
          </p>
        </div>

        {!otpSent ? (
          <>
            {/* Tab switch phone vs email */}
            <div className="flex gap-4" style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
              <button 
                type="button" 
                onClick={() => setIdentifierType('phone')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: identifierType === 'phone' ? 'var(--primary-color)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  paddingBottom: '0.5rem',
                  borderBottom: identifierType === 'phone' ? '2px solid var(--primary-color)' : 'none',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                Phone Login
              </button>
              <button 
                type="button" 
                onClick={() => setIdentifierType('email')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: identifierType === 'email' ? 'var(--primary-color)' : 'var(--text-secondary)',
                  fontWeight: 600,
                  paddingBottom: '0.5rem',
                  borderBottom: identifierType === 'email' ? '2px solid var(--primary-color)' : 'none',
                  cursor: 'pointer',
                  flex: 1
                }}
              >
                Email Login
              </button>
            </div>

            <form onSubmit={handlePasswordLogin}>
              {identifierType === 'phone' ? (
                <div className="form-group">
                  <label className="form-label">Phone Number</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                      <Phone size={18} />
                    </span>
                    <input 
                      type="text" 
                      className="form-input" 
                      placeholder="+919000000002"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      style={{ paddingLeft: '2.5rem' }}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                      <Mail size={18} />
                    </span>
                    <input 
                      type="email" 
                      className="form-input" 
                      placeholder="name@hospital.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      style={{ paddingLeft: '2.5rem' }}
                      required
                    />
                  </div>
                </div>
              )}

              <div className="form-group">
                <div className="flex justify-between align-center">
                  <label className="form-label">Password</label>
                  {identifierType === 'phone' && (
                    <button 
                      type="button" 
                      onClick={handleSendOtp}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--primary-color)',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Login via OTP instead?
                    </button>
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '10px', color: 'var(--text-muted)' }}>
                    <Lock size={18} />
                  </span>
                  <input 
                    type={showPassword ? 'text' : 'password'} 
                    className="form-input" 
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                    required
                  />
                  <button 
                    type="button" 
                    onClick={() => setShowPassword(!showPassword)}
                    style={{
                      position: 'absolute',
                      right: '10px',
                      top: '10px',
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer'
                    }}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary" 
                style={{ width: '100%', marginTop: '1rem' }}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    <span>Sign In</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                We sent a 6-digit code to <strong style={{ color: '#fff' }}>{phone}</strong>
              </p>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                (Mock OTP is logged in the browser console / server terminal logs)
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

            <button 
              type="submit" 
              className="btn btn-primary" 
              style={{ width: '100%', marginTop: '1rem' }}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                'Verify & Login'
              )}
            </button>

            <button 
              type="button" 
              onClick={() => setOtpSent(false)}
              className="btn btn-secondary" 
              style={{ width: '100%', marginTop: '0.75rem' }}
              disabled={isLoading}
            >
              Back to Login
            </button>
          </form>
        )}

        <div className="text-center" style={{ marginTop: '2rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Don't have an account? </span>
          <Link to="/register" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
            Register here
          </Link>
        </div>
      </div>
    </div>
  );
}
