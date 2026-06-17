import React from 'react';
import { Link } from 'react-router-dom';
import BloodGroupBadge from '../shared/BloodGroupBadge';
import UrgencyChip from '../shared/UrgencyChip';
import { MapPin, Calendar, Activity, ArrowRight } from 'lucide-react';

export default function RequestCard({ request }) {
  const getComponentLabel = (comp) => {
    switch (comp) {
      case 'WHOLE_BLOOD': return 'Whole Blood';
      case 'PLATELETS': return 'Platelets';
      case 'PLASMA': return 'Plasma';
      case 'RBC': return 'Double RBC';
      default: return comp;
    }
  };

  const getRemainingTimeStr = (expiresAt) => {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    if (diffMs <= 0) return 'Expired';
    
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    
    if (diffHrs > 24) {
      return `${Math.floor(diffHrs / 24)}d ${diffHrs % 24}h remaining`;
    }
    return `${diffHrs}h ${diffMins}m remaining`;
  };

  return (
    <div className="card flex flex-col justify-between gap-4">
      <div>
        {/* Header row */}
        <div className="flex justify-between align-center m-b-4">
          <div className="flex align-center gap-2">
            <BloodGroupBadge group={request.bloodGroup} />
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              {getComponentLabel(request.component)}
            </span>
          </div>
          <UrgencyChip urgency={request.urgency} />
        </div>

        {/* Units required */}
        <div className="m-b-4">
          <p style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>
            {request.unitsNeeded} <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Units Needed</span>
          </p>
          <div style={{
            height: '6px',
            backgroundColor: 'var(--border-color)',
            borderRadius: '3px',
            marginTop: '0.5rem',
            overflow: 'hidden',
            position: 'relative'
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              backgroundColor: 'var(--success-color)',
              width: `${Math.min(100, ((request.unitsConfirmed || 0) / request.unitsNeeded) * 100)}%`,
              borderRadius: '3px',
              transition: 'width 0.4s ease'
            }} />
          </div>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem', textAlign: 'right' }}>
            {request.unitsConfirmed || 0} of {request.unitsNeeded} units confirmed
          </p>
        </div>

        {/* Hospital details */}
        <div className="flex flex-col gap-2" style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
          <div className="flex align-center gap-2">
            <MapPin size={16} color="var(--primary-color)" />
            <span style={{ color: '#fff', fontWeight: 500 }}>{request.hospitalName}</span>
          </div>
          <p style={{ paddingLeft: '1.5rem', fontSize: '0.8125rem' }}>
            {request.hospitalCity}, {request.hospitalState}
          </p>
        </div>
      </div>

      {/* Footer row */}
      <div className="flex justify-between align-center" style={{
        borderTop: '1px solid var(--border-color)',
        paddingTop: '1rem',
        marginTop: '0.5rem',
        fontSize: '0.8125rem'
      }}>
        <span className="flex align-center gap-1" style={{ color: 'var(--text-muted)' }}>
          <Calendar size={14} />
          <span>{getRemainingTimeStr(request.expiresAt)}</span>
        </span>

        <Link to={`/request/${request._id}`} className="btn btn-secondary btn-sm flex align-center gap-1" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8125rem' }}>
          <span>View Request</span>
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  );
}
