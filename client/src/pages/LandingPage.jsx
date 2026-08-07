import React from 'react';
import { Link } from 'react-router-dom';
import { Heart, Activity, ShieldCheck, MapPin, Award, ArrowRight } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="fadeIn" style={{ padding: '2rem 0' }}>
      
      {/* Hero Section */}
      <div className="glass-panel p-6 flex flex-col align-center text-center gap-4" style={{
        padding: '5rem 2rem',
        marginBottom: '4rem',
        background: 'radial-gradient(circle at center, rgba(239, 68, 68, 0.15) 0%, rgba(11, 15, 25, 0.95) 100%)',
        borderColor: 'rgba(239, 68, 68, 0.15)'
      }}>
        <div className="flex align-center justify-center pulse-icon" style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          backgroundColor: 'var(--primary-color)',
          color: '#fff',
          boxShadow: '0 0 24px var(--primary-glow)',
          marginBottom: '1rem'
        }}>
          <Heart size={36} fill="#fff" />
        </div>
        
        <h1 style={{
          fontSize: '3.25rem',
          fontWeight: 800,
          color: '#fff',
          lineHeight: 1.15,
          letterSpacing: '-0.02em',
          maxWidth: '800px'
        }}>
          Every Second Counts. <br />
          Find Blood Donors <span style={{ color: 'var(--primary-color)', textShadow: '0 0 12px var(--primary-glow)' }}>In Real-Time</span>.
        </h1>
        
        <p style={{
          color: 'var(--text-secondary)',
          fontSize: '1.125rem',
          maxWidth: '580px',
          lineHeight: 1.6,
          marginTop: '0.5rem'
        }}>
          Blood Network connects volunteer donors with emergency requests instantly. OTP-gated contact exchange protects your privacy until you consent to help.
        </p>

        <div className="flex gap-4 justify-center flex-wrap" style={{ marginTop: '2rem' }}>
          <Link to="/register" className="btn btn-primary btn-lg flex align-center gap-1" style={{ padding: '0.8rem 1.8rem', fontSize: '1rem' }}>
            <span>Register to Help</span>
            <ArrowRight size={18} />
          </Link>
          <Link to="/login" className="btn btn-secondary btn-lg" style={{ padding: '0.8rem 1.8rem', fontSize: '1rem' }}>
            Request Blood
          </Link>
        </div>

        {/* Live Community Impact Numbers */}
        <div className="flex justify-center gap-6 flex-wrap" style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)', width: '100%', maxWidth: '700px' }}>
          <div className="text-center" style={{ flex: '1 1 120px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--primary-color)' }}>100%</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Verified Donors</p>
          </div>
          <div className="text-center" style={{ flex: '1 1 120px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--success-color)' }}>&lt; 5 min</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Emergency Match</p>
          </div>
          <div className="text-center" style={{ flex: '1 1 120px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--info-color)' }}>0 PII</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>OTP-Gated Privacy</p>
          </div>
          <div className="text-center" style={{ flex: '1 1 120px' }}>
            <span style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--warning-color)' }}>24/7</span>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>Hospital Oversight</p>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="m-b-6">
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', textAlign: 'center', marginBottom: '2rem' }}>
          Platform Pillars
        </h2>
        <div className="grid grid-cols-3 gap-6">
          {/* Card 1 */}
          <div className="card flex flex-col gap-3">
            <div className="flex align-center justify-center" style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              color: 'var(--info-color)'
            }}>
              <Activity size={22} />
            </div>
            <h3 style={{ fontWeight: 700, color: '#fff' }}>Real-time coordination</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Notifications match blood requests by exact compatibility and city, giving instant alerts to nearby active donors.
            </p>
          </div>

          {/* Card 2 */}
          <div className="card flex flex-col gap-3">
            <div className="flex align-center justify-center" style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              color: 'var(--success-color)'
            }}>
              <ShieldCheck size={22} />
            </div>
            <h3 style={{ fontWeight: 700, color: '#fff' }}>OTP-Gated contact reveal</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Phone numbers are never visible publicly. Requesters and donors exchange details only after mutual consent via phone verification.
            </p>
          </div>

          {/* Card 3 */}
          <div className="card flex flex-col gap-3">
            <div className="flex align-center justify-center" style={{
              width: '44px',
              height: '44px',
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(245, 158, 11, 0.1)',
              color: 'var(--warning-color)'
            }}>
              <Award size={22} />
            </div>
            <h3 style={{ fontWeight: 700, color: '#fff' }}>Verified hospital pools</h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Organizations and hospitals update live blood units inventory and verify requests to prevent donation coordination abuse.
            </p>
          </div>
        </div>
      </div>

      {/* Footer info banner */}
      <div className="flex justify-center" style={{ marginTop: '4rem', padding: '1rem', borderTop: '1px solid var(--border-color)', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        <span>🩸 Blood Network Coordination MVP © 2026. Made with care.</span>
      </div>

      <style>{`
        .pulse-icon {
          animation: hero-pulse 2s infinite;
        }
        @keyframes hero-pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
          70% { box-shadow: 0 0 0 12px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
      `}</style>
    </div>
  );
}
