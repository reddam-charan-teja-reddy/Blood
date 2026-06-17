import React from 'react';

export default function TrustBadge({ verified, totalDonations }) {
  if (verified) {
    return (
      <span className="badge badge-success" style={{ gap: '0.25rem' }}>
        ✓ Verified Donor
      </span>
    );
  }

  if (totalDonations !== undefined && totalDonations >= 5) {
    return (
      <span className="badge badge-high" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
        ★ Frequent Donor
      </span>
    );
  }

  return (
    <span className="badge badge-normal">
      Self-Declared
    </span>
  );
}
