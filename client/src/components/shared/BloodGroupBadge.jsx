import React from 'react';

export default function BloodGroupBadge({ group }) {
  const getStyle = () => {
    switch (group) {
      case 'O-':
      case 'O+':
        return { backgroundColor: '#dc2626', color: '#ffffff', boxShadow: '0 2px 8px rgba(220, 38, 38, 0.4)' };
      case 'A-':
      case 'A+':
        return { backgroundColor: '#2563eb', color: '#ffffff', boxShadow: '0 2px 8px rgba(37, 99, 235, 0.4)' };
      case 'B-':
      case 'B+':
        return { backgroundColor: '#16a34a', color: '#ffffff', boxShadow: '0 2px 8px rgba(22, 163, 74, 0.4)' };
      case 'AB-':
      case 'AB+':
        return { backgroundColor: '#7c3aed', color: '#ffffff', boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4)' };
      default:
        return { backgroundColor: '#475569', color: '#ffffff' };
    }
  };

  return (
    <span className="blood-badge" style={getStyle()}>
      {group}
    </span>
  );
}
