import React from 'react';

export default function LoadingSpinner({ fullPage = false }) {
  const spinner = (
    <div style={{
      display: 'inline-block',
      width: '2.5rem',
      height: '2.5rem',
      border: '4px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '50%',
      borderTopColor: '#ef4444',
      animation: 'spin 1s linear infinite'
    }}>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex justify-center align-center" style={{ minHeight: '60vh', width: '100%' }}>
        {spinner}
      </div>
    );
  }

  return (
    <div className="flex justify-center align-center p-4">
      {spinner}
    </div>
  );
}
