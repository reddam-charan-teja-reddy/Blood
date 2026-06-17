import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { api } from '../../lib/api';
import { AlertCircle, ChevronRight, X } from 'lucide-react';

export default function EmergencyBanner() {
  const { user, isAuthenticated } = useAuthStore();
  const [dismissed, setDismissed] = useState(false);

  // Check if user is individual and has donor profile details
  const isIndividual = isAuthenticated && user?.role === 'INDIVIDUAL';
  
  // We fetch own profile to check availability & blood group
  const { data: profile } = useQuery({
    queryKey: ['donorProfile'],
    queryFn: () => api('/donors/profile'),
    enabled: isIndividual,
  });

  const isAvailableDonor = profile && profile.available && profile.bloodGroup;

  // Query matching emergency requests in the donor's city
  const { data: requestData } = useQuery({
    queryKey: ['emergencyRequests', profile?.city, profile?.bloodGroup],
    queryFn: () => {
      const city = encodeURIComponent(profile.city);
      const bg = encodeURIComponent(profile.bloodGroup);
      return api(`/requests?urgency=EMERGENCY&city=${city}&bloodGroup=${bg}&compatibleOnly=true`);
    },
    enabled: !!isAvailableDonor,
    refetchInterval: 30000, // Poll every 30s to simulate real-time updates
  });

  const activeEmergencies = requestData?.requests || [];
  const hasEmergency = activeEmergencies.length > 0;

  if (dismissed || !hasEmergency) {
    return null;
  }

  // Display the first matching emergency request
  const emergency = activeEmergencies[0];

  return (
    <div className="emergency-banner flex align-center justify-between" style={{
      backgroundColor: '#7f1d1d',
      color: '#fef2f2',
      padding: '0.625rem 1.5rem',
      fontSize: '0.875rem',
      fontWeight: 600,
      borderBottom: '2px solid #ef4444',
      position: 'relative',
      zIndex: 101,
      animation: 'slideDown 0.3s ease-out'
    }}>
      <div className="container flex align-center justify-between flex-wrap gap-2">
        <div className="flex align-center gap-2 flex-wrap">
          <span className="flex align-center justify-center pulse-icon" style={{
            backgroundColor: '#ef4444',
            color: '#fff',
            borderRadius: '50%',
            width: '24px',
            height: '24px'
          }}>
            <AlertCircle size={14} />
          </span>
          <span>
            <strong style={{ color: '#fca5a5' }}>URGENT:</strong> {emergency.bloodGroup} needed at {emergency.hospitalName}, {emergency.hospitalCity}!
          </span>
        </div>
        
        <div className="flex align-center gap-4">
          <Link 
            to={`/request/${emergency._id}`} 
            className="flex align-center gap-1 hover-underline" 
            style={{ color: '#fecaca', fontSize: '0.8125rem' }}
          >
            <span>I can help</span>
            <ChevronRight size={14} />
          </Link>
          <button 
            onClick={() => setDismissed(true)} 
            style={{
              background: 'none',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              display: 'inline-flex',
              padding: '0.25rem'
            }}
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <style>{`
        .hover-underline:hover span {
          text-decoration: underline;
        }
        .pulse-icon {
          animation: banner-pulse 1.5s infinite;
        }
        @keyframes banner-pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
          70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
