import React from 'react';

export default function UrgencyChip({ urgency }) {
  const getBadgeClass = () => {
    switch (urgency) {
      case 'EMERGENCY':
        return 'badge badge-emergency';
      case 'HIGH':
        return 'badge badge-high';
      case 'NORMAL':
      default:
        return 'badge badge-normal';
    }
  };

  return (
    <span className={getBadgeClass()}>
      {urgency === 'EMERGENCY' && '⚠️ '}
      {urgency}
    </span>
  );
}
