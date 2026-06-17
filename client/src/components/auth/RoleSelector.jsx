import React from 'react';
import { User, ShieldAlert, Heart, Building2 } from 'lucide-react';

export default function RoleSelector({ selectedRole, onSelectRole }) {
  return (
    <div className="grid grid-cols-2 gap-6" style={{ margin: '1.5rem 0' }}>
      {/* Individual Card */}
      <div 
        onClick={() => onSelectRole('INDIVIDUAL')}
        className="card flex flex-col align-center text-center gap-3 cursor-pointer"
        style={{
          borderColor: selectedRole === 'INDIVIDUAL' ? 'var(--primary-color)' : 'var(--border-color)',
          backgroundColor: selectedRole === 'INDIVIDUAL' ? 'rgba(239, 68, 68, 0.05)' : 'var(--surface-color)',
          cursor: 'pointer'
        }}
      >
        <div className="flex align-center justify-center" style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: selectedRole === 'INDIVIDUAL' ? 'var(--primary-color)' : 'var(--border-color)',
          color: '#fff',
          marginBottom: '0.5rem'
        }}>
          <Heart size={28} />
        </div>
        <h3 style={{ fontWeight: 700, color: selectedRole === 'INDIVIDUAL' ? 'var(--primary-color)' : '#fff' }}>
          Individual
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          I want to donate blood, request blood in emergencies, and manage my profiles.
        </p>
      </div>

      {/* Org Card */}
      <div 
        onClick={() => onSelectRole('ORG')}
        className="card flex flex-col align-center text-center gap-3 cursor-pointer"
        style={{
          borderColor: selectedRole === 'ORG' ? 'var(--primary-color)' : 'var(--border-color)',
          backgroundColor: selectedRole === 'ORG' ? 'rgba(239, 68, 68, 0.05)' : 'var(--surface-color)',
          cursor: 'pointer'
        }}
      >
        <div className="flex align-center justify-center" style={{
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: selectedRole === 'ORG' ? 'var(--primary-color)' : 'var(--border-color)',
          color: '#fff',
          marginBottom: '0.5rem'
        }}>
          <Building2 size={28} />
        </div>
        <h3 style={{ fontWeight: 700, color: selectedRole === 'ORG' ? 'var(--primary-color)' : '#fff' }}>
          Hospital / Organization
        </h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          We are a verified medical hospital, blood bank, or NGO posting for patients and updating blood inventory.
        </p>
      </div>
    </div>
  );
}
